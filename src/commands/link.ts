// arad link/unlink <from-id> <to-id> [--type <edge-type>]

import { colorId, dim, green, red, yellow } from "../display/format.js";
import {
	readEntityById,
	requireAradProject,
	updateEntity,
} from "../io/files.js";
import type {
	Decision,
	EdgeType,
	Entity,
	EntityType,
	Requirement,
} from "../types.js";

/**
 * Which edge types are valid for each (fromType, toType) pair.
 * Key is "fromType-toType", value is list of valid edge types.
 */
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

/**
 * Maps an edge type + from entity to the field name and whether it's an array.
 */
function getRelField(
	entity: Entity,
	edgeType: EdgeType,
): { field: string; isArray: boolean } | null {
	switch (entity.type) {
		case "decision":
			if (edgeType === "driven_by")
				return { field: "driven_by", isArray: true };
			if (edgeType === "enables") return { field: "enables", isArray: true };
			if (edgeType === "supersedes")
				return { field: "supersedes", isArray: false };
			if (edgeType === "affects") return { field: "affects", isArray: true };
			return null;
		case "requirement":
			if (edgeType === "derived_from")
				return { field: "derived_from", isArray: true };
			if (edgeType === "conflicts_with")
				return { field: "conflicts_with", isArray: true };
			if (edgeType === "requested_by")
				return { field: "requested_by", isArray: true };
			return null;
		case "idea":
			if (edgeType === "inspired_by")
				return { field: "inspired_by", isArray: true };
			return null;
		case "risk":
			if (edgeType === "mitigated_by")
				return { field: "mitigated_by", isArray: true };
			return null;
		default:
			return null;
	}
}

function inferEdgeType(
	fromType: EntityType,
	toType: EntityType,
): EdgeType | null {
	const key = `${fromType}-${toType}`;
	const valid = VALID_EDGES[key];
	if (!valid || valid.length === 0) return null;
	if (valid.length === 1) return valid[0];
	return null; // ambiguous — user must specify
}

export function linkCommand(
	fromId: string,
	toId: string,
	options?: { type?: string },
): void {
	requireAradProject();

	// Validate IDs
	const fromEntity = readEntityById(process.cwd(), fromId);
	if (!fromEntity) {
		console.error(`${colorId(fromId)} not found.`);
		process.exit(1);
	}
	const toEntity = readEntityById(process.cwd(), toId);
	if (!toEntity) {
		console.error(`${colorId(toId)} not found.`);
		process.exit(1);
	}

	// Self-reference check
	if (fromId === toId) {
		console.error(red("Cannot link an entity to itself."));
		process.exit(1);
	}

	// Determine edge type
	let edgeType: EdgeType | null = null;
	if (options?.type) {
		edgeType = options.type as EdgeType;
	} else {
		edgeType = inferEdgeType(fromEntity.type, toEntity.type);
		if (!edgeType) {
			const key = `${fromEntity.type}-${toEntity.type}`;
			const valid = VALID_EDGES[key];
			if (valid && valid.length > 1) {
				console.error(
					yellow(
						`Ambiguous relationship between ${fromEntity.type} → ${toEntity.type}.`,
					),
				);
				console.error(`  Specify --type: ${valid.join(", ")}`);
			} else {
				console.error(
					red(
						`No valid relationship from ${fromEntity.type} (${fromId}) to ${toEntity.type} (${toId}).`,
					),
				);
			}
			process.exit(1);
		}
	}

	// Validate edge type is legal for this entity pair
	const key = `${fromEntity.type}-${toEntity.type}`;
	const validForPair = VALID_EDGES[key];
	if (!validForPair || !validForPair.includes(edgeType)) {
		console.error(
			red(
				`Edge type "${edgeType}" is not valid for ${fromEntity.type} → ${toEntity.type}.`,
			),
		);
		if (validForPair) {
			console.error(`  Valid types: ${validForPair.join(", ")}`);
		} else {
			console.error(`  No valid edge types for this entity pair.`);
		}
		process.exit(1);
	}

	// Check the field exists on from entity
	const relField = getRelField(fromEntity, edgeType);
	if (!relField) {
		console.error(red(`Cannot apply "${edgeType}" to a ${fromEntity.type}.`));
		process.exit(1);
	}

	// Check for duplicate
	if (relField.isArray) {
		const arr = (fromEntity as any)[relField.field] as string[];
		if (arr.includes(toId)) {
			console.log(
				yellow(
					`${colorId(fromId)} already has ${edgeType} → ${colorId(toId)}.`,
				),
			);
			return;
		}
		// Add to array
		arr.push(toId);
	} else {
		const existing = (fromEntity as any)[relField.field] as string | undefined;
		if (existing === toId) {
			console.log(
				yellow(
					`${colorId(fromId)} already has ${edgeType} → ${colorId(toId)}.`,
				),
			);
			return;
		}
		if (existing) {
			console.error(
				yellow(
					`${colorId(fromId)} already has ${edgeType} → ${colorId(existing)}. Overwriting.`,
				),
			);
		}
		(fromEntity as any)[relField.field] = toId;
	}

	// If conflicts_with, add the reverse too
	if (edgeType === "conflicts_with") {
		const toReq = toEntity as Requirement;
		if (!toReq.conflicts_with.includes(fromId)) {
			toReq.conflicts_with.push(fromId);
			updateEntity(process.cwd(), toReq);
		}
	}

	// If supersedes, mark the old decision as superseded
	if (edgeType === "supersedes") {
		const toDecision = toEntity as Decision;
		if (toDecision.status !== "superseded") {
			toDecision.status = "superseded";
			updateEntity(process.cwd(), toDecision);
			console.log(dim(`  Marked ${colorId(toId)} as superseded.`));
		}
	}

	// Write updated entity
	updateEntity(process.cwd(), fromEntity);
	console.log(
		green(`✓ Linked ${colorId(fromId)} ──${edgeType}──▶ ${colorId(toId)}`),
	);
}

export function unlinkCommand(
	fromId: string,
	toId: string,
	options?: { type?: string },
): void {
	requireAradProject();

	const fromEntity = readEntityById(process.cwd(), fromId);
	if (!fromEntity) {
		console.error(`${colorId(fromId)} not found.`);
		process.exit(1);
	}
	const toEntity = readEntityById(process.cwd(), toId);
	// Don't require toEntity to exist — might be cleaning up a dangling ref

	// Determine which edge types to check
	let edgeTypesToCheck: EdgeType[];
	if (options?.type) {
		edgeTypesToCheck = [options.type as EdgeType];
	} else {
		// Check all possible fields on fromEntity
		const allFields = getAllRelFields(fromEntity);
		edgeTypesToCheck = allFields;
	}

	let removed = false;

	for (const edgeType of edgeTypesToCheck) {
		const relField = getRelField(fromEntity, edgeType);
		if (!relField) continue;

		if (relField.isArray) {
			const arr = (fromEntity as any)[relField.field] as string[];
			const idx = arr.indexOf(toId);
			if (idx !== -1) {
				arr.splice(idx, 1);
				removed = true;
				console.log(
					green(`✓ Removed ${edgeType}: ${colorId(fromId)} → ${colorId(toId)}`),
				);
			}
		} else {
			if ((fromEntity as any)[relField.field] === toId) {
				(fromEntity as any)[relField.field] = undefined;
				removed = true;
				console.log(
					green(`✓ Removed ${edgeType}: ${colorId(fromId)} → ${colorId(toId)}`),
				);
			}
		}
	}

	// If conflicts_with, remove reverse too
	if (
		toEntity &&
		fromEntity.type === "requirement" &&
		toEntity.type === "requirement"
	) {
		const toReq = toEntity as Requirement;
		const idx = toReq.conflicts_with.indexOf(fromId);
		if (idx !== -1) {
			toReq.conflicts_with.splice(idx, 1);
			updateEntity(process.cwd(), toReq);
			console.log(
				green(
					`✓ Removed reverse conflicts_with: ${colorId(toId)} → ${colorId(fromId)}`,
				),
			);
		}
	}

	if (!removed) {
		console.log(
			yellow(
				`No relationship found from ${colorId(fromId)} to ${colorId(toId)}.`,
			),
		);
		return;
	}

	updateEntity(process.cwd(), fromEntity);
}

function getAllRelFields(entity: Entity): EdgeType[] {
	switch (entity.type) {
		case "decision":
			return ["driven_by", "enables", "supersedes", "affects"];
		case "requirement":
			return ["derived_from", "conflicts_with", "requested_by"];
		case "idea":
			return ["inspired_by"];
		case "risk":
			return ["mitigated_by"];
		default:
			return [];
	}
}
