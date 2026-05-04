// Fuzzy text search for ARAD entities

import type { Entity, EntityType } from "../types";

export interface SearchResult {
	entity: Entity;
	score: number;
	matches: string[];
}

interface Token {
	type: "modifier" | "text";
	key?: string;
	value: string;
}

/**
 * Search entities with structured modifiers and fuzzy text matching.
 *
 * Supports:
 *   "sqlite"                     — fuzzy text search
 *   "type:decision"              — filter by entity type
 *   "status:accepted"            — filter by status
 *   "tag:storage"                — filter by tag
 *   "driven_by:R-001"           — filter by relationship
 *   "id:D-001"                   — filter by ID
 *   "type:decision sqlite"      — combined
 */
export function searchEntities(
	entities: Entity[],
	query: string,
): SearchResult[] {
	const tokens = tokenize(query);
	if (tokens.length === 0) return [];

	const results: SearchResult[] = [];

	for (const entity of entities) {
		const { score, matches } = scoreEntity(entity, tokens);
		if (score > 0) {
			results.push({ entity, score, matches });
		}
	}

	return results.sort((a, b) => b.score - a.score);
}

function tokenize(query: string): Token[] {
	return query
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => {
			const modifierMatch = part.match(/^(\w+):(.+)$/);
			if (modifierMatch) {
				return {
					type: "modifier" as const,
					key: modifierMatch[1].toLowerCase(),
					value: modifierMatch[2].toLowerCase(),
				};
			}
			return { type: "text" as const, value: part.toLowerCase() };
		});
}

function scoreEntity(
	entity: Entity,
	tokens: Token[],
): { score: number; matches: string[] } {
	let totalScore = 0;
	const matches: string[] = [];
	let allModifiersPass = true;

	for (const token of tokens) {
		if (token.type === "modifier") {
			const modScore = scoreModifier(entity, token.key!, token.value);
			if (modScore === 0) {
				allModifiersPass = false;
				break;
			}
			totalScore += modScore;
			matches.push(`${token.key}:${token.value}`);
		} else {
			const textScore = scoreText(entity, token.value);
			if (textScore > 0) {
				totalScore += textScore;
				matches.push(token.value);
			}
		}
	}

	// All modifiers must match (AND logic)
	if (!allModifiersPass) return { score: 0, matches: [] };

	// At least one text token must match if there are text tokens
	const hasTextTokens = tokens.some((t) => t.type === "text");
	if (hasTextTokens && !matches.some((m) => !m.includes(":")))
		return { score: 0, matches: [] };

	return { score: totalScore, matches };
}

function scoreModifier(entity: Entity, key: string, value: string): number {
	switch (key) {
		case "type":
			return entity.type === value ? 50 : 0;
		case "status":
			return entity.status === value ? 40 : 0;
		case "tag":
			return entity.tags.some(
				(t) => t.toLowerCase() === value || t.toLowerCase().includes(value),
			)
				? 30
				: 0;
		case "driven_by":
		case "derived_from":
		case "enables":
		case "conflicts_with":
			return hasRelationship(entity, key, value) ? 35 : 0;
		case "id":
			return entity.id.toLowerCase() === value
				? 100
				: entity.id.toLowerCase().includes(value)
					? 50
					: 0;
		case "promoted_to":
			return (entity.type === "assumption" || entity.type === "idea") &&
				entity.promoted_to?.toLowerCase().includes(value)
				? 35
				: 0;
		case "inspired_by":
			return entity.type === "idea" &&
				entity.inspired_by.some((d) => d.toLowerCase().includes(value))
				? 35
				: 0;
		case "context":
			return entity.context?.toLowerCase().includes(value) ? 30 : 0;
		default:
			return 0;
	}
}

function hasRelationship(
	entity: Entity,
	relType: string,
	value: string,
): boolean {
	switch (entity.type) {
		case "requirement":
			if (relType === "derived_from")
				return entity.derived_from.some((d) => d.toLowerCase().includes(value));
			if (relType === "conflicts_with")
				return entity.conflicts_with.some((d) =>
					d.toLowerCase().includes(value),
				);
			return false;
		case "decision":
			if (relType === "driven_by")
				return entity.driven_by.some((d) => d.toLowerCase().includes(value));
			if (relType === "enables")
				return entity.enables.some((d) => d.toLowerCase().includes(value));
			return false;
		case "idea":
			if (relType === "inspired_by")
				return entity.inspired_by.some((d) => d.toLowerCase().includes(value));
			return false;
		default:
			return false;
	}
}

function scoreText(entity: Entity, term: string): number {
	let score = 0;

	// Exact ID match (highest priority)
	if (entity.id.toLowerCase() === term) score += 100;
	else if (entity.id.toLowerCase().includes(term)) score += 60;

	// Title match
	const titleLower = entity.title.toLowerCase();
	if (titleLower === term) score += 60;
	else if (titleLower.includes(term)) score += 40;
	else if (fuzzyMatch(titleLower, term)) score += 20;

	// Tag match
	if (entity.tags.some((t) => t.toLowerCase().includes(term))) score += 30;

	// Body match (lower weight)
	if (entity.body.toLowerCase().includes(term)) score += 15;

	return score;
}

/**
 * Simple fuzzy match: checks if all characters of needle appear in order in haystack.
 * "sqlte" matches "sqlite"
 */
function fuzzyMatch(haystack: string, needle: string): boolean {
	let hi = 0;
	for (let ni = 0; ni < needle.length; ni++) {
		hi = haystack.indexOf(needle[ni], hi);
		if (hi === -1) return false;
		hi++;
	}
	return true;
}
