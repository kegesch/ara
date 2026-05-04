import type { Entity, Risk } from "../types";
import type {
	EntityDescriptor,
	RawFrontmatter,
} from "./descriptor";

export const riskDescriptor: EntityDescriptor = {
	type: "risk",
	prefix: "K",
	folder: "risks",
	statuses: ["identified", "mitigated", "accepted", "materialized", "closed"],
	defaultStatus: "identified",
	ansiColor: "\x1b[31m", // red

	template: (title) =>
		[
			`# Risk: ${title}`,
			"",
			"## Description",
			"",
			"(Describe the risk)",
			"",
			"## Likelihood",
			"",
			"(How likely is this to occur? High/Medium/Low)",
			"",
			"## Impact",
			"",
			"(What happens if this materializes?)",
			"",
			"## Mitigation",
			"",
			"(How can this risk be reduced or managed?)",
		].join("\n"),

	parse: (meta: RawFrontmatter, base) => ({
		...base,
		type: "risk",
		status: (meta.status as Risk["status"]) ?? "identified",
		mitigated_by: meta.mitigated_by ?? [],
	}),

	serialize: (entity) => {
		const e = entity as Risk;
		const lines: string[] = [];
		if (e.mitigated_by.length > 0)
			lines.push(`mitigated_by: [${e.mitigated_by.join(", ")}]`);
		return lines;
	},

	edges: (entity) => {
		const e = entity as Risk;
		const result: Array<{ to: string; type: import("../types").EdgeType }> = [];
		for (const decisionId of e.mitigated_by) {
			result.push({ to: decisionId, type: "mitigated_by" });
		}
		return result;
	},

	relFields: () => [
		{ field: "mitigated_by", edgeType: "mitigated_by", isArray: true },
	],

	detailRelations: () => [],

	jsonFields: (entity) => {
		const e = entity as Risk;
		return { mitigated_by: e.mitigated_by };
	},
};
