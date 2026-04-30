{
  "id": "aceb1ddf",
  "title": "`arad graph` — text-based graph visualization (Mermaid/DOT/ASCII)",
  "tags": [
    "enhancement",
    "visualization"
  ],
  "status": "done",
  "created_at": "2026-04-30T19:44:07.827Z"
}

## Goal
Add a text-based visualization of the full ARAD graph to see the network of relationships at a glance.

## Scope
- Add `arad graph` command that renders an ASCII/Unicode overview of all entities and their relationships
- Consider layout approaches:
  - **Grouped by type** — requirements at top, assumptions middle, decisions bottom, with edges drawn between them
  - **DOT output** — emit Graphviz DOT format, let users pipe to `dot -Tpng` if they want a real graph image
  - **Mermaid output** — emit Mermaid markdown that renders in GitHub/GitLab
- Start with Mermaid + DOT output (both text-based, no layout engine needed in ARAD itself)
- Add `--format mermaid|dot|ascii` flag (default: mermaid)
- ASCII rendering can be a simple indented tree per root entity

## Example
```
arad graph --format mermaid > graph.md
arad graph --format dot | dot -Tpng -o graph.png
```

## Out of scope
- Built-in image rendering (require graphviz installation is fine)
