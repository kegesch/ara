{
  "id": "eda1b1a8",
  "title": "MCP server — expose ARAD graph as agent tools",
  "tags": [
    "enhancement",
    "mcp"
  ],
  "status": "done",
  "created_at": "2026-04-30T19:43:54.871Z"
}

## Goal
Wrap the ARAD graph engine as an MCP (Model Context Protocol) server so AI agents can query and modify the ARAD graph programmatically.

## Scope
- Create `src/mcp/` module with an MCP server using `@modelcontextprotocol/sdk`
- Expose tools that mirror CLI commands: `arad_query`, `arad_trace`, `arad_impact`, `arad_check`, `arad_show`, `arad_list`, `arad_add`, `arad_validate`, `arad_invalidate`, `arad_promote`
- Each tool returns structured JSON (not formatted terminal output)
- Add `arad mcp` CLI command to start the server (stdio transport)
- Add `arad mcp --port 3000` for SSE transport
- Agent use case: an agent reads requirements, checks for contradictions, and proposes decisions — all through MCP tools

## Depends on
- Core graph engine is stable (it is)

## Out of scope
- Authentication, multi-user — single repo, single user/agent
