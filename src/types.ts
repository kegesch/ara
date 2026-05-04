// Core type definitions for ARAD

export type EntityType =
	| "requirement"
	| "assumption"
	| "decision"
	| "idea"
	| "stakeholder"
	| "risk"
	| "term";

export type RequirementStatus =
	| "draft"
	| "accepted"
	| "deprecated"
	| "rejected";
export type AssumptionStatus = "unvalidated" | "validated" | "invalidated";
export type DecisionStatus =
	| "proposed"
	| "accepted"
	| "deprecated"
	| "superseded";
export type IdeaStatus = "explore" | "parked" | "rejected" | "promoted";
export type StakeholderStatus = "active" | "inactive";
export type RiskStatus =
	| "identified"
	| "mitigated"
	| "accepted"
	| "materialized"
	| "closed";
export type TermStatus = "draft" | "accepted" | "deprecated";
export type EntityStatus =
	| RequirementStatus
	| AssumptionStatus
	| DecisionStatus
	| IdeaStatus
	| StakeholderStatus
	| RiskStatus
	| TermStatus;

export type EntityTypePrefix = "R" | "A" | "D" | "I" | "S" | "K" | "T";

export interface EntityBase {
	id: string;
	title: string;
	date: string;
	tags: string[];
	body: string;
	filePath: string;
	context?: string;
}

export interface Requirement extends EntityBase {
	type: "requirement";
	status: RequirementStatus;
	derived_from: string[];
	conflicts_with: string[];
	requested_by: string[];
}

export interface Assumption extends EntityBase {
	type: "assumption";
	status: AssumptionStatus;
	promoted_to?: string;
}

export interface Decision extends EntityBase {
	type: "decision";
	status: DecisionStatus;
	driven_by: string[];
	enables: string[];
	supersedes?: string;
	affects: string[];
}

export interface Idea extends EntityBase {
	type: "idea";
	status: IdeaStatus;
	inspired_by: string[];
	promoted_to?: string;
}

export interface Stakeholder extends EntityBase {
	type: "stakeholder";
	status: StakeholderStatus;
}

export interface Risk extends EntityBase {
	type: "risk";
	status: RiskStatus;
	mitigated_by: string[];
}

export interface Term extends EntityBase {
	type: "term";
	status: TermStatus;
}

export type Entity =
	| Requirement
	| Assumption
	| Decision
	| Idea
	| Stakeholder
	| Risk
	| Term;

export type EdgeType =
	| "driven_by"
	| "derived_from"
	| "conflicts_with"
	| "enables"
	| "supersedes"
	| "promoted_to"
	| "inspired_by"
	| "requested_by"
	| "affects"
	| "mitigated_by"
	| "disambiguates_from";

export interface Edge {
	from: string;
	to: string;
	type: EdgeType;
}

export interface AradGraph {
	entities: Map<string, Entity>;
	edges: Edge[];
	outgoing: Map<string, Edge[]>;
	incoming: Map<string, Edge[]>;
	byContext: Map<string, Entity[]>;
}

// ENTITY_CONFIG is now derived from entity descriptors.
// Import from entities/registry instead.
export { ENTITY_CONFIG } from "./entities/registry";

export function getTypeFromId(id: string): EntityType {
	if (id.startsWith("R-")) return "requirement";
	if (id.startsWith("A-")) return "assumption";
	if (id.startsWith("D-")) return "decision";
	if (id.startsWith("I-")) return "idea";
	if (id.startsWith("S-")) return "stakeholder";
	if (id.startsWith("K-")) return "risk";
	if (id.startsWith("T-")) return "term";
	throw new Error(
		`Unknown ID prefix in "${id}". Expected R-, A-, D-, I-, S-, K-, or T-.`,
	);
}
