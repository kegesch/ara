// arad list [type]

import { formatEntityList } from "../display/format.js";
import { readAllEntities, requireAradProject } from "../io/files.js";
import type { Entity, EntityType } from "../types.js";

export function listCommand(
	typeFilter?: string,
	options?: { status?: string; tag?: string; context?: string },
): void {
	requireAradProject();

	let entities = readAllEntities();

	// Filter by context
	if (options?.context) {
		entities = entities.filter(
			(e) =>
				e.context?.toLowerCase().includes(options.context!.toLowerCase()) ??
				false,
		);
	}

	// Filter by type
	if (typeFilter) {
		const validTypes: EntityType[] = [
			"requirement",
			"assumption",
			"decision",
			"idea",
			"risk",
		"term",
		];
		if (!validTypes.includes(typeFilter as EntityType)) {
			console.error(
				`Invalid type "${typeFilter}". Use: requirement, assumption, decision, idea, stakeholder, risk, term`,
			);
			return;
		}
		entities = entities.filter((e) => e.type === typeFilter);
	}

	// Filter by status
	if (options?.status) {
		entities = entities.filter((e) => e.status === options.status);
	}

	// Filter by tag
	if (options?.tag) {
		const tag = options.tag.toLowerCase();
		entities = entities.filter((e) =>
			e.tags.some((t) => t.toLowerCase().includes(tag)),
		);
	}

	if (entities.length === 0) {
		console.log("No entities found.");
		return;
	}

	// Group by type for display
	const grouped = new Map<EntityType, Entity[]>();
	for (const e of entities) {
		if (!grouped.has(e.type)) grouped.set(e.type, []);
		grouped.get(e.type)!.push(e);
	}

	const order: EntityType[] = [
		"requirement",
		"assumption",
		"decision",
		"idea",
		"stakeholder",
	];
	for (const t of order) {
		const group = grouped.get(t);
		if (!group || group.length === 0) continue;
		console.log(
			`\n${t.charAt(0).toUpperCase() + t.slice(1)}s (${group.length}):`,
		);
		console.log(formatEntityList(group));
	}
}
