// arad query <text>
import { readAllEntities, requireAradProject } from '../io/files.js';
import { searchEntities, type SearchResult } from '../search/fuzzy.js';
import { formatEntityBrief, dim, colorId } from '../display/format.js';

export function queryCommand(query: string): void {
  requireAradProject();

  if (!query.trim()) {
    console.error('Usage: arad query <search terms>');
    console.log('');
    console.log('Examples:');
    console.log('  arad query "sqlite"');
    console.log('  arad query "type:decision status:accepted"');
    console.log('  arad query "driven_by:R-001"');
    console.log('  arad query "tag:storage"');
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
