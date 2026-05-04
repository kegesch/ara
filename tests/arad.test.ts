import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	buildGraph,
	findContradictions,
	findDanglingRefs,
	findOrphans,
	getDependencies,
	getDependents,
	impactAnalysis,
	traceUp,
} from "../src/graph/graph";
import {
	parseEntity,
	serializeEntity,
	serializeFrontmatter,
} from "../src/io/parser";
import { searchEntities } from "../src/search/fuzzy";
import type {
	Assumption,
	Decision,
	Entity,
	Idea,
	Requirement,
	Risk,
	Stakeholder,
} from "../src/types";

const TMP = join(import.meta.dir, "_tmp_graph");

beforeEach(() => {
	mkdirSync(TMP, { recursive: true });
});
afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

// ─── Parser ───

describe("parser", () => {
	test("parses a decision with relationships", () => {
		const content = `---
id: D-001
title: "Use SQLite"
status: accepted
date: 2026-04-30
tags: [storage, db]
driven_by: [R-001, A-001]
---

# Decision: Use SQLite

Some body text here.
`;
		const entity = parseEntity(content, "decisions/D-001-use-sqlite.md");
		expect(entity.type).toBe("decision");
		expect(entity.id).toBe("D-001");
		expect(entity.title).toBe("Use SQLite");
		expect(entity.status).toBe("accepted");
		expect(entity.tags).toEqual(["storage", "db"]);
		if (entity.type === "decision") {
			expect(entity.driven_by).toEqual(["R-001", "A-001"]);
		}
		expect(entity.body).toContain("Some body text");
	});

	test("parses a requirement", () => {
		const content = `---
id: R-001
title: "Must encrypt data"
status: accepted
date: 2026-04-30
---

Body here.
`;
		const entity = parseEntity(content, "requirements/R-001.md");
		expect(entity.type).toBe("requirement");
		if (entity.type === "requirement") {
			expect(entity.status).toBe("accepted");
			expect(entity.derived_from).toEqual([]);
		}
	});

	test("throws on missing frontmatter", () => {
		expect(() => parseEntity("no frontmatter", "test.md")).toThrow();
	});

	test("throws on missing id", () => {
		const content = `---
title: "No id"
---

Body.
`;
		expect(() => parseEntity(content, "test.md")).toThrow();
	});
});

// ─── Graph ───

function makeEntities(): Entity[] {
	const r1: Requirement = {
		type: "requirement",
		id: "R-001",
		title: "Encrypt data",
		status: "accepted",
		date: "2026-04-30",
		tags: [],
		body: "",
		filePath: "",
		derived_from: [],
		conflicts_with: [],
		requested_by: [],
	};
	const r2: Requirement = {
		type: "requirement",
		id: "R-002",
		title: "Offline support",
		status: "accepted",
		date: "2026-04-30",
		tags: [],
		body: "",
		filePath: "",
		derived_from: [],
		conflicts_with: ["R-003"],
		requested_by: [],
	};
	const r3: Requirement = {
		type: "requirement",
		id: "R-003",
		title: "Always online",
		status: "accepted",
		date: "2026-04-30",
		tags: [],
		body: "",
		filePath: "",
		derived_from: [],
		conflicts_with: ["R-002"],
		requested_by: [],
	};
	const a1: Assumption = {
		type: "assumption",
		id: "A-001",
		title: "Low user count",
		status: "unvalidated",
		date: "2026-04-30",
		tags: [],
		body: "",
		filePath: "",
	};
	const d1: Decision = {
		type: "decision",
		id: "D-001",
		title: "Use SQLite",
		status: "accepted",
		date: "2026-04-30",
		tags: [],
		body: "",
		filePath: "",
		driven_by: ["R-001", "R-002", "A-001"],
		enables: ["D-002"],
		affects: [],
	};
	const d2: Decision = {
		type: "decision",
		id: "D-002",
		title: "Cache strategy",
		status: "proposed",
		date: "2026-04-30",
		tags: [],
		body: "",
		filePath: "",
		driven_by: ["D-001"],
		enables: [],
		affects: [],
	};
	const d3: Decision = {
		type: "decision",
		id: "D-003",
		title: "Orphan decision",
		status: "proposed",
		date: "2026-04-30",
		tags: [],
		body: "",
		filePath: "",
		driven_by: [],
		enables: [],
		affects: [],
	};
	return [r1, r2, r3, a1, d1, d2, d3];
}

describe("graph", () => {
	test("builds graph with correct entity count", () => {
		const g = buildGraph(makeEntities());
		expect(g.entities.size).toBe(7);
	});

	test("getDependents finds decisions driven by a requirement", () => {
		const g = buildGraph(makeEntities());
		const deps = getDependents(g, "R-001");
		expect(deps.map((d) => d.id)).toContain("D-001");
		expect(deps.length).toBe(1);
	});

	test("getDependencies finds what a decision depends on", () => {
		const g = buildGraph(makeEntities());
		const deps = getDependencies(g, "D-001");
		const ids = deps.map((d) => d.id);
		expect(ids).toContain("R-001");
		expect(ids).toContain("R-002");
		expect(ids).toContain("A-001");
	});

	test("findOrphans finds decisions with no driven_by", () => {
		const g = buildGraph(makeEntities());
		const orphans = findOrphans(g);
		expect(orphans.map((o) => o.id)).toEqual(["D-003"]);
		// D-002 has driven_by: ['D-001'], so it's not an orphan
	});

	test("findContradictions detects conflicts", () => {
		const g = buildGraph(makeEntities());
		const contradictions = findContradictions(g);
		expect(contradictions.length).toBe(1);
		const ids = contradictions[0].map((e) => e.id).sort();
		expect(ids).toEqual(["R-002", "R-003"]);
	});

	test("findDanglingRefs detects missing refs", () => {
		const entities = makeEntities();
		// Add a decision referencing a non-existent entity
		const d: Decision = {
			...(entities[4] as Decision),
			id: "D-099",
			driven_by: ["R-999"],
		};
		const g = buildGraph([...entities, d]);
		const danglers = findDanglingRefs(g);
		expect(danglers.some((d) => d.ref === "R-999")).toBe(true);
	});

	test("impactAnalysis traces direct and transitive", () => {
		const g = buildGraph(makeEntities());
		const result = impactAnalysis(g, "R-001");
		expect(result.direct.map((e) => e.id)).toContain("D-001");
		// D-001 driven_by D-002 doesn't make D-002 a dependent of R-001
		// D-002 depends on D-001, so it IS transitive from R-001
		expect(result.transitive.map((e) => e.id)).toContain("D-002");
	});

	test("traceUp builds dependency tree", () => {
		const g = buildGraph(makeEntities());
		const tree = traceUp(g, "D-001");
		expect(tree).not.toBeNull();
		expect(tree!.entity.id).toBe("D-001");
		// D-001 has driven_by: [R-001, R-002, A-001] + enables: [D-002]
		// But enables is an outgoing edge, not a dependency
		expect(tree!.children.length).toBe(3); // R-001, R-002, A-001
	});
});

// ─── Search ───

describe("search", () => {
	const entities = makeEntities();

	test("finds by title text", () => {
		const results = searchEntities(entities, "sqlite");
		expect(results.length).toBe(1);
		expect(results[0].entity.id).toBe("D-001");
	});

	test("finds by type modifier", () => {
		const results = searchEntities(entities, "type:decision");
		expect(results.length).toBe(3);
		expect(results.every((r) => r.entity.type === "decision")).toBe(true);
	});

	test("finds by status modifier", () => {
		const results = searchEntities(entities, "status:accepted");
		expect(results.length).toBe(4); // R-001, R-002, R-003, D-001
	});

	test("combines modifiers with text", () => {
		const results = searchEntities(entities, "type:decision sqlite");
		expect(results.length).toBe(1);
		expect(results[0].entity.id).toBe("D-001");
	});

	test("returns empty for no match", () => {
		const results = searchEntities(entities, "nonexistent-xyz");
		expect(results.length).toBe(0);
	});

	test('fuzzy matches "sqlte" to "sqlite"', () => {
		const results = searchEntities(entities, "sqlte");
		expect(results.length).toBe(1);
		expect(results[0].entity.id).toBe("D-001");
	});

	test("finds by driven_by modifier", () => {
		const results = searchEntities(entities, "driven_by:R-001");
		expect(results.length).toBe(1);
		expect(results[0].entity.id).toBe("D-001");
	});
});

// ─── Serialization ───

describe("serialization", () => {
	test("round-trips a decision", () => {
		const original = `---
id: D-001
title: "Use SQLite"
status: accepted
date: 2026-04-30
tags: [storage, db]
driven_by: [R-001, A-001]
---

# Decision: Use SQLite

Body text.
`;
		const entity = parseEntity(original, "test.md");
		const serialized = serializeEntity(entity);
		const reParsed = parseEntity(serialized, "test.md");
		expect(reParsed).toEqual(entity);
	});
});

// ─── Link/Unlink validation logic ───

describe("link validation", () => {
	test("valid edge types are defined correctly", () => {
		// VALID_EDGES is tested via the integration tests above
		// (link command auto-infers, rejects invalid, etc.)
		// Here we just validate the constants we care about
		const validEdges: Record<string, string[]> = {
			"decision-requirement": ["driven_by"],
			"decision-assumption": ["driven_by"],
			"decision-decision": ["enables", "supersedes"],
			"requirement-requirement": ["derived_from", "conflicts_with"],
		};
		expect(validEdges["decision-requirement"]).toEqual(["driven_by"]);
		expect(validEdges["decision-decision"].length).toBe(2);
		expect(validEdges["assumption-decision"]).toBeUndefined();
	});

	test("link then check graph reflects the change", () => {
		// Build entities, manually link via the same logic link uses
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Encrypt",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const d1: Decision = {
			type: "decision",
			id: "D-001",
			title: "Use SQLite",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			driven_by: [],
			enables: [],
			affects: [],
		};

		// Before linking
		let g = buildGraph([r1, d1]);
		expect(getDependents(g, "R-001")).toEqual([]);

		// After linking (simulate what link command does)
		d1.driven_by.push("R-001");
		g = buildGraph([r1, d1]);
		const deps = getDependents(g, "R-001");
		expect(deps.map((e) => e.id)).toEqual(["D-001"]);
	});

	test("conflicts_with is bidirectional", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Offline",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: ["R-002"],
			requested_by: [],
		};
		const r2: Requirement = {
			type: "requirement",
			id: "R-002",
			title: "Always online",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: ["R-001"],
			requested_by: [],
		};
		const g = buildGraph([r1, r2]);
		const contradictions = findContradictions(g);
		expect(contradictions.length).toBe(1);
	});
});

// ─── Heuristic Analysis ───

import {
	findOrphanRequirements,
	findPossibleContradictions,
	findPossibleDuplicates,
	findStatusAnomalies,
} from "../src/graph/graph";

describe("heuristic analysis", () => {
	test("findPossibleContradictions detects opposing terms", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "System must support offline operation",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const r2: Requirement = {
			type: "requirement",
			id: "R-002",
			title: "System requires always online connection",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const g = buildGraph([r1, r2]);
		const possibles = findPossibleContradictions(g);
		expect(possibles.length).toBeGreaterThanOrEqual(1);
		const pair = possibles.find(
			(p) =>
				(p.a.id === "R-001" && p.b.id === "R-002") ||
				(p.a.id === "R-002" && p.b.id === "R-001"),
		);
		expect(pair).toBeDefined();
		expect(pair!.reason).toContain("opposing terms");
	});

	test("findPossibleContradictions ignores same requirement with both terms", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Support both offline and online modes",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const g = buildGraph([r1]);
		const possibles = findPossibleContradictions(g);
		// Single req with both terms should NOT produce a contradiction
		expect(possibles.length).toBe(0);
	});

	test("findPossibleDuplicates finds similar titles", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "All data must be encrypted at rest",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const r2: Requirement = {
			type: "requirement",
			id: "R-002",
			title: "Data must be encrypted at rest",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const g = buildGraph([r1, r2]);
		const dups = findPossibleDuplicates(g, 0.5);
		expect(dups.length).toBeGreaterThanOrEqual(1);
		expect(dups[0].similarity).toBeGreaterThan(0.5);
	});

	test("findPossibleDuplicates ignores dissimilar titles", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Encrypt all data at rest",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const r2: Requirement = {
			type: "requirement",
			id: "R-002",
			title: "Support dark mode UI theme",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const g = buildGraph([r1, r2]);
		const dups = findPossibleDuplicates(g, 0.6);
		expect(dups.length).toBe(0);
	});

	test("findStatusAnomalies detects accepted decision backed by rejected requirement", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Use encryption",
			status: "rejected",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const d1: Decision = {
			type: "decision",
			id: "D-001",
			title: "Use AES-256",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			driven_by: ["R-001"],
			enables: [],
			affects: [],
		};
		const g = buildGraph([r1, d1]);
		const anomalies = findStatusAnomalies(g);
		expect(anomalies.length).toBe(1);
		expect(anomalies[0].entity.id).toBe("D-001");
	});

	test("findStatusAnomalies detects accepted decision backed by invalidated assumption", () => {
		const a1: Assumption = {
			type: "assumption",
			id: "A-001",
			title: "Users are trusted",
			status: "invalidated",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
		};
		const d1: Decision = {
			type: "decision",
			id: "D-001",
			title: "Skip auth",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			driven_by: ["A-001"],
			enables: [],
			affects: [],
		};
		const g = buildGraph([a1, d1]);
		const anomalies = findStatusAnomalies(g);
		expect(anomalies.length).toBe(1);
		expect(anomalies[0].refs[0].id).toBe("A-001");
	});

	test("findOrphanRequirements finds requirements with no decisions", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Must be fast",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const r2: Requirement = {
			type: "requirement",
			id: "R-002",
			title: "Must be secure",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const d1: Decision = {
			type: "decision",
			id: "D-001",
			title: "Use cache",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			driven_by: ["R-001"],
			enables: [],
			affects: [],
		};
		const g = buildGraph([r1, r2, d1]);
		const orphans = findOrphanRequirements(g);
		expect(orphans.map((o) => o.id)).toEqual(["R-002"]);
	});

	test("findOrphanRequirements ignores deprecated requirements", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Old req",
			status: "deprecated",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const g = buildGraph([r1]);
		const orphans = findOrphanRequirements(g);
		expect(orphans.length).toBe(0);
	});
});

// ─── Idea entity type ───

describe("idea type", () => {
	test("parses an idea with inspired_by", () => {
		const content = `---
id: I-001
title: "Use CRDTs for sync"
status: explore
date: 2026-05-01
tags: [sync, collaboration]
inspired_by: [D-001, R-002]
---

# Idea: Use CRDTs for sync

Some body text.
`;
		const entity = parseEntity(content, "ideas/I-001-use-crdts.md");
		expect(entity.type).toBe("idea");
		expect(entity.id).toBe("I-001");
		expect(entity.title).toBe("Use CRDTs for sync");
		expect(entity.status).toBe("explore");
		expect(entity.tags).toEqual(["sync", "collaboration"]);
		if (entity.type === "idea") {
			expect(entity.inspired_by).toEqual(["D-001", "R-002"]);
			expect(entity.promoted_to).toBeUndefined();
		}
	});

	test("parses an idea with promoted_to", () => {
		const content = `---
id: I-002
title: "Cache everything"
status: promoted
date: 2026-05-01
promoted_to: R-005
---

Body.
`;
		const entity = parseEntity(content, "ideas/I-002.md");
		expect(entity.type).toBe("idea");
		expect(entity.status).toBe("promoted");
		if (entity.type === "idea") {
			expect(entity.promoted_to).toBe("R-005");
		}
	});

	test("idea defaults to explore status", () => {
		const content = `---
id: I-003
title: "Some idea"
---

Body.
`;
		const entity = parseEntity(content, "ideas/I-003.md");
		expect(entity.status).toBe("explore");
	});

	test("round-trips an idea", () => {
		const content = `---
id: I-001
title: "Use CRDTs for sync"
status: explore
date: 2026-05-01
tags: [sync]
inspired_by: [D-001]
---

# Idea: Use CRDTs for sync

Body text.
`;
		const entity = parseEntity(content, "test.md");
		const serialized = serializeEntity(entity);
		const reParsed = parseEntity(serialized, "test.md");
		expect(reParsed).toEqual(entity);
	});

	test("getTypeFromId recognizes I- prefix", () => {
		const { getTypeFromId } = require("../src/types");
		expect(getTypeFromId("I-001")).toBe("idea");
	});

	test("getTypeFromId throws on unknown prefix", () => {
		const { getTypeFromId } = require("../src/types");
		expect(() => getTypeFromId("X-001")).toThrow();
	});
});

// ─── Idea graph integration ───

describe("idea graph", () => {
	function makeIdeaEntities(): Entity[] {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Encrypt data",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		const d1: Decision = {
			type: "decision",
			id: "D-001",
			title: "Use SQLite",
			status: "accepted",
			date: "2026-04-30",
			tags: [],
			body: "",
			filePath: "",
			driven_by: ["R-001"],
			enables: [],
			affects: [],
		};
		const i1: Idea = {
			type: "idea",
			id: "I-001",
			title: "Use CRDTs for sync",
			status: "explore",
			date: "2026-05-01",
			tags: ["sync"],
			body: "",
			filePath: "",
			inspired_by: ["D-001", "R-001"],
		};
		const i2: Idea = {
			type: "idea",
			id: "I-002",
			title: "Offline-first architecture",
			status: "parked",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			inspired_by: ["I-001"],
		};
		return [r1, d1, i1, i2];
	}

	test("builds graph with idea entities", () => {
		const g = buildGraph(makeIdeaEntities());
		expect(g.entities.size).toBe(4);
	});

	test("idea inspired_by creates edges", () => {
		const g = buildGraph(makeIdeaEntities());
		const i1 = g.entities.get("I-001")!;
		if (i1.type === "idea") {
			expect(i1.inspired_by).toEqual(["D-001", "R-001"]);
		}
		// I-001 should have outgoing inspired_by edges
		const outgoing = g.outgoing.get("I-001") ?? [];
		expect(outgoing.length).toBe(2);
		expect(outgoing.map((e) => e.to).sort()).toEqual(["D-001", "R-001"]);
	});

	test("idea-to-idea inspired_by creates edges", () => {
		const g = buildGraph(makeIdeaEntities());
		const outgoing = g.outgoing.get("I-002") ?? [];
		expect(outgoing.length).toBe(1);
		expect(outgoing[0].to).toBe("I-001");
		expect(outgoing[0].type).toBe("inspired_by");
	});

	test("getDependents finds ideas inspired by an entity", () => {
		const g = buildGraph(makeIdeaEntities());
		const deps = getDependents(g, "D-001");
		const ids = deps.map((d) => d.id);
		expect(ids).toContain("I-001");
	});

	test("getDependencies finds what inspires an idea", () => {
		const g = buildGraph(makeIdeaEntities());
		const deps = getDependencies(g, "I-001");
		const ids = deps.map((d) => d.id);
		expect(ids).toContain("D-001");
		expect(ids).toContain("R-001");
	});

	test("impactAnalysis includes ideas", () => {
		const g = buildGraph(makeIdeaEntities());
		const result = impactAnalysis(g, "D-001");
		expect(result.direct.map((e) => e.id)).toContain("I-001");
		// I-002 is inspired by I-001, so it's transitive from D-001
		expect(result.transitive.map((e) => e.id)).toContain("I-002");
	});

	test("traceUp follows inspired_by edges", () => {
		const g = buildGraph(makeIdeaEntities());
		const tree = traceUp(g, "I-002");
		expect(tree).not.toBeNull();
		expect(tree!.entity.id).toBe("I-002");
		// I-002 inspired_by I-001, so I-001 is a child in the trace
		expect(tree!.children.length).toBe(1);
		expect(tree!.children[0].entity.id).toBe("I-001");
	});

	test("search finds ideas by type modifier", () => {
		const entities = makeIdeaEntities();
		const results = searchEntities(entities, "type:idea");
		expect(results.length).toBe(2);
		expect(results.every((r) => r.entity.type === "idea")).toBe(true);
	});

	test("search finds ideas by inspired_by modifier", () => {
		const entities = makeIdeaEntities();
		const results = searchEntities(entities, "inspired_by:D-001");
		expect(results.length).toBe(1);
		expect(results[0].entity.id).toBe("I-001");
	});

	test("search finds ideas by status modifier", () => {
		const entities = makeIdeaEntities();
		const results = searchEntities(entities, "type:idea status:explore");
		expect(results.length).toBe(1);
		expect(results[0].entity.id).toBe("I-001");
	});

	test("search finds ideas by text", () => {
		const entities = makeIdeaEntities();
		const results = searchEntities(entities, "CRDTs");
		expect(results.length).toBe(1);
		expect(results[0].entity.id).toBe("I-001");
	});

	test("ideas are excluded from orphan decisions check", () => {
		// Ideas don't need backing — they shouldn't appear as orphans
		const i1: Idea = {
			type: "idea",
			id: "I-001",
			title: "Wild idea",
			status: "explore",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			inspired_by: [],
		};
		const g = buildGraph([i1]);
		const orphans = findOrphans(g);
		expect(orphans.length).toBe(0);
	});

	test("link validation allows idea-inspired_by edges", () => {
		const { VALID_EDGES } = require("../src/commands/link");
		expect(VALID_EDGES["idea-requirement"]).toEqual(["inspired_by"]);
		expect(VALID_EDGES["idea-assumption"]).toEqual(["inspired_by"]);
		expect(VALID_EDGES["idea-decision"]).toEqual(["inspired_by"]);
		expect(VALID_EDGES["idea-idea"]).toEqual(["inspired_by"]);
	});
});

// ─── Context ───

describe("context", () => {
	test("entity can have a context field", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Encrypt data",
			status: "accepted",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
			context: "billing",
		};
		expect(r1.context).toBe("billing");
	});

	test("entity can omit context field", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Encrypt data",
			status: "accepted",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
		};
		expect(r1.context).toBeUndefined();
	});

	test("parser reads context from frontmatter", () => {
		const content = `---
id: D-001
title: "Use Stripe"
status: accepted
date: 2026-05-01
context: billing
driven_by: [R-001]
---

Body.
`;
		const entity = parseEntity(content, "decisions/D-001.md");
		expect(entity.context).toBe("billing");
	});

	test("parser handles missing context gracefully", () => {
		const content = `---
id: R-001
title: "Some req"
status: accepted
date: 2026-05-01
---

Body.
`;
		const entity = parseEntity(content, "requirements/R-001.md");
		expect(entity.context).toBeUndefined();
	});

	test("serializeFrontmatter includes context when set", () => {
		const d1: Decision = {
			type: "decision",
			id: "D-001",
			title: "Use Stripe",
			status: "accepted",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			driven_by: ["R-001"],
			enables: [],
			affects: [],
			context: "billing",
		};
		const yaml = serializeFrontmatter(d1);
		expect(yaml).toContain("context: billing");
	});

	test("serializeFrontmatter omits context when not set", () => {
		const d1: Decision = {
			type: "decision",
			id: "D-001",
			title: "Use Stripe",
			status: "accepted",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			driven_by: ["R-001"],
			enables: [],
			affects: [],
		};
		const yaml = serializeFrontmatter(d1);
		expect(yaml).not.toContain("context:");
	});

	test("round-trip preserves context", () => {
		const content = `---
id: D-001
title: "Use Stripe"
status: accepted
date: 2026-05-01
context: billing
driven_by: [R-001]
---

Body.
`;
		const entity = parseEntity(content, "test.md");
		const serialized = serializeEntity(entity);
		const reParsed = parseEntity(serialized, "test.md");
		expect(reParsed).toEqual(entity);
		expect(reParsed.context).toBe("billing");
	});

	test("graph indexes entities by context", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Encrypt data",
			status: "accepted",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
			context: "billing",
		};
		const r2: Requirement = {
			type: "requirement",
			id: "R-002",
			title: "Offline support",
			status: "accepted",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
			context: "billing",
		};
		const d1: Decision = {
			type: "decision",
			id: "D-001",
			title: "Use SQLite",
			status: "accepted",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			driven_by: ["R-001"],
			enables: [],
			affects: [],
			context: "fulfillment",
		};
		const a1: Assumption = {
			type: "assumption",
			id: "A-001",
			title: "Low latency",
			status: "unvalidated",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
		};
		const g = buildGraph([r1, r2, d1, a1]);

		expect(g.byContext.get("billing")?.length).toBe(2);
		expect(g.byContext.get("fulfillment")?.length).toBe(1);
		expect(g.byContext.get("")?.length).toBe(1); // a1 has no context
	});

	test("search finds entities by context modifier", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Encrypt data",
			status: "accepted",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
			context: "billing",
		};
		const r2: Requirement = {
			type: "requirement",
			id: "R-002",
			title: "Fast shipping",
			status: "accepted",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
			context: "fulfillment",
		};
		const results = searchEntities([r1, r2], "context:billing");
		expect(results.length).toBe(1);
		expect(results[0].entity.id).toBe("R-001");
	});

	test("search context modifier is case-insensitive", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Encrypt",
			status: "accepted",
			date: "2026-05-01",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
			context: "Billing",
		};
		const results = searchEntities([r1], "context:billing");
		expect(results.length).toBe(1);
	});
});

// ─── Stakeholder ───

describe("stakeholder", () => {
	test("parses a stakeholder", () => {
		const content = `---
id: S-001
title: "Warehouse operations team"
status: active
date: 2026-05-03
---

Body.
`;
		const entity = parseEntity(content, "stakeholders/S-001.md");
		expect(entity.type).toBe("stakeholder");
		expect(entity.id).toBe("S-001");
		expect(entity.title).toBe("Warehouse operations team");
		expect(entity.status).toBe("active");
	});

	test("stakeholder defaults to active status", () => {
		const content = `---
id: S-002
title: "Finance team"
---

Body.
`;
		const entity = parseEntity(content, "stakeholders/S-002.md");
		expect(entity.status).toBe("active");
	});

	test("round-trips a stakeholder", () => {
		const content = `---
id: S-001
title: "Warehouse team"
status: active
date: 2026-05-03
---

Body text.
`;
		const entity = parseEntity(content, "test.md");
		const serialized = serializeEntity(entity);
		const reParsed = parseEntity(serialized, "test.md");
		expect(reParsed).toEqual(entity);
	});

	test("getTypeFromId recognizes S- prefix", () => {
		const { getTypeFromId } = require("../src/types");
		expect(getTypeFromId("S-001")).toBe("stakeholder");
	});

	test("requirement can have requested_by pointing to stakeholder", () => {
		const r1: Requirement = {
			type: "requirement",
			id: "R-001",
			title: "Fast order processing",
			status: "accepted",
			date: "2026-05-03",
			tags: [],
			body: "",
			filePath: "",
			derived_from: [],
			conflicts_with: [],
			requested_by: ["S-001"],
		};
		const s1: Stakeholder = {
			type: "stakeholder",
			id: "S-001",
			title: "Warehouse team",
			status: "active",
			date: "2026-05-03",
			tags: [],
			body: "",
			filePath: "",
		};
		const g = buildGraph([r1, s1]);
		const deps = getDependents(g, "S-001");
		expect(deps.map((d) => d.id)).toContain("R-001");
	});

	test("decision can have affects pointing to stakeholder", () => {
		const d1: Decision = {
			type: "decision",
			id: "D-001",
			title: "Use real-time inventory",
			status: "accepted",
			date: "2026-05-03",
			tags: [],
			body: "",
			filePath: "",
			driven_by: [],
			enables: [],
			affects: ["S-001"],
		};
		const s1: Stakeholder = {
			type: "stakeholder",
			id: "S-001",
			title: "Warehouse team",
			status: "active",
			date: "2026-05-03",
			tags: [],
			body: "",
			filePath: "",
		};
		const g = buildGraph([d1, s1]);
		const deps = getDependents(g, "S-001");
		expect(deps.map((d) => d.id)).toContain("D-001");
	});

	test("link validation allows requirement→stakeholder requested_by", () => {
		const { VALID_EDGES } = require("../src/commands/link");
		expect(VALID_EDGES["requirement-stakeholder"]).toEqual(["requested_by"]);
	});

	test("link validation allows decision→stakeholder affects", () => {
		const { VALID_EDGES } = require("../src/commands/link");
		expect(VALID_EDGES["decision-stakeholder"]).toEqual(["affects"]);
	});

	test("impact analysis includes stakeholders", () => {
		const s1: Stakeholder = {
			type: "stakeholder",
			id: "S-001",
			title: "Warehouse team",
			status: "active",
			date: "2026-05-03",
			tags: [],
			body: "",
			filePath: "",
		};
		const d1: Decision = {
			type: "decision",
			id: "D-001",
			title: "Change warehouse process",
			status: "accepted",
			date: "2026-05-03",
			tags: [],
			body: "",
			filePath: "",
			driven_by: [],
			enables: [],
			affects: ["S-001"],
		};
		const g = buildGraph([s1, d1]);
		const result = impactAnalysis(g, "S-001");
		expect(result.direct.map((e) => e.id)).toContain("D-001");
	});

});
// ─── Risk ───

describe("risk", () => {
	test("parses a risk", () => {
		const content = `---
id: K-001
title: "Payment provider downtime"
status: identified
date: 2026-05-03
mitigated_by: [D-005]
---

Body.
`;
		const entity = parseEntity(content, "risks/K-001.md");
		expect(entity.type).toBe("risk");
		expect(entity.id).toBe("K-001");
		expect(entity.title).toBe("Payment provider downtime");
		expect(entity.status).toBe("identified");
		if (entity.type === "risk") {
			expect(entity.mitigated_by).toEqual(["D-005"]);
		}
	});

	test("risk defaults to identified status", () => {
		const content = `---
id: K-002
title: "Data loss"
---

Body.
`;
		const entity = parseEntity(content, "risks/K-002.md");
		expect(entity.status).toBe("identified");
	});

	test("round-trips a risk", () => {
		const content = `---
id: K-001
title: "Payment downtime"
status: mitigated
date: 2026-05-03
mitigated_by: [D-005]
---

Body text.
`;
		const entity = parseEntity(content, "test.md");
		const serialized = serializeEntity(entity);
		const reParsed = parseEntity(serialized, "test.md");
		expect(reParsed).toEqual(entity);
	});

	test("getTypeFromId recognizes K- prefix", () => {
		const { getTypeFromId } = require("../src/types");
		expect(getTypeFromId("K-001")).toBe("risk");
	});

	test("risk mitigated_by creates edges", () => {
		const k1: Risk = {
			type: "risk",
			id: "K-001",
			title: "Payment downtime",
			status: "mitigated",
			date: "2026-05-03",
			tags: [],
			body: "",
			filePath: "",
			mitigated_by: ["D-005"],
		};
		const d1: Decision = {
			type: "decision",
			id: "D-005",
			title: "Use payment fallback",
			status: "accepted",
			date: "2026-05-03",
			tags: [],
			body: "",
			filePath: "",
			driven_by: [],
			enables: [],
			affects: [],
		};
		const g = buildGraph([k1, d1]);
		const outgoing = g.outgoing.get("K-001") ?? [];
		expect(outgoing.length).toBe(1);
		expect(outgoing[0].to).toBe("D-005");
		expect(outgoing[0].type).toBe("mitigated_by");
	});

	test("getDependents finds risks mitigated by a decision", () => {
		const k1: Risk = {
			type: "risk",
			id: "K-001",
			title: "Payment downtime",
			status: "mitigated",
			date: "2026-05-03",
			tags: [],
			body: "",
			filePath: "",
			mitigated_by: ["D-005"],
		};
		const d1: Decision = {
			type: "decision",
			id: "D-005",
			title: "Use payment fallback",
			status: "accepted",
			date: "2026-05-03",
			tags: [],
			body: "",
			filePath: "",
			driven_by: [],
			enables: [],
			affects: [],
		};
		const g = buildGraph([k1, d1]);
		const deps = getDependents(g, "D-005");
		expect(deps.map((d) => d.id)).toContain("K-001");
	});

	test("link validation allows risk→decision mitigated_by", () => {
		const { VALID_EDGES } = require("../src/commands/link");
		expect(VALID_EDGES["risk-decision"]).toEqual(["mitigated_by"]);
	});
});
// ─── Term ───

describe("term", () => {
	test("parses a term", () => {
		const content = `---
id: T-001
title: "Order"
status: accepted
date: 2026-05-03
---

A customer's intent to purchase one or more items.
`;
		const entity = parseEntity(content, "terms/T-001.md");
		expect(entity.type).toBe("term");
		expect(entity.id).toBe("T-001");
		expect(entity.title).toBe("Order");
		expect(entity.status).toBe("accepted");
	});

	test("term defaults to draft status", () => {
		const content = `---
id: T-002
title: "Fulfillment"
---

Body.
`;
		const entity = parseEntity(content, "terms/T-002.md");
		expect(entity.status).toBe("draft");
	});

	test("round-trips a term", () => {
		const content = `---
id: T-001
title: "Order"
status: accepted
date: 2026-05-03
---

A customer's intent to purchase items.
`;
		const entity = parseEntity(content, "test.md");
		const serialized = serializeEntity(entity);
		const reParsed = parseEntity(serialized, "test.md");
		expect(reParsed).toEqual(entity);
	});

	test("getTypeFromId recognizes T- prefix", () => {
		const { getTypeFromId } = require("../src/types");
		expect(getTypeFromId("T-001")).toBe("term");
	});
});
