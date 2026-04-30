// Frontmatter parsing for ARAD entity files

import { parse as yamlParse } from 'yaml';
import type { Entity } from '../types';
import { getTypeFromId } from '../types';

export interface RawFrontmatter {
  id: string;
  title: string;
  status?: string;
  date?: string;
  tags?: string[];
  derived_from?: string[];
  conflicts_with?: string[];
  driven_by?: string[];
  enables?: string[];
  supersedes?: string;
  promoted_to?: string;
}

/**
 * Parse a markdown file with YAML frontmatter into an Entity.
 */
export function parseEntity(content: string, filePath: string): Entity {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Invalid entity file: ${filePath}. Missing --- frontmatter delimiters.`);
  }

  const [, frontmatterRaw, bodyRaw] = match;
  let meta: RawFrontmatter;
  try {
    meta = yamlParse(frontmatterRaw) as RawFrontmatter;
  } catch (e) {
    throw new Error(`Invalid YAML in ${filePath}: ${(e as Error).message}`);
  }

  if (!meta.id) throw new Error(`Missing id in ${filePath}`);
  if (!meta.title) throw new Error(`Missing title in ${filePath}`);

  const type = getTypeFromId(meta.id);
  const body = bodyRaw.trim();
  const date = meta.date ?? new Date().toISOString().split('T')[0];
  const tags = meta.tags ?? [];

  const base = {
    id: meta.id,
    title: meta.title,
    date,
    tags,
    body,
    filePath,
  };

  switch (type) {
    case 'requirement':
      return {
        ...base,
        type: 'requirement',
        status: (meta.status as RequirementStatus) ?? 'draft',
        derived_from: meta.derived_from ?? [],
        conflicts_with: meta.conflicts_with ?? [],
      };
    case 'assumption':
      return {
        ...base,
        type: 'assumption',
        status: (meta.status as AssumptionStatus) ?? 'unvalidated',
        promoted_to: meta.promoted_to,
      };
    case 'decision':
      return {
        ...base,
        type: 'decision',
        status: (meta.status as DecisionStatus) ?? 'proposed',
        driven_by: meta.driven_by ?? [],
        enables: meta.enables ?? [],
        supersedes: meta.supersedes,
      };
  }
}

// Re-import status types locally for the cast
type RequirementStatus = 'draft' | 'accepted' | 'deprecated' | 'rejected';
type AssumptionStatus = 'unvalidated' | 'validated' | 'invalidated';
type DecisionStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';

/**
 * Serialize entity frontmatter back to YAML string.
 */
export function serializeFrontmatter(entity: Entity): string {
  const lines: string[] = [];
  lines.push(`id: ${entity.id}`);
  lines.push(`title: "${entity.title.replace(/"/g, '\\"')}"`);
  lines.push(`status: ${entity.status}`);
  lines.push(`date: ${entity.date}`);

  if (entity.tags.length > 0) {
    lines.push(`tags: [${entity.tags.join(', ')}]`);
  }

  switch (entity.type) {
    case 'requirement':
      if (entity.derived_from.length > 0)
        lines.push(`derived_from: [${entity.derived_from.join(', ')}]`);
      if (entity.conflicts_with.length > 0)
        lines.push(`conflicts_with: [${entity.conflicts_with.join(', ')}]`);
      break;
    case 'assumption':
      if (entity.promoted_to)
        lines.push(`promoted_to: ${entity.promoted_to}`);
      break;
    case 'decision':
      if (entity.driven_by.length > 0)
        lines.push(`driven_by: [${entity.driven_by.join(', ')}]`);
      if (entity.enables.length > 0)
        lines.push(`enables: [${entity.enables.join(', ')}]`);
      if (entity.supersedes)
        lines.push(`supersedes: ${entity.supersedes}`);
      break;
  }

  return lines.join('\n') + '\n';
}

/**
 * Build the full markdown file content for an entity.
 */
export function serializeEntity(entity: Entity): string {
  const frontmatter = serializeFrontmatter(entity);
  return `---\n${frontmatter}---\n\n${entity.body}\n`;
}
