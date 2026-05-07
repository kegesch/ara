This is the **arc** repository — a CLI tool and MCP server for architecture traceability (Architecture, Requirements, Assumptions, Decisions).

## Dogfooding: arc documents itself

**All architectural decisions, requirements, assumptions, risks, and ideas in this project must be recorded using arc itself.** The `.arc/` directory is the single source of truth for the project's architecture.

This means:

- **Decisions** (D-xxx): Every significant design or technology choice must be added as a decision via `arc add decision`, linked to the requirements that drive it.
- **Requirements** (R-xxx): New capabilities and constraints must be captured as requirements before or alongside their implementation.
- **Assumptions** (A-xxx): Unvalidated assumptions that influence the architecture must be made explicit and tracked until validated or invalidated.
- **Ideas** (I-xxx): Exploratory thinking and future possibilities go here, not in code comments or scattered docs.
- **Risks** (K-xxx): Identified risks must be tracked with their mitigation status.
- **Terms** (T-xxx): Domain-specific terminology should be defined in the glossary.

### Workflow

1. Before implementing a feature, ensure there is a requirement for it.
2. Before making a design choice, add a decision linked to the relevant requirements.
3. If you're assuming something, record it as an assumption.
4. After implementation, check that the graph is healthy: `arc check`

### Commands

```bash
arc status              # project health summary
arc list                # list all entities
arc add <type> <title>  # add an entity
arc show <id>           # show entity detail + relationships
arc link <from> <to>    # create a relationship
arc trace <id>          # trace dependency tree
arc check               # health check
arc graph --format dot  # visualize the graph
```
