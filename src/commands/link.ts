// arad link/unlink <from-id> <to-id> [--type <edge-type>]

import { colorId, dim, green, red, yellow } from "../display/format.js";
import {
	isAradProject,
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
import {
	AmbiguousEdge,
	DuplicateLink,
	EntityNotFound,
	InvalidEdge,
	NoRelationshipFound,
	NoValidEdge,
	NotAnAradProject,
	SelfReference,
} from "../core/errors.js";

export { VALID_EDGES } from "../entities/registry.js";

// ─── Pure logic: link ───

export interface LinkOptions {
	type?: string;
}

export interface LinkResult {
	fromId: string;
	toId: string;
	edgeType: EdgeType;
	sideEffects: string[];
}

/**
 * Create a relationship between two entities.
 *
 * Validates IDs, edge types, and handles side effects (supersedes → mark old as superseded,
 * conflicts_with → add reverse).
 */
export function performLink(
	dir: string,
	fromId: string,
	toId: string,
	options?: LinkOptions,
): LinkResult {
	if (!isAradProject(dir)) throw new NotAnAradProject();

	const fromEntity = readEntityById(dir, fromId);
	if (!fromEntity) throw new EntityNotFound(fromId);
	const toEntity = readEntityById(dir, toId);
	if (!toEntity) throw new EntityNotFound(toId);

	if (fromId === toId) throw new SelfReference(fromId);

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
				throw new AmbiguousEdge(fromEntity.type, toEntity.type, valid);
			} else {
				throw new NoValidEdge(fromEntity.type, toEntity.type);
			}
		}
	}

	// Validate edge type is legal for this entity pair
	const key = `${fromEntity.type}-${toEntity.type}`;
	const validForPair = VALID_EDGES[key];
	if (!validForPair || !validForPair.includes(edgeType)) {
		throw new InvalidEdge(
			fromEntity.type,
			toEntity.type,
			edgeType,
			validForPair ?? [],
		);
	}

	// Check the field exists on from entity
	const relField = getRelField(fromEntity.type, edgeType);

	// Check for duplicate
	if (relField?.isArray) {
		const arr = (fromEntity as any)[relField.field] as string[];
		if (arr.includes(toId)) {
			throw new DuplicateLink(fromId, toId, edgeType);
		}
		arr.push(toId);
	} else if (relField) {
		const existing = (fromEntity as any)[relField.field] as string | undefined;
		if (existing === toId) {
			throw new DuplicateLink(fromId, toId, edgeType);
		}
		// Note: we allow overwriting existing scalar refs (the CLI warns, but the pure function just does it)
		(fromEntity as any)[relField.field] = toId;
	}

	const sideEffects: string[] = [];

	// If conflicts_with, add the reverse too
	if (edgeType === "conflicts_with") {
		const toReq = toEntity as Requirement;
		if (!toReq.conflicts_with.includes(fromId)) {
			toReq.conflicts_with.push(fromId);
			updateEntity(dir, toEntity);
			sideEffects.push(`Added reverse conflicts_with: ${toId} → ${fromId}`);
		}
	}

	// If supersedes, mark the old decision as superseded
	if (edgeType === "supersedes") {
		const toDecision = toEntity as Decision;
		if (toDecision.status !== "superseded") {
			toDecision.status = "superseded";
			updateEntity(dir, toEntity);
			sideEffects.push(`Marked ${toId} as superseded`);
		}
	}

	// Write updated entity
	updateEntity(dir, fromEntity);

	return { fromId, toId, edgeType, sideEffects };
}

// ─── Pure logic: unlink ───

export interface UnlinkOptions {
	type?: string;
}

export interface UnlinkResult {
	fromId: string;
	toId: string;
	removedEdgeTypes: EdgeType[];
	sideEffects: string[];
}

/**
 * Remove a relationship between two entities.
 */
export function performUnlink(
	dir: string,
	fromId: string,
	toId: string,
	options?: UnlinkOptions,
): UnlinkResult {
	if (!isAradProject(dir)) throw new NotAnAradProject();

	const fromEntity = readEntityById(dir, fromId);
	if (!fromEntity) throw new EntityNotFound(fromId);
	const toEntity = readEntityById(dir, toId);
	// Don't require toEntity to exist — might be cleaning up a dangling ref

	// Determine which edge types to check
	let edgeTypesToCheck: EdgeType[];
	if (options?.type) {
		edgeTypesToCheck = [options.type as EdgeType];
	} else {
		edgeTypesToCheck = getAllRelFields(fromEntity.type);
	}

	const removedEdgeTypes: EdgeType[] = [];
	const sideEffects: string[] = [];

	for (const edgeType of edgeTypesToCheck) {
		const relField = getRelField(fromEntity.type, edgeType);
		if (!relField) continue;

		if (relField.isArray) {
			const arr = (fromEntity as any)[relField.field] as string[];
			const idx = arr.indexOf(toId);
			if (idx !== -1) {
				arr.splice(idx, 1);
				removedEdgeTypes.push(edgeType);
			}
		} else {
			if ((fromEntity as any)[relField.field] === toId) {
				(fromEntity as any)[relField.field] = undefined;
				removedEdgeTypes.push(edgeType);
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
			updateEntity(dir, toEntity);
			sideEffects.push(
				`Removed reverse conflicts_with: ${toId} → ${fromId}`,
			);
		}
	}

	if (removedEdgeTypes.length === 0) {
		throw new NoRelationshipFound(fromId, toId);
	}

	updateEntity(dir, fromEntity);

	return { fromId, toId, removedEdgeTypes, sideEffects };
}

// ─── CLI entry points ───

export function linkCommand(
	fromId: string,
	toId: string,
	options?: LinkOptions,
): void {
	requireAradProject();

	try {
		const result = performLink(process.cwd(), fromId, toId, options);

		console.log(
			green(
				`✓ Linked ${colorId(result.fromId)} ──${result.edgeType}──▶ ${colorId(result.toId)}`,
			),
		);
		for (const effect of result.sideEffects) {
			console.log(dim(`  ${effect}`));
		}
	} catch (e) {
		handleLinkError(e);
	}
}

export function unlinkCommand(
	fromId: string,
	toId: string,
	options?: UnlinkOptions,
): void {
	requireAradProject();

	try {
		const result = performUnlink(process.cwd(), fromId, toId, options);

		for (const edgeType of result.removedEdgeTypes) {
			console.log(
				green(
					`✓ Removed ${edgeType}: ${colorId(result.fromId)} → ${colorId(result.toId)}`,
				),
			);
		}
		for (const effect of result.sideEffects) {
			console.log(dim(`  ${effect}`));
		}
	} catch (e) {
		if (e instanceof NoRelationshipFound) {
			console.log(
				yellow(
					`No relationship found from ${colorId(e.fromId)} to ${colorId(e.toId)}.`,
				),
			);
			return;
		}
		if (e instanceof EntityNotFound) {
			console.error(`${colorId(e.id)} not found.`);
			process.exit(1);
		}
		throw e;
	}
}

function handleLinkError(e: unknown): never | void {
	if (e instanceof EntityNotFound) {
		console.error(`${colorId(e.id)} not found.`);
		process.exit(1);
	}
	if (e instanceof SelfReference) {
		console.error(red(e.message));
		process.exit(1);
	}
	if (e instanceof AmbiguousEdge) {
		console.error(
			yellow(
				`Ambiguous relationship between ${e.fromType} → ${e.toType}.`,
			),
		);
		console.error(`  Specify --type: ${e.validTypes.join(", ")}`);
		process.exit(1);
	}
	if (e instanceof NoValidEdge) {
		console.error(
			red(
				`No valid relationship from ${e.fromType} to ${e.toType}.`,
			),
		);
		process.exit(1);
	}
	if (e instanceof InvalidEdge) {
		console.error(red(e.message));
		process.exit(1);
	}
	if (e instanceof DuplicateLink) {
		console.log(
			yellow(
				`${colorId(e.fromId)} already has ${e.edgeType} → ${colorId(e.toId)}.`,
			),
		);
		return; // not an error exit
	}
	throw e;
}
