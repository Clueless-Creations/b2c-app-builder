# Agent-guidance foundation: comparison and acceptance ledger

Program #388; root contract #389; bounded Astra setup/router work #126; measurement #73; evaluation #75; acceptance #392.

## Current A0 replay on integrated main

Replayed on integrated main `7ad73d52b9d1bf80ced096fe0dc2726a5f20f555` with the existing `check:agent-entrypoints` consumer and the frozen `docs/research/agent-guidance-a0.json` corpus. Both the pinned baseline and current candidate reports completed with `0 error(s), 0 warning(s)` and 10/10 cases. The reports contain no `modelId`, `modelTokens`, `observedAgentTrace`, or `serviceResult`; this is deterministic packet evidence only, not live Astra or provider evidence.

| Case | Files | A0 bytes | Current candidate bytes |
| --- | ---: | ---: | ---: |
| A0-01 | 3 | 22,668 | 19,176 |
| A0-02 | 3 | 24,500 | 21,008 |
| A0-03 | 1 | 13,545 | 9,604 |
| A0-04 | 3 | 26,068 | 22,169 |
| A0-05 | 3 | 22,668 | 19,176 |
| A0-06 | 3 | 19,860 | 15,961 |
| A0-07 | 3 | 26,068 | 22,169 |
| A0-08 | 7 | 125,817 | 118,574 |
| A0-09 | 6 | 63,062 | 55,843 |
| A0-10 | 5 | 59,223 | 53,424 |

Reproduce with the two commands in the verification section below, using distinct report paths. The comparison shows narrower declared packets for every frozen case. It does not prove routing quality, unnecessary pauses, actual procedure reads, model tokens, provider behavior, or protected-effect handling; #75 and #73 retain those observed-evidence responsibilities.

## Status and coordination

This is a recoverable implementation candidate, not a verified merge. Do not close #389 or the parent issues on this document alone. Required version/generated integration, repository verification, and genuinely independent review remain open.

Baseline source is `8ab690f8c08ad627c470d074fffdead986f763a6`, the main revision containing task-skill expansion #387. Baseline-only commit `69e919a394d29cb65c0fb76a024dddc4a30a4b86` froze [the A0 manifest](agent-guidance-a0.json) before this agent changed guidance. It contains the ten prompts, expected routes, explicit/conditional reading, relevant/irrelevant procedures, source sizes/hashes, known defects, and unmeasured fields.

Concurrent implementation `107f2adc` was combined with that capture in `3961211d217cace438b0356f6d4cce2f44e77c2a` and opened as PR #393. A non-fast-forward update was rejected and was not forced. This integration preserves both histories and the existing [rehearsal note](../../checks/verification/rehearsal/astra-a0-baseline.md), restores standing obligations omitted by the shorter candidate, retains the conditional setup boundary without duplicate diagnostics, and adds structural controls. The old rehearsal note is historical; its shorthand routes are not a second case-definition owner. The frozen JSON IDs and prompts own this comparison.

The local environment has sparse source copies, not a Git checkout. GitHub/npm DNS resolution failed. Node 22.16.0 was available; Node 24, dependencies, and native Compound Engineering were unavailable. No clean-worktree, native CE invocation, installation, or independent-review claim is made. CE routing guidance was read, not invoked. The work uses the existing PR and does not alter main, CI, the runtime, providers, task methods, or maintainer/contributor routers.

## Measurement boundaries

Every declared repository packet counts all of AGENTS.md as automatically supplied, including text after an early-exit instruction. Named packet files count in full once. Conditional and app-specific material outside the packet is unmeasured, not zero. These packets are not complete transitive reading paths, observed model sessions, or total prompt sizes. A host that additionally injects CLAUDE.md must add its full 1,288 bytes. Model IDs, tokens, costs, latency, actual approval pauses, tool calls, task selection and verification behavior remain unmeasured.

Initial capture used pinned Git blob sizes; AGENTS.md, SKILL.md, and setup.md were also locally hash/byte verified. The existing-entrypoint replay added here has not been executed in a complete Node 24 checkout. No business/knowledge service or renderer was exercised during initial capture. Verification/approval fields describe instructions expected to survive, not observed agent behavior.

Preserved corpus limitations: A0-03 supplies no app-specific fixture, so its packet measures only the automatic root contribution. A0-07 carries a lifecycle packet although its prompt does not establish managed state. The older Markdown rehearsal uses broader shorthand than the JSON prompts and ambiguously describes root-file injection. None of these is silently corrected to improve the candidate's results. Any case refinement requires an explicit reviewed amendment to the frozen corpus.

### Direct sources

| Source | A0 UTF-8 bytes | Integrated candidate bytes |
| --- | ---: | ---: |
| AGENTS.md | 13,545 | 8,950 |
| SKILL.md | 5,611 | 5,661 |
| Conditional setup reference | 1,375 | 1,586 |

Root SKILL increases by 50 bytes: moving connection diagnostics makes room for a portable completion rule. The copy matches the standing contract and is equality-checked. It does not depend on repository AGENTS.md or import maintainer rules into a business export. The generated task-routing table remains byte-identical to A0. No percentage-reduction target is an acceptance gate.

Candidate blobs: AGENTS `f5f47d633c646b101070070af2a5842ae1c486e5`; SKILL `f79afdd461fdba7ea5bc639576ce547d0672af33`; setup `48452381097a7d02576cca681baf217af84b24cd`.

### Same frozen packets

Only the changed source sizes are substituted. All other named packet files remain unchanged. This is source-size arithmetic, not a full harness run or model trace.

| Case | Files | A0 bytes | Candidate bytes |
| --- | ---: | ---: | ---: |
| A0-01 | 3 | 22,668 | 18,123 |
| A0-02 | 3 | 24,500 | 19,955 |
| A0-03 | 1 | 13,545 | 8,950 |
| A0-04 | 3 | 26,068 | 21,523 |
| A0-05 | 3 | 22,668 | 18,123 |
| A0-06 | 3 | 19,860 | 15,315 |
| A0-07 | 3 | 26,068 | 21,523 |
| A0-08 | 7 | 125,817 | 121,222 |
| A0-09 | 6 | 63,062 | 58,467 |
| A0-10 | 5 | 59,223 | 54,628 |

## Removed-rule and retained-owner map

This covers the old root sections and obligations. Standing rules remain in root; scoped procedures retain their existing owners. These links are not a new startup reading list.

| Previous obligation | Retained owner or redundancy treatment |
| --- | --- |
| Mission: one business, then sibling, then independent experiments; small skill and durable knowledge | Root Scope and routing retains the standing intent. |
| Consumer-app-only scope and Planes parked | Root Scope and routing; existing Planes timeout document. |
| Three-scope routing, target rather than host, business early exit | Root table and existing business/contributor/maintainer routers. Narrow app fixes use app instructions. |
| Business read itinerary and bounded return to status/plan | SKILL and its existing lifecycle reference. Root retains the status/plan/authority/evidence boundary, not the full itinerary. |
| Contributor read itinerary | Existing contributor router, contribution contract, source-adoption guide and CONTRIBUTING. |
| Maintenance read itinerary | Existing maintainer core/provider lanes and architecture-conformance guide; applicable ADRs/migration units only. |
| Public-interface-first treatment of public changes | Root public-registry and compatibility rule; maintainer core lane and public-interface guide. |
| Complete public/private list and intentional placeholders | Root Public and private boundary retains secrets, live IDs, private references, personal/machine/customer data and production config prohibitions. SECURITY remains the non-public disclosure route. |
| No installed client copies, provider exports, workspace output, credentials or personal data in Git | Root Public and private boundary. Authorized private local installation is a separate matter. |
| Target architecture versus current mechanisms and stable ARCH rules | Root links the distinct north-star/current owners. Target rules are not implementation evidence. |
| One owner; no competing routers/catalogs/knowledge/planners/reducers/task-summary stores/agent graphs/workspace stores | Root Architecture and truth ownership, with ADR-0012 and ADR-0014. Agent graph is not a second knowledge graph. |
| Material ADR triggers versus compatible internal choices | Root retains public contract, truth, dependency, authority and migration triggers plus evidence and migration treatment. Conformance owns procedure. |
| Provider canonical operations and intake/implementation handoff | Root provider rule and the existing scope routers. Provider guide and ADR-0013 remain specialized owners. |
| Lossless founder/source intent | Root truth ownership and managed business skill. No compression to fit a prompt. |
| Product/design/reducer/Git/registry truth | Root names every owner; PRODUCT is rendered, DESIGN links detailed contracts, state changes only through the reducer. |
| Bounded active context, current/future guidance and unknown applicability | Root requires current guidance delivered or unresolved before dispatch. No automatic applicability downgrade or new context store. |
| Node 24, B2C_APP_BUILDER namespace and registry location | Root Authored and generated ownership; runtime-package guide retains details. |
| Shared CLI/MCP services, approved CLI writes, read-only MCP and explicit write/contributor gates | Root Authored and generated ownership; portable SKILL retains minimum execution/knowledge and write boundaries. |
| Guidance is not authority, execution or accepted evidence | Root completion and verification; portable SKILL retains no-grant and evidence distinctions. |
| Availability/selection/activation/execution/acceptance distinction | Root preserves each distinction and current provider/device/store/runtime evidence requirements. |
| Protected access/secrets/spend/pricing/legal/destructive/deploy/submit/release; conditional operator procedures | Root effect-boundary gating, valid existing scope, no fabricated grant/receipt, and hold only the protected action. Publication is explicit. |
| Registry before generated CLI/MCP/help/schema/reference output | Root Authored and generated ownership; existing registry/renderers remain owners. |
| README/package/router/template/setup/help/schema/source/tests/metadata alignment | Root alignment rule; exact generation/version commands remain in CONTRIBUTING. |
| Public-major supported inputs/meanings and stable public/catalog/reference IDs | Root compatibility rule; breaking changes still require decision and migration. |
| Public product/console/launch and Original Builder writing | Conditional no-slop owner in root, not duplicated prose. |
| Technical STE100, kitchen labels, literal effect/error/evidence language and Brigade not being a runtime entity | Conditional technical-documentation and ethos owners; root preserves the literal-language boundary. |
| Upstream intake, adoption units, rights/license/provenance, least transformation and no new primitive by default | Existing contributor/source-adoption/ADR-0007 owners. Root preserves architecture and upstream subordination. |
| Upstream cannot add requirements/permissions/tool installation/provider changes, override evidence/completion, publish or spend | Root keeps the prohibition and mandate/recipe/capability/provider precedence. |
| Three classes of agent documents, canonical guides, thin host adapters, generated references/reports | Root Authored and generated ownership; no new document class. |
| Nearest AGENTS, nested narrowing, no duplicate host policy | Root adapter/nested rule and existing entrypoint tests. |
| Business workspaces exclude maintainer ARCH/migration/procedures/contributor machinery | Root workspace boundary and unchanged existing workspace-leak negative controls. |
| Duplicated command list and full-audit reminder | CONTRIBUTING is the exact-command/cadence owner. Root requires focused iteration and all applicable final gates; presubmit is not full audit. CI is unchanged. |
| Primary agent owns Git/integration/external/destructive/release/final verification | Root integration rule, explicit bounded worker ownership, optional parallel work and genuine independent review. |
| Provider-neutral mobile capabilities, selected/native tools and no second router/evidence store | Existing mobile reference/operation guide; root provider bindings, actual availability, one-owner and evidence boundaries. |

Positive completion clarifies an implementation request's scope. It does not change runtime authority. Planning/review remains bounded and unrelated fixes are not authorized. The portable copy carries no maintainer ARCH rules, contribution commands, repository gate commands, or repository-only dependency.

## Structural verification and known failed gates

The existing `check-agent-entrypoints` retains its original canonical/router/adapter/workspace gates. A standing-obligation gate and explicit packet replay are appended. Its existing validation fixture retains the old controls and adds removed-rule, broken-owner/link, portable-copy, setup compatibility and full-injected-byte negative controls. These are source-structure tests, not semantic model proof.

Local evidence on the authored correction candidate:

- Original AGENTS, SKILL, setup and entrypoint checker matched their pinned Git object hashes.
- TypeScript transpilation reported zero syntax diagnostics for the changed helper/checker/fixture. This is not a typecheck.
- An ephemeral Node test probe exercised the helper against the actual three candidate source texts and explicitly synthetic destination fixtures: 107 passed, zero failed/skipped on Node 22.16.0. This is not the repository harness, package closure, Node 24 proof, or model evidence.
- The root generated routing block stayed byte-identical; SKILL stays under the existing 6,500-byte limit.

Do not transfer predecessor results to this candidate. PR #393's predecessor `3961211` ran CI 34668558221 on Node 24.20.0: 15 audit items passed, one failed, 88 skipped. The actual failure was `check:version-discipline`: `version_discipline.manifest_not_latest` and `version_discipline.version_not_ahead_of_base` (still 0.220.4). Full audit, hosted/app checks and required validator/public-api suites were not completed by that presubmit. The Codex review comment on #393 reports a usage limit, not a review.

Still unperformed for this integrated candidate: dependency installation, repository typecheck/format, real entrypoint/task-skill/package/contract suites, existing-harness A0 replay, required renders/version integration, skill validation, presubmit/full audit, hosted/app checks and independent review. Version/generated integration is outstanding implementation, not a waived gate. No live-model/provider verification was performed or paid for.

## Resume the existing owners, without bypasses

Use a complete Node 24 checkout of PR #393; re-read current main/version and preserve any later changes. Do not rewrite the frozen A0 source or pretend this environment supplied a clean Git worktree.

```sh
npm ci
npm run check:agent-entrypoints -- --guidance-baseline docs/research/agent-guidance-a0.json --guidance-source-ref 8ab690f8c08ad627c470d074fffdead986f763a6 --guidance-report /tmp/b2c-guidance-a0.json
npm run check:agent-entrypoints -- --guidance-baseline docs/research/agent-guidance-a0.json --guidance-report /tmp/b2c-guidance-candidate.json
```

The explicit report mode refuses to overwrite an existing output. Compare file lists, hashes and bytes with the frozen manifest. Missing files fail rather than count as zero; reports do not fill model/service fields. Run the existing focused entrypoint, task-skill, package and public-contract suites, including the new negatives. Fix real failures without changing expectations to hide A0 defects.

Complete CONTRIBUTING's same-change version integration: take the current main version plus one in skill-version.json, add specific release notes/date, align package and lock root versions, and regenerate through the existing `render:all` and `render:evidence-schema-version` owners. Do not hand-edit generated projections or publish a package. Re-run required package/reference parity, validate:skill and all applicable presubmit/full audit/hosted/app gates on the final candidate. An unavailable independent reviewer or failed export test remains a merge blocker, not a reason to weaken a check.

After genuinely independent review and required checks pass, inspect the final diff against current main, merge without force, and verify the actual merge SHA. Update the single canonical #392 result and link it from #388/#73/#75/#126. Do not close #126/#392/#388. Close #389 only when all its acceptance is evidenced.

## Precise next work outside this foundation

#390 owns the authored task-method rewrite and its existing renderer projections. In particular, the tiny-plan and screenshot-review cases still inherit overbroad launch/device/experience method checklists. Keep those defects visible, make applicability conditional without dropping required method guidance, preserve focused versus managed routing, and rerun the unchanged A0 identities plus task/export/behavioral owners. No runtime or workflow-node consolidation is implied.

#391 owns the full maintainer/contributor router rewrite. Core maintenance still receives upstream-support procedure; non-provider source adoption still inherits irrelevant provider/connectivity procedure. Separate core/provider/upstream/adoption paths behind existing guides, retain rights/provenance, provider canonical-operation and conformance requirements, current-command ownership and independent review. Reuse #73/#75 and compare A0-08 through A0-10 without changing their expectations.

Actual model verification remains under #75: use real approved model surfaces and observed traces, record actual identifiers/tokens/approval pauses/tool use/testing, and preserve unmeasured fields when unavailable. Deterministic source checks alone establish no improvement in Astra behavior.
