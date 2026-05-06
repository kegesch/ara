// arad validate/invalidate/promote <id>

import {
	colorId,
	dim,
	formatEntityBrief,
	green,
	red,
	yellow,
} from "../display/format.js";
import { buildGraph, getDependents, impactAnalysis } from "../graph/graph.js";
import {
	getNextId,
	isAradProject,
	readAllEntities,
	requireAradProject,
	updateEntity,
	withLock,
	writeEntity,
} from "../io/files.js";
import type { Assumption, Entity, Idea } from "../types.js";
import {
	AlreadyInStatus,
	EntityNotFound,
	NotAnAradProject,
	WrongType,
} from "../core/errors.js";

// ─── Pure logic: validate ───

export interface ValidateResult {
	entity: Assumption;
}

export function performValidate(dir: string, id: string): ValidateResult {
	if (!isAradProject(dir)) throw new NotAnAradProject();

	const entities = readAllEntities(dir);
	const entity = entities.find((e) => e.id === id);
	if (!entity) throw new EntityNotFound(id);
	if (entity.type !== "assumption") throw new WrongType(id, entity.type, "assumption");
	if (entity.status === "validated") throw new AlreadyInStatus(id, "validated");

	entity.status = "validated";
	updateEntity(dir, entity);

	return { entity };
}

// ─── Pure logic: invalidate ───

export interface InvalidateOptions {
	deriveRequirement?: string;
}

export interface InvalidateResult {
	entity: Assumption;
	affected: {
		direct: Entity[];
		transitive: Entity[];
	};
	derivedRequirement?: Entity;
	relinkedDecisions?: number;
}

export function performInvalidate(
	dir: string,
	id: string,
	options?: InvalidateOptions,
): InvalidateResult {
	if (!isAradProject(dir)) throw new NotAnAradProject();

	const entities = readAllEntities(dir);
	const graph = buildGraph(entities);
	const entity = entities.find((e) => e.id === id);
	if (!entity) throw new EntityNotFound(id);
	if (entity.type !== "assumption") throw new WrongType(id, entity.type, "assumption");
	if (entity.status === "invalidated") throw new AlreadyInStatus(id, "invalidated");

	entity.status = "invalidated";
	updateEntity(dir, entity);

	const { direct, transitive } = impactAnalysis(graph, id);

	const result: InvalidateResult = {
		entity,
		affected: { direct, transitive },
	};

	// If --derive-requirement is specified, create a new requirement and
	// re-link all decisions that were driven_by this assumption
	if (options?.deriveRequirement) {
		const newId = getNextId(dir, "requirement");
		const requirement = {
			type: "requirement" as const,
			id: newId,
			title: options.deriveRequirement,
			status: "accepted" as const,
			date: new Date().toISOString().split("T")[0],
			tags: [...entity.tags],
			derived_from: [] as string[],
			conflicts_with: [] as string[],
			requested_by: [] as string[],
			body: `Derived from invalidated ${entity.id}: "${entity.title}"`,
			filePath: "",
		};
		writeEntity(dir, requirement);
		result.derivedRequirement = requirement;

		// Re-link: find decisions driven by this assumption, add new requirement, remove old assumption
		const dependents = getDependents(graph, entity.id);
		let relinkedCount = 0;
		for (const dep of dependents) {
			if (
				dep.type === "decision" &&
				dep.driven_by
			) {
				// Add new requirement to driven_by
				if (!dep.driven_by.includes(newId)) {
					dep.driven_by.push(newId);
				}
				// Remove old assumption from driven_by
				const idx = dep.driven_by.indexOf(entity.id);
				if (idx !== -1) {
					dep.driven_by.splice(idx, 1);
				}
				updateEntity(dir, dep);
				relinkedCount++;
			}
		}
		result.relinkedDecisions = relinkedCount;
	}

	return result;
}

// ─── Pure logic: promote ───

export interface PromoteResult {
	sourceEntity: Entity;
	newEntity: Entity;
	linkedDecisions: number;
}

export function performPromote(
	dir: string,
	id: string,
	targetType?: "requirement" | "decision",
): PromoteResult {
	if (!isAradProject(dir)) throw new NotAnAradProject();

	const entities = readAllEntities(dir);
	const entity = entities.find((e) => e.id === id);
	if (!entity) throw new EntityNotFound(id);

	if (entity.type === "assumption") {
		return promoteAssumption(dir, entity, entities);
	} else if (entity.type === "idea") {
		return promoteIdea(dir, entity, targetType || "requirement");
	} else {
		throw new WrongType(id, entity.type, "assumption or idea");
	}
}

function promoteAssumption(
	dir: string,
	entity: Assumption,
	entities: Entity[],
): PromoteResult {
	if (entity.status !== "validated") {
		throw new Error(
			`${entity.id} must be validated before it can be promoted to a requirement.`,
		);
	}

	const newId = getNextId(dir, "requirement");

	const requirement = {
		type: "requirement" as const,
		id: newId,
		title: entity.title,
		status: "accepted" as const,
		date: new Date().toISOString().split("T")[0],
		tags: [...entity.tags],
		derived_from: [] as string[],
		conflicts_with: [] as string[],
		requested_by: [] as string[],
		body: entity.body,
		filePath: "",
	};

	writeEntity(dir, requirement);

	entity.promoted_to = newId;
	updateEntity(dir, entity);

	// Auto-link: find all decisions driven by this assumption and add the new requirement
	const graph = buildGraph(entities);
	const dependents = getDependents(graph, entity.id);
	let linkedCount = 0;
	for (const dep of dependents) {
		if (
			dep.type === "decision" &&
			dep.driven_by &&
			!dep.driven_by.includes(newId)
		) {
			dep.driven_by.push(newId);
			updateEntity(dir, dep);
			linkedCount++;
		}
	}

	return {
		sourceEntity: entity,
		newEntity: requirement,
		linkedDecisions: linkedCount,
	};
}

function promoteIdea(
	dir: string,
	entity: Idea,
	targetType: "requirement" | "decision",
): PromoteResult {
	const newId = getNextId(dir, targetType);

	if (targetType === "requirement") {
		const requirement = {
			type: "requirement" as const,
			id: newId,
			title: entity.title,
			status: "draft" as const,
			date: new Date().toISOString().split("T")[0],
			tags: [...entity.tags],
			derived_from: [] as string[],
			conflicts_with: [] as string[],
			requested_by: [] as string[],
			body: entity.body,
			filePath: "",
		};
		writeEntity(dir, requirement);
		entity.promoted_to = newId;
		entity.status = "promoted";
		updateEntity(dir, entity);
		return { sourceEntity: entity, newEntity: requirement, linkedDecisions: 0 };
	} else {
		const decision = {
			type: "decision" as const,
			id: newId,
			title: entity.title,
			status: "proposed" as const,
			date: new Date().toISOString().split("T")[0],
			tags: [...entity.tags],
			driven_by: [] as string[],
			enables: [] as string[],
			affects: [] as string[],
			body: entity.body,
			filePath: "",
		};
		writeEntity(dir, decision);
		entity.promoted_to = newId;
		entity.status = "promoted";
		updateEntity(dir, entity);
		return { sourceEntity: entity, newEntity: decision, linkedDecisions: 0 };
	}
}

// ─── CLI entry points ───

export function validateCommand(id: string): void {
	requireAradProject();
	try {
		const result = performValidate(process.cwd(), id);
		console.log(
			green(`✓ Validated ${colorId(result.entity.id)}: ${result.entity.title}`),
		);
	} catch (e) {
		handleError(e);
	}
}

export async function invalidateCommand(
	id: string,
	options?: { deriveRequirement?: string },
): Promise<void> {
	requireAradProject();
	try {
		const result = await withLock(process.cwd(), () =>
			performInvalidate(process.cwd(), id, options),
		);
		console.log(
			red(
				`✗ Invalidated ${colorId(result.entity.id)}: ${result.entity.title}`,
			),
		);

		if (result.derivedRequirement) {
			console.log(
				green(
					`✓ Created requirement ${colorId(result.derivedRequirement.id)}: "${result.derivedRequirement.title}"`,
				),
			);
			if (result.relinkedDecisions && result.relinkedDecisions > 0) {
				console.log(
					dim(
						`  Re-linked ${result.relinkedDecisions} decision(s) from ${colorId(result.entity.id)} → ${colorId(result.derivedRequirement.id)}`,
					),
				);
			}
		}

		if (result.affected.direct.length > 0) {
			console.log("");
			console.log(yellow("Affected entities:"));
			for (const dep of result.affected.direct) {
				console.log(`  ${formatEntityBrief(dep)}`);
			}
			if (result.affected.transitive.length > 0) {
				for (const dep of result.affected.transitive) {
					console.log(`  ${formatEntityBrief(dep)}`);
				}
			}
			if (!result.derivedRequirement) {
				console.log("");
				console.log(
					yellow(
						`💡 Create an opposing requirement: arad invalidate ${id} --derive-requirement '...'`,
					),
				);
			}
		}
	} catch (e) {
		handleError(e);
	}
}

export async function promoteCommand(id: string): Promise<void> {
	requireAradProject();

	const targetType =
		(process.env.__ARAD_PROMOTE_TO as "requirement" | "decision") ||
		"requirement";

	try {
		const result = await withLock(process.cwd(), () =>
			performPromote(process.cwd(), id, targetType),
		);

		console.log(
			green(
				`✓ Promoted ${colorId(result.sourceEntity.id)} → ${colorId(result.newEntity.id)}`,
			),
		);
		if (result.sourceEntity.type === "assumption") {
			console.log(
				`  Assumption "${result.sourceEntity.title}" is now requirement ${result.newEntity.id}`,
			);
		} else {
			console.log(
				`  Idea "${result.sourceEntity.title}" graduated to ${targetType} ${result.newEntity.id}`,
			);
		}
		if (result.linkedDecisions > 0) {
			console.log(
				dim(
					`  Auto-linked ${result.linkedDecisions} dependent decision(s) to ${result.newEntity.id}`,
				),
			);
		}
	} catch (e) {
		if (
			e instanceof Error &&
			e.message.includes("must be validated before")
		) {
			console.error(e.message);
			console.log(`  Run: arad validate ${id}`);
			return;
		}
		handleError(e);
	}
}

function handleError(e: unknown): never | void {
	if (e instanceof EntityNotFound) {
		console.error(`Entity ${colorId(e.id)} not found.`);
		return;
	}
	if (e instanceof WrongType) {
		console.error(e.message);
		return;
	}
	if (e instanceof AlreadyInStatus) {
		console.log(`${colorId(e.id)} is already ${e.status}.`);
		return;
	}
	throw e;
}
