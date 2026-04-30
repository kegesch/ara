// arad validate/invalidate/promote <id>
import { readAllEntities, requireAradProject, updateEntity } from '../io/files.js';
import { buildGraph, impactAnalysis, getDependents } from '../graph/graph.js';
import { formatEntityBrief, colorId, red, green, yellow, bold, dim } from '../display/format.js';
import type { Assumption } from '../types.js';

export function validateCommand(id: string): void {
  requireAradProject();
  const entities = readAllEntities();
  const entity = entities.find(e => e.id === id);

  if (!entity) {
    console.error(`Entity ${colorId(id)} not found.`);
    return;
  }

  if (entity.type !== 'assumption') {
    console.error(`${colorId(id)} is a ${entity.type}, not an assumption. Only assumptions can be validated.`);
    return;
  }

  if (entity.status === 'validated') {
    console.log(`${colorId(id)} is already validated.`);
    return;
  }

  entity.status = 'validated';
  updateEntity(process.cwd(), entity);
  console.log(green(`✓ Validated ${colorId(id)}: ${entity.title}`));
}

export function invalidateCommand(id: string): void {
  requireAradProject();
  const entities = readAllEntities();
  const graph = buildGraph(entities);
  const entity = entities.find(e => e.id === id);

  if (!entity) {
    console.error(`Entity ${colorId(id)} not found.`);
    return;
  }

  if (entity.type !== 'assumption') {
    console.error(`${colorId(id)} is a ${entity.type}, not an assumption. Only assumptions can be invalidated.`);
    return;
  }

  if (entity.status === 'invalidated') {
    console.log(`${colorId(id)} is already invalidated.`);
    return;
  }

  entity.status = 'invalidated';
  updateEntity(process.cwd(), entity);

  console.log(red(`✗ Invalidated ${colorId(id)}: ${entity.title}`));

  // Show impact
  const { direct, transitive } = impactAnalysis(graph, id);
  if (direct.length > 0) {
    console.log('');
    console.log(yellow('Affected decisions:'));
    for (const dep of direct) {
      console.log(`  ${formatEntityBrief(dep)}`);
    }
    if (transitive.length > 0) {
      for (const dep of transitive) {
        console.log(`  ${formatEntityBrief(dep)}`);
      }
    }
    console.log('');
    console.log(yellow(`⚠ ${direct.length + transitive.length} entities may need review`));
  }
}

export function promoteCommand(id: string): void {
  requireAradProject();
  const entities = readAllEntities();
  const entity = entities.find(e => e.id === id);

  if (!entity) {
    console.error(`Entity ${colorId(id)} not found.`);
    return;
  }

  if (entity.type !== 'assumption') {
    console.error(`${colorId(id)} is a ${entity.type}, not an assumption. Only assumptions can be promoted.`);
    return;
  }

  if (entity.status !== 'validated') {
    console.error(`${colorId(id)} must be validated before it can be promoted to a requirement.`);
    console.log(`  Run: arad validate ${id}`);
    return;
  }

  // Create a new requirement from this assumption
  const { getNextId, writeEntity } = require('../io/files.js') as typeof import('../io/files.js');
  const newId = getNextId(process.cwd(), 'requirement');

  const requirement = {
    type: 'requirement' as const,
    id: newId,
    title: entity.title,
    status: 'accepted' as const,
    date: new Date().toISOString().split('T')[0],
    tags: [...entity.tags],
    derived_from: [],
    conflicts_with: [],
    body: entity.body,
    filePath: '',
  };

  writeEntity(process.cwd(), requirement);

  // Update the assumption to link to the new requirement
  entity.promoted_to = newId;
  updateEntity(process.cwd(), entity);

  console.log(green(`✓ Promoted ${colorId(id)} → ${colorId(newId)}`));
  console.log(`  Assumption "${entity.title}" is now requirement ${newId}`);
}
