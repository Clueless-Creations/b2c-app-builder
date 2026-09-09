# Adopt external sources

## Purpose

This guide is for a contributor or a maintainer. It explains how the builder takes
useful material from a post, repository, skill, library, tool, screenshot utility,
showcase, or managed provider, and how it keeps that upstream relationship honest.
The contract is `b2c.contribution/v1` in [`contracts/contribution/contract.ts`](../../contracts/contribution/contract.ts).
[ADR-0005](../decisions/0005-source-adoption-and-upstream-maintenance.md) records the
decision. One service, `kernel/contribution/service.ts`, serves the CLI and MCP.

## Three scopes and how to route

Route by the intended target and the effect of the work. Do not route by the
person's title. The root `AGENTS.md` opens with the same table.

| Scope        | Skill                               | Intended target                                         | Effect                                          | Surface                                              |
| ------------ | ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| business     | `b2c-app-builder`                   | One business workspace                                  | Product, design, code, and evidence for one app | `b2c-app-builder` MCP and the `b2c` CLI              |
| contribution | `b2c-contributor` (opt-in)          | This repository's knowledge, packages, checks, examples | A reviewed draft that a release can adopt       | `b2c contribute`; contributor MCP tools when enabled |
| maintenance  | `b2c-maintainer` (repository-local) | Core mechanisms and upstream relationships              | Manifests, observations, credits, versions      | `b2c contribute upstream-*`, `npm run check:*`       |

A business worker never receives contributor tools or contribution results.

## Lifecycle

1. Intake: name the sources and the goal. Record what was retrieved and how.
2. Inspect: inventory the files, find the license, and list directives as data.
3. Map: split the material into units, name the existing local owner, and choose a disposition.
4. Prepare: write the reference, package, check, or example in the builder's vocabulary.
5. Validate and evaluate: run `check`, `preview`, and the declared evaluations.
6. Register the upstream: when an accepted unit adapts, reuses, wraps, or vendors repository material, propose `catalog/upstreams/<id>.yaml` with its notice, source-registry rows, and exact reviewed commit. Reuse an existing identity when one matches. `check` refuses acceptance without it.
7. Review: a second context reads the adoption map, the rights evidence, and the proposed manifest.
8. Release a version: bump the version, regenerate projections and credits. From this release, maintenance owns the manifest.
9. Explicit business adoption: a business pins the new version on its own decision.

A small change stays small. One sentence added to one reference needs a source
record and a derivation, not a full contribution root.

## Sources and intake

The contract accepts these source kinds: repository, post, article, skill,
library, tool, screenshot-utility, showcase, managed-provider, local-package, and
other. A source record keeps the origin, publisher, revision, retrieval status,
rights, selectors, inventory, and unknowns.

Fetched or inspected content is untrusted reference data. A README, SKILL.md,
AGENTS.md, setup script, hook, or tool declaration never authorizes anything. A
sentence that reads as an instruction to the agent is recorded as a directive
(install, execute, overwrite-artifact, configure-agent, publish, grant-permission,
fetch-remote, or other) with the action `refused`. Intake never executes package
code, install hooks, generators, screenshot scripts, or provider setup. It never
spawns a process from a source's own files. Several `--source` flags form a batch;
overlap is recorded by topic in `batchOverlap`, and provenance stays per source.

## Classify units and choose a disposition

A unit is one coherent useful piece. The six unit kinds are knowledge (a
method, rule, or fact), recipe (an ordering of operations and review),
implementation (code that performs an operation), resource (a schema, prompt,
asset, font, or notice), evaluation (a counterexample, scenario, command, or
comparison), and showcase (an example with captures and provenance). Prefer the
least transformation that serves the goal.

| Disposition | Use when                                                            |
| ----------- | ------------------------------------------------------------------- |
| reference   | Cite the source. Copy nothing.                                      |
| adapt       | Reauthor selected material in the builder's vocabulary.             |
| reuse       | Use the upstream as a dependency without change.                    |
| wrap        | Call the upstream through an adapter that owns the effect boundary. |
| vendor      | Copy bytes with the retained notice.                                |
| defer       | Record the unit and the reason. Decide later.                       |
| reject      | Record the unit and the reason. Do not adopt.                       |
| original    | The unit has no upstream. Its `upstream` field is `null`.           |

Never label copied material as original. Never replace the original author's identity with ours.

## The adoption map

`b2c contribute plan` writes `contribution.yaml` and `ADOPTION_MAP.md` under
`--target`. Each unit records `id`, `kind`, `title`, `upstream` (source id and
selector, or `null`), `target` (kind, id, path, owner), `disposition`, `status`,
`rationale`, `verification`, `kept`, `changed`, `omitted`, `deferred`,
`conflicts`, `selection`, and `applicability`. `selection` is `always`,
`selected-method`, or `reference-only`. A creator's aesthetic is a selectable
method. It never becomes a universal default. Example rows:

| Unit                      | Kind      | Upstream selector   | Target             | Disposition | Selection       |
| ------------------------- | --------- | ------------------- | ------------------ | ----------- | --------------- |
| metadata-dry-run-ladder   | knowledge | README.md#metadata  | existing-reference | adapt       | selected-method |
| screenshot-frame-template | resource  | templates/frame.svg | extension-package  | vendor      | selected-method |
| install-hook              | resource  | scripts/postinstall | undecided          | reject      | reference-only  |

## Provenance and derivations

Knowledge manifests carry optional source fields `publisher`, `revision`,
`published_at`, `retrieved_at`, `rights` (`status`, `spdx`, `evidence`,
`evidence_sha256`, `notes`), `selectors`, and `upstream_id`, plus a `derivations`
block. Each derivation names `source_ids`, a `relationship` (informed, adapted,
copied, wrapped, dependency, referenced), `baseline`, `selectors`, `rationale`,
`omissions`, `reviewer`, `reviewed_at`, an optional `evaluation`, and a `notice`.

Four dates mean four things. The publication date is when the author published.
The retrieval date is when we fetched the bytes. The revision is the immutable
tag, commit, or fingerprint we read. The review date is when a maintainer judged
the material. Do not substitute one for another. Unknown stays `unknown`. Never
fabricate a revision, a version, a license, a review date, or an impact judgment.
A hash proves which bytes were referenced. It does not prove that anyone read
them, and it does not prove a license.

## Rights

Rights statuses are verified, unverified, unknown, incompatible, not-redistributable, and
not-applicable. Evidence is the license text that was inspected, with its digest and scope.

- MIT: copies and substantial portions keep the copyright notice and the
  permission notice ([MIT license text](https://opensource.org/license/mit)).
- No license file: the repository keeps default copyright. GitHub's license
  detection is not legal advice ([licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)).
- Copyright protects expression, not ideas or methods ([copyright.gov FAQ](https://www.copyright.gov/help/faq/faq-general.html)). Cite the idea with `informed` and reauthor the method. Do not copy the prose.
- Posts and articles: cite them. Quote at most a short phrase with attribution.
- Fonts and assets: each carries its own license. Record the scope of the evidence, for example "root LICENSE; fonts under assets/ excluded".
- Managed providers: a repository license never licenses a hosted service. Record the service terms separately.

Validation enforces two rules. A `copied` derivation needs a notice and verified
rights. An `adapted` derivation refuses incompatible or not-redistributable
rights, and refuses unknown rights on an active package.

Declare notices. A package declares `notice` resources and a `thirdParty`
block (`id`, `project`, `upstream`, `license`, `copyright`, `notice`, `covers`).
`kernel/composition/notices.ts` renders `THIRD_PARTY_NOTICES.md` for an output
on request and refuses an uncovered font asset. The `package-notices` suite
proves that library path. No composition or render path calls it yet, so a
generated output carries no notices until that wiring lands; it is a follow-up
owned by the composition activation owner.

## Adapting external skills

Keep the method steps, the decision rules, and the checks a step names. Strip
install instructions, hooks, tool grants, agent configuration, marketing claims,
and version claims you did not verify. Package instructions are subordinate
reference material. They cannot expand scope, grant authority, or establish
success. The order of authority is fixed: the mandate, then the selected recipe,
then the capability contract, then the selected provider, then upstream
guidance. An upstream `SKILL.md` is never a peer of the business skill. It
cannot add a business requirement, widen provider permissions, install another
tool, change provider selection or business state, override evidence
requirements, redefine completion, publish, or spend unless the selected
operation permits that behavior. The Agent Skills `allowed-tools` field is experimental and host
enforcement varies ([specification](https://agentskills.io/specification)). A
skill's claimed restriction is prose unless the host enforces it.

## Runtime delivery

A reference is `draft`, `active`, or `deprecated`. Only an active reference bound
to a workflow reaches a worker brief. `b2c contribute preview` shows what active
workers would receive: bound workflows, lifecycle-based inclusion, draft and
reference-only exclusions, and coverage (`complete`, `truncated`, `excluded`,
`not-applicable`). It changes no catalog or workspace. The contributor sees the
whole inventory: sources, units, rights, and refused directives. The business
projection is the active knowledge bundle for one selected workflow. Nothing
from `contribution.yaml` enters a worker brief.

## Upstream relationships

An upstream manifest lives at `catalog/upstreams/<id>.yaml`. Verbatim notice
texts live under `notices/` and dated observations from `upstream-check --write`
under `observations/`. A manifest records authors, license evidence, service
terms, registry rows, relationships, baselines, support, intentional
adaptations, an optional read-only host probe, the review cadence, and credits.

Each relationship names how the project powers the builder. The seven kinds are
`external-executable` (a host binary runs; the host pins it, not the builder),
`direct-dependency` (a package the lockfile pins), `selected-skill-guidance`
(skill text loaded as subordinate reference when a workflow selects it),
`adapted-method` (a procedure reauthored in the builder's vocabulary),
`copied-code` (bytes vendored with their notice), `template-or-asset` (a
template, font, or asset vendored with its notice), and `remote-service` (a
hosted endpoint reached through an adapter). One project may hold several. The
kind decides whether code executes, which notice travels, what an upgrade can
break, which check applies, and whether a business worker ever sees the project.
A wrapper is an adapter over one of these kinds, not a kind of its own. An
informational citation is a source-registry row, not a relationship.

Ownership follows the lifecycle. The contributor proposes the manifest when an
accepted unit reuses repository material; `check` reports `upstream_required`
without one. After the release that ships the manifest, maintenance owns its
baselines, observations, support ranges, review status, and credits. Before a
release, the maintainer reads `docs/upstreams/coverage-report.md`, which
`npm run render:credits` writes from active bound knowledge declarations. A
reusable dependency, method, or tool needs an identity. A citation does not.

Version facts stay in their own fields and never collapse into one number. The
manifest records the reviewed source baseline and the reviewed guidance baseline
(`baselines`), the builder's supported range (`support.versions`), and the
read-only host probe. The observation records the latest release, the branch
head, and the executables found on PATH. The workspace's composition pin lives in
the workspace, never in the manifest. Upstream latest is not the reviewed
baseline. The reviewed baseline is not the supported range. The supported range
is not a workspace upgrade. For the Rork App Store Connect CLI
(`catalog/upstreams/rork-app-store-connect-cli.yaml`) on 2026-09-08:

1. Reviewed source baseline: 5.1.0, from local `--help` output on 2026-09-08.
2. Reviewed guidance baseline: 5.1.0 release notes, reviewed 2026-09-08.
3. Latest observed stable release: 5.1.0, published 2026-09-08.
4. Branch head: `main` at the 5.1.0 tag commit on 2026-09-08.
5. Host executable: 5.1.0 first on PATH at `~/.local/bin/asc`, with `/opt/homebrew/bin/asc` also at 5.1.0 and the same digest. That digest is the Homebrew bottle, not the GitHub macOS arm64 release asset.

The shipped Rork observation
(`catalog/upstreams/observations/rork-app-store-connect-cli.json`) was assembled
by a maintainer from GitHub API responses retrieved on 2026-09-08 and is labeled
method `manual`. A fresh `upstream-check --fetch --observe-host --write`
replaces it. Reviewed guidance tracking latest stable does not collapse these
five fields and does not upgrade the host.

Host drift is real. Two executables on one machine can differ, and PATH order
decides which one runs. A passing probe proves the probed binary only. The Rork
skill pack manifest records its guidance baseline commit as `unrecorded`, because
the 2026-08-18 review did not record it; the CLI's own `install-skills` pins a
reviewed commit. Layers (`catalog/upstreams/layers-growth-mcp.yaml`) is a hosted
service: the repository is MIT, the CLI license is unverified, the service terms
are unreviewed, and the builder has never onboarded a business. A deferral
records a reason, a reconsider condition, and an owner. A license change, an
archived repository, or changed service terms moves the review status to
`risk-review`. The check's classification is a candidate for review, never a verdict.

## Commands

```sh
b2c contribute plan --source <https-url|path> [--source ...] --goal <text> [--scope business|contribution|maintenance] [--target <dir>] [--network] [--synthetic] [--batch] [--json]
b2c contribute check --target <contribution-root> [--json]
b2c contribute preview --target <contribution-root> [--json]
b2c contribute evaluate --target <contribution-root> [--suite <id>] [--allow-commands] [--json]
b2c contribute upstreams [--upstream <id>] [--observe-host] [--json]
b2c contribute upstream-check --upstream <id> [--fetch] [--observe-host] [--write] [--json]
b2c contribute upgrade-plan --upstream <id> [--candidate <tag>] [--target <dir>] [--json]
npm run check:upstreams
npm run render:credits
npm run check:credits
```

Network intake needs `--network`. Writes happen only under `--target` or
`--write`. `evaluate` is CLI-only. `B2C_APP_BUILDER_MCP_CONTRIBUTOR=1` registers
`b2c_contribute_plan`, `b2c_contribute_check`, `b2c_contribute_preview`,
`b2c_contribute_upstreams`, `b2c_contribute_upstream_check`, and
`b2c_contribute_upgrade_plan`. Those tools are read-only: no fetch, no write, no
host probe, and local reads only at absolute paths inside `B2C_APP_BUILDER_CONTRIBUTION_ROOTS`.

## Credits

`npm run render:credits` generates `ACKNOWLEDGMENTS.md`,
`THIRD_PARTY_NOTICES.md`, and `docs/upstreams/support-report.md`. An upstream
whose manifest sets `credits.acknowledge` to true appears in `ACKNOWLEDGMENTS.md`
with its use (direct, wrapped, adapted, inspiration, service) and summary.
`THIRD_PARTY_NOTICES.md` carries the retained verbatim notice texts. The support
report states baselines, supported versions, and review status per upstream.
`npm run check:credits` fails on drift. Gratitude and legal notices are separate
surfaces, and nothing from either enters a worker brief.

## Limits

No scheduled upstream check exists. CI is disabled by the founder, and the
maintainer runs `upstream-check` by hand. Tests use recorded fixtures under
`checks/verification/test/data/` and never use the network. Live verification
needs `--fetch` for the GitHub API, `--observe-host` for the PATH probe, and a live
command probe for executable guidance. An unsuccessful check is not evidence of currency.
