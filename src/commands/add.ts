// arad add <type> [title]

import { execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	getNextId,
	isAradProject,
	readAllEntities,
	readEntityById,
	requireAradProject,
	updateEntity,
	withLock,
	writeEntity,
} from "../io/files.js";
import type { Entity, EntityType } from "../types.js";
import { getDescriptor, ENTITY_CONFIG } from "../entities/registry.js";
import type { RawFrontmatter } from "../entities/descriptor.js";
import { InvalidStatus, NotAnAradProject, ValidationError } from "../core/errors.js";

function readline(): Promise<string> {
	return new Promise((resolve) => {
		process.stdin.setRawMode(false);
		const rl = require("node:readline").createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		rl.question("", (answer: string) => {
			rl.close();
			resolve(answer);
		});
	});
}

async function prompt(
	question: string,
	fallback: string = "",
): Promise<string> {
	if (!process.stdin.isTTY) return fallback;
	process.stdout.write(question);
	const answer = await readline();
	return answer.trim() || fallback;
}

// ─── Pure logic types ───

export interface CreateEntityInput {
	type: EntityType;
	title: string;
	status?: string;
	tags?: string[];
	context?: string;
	drivenBy?: string[];
	derivedFrom?: string[];
	conflictsWith?: string[];
	enables?: string[];
	supersedes?: string;
	inspiredBy?: string[];
	body?: string;
}

export interface CreateEntityResult {
	entity: Entity;
	path: string;
}

// ─── Pure logic: create entity ───

/**
 * Create a new entity and write it to disk.
 *
 * Returns the created entity and its relative path.
 * Throws InvalidStatus if status is not valid for the type.
 * Throws ValidationError for missing required fields.
 */
export function createEntity(
	dir: string,
	input: CreateEntityInput,
): CreateEntityResult {
	if (!isAradProject(dir)) throw new NotAnAradProject();

	if (!input.title.trim()) {
		throw new ValidationError("Title is required.");
	}

	const desc = getDescriptor(input.type);
	const id = getNextId(dir, input.type);
	const date = new Date().toISOString().split("T")[0];

	// Validate status
	const status = input.status?.trim() || desc.defaultStatus;
	if (!desc.statuses.includes(status)) {
		throw new InvalidStatus(status, desc.statuses);
	}

	// Validate referenced IDs
	const allEntities = readAllEntities(dir);
	const entityIds = new Set(allEntities.map((e) => e.id));

	function validateIds(ids: string[]): string[] {
		// Just return them — dangling refs are allowed (the CLI warns)
		return ids;
	}

	// Build frontmatter
	const tags = input.tags ?? [];

	const meta: RawFrontmatter = {
		id,
		title: input.title.trim(),
		status,
		date,
		tags,
		context: input.context || undefined,
	};

	// Type-specific fields
	switch (input.type) {
		case "requirement":
			meta.derived_from = validateIds(input.derivedFrom ?? []);
			meta.conflicts_with = validateIds(input.conflictsWith ?? []);
			meta.requested_by = [];
			break;
		case "decision":
			meta.driven_by = validateIds(input.drivenBy ?? []);
			meta.enables = validateIds(input.enables ?? []);
			meta.supersedes = input.supersedes?.trim() || undefined;
			meta.affects = [];
			break;
		case "idea":
			meta.inspired_by = validateIds(input.inspiredBy ?? []);
			break;
		case "risk":
			meta.mitigated_by = [];
			break;
	}

	const base = {
		id,
		title: input.title.trim(),
		date,
		tags,
		body: input.body ?? "",
		filePath: "",
		context: input.context || undefined,
	};

	const entity: Entity = desc.parse(meta, base);

	// Resolve body content
	if (!entity.body) {
		const config = ENTITY_CONFIG[input.type];
		entity.body = config.template(input.title.trim());
	}

	const relPath = writeEntity(dir, entity);

	// If this decision supersedes another, auto-mark the old one as superseded
	if (input.type === "decision" && input.supersedes?.trim()) {
		const oldEntity = readEntityById(dir, input.supersedes.trim());
		if (oldEntity && oldEntity.type === "decision" && oldEntity.status !== "superseded") {
			oldEntity.status = "superseded";
			updateEntity(dir, oldEntity);
		}
	}

	return { entity, path: relPath };
}

// ─── CLI entry point ───

interface AddOptions {
	drivenBy?: string;
	status?: string;
	tags?: string;
	context?: string;
	derivedFrom?: string;
	conflictsWith?: string;
	enables?: string;
	supersedes?: string;
	inspiredBy?: string;
	body?: string;
	bodyFile?: string;
}

export async function addCommand(
	type: EntityType,
	titleArg?: string,
	options?: AddOptions,
): Promise<void> {
	requireAradProject();

	const isInteractive = !!process.stdin.isTTY;

	// Title
	if (!titleArg && !isInteractive) {
		console.error("Title is required in non-interactive mode.");
		console.error('Usage: arad add <type> "Title here"');
		process.exit(1);
	}
	let title = titleArg ?? "";
	if (!title && isInteractive) {
		title = await prompt("Title: ");
	}
	if (!title) {
		console.error("Title is required.");
		return;
	}

	const desc = getDescriptor(type);
	const config = ENTITY_CONFIG[type];

	// Status
	let status = options?.status?.trim() || "";
	if (!status && isInteractive) {
		status = await prompt(
			`Status (${config.statuses.join("/")}) [${config.statuses[0]}]: `,
			config.statuses[0],
		);
	}

	// Tags
	let tagsInput = options?.tags || "";
	if (!tagsInput && isInteractive) {
		tagsInput = await prompt("Tags (comma-separated): ");
	}
	const tags = tagsInput
		? tagsInput
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean)
		: [];

	// Context
	let context = options?.context?.trim() || "";
	if (!context && isInteractive) {
		context = await prompt("Context (e.g. billing, fulfillment): ");
	}

	// Validate referenced IDs
	const allEntities = readAllEntities();
	const entityIds = new Set(allEntities.map((e) => e.id));

	function validateIds(ids: string[]): string[] {
		const invalid = ids.filter((id) => !entityIds.has(id));
		if (invalid.length > 0) {
			console.error(
				`  ⚠ Unknown IDs: ${invalid.join(", ")} (saved as dangling references)`,
			);
		}
		return ids;
	}

	function parseIds(input: string): string[] {
		return input
			? validateIds(
					input
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean),
				)
			: [];
	}

	// Type-specific prompts
	let drivenBy: string[] | undefined;
	let derivedFrom: string[] | undefined;
	let conflictsWith: string[] | undefined;
	let enables: string[] | undefined;
	let supersedes: string | undefined;
	let inspiredBy: string[] | undefined;

	switch (type) {
		case "requirement": {
			let derivedInput = options?.derivedFrom || "";
			if (!derivedInput && isInteractive) {
				derivedInput = await prompt("Derived from (R-IDs, comma-separated): ");
			}
			derivedFrom = parseIds(derivedInput);

			let conflictsInput = options?.conflictsWith || "";
			if (!conflictsInput && isInteractive) {
				conflictsInput = await prompt(
					"Conflicts with (R-IDs, comma-separated): ",
				);
			}
			conflictsWith = parseIds(conflictsInput);
			break;
		}
		case "decision": {
			let drivenInput = options?.drivenBy || "";
			if (!drivenInput && isInteractive) {
				drivenInput = await prompt("Driven by (R/A-IDs, comma-separated): ");
			}
			drivenBy = parseIds(drivenInput);

			let enablesInput = options?.enables || "";
			if (!enablesInput && isInteractive) {
				enablesInput = await prompt("Enables (D-IDs, comma-separated): ");
			}
			enables = parseIds(enablesInput);

			let supersedesInput = options?.supersedes || "";
			if (!supersedesInput && isInteractive) {
				supersedesInput = await prompt("Supersedes (D-ID, or empty): ");
			}
			supersedes = supersedesInput.trim() || undefined;
			break;
		}
		case "idea": {
			let inspiredInput = options?.inspiredBy || "";
			if (!inspiredInput && isInteractive) {
				inspiredInput = await prompt("Inspired by (IDs, comma-separated): ");
			}
			inspiredBy = parseIds(inspiredInput);
			break;
		}
	}

	// Resolve body content
	let body: string | undefined;
	const templateBody = config.template(title.trim());

	if (options?.bodyFile) {
		if (options.bodyFile === "-") {
			const chunks: Buffer[] = [];
			for await (const chunk of process.stdin) {
				chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
			}
			body =
				Buffer.concat(chunks).toString("utf-8").trim() || templateBody;
		} else {
			const resolvedPath = join(process.cwd(), options.bodyFile);
			if (!existsSync(resolvedPath)) {
				console.error(`Body file not found: ${options.bodyFile}`);
				process.exit(1);
			}
			body = readFileSync(resolvedPath, "utf-8").trim();
		}
	} else if (options?.body) {
		body = options.body;
	} else if (isInteractive) {
		const editAnswer = await prompt("Open editor for description? [y/N]: ");
		if (editAnswer.toLowerCase() === "y") {
			const tmpId = getNextId(process.cwd(), type);
			const tmpFile = join(process.cwd(), ".arad", `tmp-${tmpId}.md`);
			writeFileSync(tmpFile, templateBody, "utf-8");
			try {
				const editor = process.env.EDITOR || process.env.VISUAL || "vi";
				execSync(`${editor} "${tmpFile}"`, { stdio: "inherit" });
				body = readFileSync(tmpFile, "utf-8").trim();
			} finally {
				if (existsSync(tmpFile)) unlinkSync(tmpFile);
			}
		}
	}

	// Call pure function inside a lock to prevent parallel ID collisions
	const result = await withLock(process.cwd(), () =>
		createEntity(process.cwd(), {
			type,
			title,
			status: status || undefined,
			tags,
			context: context || undefined,
			drivenBy,
			derivedFrom,
			conflictsWith,
			enables,
			supersedes,
			inspiredBy,
			body,
		}),
	);

	console.log(`\nCreated ${result.entity.id}: ${title.trim()}`);
	console.log(`  .arad/${result.path}`);
}
