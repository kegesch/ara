import type { Entity, Requirement } from "../types";
import type {
	EntityDescriptor,
	RawFrontmatter,
} from "./descriptor";

export const requirementDescriptor: EntityDescriptor = {
	type: "requirement",
	prefix: "R",
	folder: "requirements",
	statuses: ["draft", "accepted", "deprecated", "rejected"],
	defaultStatus: "draft",
	ansiColor: "\x1b[36m", // cyan

	template: (title) =>
		[
			`# Requirement: ${title}`,
			"",
			"## Description",
			"",
			"(Describe the requirement)",
			"",
			"## Acceptance Criteria",
			"",
			"(How do we know this is satisfied?)",
		].join("\n"),

	parse: (meta: RawFrontmatter, base) => ({
		...base,
		type: "requirement",
		status: (meta.status as Requirement["status"]) ?? "draft",
		derived_from: meta.derived_from ?? [],
		conflicts_with: meta.conflicts_with ?? [],
		requested_by: meta.requested_by ?? [],
	}),

	serialize: (entity) => {
		const e = entity as Requirement;
		const lines: string[] = [];
		if (e.derived_from.length > 0)
			lines.push(`derived_from: [${e.derived_from.join(", ")}]`);
		if (e.conflicts_with.length > 0)
			lines.push(`conflicts_with: [${e.conflicts_with.join(", ")}]`);
		if (e.requested_by.length > 0)
			lines.push(`requested_by: [${e.requested_by.join(", ")}]`);
		return lines;
	},

	edges: (entity) => {
		const e = entity as Requirement;
		const result: Array<{ to: string; type: import("../types").EdgeType }> = [];
		for (const parentId of e.derived_from) {
			result.push({ to: parentId, type: "derived_from" });
		}
		for (const conflictId of e.conflicts_with) {
			result.push({ to: conflictId, type: "conflicts_with" });
		}
		for (const stakeholderId of e.requested_by) {
			result.push({ to: stakeholderId, type: "requested_by" });
		}
		return result;
	},

	relFields: () => [
		{ field: "derived_from", edgeType: "derived_from", isArray: true },
		{ field: "conflicts_with", edgeType: "conflicts_with", isArray: true },
		{ field: "requested_by", edgeType: "requested_by", isArray: true },
	],

	detailRelations: (entity) => {
		const e = entity as Requirement;
		const rels: Array<{ label: string; ids: string[] | string; style?: "normal" | "red" }> = [];
		if (e.derived_from.length > 0)
			rels.push({ label: "derived from", ids: e.derived_from });
		if (e.conflicts_with.length > 0)
			rels.push({ label: "conflicts with", ids: e.conflicts_with, style: "red" });
		return rels;
	},

	jsonFields: (entity) => {
		const e = entity as Requirement;
		return {
			derived_from: e.derived_from,
			conflicts_with: e.conflicts_with,
			requested_by: e.requested_by,
		};
	},
};
