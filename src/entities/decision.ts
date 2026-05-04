import type { Decision, Entity } from "../types";
import type {
	EntityDescriptor,
	RawFrontmatter,
} from "./descriptor";

export const decisionDescriptor: EntityDescriptor = {
	type: "decision",
	prefix: "D",
	folder: "decisions",
	statuses: ["proposed", "accepted", "deprecated", "superseded"],
	defaultStatus: "proposed",
	ansiColor: "\x1b[32m", // green

	template: (title) =>
		[
			`# Decision: ${title}`,
			"",
			"## Context",
			"",
			"(What is the issue motivating this decision?)",
			"",
			"## Decision",
			"",
			"(What is the change being proposed or made?)",
			"",
			"## Consequences",
			"",
			"(What becomes easier or harder because of this change?)",
		].join("\n"),

	parse: (meta: RawFrontmatter, base) => ({
		...base,
		type: "decision",
		status: (meta.status as Decision["status"]) ?? "proposed",
		driven_by: meta.driven_by ?? [],
		enables: meta.enables ?? [],
		supersedes: meta.supersedes,
		affects: meta.affects ?? [],
	}),

	serialize: (entity) => {
		const e = entity as Decision;
		const lines: string[] = [];
		if (e.driven_by.length > 0)
			lines.push(`driven_by: [${e.driven_by.join(", ")}]`);
		if (e.enables.length > 0)
			lines.push(`enables: [${e.enables.join(", ")}]`);
		if (e.supersedes) lines.push(`supersedes: ${e.supersedes}`);
		if (e.affects.length > 0)
			lines.push(`affects: [${e.affects.join(", ")}]`);
		return lines;
	},

	edges: (entity) => {
		const e = entity as Decision;
		const result: Array<{ to: string; type: import("../types").EdgeType }> = [];
		for (const drivenById of e.driven_by) {
			result.push({ to: drivenById, type: "driven_by" });
		}
		for (const enablesId of e.enables) {
			result.push({ to: enablesId, type: "enables" });
		}
		if (e.supersedes) {
			result.push({ to: e.supersedes, type: "supersedes" });
		}
		for (const stakeholderId of e.affects) {
			result.push({ to: stakeholderId, type: "affects" });
		}
		return result;
	},

	relFields: () => [
		{ field: "driven_by", edgeType: "driven_by", isArray: true },
		{ field: "enables", edgeType: "enables", isArray: true },
		{ field: "supersedes", edgeType: "supersedes", isArray: false },
		{ field: "affects", edgeType: "affects", isArray: true },
	],

	detailRelations: (entity) => {
		const e = entity as Decision;
		const rels: Array<{ label: string; ids: string[] | string; style?: "normal" | "red" }> = [];
		if (e.driven_by.length > 0)
			rels.push({ label: "driven by", ids: e.driven_by });
		if (e.enables.length > 0)
			rels.push({ label: "enables", ids: e.enables });
		if (e.supersedes)
			rels.push({ label: "supersedes", ids: e.supersedes });
		return rels;
	},

	jsonFields: (entity) => {
		const e = entity as Decision;
		return {
			driven_by: e.driven_by,
			enables: e.enables,
			supersedes: e.supersedes,
			affects: e.affects,
		};
	},
};
