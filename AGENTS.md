This is the **arad** repository — a CLI tool and MCP server for architecture traceability (Architecture, Requirements, Assumptions, Decisions).

## Dogfooding: arad documents itself

**All architectural decisions, requirements, assumptions, risks, and ideas in this project must be recorded using arad itself.** The `.arad/` directory is the single source of truth for the project's architecture.

This means:

- **Decisions** (D-xxx): Every significant design or technology choice must be added as a decision via `arad add decision`, linked to the requirements that drive it.
- **Requirements** (R-xxx): New capabilities and constraints must be captured as requirements before or alongside their implementation.
- **Assumptions** (A-xxx): Unvalidated assumptions that influence the architecture must be made explicit and tracked until validated or invalidated.
- **Ideas** (I-xxx): Exploratory thinking and future possibilities go here, not in code comments or scattered docs.
- **Risks** (K-xxx): Identified risks must be tracked with their mitigation status.
- **Terms** (T-xxx): Domain-specific terminology should be defined in the glossary.

### Workflow

1. Before implementing a feature, ensure there is a requirement for it.
2. Before making a design choice, add a decision linked to the relevant requirements.
3. If you're assuming something, record it as an assumption.
4. After implementation, check that the graph is healthy: `arad check`

### Commands

```bash
arad status              # project health summary
arad list                # list all entities
arad add <type> <title>  # add an entity
arad show <id>           # show entity detail + relationships
arad link <from> <to>    # create a relationship
arad trace <id>          # trace dependency tree
arad check               # health check
arad graph --format dot  # visualize the graph
```
