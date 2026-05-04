/**
 * Typed error classes for pure command functions.
 *
 * These allow CLI wrappers and MCP server to handle errors differently:
 * - CLI: format and console.error, then process.exit
 * - MCP: return structured error messages
 */

export class AradError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AradError";
	}
}

export class NotAnAradProject extends AradError {
	constructor() {
		super("Not an ARAD project. Run `arad init` first.");
		this.name = "NotAnAradProject";
	}
}

export class EntityNotFound extends AradError {
	constructor(public readonly id: string) {
		super(`Entity ${id} not found.`);
		this.name = "EntityNotFound";
	}
}

export class ValidationError extends AradError {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}

export class HasDependents extends AradError {
	public readonly dependentIds: string[];

	constructor(
		public readonly entityId: string,
		dependents: { id: string; title: string }[],
	) {
		super(
			`${entityId} is referenced by ${dependents.length} other entities: ${dependents.map((d) => d.id).join(", ")}`,
		);
		this.name = "HasDependents";
		this.dependentIds = dependents.map((d) => d.id);
	}
}

export class DuplicateLink extends AradError {
	constructor(
		public readonly fromId: string,
		public readonly toId: string,
		public readonly edgeType: string,
	) {
		super(`${fromId} already has ${edgeType} → ${toId}.`);
		this.name = "DuplicateLink";
	}
}

export class NoRelationshipFound extends AradError {
	constructor(
		public readonly fromId: string,
		public readonly toId: string,
	) {
		super(`No relationship found from ${fromId} to ${toId}.`);
		this.name = "NoRelationshipFound";
	}
}

export class AmbiguousEdge extends AradError {
	public readonly validTypes: string[];

	constructor(
		public readonly fromType: string,
		public readonly toType: string,
		validTypes: string[],
	) {
		super(
			`Ambiguous relationship between ${fromType} → ${toType}. Specify --type: ${validTypes.join(", ")}`,
		);
		this.name = "AmbiguousEdge";
		this.validTypes = validTypes;
	}
}

export class InvalidEdge extends AradError {
	public readonly validTypes: string[];

	constructor(
		fromType: string,
		toType: string,
		edgeType: string,
		validTypes: string[],
	) {
		super(
			`Edge type "${edgeType}" is not valid for ${fromType} → ${toType}. Valid: ${validTypes.join(", ")}`,
		);
		this.name = "InvalidEdge";
		this.validTypes = validTypes;
	}
}

export class NoValidEdge extends AradError {
	constructor(
		public readonly fromType: string,
		public readonly toType: string,
	) {
		super(`No valid relationship from ${fromType} to ${toType}.`);
		this.name = "NoValidEdge";
	}
}

export class SelfReference extends AradError {
	constructor(public readonly id: string) {
		super(`Cannot link an entity to itself (${id}).`);
		this.name = "SelfReference";
	}
}

export class AlreadyInStatus extends AradError {
	constructor(
		public readonly id: string,
		public readonly status: string,
	) {
		super(`${id} is already ${status}.`);
		this.name = "AlreadyInStatus";
	}
}

export class WrongType extends AradError {
	constructor(
		public readonly id: string,
		public readonly actualType: string,
		public readonly expectedType: string,
	) {
		super(
			`${id} is a ${actualType}, not a ${expectedType}.`,
		);
		this.name = "WrongType";
	}
}

export class TypeMismatch extends AradError {
	constructor(
		public readonly oldId: string,
		public readonly oldType: string,
		public readonly newId: string,
		public readonly newType: string,
	) {
		super(
			`Cannot rename ${oldType} ${oldId} to ${newId}: type mismatch (would become ${newType}).`,
		);
		this.name = "TypeMismatch";
	}
}

export class EntityAlreadyExists extends AradError {
	constructor(public readonly id: string) {
		super(`Entity ${id} already exists.`);
		this.name = "EntityAlreadyExists";
	}
}

export class InvalidStatus extends AradError {
	constructor(
		public readonly status: string,
		public readonly validStatuses: string[],
	) {
		super(
			`Invalid status "${status}". Must be one of: ${validStatuses.join(", ")}`,
		);
		this.name = "InvalidStatus";
	}
}
