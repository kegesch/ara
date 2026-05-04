// Entity descriptor registry — single source of truth for all entity types.

import type { EdgeType, Entity, EntityType } from "../types";
import { getTypeFromId } from "../types";
import { assumptionDescriptor } from "./assumption";
import type { EntityDescriptor, RelFieldDef } from "./descriptor";
import { decisionDescriptor } from "./decision";
import { ideaDescriptor } from "./idea";
import { requirementDescriptor } from "./requirement";
import { riskDescriptor } from "./risk";
import { stakeholderDescriptor } from "./stakeholder";
import { termDescriptor } from "./term";

/** Canonical display order for entity types */
export const ENTITY_TYPE_ORDER: EntityType[] = [
	"requirement",
	"assumption",
	"decision",
	"idea",
	"stakeholder",
	"risk",
	"term",
];

const _registry: Record<EntityType, EntityDescriptor> = {
	requirement: requirementDescriptor,
	assumption: assumptionDescriptor,
	decision: decisionDescriptor,
	idea: ideaDescriptor,
	stakeholder: stakeholderDescriptor,
	risk: riskDescriptor,
	term: termDescriptor,
};

/** Get the descriptor for a given entity type */
export function getDescriptor(type: EntityType): EntityDescriptor {
	const d = _registry[type];
	if (!d) throw new Error(`Unknown entity type: ${type}`);
	return d;
}

/** Get the descriptor by looking up an entity ID's prefix */
export function getDescriptorForId(id: string): EntityDescriptor {
	return getDescriptor(getTypeFromId(id));
}

/** All registered entity types */
export function allTypes(): EntityType[] {
	return (Object.keys(_registry) as EntityType[]);
}

/** All registered descriptors */
export function allDescriptors(): EntityDescriptor[] {
	return (Object.values(_registry) as EntityDescriptor[]);
}

// ─── Valid edge pairs (derived from descriptors) ───

/** Maps "fromType-toType" to valid edge types */
export const VALID_EDGES: Record<string, EdgeType[]> = {
	"decision-requirement": ["driven_by"],
	"decision-assumption": ["driven_by"],
	"decision-decision": ["enables", "supersedes"],
	"decision-idea": ["driven_by"],
	"decision-stakeholder": ["affects"],
	"requirement-requirement": ["derived_from", "conflicts_with"],
	"requirement-stakeholder": ["requested_by"],
	"idea-requirement": ["inspired_by"],
	"idea-assumption": ["inspired_by"],
	"idea-decision": ["inspired_by"],
	"idea-idea": ["inspired_by"],
	"risk-decision": ["mitigated_by"],
};

/** Get valid edge types between two entity types */
export function getValidEdges(
	fromType: EntityType,
	toType: EntityType,
): EdgeType[] {
	return VALID_EDGES[`${fromType}-${toType}`] ?? [];
}

/** Infer edge type when there's only one valid option */
export function inferEdgeType(
	fromType: EntityType,
	toType: EntityType,
): EdgeType | null {
	const valid = getValidEdges(fromType, toType);
	if (!valid || valid.length === 0) return null;
	if (valid.length === 1) return valid[0];
	return null; // ambiguous
}

// ─── Relationship field helpers ───

/**
 * Maps an edge type to the field name on a given entity type.
 * Returns null if the edge type doesn't apply.
 */
export function getRelField(
	entityType: EntityType,
	edgeType: EdgeType,
): { field: string; isArray: boolean } | null {
	const desc = getDescriptor(entityType);
	const relField = desc.relFields().find((r) => r.edgeType === edgeType);
	if (!relField) return null;
	return { field: relField.field, isArray: relField.isArray };
}

/** All edge types that a given entity type can hold */
export function getAllRelFields(entityType: EntityType): EdgeType[] {
	return getDescriptor(entityType).relFields().map((r) => r.edgeType);
}

// ─── Reference cleanup / rename ───

/** Remove all references to `removedId` from `entity`, mutating in place. Returns true if changed. */
export function cleanRefs(entity: Entity, removedId: string): boolean {
	const desc = getDescriptor(entity.type);
	let changed = false;
	for (const rf of desc.relFields()) {
		const val = (entity as any)[rf.field];
		if (rf.isArray) {
			if (Array.isArray(val) && val.includes(removedId)) {
				(entity as any)[rf.field] = val.filter((id: string) => id !== removedId);
				changed = true;
			}
		} else {
			if (val === removedId) {
				(entity as any)[rf.field] = undefined;
				changed = true;
			}
		}
	}
	return changed;
}

/** Rename all references from `oldId` to `newId` in `entity`, mutating in place. Returns true if changed. */
export function renameRefs(entity: Entity, oldId: string, newId: string): boolean {
	const desc = getDescriptor(entity.type);
	let changed = false;
	for (const rf of desc.relFields()) {
		const val = (entity as any)[rf.field];
		if (rf.isArray) {
			if (Array.isArray(val) && val.includes(oldId)) {
				(entity as any)[rf.field] = val.map((id: string) => id === oldId ? newId : id);
				changed = true;
			}
		} else {
			if (val === oldId) {
				(entity as any)[rf.field] = newId;
				changed = true;
			}
		}
	}
	return changed;
}

/** Check if entity has a relationship to a specific ID via a given field */
export function hasRelation(
	entity: Entity,
	edgeType: string,
	value: string,
): boolean {
	const desc = getDescriptor(entity.type);
	for (const rf of desc.relFields()) {
		if (rf.edgeType !== edgeType) continue;
		const val = (entity as any)[rf.field];
		if (rf.isArray) {
			if (Array.isArray(val) && val.some((id: string) => id.toLowerCase().includes(value))) {
				return true;
			}
		} else {
			if (typeof val === "string" && val.toLowerCase().includes(value)) {
				return true;
			}
		}
	}
	return false;
}

// ─── Backwards-compatible ENTITY_CONFIG ───
// Re-export a compatible ENTITY_CONFIG so existing code can migrate incrementally.

import type { EntityTypePrefix } from "../types";

export const ENTITY_CONFIG: Record<
	EntityType,
	{
		prefix: EntityTypePrefix;
		folder: string;
		statuses: string[];
		template: (title: string) => string;
	}
> = Object.fromEntries(
	allDescriptors().map((d) => [
		d.type,
		{
			prefix: d.prefix as EntityTypePrefix,
			folder: d.folder,
			statuses: d.statuses,
			template: d.template,
		},
	]),
) as any;
