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
import { ENTITY_CONFIG } from "../types.js";

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
	derivedFrom?: string;
	conflictsWith?: string;
	enables?: string;
	supersedes?: string;
	inspiredBy?: string;
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
	if (!status) status = config.statuses[0];
	if (!config.statuses.includes(status)) {
		console.error(
			`Invalid status "${status}". Must be one of: ${config.statuses.join(", ")}`,
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

	let entity: Entity;

	switch (type) {
		case "requirement": {
			let derivedInput = options?.derivedFrom || "";
			if (!derivedInput && isInteractive) {
				derivedInput = await prompt("Derived from (R-IDs, comma-separated): ");
			}
			const derived = parseIds(derivedInput);

			let conflictsInput = options?.conflictsWith || "";
			if (!conflictsInput && isInteractive) {
				conflictsInput = await prompt(
					"Conflicts with (R-IDs, comma-separated): ",
				);
			}
			const conflicts = parseIds(conflictsInput);

			entity = {
				type: "requirement",
				id,
				title: title.trim(),
				status: status as any,
				date,
				tags,
				derived_from: derived,
				conflicts_with: conflicts,
				body: "",
				filePath: "",
			};
			break;
		}
		case "assumption": {
			entity = {
				type: "assumption",
				id,
				title: title.trim(),
				status: status as any,
				date,
				tags,
				body: "",
				filePath: "",
			};
			break;
		}
		case "decision": {
			let drivenInput = options?.drivenBy || "";
			if (!drivenInput && isInteractive) {
				drivenInput = await prompt("Driven by (R/A-IDs, comma-separated): ");
			}
			const driven_by = parseIds(drivenInput);

			let enablesInput = options?.enables || "";
			if (!enablesInput && isInteractive) {
				enablesInput = await prompt("Enables (D-IDs, comma-separated): ");
			}
			const enables = parseIds(enablesInput);

			let supersedesInput = options?.supersedes || "";
			if (!supersedesInput && isInteractive) {
				supersedesInput = await prompt("Supersedes (D-ID, or empty): ");
			}

			entity = {
				type: "decision",
				id,
				title: title.trim(),
				status: status as any,
				date,
				tags,
				driven_by,
				enables,
				supersedes: supersedesInput.trim() || undefined,
				body: "",
				filePath: "",
			};
			break;
		}
		case "idea": {
			let inspiredInput = options?.inspiredBy || "";
			if (!inspiredInput && isInteractive) {
				inspiredInput = await prompt("Inspired by (IDs, comma-separated): ");
			}
			const inspired_by = parseIds(inspiredInput);

			entity = {
				type: "idea",
				id,
				title: title.trim(),
				status: status as any,
				date,
				tags,
				inspired_by,
				body: "",
				filePath: "",
			};
			break;
		}
	}

	// Open editor for body (only interactive)
	if (isInteractive) {
		const editAnswer = await prompt("Open editor for description? [y/N]: ");
		if (editAnswer.toLowerCase() === "y") {
			const tmpFile = join(process.cwd(), ".arad", `tmp-${id}.md`);
			writeFileSync(tmpFile, config.template(title.trim()), "utf-8");
			try {
				const editor = process.env.EDITOR || process.env.VISUAL || "vi";
				execSync(`${editor} "${tmpFile}"`, { stdio: "inherit" });
				entity.body = readFileSync(tmpFile, "utf-8").trim();
			} finally {
				if (existsSync(tmpFile)) unlinkSync(tmpFile);
			}
		} else {
			entity.body = config.template(title.trim());
		}
	} else {
		entity.body = config.template(title.trim());
	}

	const relPath = writeEntity(process.cwd(), entity);
	console.log(`\nCreated ${id}: ${title.trim()}`);
	console.log(`  .arad/${relPath}`);
}
