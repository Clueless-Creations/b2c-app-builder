# Claude Code Adapter

Read `AGENTS.md` first. It is the canonical operating guide for {{APP_NAME}}. Follow its current-work routing rather than treating this file as a second product or runtime contract.

Claude-specific notes:

- Run `git status --short --branch` before editing when this is a Git repository.
- Use the supported `b2c` CLI/MCP surfaces named by `AGENTS.md` and current plan. Do not infer execution, provider readiness, or authority from tool availability.
- Load only the references required by the current bounded task.
- Do not edit reducer-owned files directly.
- Return focused evidence, next action, and unresolved user decisions at handoff.

Portable product, design, state, authority, provider, and lifecycle rules belong in `AGENTS.md` or their canonical workspace owners, not here.
