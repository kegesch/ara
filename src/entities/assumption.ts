import type { Assumption, Entity } from "../types";
import type {
	EntityDescriptor,
	RawFrontmatter,
} from "./descriptor";

export const assumptionDescriptor: EntityDescriptor = {
	type: "assumption",
	prefix: "A",
	folder: "assumptions",
	statuses: ["unvalidated", "validated", "invalidated"],
	defaultStatus: "unvalidated",
	ansiColor: "\x1b[33m", // yellow

	template: (title) =>
		[
			`# Assumption: ${title}`,
			"",
			"## Description",
			"",
			"(Describe the assumption)",
			"",
			"## Validation",
			"",
			"(How could this be validated? What evidence would prove/disprove it?)",
		].join("\n"),

	parse: (meta: RawFrontmatter, base) => ({
		...base,
		type: "assumption",
		status: (meta.status as Assumption["status"]) ?? "unvalidated",
		promoted_to: meta.promoted_to,
	}),

	serialize: (entity) => {
		const e = entity as Assumption;
		const lines: string[] = [];
		if (e.promoted_to) lines.push(`promoted_to: ${e.promoted_to}`);
		return lines;
	},

	edges: (entity) => {
		const e = entity as Assumption;
		if (e.promoted_to) {
			return [{ to: e.promoted_to, type: "promoted_to" as const }];
		}
		return [];
	},

	relFields: () => [
		{ field: "promoted_to", edgeType: "promoted_to", isArray: false },
	],

	detailRelations: (entity) => {
		const e = entity as Assumption;
		if (e.promoted_to) {
			return [{ label: "promoted to", ids: e.promoted_to }];
		}
		return [];
	},

	jsonFields: (entity) => {
		const e = entity as Assumption;
		return { promoted_to: e.promoted_to };
	},
};
