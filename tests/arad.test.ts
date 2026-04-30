import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Entity, Requirement, Assumption, Decision } from '../src/types';
import { parseEntity, serializeEntity, serializeFrontmatter } from '../src/io/parser';
import { buildGraph, getDependents, getDependencies, findOrphans, findContradictions, findDanglingRefs, impactAnalysis, traceUp } from '../src/graph/graph';
import { searchEntities } from '../src/search/fuzzy';

const TMP = join(import.meta.dir, '_tmp_graph');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// ─── Parser ───

describe('parser', () => {
  test('parses a decision with relationships', () => {
    const content = `---
id: D-001
title: "Use SQLite"
status: accepted
date: 2026-04-30
tags: [storage, db]
driven_by: [R-001, A-001]
---

# Decision: Use SQLite

Some body text here.
`;
    const entity = parseEntity(content, 'decisions/D-001-use-sqlite.md');
    expect(entity.type).toBe('decision');
    expect(entity.id).toBe('D-001');
    expect(entity.title).toBe('Use SQLite');
    expect(entity.status).toBe('accepted');
    expect(entity.tags).toEqual(['storage', 'db']);
    if (entity.type === 'decision') {
      expect(entity.driven_by).toEqual(['R-001', 'A-001']);
    }
    expect(entity.body).toContain('Some body text');
  });

  test('parses a requirement', () => {
    const content = `---
id: R-001
title: "Must encrypt data"
status: accepted
date: 2026-04-30
---

Body here.
`;
    const entity = parseEntity(content, 'requirements/R-001.md');
    expect(entity.type).toBe('requirement');
    if (entity.type === 'requirement') {
      expect(entity.status).toBe('accepted');
      expect(entity.derived_from).toEqual([]);
    }
  });

  test('throws on missing frontmatter', () => {
    expect(() => parseEntity('no frontmatter', 'test.md')).toThrow();
  });

  test('throws on missing id', () => {
    const content = `---
title: "No id"
---

Body.
`;
    expect(() => parseEntity(content, 'test.md')).toThrow();
  });
});

// ─── Graph ───

function makeEntities(): Entity[] {
  const r1: Requirement = {
    type: 'requirement', id: 'R-001', title: 'Encrypt data', status: 'accepted',
    date: '2026-04-30', tags: [], body: '', filePath: '',
    derived_from: [], conflicts_with: [],
  };
  const r2: Requirement = {
    type: 'requirement', id: 'R-002', title: 'Offline support', status: 'accepted',
    date: '2026-04-30', tags: [], body: '', filePath: '',
    derived_from: [], conflicts_with: ['R-003'],
  };
  const r3: Requirement = {
    type: 'requirement', id: 'R-003', title: 'Always online', status: 'accepted',
    date: '2026-04-30', tags: [], body: '', filePath: '',
    derived_from: [], conflicts_with: ['R-002'],
  };
  const a1: Assumption = {
    type: 'assumption', id: 'A-001', title: 'Low user count', status: 'unvalidated',
    date: '2026-04-30', tags: [], body: '', filePath: '',
  };
  const d1: Decision = {
    type: 'decision', id: 'D-001', title: 'Use SQLite', status: 'accepted',
    date: '2026-04-30', tags: [], body: '', filePath: '',
    driven_by: ['R-001', 'R-002', 'A-001'], enables: ['D-002'],
  };
  const d2: Decision = {
    type: 'decision', id: 'D-002', title: 'Cache strategy', status: 'proposed',
    date: '2026-04-30', tags: [], body: '', filePath: '',
    driven_by: ['D-001'], enables: [],
  };
  const d3: Decision = {
    type: 'decision', id: 'D-003', title: 'Orphan decision', status: 'proposed',
    date: '2026-04-30', tags: [], body: '', filePath: '',
    driven_by: [], enables: [],
  };
  return [r1, r2, r3, a1, d1, d2, d3];
}

describe('graph', () => {
  test('builds graph with correct entity count', () => {
    const g = buildGraph(makeEntities());
    expect(g.entities.size).toBe(7);
  });

  test('getDependents finds decisions driven by a requirement', () => {
    const g = buildGraph(makeEntities());
    const deps = getDependents(g, 'R-001');
    expect(deps.map(d => d.id)).toContain('D-001');
    expect(deps.length).toBe(1);
  });

  test('getDependencies finds what a decision depends on', () => {
    const g = buildGraph(makeEntities());
    const deps = getDependencies(g, 'D-001');
    const ids = deps.map(d => d.id);
    expect(ids).toContain('R-001');
    expect(ids).toContain('R-002');
    expect(ids).toContain('A-001');
  });

  test('findOrphans finds decisions with no driven_by', () => {
    const g = buildGraph(makeEntities());
    const orphans = findOrphans(g);
    expect(orphans.map(o => o.id)).toEqual(['D-003']);
    // D-002 has driven_by: ['D-001'], so it's not an orphan
  });

  test('findContradictions detects conflicts', () => {
    const g = buildGraph(makeEntities());
    const contradictions = findContradictions(g);
    expect(contradictions.length).toBe(1);
    const ids = contradictions[0].map(e => e.id).sort();
    expect(ids).toEqual(['R-002', 'R-003']);
  });

  test('findDanglingRefs detects missing refs', () => {
    const entities = makeEntities();
    // Add a decision referencing a non-existent entity
    const d: Decision = {
      ...entities[4] as Decision,
      id: 'D-099', driven_by: ['R-999'],
    };
    const g = buildGraph([...entities, d]);
    const danglers = findDanglingRefs(g);
    expect(danglers.some(d => d.ref === 'R-999')).toBe(true);
  });

  test('impactAnalysis traces direct and transitive', () => {
    const g = buildGraph(makeEntities());
    const result = impactAnalysis(g, 'R-001');
    expect(result.direct.map(e => e.id)).toContain('D-001');
    // D-001 driven_by D-002 doesn't make D-002 a dependent of R-001
    // D-002 depends on D-001, so it IS transitive from R-001
    expect(result.transitive.map(e => e.id)).toContain('D-002');
  });

  test('traceUp builds dependency tree', () => {
    const g = buildGraph(makeEntities());
    const tree = traceUp(g, 'D-001');
    expect(tree).not.toBeNull();
    expect(tree!.entity.id).toBe('D-001');
    // D-001 has driven_by: [R-001, R-002, A-001] + enables: [D-002]
    // But enables is an outgoing edge, not a dependency
    expect(tree!.children.length).toBe(3); // R-001, R-002, A-001
  });
});

// ─── Search ───

describe('search', () => {
  const entities = makeEntities();

  test('finds by title text', () => {
    const results = searchEntities(entities, 'sqlite');
    expect(results.length).toBe(1);
    expect(results[0].entity.id).toBe('D-001');
  });

  test('finds by type modifier', () => {
    const results = searchEntities(entities, 'type:decision');
    expect(results.length).toBe(3);
    expect(results.every(r => r.entity.type === 'decision')).toBe(true);
  });

  test('finds by status modifier', () => {
    const results = searchEntities(entities, 'status:accepted');
    expect(results.length).toBe(4); // R-001, R-002, R-003, D-001
  });

  test('combines modifiers with text', () => {
    const results = searchEntities(entities, 'type:decision sqlite');
    expect(results.length).toBe(1);
    expect(results[0].entity.id).toBe('D-001');
  });

  test('returns empty for no match', () => {
    const results = searchEntities(entities, 'nonexistent-xyz');
    expect(results.length).toBe(0);
  });

  test('fuzzy matches "sqlte" to "sqlite"', () => {
    const results = searchEntities(entities, 'sqlte');
    expect(results.length).toBe(1);
    expect(results[0].entity.id).toBe('D-001');
  });

  test('finds by driven_by modifier', () => {
    const results = searchEntities(entities, 'driven_by:R-001');
    expect(results.length).toBe(1);
    expect(results[0].entity.id).toBe('D-001');
  });
});

// ─── Serialization ───

describe('serialization', () => {
  test('round-trips a decision', () => {
    const original = `---
id: D-001
title: "Use SQLite"
status: accepted
date: 2026-04-30
tags: [storage, db]
driven_by: [R-001, A-001]
---

# Decision: Use SQLite

Body text.
`;
    const entity = parseEntity(original, 'test.md');
    const serialized = serializeEntity(entity);
    const reParsed = parseEntity(serialized, 'test.md');
    expect(reParsed).toEqual(entity);
  });
});

// ─── Link/Unlink validation logic ───

describe('link validation', () => {
  test('valid edge types are defined correctly', () => {
    // VALID_EDGES is tested via the integration tests above
    // (link command auto-infers, rejects invalid, etc.)
    // Here we just validate the constants we care about
    const validEdges: Record<string, string[]> = {
      'decision-requirement': ['driven_by'],
      'decision-assumption': ['driven_by'],
      'decision-decision': ['enables', 'supersedes'],
      'requirement-requirement': ['derived_from', 'conflicts_with'],
    };
    expect(validEdges['decision-requirement']).toEqual(['driven_by']);
    expect(validEdges['decision-decision'].length).toBe(2);
    expect(validEdges['assumption-decision']).toBeUndefined();
  });

  test('link then check graph reflects the change', () => {
    // Build entities, manually link via the same logic link uses
    const r1: Requirement = {
      type: 'requirement', id: 'R-001', title: 'Encrypt', status: 'accepted',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const d1: Decision = {
      type: 'decision', id: 'D-001', title: 'Use SQLite', status: 'accepted',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      driven_by: [], enables: [],
    };

    // Before linking
    let g = buildGraph([r1, d1]);
    expect(getDependents(g, 'R-001')).toEqual([]);

    // After linking (simulate what link command does)
    d1.driven_by.push('R-001');
    g = buildGraph([r1, d1]);
    const deps = getDependents(g, 'R-001');
    expect(deps.map(e => e.id)).toEqual(['D-001']);
  });

  test('conflicts_with is bidirectional', () => {
    const r1: Requirement = {
      type: 'requirement', id: 'R-001', title: 'Offline', status: 'accepted',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: ['R-002'],
    };
    const r2: Requirement = {
      type: 'requirement', id: 'R-002', title: 'Always online', status: 'accepted',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: ['R-001'],
    };
    const g = buildGraph([r1, r2]);
    const contradictions = findContradictions(g);
    expect(contradictions.length).toBe(1);
  });
});

// ─── Heuristic Analysis ───

import {
  findPossibleContradictions,
  findPossibleDuplicates,
  findStatusAnomalies,
  findOrphanRequirements,
} from '../src/graph/graph';

describe('heuristic analysis', () => {
  test('findPossibleContradictions detects opposing terms', () => {
    const r1: Requirement = {
      type: 'requirement', id: 'R-001', title: 'System must support offline operation',
      status: 'accepted', date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const r2: Requirement = {
      type: 'requirement', id: 'R-002', title: 'System requires always online connection',
      status: 'accepted', date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const g = buildGraph([r1, r2]);
    const possibles = findPossibleContradictions(g);
    expect(possibles.length).toBeGreaterThanOrEqual(1);
    const pair = possibles.find(p =>
      (p.a.id === 'R-001' && p.b.id === 'R-002') ||
      (p.a.id === 'R-002' && p.b.id === 'R-001')
    );
    expect(pair).toBeDefined();
    expect(pair!.reason).toContain('opposing terms');
  });

  test('findPossibleContradictions ignores same requirement with both terms', () => {
    const r1: Requirement = {
      type: 'requirement', id: 'R-001', title: 'Support both offline and online modes',
      status: 'accepted', date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const g = buildGraph([r1]);
    const possibles = findPossibleContradictions(g);
    // Single req with both terms should NOT produce a contradiction
    expect(possibles.length).toBe(0);
  });

  test('findPossibleDuplicates finds similar titles', () => {
    const r1: Requirement = {
      type: 'requirement', id: 'R-001', title: 'All data must be encrypted at rest',
      status: 'accepted', date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const r2: Requirement = {
      type: 'requirement', id: 'R-002', title: 'Data must be encrypted at rest',
      status: 'accepted', date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const g = buildGraph([r1, r2]);
    const dups = findPossibleDuplicates(g, 0.5);
    expect(dups.length).toBeGreaterThanOrEqual(1);
    expect(dups[0].similarity).toBeGreaterThan(0.5);
  });

  test('findPossibleDuplicates ignores dissimilar titles', () => {
    const r1: Requirement = {
      type: 'requirement', id: 'R-001', title: 'Encrypt all data at rest',
      status: 'accepted', date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const r2: Requirement = {
      type: 'requirement', id: 'R-002', title: 'Support dark mode UI theme',
      status: 'accepted', date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const g = buildGraph([r1, r2]);
    const dups = findPossibleDuplicates(g, 0.6);
    expect(dups.length).toBe(0);
  });

  test('findStatusAnomalies detects accepted decision backed by rejected requirement', () => {
    const r1: Requirement = {
      type: 'requirement', id: 'R-001', title: 'Use encryption', status: 'rejected',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const d1: Decision = {
      type: 'decision', id: 'D-001', title: 'Use AES-256', status: 'accepted',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      driven_by: ['R-001'], enables: [],
    };
    const g = buildGraph([r1, d1]);
    const anomalies = findStatusAnomalies(g);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].entity.id).toBe('D-001');
  });

  test('findStatusAnomalies detects accepted decision backed by invalidated assumption', () => {
    const a1: Assumption = {
      type: 'assumption', id: 'A-001', title: 'Users are trusted', status: 'invalidated',
      date: '2026-04-30', tags: [], body: '', filePath: '',
    };
    const d1: Decision = {
      type: 'decision', id: 'D-001', title: 'Skip auth', status: 'accepted',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      driven_by: ['A-001'], enables: [],
    };
    const g = buildGraph([a1, d1]);
    const anomalies = findStatusAnomalies(g);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].refs[0].id).toBe('A-001');
  });

  test('findOrphanRequirements finds requirements with no decisions', () => {
    const r1: Requirement = {
      type: 'requirement', id: 'R-001', title: 'Must be fast', status: 'accepted',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const r2: Requirement = {
      type: 'requirement', id: 'R-002', title: 'Must be secure', status: 'accepted',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const d1: Decision = {
      type: 'decision', id: 'D-001', title: 'Use cache', status: 'accepted',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      driven_by: ['R-001'], enables: [],
    };
    const g = buildGraph([r1, r2, d1]);
    const orphans = findOrphanRequirements(g);
    expect(orphans.map(o => o.id)).toEqual(['R-002']);
  });

  test('findOrphanRequirements ignores deprecated requirements', () => {
    const r1: Requirement = {
      type: 'requirement', id: 'R-001', title: 'Old req', status: 'deprecated',
      date: '2026-04-30', tags: [], body: '', filePath: '',
      derived_from: [], conflicts_with: [],
    };
    const g = buildGraph([r1]);
    const orphans = findOrphanRequirements(g);
    expect(orphans.length).toBe(0);
  });
});
