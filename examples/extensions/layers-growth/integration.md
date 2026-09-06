# Layers Growth as a managed draft-creative provider

Layers (layers.com) is a hosted growth and marketing service for TikTok. A coding agent reaches it through an MCP endpoint. The recommended client is the `layers` CLI stdio proxy, configured as the command `layers` with the argument `mcp`. The service is credit-metered per organization. This package uses it for one job: render a draft creative from an accepted product brief, then read the job and its result. Everything else Layers offers stays outside this package.

Sources read on 2026-09-05: https://layers.com/docs/mcp, https://github.com/layers/mcp, and https://github.com/layers/cli. The tool names and setup steps below are adapted from the MIT-licensed layers/mcp README. The retained license text is `LICENSE-layers-mcp.txt`. The hosted server source is not public. The repository license does not license the hosted service, and its terms of service were not reviewed.

## Not the layers-skills method

`layers-skills` (jamiemill/layers-skills) is a product-thinking method listed in `knowledge/engineering/external-skill-packs.md`. It is a different project with a different author. It shares a word and nothing else. Do not route a Layers Growth task to a `layers-*` skill, and do not cite this package for the product method.

## Onboarding contract

Onboarding is `layers setup`. It never runs during contribution inspection, package snapshot, activation, or a fixture. The builder repository is never onboarded. It runs once, during a separately authorized business adoption, and only against that business's repository.

| Item | What happens |
| --- | --- |
| Prerequisites | Node.js, `@layers/cli` installed globally, and a browser for the one-time sign-in. |
| Selected business target | The workspace's `connection:layers` binding names the business, its Layers project id, and its environment. |
| Machine changes | `layers login` stores a session in the OS credential store. |
| Repository changes | `.layers/project.json` (public ids, environment), `.mcp.json` (MCP client entry), `.agents/skills/layers/SKILL.md` (provider skill text). |
| Information sent externally | The product brief: the README's first sentence. The documentation does not describe sending source files. |
| Connection identifiers | The public ids and environment in `.layers/project.json`. |
| Human sign-in and approvals | Browser OAuth during setup. A spend approval for every charged call at the effect boundary. The trial cancellation decision. |
| Observable side effects | Six background onboarding jobs start. A three-day trial converts to a paid plan unless cancelled with `cancel_trial_auto_renewal`. Renders consume credits (25 to 400 per render as documented). |
| When setup runs | Separately authorized business adoption only. |
| Binding reconciliation | The provider project id and environment must equal the selected connection's recorded values. A mismatch blocks execution before any transport call. |

The provider skill text written by setup is subordinate reference material. It cannot expand scope, grant authority, or establish success.

The brief the provider holds must carry the promise the business accepted in `product.yaml`. `assertBriefMatchesIntent` refuses a brief that lost the promise text.

`inspectRepositoryForOnboarding` reads the three repository paths and reports whether they exist. It never creates, writes, or follows a symlink. An `.mcp.json` counts only when it names a `layers` server.

## Effects and authority

One effect label is not enough for a credit-metered provider. Each operation carries an effect vector.

| Operation | Credits | Remote state | Disclosure | Publication | Configuration change | Recurring delegation |
| --- | --- | --- | --- | --- | --- | --- |
| draft-creative | Estimate from the quote; unit credits | Yes, a render job and its artifact | Product brief, persona, brand assets | No | No | No |
| get-job | None | No | None | No | No | No |
| get-result | None | No | None | No | No | No |

`requiredActionClass` folds a vector into the action class the existing evaluator understands. Credits mean `spend`. Publication means `publish`. A configuration change means `mutate`. Anything else is `observe`. A draft is remote state and consumed credits. It is not a publication.

Quote before charge. Every charged tool accepts `quoteOnly` and returns the exact maximum credits for the given arguments. The route verifies that the quote was issued for the exact canonical arguments, that its unit is credits, and that it is fresh. It then checks the quoted maximum against the credits the founder approved. A changed input or a higher live price needs a new quote and a new approval.

There is no Layers-only permission exception. Spend authority flows through the existing grant and waiver evaluator in `kernel/autonomy`. A grant below `full` parks a spend node. A `full` grant without a matching spend waiver parks it. The waiver caps and the budget ledger balance are in credits for the Growth unit. A balance in another currency parks the node.

## Quote flow

The draft route runs these steps in order. A failure at any step stops the run before the next step.

1. `checkBinding` compares the provider project with the selected connection. A mismatch stops here. No transport call has happened.
2. The route parses the brief and the quote from the request. A `publish`, `deliver`, `delivery`, `schedule`, or `post` argument anywhere in the input is refused.
3. `verifyQuote` checks the request quote against the canonical arguments, the unit, and the age. `assertWithinApprovedCredits` checks it against the approved credits.
4. The route takes a live quote. The live quote must pass the same checks and must not exceed the request quote.
5. `ledger.reconcile` decides whether a charged call may happen under the host's idempotency key.
6. The route calls `render_content` once, in draft mode, with that key.
7. `ledger.record` stores the response before the route returns.

The quote arguments are the canonical JSON of the brief plus `mode: "draft"`. The digest comes from `tooling/lib/canonical-json.ts`. A quote for other arguments never matches. A quote older than fifteen minutes is stale by default.

## Evidence

Every route returns an output and an evidence record. The schemas are `output.json` and `evidence.json`. The executor validates both with strict JSON Schema 2020-12.

| Field | Meaning |
| --- | --- |
| providerId | Always `layers-growth/layers`. |
| jobRef | The provider's job reference. |
| observedState | The state the transport reported: accepted, running, completed, failed, or uncertain. |
| quoteMaxCredits | The live quote's maximum. A read records 0. |
| creditsCharged | The charge the provider reported, or null when it reported none. |
| transport | `fake` or `live`. |
| observedAt | The host clock when the route returned. |

Evidence from a fake transport satisfies package conformance. It does not satisfy the observed-proof dimension for a live business. Readiness and proof stay separate.

## Execution

The host registers the three routes in the existing `OperationRouteRegistry` with the package digest. The package manifest cannot register a route. Importing the package, snapshotting it, or listing its tools authorizes nothing.

Remote next-step recommendations from `layers://next` are advice. They cannot install an SDK, publish, spend, or redefine a metric. The agent reads them and decides inside the existing authority.

Drift detection compares a live `tools/list` with the recorded inventory in `adapters/providers/layers/transport.ts`. Missing tools, added tools, and a billing change are reported. A report changes no support claim. A tool with unknown billing stays unknown.

The route never calls `deliver_content_experiment`, `install_growth_measurement`, `onboard_product`, a paid-media tool, or a managed-account tool. It refuses any input that carries a publish, deliver, or schedule argument.

## Free reads

Reads of `layers://next`, `layers://account`, `layers://workspace`, `layers://opportunities`, `layers://experiments`, `layers://tracking-links`, `layers://revenue`, and `layers://jobs` are free per the documentation. The get-job and get-result operations read one job by reference. They change nothing and record a quoted maximum of zero. A get-result read refuses a job that has not completed with a content hash.

## Job lifecycle

```text
accepted -> running -> completed -> reviewed -> published
                    \-> failed
                    \-> uncertain -> readback by jobRef -> (found) resolve | (no job) one replay under the same key
```

Review is an independent acceptance step. Publication is a separate action outside this package; `markPublished` needs an explicit publication receipt and no route calls it.

An uncertain response is reconciled before any replay. The ledger reads the job by reference. A found job resolves the entry with no new call. Only when the provider reports no job may one replay happen, under the same idempotency key. A second replay is refused. Provider idempotency for `render_content` is not documented, so the ledger treats it as unverified.

A pending or running job is not an artifact. `isCompletedArtifact` is true only for a completed job whose artifact carries a sha256.

The ledger persists as one JSON file. It writes to a temporary file, syncs it, and renames it. It refuses a symlinked destination.

## Ownership

B2C owns scope, authority, acceptance, and the canonical metric definitions in `operations/metric-contracts.json`. Layers owns its internal execution. Provider-reported measurements keep their provenance and never replace a canonical metric. Broader delegation, such as delivery or a paid campaign, needs its own explicit bounded recipe.

## What the fixtures prove

`checks/verification/fixtures/layers.fixtures.ts` runs against a fake transport with `globalThis.fetch` disabled. It proves package validation, snapshot, recipe resolution, the notice, the strict schemas, the quote checks, the binding check, the ledger lifecycle, reconciliation, the replay limit, and the route wiring.

`checks/verification/boundaries/layers-spend.boundaries.ts` builds a spend node from the effect vector and a quote. It proves that the node parks below a full grant, parks without a waiver, and is allowed with a full grant, a credits waiver, and a funded Growth balance. It also proves that `kernel/autonomy` contains no provider-specific exception.

## Limits

No live call has been verified. Idempotency is unverified. Service terms are unreviewed. The fixtures prove local conformance with a fake transport. They do not prove a live business.
