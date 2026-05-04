// arad remove <id> — delete an entity with dangling ref cleanup
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { colorId, dim, red, yellow } from "../display/format.js";
import { buildGraph, getDependents } from "../graph/graph.js";
import {
	readAllEntities,
	requireAradProject,
	updateEntity,
} from "../io/files.js";
import type { Entity } from "../types.js";
import { cleanRefs } from "../entities/registry.js";
import { ENTITY_CONFIG } from "../entities/registry.js";

export function removeCommand(
	id: string,
	options?: { force?: boolean; clean?: boolean },
): void {
	requireAradProject();

	const entities = readAllEntities();
	const entity = entities.find((e) => e.id === id);
	if (!entity) {
		console.error(`Entity ${colorId(id)} not found.`);
		process.exit(1);
	}

	const graph = buildGraph(entities);

	// Check who depends on this entity
	const dependents = getDependents(graph, id);

	if (dependents.length > 0 && !options?.force) {
		console.error(
			yellow(
				`⚠ ${colorId(id)} is referenced by ${dependents.length} other entities:`,
			),
		);
		for (const dep of dependents) {
			console.error(`  ${colorId(dep.id)} "${dep.title}"`);
		}
		console.error("");
		console.error(
			`Use --force to remove anyway (will leave dangling references).`,
		);
		console.error(
			`Or use --clean to also remove references from dependent entities.`,
		);
		process.exit(1);
	}

	// Clean up references from other entities
	if (options?.force || options?.clean) {
		if (options?.clean) {
			cleanReferences(entity, entities);
		}
		// Remove the file
		removeFile(entity);
		console.log(red(`✗ Removed ${colorId(id)}: ${entity.title}`));
	}
}

function cleanReferences(removed: Entity, allEntities: Entity[]): void {
	const removedId = removed.id;

	for (const entity of allEntities) {
		if (entity.id === removedId) continue;
		const changed = cleanRefs(entity, removedId);
		if (changed) {
			updateEntity(process.cwd(), entity);
			console.log(dim(`  Cleaned references in ${colorId(entity.id)}`));
		}
	}
}

function removeFile(entity: Entity): void {
	const config = ENTITY_CONFIG[entity.type];
	const aradPath = join(process.cwd(), ".arad");
	const folder = join(aradPath, config.folder);

	if (!existsSync(folder)) return;

	const files = readdirSync(folder).filter(
		(f) => f.startsWith(entity.id + "-") && f.endsWith(".md"),
	);
	for (const file of files) {
		unlinkSync(join(folder, file));
	}
}
