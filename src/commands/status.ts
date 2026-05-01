// arad status — quick project health summary
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bold, colorId, dim, green, red, yellow } from "../display/format.js";
import {
	buildGraph,
	findContradictions,
	findDanglingRefs,
	findOrphans,
	findUnvalidatedAssumptions,
} from "../graph/graph.js";
import { ARAD_DIR, readAllEntities, requireAradProject } from "../io/files.js";
import type {
	AssumptionStatus,
	DecisionStatus,
	Entity,
	EntityType,
	RequirementStatus,
} from "../types.js";

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
	const byType: Record<EntityType, Entity[]> = {
		requirement: entities.filter((e) => e.type === "requirement"),
		assumption: entities.filter((e) => e.type === "assumption"),
		decision: entities.filter((e) => e.type === "decision"),
		idea: entities.filter((e) => e.type === "idea"),
	};

	function statusBreakdown(list: Entity[]): string {
		const counts = new Map<string, number>();
		for (const e of list) {
			counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
		}
		return [...counts.entries()].map(([s, c]) => `${c} ${s}`).join(", ");
	}

	for (const type of [
		"requirement",
		"assumption",
		"decision",
		"idea",
	] as EntityType[]) {
		const list = byType[type];
		const label = type + (list.length !== 1 ? "s" : "");
		if (list.length === 0) {
			console.log(dim(`  0 ${label}s`));
		} else {
			console.log(`  ${list.length} ${label} (${statusBreakdown(list)})`);
		}
	}

	console.log(`  ${graph.edges.length} relationships`);
	console.log("");

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
