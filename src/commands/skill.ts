// arc skill — output or install the skill file for AI agents
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_FILENAME = "SKILL.md";

/**
 * Resolve the path to the bundled skill file.
 * Works both in dev (bun run src/index.ts) and compiled binary.
 */
function resolveSkillPath(): string {
	// In compiled binary, __dirname is the directory of the binary.
	// In dev, use import.meta to resolve relative to this source file.
	const thisDir = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		// Compiled binary: skill/ is next to src/
		join(thisDir, "..", "skill", "arc", SKILL_FILENAME),
		// Dev mode: skill/ is at project root
		join(thisDir, "..", "..", "skill", "arc", SKILL_FILENAME),
	];

	for (const path of candidates) {
		if (existsSync(path)) return path;
	}

	throw new Error(
		`Cannot find ${SKILL_FILENAME}. Tried: ${candidates.join(", ")}`,
	);
}

/**
 * Read the skill file content.
 */
function readSkillContent(): string {
	const skillPath = resolveSkillPath();
	return readFileSync(skillPath, "utf-8");
}

// ─── CLI entry point ───

export function skillCommand(opts: { install?: boolean }): void {
	const content = readSkillContent();

	if (opts.install) {
		// Install into .hermes/skills/arc/SKILL.md in the current project
		const cwd = process.cwd();
		const targetDir = join(cwd, ".hermes", "skills", "arc");
		const targetPath = join(targetDir, SKILL_FILENAME);

		if (existsSync(targetPath)) {
			console.log(`Skill file already exists at ${targetPath}`);
			console.log("Overwriting...");
		}

		mkdirSync(targetDir, { recursive: true });
		writeFileSync(targetPath, content, "utf-8");
		console.log(`Skill file installed to ${targetPath}`);
		console.log("");
		console.log("Agents with access to this project will now understand ARC.");
		return;
	}

	// Default: print to stdout
	process.stdout.write(content);
}