# ASO Apple Keyword Evidence

Part of the [ASO And Store Operations](./aso-store-ops.md) hub — it decides which store lane runs and what evidence each lane must leave behind.

Use this before the first keyword lock and each weekly ASO loop.
Prefer official Apple data from Rork `asc` 5.1.0 (`asc optimize keywords rank` / `discover` / `score`).
Do not start with a paid ASO tool when `asc optimize keywords rank` can run.

Load `app-store-connect-cli.md` before any `asc` command.
Load `aso-store-ops.md` for metadata and founder gates.

## Contents

- 1. Official Sources
- 2. Evidence Receipt
- 3. Unavailable Values
- 4. Authorization Boundary
- 5. Metadata Mutation
- 6. Recurring Loop
- 7. Outputs
- 8. Common Failure Modes

## 1. Official Sources

Confirm `asc optimize keywords --help` before the first run.

Run this unauthenticated read first.

```text
asc optimize keywords rank
```

Use these Apple Ads reads only with an authorized Apple Ads profile and account.

```text
asc optimize keywords discover
asc optimize keywords score
```

`discover` comes from Apple Ads suggestion endpoints.
`score` reports competition, Apple Ads popularity, and optional current rank.
Do not claim B2C App Builder invented or listed every keyword.

## 2. Evidence Receipt

Record an ASO Evidence Receipt in `STORE_OPS.md`:

- storefront
- platform
- locale
- query set
- observed CLI version
- source availability
- raw inputs
- rank-window limitation
- collection time

Name every source. Name every limitation.

A missing result in the returned window does not prove global absence.
Country scope and Apple Ads phrase-suggestion scope are different.
Experimental outputs can drift. Confirm `--help` again after a CLI upgrade.

## 3. Unavailable Values

Keep `unavailable` as a first-class value.
Do not convert a failed lookup into rank 0.
Do not convert a failed lookup into no demand.
Do not convert a failed lookup into no competition.

## 4. Authorization Boundary

Public storefront ranking is read-only.
Apple Ads reads need existing authorized credentials and account scope.
Do not create campaigns. Do not change bids. Do not spend.

Secrets, profile names, account IDs, and tokens stay out of `STORE_OPS.md`.

## 5. Metadata Mutation

Feed candidates into the ASO decision in `STORE_OPS.md`.
Do not auto-apply metadata.

A metadata change still needs:

1. a written plan
2. founder approval
3. validation
4. dry-run
5. provider readback

## 6. Recurring Loop

Schedule the loop only for released apps.
Use exact target storefronts.
Deduplicate runs.
Retain deltas.
Do not keep unbounded raw responses.

## 7. Outputs

- ASO Evidence Receipt in `STORE_OPS.md`
- Official Apple Keyword Sources table with `available` or `unavailable`
- keyword decision list that does not apply metadata by itself

## 8. Common Failure Modes

- Skipping `asc optimize keywords rank` for a paid ASO tool
- Running `discover` or `score` without Apple Ads authorization
- Writing rank 0, no demand, or no competition for `unavailable`
- Auto-applying keywords to App Store Connect
- Committing tokens, keys, or profile secrets
