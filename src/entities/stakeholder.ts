import type { Entity, Stakeholder } from "../types";
import type {
	EntityDescriptor,
	RawFrontmatter,
} from "./descriptor";

export const stakeholderDescriptor: EntityDescriptor = {
	type: "stakeholder",
	prefix: "S",
	folder: "stakeholders",
	statuses: ["active", "inactive"],
	defaultStatus: "active",
	ansiColor: "\x1b[34m", // blue

	template: (title) =>
		[
			`# Stakeholder: ${title}`,
			"",
			"## Description",
			"",
			"(Who is this stakeholder? Team, role, or group)",
			"",
			"## Responsibilities",
			"",
			"(What do they care about? What decisions affect them?)",
		].join("\n"),

	parse: (meta: RawFrontmatter, base) => ({
		...base,
		type: "stakeholder",
		status: (meta.status as Stakeholder["status"]) ?? "active",
	}),

	serialize: () => [],

	edges: () => [],

	relFields: () => [],

	detailRelations: () => [],

	jsonFields: () => ({}),
};
