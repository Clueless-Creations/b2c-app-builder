# ADR-0010: First-run honesty owners

- Status: accepted
- Date: 2026-09-08
- Steward: B2C architecture maintainer
- Affected rules: ARCH-07, ARCH-09
- Affected units: U1, U4
- Public interface: no new MCP write; CLI doctor writes engine-home; workspace observe writes `run/`

This record does not reopen ADR-0008.

## Decision

Record three new truth owners and keep the five ADR-0005 / ADR-0007 version facts distinct.

1. Machine-local sanitized App Store Connect host snapshot lives under engine home. CLI `doctor` / `setup` write it. `b2c_status` and read-only MCP may read that stored file when present. They report that doctor has not been run when it is absent. They never spawn `asc`.
2. Live App Store `apps list` portfolio receipt lives under reducer-protected workspace `run/app-store-portfolio.json`, the same owner class as `run/app-review.json`. `workflow.operations.live-app-store-portfolio` writes it. Frontier admission of `workflow.research.research-backed-spec` waits for that node to succeed, then `check:app-store-portfolio-required` fails closed on a missing, truncated, web-authed, stale, or prose-only empty receipt.
3. Forbidden provider-project exclusions live on `operations/business-access.json` schema 2.1.0 as `forbiddenProviderProjects[]`. Mandate tables may mirror names only.

The portfolio hold is enforced by compiled workflow dependencies interpreted by `kernel/engine/frontier.ts` plus the receipt validator. It is not a parallel phase-order engine and not knowledge-only prose.

ARCH-07 now names:

- Machine-local host executable snapshot → sanitized engine-home file (CLI writer; MCP/status reader).
- Live App Store portfolio apps-list receipt → workspace `run/` observe artifact.
- Provider project exclusion policy → `operations/business-access.json` `forbiddenProviderProjects[]`.

ARCH-09 now states that read-only MCP may return stored engine-home host snapshots and persisted workspace observe receipts, and must not spawn upstream executables or perform scoped App Store Connect reads.

`catalog/upstreams/observations/` remains maintainer-maintained supply-side truth. Engine home holds the operator's last doctor run only. Doctor compares the PATH winner to committed `latestStable.tag`. It does not write reviewed guidance, support range, workspace pin, or upstream observation.

## Context and evidence

- First-run sessions could start `research-backed-spec` without a live App Store portfolio receipt, so an empty or invented portfolio looked like proof.
- `kernel/engine/frontier.ts` treats a dependency as ready only when `run.nodes[dep].status === "succeeded"`.
- `operations/business-access.schema.json` is closed (`additionalProperties: false`), so exclusions require schema 2.1.0 and every semver-locked consumer.
- ARCH-09 already forbids MCP from live-pulling provider data. A doctor snapshot and a `run/` receipt are stored observations, not live probes.

## Alternatives

A second tool registry, a phase-order engine, or MCP live-pull of `asc` would duplicate owners and violate ARCH-09. Soft-labeling research without a receipt would repeat the original session failure. Encoding the hold only in knowledge would let a succeeded empty node pass frontier.

## Compatibility and migration

Existing `2.0.0` business-access ledgers fail closed until they set `schemaVersion` to `2.1.0` and include `forbiddenProviderProjects` (empty array is valid). `check-founder-operator-bootstrap.ts`, the example ledger, founder-operator fixtures, and artifact-contracts knowledge move in the same change. The example workspace does not seed a fake portfolio receipt. Doctor snapshots stay off the knowledge-MCP deploy.

## Consequences

U1 writes and reads the engine-home doctor snapshot. U4 adds the portfolio workflow, the `run/` receipt check, schema 2.1.0, and the catalog dependency that parks research. Founder-zero copy may continue reversible local prep while step-away is held; it does not authorize `workflow.research.research-backed-spec`.
