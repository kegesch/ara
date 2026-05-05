// In-memory graph engine for ARAD
//
// This module is type-agnostic: it knows about entities, edges, and graph
// algorithms, but never about specific entity types ("decision", "requirement",
// etc.). Edge extraction is delegated to entity descriptors.

import { getDescriptor } from "../entities/registry";
import type { AradGraph, Edge, EdgeType, Entity } from "../types";

/** Edge types that represent dependency relationships (used for traversal). */
const DEPENDENCY_EDGE_TYPES: Set<EdgeType> = new Set([
	"driven_by",
	"derived_from",
	"enables",
	"inspired_by",
	"requested_by",
	"affects",
	"mitigated_by",
]);

/** Edge types that represent hierarchical/trace relationships (used for traceUp). */
const TRACE_EDGE_TYPES: Set<EdgeType> = new Set([
	"driven_by",
	"derived_from",
	"supersedes",
	"inspired_by",
]);

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
		const desc = getDescriptor(entity.type);
		for (const edge of desc.edges(entity as any)) {
			addEdge(g, entity.id, edge.to, edge.type);
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
 * Only traverses dependency edges (excludes conflicts_with, supersedes, etc.).
 */
export function getDependents(g: AradGraph, id: string): Entity[] {
	const result: Entity[] = [];
	const incoming = g.incoming.get(id) ?? [];
	for (const edge of incoming) {
		if (DEPENDENCY_EDGE_TYPES.has(edge.type)) {
			const entity = g.entities.get(edge.from);
			if (entity) result.push(entity);
		}
	}
	return result;
}

/**
 * Get entities that the given entity depends on (forward traversal).
 * E.g., requirements driving a decision, assumptions backing it.
 * Only traverses dependency edges (excludes conflicts_with, supersedes, etc.).
 */
export function getDependencies(g: AradGraph, id: string): Entity[] {
	const result: Entity[] = [];
	const outgoing = g.outgoing.get(id) ?? [];
	for (const edge of outgoing) {
		if (DEPENDENCY_EDGE_TYPES.has(edge.type)) {
			const entity = g.entities.get(edge.to);
			if (entity) result.push(entity);
		}
	}
	return result;
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
		if (TRACE_EDGE_TYPES.has(edge.type)) {
			const child = traceUp(g, edge.to, visited);
			if (child) {
				child.edgeType = edge.type;
				children.push(child);
			}
		}
	}

	return { entity, edgeType: "root", children };
}
