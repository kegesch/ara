// arad remove <id> — delete an entity with dangling ref cleanup
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { colorId, dim, red, yellow } from "../display/format.js";
import { buildGraph, getDependents } from "../graph/graph.js";
import {
	isAradProject,
	readAllEntities,
	requireAradProject,
	updateEntity,
} from "../io/files.js";
import type { Entity, EntityType } from "../types.js";
import { cleanRefs, ENTITY_CONFIG } from "../entities/registry.js";
import {
	EntityNotFound,
	HasDependents,
	NotAnAradProject,
} from "../core/errors.js";

// ─── Pure logic ───

export interface RemoveOptions {
	force?: boolean;
	clean?: boolean;
}

export interface RemoveResult {
	removed: Entity;
	cleanedRefs: string[]; // IDs of entities that had references cleaned
}

/**
 * Remove an entity from the project.
 *
 * - If the entity has dependents and neither `force` nor `clean` is set, throws HasDependents.
 * - If `clean` is set, removes references from all dependent entities.
 * - Returns the removed entity and list of cleaned entity IDs.
 */
export function performRemove(
	dir: string,
	id: string,
	options?: RemoveOptions,
): RemoveResult {
	if (!isAradProject(dir)) throw new NotAnAradProject();

	const entities = readAllEntities(dir);
	const entity = entities.find((e) => e.id === id);
	if (!entity) throw new EntityNotFound(id);

	const graph = buildGraph(entities);
	const dependents = getDependents(graph, id);

	if (dependents.length > 0 && !options?.force && !options?.clean) {
		throw new HasDependents(
			id,
			dependents.map((d) => ({ id: d.id, title: d.title })),
		);
	}

	const cleanedRefs: string[] = [];

	if (options?.force || options?.clean) {
		if (options?.clean) {
			for (const other of entities) {
				if (other.id === id) continue;
				const changed = cleanRefs(other, id);
				if (changed) {
					updateEntity(dir, other);
					cleanedRefs.push(other.id);
				}
			}
		}
		removeFile(dir, entity);
	}

	return { removed: entity, cleanedRefs };
}

function removeFile(dir: string, entity: Entity): void {
	const config = ENTITY_CONFIG[entity.type];
	const aradPath = join(dir, ".arad");
	const folder = join(aradPath, config.folder);

	if (!existsSync(folder)) return;

	const files = readdirSync(folder).filter(
		(f) => f.startsWith(entity.id + "-") && f.endsWith(".md"),
	);
	for (const file of files) {
		unlinkSync(join(folder, file));
	}
}

// ─── CLI entry point ───

export function removeCommand(
	id: string,
	options?: RemoveOptions,
): void {
	requireAradProject();

	try {
		const result = performRemove(process.cwd(), id, options);

		console.log(
			red(`✗ Removed ${colorId(result.removed.id)}: ${result.removed.title}`),
		);
		for (const ref of result.cleanedRefs) {
			console.log(dim(`  Cleaned references in ${colorId(ref)}`));
		}
	} catch (e) {
		if (e instanceof HasDependents) {
			console.error(
				yellow(`⚠ ${colorId(e.entityId)} is referenced by ${e.dependentIds.length} other entities:`),
			);
			// Re-read to show details
			const entities = readAllEntities();
			const graph = buildGraph(entities);
			const dependents = getDependents(graph, id);
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
		if (e instanceof EntityNotFound) {
			console.error(`Entity ${colorId(id)} not found.`);
			process.exit(1);
		}
		throw e;
	}
}
