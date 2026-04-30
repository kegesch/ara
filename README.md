# ARAD

**Architecture, Requirements, Assumptions, Decisions** — traceability for humans and agents.

A CLI tool that tracks architectural decisions, requirements, and assumptions as a linked graph. Detect contradictions, find orphans, trace impact, and validate assumptions — all in text files you can commit to git.

## Quick Start

```bash
bun install
arad init                # Create .arad/ in your project
arad add requirement "All data must be encrypted at rest"
arad add assumption "Users will have fewer than 1000 records"
arad add decision "Use SQLite for local storage"
arad trace D-001          # See what backs a decision
arad impact A-001         # See what breaks if an assumption is wrong
arad check                # Find orphans, contradictions, dangling refs
```

## Concepts

### Entities

| Type | Prefix | What it is |
|---|---|---|
| **Requirement** | `R-001` | Something the system must satisfy |
| **Assumption** | `A-001` | Something believed true but not yet verified |
| **Decision** | `D-001` | An architectural or design choice |

### Relationships

```
Requirement ──drives──▶ Decision         (decision driven_by requirement)
Assumption ──drives──▶ Decision          (decision driven_by assumption)
Requirement ◀──derived_from── Requirement (decomposition)
Requirement ◀──▶ conflicts_with          (mutual contradiction)
Assumption ──promoted_to──▶ Requirement  (validated assumption → requirement)
Decision ──enables──▶ Decision           (layered decisions)
Decision ──supersedes──▶ Decision        (replacing old decisions)
```

### Key Queries

- **Trace** — Walk the graph from any entity. "What backs this decision?"
- **Impact** — Reverse traversal. "If this assumption is wrong, what breaks?"
- **Orphans** — Decisions with no backing requirement or assumption.
- **Contradictions** — Requirements that conflict with each other.
- **Dangling refs** — References to entities that don't exist.

### Assumption Lifecycle

```
unvalidated ──▶ validated ──▶ (promoted to requirement)
     │
     └──▶ invalidated ──▶ (cascade: flag dependent decisions)
```

## File Format

Each entity is a Markdown file with YAML frontmatter:

```markdown
---
id: D-001
title: "Use SQLite for local storage"
status: accepted
date: 2026-04-30
tags: [storage, database]
driven_by: [R-001, A-003]
---

# Decision: Use SQLite for local storage

## Context
We need local persistence that works offline and doesn't require a server.

## Decision
Use SQLite as the embedded database.

## Consequences
- Single file, easy to version and backup
- No concurrent write support across processes
```

### Directory Structure

```
.arad/
  arad.yaml              # Project config
  requirements/
    R-001-all-data-encrypted.md
    R-002-offline-support.md
  assumptions/
    A-001-user-count-under-1000.md
    A-002-network-available.md
  decisions/
    D-001-use-sqlite.md
    D-002-cache-strategy.md
```

## CLI Reference

```
arad init                              Initialize .arad/ in current directory
arad add <type> [title]                Add entity (interactive)
arad list [type]                       List entities
arad show <id>                         Show entity with immediate relationships
arad edit <id>                         Open entity in $EDITOR
arad trace <id>                        Show dependency tree
arad impact <id>                       Show what breaks if this changes
arad check                             Find orphans, contradictions, dangling refs
arad validate <id>                     Mark assumption as validated
arad invalidate <id>                   Mark assumption as invalidated
arad promote <id>                      Promote assumption to requirement
arad query <text>                      Search entities (supports modifiers)
```

### Query Syntax

```
arad query "sqlite"                        Fuzzy text search
arad query "type:decision status:accepted" Filtered search
arad query "driven_by:R-001"              Relationship search
arad query "tag:storage"                  Tag search
```

## Architecture

- **Text files as source of truth** — Markdown + YAML frontmatter, git-friendly
- **In-memory graph** — Parsed on every command (instant for repo-scale: <10k entities)
- **No database** — The filesystem IS the database
- **Structured query with fuzzy matching** — Token scoring, not LLM
- **One per repo** — `.arad/` lives in the project root, committed alongside code

## Development

```bash
bun install
bun run dev -- init          # Run during development
bun test                     # Run tests
bun run build                # Compile to standalone binary
```

## License

MIT
