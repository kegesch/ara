This is the **arc** repository — a CLI tool for architecture traceability (Architecture, Requirements, Assumptions, Decisions).

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
arc add <type> <title>  # add an entity (requirement|assumption|decision|idea|stakeholder|risk|term)
arc show <id>           # show entity detail + relationships
arc link <from> <to>    # create a relationship
arc trace <id>          # trace dependency tree
arc impact <id>         # show what breaks if this changes
arc check               # health check
arc validate <id>       # mark assumption as validated
arc invalidate <id>     # mark assumption as invalidated
arc promote <id>        # promote assumption/idea to requirement
arc graph --format dot  # visualize the graph
arc skill               # output skill file for AI agents
arc skill --install     # install skill file into .hermes/skills/arc/
arc init-agent          # append ARC instructions to AGENTS.md
```

### Skill file for AI agents

ARC ships a skill file that teaches AI agents how to use it. To install it into the current project:

```bash
arc skill --install
```

This creates `.hermes/skills/arc/SKILL.md` which documents all entity types, relationships, lifecycles, and workflow patterns. Agents working in this project should load this skill before making architectural changes.

### Development

```bash
bun install
bun run dev -- init          # Run during development
bun test                     # Run tests
bun run build                # Compile to standalone binary
```