import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createEntity } from "../src/commands/add";
import { performRemove } from "../src/commands/remove";
import { performRename } from "../src/commands/rename";
import {
	EntityAlreadyExists,
	EntityNotFound,
	HasDependents,
	TypeMismatch,
} from "../src/core/errors";
import {
	getNextId,
	initAradDir,
	readAllEntities,
	readEntityById,
} from "../src/io/files";

const TMP = join(import.meta.dir, "_tmp_remove_rename");

beforeEach(() => {
	mkdirSync(TMP, { recursive: true });
	initAradDir(TMP, "test-project");
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

// ─── Remove ───

describe("remove", () => {
	test("removes an entity with no dependents", () => {
		createEntity(TMP, { type: "decision", title: "Orphan decision" });
		expect(readEntityById(TMP, "D-001")).not.toBeNull();

		const result = performRemove(TMP, "D-001");
		expect(result.removed.id).toBe("D-001");
		expect(result.cleanedRefs).toEqual([]);
		expect(readEntityById(TMP, "D-001")).toBeNull();
	});

	test("removes file from disk", () => {
		createEntity(TMP, { type: "requirement", title: "Test req" });
		const folder = join(TMP, ".arad", "requirements");
		expect(readdirSync(folder).length).toBe(1);

		performRemove(TMP, "R-001");
		expect(readdirSync(folder).length).toBe(0);
	});

	test("throws EntityNotFound for non-existent ID", () => {
		expect(() => performRemove(TMP, "D-999")).toThrow(EntityNotFound);
	});

	test("throws HasDependents when entity has dependents and no flags", () => {
		createEntity(TMP, { type: "requirement", title: "Req" });
		createEntity(TMP, {
			type: "decision",
			title: "Decision",
			drivenBy: ["R-001"],
		});

		expect(() => performRemove(TMP, "R-001")).toThrow(HasDependents);
		// Entity should still exist
		expect(readEntityById(TMP, "R-001")).not.toBeNull();
	});

	test("--force removes entity even with dependents (leaves dangling refs)", () => {
		createEntity(TMP, { type: "requirement", title: "Req" });
		createEntity(TMP, {
			type: "decision",
			title: "Decision",
			drivenBy: ["R-001"],
		});

		const result = performRemove(TMP, "R-001", { force: true });
		expect(result.removed.id).toBe("R-001");
		expect(result.cleanedRefs).toEqual([]);

		// D-001 still has R-001 in driven_by (dangling)
		const d1 = readEntityById(TMP, "D-001")!;
		expect(d1.type).toBe("decision");
		if (d1.type === "decision") {
			expect(d1.driven_by).toContain("R-001");
		}
	});

	test("--clean removes entity and cleans references from dependents", () => {
		createEntity(TMP, { type: "requirement", title: "Req" });
		createEntity(TMP, {
			type: "decision",
			title: "Decision",
			drivenBy: ["R-001"],
		});

		const result = performRemove(TMP, "R-001", { clean: true });
		expect(result.removed.id).toBe("R-001");
		expect(result.cleanedRefs).toEqual(["D-001"]);

		// D-001 no longer has R-001 in driven_by
		const d1 = readEntityById(TMP, "D-001")!;
		expect(d1.type).toBe("decision");
		if (d1.type === "decision") {
			expect(d1.driven_by).not.toContain("R-001");
		}
	});

	test("--clean handles multiple dependents", () => {
		createEntity(TMP, { type: "assumption", title: "Assumption" });
		createEntity(TMP, {
			type: "decision",
			title: "Decision 1",
			drivenBy: ["A-001"],
		});
		createEntity(TMP, {
			type: "decision",
			title: "Decision 2",
			drivenBy: ["A-001"],
		});

		const result = performRemove(TMP, "A-001", { clean: true });
		expect(result.cleanedRefs.sort()).toEqual(["D-001", "D-002"]);

		const d1 = readEntityById(TMP, "D-001")!;
		if (d1.type === "decision") {
			expect(d1.driven_by).not.toContain("A-001");
		}
		const d2 = readEntityById(TMP, "D-002")!;
		if (d2.type === "decision") {
			expect(d2.driven_by).not.toContain("A-001");
		}
	});

	test("--clean removes array refs and scalar refs", () => {
		// Create D-001, then D-002 that supersedes D-001
		createEntity(TMP, { type: "decision", title: "Old decision" });
		createEntity(TMP, {
			type: "decision",
			title: "New decision",
			supersedes: "D-001",
		});

		// D-002 has supersedes: D-001 (scalar ref)
		const d2 = readEntityById(TMP, "D-002")!;
		if (d2.type === "decision") {
			expect(d2.supersedes).toBe("D-001");
		}

		// Remove D-001 with --clean
		const result = performRemove(TMP, "D-001", { clean: true });
		expect(result.cleanedRefs).toEqual(["D-002"]);

		// D-002's supersedes should be cleaned
		const d2After = readEntityById(TMP, "D-002")!;
		if (d2After.type === "decision") {
			expect(d2After.supersedes).toBeUndefined();
		}
	});
});

// ─── Rename ───

describe("rename", () => {
	test("renames entity and updates file on disk", () => {
		createEntity(TMP, { type: "decision", title: "Old name" });
		expect(readEntityById(TMP, "D-001")).not.toBeNull();

		const result = performRename(TMP, "D-001", "D-100");
		expect(result.oldId).toBe("D-001");
		expect(result.newId).toBe("D-100");
		expect(result.entity.id).toBe("D-100");

		// Old file gone, new file exists
		expect(readEntityById(TMP, "D-001")).toBeNull();
		expect(readEntityById(TMP, "D-100")).not.toBeNull();
	});

	test("renames entity with new title", () => {
		createEntity(TMP, { type: "decision", title: "Old title" });

		const result = performRename(TMP, "D-001", "D-002", {
			title: "New title",
		});
		expect(result.entity.title).toBe("New title");

		const fromDisk = readEntityById(TMP, "D-002")!;
		expect(fromDisk.title).toBe("New title");
	});

	test("throws EntityNotFound for non-existent ID", () => {
		expect(() => performRename(TMP, "D-999", "D-998")).toThrow(
			EntityNotFound,
		);
	});

	test("throws TypeMismatch when new ID has wrong prefix", () => {
		createEntity(TMP, { type: "decision", title: "Decision" });

		expect(() => performRename(TMP, "D-001", "R-001")).toThrow(
			TypeMismatch,
		);
	});

	test("throws EntityAlreadyExists when new ID already taken", () => {
		createEntity(TMP, { type: "decision", title: "Decision 1" });
		createEntity(TMP, { type: "decision", title: "Decision 2" });

		expect(() => performRename(TMP, "D-001", "D-002")).toThrow(
			EntityAlreadyExists,
		);
	});

	test("propagates driven_by references", () => {
		createEntity(TMP, { type: "requirement", title: "Req" });
		createEntity(TMP, {
			type: "decision",
			title: "Decision",
			drivenBy: ["R-001"],
		});

		// Rename R-001 → R-050
		const result = performRename(TMP, "R-001", "R-050");
		expect(result.updatedRefs).toBe(1);

		// D-001's driven_by should now contain R-050 instead of R-001
		const d1 = readEntityById(TMP, "D-001")!;
		if (d1.type === "decision") {
			expect(d1.driven_by).toContain("R-050");
			expect(d1.driven_by).not.toContain("R-001");
		}
	});

	test("propagates enables references", () => {
		createEntity(TMP, { type: "decision", title: "Decision 1" });
		createEntity(TMP, {
			type: "decision",
			title: "Decision 2",
			enables: ["D-001"],
		});

		performRename(TMP, "D-001", "D-050");

		const d2 = readEntityById(TMP, "D-002")!;
		if (d2.type === "decision") {
			expect(d2.enables).toContain("D-050");
			expect(d2.enables).not.toContain("D-001");
		}
	});

	test("propagates derived_from references", () => {
		createEntity(TMP, { type: "requirement", title: "Parent req" });
		createEntity(TMP, {
			type: "requirement",
			title: "Child req",
			derivedFrom: ["R-001"],
		});

		performRename(TMP, "R-001", "R-050");

		const r2 = readEntityById(TMP, "R-002")!;
		if (r2.type === "requirement") {
			expect(r2.derived_from).toContain("R-050");
			expect(r2.derived_from).not.toContain("R-001");
		}
	});

	test("propagates conflicts_with references", () => {
		createEntity(TMP, { type: "requirement", title: "Req A" });
		createEntity(TMP, {
			type: "requirement",
			title: "Req B",
			conflictsWith: ["R-001"],
		});

		performRename(TMP, "R-001", "R-050");

		const r2 = readEntityById(TMP, "R-002")!;
		if (r2.type === "requirement") {
			expect(r2.conflicts_with).toContain("R-050");
			expect(r2.conflicts_with).not.toContain("R-001");
		}
	});

	test("propagates supersedes (scalar) reference", () => {
		createEntity(TMP, { type: "decision", title: "Old decision" });
		createEntity(TMP, {
			type: "decision",
			title: "New decision",
			supersedes: "D-001",
		});

		performRename(TMP, "D-001", "D-050");

		const d2 = readEntityById(TMP, "D-002")!;
		if (d2.type === "decision") {
			expect(d2.supersedes).toBe("D-050");
		}
	});

	test("propagates inspired_by references", () => {
		createEntity(TMP, { type: "decision", title: "Decision" });
		createEntity(TMP, {
			type: "idea",
			title: "Idea",
			inspiredBy: ["D-001"],
		});

		performRename(TMP, "D-001", "D-050");

		const i1 = readEntityById(TMP, "I-001")!;
		if (i1.type === "idea") {
			expect(i1.inspired_by).toContain("D-050");
			expect(i1.inspired_by).not.toContain("D-001");
		}
	});

	test("propagates mitigated_by references", () => {
		createEntity(TMP, { type: "decision", title: "Decision" });
		createEntity(TMP, {
			type: "risk",
			title: "Risk",
		});
		// Manually link K-001 mitigated_by D-001
		const k1 = readEntityById(TMP, "K-001")!;
		if (k1.type === "risk") {
			k1.mitigated_by = ["D-001"];
			const { updateEntity } = require("../src/io/files");
			updateEntity(TMP, k1);
		}

		performRename(TMP, "D-001", "D-050");

		const k1After = readEntityById(TMP, "K-001")!;
		if (k1After.type === "risk") {
			expect(k1After.mitigated_by).toContain("D-050");
			expect(k1After.mitigated_by).not.toContain("D-001");
		}
	});

	test("does not modify entities without references to old ID", () => {
		createEntity(TMP, { type: "requirement", title: "Unrelated req" });
		createEntity(TMP, { type: "decision", title: "Decision" });
		createEntity(TMP, { type: "idea", title: "Idea" });

		const result = performRename(TMP, "D-001", "D-050");
		expect(result.updatedRefs).toBe(0);
	});

	test("renamed entity survives round-trip", () => {
		createEntity(TMP, { type: "decision", title: "Original" });
		performRename(TMP, "D-001", "D-050");

		const entity = readEntityById(TMP, "D-050")!;
		expect(entity.id).toBe("D-050");
		expect(entity.title).toBe("Original");
		expect(entity.type).toBe("decision");
	});
});
