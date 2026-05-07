---
id: D-030
title: "Encapsulate entity-type knowledge behind descriptor objects"
status: accepted
date: 2026-05-04
driven_by: [R-004, R-005, R-011, R-019, R-024]
---

# Decision: Encapsulate entity-type knowledge behind descriptor objects

## Context

Adding a new entity type required touching 21 files with 141 string references. Entity-type knowledge was spread horizontally across every layer via `switch` statements in 16 locations (parser, graph, display, commands, MCP server, search). This made the codebase resistant to extension and prone to missed updates when adding entity types like stakeholder, risk, and term.

## Decision

Introduce an `EntityDescriptor` interface that encapsulates all type-specific behaviour behind a single object per entity type. Each descriptor declares its prefix, folder, statuses, parse/serialize logic, edge extraction, relationship fields, display relations, and JSON fields. A central registry maps entity types to descriptors and provides utility functions (`cleanRefs`, `renameRefs`, `hasRelation`, `getRelField`).

All consumers (parser, graph engine, display, remove, rename, link, list, edit, init, status, add, search, MCP server) now delegate to the descriptor instead of switching on entity type.

## Consequences

- Adding a new entity type becomes: create one descriptor file, register it, done. No switch statements to hunt down.
- `switch` on entity type reduced from 16 locations to 2 (add.ts prompt logic, import.ts ADR format) — both are appropriate localized concerns.
- The descriptor pattern follows the *deep modules* principle: a narrow interface hiding significant implementation behind it.
- Small runtime overhead from descriptor lookups (negligible — it's a record access).
- The `Entity` union type and discriminated fields remain in `types.ts` — descriptors don't replace the type system, they centralise the behavioural knowledge.
