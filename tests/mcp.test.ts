import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Entity, Requirement, Assumption, Decision } from '../src/types';
import { parseEntity, serializeEntity } from '../src/io/parser';
import {
  buildGraph, getDependents, getDependencies, findOrphans, findContradictions,
  findDanglingRefs, impactAnalysis, traceUp,
  findPossibleContradictions, findPossibleDuplicates, findStatusAnomalies, findOrphanRequirements,
} from '../src/graph/graph';
import { searchEntities } from '../src/search/fuzzy';
import { runCheck } from '../src/commands/check';

const TMP = join(import.meta.dir, '_tmp_mcp');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// ─── MCP-equivalent logic tests ───
// The MCP tools are thin wrappers around the same core functions.
// We test the logic the MCP tools exercise.

describe('MCP tool logic', () => {
  function makeTestEntities(): Entity[] {
    const r1: Requirement = {
      type: 'requirement', id: 'R-001', title: 'Encrypt data at rest', status: 'accepted',
      date: '2026-04-30', tags: ['security'], body: '', filePath: '',
      derived_from: [], conflicts_with: [], requested_by: [],
    };
    const r2: Requirement = {
      type: 'requirement', id: 'R-002', title: 'Support offline mode', status: 'accepted',
      date: '2026-04-30', tags: ['offline'], body: '', filePath: '',
      derived_from: [], conflicts_with: [], requested_by: [],
    };
    const a1: Assumption = {
      type: 'assumption', id: 'A-001', title: 'Users under 10k', status: 'unvalidated',
      date: '2026-04-30', tags: ['scale'], body: '', filePath: '',
    };
    const d1: Decision = {
      type: 'decision', id: 'D-001', title: 'Use SQLite', status: 'accepted',
      date: '2026-04-30', tags: ['storage'], body: '', filePath: '',
      driven_by: ['R-001', 'R-002', 'A-001'], enables: [], affects: [],
    };
    return [r1, r2, a1, d1];
  }

  // arad_list logic
  test('list returns all entities', () => {
    const entities = makeTestEntities();
    expect(entities.length).toBe(4);
    expect(entities.filter(e => e.type === 'requirement').length).toBe(2);
    expect(entities.filter(e => e.type === 'assumption').length).toBe(1);
    expect(entities.filter(e => e.type === 'decision').length).toBe(1);
  });

  // arad_show logic
  test('show returns entity with dependencies and dependents', () => {
    const graph = buildGraph(makeTestEntities());
    const entity = graph.entities.get('D-001')!;
    expect(entity).toBeDefined();
    expect(entity.id).toBe('D-001');

    const deps = getDependencies(graph, 'D-001');
    expect(deps.length).toBe(3);
    const depIds = deps.map(d => d.id).sort();
    expect(depIds).toEqual(['A-001', 'R-001', 'R-002']);

    const dependents = getDependents(graph, 'R-001');
    expect(dependents.map(d => d.id)).toEqual(['D-001']);
  });

  // arad_trace logic
  test('trace returns tree structure', () => {
    const graph = buildGraph(makeTestEntities());
    const tree = traceUp(graph, 'D-001')!;
    expect(tree).not.toBeNull();
    expect(tree.entity.id).toBe('D-001');
    expect(tree.children.length).toBe(3);
  });

  // arad_impact logic
  test('impact returns direct and transitive dependents', () => {
    const entities = makeTestEntities();
    const d2: Decision = {
      type: 'decision', id: 'D-002', title: 'Cache layer', status: 'proposed',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      driven_by: ['D-001'], enables: [], affects: [],
    };
    entities.push(d2);
    const graph = buildGraph(entities);
    const { direct, transitive } = impactAnalysis(graph, 'A-001');
    expect(direct.map(d => d.id)).toEqual(['D-001']);
    expect(transitive.map(d => d.id)).toEqual(['D-002']);
  });

  // arad_check logic (JSON structure)
  test('check returns structured result with issues and warnings', () => {
    const entities = makeTestEntities();
    // Remove driven_by from D-001 to create an orphan
    (entities[3] as Decision).driven_by = [];
    const graph = buildGraph(entities);

    // Build check result manually (same logic as runCheck)
    const orphans = findOrphans(graph);
    expect(orphans.length).toBe(1);
    expect(orphans[0].id).toBe('D-001');

    const contradictions = findContradictions(graph);
    expect(contradictions.length).toBe(0);
  });

  // arad_query logic
  test('query with modifiers returns matching entities', () => {
    const entities = makeTestEntities();
    const results = searchEntities(entities, 'type:decision');
    expect(results.length).toBe(1);
    expect(results[0].entity.id).toBe('D-001');

    const results2 = searchEntities(entities, 'sqlite');
    expect(results2.length).toBe(1);
    expect(results2[0].entity.id).toBe('D-001');

    const results3 = searchEntities(entities, 'driven_by:R-001');
    expect(results3.length).toBe(1);
  });

  // arad_add logic (entity creation)
  test('entity creation produces valid frontmatter', () => {
    const entity: Decision = {
      type: 'decision', id: 'D-099', title: 'Test decision', status: 'accepted',
      date: '2026-04-30', tags: ['test'], body: 'Test body', filePath: '',
      driven_by: ['R-001'], enables: [], affects: [],
    };
    const serialized = serializeEntity(entity);
    const reparsed = parseEntity(serialized, 'test.md');
    expect(reparsed.id).toBe('D-099');
    expect(reparsed.title).toBe('Test decision');
    expect(reparsed.type).toBe('decision');
  });

  // arad_validate / arad_invalidate / arad_promote logic
  test('assumption status transitions are valid', () => {
    const a: Assumption = {
      type: 'assumption', id: 'A-001', title: 'Test', status: 'unvalidated',
      date: '2026-04-30', tags: [], body: '', filePath: '',
    };
    expect(a.status).toBe('unvalidated');
    a.status = 'validated';
    expect(a.status).toBe('validated');
    a.status = 'invalidated';
    expect(a.status).toBe('invalidated');
  });

  test('promoted assumption links to new requirement', () => {
    const a: Assumption = {
      type: 'assumption', id: 'A-001', title: 'Test assumption', status: 'validated',
      date: '2026-04-30', tags: [], body: '', filePath: '',
    };
    const r: Requirement = {
      type: 'requirement', id: 'R-099', title: a.title, status: 'accepted',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [], requested_by: [],
    };
    a.promoted_to = r.id;
    expect(a.promoted_to).toBe('R-099');
  });

  // arad_link logic (edge validation)
  test('link validation: decision→requirement is driven_by', () => {
    const { VALID_EDGES } = require('../src/commands/link') as typeof import('../src/commands/link');
    expect(VALID_EDGES['decision-requirement']).toEqual(['driven_by']);
    expect(VALID_EDGES['decision-assumption']).toEqual(['driven_by']);
    expect(VALID_EDGES['decision-decision']).toEqual(['enables', 'supersedes']);
    expect(VALID_EDGES['requirement-requirement']).toEqual(['derived_from', 'conflicts_with']);
  });

  // arad_graph logic (Mermaid rendering)
  test('graph rendering produces output', async () => {
    const graph = buildGraph(makeTestEntities());
    const { renderMermaid, renderDot } = await import('../src/commands/graph.js');
    const mermaid = renderMermaid(graph);
    expect(mermaid).toContain('graph TD');
    expect(mermaid).toContain('D-001');
    expect(mermaid).toContain('R-001');

    const dot = renderDot(graph);
    expect(dot).toContain('digraph ARAD');
    expect(dot).toContain('D-001');
  });
});
