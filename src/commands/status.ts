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
import { ARAD_DIR, readAllEntities, requireAradProject } from "../io/files.js";
import type { Entity, EntityType } from "../types.js";
import { ENTITY_TYPE_ORDER, allTypes } from "../entities/registry.js";

export function statusCommand(): void {
	requireAradProject();

	// Read project name
	let projectName = "project";
	try {
		const config = readFileSync(
			join(process.cwd(), ARAD_DIR, "arad.yaml"),
			"utf-8",
		);
		const match = config.match(/name:\s*(.+)/);
		if (match) projectName = match[1].trim();
	} catch {}

	const entities = readAllEntities();
	const graph = buildGraph(entities);

	console.log(bold(`ARAD project "${projectName}"`));
	console.log("");

	// Count by type and status
	const byType: Record<EntityType, Entity[]> = {} as any;
	for (const type of allTypes()) {
		byType[type] = entities.filter((e) => e.type === type);
	}

	function statusBreakdown(list: Entity[]): string {
		const counts = new Map<string, number>();
		for (const e of list) {
			counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
		}
		return [...counts.entries()].map(([s, c]) => `${c} ${s}`).join(", ");
	}

	for (const type of ENTITY_TYPE_ORDER) {
		const list = byType[type];
		const label = type + (list.length !== 1 ? "s" : "");
		if (list.length === 0) {
			console.log(dim(`  0 ${label}`));
		} else {
			console.log(`  ${list.length} ${label} (${statusBreakdown(list)})`);
		}
	}

	console.log(`  ${graph.edges.length} relationships`);
	console.log("");

	// Context breakdown
	if (
		graph.byContext.size > 1 ||
		(graph.byContext.size === 1 && graph.byContext.has("") === false)
	) {
		console.log(bold("Contexts:"));
		const sortedContexts = [...graph.byContext.entries()].sort((a, b) => {
			// Empty (no context) goes last
			if (a[0] === "") return 1;
			if (b[0] === "") return -1;
			return a[0].localeCompare(b[0]);
		});
		for (const [ctx, ctxEntities] of sortedContexts) {
			const label = ctx || "(no context)";
			const types = new Map<string, number>();
			for (const e of ctxEntities) {
				types.set(e.type, (types.get(e.type) ?? 0) + 1);
			}
			const breakdown = [...types.entries()]
				.map(([t, c]) => `${c} ${t}${c !== 1 ? "s" : ""}`)
				.join(", ");
			console.log(`  ${label}: ${ctxEntities.length} entities (${breakdown})`);
		}
		console.log("");
	}

	// Quick health indicators
	const contradictions = findContradictions(graph);
	const danglers = findDanglingRefs(graph);
	const orphans = findOrphans(graph);
	const unvalidated = findUnvalidatedAssumptions(graph);
	const unvalidatedBacking = unvalidated.filter((a) => {
		const incoming = graph.incoming.get(a.id) ?? [];
		return incoming.some((e) => e.type === "driven_by");
	});

	if (contradictions.length > 0) {
		console.log(red(`  ⚡ ${contradictions.length} contradiction(s)`));
	}
	if (danglers.length > 0) {
		console.log(red(`  🔗 ${danglers.length} dangling reference(s)`));
	}
	if (orphans.length > 0) {
		console.log(yellow(`  ⊘ ${orphans.length} orphan decision(s)`));
	}
	if (unvalidatedBacking.length > 0) {
		console.log(
			yellow(
				`  ○ ${unvalidatedBacking.length} unvalidated assumption(s) backing decisions`,
			),
		);
	}
	if (
		contradictions.length === 0 &&
		danglers.length === 0 &&
		orphans.length === 0
	) {
		console.log(green("  ✓ No issues"));
	}
	if (unvalidated.length > 0 && unvalidatedBacking.length === 0) {
		console.log(
			dim(`  ${unvalidated.length} unvalidated assumption(s) (no dependents)`),
		);
	}
}
