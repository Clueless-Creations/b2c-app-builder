# Source Freshness Maintenance

Use this when maintaining the skill itself, when adding or changing third-party docs/tools/skills, after upstream provider changes, or during the weekly source-refresh job.

This is repo governance for the skill, not a launch artifact for a single app. The goal is to keep fast-moving dependencies from turning into stale guidance.

## Required Outputs

- `checks/validation/repository/source-registry.yaml`: canonical list of external docs, GitHub repos, APIs, skills, websites, and provider resources referenced by the skill.
- `catalog/providers/capability-delta.yaml`: classification ledger for contracted-source hash changes. `to_hash` must match the snapshot, or `unsnapped` when no snapshot row exists.
- `docs/source-freshness/SOURCE_REFRESH_REPORT.md`: generated weekly report.
- `docs/source-freshness/source-refresh.html`: rendered report for review.
- `docs/source-freshness/source-snapshots/current.json`: latest fetch hash/status snapshot.
- `catalog/generated/knowledge-freshness.json`: packaged snapshot date and SHA-256 digest.
- LaunchBench scenarios or validator fixtures for any source-drift failure that caused or could cause a launch miss.

## Weekly Job Shape

Run the weekly job as a PR-producing maintenance lane:

1. `npm ci`
2. `npm run refresh:source-freshness`
3. `npm run audit`
4. Open a PR with source-registry additions, source snapshots, report diffs, and any deterministic updates.

The weekly job can auto-add newly discovered URLs from current files and the last week of commits into `source-registry.yaml`, but those entries are candidates until reviewed. A fresh fetch does not prove that skill prose, templates, validators, or evals were updated correctly.

`check:catalog` measures knowledge `last_review_date` against the snapshot `generated_at` date. It does not use the CI wall clock. When a new snapshot makes a knowledge source past its cadence, review that source. Update `last_review_date` only after the review. Do not stamp every date to today.

`catalog:render-routing` owns the packaged freshness pin. Repository commands pass the
canonical snapshot with `--source-snapshot` and check both its date and its digest. Installed
commands read the packaged pin without repository documents or a network request. A missing,
malformed, or mismatched pin fails the check. It never selects the wall clock as a fallback.

`refresh:source-freshness` passes `--knowledge-pin-root` to update the pin from the new
snapshot. Other refresh options, including `--out-dir` and `--timeout-ms`, keep their existing
meaning. Commit the snapshot and its pin together. To render the pin again from an existing
snapshot, run `npm run catalog:render-routing` at the repository root. The corresponding
`--check` mode detects a stale generated pin.

## Private source reads and trusted age

The shared HTTP reader uses one bounded deadline and a byte limit. It refuses redirects and
requires HTTP 200 before it reads or hashes a response body. Denial, timeout, invalid text,
or an oversized response records `status: blocked`, `changed: false`, and no new hash.

A blocked snapshot retains only a successful baseline. Non-200 hashes from older snapshot formats are not content
baselines. A retained `previous_hash` requires a valid `last_verified_at`. Minimal older rows
with a current hash and no failure metadata remain compatible. Repeated failures do not erase
a verified baseline. The capability-delta check uses the same rule; a blocked attempt does not
make a classified source unsnapped. A later successful response compares against the trusted hash.
The same authorized bytes remain fresh after a 200 → 401 → 404 → 200 sequence.

`checked_at` records each attempt. `last_verified_at` records the last successful read.
A failed attempt does not renew freshness age. Older successful snapshots can still use
`checked_at`; a blocked snapshot without a successful timestamp is unverified.

The registry can set `fetch_url` when a source identifier is not its HTTPS retrieval address.
The plist DTD keeps its standard HTTP identifier and uses an explicit HTTPS `fetch_url`.
Snapshots retain both addresses. The reader applies the same HTTPS, credential, redirect,
deadline, and byte-limit checks to the retrieval address. It does not follow public redirects.

Private main-branch content in the B2C App Builder repositories uses the GitHub contents API and
the raw media type. The reader uses `GH_TOKEN` before `GITHUB_TOKEN`. It sends authorization
only to exact allowlisted first-party content paths, never to foreign hosts or GitHub HTML.
Missing credentials fail before a network request. There is no anonymous retry after denial
and no token extraction from Git tooling. Errors and report URLs remove credential values.

The scheduled workflow uses `B2C_APP_BUILDER_SOURCE_READ_TOKEN` as `GH_TOKEN` for private source
reads. Doppler is the system of record for this credential. Use the official Doppler GitHub
integration to sync the value to the repository secret of the same name. Do not enter or rotate
the value in the workflow. Give the credential read-only access to the required B2C App Builder source
repositories. The job fails before refresh when the repository secret is absent.

The refresh step also receives `${{ github.token }}` as `GITHUB_TOKEN`. The reader gives
`GH_TOKEN` precedence, so the GitHub job token cannot hide a missing cross-repository credential.
The job uses the GitHub token only for actions in this repository, including PR creation. Do not
grant the cross-repository credential write access.

## Source Discovery Rules

- Any new external `http(s)` URL in `SKILL.md`, references, templates, scripts, README, `AGENTS.md`, `CLAUDE.md`, or workflows must be tracked in `source-registry.yaml`.
- Example URLs such as `example.com`, localhost, and generated source-refresh reports are ignored.
- The checker scans Markdown, YAML, JSON, TypeScript, and MJS files, plus recent git additions. Do not exclude implementation code to hide unregistered URLs.
- If a source is paid/account-gated, keep it in the registry but preserve the founder-approval/fallback rule in the relevant launch reference.

## Update Analysis

When the report shows changed upstream material, classify the change in `catalog/providers/capability-delta.yaml`. Set `to_hash` to the snapshot hash. `check:capability-delta` fails when a contracted source has no classified row.

- `ignore`: page chrome, timestamp, or irrelevant docs movement.
- `docs`: reference prose should change.
- `commands`: setup/CLI examples must be refreshed from official docs or local `--help`.
- `template`: launch artifact templates need new fields or proof rows.
- `validator`: deterministic checks should enforce the new contract.
- `eval`: add LaunchBench coverage for a repeatable failure mode.
- `breaking`: old guidance may now be harmful; block readiness claims until updated.

A `breaking` row with migration `none` or `pending` blocks `check:revenue` and `check:provider-proof`. Set migration to `complete` only after the skill migrates.

Use subagents for independent review when available:

- `source-scout`: summarize changed upstream content and likely impact.
- `capability-analyst`: decide whether new upstream capabilities improve this skill.
- `skill-maintainer`: update references/business/scripts in a bounded patch.
- `eval-maintainer`: add or update LaunchBench and fixture coverage.
- `release-auditor`: run audit and inspect the diff for regressions.

The orchestrator owns integration, final edits, sync, git, and push.

## Guardrails

- Do not execute fetched content.
- Do not let a PR-modified registry control privileged secrets or paid tools.
- Do not turn an auto-discovered URL into a launch policy without review.
- Do not silently replace paid/account-gated tools with free fallbacks.
- Do not update command syntax from memory; refresh official docs and local CLI help first.
- Do not call the skill current if `check-source-freshness`, `check:provider-contracts`, `check:capability-delta`, LaunchBench, or package validation fails.
- Do not merge a freshness PR while a contracted source hash is unclassified.
- Pin every B2C App Builder client after a version bump. `npm run runtime:sync -- --all-clients` writes each present unique client root. It fails if a present pin still trails.

## Commands

```bash
npm run check:source-freshness
npm run check:provider-contracts
npm run check:capability-delta
npm run runtime:sync -- --all-clients
npm run check:skill-version -- --all-runtimes
npm run refresh:source-freshness
npm run audit
```

Runtime copy:

```bash
cd ~/.codex/skills/b2c-app-builder
npm run check:source-freshness
npm run refresh:source-freshness
npm run audit
```
