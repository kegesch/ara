// ARAD MCP Server — exposes graph operations as MCP tools
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runCheck } from "../commands/check.js";
import { createEntity } from "../commands/add.js";
import { performLink, performUnlink } from "../commands/link.js";
import { performValidate, performInvalidate, performPromote } from "../commands/validate.js";
import { performRemove } from "../commands/remove.js";
import { performRename } from "../commands/rename.js";
import { getStatus } from "../commands/status.js";
import {
	buildGraph,
	getDependencies,
	getDependents,
	impactAnalysis,
	traceUp,
} from "../graph/graph.js";
import { isAradProject, readAllEntities, readEntityById } from "../io/files.js";
import { searchEntities } from "../search/fuzzy.js";
import type { Entity, EntityType } from "../types.js";
import { getDescriptor, ENTITY_CONFIG } from "../entities/registry.js";
import { AradError } from "../core/errors.js";

const server = new McpServer({
	name: "arad",
	version: "0.1.0",
});

// Helper: serialize entity to plain JSON object (using descriptors)
function entityToJson(entity: Entity) {
	const desc = getDescriptor(entity.type);
	const base = {
		id: entity.id,
		type: entity.type,
		title: entity.title,
		status: entity.status,
		date: entity.date,
		tags: entity.tags,
		...(entity.context ? { context: entity.context } : {}),
	};
	return { ...base, ...desc.jsonFields(entity as any) };
}

/** Helper: wrap a tool handler with common error handling */
function toolResult(data: unknown): { content: { type: "text"; text: string }[] } {
	return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string): { content: { type: "text"; text: string }[] } {
	return { content: [{ type: "text", text: message }] };
}

function notAnAradProject() {
	return toolError("Error: Not an ARAD project. Run arad init first.");
}

/** Wrap a handler that may throw AradError, converting to MCP tool responses */
type ToolResponse = { content: { type: "text"; text: string }[] };

function withErrorHandler<T extends Record<string, unknown>>(
	handler: (args: T) => Promise<ToolResponse>,
): (args: T) => Promise<ToolResponse> {
	return async (args: T) => {
		try {
			return await handler(args);
		} catch (e) {
			if (e instanceof AradError) {
				return toolError(`Error: ${e.message}`);
			}
			return toolError(`Error: ${(e as Error).message}`);
		}
	};
}

// ─── Tool: arad_list ───

server.tool(
	"arad_list",
	"List all ARAD entities, optionally filtered by type and/or context",
	{
		type: z
			.enum([
				"requirement",
				"assumption",
				"decision",
				"idea",
				"stakeholder",
				"risk",
				"term",
			])
			.optional(),
		context: z.string().optional().describe("Filter by context"),
	},
	withErrorHandler(async ({ type, context }) => {
		if (!isAradProject()) return notAnAradProject();
		let entities = readAllEntities();
		if (type) entities = entities.filter((e) => e.type === type);
		if (context)
			entities = entities.filter((e) =>
				e.context?.toLowerCase().includes(context.toLowerCase()),
			);
		return toolResult(entities.map(entityToJson));
	}),
);

// ─── Tool: arad_show ───

server.tool(
	"arad_show",
	"Show details of a specific entity and its immediate relationships",
	{ id: z.string().describe("Entity ID (e.g. R-001, A-003, D-007)") },
	withErrorHandler(async ({ id }) => {
		if (!isAradProject()) return notAnAradProject();
		const entity = readEntityById(process.cwd(), id);
		if (!entity) return toolError(`Entity ${id} not found.`);
		const graph = buildGraph(readAllEntities());
		const deps = getDependencies(graph, id).map(entityToJson);
		const dependents = getDependents(graph, id).map(entityToJson);
		return toolResult({ entity: entityToJson(entity), dependencies: deps, dependents });
	}),
);

// ─── Tool: arad_trace ───

server.tool(
	"arad_trace",
	"Trace the dependency tree of an entity (what backs it)",
	{ id: z.string().describe("Entity ID to trace") },
	withErrorHandler(async ({ id }) => {
		if (!isAradProject()) return notAnAradProject();
		const graph = buildGraph(readAllEntities());
		if (!graph.entities.has(id)) return toolError(`Entity ${id} not found.`);
		const tree = traceUp(graph, id);
		function nodeToJson(n: ReturnType<typeof traceUp>): any {
			if (!n) return null;
			return {
				entity: entityToJson(n.entity),
				edgeType: n.edgeType,
				children: n.children.map(nodeToJson),
			};
		}
		return toolResult(nodeToJson(tree));
	}),
);

// ─── Tool: arad_impact ───

server.tool(
	"arad_impact",
	"Analyze what would be affected if an entity changes or is removed",
	{ id: z.string().describe("Entity ID to analyze impact for") },
	withErrorHandler(async ({ id }) => {
		if (!isAradProject()) return notAnAradProject();
		const graph = buildGraph(readAllEntities());
		if (!graph.entities.has(id)) return toolError(`Entity ${id} not found.`);
		const { direct, transitive } = impactAnalysis(graph, id);
		return toolResult({
			entity: entityToJson(graph.entities.get(id)!),
			direct: direct.map(entityToJson),
			transitive: transitive.map(entityToJson),
		});
	}),
);

// ─── Tool: arad_check ───

server.tool(
	"arad_check",
	"Run health check: find orphans, contradictions, dangling refs, unvalidated assumptions",
	{
		context: z.string().optional().describe("Filter by context"),
	},
	withErrorHandler(async ({ context }) => {
		if (!isAradProject()) return notAnAradProject();
		const result = runCheck(context);
		return toolResult(result);
	}),
);

// ─── Tool: arad_query ───

server.tool(
	"arad_query",
	"Search entities by text or structured modifiers (type:, status:, tag:, driven_by:, id:)",
	{ query: z.string().describe("Search terms") },
	withErrorHandler(async ({ query }) => {
		if (!isAradProject()) return notAnAradProject();
		const entities = readAllEntities();
		const results = searchEntities(entities, query);
		return toolResult(
			results.map((r) => ({
				...entityToJson(r.entity),
				score: r.score,
				matches: r.matches,
			})),
		);
	}),
);

// ─── Tool: arad_add ───

server.tool(
	"arad_add",
	"Add a new entity (requirement, assumption, decision, or idea)",
	{
		type: z.enum([
			"requirement",
			"assumption",
			"decision",
			"idea",
			"stakeholder",
			"risk",
			"term",
		]),
		title: z.string().describe("Entity title"),
		status: z
			.string()
			.optional()
			.describe("Status (default: first status for type)"),
		tags: z.string().optional().describe("Comma-separated tags"),
		driven_by: z
			.string()
			.optional()
			.describe("Comma-separated IDs that drive this decision"),
		derived_from: z
			.string()
			.optional()
			.describe("Comma-separated parent requirement IDs"),
		inspired_by: z
			.string()
			.optional()
			.describe("Comma-separated IDs that inspired this idea"),
		context: z
			.string()
			.optional()
			.describe("Context (e.g. billing, fulfillment)"),
	},
	withErrorHandler(async ({
		type,
		title,
		status,
		tags,
		driven_by,
		derived_from,
		inspired_by,
		context,
	}) => {
		if (!isAradProject()) return notAnAradProject();

		const parseIds = (input: string | undefined) =>
			input
				? input
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: undefined;

		const result = createEntity(process.cwd(), {
			type: type as EntityType,
			title,
			status,
			tags: tags
				? tags
						.split(",")
						.map((t) => t.trim())
						.filter(Boolean)
				: undefined,
			context: context || undefined,
			drivenBy: parseIds(driven_by),
			derivedFrom: parseIds(derived_from),
			inspiredBy: parseIds(inspired_by),
		});

		return toolResult({ created: entityToJson(result.entity), path: `.arad/${result.path}` });
	}),
);

// ─── Tool: arad_validate ───

server.tool(
	"arad_validate",
	"Mark an assumption as validated",
	{ id: z.string().describe("Assumption ID") },
	withErrorHandler(async ({ id }) => {
		if (!isAradProject()) return notAnAradProject();
		const result = performValidate(process.cwd(), id);
		return toolResult({ validated: entityToJson(result.entity) });
	}),
);

// ─── Tool: arad_invalidate ───

server.tool(
	"arad_invalidate",
	"Mark an assumption as invalidated (shows impact)",
	{ id: z.string().describe("Assumption ID") },
	withErrorHandler(async ({ id }) => {
		if (!isAradProject()) return notAnAradProject();
		const result = performInvalidate(process.cwd(), id);
		return toolResult({
			invalidated: entityToJson(result.entity),
			affected: {
				direct: result.affected.direct.map(entityToJson),
				transitive: result.affected.transitive.map(entityToJson),
			},
		});
	}),
);

// ─── Tool: arad_promote ───

server.tool(
	"arad_promote",
	"Promote a validated assumption to a requirement",
	{ id: z.string().describe("Assumption or idea ID") },
	withErrorHandler(async ({ id }) => {
		if (!isAradProject()) return notAnAradProject();
		const result = performPromote(process.cwd(), id);
		return toolResult({
			promoted_from: entityToJson(result.sourceEntity),
			promoted_to: entityToJson(result.newEntity),
			linked_decisions: result.linkedDecisions,
		});
	}),
);

// ─── Tool: arad_link ───

server.tool(
	"arad_link",
	"Create a relationship between two entities",
	{
		from_id: z.string().describe("Source entity ID"),
		to_id: z.string().describe("Target entity ID"),
		type: z
			.string()
			.optional()
			.describe(
				"Edge type: driven_by, enables, supersedes, derived_from, conflicts_with",
			),
	},
	withErrorHandler(async ({ from_id, to_id, type }) => {
		if (!isAradProject()) return notAnAradProject();
		const result = performLink(process.cwd(), from_id, to_id, { type });
		return toolResult({
			linked: `${result.fromId} ──${result.edgeType}──▶ ${result.toId}`,
			sideEffects: result.sideEffects,
		});
	}),
);

// ─── Tool: arad_unlink ───

server.tool(
	"arad_unlink",
	"Remove a relationship between two entities",
	{
		from_id: z.string().describe("Source entity ID"),
		to_id: z.string().describe("Target entity ID"),
	},
	withErrorHandler(async ({ from_id, to_id }) => {
		if (!isAradProject()) return notAnAradProject();
		const result = performUnlink(process.cwd(), from_id, to_id);
		return toolResult({
			unlinked: `${result.fromId} → ${result.toId}`,
			removedEdgeTypes: result.removedEdgeTypes,
			sideEffects: result.sideEffects,
		});
	}),
);

// ─── Tool: arad_remove ───

server.tool(
	"arad_remove",
	"Remove an entity from the ARAD graph",
	{
		id: z.string().describe("Entity ID to remove"),
		force: z
			.boolean()
			.optional()
			.describe("Remove even if referenced (leaves dangling refs)"),
		clean: z
			.boolean()
			.optional()
			.describe("Remove and clean up references from other entities"),
	},
	withErrorHandler(async ({ id, force, clean }) => {
		if (!isAradProject()) return notAnAradProject();
		const result = performRemove(process.cwd(), id, {
			force: force || clean,
			clean,
		});
		return toolResult({
			removed: entityToJson(result.removed),
			cleanedRefs: result.cleanedRefs,
		});
	}),
);

// ─── Tool: arad_rename ───

server.tool(
	"arad_rename",
	"Rename an entity ID, updating all references",
	{
		id: z.string().describe("Current entity ID"),
		new_id: z.string().describe("New entity ID"),
		title: z.string().optional().describe("New title (optional)"),
	},
	withErrorHandler(async ({ id, new_id, title }) => {
		if (!isAradProject()) return notAnAradProject();
		const result = performRename(process.cwd(), id, new_id, { title });
		return toolResult({
			oldId: result.oldId,
			newId: result.newId,
			entity: entityToJson(result.entity),
			updatedRefs: result.updatedRefs,
		});
	}),
);

// ─── Tool: arad_status ───

server.tool(
	"arad_status",
	"Quick project health summary",
	{},
	withErrorHandler(async () => {
		if (!isAradProject()) return notAnAradProject();
		const result = getStatus(process.cwd());
		return toolResult(result);
	}),
);

// ─── Tool: arad_graph ───

server.tool(
	"arad_graph",
	"Get graph visualization as text (Mermaid or DOT format)",
	{ format: z.enum(["mermaid", "dot"]).optional() },
	withErrorHandler(async ({ format }) => {
		if (!isAradProject()) return notAnAradProject();
		const entities = readAllEntities();
		if (entities.length === 0) return toolError("No entities to graph.");
		const graphModule = await import("../commands/graph.js");
		const { buildGraph } = await import("../graph/graph.js");
		const graph = buildGraph(entities);
		const fmt = format ?? "mermaid";
		const output =
			fmt === "mermaid"
				? graphModule.renderMermaid(graph)
				: graphModule.renderDot(graph);
		return { content: [{ type: "text" as const, text: output }] };
	}),
);

// ─── Start server ───

export async function startMcpServer(): Promise<void> {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
