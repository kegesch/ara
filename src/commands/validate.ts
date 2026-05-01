// arad validate/invalidate/promote <id>

import {
	colorId,
	dim,
	formatEntityBrief,
	green,
	red,
	yellow,
} from "../display/format.js";
import { buildGraph, getDependents, impactAnalysis } from "../graph/graph.js";
import {
	readAllEntities,
	requireAradProject,
	updateEntity,
} from "../io/files.js";
import type { Assumption, Entity, Idea } from "../types.js";

export function validateCommand(id: string): void {
	requireAradProject();
	const entities = readAllEntities();
	const entity = entities.find((e) => e.id === id);

	if (!entity) {
		console.error(`Entity ${colorId(id)} not found.`);
		return;
	}

	if (entity.type !== "assumption") {
		console.error(
			`${colorId(id)} is a ${entity.type}, not an assumption. Only assumptions can be validated.`,
		);
		return;
	}

	if (entity.status === "validated") {
		console.log(`${colorId(id)} is already validated.`);
		return;
	}

	entity.status = "validated";
	updateEntity(process.cwd(), entity);
	console.log(green(`✓ Validated ${colorId(id)}: ${entity.title}`));
}

export function invalidateCommand(id: string): void {
	requireAradProject();
	const entities = readAllEntities();
	const graph = buildGraph(entities);
	const entity = entities.find((e) => e.id === id);

	if (!entity) {
		console.error(`Entity ${colorId(id)} not found.`);
		return;
	}

	if (entity.type !== "assumption") {
		console.error(
			`${colorId(id)} is a ${entity.type}, not an assumption. Only assumptions can be invalidated.`,
		);
		return;
	}

	if (entity.status === "invalidated") {
		console.log(`${colorId(id)} is already invalidated.`);
		return;
	}

	entity.status = "invalidated";
	updateEntity(process.cwd(), entity);

	console.log(red(`✗ Invalidated ${colorId(id)}: ${entity.title}`));

	// Show impact
	const { direct, transitive } = impactAnalysis(graph, id);
	if (direct.length > 0) {
		console.log("");
		console.log(yellow("Affected decisions:"));
		for (const dep of direct) {
			console.log(`  ${formatEntityBrief(dep)}`);
		}
		if (transitive.length > 0) {
			for (const dep of transitive) {
				console.log(`  ${formatEntityBrief(dep)}`);
			}
		}
		console.log("");
		console.log(
			yellow(`⚠ ${direct.length + transitive.length} entities may need review`),
		);
	}
}

export function promoteCommand(id: string): void {
	requireAradProject();
	const entities = readAllEntities();
	const entity = entities.find((e) => e.id === id);

	if (!entity) {
		console.error(`Entity ${colorId(id)} not found.`);
		return;
	}

	if (entity.type === "assumption") {
		promoteAssumption(entity, entities);
	} else if (entity.type === "idea") {
		promoteIdea(entity);
	} else {
		console.error(
			`${colorId(id)} is a ${entity.type}, not an assumption or idea. Only assumptions and ideas can be promoted.`,
		);
	}
}

function promoteAssumption(entity: Assumption, entities: Entity[]): void {
	if (entity.status !== "validated") {
		console.error(
			`${colorId(entity.id)} must be validated before it can be promoted to a requirement.`,
		);
		console.log(`  Run: arad validate ${entity.id}`);
		return;
	}

	const { getNextId, writeEntity } =
		require("../io/files.js") as typeof import("../io/files.js");
	const newId = getNextId(process.cwd(), "requirement");

	const requirement = {
		type: "requirement" as const,
		id: newId,
		title: entity.title,
		status: "accepted" as const,
		date: new Date().toISOString().split("T")[0],
		tags: [...entity.tags],
		derived_from: [],
		conflicts_with: [],
		body: entity.body,
		filePath: "",
	};

	writeEntity(process.cwd(), requirement);

	entity.promoted_to = newId;
	updateEntity(process.cwd(), entity);

	// Auto-link: find all decisions driven by this assumption and add the new requirement
	const graph = buildGraph(entities);
	const dependents = getDependents(graph, entity.id);
	let linkedCount = 0;
	for (const dep of dependents) {
		if (
			dep.type === "decision" &&
			dep.driven_by &&
			!dep.driven_by.includes(newId)
		) {
			dep.driven_by.push(newId);
			updateEntity(process.cwd(), dep);
			linkedCount++;
		}
	}

	console.log(green(`✓ Promoted ${colorId(entity.id)} → ${colorId(newId)}`));
	console.log(`  Assumption "${entity.title}" is now requirement ${newId}`);
	if (linkedCount > 0) {
		console.log(
			dim(`  Auto-linked ${linkedCount} dependent decision(s) to ${newId}`),
		);
	}
}

function promoteIdea(entity: Idea): void {
	// Determine target type based on CLI args or default to requirement
	// The --to flag is parsed in index.ts and passed via environment or default
	// For now, default to requirement. The CLI `arad promote I-001 --to decision` is handled below.
	const targetType =
		(process.env.__ARAD_PROMOTE_TO as "requirement" | "decision") ||
		"requirement";

	const { getNextId, writeEntity } =
		require("../io/files.js") as typeof import("../io/files.js");
	const newId = getNextId(process.cwd(), targetType);

	if (targetType === "requirement") {
		const requirement = {
			type: "requirement" as const,
			id: newId,
			title: entity.title,
			status: "draft" as const,
			date: new Date().toISOString().split("T")[0],
			tags: [...entity.tags],
			derived_from: [],
			conflicts_with: [],
			body: entity.body,
			filePath: "",
		};
		writeEntity(process.cwd(), requirement);
		entity.promoted_to = newId;
		entity.status = "promoted";
		updateEntity(process.cwd(), entity);
		console.log(
			green(
				`✓ Promoted ${colorId(entity.id)} → ${colorId(newId)} (requirement)`,
			),
		);
	} else {
		const decision = {
			type: "decision" as const,
			id: newId,
			title: entity.title,
			status: "proposed" as const,
			date: new Date().toISOString().split("T")[0],
			tags: [...entity.tags],
			driven_by: [],
			enables: [],
			body: entity.body,
			filePath: "",
		};
		writeEntity(process.cwd(), decision);
		entity.promoted_to = newId;
		entity.status = "promoted";
		updateEntity(process.cwd(), entity);
		console.log(
			green(`✓ Promoted ${colorId(entity.id)} → ${colorId(newId)} (decision)`),
		);
	}

	console.log(`  Idea "${entity.title}" graduated to ${targetType} ${newId}`);
}
