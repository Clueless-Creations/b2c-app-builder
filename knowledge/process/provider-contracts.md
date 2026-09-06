# Provider Contracts

Use this when a freshness PR changes a contracted source. Use this when a client runtime pin drifts.

B2C App Builder is the platform. A skill install is a client of that platform.
Claude, Cursor, Codex, and Agents each pin one B2C App Builder version.
A client that trails the source pin is stale. Do not run launch work on it.

## Contracts

The catalog holds one YAML contract per vendor surface under `catalog/providers/`.
Three contracts are required:

- `revenuecat` — billing. Offerings, entitlements, and Experiments are required features.
- `agent-runtime-claude` — agent runtime. Skill install and CLI support are required.
- `apple-asc` — store CLI. It reuses the Slice 0 App Review capability receipt.

Apple `asc` features must list every App Review capability id. The contract must set `capability_receipt: app_review_asc`.

A contract names source-registry ids, not raw URLs. Register a new URL in `source-registry.yaml` first.

## Capability delta

`catalog/providers/capability-delta.yaml` is the classification ledger.
Every contracted source must have a row. `to_hash` must match the snapshot hash.
Use `unsnapped` when the source has no snapshot row yet.

Classify each hash change:

- `ignore` — page chrome or irrelevant movement
- `docs` — reference prose must change
- `commands` — CLI examples must change
- `template` — launch templates must change
- `validator` — a deterministic check must change
- `eval` — LaunchBench coverage must change
- `breaking` — old guidance may now harm a launch

Migration is `none`, `pending`, or `complete`.
A `breaking` row blocks revenue and provider-proof until migration is `complete`.
`check:capability-delta` fails closed on an unclassified contracted source.

## Multi-runtime pin

After a version bump, sync every client.
Run `npm run runtime:sync -- --all-clients`.
That command writes each present unique client root.
It fails if a present pin still trails the source.
A missing install is a skip.
Run `npm run check:skill-version -- --all-runtimes`.
