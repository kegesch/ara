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
	Requirement,
} from "../types.js";
import {
	VALID_EDGES,
	getAllRelFields,
	getRelField,
	inferEdgeType,
} from "../entities/registry.js";

export { VALID_EDGES } from "../entities/registry.js";

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
	const relField = getRelField(fromEntity.type, edgeType);
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
		edgeTypesToCheck = getAllRelFields(fromEntity.type);
	}

	let removed = false;

	for (const edgeType of edgeTypesToCheck) {
		const relField = getRelField(fromEntity.type, edgeType);
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
