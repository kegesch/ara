// arc init
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ARC_DIR, initArcDir } from "../io/files.js";
import { allDescriptors } from "../entities/registry.js";

export function initCommand(): void {
	const dir = process.cwd();
	const arcPath = join(dir, ARC_DIR);

	if (existsSync(arcPath)) {
		console.log("Already an ARC project.");
		return;
	}

	const projectName = dir.split(/[/\\]/).pop() ?? "project";
	initArcDir(dir, projectName);

	console.log(`Initialized ARC project "${projectName}":`);
	console.log(`  ${ARC_DIR}/`);
	console.log(`    arc.yaml`);
	for (const desc of allDescriptors()) {
		console.log(`    ${desc.folder}/`);
	}
	console.log("");
	console.log("Commit .arc/ to git — it lives alongside your code.");
}
