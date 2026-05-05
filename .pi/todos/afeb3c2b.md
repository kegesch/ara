{
  "id": "afeb3c2b",
  "title": "Make graph engine type-agnostic",
  "tags": [
    "architecture",
    "deep-modules"
  ],
  "status": "open",
  "created_at": "2026-05-01T19:46:20.404Z",
  "assigned_to_session": "019df901-ca84-709d-814f-f68d788a60b9"
}


## Problem
`graph/graph.ts` is the best module in the codebase (clean interface: `buildGraph`, `getDependents`, `getDependencies`, `impactAnalysis`, `traceUp`) but it leaks entity-type knowledge into the graph layer via a `switch (entity.type)` in `buildGraph` to extract edges. This couples the graph engine to entity types — adding `idea` required modifying a module that should be type-agnostic.

## Solution
Make `buildGraph` accept a pre-extracted edge list instead of doing extraction itself:

```typescript
// Before: graph knows about entity types
export function buildGraph(entities: Entity[]): AradGraph {
  for (const entity of entities) {
    switch (entity.type) {        // ← graph layer shouldn't need this
      case 'decision': ... 
      case 'requirement': ...
      case 'idea': ...
    }
  }
}

// After: graph is type-agnostic, entities declare their own edges
export function buildGraph(
  entities: Map<string, Entity>,
  edges: Edge[],                    // ← pre-extracted by entity descriptors
): AradGraph { ... }
```

Edge extraction moves to entity descriptors (TODO-c61b4306). The graph engine becomes a pure graph-algorithms module: BFS, DFS, impact analysis, cycle detection. It never needs to know what an "idea" or "requirement" is.

## Dependency
Depends on TODO-c61b4306 (entity descriptors) — edge extraction needs somewhere to live first.

## Benefit
- Graph engine becomes the deepest module in the codebase (simple interface, zero type knowledge)
- Adding entity types never touches the graph layer
- Graph algorithms become independently testable and reusable
