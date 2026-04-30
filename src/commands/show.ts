// arad show <id>
import { readAllEntities, requireAradProject } from '../io/files.js';
import { buildGraph, getDependents, getDependencies } from '../graph/graph.js';
import { formatEntityDetail, colorId, statusIcon, typeColor } from '../display/format.js';
import type { Entity } from '../types.js';

export function showCommand(id: string): void {
  requireAradProject();

  const entities = readAllEntities();
  const entity = entities.find(e => e.id === id);

  if (!entity) {
    console.error(`Entity ${id} not found.`);
    return;
  }

  // Show entity detail
  console.log(formatEntityDetail(entity));

  // Show immediate relationships
  const graph = buildGraph(entities);
  const dependents = getDependents(graph, id);
  const dependencies = getDependencies(graph, id);

  if (dependencies.length > 0) {
    console.log(`\nDepends on:`);
    for (const dep of dependencies) {
      const tc = typeColor(dep.type);
      console.log(`  ${statusIcon(dep.status)} ${colorId(dep.id)} ${dep.title}`);
    }
  }

  if (dependents.length > 0) {
    console.log(`\nReferenced by:`);
    for (const dep of dependents) {
      const tc = typeColor(dep.type);
      console.log(`  ${statusIcon(dep.status)} ${colorId(dep.id)} ${dep.title}`);
    }
  }

  console.log(`\n  ${entity.filePath}`);
}
