// arad status — quick project health summary
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bold, dim, green, red, yellow } from "../display/format.js";
import {
	buildGraph,
	findContradictions,
	findDanglingRefs,
	findOrphans,
	findUnvalidatedAssumptions,
} from "../graph/graph.js";
import { ARAD_DIR, isAradProject, readAllEntities, requireAradProject } from "../io/files.js";
import type { Entity, EntityType } from "../types.js";
import { ENTITY_TYPE_ORDER, allTypes } from "../entities/registry.js";
import { NotAnAradProject } from "../core/errors.js";

// ─── Pure logic types ───

export interface StatusResult {
	projectName: string;
	entities: {
		type: EntityType;
		count: number;
		statuses: Record<string, number>;
	}[];
	relationships: number;
	contexts: {
		name: string;
		count: number;
		types: Record<string, number>;
	}[];
	health: {
		contradictions: number;
		danglingRefs: number;
		orphans: number;
		unvalidatedBacking: number;
		unvalidatedTotal: number;
	};
}

// ─── Pure logic ───

/**
 * Get project health status as structured data.
 */
export function getStatus(dir: string): StatusResult {
	if (!isAradProject(dir)) throw new NotAnAradProject();

	// Read project name
	let projectName = "project";
	try {
		const config = readFileSync(join(dir, ARAD_DIR, "arad.yaml"), "utf-8");
		const match = config.match(/name:\s*(.+)/);
		if (match) projectName = match[1].trim();
	} catch {}

	const entities = readAllEntities(dir);
	const graph = buildGraph(entities);

	// Count by type and status
	const entityCounts: StatusResult["entities"] = [];
	for (const type of allTypes()) {
		const list = entities.filter((e) => e.type === type);
		const statuses: Record<string, number> = {};
		for (const e of list) {
			statuses[e.status] = (statuses[e.status] ?? 0) + 1;
		}
		entityCounts.push({ type, count: list.length, statuses });
	}

	// Context breakdown
	const contexts: StatusResult["contexts"] = [];
	if (
		graph.byContext.size > 1 ||
		(graph.byContext.size === 1 && graph.byContext.has("") === false)
	) {
		const sortedContexts = [...graph.byContext.entries()].sort((a, b) => {
			if (a[0] === "") return 1;
			if (b[0] === "") return -1;
			return a[0].localeCompare(b[0]);
		});
		for (const [ctx, ctxEntities] of sortedContexts) {
			const types: Record<string, number> = {};
			for (const e of ctxEntities) {
				types[e.type] = (types[e.type] ?? 0) + 1;
			}
			contexts.push({
				name: ctx || "(no context)",
				count: ctxEntities.length,
				types,
			});
		}
	}

	// Health indicators
	const contradictions = findContradictions(graph);
	const danglers = findDanglingRefs(graph);
	const orphans = findOrphans(graph);
	const unvalidated = findUnvalidatedAssumptions(graph);
	const unvalidatedBacking = unvalidated.filter((a) => {
		const incoming = graph.incoming.get(a.id) ?? [];
		return incoming.some((e) => e.type === "driven_by");
	});

	return {
		projectName,
		entities: entityCounts,
		relationships: graph.edges.length,
		contexts,
		health: {
			contradictions: contradictions.length,
			danglingRefs: danglers.length,
			orphans: orphans.length,
			unvalidatedBacking: unvalidatedBacking.length,
			unvalidatedTotal: unvalidated.length,
		},
	};
}

// ─── CLI entry point ───

export function statusCommand(): void {
	requireAradProject();

	const result = getStatus(process.cwd());

	console.log(bold(`ARAD project "${result.projectName}"`));
	console.log("");

	for (const entry of result.entities) {
		const label = entry.type + (entry.count !== 1 ? "s" : "");
		if (entry.count === 0) {
			console.log(dim(`  0 ${label}`));
		} else {
			const breakdown = Object.entries(entry.statuses)
				.map(([s, c]) => `${c} ${s}`)
				.join(", ");
			console.log(`  ${entry.count} ${label} (${breakdown})`);
		}
	}

	console.log(`  ${result.relationships} relationships`);
	console.log("");

	// Context breakdown
	if (result.contexts.length > 0) {
		console.log(bold("Contexts:"));
		for (const ctx of result.contexts) {
			const breakdown = Object.entries(ctx.types)
				.map(([t, c]) => `${c} ${t}${c !== 1 ? "s" : ""}`)
				.join(", ");
			console.log(`  ${ctx.name}: ${ctx.count} entities (${breakdown})`);
		}
		console.log("");
	}

	// Health indicators
	const h = result.health;
	if (h.contradictions > 0) {
		console.log(red(`  ⚡ ${h.contradictions} contradiction(s)`));
	}
	if (h.danglingRefs > 0) {
		console.log(red(`  🔗 ${h.danglingRefs} dangling reference(s)`));
	}
	if (h.orphans > 0) {
		console.log(yellow(`  ⊘ ${h.orphans} orphan decision(s)`));
	}
	if (h.unvalidatedBacking > 0) {
		console.log(
			yellow(
				`  ○ ${h.unvalidatedBacking} unvalidated assumption(s) backing decisions`,
			),
		);
	}
	if (h.contradictions === 0 && h.danglingRefs === 0 && h.orphans === 0) {
		console.log(green("  ✓ No issues"));
	}
	if (h.unvalidatedTotal > 0 && h.unvalidatedBacking === 0) {
		console.log(
			dim(`  ${h.unvalidatedTotal} unvalidated assumption(s) (no dependents)`),
		);
	}
}
