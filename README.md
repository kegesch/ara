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
arad add idea "Use CRDTs for real-time sync"
arad add decision "Use Stripe for payments" --context billing
arad trace D-001          # See what backs a decision
arad impact A-001         # See what breaks if an assumption is wrong
arad check                # Find orphans, contradictions, dangling refs
arad list --context billing  # List entities in the billing context
```

## Concepts

### Entities

| Type            | Prefix  | What it is                                                  |
| --------------- | ------- | ----------------------------------------------------------- |
| **Requirement** | `R-001` | Something the system must satisfy                           |
| **Assumption**  | `A-001` | Something believed true but not yet verified                |
| **Decision**    | `D-001` | An architectural or design choice                           |
| **Idea**        | `I-001` | A speculative thought or possibility — not yet committed to |
| **Stakeholder** | `S-001` | A person, team, or group with interest in the system        |
| **Risk**        | `K-001` | Something that could go wrong — tracked and mitigated       |
| **Term**        | `T-001` | A shared vocabulary definition (ubiquitous language)        |

### Relationships

```
Requirement ──drives──▶ Decision         (decision driven_by requirement)
Assumption ──drives──▶ Decision          (decision driven_by assumption)
Requirement ◀──derived_from── Requirement (decomposition)
Requirement ◀──▶ conflicts_with          (mutual contradiction)
Assumption ──promoted_to──▶ Requirement  (validated assumption → requirement)
Decision ──enables──▶ Decision           (layered decisions)
Decision ──supersedes──▶ Decision        (replacing old decisions)
Idea ──inspired_by──▶ Any Entity         (what sparked the idea)
Idea ──inspired_by──▶ Idea               (idea building on idea)
Idea ──promoted_to──▶ Requirement/Decision (graduated to something concrete)
Requirement ──requested_by──▶ Stakeholder (who asked for this)
Decision ──affects──▶ Stakeholder (who is affected by this)
Risk ──mitigated_by──▶ Decision (what addresses this risk)
```

### Key Queries

- **Trace** — Walk the graph from any entity. "What backs this decision?"
- **Impact** — Reverse traversal. "If this assumption is wrong, what breaks?"
- **Orphans** — Decisions with no backing requirement or assumption.
- **Contradictions** — Requirements that conflict with each other.
- **Ideas** — Speculative thoughts not yet committed to. Excluded from strict checks.
- **Dangling refs** — References to entities that don't exist.

### Stakeholders

Stakeholders represent the **who** — teams, roles, or groups that have an interest in the system. They answer "who asked for this?" and "who's affected by this change?"

```bash
arad add stakeholder "Warehouse operations team" --context fulfillment
arad add stakeholder "Finance department" --context billing
arad link R-001 S-001 --type requested_by   # Requirement requested by stakeholder
arad link D-003 S-002 --type affects        # Decision affects stakeholder
```

Stakeholders appear in `arad trace` and `arad impact`, so you can see not just what backs a decision but who cares about it.

### Contexts

Entities can be assigned a **context** to group them by domain area (e.g. `billing`, `fulfillment`, `auth`). Contexts are optional — use them when your project grows beyond a flat list.

```bash
arad add requirement "PCI compliance" --context billing
arad add decision "Use Stripe" --context billing
arad list --context billing       # Show only billing entities
arad check --context billing      # Check only billing entities
arad query "context:billing"      # Search by context
```

`arad status` shows a breakdown of entities per context when contexts are in use.

### Assumption Lifecycle

```
unvalidated ──▶ validated ──▶ (promoted to requirement)
     │
     └──▶ invalidated ──▶ (cascade: flag dependent decisions)
```

### Idea Lifecycle

```
explore ──▶ parked       (interesting but not now)
    │
    ├──▶ promoted ──▶ (promoted to requirement or decision)
    │
    └──▶ rejected    (explored and discarded)
```

### Stakeholder Lifecycle

```
active ──▶ inactive   (no longer involved)
```

### Risks

Risks represent what could go wrong. They track threats, their likelihood, and what's being done about them. A risk with `mitigated_by` links to decisions that address it.

```bash
arad add risk "Payment provider downtime during peak hours"
arad link K-001 D-005 --type mitigated_by   # Decision D-005 mitigates risk K-001
```

Risks appear in `arad impact` — if a mitigating decision is deprecated, you'll see the risk become unmitigated.

### Risk Lifecycle

```
identified ──▶ mitigated   (decision addresses it)
     │
     ├──▶ accepted    (acknowledged, not mitigating)
     │
     ├──▶ materialized (it happened)
     │
     └──▶ closed      (no longer relevant)
```

### Glossary (Terms)

Terms define the project's shared vocabulary — the ubiquitous language. They prevent the most common source of contradictions: different people meaning different things by the same word.

```bash
arad add term "Order" --context billing
arad add term "Fulfillment" --context fulfillment
```

Terms have no outgoing relationships — they exist as reference definitions. Any entity can reference a term by ID in its body.

### Term Lifecycle

```
draft ──▶ accepted    (the team agrees on this definition)
     │
     └──▶ deprecated (no longer used, replaced by another term)
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
context: storage
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
  ideas/
    I-001-crdt-sync.md
    I-002-offline-first.md
  stakeholders/
    S-001-warehouse-ops.md
    S-002-finance-team.md
  risks/
    K-001-payment-downtime.md
  terms/
    T-001-order.md
    T-002-fulfillment.md
```

## CLI Reference

```
arad init                              Initialize .arad/ in current directory
arad add <type> [title]                Add entity (interactive, type: requirement|assumption|decision|idea)
                                        Options: --context, --status, --tags, --driven-by, --derived-from,
                                                 --conflicts-with, --enables, --supersedes, --inspired-by,
                                                 --body, --body-file
arad list [type]                       List entities (--status, --tag, --context)
arad show <id>                         Show entity with immediate relationships
arad edit <id>                         Open entity in $EDITOR
arad remove <id>                       Remove entity (--force, --clean)
arad rename <id> <new-id>              Rename entity, updating all references
arad status                            Quick project health summary
arad import <path>                     Import ADR markdown files as decisions
arad trace <id>                        Show dependency tree
arad impact <id>                       Show what breaks if this changes
arad check                             Find orphans, contradictions, dangling refs (--strict, --context, --format)
arad validate <id>                     Mark assumption as validated
arad invalidate <id>                   Mark assumption as invalidated
arad promote <id> [--to <type>]        Promote assumption/idea (default: assumption→requirement, idea→requirement)
arad link <from> <to>                  Link two entities
arad unlink <from> <to>               Remove a relationship
arad query <text>                      Search entities (supports modifiers)
arad graph                             Visualize graph (mermaid, dot, ascii)
arad mcp                               Start MCP server (stdio)
```

### Query Syntax

```
arad query "sqlite"                        Fuzzy text search
arad query "type:decision status:accepted" Filtered search
arad query "driven_by:R-001"              Relationship search
arad query "tag:storage"                  Tag search
arad query "context:billing"              Context search
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
