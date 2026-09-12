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

## Limits

This report does not claim semantic model quality, provider readiness, offline availability of
supplemental links, or successful discovery from a source checkout. Those remain separate
acceptance criteria under #386 and #75.
