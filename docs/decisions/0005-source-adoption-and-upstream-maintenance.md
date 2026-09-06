# 0005: Source adoption and upstream maintenance

- **Status:** accepted
- **Date:** 2026-09-05
- **Steward:** architecture steward session of 2026-09-05 (Claude Code)
- **Authority:** the founder's source-adoption mandate
- **Affected rules and contracts:** ARCH-05, ARCH-06, ARCH-07, ARCH-09, ARCH-10, ARCH-11, ARCH-15; new `b2c.contribution/v1` contract; extension contract `b2c.extension/v1` (additive); repository boundary allowlist
- **Affected units:** none new
- **Refined by:** [0007](0007-upstream-lifecycle-and-agent-scopes.md): lifecycle handoff, relationship vocabulary, version facts, agent scopes

## Context and evidence

The builder relies on external material without a shared record of what it
took, from whom, under which rights, and at which revision. The gaps at
`8a515fa5`:

- The Rork `asc` executable is a direct upstream. Its command procedures are
  reauthored in `knowledge/store/app-store-connect-cli.md`, and the knowledge
  manifest records only a URL, a cadence, and a review date
  (`catalog/knowledge/store/store-app-store-connect-cli.yaml:20-36` at that
  commit). No file records the reviewed CLI revision, the license evidence, the
  supported version range, or the intentional local deviations.
- The source registry tracks URL freshness one row per URL. One project spans
  several rows: in `checks/validation/repository/source-registry.yaml` the Rork
  CLI is the rows `github-com-rorkai-app-store-connect-cli`,
  `github-com-rorkai-app-store-connect-cli-releases-4-9-0`,
  `github-com-rorkai-app-store-connect-cli-license`, and `asccli-sh`. A row has
  no authors, license, support, or adaptations.
- The extension contract had no resource kind for a retained notice and no
  place for third-party attribution. A package that vendors a template could not
  declare the notice that travels with it.
- The repository ships no acknowledgments file and no third-party notices file.
  ARCH-11 requires provenance on every observation
  (`docs/north-star-architecture.md:300-318`), and MIT copies must carry the
  copyright and permission notices.
- Host state drifts. On 2026-09-05 the host held two `asc` executables: 4.11.0
  first on PATH and a Homebrew keg at 2.8.1 shadowed
  (`catalog/upstreams/observations/rork-app-store-connect-cli.json`, `host`
  block). Nothing recorded which binary a passing probe had proven.

The mandate asks for one honest path from an external source to a released
version, with rights, provenance, and upstream maintenance as first-class data.

## Alternatives

1. **Extend source-registry rows with upstream blocks.** Rejected. URL rows and
   project identity differ in cardinality: Rork has four registry rows and one
   identity (`catalog/upstreams/rork-app-store-connect-cli.yaml:27-31`). The
   registry is machine-read by the freshness check, one row per URL. Folding
   authors, license, support, adaptations, and review cadence into it would make
   every URL row carry project facts it does not own.
2. **A separate maintainer platform** with its own store, planner, or runtime.
   Rejected. ARCH-02 allows one execution kernel, and ARCH-09 requires CLI and
   MCP to project one shared service (`docs/north-star-architecture.md:240-262`).
   A second tool would add a competing router and a second knowledge store.
3. **Put credits in worker briefs.** Rejected. ARCH-09 routes selected knowledge
   through the bounded knowledge service with explicit coverage, and unselected
   material must not leak. Credits are attribution and legal notices, not
   guidance. They belong in generated repository files.
4. **Record upstream identity as a new kind of truth under `catalog/upstreams/`
   with Git history.** Accepted.

## Decision

One contribution service, `kernel/contribution/service.ts`, serves the CLI
(`b2c contribute plan|check|preview|evaluate|upstreams|upstream-check|upgrade-plan`,
`entrypoints/cli/contribute.ts`) and the opt-in contributor MCP
(`entrypoints/mcp/contribute.ts`). The contract is `b2c.contribution/v1`
(`contracts/contribution/contract.ts:19`). It declares source records, units
with eight dispositions (`contract.ts:49`), six derivation relationships
(`contract.ts:48`), evaluations, notices, upstream manifests, and observations.

Upstream identity is a new kind of truth. Its owner is `catalog/upstreams/<id>.yaml`
with `notices/` and `observations/` beside it
(`kernel/contribution/upstreams-load.ts:13-15`). Git owns its history. ARCH-07
gains this row: external project identity, license evidence, reviewed baselines,
support claims, and intentional adaptations are owned by the upstream manifest;
knowledge manifests, provider contracts, and generated credits reference it.

Knowledge manifests gain optional provenance fields `publisher`, `revision`,
`published_at`, `retrieved_at`, `rights`, `selectors`, `upstream_id`, and a
`derivations` block (`catalog/types.ts:115-164`). Validation refuses a copied
derivation without a notice or verified rights, an adapted derivation with
incompatible or not-redistributable rights, and an adapted derivation with
unknown rights on an active package (`catalog/knowledge-validation.ts:114-141`).

The extension contract gains the resource kind `notice`
(`contracts/extensions/contract.ts:26`) and an optional `thirdParty` block
(`contract.ts:34-42`). A third-party entry must name a notice resource and may
cover only non-notice, non-pack resources (`contract.ts:190-198`).
`kernel/composition/notices.ts` is a library: `noticesForResources` collects
the entries that cover a set of resources, `assertRedistributable` refuses an
uncovered font asset, and `writeOutputNotices` renders `THIRD_PARTY_NOTICES.md`
into an output directory on request. The `package-notices` suite proves that
library path. No composition, starter, or render path calls the module yet;
wiring it into an output path is a follow-up owned by the composition
activation owner. Notices do not propagate automatically.

Credits are generated projections. `npm run render:credits` writes
`ACKNOWLEDGMENTS.md`, `THIRD_PARTY_NOTICES.md`, and
`docs/upstreams/support-report.md`; `npm run check:credits` fails on drift, and
`npm run check:upstreams` validates the manifests (`package.json:95,183,211`;
`tooling/lib/audit-plan.ts:223-227`). The two new top-level files are added to
the repository boundary allowlist in
`checks/validation/repository/check-repository-boundary.ts:64,71`. A public example
of the notices format is
[OpenClaw's THIRD_PARTY_NOTICES.md](https://github.com/openclaw/openclaw/blob/main/THIRD_PARTY_NOTICES.md).
Nothing of OpenClaw is adopted.

The contributor MCP is opt-in. `B2C_APP_BUILDER_MCP_CONTRIBUTOR=1` registers
`b2c_contribute_plan`, `b2c_contribute_check`, `b2c_contribute_preview`,
`b2c_contribute_upstreams`, `b2c_contribute_upstream_check`, and
`b2c_contribute_upgrade_plan` (`entrypoints/mcp/server.ts:700`). The surface is
read-only: no fetch, no write, no host probe, and local reads only at absolute
paths inside `B2C_APP_BUILDER_CONTRIBUTION_ROOTS`
(`resolveLocalPath`, `kernel/contribution/service.ts:125-147`). `evaluate` stays
CLI-only (`mcp: null`, `contract.ts:462-464`).

No new database, planner, or extension runtime is added. The service reads
files, validates them against the contract, and writes only a contribution
root or an observation when the CLI caller asks.

## Compatibility and migration

No `b2c/v1` input, output, error code, tool name, or CLI command changes. The
extension contract changes are additive: an existing `extension.yaml` without
`thirdParty` or `notice` resources validates unchanged. Knowledge manifests
without the new fields validate unchanged. Saved v1 fixtures keep passing.

Existing upstream relationships migrate by authoring a manifest. Three manifests
land with this record: the Rork CLI, the Rork skill pack, and Layers. Their
knowledge manifests may add `upstream_id` and derivations in later changes.
Values that were never recorded stay `unknown` or `unrecorded`; they are not
inferred from the current upstream head.

## Acceptance

The decision holds when these proofs pass without network access, from recorded
fixtures under `checks/verification/test/data/`:

| #   | Proof                                                                                                                                                                                                                                | Suite                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1   | Local intake produces source records, units, dispositions, and refused directives, and runs no package code, hook, generator, or setup                                                                                               | `contribution-plan`            |
| 2   | An original unit carries `upstream: null`; a fabricated upstream or a copied unit labeled original fails `check`                                                                                                                     | `contribution-plan`            |
| 3   | `check` fails a copied unit without a notice or verified rights and an adapted unit with incompatible rights                                                                                                                         | `contribution-plan`            |
| 4   | Batch intake records topic overlap while provenance stays per source                                                                                                                                                                 | `contribution-plan`            |
| 5   | The scope verdict follows intended target and effect, not the caller's title                                                                                                                                                         | `contribution-plan`            |
| 6   | Manifest loading enforces id and filename agreement and the notice digest                                                                                                                                                            | `upstreams`                    |
| 7   | `upstream-check` classifies releases since the baseline and reports installed-versus-supported, installed-versus-latest, shadowed executables, license change, and branch-ahead drift                                                | `upstreams`                    |
| 8   | An unrecorded baseline stays `unknown` and is never inferred from the branch head                                                                                                                                                    | `upstreams`                    |
| 9   | `upgrade-plan` retains intentional adaptations and changes no business pin                                                                                                                                                           | `upstreams`                    |
| 10  | `render:credits` writes the three credit surfaces from manifests and `check:credits` fails on drift                                                                                                                                  | `credits`                      |
| 11  | A `thirdParty` entry needs a `notice` resource, cannot cover an undeclared or notice resource, and `writeOutputNotices` renders its notice into an output directory on request; no composition or render path calls that library yet | `package-notices`              |
| 12  | The Layers package declares only its supported operations and its adapter uses a fake transport                                                                                                                                      | `layers`                       |
| 13  | A charged Layers call requires a matching quote and spend authority at the effect boundary                                                                                                                                           | `layers-spend`                 |
| 14  | Screenshot composition is a separate package with its own provenance and preserves raw captures                                                                                                                                      | `screenshot-compose`           |
| 15  | `preview` excludes draft and reference-only units, and nothing from `contribution.yaml` enters a worker brief                                                                                                                        | `contribution-runtime-context` |
| 16  | The MCP surface refuses network, host probes, writes, relative paths, paths outside configured roots, and symlink escapes; `evaluate` is CLI-only                                                                                    | contribution boundaries        |
| 17  | CLI and MCP return the same envelope for the same read operation                                                                                                                                                                     | contribution parity            |
| 18  | Knowledge manifests with derivations validate under the copied, adapted, and active-package rights rules                                                                                                                             | `knowledge-derivations`        |

A passing suite proves the tested behavior only. It does not prove that an
upstream is current, that a license was read by a person, or that a host binary
behaves as documented.

## Boundary statement

Upstream maintenance reads and writes `catalog/upstreams/` (manifests, notices,
observations), `docs/upstreams/`, and the generated credit files. It runs
version probes only, never an install or an upgrade. Business execution reads
only the active knowledge bundle for the selected workflow and the composition
pins of its workspace. Nothing in the contribution service touches reducer
state, workspace pins, the local registry, or provider connections. A
dependency bump activates no new effect; the support contract stays as authored
until a maintainer reviews it.

## Consequences

- `docs/guides/adopt-external-sources.md` is the contributor and maintainer
  guide. `agents/skills/b2c-contributor/SKILL.md` and
  `agents/skills/b2c-maintainer/SKILL.md` route to it.
- `workflow.machine.source-adoption-contributor` and
  `workflow.machine.upstream-support-maintainer` in
  `catalog/workflows/maintenance.ts` name the lifecycle and the gates.
- No scheduled upstream check is configured. CI is disabled by the founder. The
  maintainer runs `b2c contribute upstream-check` by hand.
- Notice propagation into generated outputs is not wired. Calling
  `kernel/composition/notices.ts` from composition activation, starters, or
  renderers is a follow-up owned by the composition activation owner.
- Founder-reserved decisions are unchanged: installing a skill pack, upgrading a
  host binary, signing a business into a managed provider, and any spend keep
  their existing authority boundary.
