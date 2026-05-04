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

export const ENTITY_CONFIG: Record<
	EntityType,
	{
		prefix: EntityTypePrefix;
		folder: string;
		statuses: string[];
		template: (title: string) => string;
	}
> = {
	requirement: {
		prefix: "R",
		folder: "requirements",
		statuses: ["draft", "accepted", "deprecated", "rejected"],
		template: (title) =>
			[
				`# Requirement: ${title}`,
				"",
				"## Description",
				"",
				"(Describe the requirement)",
				"",
				"## Acceptance Criteria",
				"",
				"(How do we know this is satisfied?)",
			].join("\n"),
	},
	assumption: {
		prefix: "A",
		folder: "assumptions",
		statuses: ["unvalidated", "validated", "invalidated"],
		template: (title) =>
			[
				`# Assumption: ${title}`,
				"",
				"## Description",
				"",
				"(Describe the assumption)",
				"",
				"## Validation",
				"",
				"(How could this be validated? What evidence would prove/disprove it?)",
			].join("\n"),
	},
	decision: {
		prefix: "D",
		folder: "decisions",
		statuses: ["proposed", "accepted", "deprecated", "superseded"],
		template: (title) =>
			[
				`# Decision: ${title}`,
				"",
				"## Context",
				"",
				"(What is the issue motivating this decision?)",
				"",
				"## Decision",
				"",
				"(What is the change being proposed or made?)",
				"",
				"## Consequences",
				"",
				"(What becomes easier or harder because of this change?)",
			].join("\n"),
	},
	idea: {
		prefix: "I",
		folder: "ideas",
		statuses: ["explore", "parked", "rejected", "promoted"],
		template: (title) =>
			[
				`# Idea: ${title}`,
				"",
				"## What if...",
				"",
				"(Describe the idea)",
				"",
				"## Why interesting",
				"",
				"(What makes this worth exploring?)",
				"",
				"## Open questions",
				"",
				"(What needs to be answered before this can become a decision/requirement?)",
			].join("\n"),
	},
	stakeholder: {
		prefix: "S",
		folder: "stakeholders",
		statuses: ["active", "inactive"],
		template: (title) =>
			[
				`# Stakeholder: ${title}`,
				"",
				"## Description",
				"",
				"(Who is this stakeholder? Team, role, or group)",
				"",
				"## Responsibilities",
				"",
				"(What do they care about? What decisions affect them?)",
			].join("\n"),
	},
	risk: {
		prefix: "K",
		folder: "risks",
		statuses: ["identified", "mitigated", "accepted", "materialized", "closed"],
		template: (title) =>
			[
				`# Risk: ${title}`,
				"",
				"## Description",
				"",
				"(Describe the risk)",
				"",
				"## Likelihood",
				"",
				"(How likely is this to occur? High/Medium/Low)",
				"",
				"## Impact",
				"",
				"(What happens if this materializes?)",
				"",
				"## Mitigation",
				"",
				"(How can this risk be reduced or managed?)",
			].join("\n"),
	},
	term: {
		prefix: "T",
		folder: "terms",
		statuses: ["draft", "accepted", "deprecated"],
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
	},
};

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
