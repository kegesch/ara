import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { skillCommand } from "../src/commands/skill";

const TMP = join(import.meta.dir, "_tmp_skill");

beforeEach(() => {
	mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

describe("skill command", () => {
	test("outputs skill file to stdout", () => {
		// skillCommand writes to process.stdout by default
		// We capture stdout by temporarily overriding write
		const originalDir = process.cwd();
		try {
			process.chdir(TMP);

			// Capture stdout
			let output = "";
			const originalWrite = process.stdout.write.bind(process.stdout);
			process.stdout.write = (chunk: string | Buffer | Uint8Array) => {
				if (typeof chunk === "string") output += chunk;
				else output += Buffer.from(chunk).toString();
				return true;
			};

			skillCommand({ install: false });

			process.stdout.write = originalWrite;

			// Should contain the skill file content
			expect(output).toContain("ARC");
			expect(output).toContain("Architecture, Requirements, Assumptions, Decisions");
			expect(output).toContain("arc add requirement");
			expect(output).toContain("arc add decision");
			expect(output).toContain("arc check");
		} finally {
			process.chdir(originalDir);
		}
	});

	test("installs skill file to .hermes/skills/arc/", () => {
		const originalDir = process.cwd();
		try {
			process.chdir(TMP);

			skillCommand({ install: true });

			const targetPath = join(TMP, ".hermes", "skills", "arc", "SKILL.md");
			expect(existsSync(targetPath)).toBe(true);

			const content = readFileSync(targetPath, "utf-8");
			expect(content).toContain("ARC");
			expect(content).toContain("arc add requirement");
			expect(content).toContain("arc add decision");
		} finally {
			process.chdir(originalDir);
		}
	});

	test("overwrites existing skill file on install", () => {
		const originalDir = process.cwd();
		try {
			process.chdir(TMP);

			// Create existing .hermes/skills/arc/SKILL.md with old content
			const targetDir = join(TMP, ".hermes", "skills", "arc");
			mkdirSync(targetDir, { recursive: true });
			writeFileSync(join(targetDir, "SKILL.md"), "OLD CONTENT", "utf-8");

			skillCommand({ install: true });

			const content = readFileSync(
				join(targetDir, "SKILL.md"),
				"utf-8",
			);
			// Should be overwritten, not old content
			expect(content).not.toBe("OLD CONTENT");
			expect(content).toContain("ARC");
		} finally {
			process.chdir(originalDir);
		}
	});

	test("skill file contains all seven entity types", () => {
		const originalDir = process.cwd();
		try {
			process.chdir(TMP);

			let output = "";
			const originalWrite = process.stdout.write.bind(process.stdout);
			process.stdout.write = (chunk: string | Buffer | Uint8Array) => {
				if (typeof chunk === "string") output += chunk;
				else output += Buffer.from(chunk).toString();
				return true;
			};

			skillCommand({ install: false });

			process.stdout.write = originalWrite;

			// Should document all 7 entity types
			expect(output).toContain("Requirement");
			expect(output).toContain("Assumption");
			expect(output).toContain("Decision");
			expect(output).toContain("Idea");
			expect(output).toContain("Stakeholder");
			expect(output).toContain("Risk");
			expect(output).toContain("Term");
		} finally {
			process.chdir(originalDir);
		}
	});

	test("skill file does not contain MCP references", () => {
		const originalDir = process.cwd();
		try {
			process.chdir(TMP);

			let output = "";
			const originalWrite = process.stdout.write.bind(process.stdout);
			process.stdout.write = (chunk: string | Buffer | Uint8Array) => {
				if (typeof chunk === "string") output += chunk;
				else output += Buffer.from(chunk).toString();
				return true;
			};

			skillCommand({ install: false });

			process.stdout.write = originalWrite;

			// Should NOT mention MCP server (removed in D-033)
			expect(output).not.toContain("arc mcp");
			expect(output).not.toContain("MCP server");
		} finally {
			process.chdir(originalDir);
		}
	});
});