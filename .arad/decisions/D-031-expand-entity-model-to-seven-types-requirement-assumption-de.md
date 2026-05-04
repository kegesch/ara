---
id: D-031
title: "Expand entity model to seven types: Requirement, Assumption, Decision, Idea, Stakeholder, Risk, Term"
status: accepted
date: 2026-05-04
tags: [model]
driven_by: [R-027, R-028, R-029, R-030]
supersedes: D-003
---

# Decision: Expand entity model to seven types: Requirement, Assumption, Decision, Idea, Stakeholder, Risk, Term

## Context

D-003 established three entity types (Requirement, Assumption, Decision). Real-world architecture tracking needs more: exploratory thinking that isn't yet a requirement (ideas), people affected by decisions (stakeholders), project risks with mitigation tracking (risks), and a shared glossary for domain terminology (terms).

## Decision

Add four new entity types with their own ID prefixes, folders, and status lifecycles:

- **Idea (I-xxx)** — statuses: explore, parked, rejected, promoted. Can be promoted to a requirement or decision.
- **Stakeholder (S-xxx)** — statuses: active, inactive. Linked via `requested_by` on requirements and `affects` on decisions.
- **Risk (K-xxx)** — statuses: identified, mitigated, accepted, materialized, closed. Linked via `mitigated_by` to decisions.
- **Term (T-xxx)** — statuses: draft, accepted, deprecated. A glossary entry with no outgoing edges.

Supersedes D-003 (three entity types).

## Consequences

- Entity model now covers the full architecture landscape: requirements, assumptions, decisions, ideas, stakeholders, risks, and terms.
- Each new type follows the same descriptor pattern (D-030), making extension straightforward.
- The link validation rules expand: risk→decision (mitigated_by), idea→any (inspired_by), decision→stakeholder (affects), requirement→stakeholder (requested_by).
- Status display and graph visualization handle all seven types.
