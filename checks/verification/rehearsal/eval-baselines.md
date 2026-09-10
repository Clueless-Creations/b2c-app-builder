# Evaluation and measured-simplification baselines

Maintainer protocol for #2, #39, #40, #72, #73, #75, #77, #78, and #88.
This is not a second acceptance store and not a new evaluation platform.

Builder pin for this write-up: current `main` at authoring time. A measured run
must record its own commit, package version, and package digest.

## What this pass does

| Issue | This pass | Hold |
| --- | --- | --- |
| #2 | Reuse the existing batch harness. `npm run evals:behavioral -- --list` is the authorized local inventory. | Paid Message Batches path still needs an authorized `workflow_dispatch` and a linked results artifact. No key, no spend here. |
| #39 | Replay `store-010` with real `matchWorkflows` (primary vs candidates). Keep `catalog()` on the hosted surface. | Keep open. A terse ASC ask is `candidates`, not a confident primary. Do not extract the scorer into hosted `catalog()`. |
| #40 | Keep `not_requested` / incomplete as a delivery record. Do not change `service.ts`. | Runtime `coverage.delivery` and the completion-warning reword are #156. |
| #72 | Freeze the report contract and fabricated-receipt checks. | No founder-approved workspace, mandate, stack, budget, host, or publication authority. No live greenfield run. |
| #73 | Reuse the #72 report fields. Record keep/change as **no-change until a measured interval exists**. | Same authority hold as #72. No workflow merge. |
| #75 | Per-case Stage A report on the reviewed split in `checks/verification/goldens/eval/stage-a-cases.json`. Real service walks: instructions expand, hash-stable re-get, unique vs duplicated delivery, and separate volume units. Held-out `store-001` / `store-002` stay unused for ranking. | Stage A still open: no retrieval change adopted, held-out unused for tuning. Paid Stage B. No vector store. |
| #77 | Keep authored overlay `order` as a checked transcription of catalog phase order. | Deriving order out of YAML needs a schema/loader/legacy contract change that is not justified by a measured failure. |
| #78 | One guidance paragraph and tighter proposal-field descriptions. | Not a runtime gate. |
| #88 | Freeze the proof matrix against existing contracts. | No selected Expo app, device, cloud job, or matching #72 authority. Protocol cannot close the issue. |

## Shared accounting rules

Copied from #72 so #73 and #88 do not invent a second ledger:

- Report elapsed duration and summed work duration separately. Do not add concurrent attempt durations and call the sum wall-clock.
- A replayed request is not a second paid effect unless evidence shows another charge.
- Missing or subscription-covered cost stays unknown, not zero.
- Character-derived token estimates are not actual model usage.
- Failed runs stay in the denominator.
- Reporting never mutates acceptance or dispatches work.
- A builder revision change mid-run is a new measured interval.

## Authorized local commands for this pass

```sh
npm run evals:behavioral -- --list
npm run test:fixtures -- eval-baselines
npm run test:fixtures -- hosted-discovery
npm run test:fixtures -- design-foundation-guidance
npm run test:fixtures -- agent-graph
npm run test:fixtures -- porchwatch-knowledge
npm run typecheck
```

Do not run paid behavioral evals, live providers, devices, deploys, or a version stamp from this document.

## #75 Stage A remainder (this increment)

The eight reviewed cases are the issue's required classes. The fixture walks each
through `createKnowledgeService()` and fails per case id. Character-derived token
estimates stay labeled estimates. Actual model usage stays unknown.

This increment does not close Stage A. It does not tune retrieval against the
held-out paraphrases and does not run Stage B.
