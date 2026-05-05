// arad trace <id>
import { readAllEntities, requireAradProject } from '../io/files.js';
import { buildGraph, traceUp } from '../graph/graph.js';
import { findUnvalidatedAssumptions } from '../graph/analysis.js';
import { formatTraceTree, colorId, yellow, dim } from '../display/format.js';
import type { Entity } from '../types.js';

export function traceCommand(id: string): void {
  requireAradProject();

  const entities = readAllEntities();
  const graph = buildGraph(entities);

  if (!graph.entities.has(id)) {
    console.error(`Entity ${colorId(id)} not found.`);
    return;
  }

  const tree = traceUp(graph, id);
  if (!tree) {
    console.error('Could not build trace tree.');
    return;
  }

  const lines = formatTraceTree(tree);
  console.log(lines.join('\n'));

  // Summarize
  const unvalidated = findUnvalidatedInTree(tree);
  if (unvalidated.length > 0) {
    console.log('');
    console.log(yellow(`⚠ ${unvalidated.length} unvalidated assumption(s) in this trace:`));
    for (const a of unvalidated) {
      console.log(`  ○ ${colorId(a.id)} ${a.title}`);
    }
  }
}

interface TreeNode {
  entity: Entity;
  children: TreeNode[];
}

function findUnvalidatedInTree(node: TreeNode): Entity[] {
  const result: Entity[] = [];
  if (node.entity.type === 'assumption' && node.entity.status === 'unvalidated') {
    result.push(node.entity);
  }
  for (const child of node.children) {
    result.push(...findUnvalidatedInTree(child));
  }
  return result;
}
