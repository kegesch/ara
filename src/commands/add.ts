// arad add <type> [title]

import { execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	getNextId,
	readAllEntities,
	requireAradProject,
	writeEntity,
} from "../io/files.js";
import type { Entity, EntityType } from "../types.js";
import { getDescriptor, ENTITY_CONFIG } from "../entities/registry.js";
import type { RawFrontmatter } from "../entities/descriptor.js";

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
	const id = getNextId(process.cwd(), type);
	const date = new Date().toISOString().split("T")[0];

	// Status
	let status = options?.status?.trim() || "";
	if (!status && isInteractive) {
		status = await prompt(
			`Status (${config.statuses.join("/")}) [${config.statuses[0]}]: `,
			config.statuses[0],
		);
	}
	if (!status) status = desc.defaultStatus;
	if (!desc.statuses.includes(status)) {
		console.error(
			`Invalid status "${status}". Must be one of: ${desc.statuses.join(", ")}`,
		);
		return;
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

	// Build a RawFrontmatter from the CLI options to feed to the descriptor's parse
	const meta: RawFrontmatter = {
		id,
		title: title.trim(),
		status,
		date,
		tags,
		context: context || undefined,
	};

	// Type-specific prompt/field handling
	switch (type) {
		case "requirement": {
			let derivedInput = options?.derivedFrom || "";
			if (!derivedInput && isInteractive) {
				derivedInput = await prompt("Derived from (R-IDs, comma-separated): ");
			}
			meta.derived_from = parseIds(derivedInput);

			let conflictsInput = options?.conflictsWith || "";
			if (!conflictsInput && isInteractive) {
				conflictsInput = await prompt(
					"Conflicts with (R-IDs, comma-separated): ",
				);
			}
			meta.conflicts_with = parseIds(conflictsInput);
			meta.requested_by = [];
			break;
		}
		case "decision": {
			let drivenInput = options?.drivenBy || "";
			if (!drivenInput && isInteractive) {
				drivenInput = await prompt("Driven by (R/A-IDs, comma-separated): ");
			}
			meta.driven_by = parseIds(drivenInput);

			let enablesInput = options?.enables || "";
			if (!enablesInput && isInteractive) {
				enablesInput = await prompt("Enables (D-IDs, comma-separated): ");
			}
			meta.enables = parseIds(enablesInput);

			let supersedesInput = options?.supersedes || "";
			if (!supersedesInput && isInteractive) {
				supersedesInput = await prompt("Supersedes (D-ID, or empty): ");
			}
			meta.supersedes = supersedesInput.trim() || undefined;
			meta.affects = [];
			break;
		}
		case "idea": {
			let inspiredInput = options?.inspiredBy || "";
			if (!inspiredInput && isInteractive) {
				inspiredInput = await prompt("Inspired by (IDs, comma-separated): ");
			}
			meta.inspired_by = parseIds(inspiredInput);
			break;
		}
		case "risk": {
			meta.mitigated_by = [];
			break;
		}
	}

	const base = {
		id,
		title: title.trim(),
		date,
		tags,
		body: "",
		filePath: "",
		context: context || undefined,
	};

	// Use descriptor to construct the entity
	const entity: Entity = desc.parse(meta, base);

	// Resolve body content
	const templateBody = config.template(title.trim());

	if (options?.bodyFile) {
		// --body-file takes precedence
		if (options.bodyFile === "-") {
			// Read from stdin
			const chunks: Buffer[] = [];
			for await (const chunk of process.stdin) {
				chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
			}
			entity.body =
				Buffer.concat(chunks).toString("utf-8").trim() || templateBody;
		} else {
			const resolvedPath = join(process.cwd(), options.bodyFile);
			if (!existsSync(resolvedPath)) {
				console.error(`Body file not found: ${options.bodyFile}`);
				process.exit(1);
			}
			entity.body = readFileSync(resolvedPath, "utf-8").trim();
		}
	} else if (options?.body) {
		// --body inline
		entity.body = options.body;
	} else if (isInteractive) {
		// Interactive: offer editor
		const editAnswer = await prompt("Open editor for description? [y/N]: ");
		if (editAnswer.toLowerCase() === "y") {
			const tmpFile = join(process.cwd(), ".arad", `tmp-${id}.md`);
			writeFileSync(tmpFile, templateBody, "utf-8");
			try {
				const editor = process.env.EDITOR || process.env.VISUAL || "vi";
				execSync(`${editor} "${tmpFile}"`, { stdio: "inherit" });
				entity.body = readFileSync(tmpFile, "utf-8").trim();
			} finally {
				if (existsSync(tmpFile)) unlinkSync(tmpFile);
			}
		} else {
			entity.body = templateBody;
		}
	} else {
		entity.body = templateBody;
	}

	const relPath = writeEntity(process.cwd(), entity);
	console.log(`\nCreated ${id}: ${title.trim()}`);
	console.log(`  .arad/${relPath}`);
}
