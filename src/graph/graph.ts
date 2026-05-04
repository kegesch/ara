// In-memory graph engine for ARAD

import type { AradGraph, Edge, EdgeType, Entity } from "../types";

/**
 * Build an in-memory graph from a list of entities.
 * Extracts all relationships from entity fields into a unified edge list
 * with bidirectional indexes for fast traversal.
 */
export function buildGraph(entities: Entity[]): AradGraph {
	const g: AradGraph = {
		entities: new Map(),
		edges: [],
		outgoing: new Map(),
		incoming: new Map(),
		byContext: new Map(),
	};

	for (const entity of entities) {
		g.entities.set(entity.id, entity);

		// Index by context
		const ctx = entity.context ?? "";
		if (!g.byContext.has(ctx)) g.byContext.set(ctx, []);
		g.byContext.get(ctx)!.push(entity);
	}

	for (const entity of entities) {
		switch (entity.type) {
			case "requirement":
				for (const parentId of entity.derived_from) {
					addEdge(g, entity.id, parentId, "derived_from");
				}
				for (const conflictId of entity.conflicts_with) {
					addEdge(g, entity.id, conflictId, "conflicts_with");
				}
				for (const stakeholderId of entity.requested_by) {
					addEdge(g, entity.id, stakeholderId, "requested_by");
				}
				break;
			case "assumption":
				if (entity.promoted_to) {
					addEdge(g, entity.id, entity.promoted_to, "promoted_to");
				}
				break;
			case "decision":
				for (const drivenById of entity.driven_by) {
					addEdge(g, entity.id, drivenById, "driven_by");
				}
				for (const enablesId of entity.enables) {
					addEdge(g, entity.id, enablesId, "enables");
				}
				if (entity.supersedes) {
					addEdge(g, entity.id, entity.supersedes, "supersedes");
				}
				for (const stakeholderId of entity.affects) {
					addEdge(g, entity.id, stakeholderId, "affects");
				}
				break;
			case "idea":
				for (const inspiredById of entity.inspired_by) {
					addEdge(g, entity.id, inspiredById, "inspired_by");
				}
				if (entity.promoted_to) {
					addEdge(g, entity.id, entity.promoted_to, "promoted_to");
				}
				break;
			case "stakeholder":
				break;
			case "risk":
				for (const decisionId of entity.mitigated_by) {
					addEdge(g, entity.id, decisionId, "mitigated_by");
				}
				break;
			case "term":
				break;
		}
	}

	return g;
}

function addEdge(g: AradGraph, from: string, to: string, type: EdgeType): void {
	const edge: Edge = { from, to, type };
	g.edges.push(edge);

	if (!g.outgoing.has(from)) g.outgoing.set(from, []);
	g.outgoing.get(from)!.push(edge);

	if (!g.incoming.has(to)) g.incoming.set(to, []);
	g.incoming.get(to)!.push(edge);
}

/**
 * Get entities that depend on the given entity (reverse traversal).
 * E.g., decisions driven by a requirement, or requirements derived from another.
 */
export function getDependents(g: AradGraph, id: string): Entity[] {
	const result: Entity[] = [];
	const incoming = g.incoming.get(id) ?? [];
	for (const edge of incoming) {
		// driven_by: edge.from is a decision that depends on edge.to (the query id)
		// derived_from: edge.from is a requirement derived from edge.to
		// enables: edge.from is a decision enabled by edge.to
		if (
			[
				"driven_by",
				"derived_from",
				"enables",
				"inspired_by",
				"requested_by",
				"affects",
				"mitigated_by",
			].includes(edge.type)
		) {
			const entity = g.entities.get(edge.from);
			if (entity) result.push(entity);
		}
	}
	return result;
}

/**
 * Get entities that the given entity depends on (forward traversal).
 * E.g., requirements driving a decision, assumptions backing it.
 */
export function getDependencies(g: AradGraph, id: string): Entity[] {
	const result: Entity[] = [];
	const outgoing = g.outgoing.get(id) ?? [];
	for (const edge of outgoing) {
		if (
			[
				"driven_by",
				"derived_from",
				"enables",
				"inspired_by",
				"requested_by",
				"affects",
				"mitigated_by",
			].includes(edge.type)
		) {
			const entity = g.entities.get(edge.to);
			if (entity) result.push(entity);
		}
	}
	return result;
}

/** Find decisions with no driven_by (no backing requirement or assumption) */
export function findOrphans(g: AradGraph): Entity[] {
	const orphans: Entity[] = [];
	for (const [, entity] of g.entities) {
		if (entity.type === "decision" && entity.driven_by.length === 0) {
			orphans.push(entity);
		}
	}
	return orphans;
}

/** Find explicitly declared contradictions */
export function findContradictions(g: AradGraph): [Entity, Entity][] {
	const seen = new Set<string>();
	const pairs: [Entity, Entity][] = [];

	for (const edge of g.edges) {
		if (edge.type === "conflicts_with") {
			const key = [edge.from, edge.to].sort().join("::");
			if (!seen.has(key)) {
				seen.add(key);
				const e1 = g.entities.get(edge.from);
				const e2 = g.entities.get(edge.to);
				if (e1 && e2) pairs.push([e1, e2]);
			}
		}
	}
	return pairs;
}

/** Find references to entity IDs that don't exist */
export function findDanglingRefs(
	g: AradGraph,
): { from: string; ref: string; context: string }[] {
	const danglers: { from: string; ref: string; context: string }[] = [];

	for (const edge of g.edges) {
		if (!g.entities.has(edge.to)) {
			danglers.push({ from: edge.from, ref: edge.to, context: edge.type });
		}
		// from should always exist since we extracted from the entity, but check anyway
		if (!g.entities.has(edge.from)) {
			danglers.push({
				from: edge.to,
				ref: edge.from,
				context: `${edge.type} (reverse)`,
			});
		}
	}
	return danglers;
}

/** Find assumptions that are still unvalidated */
export function findUnvalidatedAssumptions(g: AradGraph): Entity[] {
	const result: Entity[] = [];
	for (const [, entity] of g.entities) {
		if (entity.type === "assumption" && entity.status === "unvalidated") {
			result.push(entity);
		}
	}
	return result;
}

/**
 * Impact analysis: what entities are affected if the given entity changes/is removed.
 * Returns direct dependents and transitive dependents (BFS).
 */
export function impactAnalysis(
	g: AradGraph,
	id: string,
): {
	direct: Entity[];
	transitive: Entity[];
} {
	const directDeps = getDependents(g, id);
	const visited = new Set<string>(directDeps.map((e) => e.id));
	const queue = [...directDeps.map((e) => e.id)];
	const transitive: Entity[] = [];

	while (queue.length > 0) {
		const current = queue.shift()!;
		const deps = getDependents(g, current);
		for (const dep of deps) {
			if (!visited.has(dep.id)) {
				visited.add(dep.id);
				transitive.push(dep);
				queue.push(dep.id);
			}
		}
	}

	return { direct: directDeps, transitive };
}

/**
 * Full dependency trace from an entity up to its roots.
 * Returns a tree structure suitable for rendering.
 */
export interface TraceNode {
	entity: Entity;
	edgeType: EdgeType | "root";
	children: TraceNode[];
}

export function traceUp(
	g: AradGraph,
	id: string,
	visited: Set<string> = new Set(),
): TraceNode | null {
	const entity = g.entities.get(id);
	if (!entity) return null;

	if (visited.has(id)) return { entity, edgeType: "root", children: [] }; // cycle guard
	visited.add(id);

	const children: TraceNode[] = [];
	const outgoing = g.outgoing.get(id) ?? [];

	for (const edge of outgoing) {
		if (
			["driven_by", "derived_from", "supersedes", "inspired_by"].includes(
				edge.type,
			)
		) {
			const child = traceUp(g, edge.to, visited);
			if (child) {
				child.edgeType = edge.type;
				children.push(child);
			}
		}
	}

	return { entity, edgeType: "root", children };
}

// ─── Heuristic Analysis ───

/**
 * Built-in opposition term pairs.
 * Each pair [a, b] means if one requirement mentions `a` and another mentions `b`,
 * they might contradict.
 */
const DEFAULT_OPPOSITIONS: [string, string][] = [
	["encrypt", "plaintext"],
	["encrypted", "unencrypted"],
	["offline", "online"],
	["offline", "real-time"],
	["offline", "always online"],
	["synchronous", "asynchronous"],
	["real-time", "batch"],
	["real-time", "eventual"],
	["real-time", "delayed"],
	["immutable", "mutable"],
	["immutable", "mutable"],
	["stateless", "stateful"],
	["public", "private"],
	["open", "restricted"],
	["allow", "deny"],
	["allow", "block"],
	["require", "prohibit"],
	["mandatory", "optional"],
	["must", "must not"],
	["shall", "shall not"],
	["single", "distributed"],
	["centralized", "distributed"],
	["local", "remote"],
	["internal", "external"],
	["free", "paid"],
	["unlimited", "limited"],
	["static", "dynamic"],
	["pull", "push"],
	["read-only", "writable"],
];

export interface PossibleContradiction {
	a: Entity;
	b: Entity;
	reason: string;
	confidence: "high" | "medium" | "low";
}

/**
 * Find possible contradictions between requirements based on opposing terms.
 */
export function findPossibleContradictions(
	g: AradGraph,
	oppositions: [string, string][] = DEFAULT_OPPOSITIONS,
): PossibleContradiction[] {
	const requirements = [...g.entities.values()].filter(
		(e) => e.type === "requirement",
	);
	const results: PossibleContradiction[] = [];

	// Build a map of which requirements contain which terms
	const termIndex = new Map<string, Set<string>>(); // term → set of req IDs
	for (const req of requirements) {
		const text = `${req.title} ${req.body}`.toLowerCase();
		for (const [termA, termB] of oppositions) {
			if (text.includes(termA.toLowerCase())) {
				if (!termIndex.has(termA)) termIndex.set(termA, new Set());
				termIndex.get(termA)!.add(req.id);
			}
			if (text.includes(termB.toLowerCase())) {
				if (!termIndex.has(termB)) termIndex.set(termB, new Set());
				termIndex.get(termB)!.add(req.id);
			}
		}
	}

	// For each opposition pair, find requirements that have opposing terms
	const seen = new Set<string>();
	for (const [termA, termB] of oppositions) {
		const setA = termIndex.get(termA);
		const setB = termIndex.get(termB);
		if (!setA || !setB) continue;

		for (const idA of setA) {
			for (const idB of setB) {
				if (idA === idB) continue; // same requirement containing both terms is fine
				const key = [idA, idB].sort().join("::");
				if (seen.has(key)) continue;
				seen.add(key);

				const eA = g.entities.get(idA)!;
				const eB = g.entities.get(idB)!;

				results.push({
					a: eA,
					b: eB,
					reason: `opposing terms: "${termA}" vs "${termB}"`,
					confidence: "medium",
				});
			}
		}
	}

	return results;
}

export interface PossibleDuplicate {
	a: Entity;
	b: Entity;
	similarity: number;
}

/**
 * Find requirements with very similar titles (possible unintended duplicates).
 * Uses a simple Jaccard-like token overlap score.
 */
export function findPossibleDuplicates(
	g: AradGraph,
	threshold: number = 0.6,
): PossibleDuplicate[] {
	const requirements = [...g.entities.values()].filter(
		(e) => e.type === "requirement",
	);
	const results: PossibleDuplicate[] = [];

	for (let i = 0; i < requirements.length; i++) {
		for (let j = i + 1; j < requirements.length; j++) {
			const a = requirements[i];
			const b = requirements[j];
			const similarity = tokenSimilarity(a.title, b.title);
			if (similarity >= threshold) {
				results.push({ a, b, similarity });
			}
		}
	}

	return results.sort((a, b) => b.similarity - a.similarity);
}

function tokenSimilarity(a: string, b: string): number {
	const tokensA = new Set(tokenize(a));
	const tokensB = new Set(tokenize(b));
	const intersection = [...tokensA].filter((t) => tokensB.has(t));
	const union = new Set([...tokensA, ...tokensB]);
	return union.size === 0 ? 0 : intersection.length / union.size;
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.split(/\s+/)
		.filter((t) => t.length > 2); // skip short words
}

export interface StatusAnomaly {
	entity: Entity;
	issue: string;
	refs: Entity[];
}

/**
 * Find status anomalies:
 * - Accepted decisions driven by deprecated/rejected requirements
 * - Accepted decisions backed by invalidated assumptions
 */
export function findStatusAnomalies(g: AradGraph): StatusAnomaly[] {
	const anomalies: StatusAnomaly[] = [];

	for (const [, entity] of g.entities) {
		if (entity.type === "decision" && entity.status === "accepted") {
			const badRefs: Entity[] = [];

			for (const drivenById of entity.driven_by) {
				const dep = g.entities.get(drivenById);
				if (!dep) continue;

				if (
					dep.type === "requirement" &&
					(dep.status === "deprecated" || dep.status === "rejected")
				) {
					badRefs.push(dep);
				}
				if (dep.type === "assumption" && dep.status === "invalidated") {
					badRefs.push(dep);
				}
			}

			if (badRefs.length > 0) {
				anomalies.push({
					entity,
					issue: `accepted decision backed by ${badRefs.map((r) => `${r.status} ${r.id}`).join(", ")}`,
					refs: badRefs,
				});
			}
		}
	}

	return anomalies;
}

/**
 * Find requirements that have no decisions addressing them (orphan requirements).
 */
export function findOrphanRequirements(g: AradGraph): Entity[] {
	const orphans: Entity[] = [];
	for (const [, entity] of g.entities) {
		if (entity.type === "requirement" && entity.status === "accepted") {
			const dependents = getDependents(g, entity.id);
			const drivenByDecision = dependents.some((d) => d.type === "decision");
			if (!drivenByDecision) {
				orphans.push(entity);
			}
		}
	}
	return orphans;
}
