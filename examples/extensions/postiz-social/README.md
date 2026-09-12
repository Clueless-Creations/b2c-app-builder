# Postiz social extension

This experimental package qualifies a narrow Postiz public-API boundary for draft, schedule, list, and delete post operations. It contains metadata and schemas only. Implementations are manual and fixtures use injected fake transport; no Postiz account, credential, or live request is used.

The supported recipe stages a draft for review. Scheduling and deletion are separate founder-gated effects. The package does not vendor the AGPL-3.0 Postiz agent CLI or application source.

Run the focused contract fixture from the repository root:

```sh
npx tsx checks/verification/fixtures/run.ts postiz-extension
```
