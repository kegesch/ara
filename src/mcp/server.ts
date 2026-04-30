// ARAD MCP Server — exposes graph operations as MCP tools
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readAllEntities, readEntityById, isAradProject, getNextId, writeEntity } from '../io/files.js';
import { buildGraph, getDependents, getDependencies, impactAnalysis, traceUp } from '../graph/graph.js';
import { searchEntities } from '../search/fuzzy.js';
import { runCheck, type CheckResult } from '../commands/check.js';
import { getTypeFromId, ENTITY_CONFIG } from '../types.js';
import type { Entity, EntityType, Assumption, Decision } from '../types.js';

const server = new McpServer({
  name: 'arad',
  version: '0.1.0',
});

// Helper: serialize entity to plain JSON object
function entityToJson(entity: Entity) {
  return {
    id: entity.id,
    type: entity.type,
    title: entity.title,
    status: entity.status,
    date: entity.date,
    tags: entity.tags,
    ...entity.type === 'requirement' ? {
      derived_from: (entity as any).derived_from,
      conflicts_with: (entity as any).conflicts_with,
    } : {},
    ...entity.type === 'assumption' ? {
      promoted_to: (entity as any).promoted_to,
    } : {},
    ...entity.type === 'decision' ? {
      driven_by: (entity as any).driven_by,
      enables: (entity as any).enables,
      supersedes: (entity as any).supersedes,
    } : {},
  };
}

// ─── Tool: arad_list ───

server.tool('arad_list', 'List all ARAD entities, optionally filtered by type',
  { type: z.enum(['requirement', 'assumption', 'decision']).optional() },
  async ({ type }) => {
    if (!isAradProject()) {
      return { content: [{ type: 'text', text: 'Error: Not an ARAD project. Run arad init first.' }] };
    }
    let entities = readAllEntities();
    if (type) entities = entities.filter(e => e.type === type);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(entities.map(entityToJson), null, 2),
      }],
    };
  }
);

// ─── Tool: arad_show ───

server.tool('arad_show', 'Show details of a specific entity and its immediate relationships',
  { id: z.string().describe('Entity ID (e.g. R-001, A-003, D-007)') },
  async ({ id }) => {
    if (!isAradProject()) {
      return { content: [{ type: 'text', text: 'Error: Not an ARAD project.' }] };
    }
    const entity = readEntityById(process.cwd(), id);
    if (!entity) {
      return { content: [{ type: 'text', text: `Entity ${id} not found.` }] };
    }
    const graph = buildGraph(readAllEntities());
    const deps = getDependencies(graph, id).map(entityToJson);
    const dependents = getDependents(graph, id).map(entityToJson);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ entity: entityToJson(entity), dependencies: deps, dependents }, null, 2),
      }],
    };
  }
);

// ─── Tool: arad_trace ───

server.tool('arad_trace', 'Trace the dependency tree of an entity (what backs it)',
  { id: z.string().describe('Entity ID to trace') },
  async ({ id }) => {
    if (!isAradProject()) {
      return { content: [{ type: 'text', text: 'Error: Not an ARAD project.' }] };
    }
    const graph = buildGraph(readAllEntities());
    if (!graph.entities.has(id)) {
      return { content: [{ type: 'text', text: `Entity ${id} not found.` }] };
    }
    const tree = traceUp(graph, id);
    function nodeToJson(n: ReturnType<typeof traceUp>): any {
      if (!n) return null;
      return {
        entity: entityToJson(n.entity),
        edgeType: n.edgeType,
        children: n.children.map(nodeToJson),
      };
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(nodeToJson(tree), null, 2),
      }],
    };
  }
);

// ─── Tool: arad_impact ───

server.tool('arad_impact', 'Analyze what would be affected if an entity changes or is removed',
  { id: z.string().describe('Entity ID to analyze impact for') },
  async ({ id }) => {
    if (!isAradProject()) {
      return { content: [{ type: 'text', text: 'Error: Not an ARAD project.' }] };
    }
    const graph = buildGraph(readAllEntities());
    if (!graph.entities.has(id)) {
      return { content: [{ type: 'text', text: `Entity ${id} not found.` }] };
    }
    const { direct, transitive } = impactAnalysis(graph, id);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          entity: entityToJson(graph.entities.get(id)!),
          direct: direct.map(entityToJson),
          transitive: transitive.map(entityToJson),
        }, null, 2),
      }],
    };
  }
);

// ─── Tool: arad_check ───

server.tool('arad_check', 'Run health check: find orphans, contradictions, dangling refs, unvalidated assumptions',
  {},
  async () => {
    if (!isAradProject()) {
      return { content: [{ type: 'text', text: 'Error: Not an ARAD project.' }] };
    }
    const result = runCheck();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// ─── Tool: arad_query ───

server.tool('arad_query', 'Search entities by text or structured modifiers (type:, status:, tag:, driven_by:, id:)',
  { query: z.string().describe('Search terms') },
  async ({ query }) => {
    if (!isAradProject()) {
      return { content: [{ type: 'text', text: 'Error: Not an ARAD project.' }] };
    }
    const entities = readAllEntities();
    const results = searchEntities(entities, query);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results.map(r => ({
          ...entityToJson(r.entity),
          score: r.score,
          matches: r.matches,
        })), null, 2),
      }],
    };
  }
);

// ─── Tool: arad_add ───

server.tool('arad_add', 'Add a new entity (requirement, assumption, or decision)',
  {
    type: z.enum(['requirement', 'assumption', 'decision']),
    title: z.string().describe('Entity title'),
    status: z.string().optional().describe('Status (default: first status for type)'),
    tags: z.string().optional().describe('Comma-separated tags'),
    driven_by: z.string().optional().describe('Comma-separated IDs that drive this decision'),
    derived_from: z.string().optional().describe('Comma-separated parent requirement IDs'),
  },
  async ({ type, title, status, tags, driven_by, derived_from }) => {
    if (!isAradProject()) {
      return { content: [{ type: 'text', text: 'Error: Not an ARAD project.' }] };
    }

    const config = ENTITY_CONFIG[type];
    const id = getNextId(process.cwd(), type);
    const date = new Date().toISOString().split('T')[0];
    const entityStatus = status || config.statuses[0];
    const entityTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    let entity: Entity;

    switch (type) {
      case 'requirement':
        entity = {
          type: 'requirement', id, title, status: entityStatus as any, date, tags: entityTags,
          derived_from: derived_from ? derived_from.split(',').map(s => s.trim()).filter(Boolean) : [],
          conflicts_with: [], body: '', filePath: '',
        };
        break;
      case 'assumption':
        entity = {
          type: 'assumption', id, title, status: entityStatus as any, date, tags: entityTags,
          body: '', filePath: '',
        };
        break;
      case 'decision':
        entity = {
          type: 'decision', id, title, status: entityStatus as any, date, tags: entityTags,
          driven_by: driven_by ? driven_by.split(',').map(s => s.trim()).filter(Boolean) : [],
          enables: [], body: '', filePath: '',
        };
        break;
    }

    const relPath = writeEntity(process.cwd(), entity);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ created: entityToJson(entity), path: `.arad/${relPath}` }, null, 2),
      }],
    };
  }
);

// ─── Tool: arad_validate ───

server.tool('arad_validate', 'Mark an assumption as validated',
  { id: z.string().describe('Assumption ID') },
  async ({ id }) => {
    if (!isAradProject()) {
      return { content: [{ type: 'text', text: 'Error: Not an ARAD project.' }] };
    }
    const { updateEntity } = await import('../io/files.js');
    const entity = readEntityById(process.cwd(), id);
    if (!entity || entity.type !== 'assumption') {
      return { content: [{ type: 'text', text: `${id} not found or not an assumption.` }] };
    }
    entity.status = 'validated';
    updateEntity(process.cwd(), entity);
    return { content: [{ type: 'text', text: JSON.stringify({ validated: entityToJson(entity) }, null, 2) }] };
  }
);

// ─── Tool: arad_invalidate ───

server.tool('arad_invalidate', 'Mark an assumption as invalidated (shows impact)',
  { id: z.string().describe('Assumption ID') },
  async ({ id }) => {
    if (!isAradProject()) {
      return { content: [{ type: 'text', text: 'Error: Not an ARAD project.' }] };
    }
    const { updateEntity } = await import('../io/files.js');
    const entities = readAllEntities();
    const graph = buildGraph(entities);
    const entity = graph.entities.get(id);
    if (!entity || entity.type !== 'assumption') {
      return { content: [{ type: 'text', text: `${id} not found or not an assumption.` }] };
    }
    entity.status = 'invalidated';
    updateEntity(process.cwd(), entity);
    const { direct, transitive } = impactAnalysis(graph, id);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          invalidated: entityToJson(entity),
          affected: { direct: direct.map(entityToJson), transitive: transitive.map(entityToJson) },
        }, null, 2),
      }],
    };
  }
);

// ─── Tool: arad_promote ───

server.tool('arad_promote', 'Promote a validated assumption to a requirement',
  { id: z.string().describe('Assumption ID') },
  async ({ id }) => {
    if (!isAradProject()) {
      return { content: [{ type: 'text', text: 'Error: Not an ARAD project.' }] };
    }
    const { updateEntity, getNextId, writeEntity } = await import('../io/files.js');
    const entity = readEntityById(process.cwd(), id);
    if (!entity || entity.type !== 'assumption') {
      return { content: [{ type: 'text', text: `${id} not found or not an assumption.` }] };
    }
    if (entity.status !== 'validated') {
      return { content: [{ type: 'text', text: `${id} must be validated before promotion. Current status: ${entity.status}` }] };
    }
    const newId = getNextId(process.cwd(), 'requirement');
    const requirement = {
      type: 'requirement' as const, id: newId, title: entity.title, status: 'accepted' as const,
      date: new Date().toISOString().split('T')[0], tags: [...entity.tags],
      derived_from: [], conflicts_with: [], body: entity.body, filePath: '',
    };
    writeEntity(process.cwd(), requirement);
    entity.promoted_to = newId;
    updateEntity(process.cwd(), entity);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          promoted_from: entityToJson(entity),
          promoted_to: entityToJson(requirement),
        }, null, 2),
      }],
    };
  }
);

// ─── Start server ───

export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
