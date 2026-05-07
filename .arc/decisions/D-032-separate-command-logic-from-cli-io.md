---
id: D-032
title: "Separate command logic from CLI I/O"
status: accepted
date: 2026-05-04
driven_by: [R-014]
---

Follow the check.ts pattern: pure functions return structured data, CLI wrappers handle display/exit. MCP server delegates to pure functions. Typed errors via src/core/errors.ts
