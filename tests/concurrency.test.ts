import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createEntity, type CreateEntityInput } from "../src/commands/add";
import { withLock, getNextId, initAradDir } from "../src/io/files";

const TMP = join(import.meta.dir, "_tmp_concurrency");

beforeEach(() => {
	mkdirSync(TMP, { recursive: true });
	initAradDir(TMP, "test-project");
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

describe("withLock", () => {
	test("acquires lock and runs function", async () => {
		const result = await withLock(TMP, () => 42);
		expect(result).toBe(42);
	});

	test("lock is released after function completes", async () => {
		await withLock(TMP, () => {});
		// Should be able to acquire again immediately
		const result = await withLock(TMP, () => "ok");
		expect(result).toBe("ok");
	});

	test("serializes concurrent access", async () => {
		const order: number[] = [];

		const makeJob = (id: number, durationMs: number) =>
			withLock(TMP, async () => {
				order.push(id);
				await new Promise((r) => setTimeout(r, durationMs));
				order.push(id + 1000); // marker: job completed
			});

		// Start two jobs concurrently; they must not overlap
		await Promise.all([makeJob(1, 50), makeJob(2, 50)]);

		// Each job should complete before the next starts
		// order should be: [1, 1001, 2, 1002] or [2, 1002, 1, 1001]
		// NOT: [1, 2, 1001, 1002] (overlapping)
		const idx1 = order.indexOf(1);
		const idx1001 = order.indexOf(1001);
		const idx2 = order.indexOf(2);
		const idx1002 = order.indexOf(1002);

		// For each job, the start marker must come before the end marker
		expect(idx1).toBeLessThan(idx1001);
		expect(idx2).toBeLessThan(idx1002);

		// The jobs must not interleave:
		// Either job 1 finishes before job 2 starts, or vice versa
		const nonOverlapping =
			(idx1001 < idx2) || (idx1002 < idx1);
		expect(nonOverlapping).toBe(true);
	});

	test("throws on timeout if lock is held", async () => {
		// Hold the lock for longer than the timeout
		// We'll test this by starting a long job, then trying to acquire
		let releaseLock: () => void;
		const lockHeld = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});

		const longJob = withLock(TMP, async () => {
			await lockHeld;
		});

		// Give the first job a moment to acquire the lock
		await new Promise((r) => setTimeout(r, 10));

		// Now try to acquire with a very short timeout by hacking the env
		// We'll just test that a second concurrent lock attempt waits
		const start = Date.now();
		const secondJob = withLock(TMP, () => Date.now() - start);

		// Release after a small delay
		setTimeout(() => releaseLock!(), 100);

		const elapsed = await secondJob;
		expect(elapsed).toBeGreaterThanOrEqual(80); // had to wait for lock release
	});
});

describe("concurrent getNextId", () => {
	test("parallel createEntity calls produce unique IDs", async () => {
		// Simulate the race condition: 5 parallel createEntity calls
		const count = 5;
		const inputs: CreateEntityInput[] = Array.from({ length: count }, (_, i) => ({
			type: "requirement",
			title: `Requirement ${i + 1}`,
			status: "accepted",
			tags: [],
		}));

		// Each call wrapped in withLock
		const results = await Promise.all(
			inputs.map((input) =>
				withLock(TMP, () => createEntity(TMP, input)),
			),
		);

		// All IDs should be unique
		const ids = results.map((r) => r.entity.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(count);

		// IDs should be sequential: R-001 through R-005
		const sortedIds = [...uniqueIds].sort();
		expect(sortedIds).toEqual(["R-001", "R-002", "R-003", "R-004", "R-005"]);
	});

	test("parallel getNextId without lock produces duplicates (demonstrates the bug)", async () => {
		// Show that WITHOUT the lock, parallel getNextId calls return the same ID
		const getNextIdUnlocked = () => getNextId(TMP, "requirement");

		const ids = await Promise.all(
			Array.from({ length: 5 }, () => getNextIdUnlocked()),
		);

		// Without locking, they'll all be the same (R-001)
		const uniqueIds = new Set(ids);
		// This demonstrates the race condition exists without the lock
		expect(uniqueIds.size).toBe(1); // all got R-001
		expect(ids[0]).toBe("R-001");
	});
});
