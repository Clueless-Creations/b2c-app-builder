# Task-skill host-discovery rehearsal

Status: deterministic package proof passed; Codex native discovery verified; Claude native discovery held by host authentication.

## Tested artifact

- Source revision: `bdccdaf96a9d9b365808035b7747c1bb865f590e`
- Package: `b2c-app-builder@0.220.40`
- Artifact mode: `npm pack --dry-run`
- Packed file count: 2,625
- Task-skill contract: 19 passed, 0 failed
- Package parity: 0 errors, 0 warnings

The packed artifact contains the generated root skill, the nine declared portable task skills,
their required references, notices, and relocation-safe resource closure. This is package proof,
not proof that a host has discovered or loaded a skill.

## Host observation

| Host | Observed version | Documented user location | Matching installed B2C skills | Result |
| --- | --- | --- | ---: | --- |
| Codex CLI | `0.149.1` | native skill-discovery catalog | 9 task skills plus 3 routers | Verified: native output named all nine task skills and distinguished the routers |
| Claude Code | `2.1.261` | native skill-discovery path | unavailable | Held: native probe returned `Not logged in`; no discovery result was claimed |

The Codex probe used read-only, ephemeral execution and returned these nine task names:
`b2c-research-opportunity`, `b2c-design-onboarding`, `b2c-review-monetization`,
`b2c-define-product`, `b2c-plan-implementation`, `b2c-review-business-performance`,
`b2c-review-experience`, `b2c-plan-launch`, and `b2c-verify-release-readiness`.
It also identified `b2c-app-builder`, `b2c-contributor`, and `b2c-maintainer` as routers,
not task skills. No files were edited, and no network command, provider call, or paid operation
was invoked by that probe. The Claude probe made no billable request (`total_cost_usd: 0`) and
returned `Not logged in` before discovery; no Claude discovery claim is made.

No host installation or configuration change was performed. The Codex result is actual native
discovery evidence, not a filesystem listing. Claude remains an explicitly open criterion until
the host has an authorized login and a repeatable native discovery result.

## Current live-main rehearsal

This is a bounded follow-up record, not a claim that the complete distribution program is closed.
It covers one portable business task from live `main` and keeps host discovery separate from
package and semantic evaluation claims.

- Source revision: `5f440b8d1f12597ea1d90fd6f04f753f6241d563`
- Package version: `0.220.80`
- Selected task: `b2c-research-opportunity`
- Export mode: create-only portable export into a fresh temporary directory
- Export result: `bundledSources: 96`, `supplementalSourceLinks: 8`,
  `installed: false`, `executionIncluded: false`
- Exported `SKILL.md` SHA-256:
  `c25ede04fa76797cdbdb3bd468519fb19dfd5b10f3fa23fdff3596f27e94b439`
- Exported `source-manifest.json` SHA-256:
  `d385620044e0e957de87fe887b7eab2a25f59664829d79dd592dae643730776e`

The export was copied into isolated repository-local discovery locations for Codex and Claude
Code. No user configuration was changed, and no provider or paid task was invoked.

| Host | Installed version | Discovery result | Status |
| --- | --- | --- | --- |
| Codex CLI | `0.149.1` | Read-only `codex exec` in the isolated Git workspace reported `b2c-research-opportunity` as available. | Passed for skill-name discovery |
| Claude Code | `2.1.261` | Read-only print invocation reported `You've hit your weekly limit`; it did not produce a discovery result. | Open: host quota |
| Cursor Agent | `2026.01.28-fd13201` | Version-read only; no discovery claim was made because #386 targets Codex and Claude first. | Not run |

The Codex response did not expose a description sentence because its skill context budget omitted
descriptions. That is recorded as an evidence limit, not filled in from the source file.

## Limits and remaining holds

This report does not claim semantic model quality, provider readiness, offline availability of
supplemental links, or successful discovery from a source checkout. Claude Code discovery must be
repeated after its quota resets. The integrated nine-task packed-library, relocation, and
reference-closure checks, plus main-entrypoint-only and root-plus-task comparisons, remain open
under #386. #26 owns publication and consumer-install decisions; #75 owns semantic model/tool
outcomes.
