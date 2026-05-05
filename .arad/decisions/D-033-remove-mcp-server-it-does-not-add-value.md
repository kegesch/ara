---
id: D-033
title: "Remove MCP server — it does not add value"
status: accepted
date: 2026-05-05
driven_by: [R-014]
supersedes: D-009
---

The MCP server duplicated command logic and added maintenance burden without sufficient value. AI agents can use the CLI directly or call pure functions via the core module. Removed @modelcontextprotocol/sdk and zod dependencies.
