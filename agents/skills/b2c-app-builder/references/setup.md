# Connect the builder

## Connect

Use the local `b2c-local` MCP server from this repository for workspace planning and execution. Hosted knowledge registers as `b2c-hosted` and cannot see or run a local business. When both are configured, select by that capability; a leftover `b2c-app-builder` name is not a third surface. Duplicate names are a collision. Do not route consumer-app work through Planes.

This section is a connectivity gate, not the business start path. If the local MCP is unavailable:

1. Run `b2c inspect` when the CLI exists. `b2c doctor` is a supported equivalent.
2. When the user asked for setup, install this package's dependencies, link the package, and run `b2c setup`.
3. Use the exact MCP registration command that setup prints.
4. Keep the MCP read-only by default. Use the CLI for approved writes.

Do not edit an agent configuration or install software unless the user requested setup. The ordinary start is in Build a business: create or resume, then status, then plan.
