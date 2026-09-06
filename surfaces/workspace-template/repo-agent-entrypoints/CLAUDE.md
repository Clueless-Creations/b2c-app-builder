# Claude Code

Read `AGENTS.md` first. It is the canonical operating guide for {{APP_NAME}}.

- Start from `PRODUCT.md` and `DESIGN.md` before the runtime exists. Read
  `b2c status`, then `b2c plan`, once it does.
- Read proposed composition through `b2c compose --config b2c.yaml --json` when present. Preview does not apply it or prove provider readiness.
- Use the `b2c` CLI for approved state changes. Do not edit reducer-owned files.
- Claude tools do not grant authority for protected actions.
- Return focused evidence and unresolved user decisions at handoff.
