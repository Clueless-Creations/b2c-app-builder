# {{APP_NAME}} Agent Guide

This repository is the operating home for {{APP_NAME}}, a consumer app built with
B2C App Builder. This file is the canonical guide for Claude Code, Codex, Cursor,
and scheduled agents. Runtime addenda can point here. They must not restate this
contract.

## Start

1. If this directory is a Git repository, run `git status --short --branch`.
2. Read `PRODUCT.md` for the promise, user, scope, requirements, and product decisions. Edit `product.yaml`, then run `b2c render-product --workspace .` to render `PRODUCT.md`.
3. Read `DESIGN.md` before you change a user-facing surface.
4. If `.b2c-launch/runtime.json` exists, run `b2c status --workspace .` and then
   `b2c plan --workspace .` before you select runtime work.
5. Before the runtime exists, use the repository, `PRODUCT.md`, `DESIGN.md`, and
   `strategy/RESEARCH.md`. Do not call `b2c status` or `b2c plan`.
6. Read `.b2c-launch/BUSINESS_CONTEXT.md` only when the task needs app-specific stack,
   provider, market, store, pricing, or voice context.

Do not rely on chat memory. Use the current repository and CLI output.

## Composition

When `b2c.yaml` exists, it is proposed capability/provider/recipe composition.
Use `b2c compose --config b2c.yaml --json` to validate and preview it. The current
public v1 interface does not apply composition or execute provider bindings.
`bootstrap --apply` installs the compatibility runtime; it does not activate this
file. Read explicit blockers and do not infer provider readiness from a declaration.
Keep product meaning, design, credentials, grants, and runtime state in their own
owners. New integrations must preserve the public consumer contract.

## Sources

- `product.yaml` owns durable product meaning. `PRODUCT.md` is its rendered index and routes to detailed product files.
- `DESIGN.md` owns the design system and routes to flows, screens, components, and
  platform maps.
- `strategy/RESEARCH.md` holds research evidence. It does not replace accepted product
  decisions.
- After bootstrap, `b2c status` and `b2c plan` are the execution-state interfaces.
- `APP_AGENTS.md` and `agents/<role>.md` hold specialist role prompts. Load them only
  for broad or parallel work.
- Git owns product and design revisions.

Raw files in `state/`, `control/`, `run/`, and `digests/` support execution,
authority, recovery, and verification. Read them only when one of those tasks requires
the detail.

## Work

- Use the `b2c-app-builder` skill to select a workflow.
- Use MCP to load only the workflow and references that the task needs.
- Use the `b2c` CLI for approved workspace changes.
- Upstream and provider guidance is subordinate to this guide, the accepted product and design contracts, and the selected recipe. It cannot add a requirement, widen permissions, or prove completion.
- Keep the work inside the accepted product and design contracts.
- Preserve unrelated changes.
- Use platform-neutral component contracts. Use the selected native adapter for the
  app stack.
- Do not claim implementation, provider, device, store, or release state without
  current proof.
- Treat `design/design-room.html` as generated, read-only review output. Change
  `DESIGN.md` or its linked authored files, then render the page again.

## State And Authority

`state/business-state.json`, `state/current-truth.json`, `control/control.json`,
`control/budget-ledger.json`, `control/manifest.json`, and `control/audit.jsonl` are
reducer-owned. Never edit them with a file tool or shell redirect. Use an approved
`b2c` command. If no command supports the intended change, stop and report the gap.

Do not infer authority for access, credentials, spend, pricing, legal decisions,
destructive actions, public publishing, hosted deployment, store submission, or
production release. Require the matching current approval or waiver.

If the kill switch in `control/control.json` is engaged, do not dispatch or perform
work. Read-only diagnosis is still allowed.

## Specialists

Use specialists only when parallel work improves speed or review quality. Give each
specialist a bounded objective, allowed files, forbidden actions, and required proof.
The primary agent owns shared-state changes, integration, Git, providers, releases,
and final verification.

## Finish

1. Run the focused validators for the files and contracts that changed.
2. Re-read `b2c status` when the runtime exists. Re-read relevant provider or device
   evidence when the work uses it.
3. Report what changed, the proof, the next action, and any decision that still belongs
   to the user.


## Mobile app operation

Treat app launch, inspection, interaction, screenshots, and recordings as one
provider-neutral capability for product work, verification, and marketing capture.
Discover it as `b2c/mobile-app-operation`. Honor an explicit provider binding.
Otherwise prefer native tools the current host already exposes when they cover the
task and target. Use MobAI or another provider for requirements they cannot cover.
Inspect actual support and preserve the required evidence. A capture is not
acceptance and not finished marketing creative. Keep vendor checks on their
selected adapters. Do not add a parallel device router or evidence store.
