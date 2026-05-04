import type { Entity, Term } from "../types";
import type {
	EntityDescriptor,
	RawFrontmatter,
} from "./descriptor";

export const termDescriptor: EntityDescriptor = {
	type: "term",
	prefix: "T",
	folder: "terms",
	statuses: ["draft", "accepted", "deprecated"],
	defaultStatus: "draft",
	ansiColor: "\x1b[36m", // cyan

	template: (title) =>
		[
			`# Term: ${title}`,
			"",
			"## Definition",
			"",
			"(What does this term mean in this project's context?)",
			"",
			"## Examples",
			"",
			"(Examples of usage)",
			"",
			"## Disambiguation",
			"",
			"(How does this differ from related terms?)",
		].join("\n"),

	parse: (meta: RawFrontmatter, base) => ({
		...base,
		type: "term",
		status: (meta.status as Term["status"]) ?? "draft",
	}),

	serialize: () => [],

	edges: () => [],

	relFields: () => [],

	detailRelations: () => [],

	jsonFields: () => ({}),
};
