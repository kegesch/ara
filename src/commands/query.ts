// arc query <text>
import { readAllEntities, requireArcProject } from '../io/files.js';
import { searchEntities, type SearchResult } from '../search/fuzzy.js';
import { formatEntityBrief, dim, colorId } from '../display/format.js';

export function queryCommand(query: string): void {
  requireArcProject();

  if (!query.trim()) {
    console.error('Usage: arc query <search terms>');
    console.log('');
    console.log('Examples:');
    console.log('  arc query "sqlite"');
    console.log('  arc query "type:decision status:accepted"');
    console.log('  arc query "driven_by:R-001"');
    console.log('  arc query "tag:storage"');
    return;
  }

  const entities = readAllEntities();
  const results = searchEntities(entities, query);

  if (results.length === 0) {
    console.log('No results found.');
    return;
  }

  for (const result of results) {
    const matchInfo = result.matches.length > 0
      ? dim(` [${result.matches.join(', ')}]`)
      : '';
    console.log(`${formatEntityBrief(result.entity)}${matchInfo}`);
  }

  console.log('');
  console.log(dim(`${results.length} result(s)`));
}
