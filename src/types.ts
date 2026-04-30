// Core type definitions for ARAD

export type EntityType = 'requirement' | 'assumption' | 'decision';

export type RequirementStatus = 'draft' | 'accepted' | 'deprecated' | 'rejected';
export type AssumptionStatus = 'unvalidated' | 'validated' | 'invalidated';
export type DecisionStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';
export type EntityStatus = RequirementStatus | AssumptionStatus | DecisionStatus;

export type EntityTypePrefix = 'R' | 'A' | 'D';

export interface EntityBase {
  id: string;
  title: string;
  date: string;
  tags: string[];
  body: string;
  filePath: string;
}

export interface Requirement extends EntityBase {
  type: 'requirement';
  status: RequirementStatus;
  derived_from: string[];
  conflicts_with: string[];
}

export interface Assumption extends EntityBase {
  type: 'assumption';
  status: AssumptionStatus;
  promoted_to?: string;
}

export interface Decision extends EntityBase {
  type: 'decision';
  status: DecisionStatus;
  driven_by: string[];
  enables: string[];
  supersedes?: string;
}

export type Entity = Requirement | Assumption | Decision;

export type EdgeType =
  | 'driven_by'
  | 'derived_from'
  | 'conflicts_with'
  | 'enables'
  | 'supersedes'
  | 'promoted_to';

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
}

export const ENTITY_CONFIG: Record<EntityType, {
  prefix: EntityTypePrefix;
  folder: string;
  statuses: string[];
  template: (title: string) => string;
}> = {
  requirement: {
    prefix: 'R',
    folder: 'requirements',
    statuses: ['draft', 'accepted', 'deprecated', 'rejected'],
    template: (title) => [
      `# Requirement: ${title}`,
      '',
      '## Description',
      '',
      '(Describe the requirement)',
      '',
      '## Acceptance Criteria',
      '',
      '(How do we know this is satisfied?)',
    ].join('\n'),
  },
  assumption: {
    prefix: 'A',
    folder: 'assumptions',
    statuses: ['unvalidated', 'validated', 'invalidated'],
    template: (title) => [
      `# Assumption: ${title}`,
      '',
      '## Description',
      '',
      '(Describe the assumption)',
      '',
      '## Validation',
      '',
      '(How could this be validated? What evidence would prove/disprove it?)',
    ].join('\n'),
  },
  decision: {
    prefix: 'D',
    folder: 'decisions',
    statuses: ['proposed', 'accepted', 'deprecated', 'superseded'],
    template: (title) => [
      `# Decision: ${title}`,
      '',
      '## Context',
      '',
      '(What is the issue motivating this decision?)',
      '',
      '## Decision',
      '',
      '(What is the change being proposed or made?)',
      '',
      '## Consequences',
      '',
      '(What becomes easier or harder because of this change?)',
    ].join('\n'),
  },
};

export function getTypeFromId(id: string): EntityType {
  if (id.startsWith('R-')) return 'requirement';
  if (id.startsWith('A-')) return 'assumption';
  if (id.startsWith('D-')) return 'decision';
  throw new Error(`Unknown ID prefix in "${id}". Expected R-, A-, or D-.`);
}
