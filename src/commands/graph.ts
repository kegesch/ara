// arad graph — visualize the ARAD graph as Mermaid, DOT, or ASCII
import { readAllEntities, requireAradProject } from '../io/files.js';
import { buildGraph } from '../graph/graph.js';
import type { Entity, Edge } from '../types.js';

export function graphCommand(format: string = 'mermaid'): void {
  requireAradProject();

  const entities = readAllEntities();
  if (entities.length === 0) {
    console.log('No entities to graph.');
    return;
  }

  const graph = buildGraph(entities);

  switch (format) {
    case 'mermaid':
      console.log(renderMermaid(graph));
      break;
    case 'dot':
      console.log(renderDot(graph));
      break;
    case 'ascii':
      console.log(renderAscii(graph));
      break;
    default:
      console.error(`Unknown format "${format}". Use: mermaid, dot, ascii`);
      process.exit(1);
  }
}

// ─── Mermaid ───

function renderMermaid(graph: { entities: Map<string, Entity>; edges: Edge[] }): string {
  const lines: string[] = ['graph TD'];

  // Group nodes by type
  const requirements = [...graph.entities.values()].filter(e => e.type === 'requirement');
  const assumptions = [...graph.entities.values()].filter(e => e.type === 'assumption');
  const decisions = [...graph.entities.values()].filter(e => e.type === 'decision');

  // Subgraphs
  if (requirements.length > 0) {
    lines.push('  subgraph Requirements');
    for (const r of requirements) {
      lines.push(`    ${r.id}["${r.id}: ${escMermaid(r.title)}<br/><small>${r.status}</small>"]`);
    }
    lines.push('  end');
  }

  if (assumptions.length > 0) {
    lines.push('  subgraph Assumptions');
    for (const a of assumptions) {
      lines.push(`    ${a.id}["${a.id}: ${escMermaid(a.title)}<br/><small>${a.status}</small>"]`);
    }
    lines.push('  end');
  }

  if (decisions.length > 0) {
    lines.push('  subgraph Decisions');
    for (const d of decisions) {
      lines.push(`    ${d.id}["${d.id}: ${escMermaid(d.title)}<br/><small>${d.status}</small>"]`);
    }
    lines.push('  end');
  }

  // Style by type
  lines.push('');
  lines.push(`  classDef requirement fill:#4da6ff,stroke:#333,color:#fff`);
  lines.push(`  classDef assumption fill:#ffb347,stroke:#333,color:#333`);
  lines.push(`  classDef decision fill:#77dd77,stroke:#333,color:#333`);

  for (const r of requirements) lines.push(`  class ${r.id} requirement`);
  for (const a of assumptions) lines.push(`  class ${a.id} assumption`);
  for (const d of decisions) lines.push(`  class ${d.id} decision`);

  // Edges
  lines.push('');
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    const key = `${edge.from}-${edge.to}-${edge.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    switch (edge.type) {
      case 'driven_by':
        lines.push(`  ${edge.to} -->|"drives"| ${edge.from}`);
        break;
      case 'derived_from':
        lines.push(`  ${edge.to} -->|"derives"| ${edge.from}`);
        break;
      case 'enables':
        lines.push(`  ${edge.from} -->|"enables"| ${edge.to}`);
        break;
      case 'supersedes':
        lines.push(`  ${edge.from} -.->|"supersedes"| ${edge.to}`);
        break;
      case 'conflicts_with':
        lines.push(`  ${edge.from} x--x|"conflicts"| ${edge.to}`);
        break;
      case 'promoted_to':
        lines.push(`  ${edge.from} -.->|"promoted to"| ${edge.to}`);
        break;
    }
  }

  return lines.join('\n');
}

function escMermaid(s: string): string {
  return s.replace(/"/g, "'").replace(/<br\/>/g, ' ');
}

// ─── DOT (Graphviz) ───

function renderDot(graph: { entities: Map<string, Entity>; edges: Edge[] }): string {
  const lines: string[] = [
    'digraph ARAD {',
    '  rankdir=BT;',
    '  node [shape=box, style=filled, fontname="Arial"];',
    '',
  ];

  // Node definitions with styling
  for (const [, entity] of graph.entities) {
    const color = entity.type === 'requirement' ? '#4da6ff'
      : entity.type === 'assumption' ? '#ffb347'
      : '#77dd77';
    const label = `${entity.id}: ${entity.title}\\n[${entity.status}]`;
    lines.push(`  "${entity.id}" [label="${label}", fillcolor="${color}"];`);
  }

  lines.push('');

  // Edges
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    const key = `${edge.from}-${edge.to}-${edge.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    switch (edge.type) {
      case 'driven_by':
        lines.push(`  "${edge.to}" -> "${edge.from}" [label="drives"];`);
        break;
      case 'derived_from':
        lines.push(`  "${edge.to}" -> "${edge.from}" [label="derives"];`);
        break;
      case 'enables':
        lines.push(`  "${edge.from}" -> "${edge.to}" [label="enables"];`);
        break;
      case 'supersedes':
        lines.push(`  "${edge.from}" -> "${edge.to}" [label="supersedes", style=dashed];`);
        break;
      case 'conflicts_with':
        lines.push(`  "${edge.from}" -> "${edge.to}" [label="conflicts", color=red, style=bold];`);
        break;
      case 'promoted_to':
        lines.push(`  "${edge.from}" -> "${edge.to}" [label="promoted", style=dotted];`);
        break;
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// ─── ASCII (indented trees from root entities) ───

function renderAscii(graph: { entities: Map<string, Entity>; edges: Edge[] }): string {
  const lines: string[] = [];

  // Find root entities (requirements with no derived_from, assumptions, decisions with no driven_by)
  const requirements = [...graph.entities.values()].filter(e => e.type === 'requirement');
  const rootReqs = requirements.filter(r => r.type === 'requirement' && (r as any).derived_from.length === 0);
  const assumptions = [...graph.entities.values()].filter(e => e.type === 'assumption');
  const orphanDecisions = [...graph.entities.values()].filter(
    e => e.type === 'decision' && (e as any).driven_by.length === 0
  );

  // Print trees from root requirements
  for (const root of rootReqs) {
    lines.push(`${statusSym(root.status)} ${root.id} ${root.title} [${root.type}]`);
    const visited = new Set<string>([root.id]);
    renderAsciiChildren(graph, root.id, '  ', visited, lines);
    lines.push('');
  }

  // Print trees from assumptions
  for (const a of assumptions) {
    lines.push(`${statusSym(a.status)} ${a.id} ${a.title} [${a.type}]`);
    const visited = new Set<string>([a.id]);
    renderAsciiChildren(graph, a.id, '  ', visited, lines);
    lines.push('');
  }

  // Print orphan decisions
  for (const d of orphanDecisions) {
    lines.push(`${statusSym(d.status)} ${d.id} ${d.title} [${d.type}, orphan]`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function renderAsciiChildren(
  graph: { entities: Map<string, Entity>; edges: Edge[] },
  parentId: string,
  prefix: string,
  visited: Set<string>,
  lines: string[],
): void {
  // Find entities that depend on parentId (incoming edges)
  const incoming = graph.edges.filter(e => e.to === parentId);
  const dependents = new Map<string, string>(); // id -> edgeType
  for (const edge of incoming) {
    if (['driven_by', 'enables'].includes(edge.type)) {
      dependents.set(edge.from, edge.type);
    }
  }

  let i = 0;
  for (const [childId, edgeType] of dependents) {
    if (visited.has(childId)) continue;
    visited.add(childId);

    const child = graph.entities.get(childId);
    if (!child) continue;

    const isLast = i === dependents.size - 1;
    const connector = isLast ? '└── ' : '├── ';
    const nextPrefix = isLast ? '    ' : '│   ';

    lines.push(`${prefix}${connector}${statusSym(child.status)} ${childId} ${child.title} [${edgeType}]`);
    renderAsciiChildren(graph, childId, prefix + nextPrefix, visited, lines);
    i++;
  }
}

function statusSym(status: string): string {
  switch (status) {
    case 'accepted':
    case 'validated':
      return '✓';
    case 'proposed':
    case 'draft':
    case 'unvalidated':
      return '○';
    case 'deprecated':
    case 'rejected':
    case 'invalidated':
      return '✗';
    case 'superseded':
      return '→';
    default:
      return '·';
  }
}
