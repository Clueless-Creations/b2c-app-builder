# Connect the builder

## Connect

Use the local `b2c-local` MCP server from this repository for workspace planning and execution. Hosted knowledge registers as `b2c-hosted` and cannot see or run a local business. When both are configured, select by that capability; a leftover `b2c-app-builder` name is not a third surface. Duplicate names are a collision. A missing worker CLI degrades local execution health; it does not turn this connection into hosted knowledge. Degraded execution still selects b2c-local. Leftover CLI-only public MCP names stay CLI-only on this local connection. Leftover write-gated MCP names stay CLI-only on this local connection when writes are mcp_readonly. Hosted leftover names stay wrong-surface. Do not route consumer-app work through Planes.

This section is a connectivity gate, not the business start path. If the local MCP is unavailable:

1. Run `b2c inspect` when the CLI exists. `b2c doctor` is a supported equivalent.
2. When the user asked for setup, install this package's dependencies, link the package, and run `b2c setup`.
3. Use the exact MCP registration command that setup prints.
4. Keep the MCP read-only by default. Use the CLI for approved writes.

Do not edit an agent configuration or install software unless the user requested setup. The ordinary start is in Build a business: create or resume, then status, then plan.
## Surface diagnostics

`b2c-local` supports registered workspace work. `b2c-hosted` supplies
read-only knowledge and cannot execute a local business. A leftover
`b2c-app-builder` connection name is not a third capability. A missing worker
CLI degrades local execution health; it does not turn the connection into
hosted knowledge, and degraded execution still selects `b2c-local`. Leftover
CLI-only public MCP names remain CLI-only on the local connection. Leftover
write-gated MCP names remain CLI-only when writes are `mcp_readonly`; hosted
leftover names are the wrong surface.
