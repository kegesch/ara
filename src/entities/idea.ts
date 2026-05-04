import type { Entity, Idea } from "../types";
import type {
	EntityDescriptor,
	RawFrontmatter,
} from "./descriptor";

export const ideaDescriptor: EntityDescriptor = {
	type: "idea",
	prefix: "I",
	folder: "ideas",
	statuses: ["explore", "parked", "rejected", "promoted"],
	defaultStatus: "explore",
	ansiColor: "\x1b[35m", // magenta

	template: (title) =>
		[
			`# Idea: ${title}`,
			"",
			"## What if...",
			"",
			"(Describe the idea)",
			"",
			"## Why interesting",
			"",
			"(What makes this worth exploring?)",
			"",
			"## Open questions",
			"",
			"(What needs to be answered before this can become a decision/requirement?)",
		].join("\n"),

	parse: (meta: RawFrontmatter, base) => ({
		...base,
		type: "idea",
		status: (meta.status as Idea["status"]) ?? "explore",
		inspired_by: meta.inspired_by ?? [],
		promoted_to: meta.promoted_to,
	}),

	serialize: (entity) => {
		const e = entity as Idea;
		const lines: string[] = [];
		if (e.inspired_by.length > 0)
			lines.push(`inspired_by: [${e.inspired_by.join(", ")}]`);
		if (e.promoted_to) lines.push(`promoted_to: ${e.promoted_to}`);
		return lines;
	},

	edges: (entity) => {
		const e = entity as Idea;
		const result: Array<{ to: string; type: import("../types").EdgeType }> = [];
		for (const inspiredById of e.inspired_by) {
			result.push({ to: inspiredById, type: "inspired_by" });
		}
		if (e.promoted_to) {
			result.push({ to: e.promoted_to, type: "promoted_to" });
		}
		return result;
	},

	relFields: () => [
		{ field: "inspired_by", edgeType: "inspired_by", isArray: true },
		{ field: "promoted_to", edgeType: "promoted_to", isArray: false },
	],

	detailRelations: (entity) => {
		const e = entity as Idea;
		const rels: Array<{ label: string; ids: string[] | string; style?: "normal" | "red" }> = [];
		if (e.inspired_by.length > 0)
			rels.push({ label: "inspired by", ids: e.inspired_by });
		if (e.promoted_to)
			rels.push({ label: "promoted to", ids: e.promoted_to });
		return rels;
	},

	jsonFields: (entity) => {
		const e = entity as Idea;
		return {
			inspired_by: e.inspired_by,
			promoted_to: e.promoted_to,
		};
	},
};
