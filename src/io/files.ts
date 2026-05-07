// File I/O for ARC entities

import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Entity, EntityType } from "../types";
import {
	allDescriptors,
	ENTITY_CONFIG,
	ENTITY_TYPE_ORDER,
} from "../entities/registry";
import { parseEntity, serializeEntity } from "./parser";

export const ARC_DIR = ".arc";

// ─── File-based locking ───
//
// Uses mkdir (atomic on both Windows and POSIX) to acquire a lock.
// Prevents parallel `arc add` commands from computing the same next ID.

const LOCK_DIR = ".lock";
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 5000;

/** Acquire a file-based lock, run `fn`, then release. Retries until timeout. */
export async function withLock<T>(dir: string, fn: () => T | Promise<T>): Promise<T> {
	const lockPath = join(dir, ARC_DIR, LOCK_DIR);
	const deadline = Date.now() + LOCK_TIMEOUT_MS;

	while (true) {
		try {
			mkdirSync(lockPath, { recursive: false });
			break; // acquired
		} catch (e: any) {
			if (e?.code !== "EEXIST") throw e;
			if (Date.now() >= deadline) {
				throw new Error(
					`Timed out acquiring lock after ${LOCK_TIMEOUT_MS}ms. ` +
					`If stale, delete ${lockPath} manually.`,
				);
			}
			await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
		}
	}

	try {
		return await fn();
	} finally {
		try {
			rmSync(lockPath, { recursive: true, force: true });
		} catch {
			// best-effort; lock will be stale but recoverable
		}
	}
}

/** Check if current directory has been initialized */
export function isArcProject(dir: string = process.cwd()): boolean {
	return existsSync(join(dir, ARC_DIR));
}

/** Assert this is an ARC project, exit with message if not */
export function requireArcProject(dir: string = process.cwd()): void {
	if (!isArcProject(dir)) {
		console.error("Not an ARC project. Run `arc init` first.");
		process.exit(1);
	}
}

/** Read all entities from the .arc/ directory */
export function readAllEntities(dir: string = process.cwd()): Entity[] {
	const entities: Entity[] = [];
	const arcPath = join(dir, ARC_DIR);

	for (const type of ENTITY_TYPE_ORDER) {
		const config = ENTITY_CONFIG[type];
		const folder = join(arcPath, config.folder);
		if (!existsSync(folder)) continue;

		const files = readdirSync(folder)
			.filter((f) => f.endsWith(".md"))
			.sort();
		for (const file of files) {
			const filePath = join(folder, file);
			try {
				const content = readFileSync(filePath, "utf-8");
				entities.push(
					parseEntity(content, join(config.folder, file)),
				);
			} catch (e) {
				console.error(
					`  ⚠ Error parsing ${join(config.folder, file)}: ${(e as Error).message}`,
				);
			}
		}
	}

	return entities;
}

/** Determine the next available ID for a given entity type */
export function getNextId(dir: string, type: EntityType): string {
	const arcPath = join(dir, ARC_DIR);
	const config = ENTITY_CONFIG[type];
	const folder = join(arcPath, config.folder);
	const prefix = config.prefix;

	let maxId = 0;
	if (existsSync(folder)) {
		const files = readdirSync(folder).filter((f) => f.endsWith(".md"));
		for (const file of files) {
			const match = file.match(new RegExp(`^${prefix}-(\\d+)`));
			if (match) {
				maxId = Math.max(maxId, parseInt(match[1]));
			}
		}
	}

	return `${prefix}-${String(maxId + 1).padStart(3, "0")}`;
}

/** Convert a title to a filesystem-friendly slug */
export function slugify(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60);
}

/** Write an entity to disk, returns the relative file path */
export function writeEntity(dir: string, entity: Entity): string {
	const arcPath = join(dir, ARC_DIR);
	const config = ENTITY_CONFIG[entity.type];
	const folder = join(arcPath, config.folder);
	mkdirSync(folder, { recursive: true });

	const slug = slugify(entity.title);
	const fileName = `${entity.id}-${slug}.md`;
	const filePath = join(folder, fileName);

	const content = serializeEntity(entity);
	writeFileSync(filePath, content, "utf-8");

	return join(config.folder, fileName);
}

/** Read a single entity by ID */
export function readEntityById(dir: string, id: string): Entity | null {
	const entities = readAllEntities(dir);
	return entities.find((e) => e.id === id) ?? null;
}

/** Update an entity's frontmatter on disk */
export function updateEntity(dir: string, entity: Entity): void {
	// Find the existing file
	const config = ENTITY_CONFIG[entity.type];
	const arcPath = join(dir, ARC_DIR);
	const folder = join(arcPath, config.folder);
	if (!existsSync(folder)) return;

	const files = readdirSync(folder).filter(
		(f) => f.startsWith(entity.id + "-") && f.endsWith(".md"),
	);
	if (files.length === 0) return;

	const existingPath = join(folder, files[0]);
	const existingContent = readFileSync(existingPath, "utf-8");

	// Parse to get body, then rewrite
	const parsed = parseEntity(existingContent, files[0]);
	const updated = { ...entity, body: entity.body || parsed.body };
	const newContent = serializeEntity(updated);

	// If title changed, file name changes too
	const newSlug = slugify(entity.title || parsed.title);
	const newFileName = `${entity.id}-${newSlug}.md`;
	const newPath = join(folder, newFileName);

	if (existingPath !== newPath) {
		unlinkSync(existingPath);
	}
	writeFileSync(newPath, newContent, "utf-8");
}

/** Initialize the .arc/ directory structure */
export function initArcDir(dir: string, name: string): void {
	const arcPath = join(dir, ARC_DIR);
	for (const desc of allDescriptors()) {
		mkdirSync(join(arcPath, desc.folder), { recursive: true });
	}
	writeFileSync(join(arcPath, "arc.yaml"), `name: ${name}\n`, "utf-8");
}
