#!/usr/bin/env bun
// ARAD — Architecture, Requirements, Assumptions, Decisions
// CLI entry point

import { Command } from "commander";
import { addCommand } from "./commands/add.js";
import { checkCommand } from "./commands/check.js";
import { editCommand } from "./commands/edit.js";
import { graphCommand } from "./commands/graph.js";
import { impactCommand } from "./commands/impact.js";
import { importCommand } from "./commands/import.js";
import { initCommand } from "./commands/init.js";
import { linkCommand, unlinkCommand } from "./commands/link.js";
import { listCommand } from "./commands/list.js";
import { queryCommand } from "./commands/query.js";
import { removeCommand } from "./commands/remove.js";
import { renameCommand } from "./commands/rename.js";
import { showCommand } from "./commands/show.js";
import { statusCommand } from "./commands/status.js";
import { traceCommand } from "./commands/trace.js";
import {
	invalidateCommand,
	promoteCommand,
	validateCommand,
} from "./commands/validate.js";
import { startMcpServer } from "./mcp/server.js";

const program = new Command();

program
	.name("arad")
	.description(
		"Architecture, Requirements, Assumptions, Decisions — traceability for humans and agents",
	)
	.version("0.1.0");

program
	.command("init")
	.description("Initialize .arad/ in the current directory")
	.action(initCommand);

program
	.command("add")
	.argument("<type>", "Entity type: requirement | assumption | decision")
	.argument("[title]", "Entity title")
	.option("--driven-by <ids>", "Comma-separated IDs that drive this decision")
	.option("--status <status>", "Entity status")
	.option("--tags <tags>", "Comma-separated tags")
	.option("--derived-from <ids>", "Comma-separated parent requirement IDs")
	.option(
		"--conflicts-with <ids>",
		"Comma-separated conflicting requirement IDs",
	)
	.option("--enables <ids>", "Comma-separated decision IDs this enables")
	.option("--supersedes <id>", "Decision ID this supersedes")
	.option("--inspired-by <ids>", "Comma-separated IDs that inspired this idea")
	.action(
		async (
			type: string,
			title: string | undefined,
			opts: Record<string, string>,
		) => {
			const validTypes = [
				"requirement",
				"assumption",
				"decision",
				"idea",
			] as const;
			if (!validTypes.includes(type as any)) {
				console.error(
					`Invalid type: "${type}". Must be: requirement, assumption, decision, idea`,
				);
				process.exit(1);
			}
			await addCommand(type as (typeof validTypes)[number], title, opts);
		},
	);

program
	.command("list")
	.argument("[type]", "Filter by type: requirement | assumption | decision")
	.option("--status <status>", "Filter by status")
	.option("--tag <tag>", "Filter by tag")
	.action((type: string | undefined, opts: Record<string, string>) => {
		listCommand(type, opts);
	});

program
	.command("show")
	.argument("<id>", "Entity ID (e.g. R-001, A-003, D-007)")
	.action(showCommand);

program
	.command("edit")
	.argument("<id>", "Entity ID to edit in $EDITOR")
	.action(editCommand);

program
	.command("trace")
	.argument("<id>", "Entity ID to trace dependencies for")
	.description("Show dependency tree (what backs this entity)")
	.action(traceCommand);

program
	.command("impact")
	.argument("<id>", "Entity ID to analyze impact for")
	.description("Show what would be affected if this entity changes")
	.action(impactCommand);

program
	.command("check")
	.description(
		"Find orphans, contradictions, dangling refs, unvalidated assumptions",
	)
	.option("--strict", "Treat warnings as errors (exit code 1)")
	.option("--format <format>", "Output format: text or json", "text")
	.action((opts: { strict?: boolean; format?: string }) => {
		checkCommand({
			strict: opts.strict,
			format: (opts.format as "text" | "json") ?? "text",
		});
	});

program
	.command("validate")
	.argument("<id>", "Assumption ID to validate")
	.description("Mark an assumption as validated")
	.action(validateCommand);

program
	.command("invalidate")
	.argument("<id>", "Assumption ID to invalidate")
	.description("Mark an assumption as invalidated (shows impact)")
	.action(invalidateCommand);

program
	.command("promote")
	.argument("<id>", "Assumption or idea ID to promote")
	.description(
		"Promote a validated assumption to a requirement, or an idea to a requirement/decision",
	)
	.option(
		"--to <type>",
		"For ideas: promote to requirement or decision (default: requirement)",
	)
	.action((id: string, opts: { to?: string }) => {
		if (opts.to) {
			process.env.__ARAD_PROMOTE_TO = opts.to;
		}
		promoteCommand(id);
	});

program
	.command("link")
	.argument("<from-id>", "Source entity ID")
	.argument("<to-id>", "Target entity ID")
	.option(
		"--type <type>",
		"Edge type: driven_by | enables | supersedes | derived_from | conflicts_with",
	)
	.description("Link two entities with a relationship")
	.action((fromId: string, toId: string, opts: { type?: string }) => {
		linkCommand(fromId, toId, opts);
	});

program
	.command("unlink")
	.argument("<from-id>", "Source entity ID")
	.argument("<to-id>", "Target entity ID")
	.option("--type <type>", "Edge type to remove (checks all if not specified)")
	.description("Remove a relationship between two entities")
	.action((fromId: string, toId: string, opts: { type?: string }) => {
		unlinkCommand(fromId, toId, opts);
	});

program
	.command("query")
	.argument(
		"<terms...>",
		"Search terms (supports type:, status:, tag:, driven_by:, id: modifiers)",
	)
	.description("Search entities by text or structured modifiers")
	.action((terms: string[]) => {
		queryCommand(terms.join(" "));
	});

program
	.command("mcp")
	.description("Start MCP server (stdio transport) for AI agent integration")
	.action(async () => {
		await startMcpServer();
	});

program
	.command("graph")
	.description("Visualize the ARAD graph (Mermaid, DOT, or ASCII)")
	.option("--format <format>", "Output format: mermaid, dot, ascii", "mermaid")
	.action((opts: { format?: string }) => {
		graphCommand(opts.format);
	});

program
	.command("remove")
	.argument("<id>", "Entity ID to remove")
	.option(
		"--force",
		"Remove even if referenced by other entities (leaves dangling refs)",
	)
	.option("--clean", "Remove and clean up references from other entities")
	.description("Remove an entity from the ARAD graph")
	.action((id: string, opts: { force?: boolean; clean?: boolean }) => {
		removeCommand(id, { force: opts.force || opts.clean, clean: opts.clean });
	});

program
	.command("rename")
	.argument("<id>", "Current entity ID")
	.argument("<new-id>", "New entity ID")
	.option("--title <title>", "New title (optional)")
	.description("Rename an entity ID, updating all references")
	.action((id: string, newId: string, opts: { title?: string }) => {
		renameCommand(id, newId, opts);
	});

program
	.command("import")
	.argument("<path>", "Directory or file to import from")
	.option("--type <type>", "Import format: adr", "adr")
	.description("Import existing ADR markdown files as decisions")
	.action((path: string, opts: { type?: string }) => {
		importCommand(path, opts);
	});

program
	.command("status")
	.description("Quick project health summary")
	.action(() => {
		statusCommand();
	});

program.parse();
