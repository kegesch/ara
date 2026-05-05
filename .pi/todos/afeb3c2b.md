{
  "id": "afeb3c2b",
  "title": "Make graph engine type-agnostic",
  "tags": [
    "architecture",
    "deep-modules"
  ],
  "status": "closed",
  "created_at": "2026-05-01T19:46:20.404Z"
}

## Done

Split `graph/graph.ts` into two modules:

**`graph/graph.ts`** — Type-agnostic graph engine:
- `buildGraph` (delegates edge extraction to entity descriptors)
- `getDependents`, `getDependencies` (use `Set`-based edge type filters)
- `impactAnalysis`, `traceUp` (pure BFS/DFS)
- `findContradictions`, `findDanglingRefs` (pure edge analysis)
- Zero hardcoded entity type checks (only `getDescriptor(entity.type)` to delegate)

**`graph/analysis.ts`** — Type-aware heuristic analysis:
- `findOrphans`, `findUnvalidatedAssumptions`
- `findPossibleContradictions`, `findPossibleDuplicates`
- `findStatusAnomalies`, `findOrphanRequirements`
- These are inherently domain-specific and need entity type knowledge

Also deleted TODO-5b8a3e11 (MCP tools) as no longer relevant.
