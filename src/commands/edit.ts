// arad edit <id>

import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { colorId } from "../display/format.js";
import { ARAD_DIR, requireAradProject } from "../io/files.js";

export function editCommand(id: string): void {
	requireAradProject();

	// Find the file for this entity
	const aradPath = join(process.cwd(), ARAD_DIR);
	const folders = ["requirements", "assumptions", "decisions", "ideas"];

	for (const folder of folders) {
		const folderPath = join(aradPath, folder);
		if (!existsSync(folderPath)) continue;

		const files = readdirSync(folderPath).filter(
			(f) => f.startsWith(id + "-") && f.endsWith(".md"),
		);
		if (files.length > 0) {
			const filePath = join(folderPath, files[0]);
			const editor = process.env.EDITOR || process.env.VISUAL || "vi";
			try {
				execSync(`${editor} "${filePath}"`, { stdio: "inherit" });
			} catch {
				// Editor was interrupted, that's fine
			}
			return;
		}
	}

	console.error(`Entity ${colorId(id)} not found.`);
}
