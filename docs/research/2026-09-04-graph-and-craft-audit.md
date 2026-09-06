# Knowledge graphs, agent graphs, and complete consumer business delivery

Research date: 2026-09-04. Scope: the active B2C App Builder checkout.

The architecture already separates business facts, work vocabulary, workflow order,
expert guidance, and execution state. The improvement that matters is to connect
the accepted business requirements to implemented experiences and current evidence,
then use independent review to repair outputs until the complete contract passes.
Adding a graph database does not establish those outcomes.

One founder request can own a complete delivery across many internal research,
implementation, critique, repair, and verification cycles. A single model pass is
not an appropriate acceptance condition. Neither structural tests nor a successful
representative build proves that every future business will have exceptional design
or generate revenue. The actual output and commercial behavior need evidence.

## Current design focus

The founder narrowed implementation to the design workflow and actual landing/mobile craft. Generic ontology competency and complete-business acceptance changes are parked. The retained work makes required design guidance complete, separates production from calibrated review, binds judgment to the actual candidate, and drives repair.

At the initial inspection, the repo's SwiftUI files were motion and token examples,
and web starters included landing stubs and incomplete behavior. The isolated
[TUCK reference](../../examples/tuck/README.md)
now contains a native target, a working browser bag, shared original assets, and
focused tests. Its current source-bound
local test receipt (`examples/tuck/tests/proof/tuck-local-test-proof.json`, generated locally and not committed)
records a 12-of-12 landing pass and a 25-of-25 native pass. The receipt binds native
source fingerprint `b79f7500145647d75df57d5b0ec9961a94d2fe69525314ce3466d8ef793a167c`,
landing source fingerprint `04d6eac67e0307096d8ab5053087eab5ec4743491a4048260b6c4b671cc33899`,
and receipt-body hash `ad221f8fe0835716bf691bf33c75f1c3414dca1f327286e879399f7aad2896fb`.
Strict design
acceptance remains intentionally incomplete because the final
`design/proofs/design-acceptance.json` report and physical-iPhone VoiceOver evidence
are absent. The initial simulator proof adapter launched without installing the new
app; strict evidence must still bind the exact current binary, its installation,
and observed interactions.

## Findings From The TUCK Design Loop

These findings come from source inspection and the evolving reference work. They
are reusable acceptance requirements, not a claim that the whole candidate passed.

| Concrete finding                                                                                   | Required repair and proof                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A failed primary save can leave the visible bag unchanged while replacing the previous backup.     | Treat visible state, primary bytes, backup bytes, entered fields, and undo as separate invariants. Inject primary and backup write failures; preserve the valid recovery point and report any failed rollback honestly. |
| A fresh-looking table can hide malformed startup data and let the next ordinary edit overwrite it. | Enter an explicit recovery state, preserve damaged bytes and valid backup material, and validate the chosen recovery before replacing data. Reopen the app and inspect the result.                                      |
| Rerendered packing controls can look correct after their focused DOM node was removed.             | Exercise keyboard packing, undo, editor save/cancel, and removal. Return focus to a surviving meaningful control and continue the task in the actual browser.                                                           |
| A landing described as a static demonstration actually edits, saves, and imports a local bag.      | Author its real empty, validation, storage-failure, and import-recovery coverage. Keep browser and native capabilities explicit; the browser does not inherit native categories or presets.                             |
| A successful native build can be followed by launching an old installed binary.                    | Install the exact new artifact on the selected target before launch. Record build, install, device, and source identity with actual native execution evidence.                                                          |
| The shared visual language depends on implementation, not only a design document.                  | Render the same original object geometry and intended typography in native and web, verify native font registration, and compare actual primary and recovery states across both surfaces.                               |

The [browser command/storage tests](../../examples/tuck/tests/landing.test.mjs),
[native persistence tests](../../examples/tuck/native/Tests/TripStoreTests.swift),
and [native UI journeys](../../examples/tuck/native/UITests/TuckJourneyTests.swift)
provide executable seams for these requirements. In the verified local run, the
landing suite passed 12 of 12 tests and the native model, persistence, and UI suites
passed 25 of 25 tests. The browser harness is not a live browser, and passing tests
do not replace the final candidate-bound acceptance report. Neither a screenshot
nor a valid review schema proves a gesture, save, restore, focus sequence, or
installed binary.

The reusable sequence is: freeze the actual scope and rubric; build and install;
execute primary, recovery, and accessibility paths; capture the current candidate;
obtain independent criterion judgments; repair and repeat the affected work. Keep
this inside the existing design workflows and original mandate. Missing execution
or unresolved findings keep design acceptance incomplete.

## Primary sources and decisions

All links below were checked on 2026-09-04. Dates identify the publication when it
is available. The implementation recommendations are this audit's application of
the sources to the repository, not claims made by the source authors about B2C
App Builder.

| Source                                                                                                                                                   | Applicable finding                                                                                                                                                                                                                                                        | Decision for this repository                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Stanford, Ontology Development 101](https://protege.stanford.edu/publications/ontology_development/ontology101-noy-mcguinness.html)                     | Competency questions define the useful scope of an ontology. Instances should answer those questions at the needed level of detail.                                                                                                                                       | Test real requirement-to-journey-to-evidence questions. A class appearing in a question is insufficient proof that the product graph answers it.                                                                                                                                                                                                     |
| [W3C SKOS Reference, 2009-08-18](https://www.w3.org/TR/skos-reference/)                                                                                  | Concepts, labels, informal hierarchies, and associations serve a different purpose from a formal domain ontology.                                                                                                                                                         | Keep `catalog/taxonomy/` as the work thesaurus. Do not use work phases or roster roles as consumer-business facts.                                                                                                                                                                                                                                   |
| [W3C SHACL, 2017-07-20](https://www.w3.org/TR/shacl/)                                                                                                    | Explicit shapes constrain graph data and produce validation results. Validation leaves the input graph unchanged.                                                                                                                                                         | Extend existing type, relationship, and cardinality checks. Add actionable semantic failures without introducing an RDF service or a second state owner.                                                                                                                                                                                             |
| [W3C PROV-O, 2013-04-30](https://www.w3.org/TR/prov-o/)                                                                                                  | Provenance distinguishes entities, producing activities, and responsible agents. Derivation, time, and invalidation make evidence traceable.                                                                                                                              | Preserve manifest and content hashes. Bind product evidence to its source, capture time, affected requirement, and relevant output revision. A superseded or contradictory observation cannot silently satisfy acceptance.                                                                                                                           |
| [Microsoft GraphRAG query overview](https://microsoft.github.io/graphrag/query/overview/)                                                                | Local retrieval combines entity relationships with original source passages. Global retrieval addresses corpus-wide questions at higher cost. Basic retrieval remains a useful baseline.                                                                                  | Keep BM25 and bounded document retrieval. Traverse explicitly selected workflow bindings to recover required guidance with different terminology. Measure a concrete retrieval failure before adding embeddings or another storage system.                                                                                                           |
| [LangGraph Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api)                                                           | Persist individual task results. Isolate nondeterministic operations and side effects. Use idempotency keys or existing-result checks when a task may replay.                                                                                                             | Apply these properties to the existing session and reducer. Recovery must reconcile an external action that succeeded before its local receipt committed. No runtime replacement is needed to adopt the principle.                                                                                                                                   |
| [Anthropic, Building effective agents, 2024-12-19](https://www.anthropic.com/engineering/building-effective-agents)                                      | Predictable workflows, flexible workers, and evaluator–optimizer loops can be composed. Added complexity should improve measured outcomes.                                                                                                                                | Keep one catalog and runtime. Let repair cycles operate inside the original mandate. Tools and environmental results supply progress evidence.                                                                                                                                                                                                       |
| [Anthropic, Harness design for long-running application development, 2026-03-24](https://www.anthropic.com/engineering/harness-design-long-running-apps) | The reported harness separates generation from evaluation, calibrates reviewers with examples, inspects live interfaces, and applies independent criterion floors. Self-evaluation and generous QA are documented weaknesses. Later iterations are not invariably better. | Evaluate mobile and landing independently. Use reference-calibrated criteria for coherent design, originality, craft, and functionality. Inspect interactions and states. Return concrete findings to the producer, preserve the strongest output, and require fresh review after repair. An attractive average must not conceal a failed dimension. |
| [Anthropic, Demystifying evals for AI agents, 2026-01-09](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)                        | Code, model, and human graders serve different purposes. The environment outcome differs from the transcript. A single successful attempt does not establish repeatability.                                                                                               | Use code to validate evidence integrity, calibrated independent reviewers for visual judgment, and real complete-business runs for capability. Report repeated-run consistency separately from a successful example.                                                                                                                                 |

## Repository intersections

These observations describe the inspected baseline before the implementation units
in the [complete delivery plan](../plans/2026-09-04-1141-feat-complete-consumer-business-plan.md).
They are not a claim that every gap remains unchanged after that plan executes.

| Existing owner                                                                         | Baseline strength                                                                                                 | Gap that affects the requested outcome                                                                                                                                                           | Required proof                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog/ontology/world.yaml`                                                          | Typed business classes, relationship slots, and explicit competency questions.                                    | Requirements, screens, implementation, and proof lack a complete queryable acceptance chain. The evidence class describes a dated source, but its relationship data only names what it supports. | Ask which required outcomes lack current implementation or proof. Remove a relationship, change an output, or add contradictory evidence and observe an actionable failure. |
| `catalog/ontology/instance-validate.ts`                                                | Rejects abstract or unknown classes, invalid slots, bad cardinality, dangling references, and wrong target types. | Shape conformance alone cannot establish that a business requirement works.                                                                                                                      | A structurally valid document with an unfinished required experience must fail completion coverage.                                                                         |
| `catalog/ontology/validate.ts` and `checks/verification/fixtures/ontology.fixtures.ts` | Competency question identifiers and referenced classes are checked.                                               | Those checks do not execute the questions against workspace instances.                                                                                                                           | Query a representative authored product and assert the returned requirements, surfaces, and evidence.                                                                       |
| `catalog/agent-graph/work.yaml`                                                        | Phase order, roles, world reads/writes, and founder gates are an overlay of the existing catalog.                 | An ordered role map cannot prove execution or resolve a rejected output by itself.                                                                                                               | Compile actual workflow dependencies and prove review rejection, repair, resumed execution, and downstream invalidation in the runtime.                                     |
| `kernel/knowledge-service/service.ts`                                                  | BM25 ranking, bounded excerpts, workflow bindings, immutable snapshots, and full-document pagination.             | A small bundle budget can return zero content for later references. Entry-level truncation exists, but callers need an explicit account of every missing required document and its continuation. | A low budget exposes omitted and truncated references. Continuations reconstruct the exact full documents and preserve their hashes and source review metadata.             |
| `kernel/engine/compile.ts` and `kernel/session/run.ts`                                 | Mechanical gates, fresh-context policy, durable run state, and receipts already exist.                            | Selecting deterministic verification when a gate exists can hide required independent judgment.                                                                                                  | Mechanical success plus independent rejection stays unaccepted; independent acceptance cannot override a failed mechanical check.                                           |
| `kernel/session/executor.ts`                                                           | Worker briefs identify relevant knowledge and workspace artifacts.                                                | Directory-valued review inputs require a bounded canonical receipt. A path name alone does not prove which files the reviewer inspected.                                                         | Dispatch a real design audit with directory inputs; changes to an included file invalidate the prior receipt.                                                               |
| Existing design reference packs and grading                                            | The repository has an owner for visual references and evaluation.                                                 | Heuristic checks and a design document cannot establish the quality of current landing and native output.                                                                                        | Independent reviewers inspect the current rendered surfaces, interactions, accessibility states, and capture identities against the frozen rubric.                          |
| Full-launch orchestration and closeout                                                 | Catalog-defined producers, auditors, and review ledgers exist.                                                    | Required work cannot count as complete merely because its lane is deferred or blocked.                                                                                                           | Remove mobile, funnel, payment recovery, analytics, or support evidence and verify that full-business closeout identifies the unfinished requirement.                       |

## Retrieval contract implemented by this work

The portable knowledge service continues to use BM25. An optional `workflowId`
on knowledge search follows that workflow's authored reference bindings. Direct
lexical matches appear first. Other bound guidance follows with
`match.kind: workflow_binding`; these entries are related guidance, not claimed
lexical matches. Unscoped searches retain their existing ranking and do not expand
through shared hub references. If a domain filter excludes bound guidance, the
response names those excluded reference IDs.

A requested workflow bundle now returns `coverage`. Every directly bound
reference remains required. `coverage.complete` means this response contains all
of those documents in full. A complete summary is still incomplete coverage when
the original document is longer. Each incomplete entry identifies whether content
is omitted or truncated, its continuation offset, and the complete-document hash.
Each bundle reference also carries source and manifest provenance, including the
recorded source review dates.

Coverage reports delivery, not proof that a model read or understood the content.
The caller must retrieve remaining pages, compare hashes, and retain the complete
required guidance. A worker's actual context receipt remains the execution
boundary. The pure knowledge service does not silently change execution state or
declare a source current from a stored review date.

## Parked product coverage proposal

`product.yaml` remains the only authored product scope. The additive fields below
are optional during research and design. Strict complete-business closeout requires
an accepted product, accepted requirements listed on `slot.app.requirements`, and
complete experience and evidence relationships. The accepted scope is the product contract, and its rendered heading is
`Accepted scope`.

The executable question is: which accepted requirements have the required
journeys, flows, screens, implementation files, and current supporting evidence?
`queryProductDeliveryCoverage` answers from the instance relationships.
`validateProductDeliveryCoverage(workspaceRoot)` checks the graph and files and
returns actionable issues. It does not change product or reducer state.

The following excerpt assumes the app, promise, core loop, and feature instances
already exist. Hash values must be the actual SHA-256 of each complete file. The
example values in angle brackets are explanatory placeholders, not valid proof.

```yaml
meta:
  # Preserve the other required product metadata.
  status: accepted
instances:
  - id: requirement.first-value
    class_id: class.requirement
    slots:
      slot.requirement.status: accepted
      slot.requirement.journeys: journey.first-value
      slot.requirement.screens: screen.result
      slot.requirement.evidence: evidence.result-runtime
  - id: journey.first-value
    class_id: class.journey
    slots:
      slot.journey.core-loop: core-loop.primary
  - id: flow.first-value
    class_id: class.flow
    slots:
      slot.flow.journey: journey.first-value
  - id: screen.result
    class_id: class.screen
    slots:
      slot.screen.journey: journey.first-value
      slot.screen.flow: flow.first-value
      slot.screen.surface: mobile
    implementation:
      - path: mobile/ResultView.swift
        sha256: <actual 64-character file hash>
      - path: backend/result.ts
        sha256: <actual 64-character file hash>
  - id: evidence.result-runtime
    class_id: class.evidence
    slots:
      slot.evidence.about: screen.result
    observation:
      source:
        path: proof/result-device-run.json
        sha256: <actual 64-character evidence file hash>
      observed_at: 2026-09-04T12:00:00Z
      kind: runtime
      status: supported
      subjects:
        - path: mobile/ResultView.swift
          sha256: <the exact file hash exercised by this observation>
        - path: backend/result.ts
          sha256: <the exact file hash exercised by this observation>
```

Add `requirement.first-value` to the app's `slot.app.requirements`. Add a separate
landing requirement and its screens, implementation, and evidence when acquisition
belongs to the accepted scope. All screens and flows in a required journey must
be covered by accepted requirements. Removing a screen from a requirement's list
does not make that screen disappear from the required experience.

An observation records `research`, `runtime`, `provider`, `visual`, or `test` as
its kind. Only current supported runtime, provider, or test observations can cover
implementation in strict delivery validation. Visual and research observations
remain valuable evidence but cannot substitute for executable behavior. An
optional `expires_at` records an explicit validity limit. Future observations,
expired observations, changed source files, and changed subject files cannot pass.

Every implementation file on every required screen needs matching observed
subject hashes. Evidence about a different screen cannot satisfy that screen just
because both use shared code. A related `contradicted` observation blocks acceptance
even if its ID was omitted from `slot.requirement.evidence`. Resolve the factual
contradiction and record the accepted product change; do not hide it with an
unrelated passing observation.

Artifact paths must be canonical, relative to the selected workspace, and free of
symlinks. Files must be non-empty regular files of at most 32 MiB. Store larger
recordings separately and link a bounded evidence record to the reviewed recording
through the existing runtime proof contract. Do not place secrets or private
provider exports in product Git history.

These checks establish relationships and current bytes. Setting `kind: provider`
does not prove that a deployment exists, and a hashed JSON report does not prove
that a reviewer exercised an app. Complete closeout must additionally validate the
independent runtime, visual, and provider receipts for the actual claim.

## Design and business verification implications

The requested visual references are Airbnb, Duolingo, grug, Blippo+, Metaballs,
Is This Seat Taken?, Hearing Buddy, and Structured. Their relevance must be assessed
individually: hierarchy, interaction, motion, illustration, sound, platform
behavior, and the relationship between brand and product. A universal visual
template would erase the qualities the founder is asking the builder to learn.
Primary-source descriptions and actual visual inspection are separate evidence.

Before implementation, freeze the complete accepted scope and how it will be
judged. Each required user outcome must identify its relevant surface, states,
implementation, and evidence. After implementation, a reviewer inspects the running
product and records findings against exact output and rubric revisions. Repairs
invalidate affected acceptance and trigger a fresh review. Missing authority or
exhausted attempts preserve an incomplete mandate rather than shrinking its scope.

The final proof includes acquisition through the landing page, native first value
and repeat use, applicable purchase and recovery behavior, analytics, lifecycle,
support, privacy, security, store readiness, and operations. Provider claims require
provider-native readback. Actual revenue requires observed transactions. A complete
local build, a store-ready artifact, a submitted app, and a released app remain
different claims even when they belong to one delivery mandate.
