# Greenfield complete-business benchmark protocol

Owner: #72. Measurement reuse: #73. Expo reuse: #88, only when the selected
product, revision, toolchain, and authority actually match.

A protocol PR is progress, not completion of the real-run requirement.

## Prerequisites (all required before a measured run)

1. Founder-approved representative app and empty-directory workspace.
2. Frozen mandate, product scope, and acceptance rubric hashes.
3. Selected recipe, providers, platforms, host agent, and toolchain pins.
4. Authorized budget and stop line.
5. Authority for any live provider mutation, device, submission, or publication.

Missing any row is a hold, not permission to invent the app or splice later
repairs into a frozen-baseline success.

**Current hold:** those inputs are not supplied on this checkout. After Credits
is a candidate only when that workspace is actually provided.

## Report contract

These fields are a read model over existing receipts. They are not public API
and not a second execution state.

| Record | Required information |
| --- | --- |
| Run | Unique run reference; builder commit/version/package digest; app source revisions; mandate/scope/rubric hashes; selected recipe/providers/platforms; actual worker/runtime/model/toolchain; timestamps; authorized budget/stop-line references |
| Attempt | Existing session/attempt/workflow reference; start/end; result; retry/repair reason; observed usage/cost source; referenced outputs and review |
| Intervention | Time; phase; category; trigger; safe question/action summary; affected work; whether independent work continued; resolution and evidence reference |
| Observation | Claim; source/environment/revision; fixture/workspace/provider provenance; observed value or explicit unknown; coverage limitation |
| Final verdict | Every accepted requirement mapped to current proof or blocker; independent quality judgment; delivery status; separate submission/release/live claims |

Intervention categories: planned founder decision; external dependency;
unplanned builder rescue; discretionary product/scope change.

## #73 Stage A

Reuse this report. The unit of analysis is one observed selected subgraph, not
the whole catalog. Until a #72 interval exists, the keep/change recommendation
is **retain the current graph**. The compact boundary table is
[workflow-overhead-boundaries.md](./workflow-overhead-boundaries.md). Observed
cost stays unknown. Apple media (#38) stays an independent-effect boundary. Do
not merge to reduce workflow count.

## #88 reuse

Reuse this report only for a matching Expo product scope. The frozen matrix is
[expo-proof-matrix.md](./expo-proof-matrix.md). Missing device or cloud access
stays `not-run` / `blocked`.
