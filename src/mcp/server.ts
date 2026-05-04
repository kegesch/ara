// ARAD MCP Server — exposes graph operations as MCP tools
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runCheck } from "../commands/check.js";
import {
	buildGraph,
	getDependencies,
	getDependents,
	impactAnalysis,
	traceUp,
} from "../graph/graph.js";
import {
	getNextId,
	isAradProject,
	readAllEntities,
	readEntityById,
	writeEntity,
} from "../io/files.js";
import { searchEntities } from "../search/fuzzy.js";
import type { Entity, EntityType } from "../types.js";
import { allTypes, getDescriptor, ENTITY_CONFIG } from "../entities/registry.js";
import type { RawFrontmatter } from "../entities/descriptor.js";

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
	async ({ type, context }) => {
		if (!isAradProject()) {
			return {
				content: [
					{
						type: "text",
						text: "Error: Not an ARAD project. Run arad init first.",
					},
				],
			};
		}
		let entities = readAllEntities();
		if (type) entities = entities.filter((e) => e.type === type);
		if (context)
			entities = entities.filter((e) =>
				e.context?.toLowerCase().includes(context.toLowerCase()),
			);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(entities.map(entityToJson), null, 2),
				},
			],
		};
	},
);

// ─── Tool: arad_show ───

server.tool(
	"arad_show",
	"Show details of a specific entity and its immediate relationships",
	{ id: z.string().describe("Entity ID (e.g. R-001, A-003, D-007)") },
	async ({ id }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const entity = readEntityById(process.cwd(), id);
		if (!entity) {
			return { content: [{ type: "text", text: `Entity ${id} not found.` }] };
		}
		const graph = buildGraph(readAllEntities());
		const deps = getDependencies(graph, id).map(entityToJson);
		const dependents = getDependents(graph, id).map(entityToJson);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{ entity: entityToJson(entity), dependencies: deps, dependents },
						null,
						2,
					),
				},
			],
		};
	},
);

// ─── Tool: arad_trace ───

server.tool(
	"arad_trace",
	"Trace the dependency tree of an entity (what backs it)",
	{ id: z.string().describe("Entity ID to trace") },
	async ({ id }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const graph = buildGraph(readAllEntities());
		if (!graph.entities.has(id)) {
			return { content: [{ type: "text", text: `Entity ${id} not found.` }] };
		}
		const tree = traceUp(graph, id);
		function nodeToJson(n: ReturnType<typeof traceUp>): any {
			if (!n) return null;
			return {
				entity: entityToJson(n.entity),
				edgeType: n.edgeType,
				children: n.children.map(nodeToJson),
			};
		}
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(nodeToJson(tree), null, 2),
				},
			],
		};
	},
);

// ─── Tool: arad_impact ───

server.tool(
	"arad_impact",
	"Analyze what would be affected if an entity changes or is removed",
	{ id: z.string().describe("Entity ID to analyze impact for") },
	async ({ id }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const graph = buildGraph(readAllEntities());
		if (!graph.entities.has(id)) {
			return { content: [{ type: "text", text: `Entity ${id} not found.` }] };
		}
		const { direct, transitive } = impactAnalysis(graph, id);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							entity: entityToJson(graph.entities.get(id)!),
							direct: direct.map(entityToJson),
							transitive: transitive.map(entityToJson),
						},
						null,
						2,
					),
				},
			],
		};
	},
);

// ─── Tool: arad_check ───

server.tool(
	"arad_check",
	"Run health check: find orphans, contradictions, dangling refs, unvalidated assumptions",
	{
		context: z.string().optional().describe("Filter by context"),
	},
	async ({ context }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const result = runCheck(context);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(result, null, 2),
				},
			],
		};
	},
);

// ─── Tool: arad_query ───

server.tool(
	"arad_query",
	"Search entities by text or structured modifiers (type:, status:, tag:, driven_by:, id:)",
	{ query: z.string().describe("Search terms") },
	async ({ query }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const entities = readAllEntities();
		const results = searchEntities(entities, query);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						results.map((r) => ({
							...entityToJson(r.entity),
							score: r.score,
							matches: r.matches,
						})),
						null,
						2,
					),
				},
			],
		};
	},
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
	async ({
		type,
		title,
		status,
		tags,
		driven_by,
		derived_from,
		inspired_by,
		context,
	}) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}

		const desc = getDescriptor(type);
		const config = ENTITY_CONFIG[type];
		const id = getNextId(process.cwd(), type);
		const date = new Date().toISOString().split("T")[0];
		const entityStatus = status || desc.defaultStatus;
		const entityTags = tags
			? tags
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean)
			: [];

		// Build meta for descriptor parse
		const meta: RawFrontmatter = {
			id,
			title,
			status: entityStatus,
			date,
			tags: entityTags,
			context: context || undefined,
			driven_by: driven_by
				? driven_by
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: [],
			derived_from: derived_from
				? derived_from
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: [],
			conflicts_with: [],
			requested_by: [],
			enables: [],
			affects: [],
			inspired_by: inspired_by
				? inspired_by
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: [],
			mitigated_by: [],
		};

		const base = {
			id,
			title,
			date,
			tags: entityTags,
			context: context || undefined,
			body: "",
			filePath: "",
		};

		const entity: Entity = desc.parse(meta, base);

		const relPath = writeEntity(process.cwd(), entity);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{ created: entityToJson(entity), path: `.arad/${relPath}` },
						null,
						2,
					),
				},
			],
		};
	},
);

// ─── Tool: arad_validate ───

server.tool(
	"arad_validate",
	"Mark an assumption as validated",
	{ id: z.string().describe("Assumption ID") },
	async ({ id }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const { updateEntity } = await import("../io/files.js");
		const entity = readEntityById(process.cwd(), id);
		if (!entity || entity.type !== "assumption") {
			return {
				content: [
					{ type: "text", text: `${id} not found or not an assumption.` },
				],
			};
		}
		entity.status = "validated";
		updateEntity(process.cwd(), entity);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({ validated: entityToJson(entity) }, null, 2),
				},
			],
		};
	},
);

// ─── Tool: arad_invalidate ───

server.tool(
	"arad_invalidate",
	"Mark an assumption as invalidated (shows impact)",
	{ id: z.string().describe("Assumption ID") },
	async ({ id }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const { updateEntity } = await import("../io/files.js");
		const entities = readAllEntities();
		const graph = buildGraph(entities);
		const entity = graph.entities.get(id);
		if (!entity || entity.type !== "assumption") {
			return {
				content: [
					{ type: "text", text: `${id} not found or not an assumption.` },
				],
			};
		}
		entity.status = "invalidated";
		updateEntity(process.cwd(), entity);
		const { direct, transitive } = impactAnalysis(graph, id);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							invalidated: entityToJson(entity),
							affected: {
								direct: direct.map(entityToJson),
								transitive: transitive.map(entityToJson),
							},
						},
						null,
						2,
					),
				},
			],
		};
	},
);

// ─── Tool: arad_promote ───

server.tool(
	"arad_promote",
	"Promote a validated assumption to a requirement",
	{ id: z.string().describe("Assumption ID") },
	async ({ id }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const { updateEntity, getNextId, writeEntity } = await import(
			"../io/files.js"
		);
		const entity = readEntityById(process.cwd(), id);
		if (!entity || entity.type !== "assumption") {
			return {
				content: [
					{ type: "text", text: `${id} not found or not an assumption.` },
				],
			};
		}
		if (entity.status !== "validated") {
			return {
				content: [
					{
						type: "text",
						text: `${id} must be validated before promotion. Current status: ${entity.status}`,
					},
				],
			};
		}
		const newId = getNextId(process.cwd(), "requirement");
		const requirement = {
			type: "requirement" as const,
			id: newId,
			title: entity.title,
			status: "accepted" as const,
			date: new Date().toISOString().split("T")[0],
			tags: [...entity.tags],
			derived_from: [],
			conflicts_with: [],
			requested_by: [],
			body: entity.body,
			filePath: "",
		};
		writeEntity(process.cwd(), requirement);
		entity.promoted_to = newId;
		updateEntity(process.cwd(), entity);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							promoted_from: entityToJson(entity),
							promoted_to: entityToJson(requirement),
						},
						null,
						2,
					),
				},
			],
		};
	},
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
	async ({ from_id, to_id, type }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const fromEntity = readEntityById(process.cwd(), from_id);
		const toEntity = readEntityById(process.cwd(), to_id);
		if (!fromEntity)
			return { content: [{ type: "text", text: `${from_id} not found.` }] };
		if (!toEntity)
			return { content: [{ type: "text", text: `${to_id} not found.` }] };

		const { VALID_EDGES } = await import("../commands/link.js");
		const key = `${fromEntity.type}-${toEntity.type}`;
		const validForPair = VALID_EDGES[key];
		if (!validForPair) {
			return {
				content: [
					{
						type: "text",
						text: `No valid relationship from ${fromEntity.type} to ${toEntity.type}.`,
					},
				],
			};
		}

		let edgeType = type;
		if (!edgeType) {
			if (validForPair.length === 1) edgeType = validForPair[0];
			else
				return {
					content: [
						{
							type: "text",
							text: `Ambiguous. Specify type: ${validForPair.join(", ")}`,
						},
					],
				};
		}
		if (!validForPair.includes(edgeType as any)) {
			return {
				content: [
					{
						type: "text",
						text: `Invalid edge type "${edgeType}" for ${fromEntity.type} → ${toEntity.type}. Valid: ${validForPair.join(", ")}`,
					},
				],
			};
		}

		const { updateEntity } = await import("../io/files.js");
		const { getRelField } = await import("../entities/registry.js");
		const relField = getRelField(fromEntity.type, edgeType as any);
		if (relField) {
			if (relField.isArray) {
				const arr = (fromEntity as any)[relField.field] as string[];
				if (!arr.includes(to_id)) arr.push(to_id);
			} else {
				(fromEntity as any)[relField.field] = to_id;
				if (
					edgeType === "supersedes" &&
					toEntity.type === "decision" &&
					toEntity.status !== "superseded"
				) {
					toEntity.status = "superseded";
					updateEntity(process.cwd(), toEntity);
				}
			}
		}
		updateEntity(process.cwd(), fromEntity);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{ linked: `${from_id} ──${edgeType}──▶ ${to_id}` },
						null,
						2,
					),
				},
			],
		};
	},
);

// ─── Tool: arad_unlink ───

server.tool(
	"arad_unlink",
	"Remove a relationship between two entities",
	{
		from_id: z.string().describe("Source entity ID"),
		to_id: z.string().describe("Target entity ID"),
	},
	async ({ from_id, to_id }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const { updateEntity } = await import("../io/files.js");
		const fromEntity = readEntityById(process.cwd(), from_id);
		if (!fromEntity)
			return { content: [{ type: "text", text: `${from_id} not found.` }] };

		let removed = false;
		const fields = [
			"driven_by",
			"enables",
			"derived_from",
			"conflicts_with",
		] as const;
		for (const field of fields) {
			const arr = (fromEntity as any)[field];
			if (Array.isArray(arr)) {
				const idx = arr.indexOf(to_id);
				if (idx !== -1) {
					arr.splice(idx, 1);
					removed = true;
				}
			}
		}
		if ((fromEntity as any).supersedes === to_id) {
			(fromEntity as any).supersedes = undefined;
			removed = true;
		}

		if (!removed)
			return {
				content: [
					{
						type: "text",
						text: `No relationship found from ${from_id} to ${to_id}.`,
					},
				],
			};

		const toEntity = readEntityById(process.cwd(), to_id);
		if (
			toEntity &&
			fromEntity.type === "requirement" &&
			toEntity.type === "requirement"
		) {
			const idx = (toEntity as any).conflicts_with?.indexOf(from_id);
			if (idx !== undefined && idx !== -1) {
				(toEntity as any).conflicts_with.splice(idx, 1);
				updateEntity(process.cwd(), toEntity);
			}
		}

		updateEntity(process.cwd(), fromEntity);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({ unlinked: `${from_id} → ${to_id}` }, null, 2),
				},
			],
		};
	},
);

// ─── Tool: arad_graph ───

server.tool(
	"arad_graph",
	"Get graph visualization as text (Mermaid or DOT format)",
	{ format: z.enum(["mermaid", "dot"]).optional() },
	async ({ format }) => {
		if (!isAradProject()) {
			return {
				content: [{ type: "text", text: "Error: Not an ARAD project." }],
			};
		}
		const entities = readAllEntities();
		if (entities.length === 0) {
			return { content: [{ type: "text", text: "No entities to graph." }] };
		}
		const graphModule = await import("../commands/graph.js");
		const { buildGraph } = await import("../graph/graph.js");
		const graph = buildGraph(entities);
		const fmt = format ?? "mermaid";
		const output =
			fmt === "mermaid"
				? graphModule.renderMermaid(graph)
				: graphModule.renderDot(graph);
		return { content: [{ type: "text", text: output }] };
	},
);

// ─── Start server ───

export async function startMcpServer(): Promise<void> {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
