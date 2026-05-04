// Entity Descriptor interface — encapsulates all type-specific behaviour
// behind a single object per entity type.

import type {
	EdgeType,
	Entity,
	EntityBase,
	EntityType,
} from "../types";

/** Raw frontmatter parsed from YAML */
export interface RawFrontmatter {
	id: string;
	title: string;
	status?: string;
	date?: string;
	tags?: string[];
	context?: string;
	derived_from?: string[];
	conflicts_with?: string[];
	driven_by?: string[];
	enables?: string[];
	supersedes?: string;
	promoted_to?: string;
	inspired_by?: string[];
	requested_by?: string[];
	affects?: string[];
	mitigated_by?: string[];
}

/** Describes a single relationship field on an entity */
export interface RelFieldDef {
	/** Entity property name (e.g. "driven_by") */
	field: string;
	/** Corresponding edge type */
	edgeType: EdgeType;
	/** true = array field, false = scalar field */
	isArray: boolean;
}

/** Relation info for detail display */
export interface RelationDisplay {
	label: string;
	ids: string[] | string;
	style?: "normal" | "red";
}

/**
 * An EntityDescriptor encapsulates everything that is specific to one entity
 * type. Adding a new entity type means implementing this interface and
 * registering it — no switch statements to hunt down.
 *
 * Uses `Entity` throughout (not generics) for practical TypeScript
 * compatibility — the descriptor is always looked up by type, so the
 * cast is safe at the call site.
 */
export interface EntityDescriptor {
	/** Entity type discriminator */
	type: EntityType;
	/** ID prefix (R, A, D, I, S, K, T) */
	prefix: string;
	/** Folder name inside .arad/ */
	folder: string;
	/** All valid statuses for this entity type */
	statuses: string[];
	/** First status = default for new entities */
	defaultStatus: string;
	/** ANSI escape code for terminal colour */
	ansiColor: string;

	/** Markdown template for new entity body */
	template: (title: string) => string;

	/** Construct an entity from parsed frontmatter + base fields */
	parse: (meta: RawFrontmatter, base: EntityBase) => Entity;

	/** Serialize type-specific frontmatter lines (excludes common fields) */
	serialize: (entity: Entity) => string[];

	/** Extract outgoing edges from an entity */
	edges: (entity: Entity) => Array<{ to: string; type: EdgeType }>;

	/** All relationship fields this entity type can hold */
	relFields: () => RelFieldDef[];

	/** Relation data for detail display (label + ids) */
	detailRelations: (entity: Entity) => RelationDisplay[];

	/** Type-specific fields for JSON serialization (MCP) */
	jsonFields: (entity: Entity) => Record<string, unknown>;
}
