// Heuristic analysis functions for ARAD.
//
// These functions are type-aware: they know about specific entity types
// (decision, requirement, assumption, etc.) and apply domain-specific
// heuristics. They sit on top of the type-agnostic graph engine.

import type { AradGraph, Entity } from "../types";
import { getDependents } from "./graph";

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

// ─── Opposition term detection ───

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

// ─── Duplicate detection ───

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

// ─── Status anomalies ───

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
