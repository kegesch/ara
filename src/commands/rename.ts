// arad rename <id> <new-id> [--title "New title"]
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { colorId, dim, green, yellow } from "../display/format.js";
import {
	isAradProject,
	readAllEntities,
	requireAradProject,
	updateEntity,
	writeEntity,
} from "../io/files.js";
import type { Entity, EntityType } from "../types.js";
import { ENTITY_CONFIG, renameRefs } from "../entities/registry.js";
import { getTypeFromId } from "../types.js";
import {
	EntityAlreadyExists,
	EntityNotFound,
	NotAnAradProject,
	TypeMismatch,
} from "../core/errors.js";

// ─── Pure logic ───

export interface RenameOptions {
	title?: string;
}

export interface RenameResult {
	oldId: string;
	newId: string;
	entity: Entity;
	updatedRefs: number;
}

/**
 * Rename an entity, updating all references across the project.
 */
export function performRename(
	dir: string,
	id: string,
	newId: string,
	options?: RenameOptions,
): RenameResult {
	if (!isAradProject(dir)) throw new NotAnAradProject();

	const entities = readAllEntities(dir);
	const entity = entities.find((e) => e.id === id);
	if (!entity) throw new EntityNotFound(id);

	// Validate new ID type matches
	const newType = getTypeFromId(newId);
	if (newType !== entity.type) {
		throw new TypeMismatch(id, entity.type, newId, newType);
	}

	// Check new ID doesn't already exist
	if (entities.some((e) => e.id === newId)) {
		throw new EntityAlreadyExists(newId);
	}

	const oldId = entity.id;

	// Update title if provided
	if (options?.title) {
		entity.title = options.title.trim();
	}

	// Update ID
	entity.id = newId;

	// Remove old file, write new one
	removeOldFile(dir, oldId, entity.type);
	writeEntity(dir, entity);

	// Update references in all other entities
	let updatedRefs = 0;
	for (const other of entities) {
		if (other.id === newId) continue;
		const changed = renameRefs(other, oldId, newId);
		if (changed) {
			updateEntity(dir, other);
			updatedRefs++;
		}
	}

	return { oldId, newId, entity, updatedRefs };
}

function removeOldFile(dir: string, oldId: string, type: EntityType): void {
	const config = ENTITY_CONFIG[type];
	const aradPath = join(dir, ".arad");
	const folder = join(aradPath, config.folder);
	if (!existsSync(folder)) return;

	const files = readdirSync(folder).filter(
		(f) => f.startsWith(oldId + "-") && f.endsWith(".md"),
	);
	for (const file of files) {
		unlinkSync(join(folder, file));
	}
}

// ─── CLI entry point ───

export function renameCommand(
	id: string,
	newId: string,
	options?: RenameOptions,
): void {
	requireAradProject();

	try {
		const result = performRename(process.cwd(), id, newId, options);

		console.log(
			green(`✓ Renamed ${colorId(result.oldId)} → ${colorId(result.newId)}`),
		);
		if (options?.title) {
			console.log(dim(`  Title: "${options.title}"`));
		}
		if (result.updatedRefs > 0) {
			console.log(
				dim(`  Updated ${result.updatedRefs} reference(s) in other entities`),
			);
		}
	} catch (e) {
		if (e instanceof EntityNotFound) {
			console.error(`Entity ${colorId(id)} not found.`);
			process.exit(1);
		}
		if (e instanceof TypeMismatch) {
			console.error(yellow(e.message));
			process.exit(1);
		}
		if (e instanceof EntityAlreadyExists) {
			console.error(yellow(`Entity ${colorId(newId)} already exists.`));
			process.exit(1);
		}
		if (e instanceof Error && e.message.startsWith("Invalid new ID")) {
			console.error(e.message);
			process.exit(1);
		}
		throw e;
	}
}
