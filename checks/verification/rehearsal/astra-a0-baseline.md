# Astra guidance migration A0 baseline

Pinned source revision: `d8f37967450340bdcb4ddd4ac55d7011587cd78d`
Captured: 2026-09-12
Mode: deterministic source/procedure accounting; no live model, provider, device, paid evaluation, or deployment.

This is a reproducible before snapshot for #392. It reuses the existing
fixture/evaluation owners in #73 and #75; it is not a new evaluator or context
store. Measured bytes are UTF-8 bytes. The token column is intentionally not
reported: no tokenizer/model surface was exercised.

## Standing files

| File | UTF-8 bytes | Code points | Status |
| --- | ---: | ---: | --- |
| `AGENTS.md` | 9,604 | 9,604 | automatically supplied at repository root |
| `SKILL.md` | 5,653 | 5,653 | direct business router |
| `agents/skills/b2c-app-builder/references/setup.md` | 1,586 | 1,586 | conditional setup reference |

## Frozen cases

| Case | Expected router | Required guidance | Irrelevant standing guidance | Protected stop | Verification |
| --- | --- | --- | --- | --- | --- |
| focused read-only experience review | business → focused task | app instructions, experience task | maintainer architecture, provider setup, launch program | none | review evidence; no implementation |
| tiny implementation plan | business → focused plan task | app instructions, plan task | launch/provider/operator procedures | none | plan-only; do not implement |
| narrow code fix | business → focused task | app instructions, affected surface | full launch program, unrelated providers | none | focused tests and required gates |
| managed-business continuation | business → lifecycle/status → plan | lifecycle, status, plan, current brief | contributor/maintainer curriculum | current hold, if any | status/evidence and bounded continuation |
| provider unselected | business → provider task | applicability/selection guidance | selected-provider procedure | stop before provider access/selection | focused checks; preserve unknown |
| provider selected, access unavailable | business → provider task | selected provider and unavailable-access guidance | unrelated providers | stop before access/config change | local deterministic checks |
| deployment/publish/spend | business → protected action | action-specific authority/evidence | unrelated business procedures | approval/authority required | no external effect |
| maintainer architecture change | maintenance → maintainer router | architecture conformance and affected ADRs | business onboarding | protected effects as applicable | architecture and required gates |
| maintainer provider integration | maintenance → maintainer router | provider guide, canonical boundary, conformance | business task skills | credentials/access/spend | provider contract and conformance |
| contributor source adoption | contribution → contributor router | contribution, rights, provenance, source adoption | maintainer architecture and business lifecycle | access/license concerns | contribution checks |

## Accounting notes

The root files are automatically supplied in the tested repository loading
mode; a later instruction such as “stop reading” cannot remove already
injected `AGENTS.md` bytes. Conditional references are counted only when the
case requires them. This static baseline records expected routes and required
procedures, not observed agent file traces, approval pauses, tool use, task
selection, or testing behavior. Those remain open under #75.

Existing defects are preserved for comparison. The candidate must rerun this
same matrix at its own revision and report bytes separately from model tokens.

## Retained-owner map for the candidate

| Baseline detail moved from root | Retained owner |
| --- | --- |
| business/contribution/maintenance read itineraries | the three scoped routers linked above |
| exact verification commands and cadence | `CONTRIBUTING.md` |
| provider and architecture procedure | maintainer router and linked guides |
| source adoption and rights procedure | contributor router and source-adoption guide |
| setup/surface/degradation diagnostics | `agents/skills/b2c-app-builder/references/setup.md` |
| composition and mobile procedure | existing conditional business references |
| generated task-skill presentation | catalog descriptors and task-skill renderer |
| upstream lifecycle, kitchen/writing, history, and CI narration | existing scoped guides or redundant repetition; not deleted contracts |
