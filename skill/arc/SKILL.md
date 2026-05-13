---
name: arc
description: Track architectural decisions, requirements, assumptions, and ideas with ARC. Use when the user wants to record a decision, define requirements, capture assumptions, log ideas, trace why a decision was made, find contradictions, validate assumptions, or maintain traceability between architecture choices and their justifications.
---

# ARC — Architecture, Requirements, Assumptions, Decisions

ARC is a CLI tool that maintains a linked graph of architectural decisions, the requirements that drive them, and the assumptions that underpin them. All data lives in markdown files committed to git. Use it to keep your reasoning traceable, find contradictions, and ensure nothing is built on shaky ground.

## Setup

Before using ARC commands, ensure the project has been initialized:

```bash
# If .arc/ doesn't exist yet
arc init
```

The `.arc/` directory will be created in the project root. Commit it to git — it lives alongside code.

## When to Use This Skill

|| Situation                                                          | Action                 |
| ------------------------------------------------------------------ | ---------------------- |
| User describes a feature or constraint the system must satisfy     | `arc add requirement`  |
| User states something they believe to be true but haven't verified | `arc add assumption`   |
| User makes an architectural or design choice                       | `arc add decision`     |
| User has a speculative idea or "what if?" thought                  | `arc add idea`         |
| User identifies a person, team, or group with interest in the system | `arc add stakeholder` |
| User identifies something that could go wrong                       | `arc add risk`         |
| User wants to define a shared term or concept                      | `arc add term`         |
| User asks "why did we decide X?"                                   | `arc trace D-xxx`      |
| User asks "what happens if Y is wrong?"                            | `arc impact A-xxx`    |
| User wants to check the health of their architecture docs          | `arc check`            |
| User validates an assumption                                       | `arc validate A-xxx`   |
| User wants to connect entities after the fact                      | `arc link`             |
| User wants to visualize the full graph                             | `arc graph`            |

## Core Concepts

### Seven entity types

- **Requirement** (R-xxx) — Something the system must satisfy. Source of truth for what and why.
- **Assumption** (A-xxx) — Something believed true but not verified. Dangerous when wrong. Can be promoted to a requirement once validated.
- **Decision** (D-xxx) — An architectural or design choice. Should always trace back to requirements and/or assumptions.
- **Idea** (I-xxx) — A speculative thought or possibility, not yet committed to. Can be promoted to a requirement or decision when it crystallizes.
- **Stakeholder** (S-xxx) — A person, team, or group with interest in the system. Answers "who asked for this?" and "who is affected?".
- **Risk** (K-xxx) — Something that could go wrong. Tracked and mitigated via decisions.
- **Term** (T-xxx) — A shared vocabulary definition (ubiquitous language). Prevents ambiguity.

### Relationships

```
Requirement ──drives──▶ Decision          driven_by
Assumption ──drives──▶ Decision           driven_by
Requirement ◀──derived_from── Requirement decomposition
Requirement ◀──▶ conflicts_with           contradiction
Assumption ──promoted_to──▶ Requirement   validation outcome
Decision ──enables──▶ Decision            layered decisions
Decision ──supersedes──▶ Decision         replacement
Idea ──inspired_by──▶ Any Entity          what sparked it
Idea ──inspired_by──▶ Idea                idea building on idea
Idea ──promoted_to──▶ Requirement/Decision graduation
Requirement ──requested_by──▶ Stakeholder  who asked for this
Decision ──affects──▶ Stakeholder          who is affected
Risk ──mitigated_by──▶ Decision            what addresses this risk
```

Every decision should have at least one `driven_by` reference. Decisions without backing are "orphans" — a code smell.

### Assumption lifecycle

```
unvalidated → validated → (promoted to requirement)
    │
    └→ invalidated → (cascade: flag dependent decisions as at risk)
```

### Idea lifecycle

```
explore → parked       (interesting but not now)
    │
    ├──→ promoted     (graduated to requirement or decision)
    │
    └──→ rejected     (explored and discarded)
```

### Stakeholder lifecycle

```
active → inactive   (no longer involved)
```

### Risk lifecycle

```
identified → mitigated   (decision addresses it)
    │
    ├──→ accepted    (acknowledged, not mitigating)
    │
    ├──→ materialized (it happened)
    │
    └──→ closed      (no longer relevant)
```

### Term lifecycle

```
draft → accepted    (the team agrees on this definition)
    │
    └──→ deprecated (no longer used, replaced by another term)
```

Ideas are **non-binding**: they don't appear in strict `arc check` results (no orphan warnings, no contradiction checks). Use them to capture speculative thoughts without ceremony.

**Always surface unvalidated assumptions.** An accepted decision backed by an unvalidated assumption is fragile. Encourage the user to validate or promote assumptions early.

## Workflow

### 1. Initialize the project

```bash
arc init
```

Creates `.arc/` with subdirectories: `requirements/`, `assumptions/`, `decisions/`, `ideas/`, `stakeholders/`, `risks/`, `terms/`.

### 2. Add entities

```bash
# Requirements — what the system must do
arc add requirement "All data must be encrypted at rest" --status=accepted --tags=security

# Assumptions — what you believe to be true
arc add assumption "Users will have fewer than 1000 records" --tags=scale

# Decisions — architectural choices, linked to what drives them
arc add decision "Use SQLite for local storage" --status=accepted --driven-by="R-001,A-001"

# Ideas — speculative thoughts, linked to what inspired them
arc add idea "Use CRDTs for real-time sync" --inspired-by="D-001" --tags=sync

# Stakeholders — who cares about this system
arc add stakeholder "Warehouse operations team" --context=fulfillment
arc add stakeholder "Finance department" --context=billing

# Risks — what could go wrong
arc add risk "Payment provider downtime during peak hours" --context=billing

# Terms — shared vocabulary definitions
arc add term "Order" --context=billing

# With body content (non-interactive / agent use)
arc add decision "Use SQLite" --body='# Decision: Use SQLite

## Context
Need offline persistence.

## Decision
Use SQLite as embedded DB.

## Consequences
Single file, no concurrent writes.'

# Body from file or stdin
echo "..." | arc add assumption "Low latency" --body-file=-
arc add requirement "Auth" --body-file=auth-req.md
```

### 3. Link entities iteratively

Relationships are often discovered after the fact. Use `link` to connect existing entities:

```bash
# Link a decision to a requirement that drives it
arc link D-001 R-002

# Link a decision to another decision it enables
arc link D-001 D-002 --type=enables

# Mark a decision as superseding an older one (auto-marks old as superseded)
arc link D-003 D-001 --type=supersedes

# Mark two requirements as conflicting
arc link R-002 R-003 --type=conflicts_with

# Link a requirement to the stakeholder who requested it
arc link R-001 S-001 --type=requested_by

# Link a decision to the stakeholder it affects
arc link D-003 S-002 --type=affects

# Link a risk to the decision that mitigates it
arc link K-001 D-005 --type=mitigated_by
```

Edge type is auto-inferred when unambiguous:

- decision → requirement = `driven_by`
- decision → assumption = `driven_by`
- decision → decision = ambiguous, must specify `--type enables` or `--type supersedes`
- requirement → requirement = ambiguous, must specify `--type derived_from` or `--type conflicts_with`
- idea → any entity = `inspired_by`

### 4. Analyze

```bash
# What backs this decision? Show full dependency tree.
arc trace D-001

# What would break if this assumption is wrong?
arc impact A-001

# Full health check: orphans, contradictions, dangling refs, unvalidated assumptions
arc check

# Stricter: treat warnings (unvalidated assumptions, orphan requirements) as errors
arc check --strict

# Machine-readable output for CI
arc check --format json

# Search by text or modifiers
arc query "sqlite"
arc query "type:decision status:accepted"
arc query "driven_by:R-001"
arc query "tag:storage"
```

### 5. Validate assumptions, promote ideas

```bash
arc validate A-001        # Mark as validated
arc promote A-001         # Promote validated assumption to a formal requirement
arc invalidate A-001      # Mark as invalidated (shows cascade of affected decisions)

# Ideas can be promoted to either requirements or decisions
arc promote I-001                # Default: promotes to requirement
arc promote I-001 --to decision  # Promotes to a proposed decision
```

### 6. Visualize

```bash
arc graph                    # Mermaid (default, renders in GitHub)
arc graph --format dot       # Graphviz DOT format
arc graph --format ascii     # Plain text tree
```

Pipe Mermaid output into a markdown file for GitHub rendering. Pipe DOT into `dot -Tpng` for images.

## File Format

Each entity is a markdown file with YAML frontmatter in `.arc/`:

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

We need local persistence that works offline.

## Decision

Use SQLite as the embedded database.

## Consequences

- Single file, easy to version and backup
- No concurrent write support across processes
```

The body is freeform markdown. The frontmatter is the structured data ARC reads. You can `arc edit D-001` to open in `$EDITOR`, or edit the files directly.

## Best Practices for Agents

### When recording decisions

1. **Always set `driven_by`** — a decision without backing is an orphan. If you can't find a requirement or assumption that drives it, add one first.
2. **Be specific in titles** — "Use SQLite" is better than "Database choice".
3. **Fill in the body** — Context, Decision, Consequences is the standard template. Even a single sentence in each section is valuable.
4. **Tag consistently** — tags enable `arc query "tag:storage"` to find related entities.

### When adding requirements

1. **Make them testable** — "System responds in under 200ms" is better than "System is fast".
2. **Decompose large requirements** — use `derived_from` to link sub-requirements to their parent.
3. **Declare conflicts** — if two requirements contradict, `arc link R-002 R-003 --type=conflicts_with`.

### When capturing assumptions

1. **State them explicitly** — implicit assumptions are the most dangerous kind. If you hear "we assume..." or "it should be fine because...", capture it.
2. **Note how to validate** — the body template has a "Validation" section. Fill it in.
3. **Track their status** — unvalidated assumptions backing accepted decisions are a risk. Run `arc check` regularly.

### When analyzing

1. **Run `arc check` before finishing a session** — surface orphans and contradictions early.
2. **Use `arc trace` to justify decisions** — if a stakeholder asks "why did we choose X?", the trace tells the full story.
3. **Use `arc impact` before changing assumptions** — know what breaks before you invalidate.

## Query Reference

```
arc query "sqlite"                        Fuzzy text search (title, body, tags, ID)
arc query "type:decision"                 Filter by entity type
arc query "status:accepted"               Filter by status
arc query "tag:storage"                   Filter by tag
arc query "driven_by:R-001"              Find decisions driven by a specific requirement
arc query "derived_from:R-001"           Find requirements derived from another
arc query "id:D-001"                     Find by exact or partial ID
arc query "inspired_by:D-001"             Find ideas inspired by an entity
arc query "type:idea status:explore"       Find ideas in exploration
arc query "type:decision status:accepted sqlite"  Combine modifiers + text
```

## CI Integration

```bash
# In a git pre-commit hook
arc check --strict

# In GitHub Actions
arc check --format json
```

Exit code 0 = clean. Exit code 1 = issues found (or warnings in strict mode).

## Agent Integration

ARC is designed for seamless agent use. All commands work non-interactively and produce structured output:

```bash
# Machine-readable health check for CI/agents
arc check --format json

# Structured output for all list/show commands
arc list --format json
arc show D-001
arc trace D-001
arc impact A-001

# Non-interactive add (no TTY prompts)
arc add decision "Use SQLite" --driven-by="R-001" --status=accepted --body="..."

# Query with structured modifiers
arc query "type:decision status:accepted"
```

### Skill file installation

ARC ships a skill file that teaches agents how to use it:

```bash
# Print the skill file to stdout (pipe to your agent's skill directory)
arc skill

# Install directly into the current project's .hermes/skills/ directory
arc skill --install
```

The skill file covers all entity types, relationships, lifecycles, workflow patterns, and best practices for agent-driven architecture documentation.
