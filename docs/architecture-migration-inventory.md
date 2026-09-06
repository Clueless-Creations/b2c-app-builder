# Architecture implementation inventory

This inventory maps responsibilities to source and proof. The architecture owns
the target. ADR-0003 authorizes removing obsolete formats because there are no
installed users. Passing one check does not establish a complete business.

| Responsibility                        | Current owner                                                                                                | Local proof                                                                                                                                 | External or remaining integration                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Public declarations and schemas       | `contracts/public-api/contract.ts`                                                                           | CLI/MCP parity and registered status                                                                                                        | Local lifecycle contracts and saved v1 inputs                                                                  |
| First-party business declarations     | `catalog/firstparty-declarations.ts`, `catalog/firstparty-recipes.ts` author the verified package projection | Same package loader, exact public provider mapping, explicit 99-workflow recipe, immutable knowledge and prompt checks                      | Host agent work does not establish native or business outcome proof                                            |
| Public application service            | `kernel/services/business.ts`                                                                                | Discovery, lifecycle, installed composition, evidence, incomplete transaction reporting                                                     | See the public reference for supported workspace operations                                                    |
| Extension declarations and resources  | `contracts/extensions/contract.ts`, `kernel/composition/resources.ts`                                        | Exact versions, import closure, content snapshots, unsafe path refusal                                                                      | A package declaration never installs executable code                                                           |
| Selected recipe compilation           | `kernel/composition/resolve.ts`, `kernel/composition/compile-bindings.ts`, `catalog/packs/`                  | Required and optional binding resolution, target checks, pinned resource semantics, neutral context retention, selective proof invalidation | Current provider observations remain separate                                                                  |
| Composition activation                | `kernel/composition/activation.ts`                                                                           | Revision checks, locks, fsynced journal, settled history archives, interruption refusal, resume and restore                                 | Settled history reconciles; active or uncertain work refuses replacement                                       |
| Operation execution                   | `kernel/session/operation-routes.ts`, existing executor and verifier                                         | Explicit host route, custom input/output/evidence schemas, durable dispatch intent, independent observation, persisted engine replay        | Trusted host worker delegates and fake support transport prove local contracts; no live business service claim |
| Recipe policy                         | Selected binding compiler and session runtime                                                                | Bounded repair, mandatory independent review, optional recurrence                                                                           | Policy cannot grant protected authority                                                                        |
| Provider-specific monetization checks | `adapters/providers/revenuecat/`, generic revenue entrypoint                                                 | Default provider regression and alternate explicit contract checks                                                                          | Alternate iOS SDK compilation passes; device and sandbox purchase proof remain                                 |
| Workspace state                       | `kernel/reducer/`, `kernel/schema/business-state.schema.json`                                                | Current-format validation and authorized reducer transitions                                                                                | Legal erasure uses its own signed, scoped transition                                                           |
| Executable catalog validation         | `kernel/session/catalog-contract.ts`                                                                         | Missing/malformed/current pin and incomplete activation no-write refusals                                                                   | No alternate-format input path                                                                                 |
| Source access                         | `contracts/source-access.ts`, compiler and input inventory                                                   | Declared read/write scopes, claims, fingerprints and executor auditing                                                                      | Agent instructions alone cannot enforce OS sandboxing                                                          |
| Shared resource claims                | `kernel/reducer/shared-claims.ts`, `kernel/session/run.ts`                                                   | Multiprocess exclusion, independent business progress, contention without attempts, expiry fencing, verifier claims                         | Uncertain effects require readback before ownership can be released                                            |
| Parallel execution                    | `kernel/engine/dispatch.ts`, `kernel/session/run.ts`                                                         | Independent workers overlap; concurrency limit and shared provider serialize                                                                | All started workers settle before session ownership is released                                                |
| Measurement                           | `kernel/operating-model/measurement.ts`                                                                      | Identity, maturity, currency, cost, attribution and comparison refusal cases                                                                | Current provider observation joins                                                                             |
| Market experiments                    | `kernel/operating-model/market-experiment.ts`, `kernel/session/market-experiment.ts`                         | Registered accepted observations, cohort comparison, partial results and synthetic partition                                                | Ten-business observed operating milestone                                                                      |
| App review state                      | `kernel/schema/app-review-v1.4.0.schema.json`                                                                | Current app-review fixtures                                                                                                                 | Current provider/store proof                                                                                   |
| Reusable business benchmark           | `checks/verification/scenarios/complete-business.md`, `business-variation.md`                                | Frozen criteria, explicit workspace selection, unknown monetization remains ungraded                                                        | Whole-business and distinct sibling runtime evidence                                                           |
| Consumer-business examples            | `examples/tuck/`                                                                                             | Real app/web capture gallery and verification record                                                                                        | Complete business and distinct sibling proof                                                                   |

## Dependency direction

Runtime code does not import validator implementations. Shared evidence parsing
lives in `kernel/lib/`; research grammar lives in `kernel/schema/`; paid-generation
applicability lives in `catalog/repository-profiles/`. Validators consume those
owners. The architecture check has no recorded exceptions.

## Proof still required

Package conformance is local behavior. A complete business additionally needs
working app and web flows, acquisition and retention measurement, monetization
when in scope, support, independent design and implementation review, and current
external readback. A screenshot demonstrates its captured surface only.
Cross-business measurement must pass comparability checks before a report
compares outcomes.

Record results against current source and provider state. Provider substitutions,
a distinct sibling, authorized erasure and release are separate claims. Do not
treat roadmap text, a declared provider, or an old CI run as evidence of them.

Public request recovery uses the existing session owner. It closes a reconciled
interruption under current revision and locks, preserves the original request
identity, and dispatches no work. Pending requests block changed composition.
Uncertain effects still require independent readback before recovery.
