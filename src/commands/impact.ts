// arad impact <id>
import { readAllEntities, requireAradProject } from '../io/files.js';
import { buildGraph, impactAnalysis } from '../graph/graph.js';
import { formatEntityBrief, colorId, red, yellow, bold, dim } from '../display/format.js';

export function impactCommand(id: string): void {
  requireAradProject();

  const entities = readAllEntities();
  const graph = buildGraph(entities);

  const entity = graph.entities.get(id);
  if (!entity) {
    console.error(`Entity ${colorId(id)} not found.`);
    return;
  }

  const { direct, transitive } = impactAnalysis(graph, id);

  const statusWarning = entity.type === 'assumption' && entity.status === 'unvalidated'
    ? yellow(' (unvalidated)')
    : entity.type === 'assumption' && entity.status === 'invalidated'
    ? red(' (invalidated)')
    : '';

  console.log(bold(`Impact of changing ${colorId(id)} "${entity.title}"${statusWarning}:`));
  console.log('');

  if (direct.length === 0) {
    console.log(dim('  No direct dependents.'));
    return;
  }

  console.log('Direct dependents:');
  for (const dep of direct) {
    console.log(`  ${formatEntityBrief(dep)}`);
  }

  if (transitive.length > 0) {
    console.log('');
    console.log('Transitive impact:');
    for (const dep of transitive) {
      console.log(`  ${formatEntityBrief(dep)}`);
    }
  }

  const total = direct.length + transitive.length;
  console.log('');
  console.log(dim(`  ${total} entities affected (${direct.length} direct, ${transitive.length} transitive)`));
}
