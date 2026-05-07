import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { performInvalidate } from "../src/commands/validate";
import { performLink } from "../src/commands/link";
import { createEntity } from "../src/commands/add";
import {
	initArcDir,
	readAllEntities,
	readEntityById,
} from "../src/io/files";

const TMP = join(import.meta.dir, "_tmp_invalidate_derive");

beforeEach(() => {
	mkdirSync(TMP, { recursive: true });
	initArcDir(TMP, "test-project");
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

describe("invalidate --derive-requirement", () => {
	test("creates a derived requirement and relinks decisions", () => {
		// Create an assumption and a decision driven by it
		createEntity(TMP, { type: "assumption", title: "No concurrent writes" });
		createEntity(TMP, { type: "decision", title: "Skip locking" });

		// Link D-001 → A-001 (driven_by)
		performLink(TMP, "D-001", "A-001");

		// Verify setup: D-001.driven_by should contain A-001
		const d1Before = readEntityById(TMP, "D-001")!;
		expect(d1Before.driven_by).toContain("A-001");

		// Invalidate with --derive-requirement
		const result = performInvalidate(TMP, "A-001", {
			deriveRequirement: "Must handle concurrent writes safely",
		});

		// Assumption should be invalidated
		expect(result.entity.id).toBe("A-001");
		expect(result.entity.status).toBe("invalidated");

		// New requirement should be created
		expect(result.derivedRequirement).toBeDefined();
		expect(result.derivedRequirement!.id).toBe("R-001");
		expect(result.derivedRequirement!.title).toBe(
			"Must handle concurrent writes safely",
		);
		expect(result.derivedRequirement!.status).toBe("accepted");

		// D-001 should now be driven_by R-001, not A-001
		const d1After = readEntityById(TMP, "D-001")!;
		expect(d1After.driven_by).toContain("R-001");
		expect(d1After.driven_by).not.toContain("A-001");

		// Relinked count should be 1
		expect(result.relinkedDecisions).toBe(1);
	});

	test("invalidates without deriving when no flag provided", () => {
		createEntity(TMP, { type: "assumption", title: "Simple assumption" });

		const result = performInvalidate(TMP, "A-001");

		expect(result.entity.status).toBe("invalidated");
		expect(result.derivedRequirement).toBeUndefined();
		expect(result.relinkedDecisions).toBeUndefined();
	});

	test("derives requirement even when no decisions depend on the assumption", () => {
		createEntity(TMP, { type: "assumption", title: "Unused assumption" });

		const result = performInvalidate(TMP, "A-001", {
			deriveRequirement: "Opposite requirement",
		});

		expect(result.derivedRequirement).toBeDefined();
		expect(result.derivedRequirement!.id).toBe("R-001");
		expect(result.relinkedDecisions).toBe(0);
	});

	test("relinks multiple decisions", () => {
		createEntity(TMP, { type: "assumption", title: "Single-threaded only" });
		createEntity(TMP, { type: "decision", title: "Decision A" });
		createEntity(TMP, { type: "decision", title: "Decision B" });

		performLink(TMP, "D-001", "A-001");
		performLink(TMP, "D-002", "A-001");

		const result = performInvalidate(TMP, "A-001", {
			deriveRequirement: "Must support multithreading",
		});

		expect(result.relinkedDecisions).toBe(2);

		// Both decisions should now reference R-001
		const d1 = readEntityById(TMP, "D-001")!;
		const d2 = readEntityById(TMP, "D-002")!;
		expect(d1.driven_by).toContain("R-001");
		expect(d2.driven_by).toContain("R-001");
		expect(d1.driven_by).not.toContain("A-001");
		expect(d2.driven_by).not.toContain("A-001");
	});

	test("derived requirement body mentions source assumption", () => {
		createEntity(TMP, { type: "assumption", title: "Some assumption" });

		const result = performInvalidate(TMP, "A-001", {
			deriveRequirement: "Opposite requirement",
		});

		expect(result.derivedRequirement!.body).toContain("A-001");
		expect(result.derivedRequirement!.body).toContain("Some assumption");
	});

	test("derived requirement inherits tags from assumption", () => {
		createEntity(TMP, {
			type: "assumption",
			title: "Tagged assumption",
			tags: ["concurrency", "safety"],
		});

		const result = performInvalidate(TMP, "A-001", {
			deriveRequirement: "Must be safe",
		});

		expect(result.derivedRequirement!.tags).toEqual(["concurrency", "safety"]);
	});
});
