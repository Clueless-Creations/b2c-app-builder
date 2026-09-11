# Authority envelopes

A standing envelope held only in session state cannot prove founder intent. A chat transcript
proves it no better than a GitHub issue does. This document specifies five standing-authority
grants a founder can extend to an agent. It states how each grant maps onto the durable machinery
this repository already ships. It closes three gaps that machinery leaves open. Signed design-taste
decisions use the separate protected trust path described below; they are not standing envelopes.

## Scope

The standing-envelope portion of this document does not introduce a new schema, store, or
enforcement module. It specifies how five founder-facing grants, Apple/Google enrollment, spend cap, legal name, Go/Kill,
and public voice, map onto the grants, waivers, and standing-envelope machinery that
`kernel/schema/`, `kernel/autonomy/`, and `examples/workspace/business/operations/` already implement, and it
requires two small corrections to that machinery where the current code allows something this
document forbids. Every claim below cites the file and line that enforces it. A claim with no
citation is prose intent, not an enforced guarantee, and is labeled as such.

Design taste follows a narrower signed-decision contract. `kernel/engine/founder-trust-store.ts`
loads one canonical Ed25519 public key from an external founder-controlled path. A new run binds
that exact store path and hash, key ID, canonical workspace, run ID, time, and the hash of its
append-only audit entry before any worker dispatch. An existing unbound run cannot gain design
authority from a key installed later. Trust installation and maintenance require the store's
founder-controlled owner. The autonomous session and receipt consumer require the workspace-control
owner, a different OS identity that can read the public store and empirically cannot create a file
in its directory. A receipt consumer can append a valid signed decision but cannot mint one.
The public key and its canonical binding are readable by design. Worker environments receive no
launcher path override and no private signing material. The store contains no private key. This
receipt path authorizes only the local design-taste decision named by the signed payload;
it does not widen any deployment, release, spend, pricing, legal, credential, or public-action
grant below.

## The machinery this document builds on

Four schemas hold durable authority state for one business workspace:

| Schema           | File                                                                  | Holds                                                                     |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Control          | `kernel/schema/control.schema.json`                                   | The kill switch, the domain grants map, and the waiver list               |
| Grants           | `kernel/schema/grants.schema.json`                                    | Per-domain autonomy level and prerequisites                               |
| Waivers          | `kernel/schema/waivers.schema.json`                                   | Founder opt-in for the six protected-move categories                      |
| Agent operations | `examples/workspace/business/operations/agent-operations.schema.json` | Capabilities, standing/one-shot approval envelopes, and the action ledger |

Three modules turn that state into a decision on every planned unit of work:

- `kernel/autonomy/evaluator.ts`'s `createAutonomyEvaluator()` is the single entry point (evaluator.ts:69-132). It runs, in order: a system-domain boundary check (evaluator.ts:79-97), the grant-ceiling check (`kernel/autonomy/grants.ts`), the prerequisite check (`kernel/autonomy/prerequisites.ts`), and the protected-category/waiver check (`kernel/autonomy/waivers.ts`'s `evaluateProtectedAction()`, waivers.ts:43-129). Kill-switch dispatch is a separate, batch-boundary concern (`kernel/autonomy/killswitch.ts`'s `createDispatchHooks()`), not part of this per-node sequence.
- `kernel/autonomy/standing-approvals.ts`'s `applyStandingApprovals()` (standing-approvals.ts:298-333) is the mechanism that lets a founder-approved standing envelope satisfy a `waiting_founder` node without asking twice. It re-validates every persisted envelope on every run, exact target, exact operation, exact resource pattern, exact payload digest, matching available capability, and (for `spend`) exact currency and amount under the ceiling, and only then marks the node's approval `"approved"`, recording provenance (`envelopeId`, `actionId`) so the source of that approval is never invisible.
- `kernel/session/approve.ts` is the only sanctioned path from `waiting_founder` back to schedulable work by a fresh, per-item founder decision (approve.ts:1-15). It writes one approval id at a time and is attested in the reducer's hash-chained audit log.

One structural point governs every grant below: **a protected category and a standing envelope are
two different layers, and neither substitutes for the other.** A waiver (`kernel/schema/waivers.schema.json`)
says a domain/actionClass/category combination may proceed at all, with a cap and an expiry. A
standing envelope (`agent-operations.schema.json`'s `approval` def) says a specific, already-scoped
action may proceed _without asking again_. `frontier-agent-operations.md:84` states this directly:
"The corresponding protected control waiver belongs in `control/control.json`; an envelope does not
bypass that layer." Nothing in the five grants below changes this. A standing envelope for public
voice, if one existed, would still need an underlying `public_actions` waiver, and would still be
refused per the Public voice grant regardless.

`kernel/schema/types.ts:251-253` names the six protected categories a waiver can cover:
`spend`, `credentials_access`, `legal_pricing`, `public_actions`, `release`, `destructive`. Every
grant below states which of these six it rests on. (`business-access.schema.json`'s
`activeFounderGate.gateClass` enum uses a close but distinct vocabulary, `public_action` singular,
plus `access`, `legal`, `pricing`, `research`, `scope`, `provider_route`, `other`, for the
founder-facing pending-question layer, not the durable waiver. The two enums describe adjacent
concerns; do not treat one as a synonym for the other when reading either schema.)

## The five grants

### 1. Apple and Google developer-account enrollment and control

**Never delegable, at all:** enrolling in the Apple Developer Program and paying Apple.
`knowledge/store/apple-signing-release.md:130`: "They must enroll and pay Apple before
TestFlight/App Store distribution; an agent cannot complete that for them." Google Play's
parallel is enrolling a new developer account and its identity verification. The workspace can
prepare everything up to that point, never past it.

**Grantable, once enrolled:** Team ID role changes, certificate/profile creation, app-record
creation, and metadata/media/build uploads, scoped to an exact account, team, project, and
environment. This is `protectedCategory: "credentials_access"` at the waiver layer, plus a
standing envelope in `agent-operations.json` naming the exact provider, account, and catalog
workflow ids. `catalog/workflows/build-release.ts`'s
`workflow.store.google-play-metadata-standing-envelope`,
`workflow.store.google-play-media-standing-envelope`,
`workflow.store.apple-store-media-standing-envelope`,
`workflow.store.apple-store-metadata-standing-envelope`,
`workflow.store.apple-testflight-standing-envelope`, and
`workflow.store.google-play-testing-track-standing-envelope` are the working standing-envelope
pattern. Apple media is scoped like Play media: locale, device-well, screenshot, and
app-preview assets only. Apple metadata is scoped like Play metadata: approved listing
text, localized metadata, and promotional content only. Apple TestFlight is scoped like
Play testing-track: named group, build digest, and tester cohort only. Products, review
submit, and public release stay on other nodes.

**Founder gates that no envelope can widen** (`knowledge/store/apple-signing-release.md:487-497`):
Apple Developer Program enrollment/payment; creating or changing a team, app record, bundle ID,
SKU, developer name, or seller-name path; certificate/profile creation, rotation, export, or
revocation; capabilities affecting entitlements, privacy, payments, push, or associated domains;
storing API keys, `.p8`, `.p12`, provisioning profiles, or passwords; changing a bundle ID after
services depend on it; and, covered again, more specifically, under Go/Kill below, uploading a
build, submitting for review, releasing, or changing pricing/availability. Google Play's
equivalents (`knowledge/store/google-play-release.md:50,78-84`): organization-account D-U-N-S and
legal-entity verification, and Play App Signing enrollment with a custom key, key export, or key
reset.

**Scoping rule:** exact provider, account, team, project, environment, never a wildcard. **Expiry
rule:** the envelope's `expiresAt` (`agent-operations.schema.json`'s `approval.expiresAt`, a
required ISO date-time). **Revocation rule:** set `status: "revoked"`;
`standing-approvals.ts:143` refuses any envelope whose `status !== "active"` before it even checks
target or resource, and `applyStandingApprovals()` resets any run-state approval that had been
sourced from a now-revoked envelope back to `"pending"` (standing-approvals.ts:302-305, proven at
`checks/verification/fixtures/engine.fixtures.ts`'s "a revoked envelope must not remain reusable" case).

### 2. Spend cap

Two layers, not one. A `budget_funded` prerequisite (`kernel/schema/grants.schema.json`'s `probe` def,
kind `"budget_funded"`) answers "does this domain have money allocated at all".
`kernel/autonomy/prerequisites.ts`'s `SessionPrerequisiteCache` verifies it once per session and
fails closed on any non-`"verified"` status (`evaluator.ts:105-107`). A waiver's
`caps.maxPerAction`/`caps.maxPerPeriod` (`kernel/schema/waivers.schema.json`'s `caps` def) then bounds
each individual protected `spend` action within that funded domain. `waivers.ts:88-93` and
`waivers.ts:107-112` fail closed, twice, deliberately, on a non-finite estimate or cap, rather
than let a NaN comparison silently pass a hard stop. The two founder-facing knobs collected at
onboarding are `OnboardingBudgetInput` (funds a domain/period; `kernel/session/onboard.ts:70-75`) and
`OnboardingWaiverInput` (caps one protected action family). Collecting one without the other is a
real, common half-answer: a funded domain with no waiver authorizes nothing, and a waiver with no
funded domain cannot pass the budget check either
(`waivers.ts:124-127` calls `evaluateBudget()` after the cap checks pass).

**Scoping rule:** one domain, one `budgetPeriod` (`daily | weekly | monthly | per_run`).
**Expiry rule:** the waiver's `expiry`, a firm ISO date with no ceiling enforced beyond that date;
nothing renews it automatically. **Revocation rule:** set the waiver's `status: "revoked"`;
`waivers.ts:63-66` treats a revoked or otherwise-inactive waiver identically to no waiver at all.

### 3. Legal name

A founder's legal name, recorded as an individual Apple account's "seller name", must live in
access-controlled storage. It must stay out of logs. It must never serve any purpose beyond its
granted use. `knowledge/store/apple-signing-release.md`'s Required Artifacts section already
applies this rule. It records a Doppler secret name there, never the literal value.
`store/APPLE_SIGNING.md` is a normal tracked workspace file. `surfaces/workspace-template/` ships no
`.gitignore` that would exclude a literal name from Git history. The existing secret-detection
machinery would not catch a bare name typed elsewhere. `hosted/builder-console/analytics/events.ts:131-133`'s
`detectSecret()` and `check-agent-operations.ts:507-520`'s `scanForSecrets()` both match credential
shapes only: API keys, JWTs, bearer headers, private-key blocks. A plain name like "Jane Q.
Founder" matches none of them. A legal name is not a credential shape. It needs its own rule, not a
stretch of an existing one.

This convention matches the pattern this repository uses for every other secret:
`knowledge/operations/founder-zero-operator.md`'s Doppler section says "Keep only names,
project/config locations, owners, and proof paths in the repo" and "The agent records secret names
only" (founder-zero-operator.md:93,104). Record a **Doppler secret name** (for example,
`FOUNDER_LEGAL_NAME`) as a pointer in any tracked artifact. `store/APPLE_SIGNING.md` is included;
never record the literal value.

**Scoping rule:** the pointer is readable anywhere the workspace is readable; the literal value is
readable only wherever Doppler already permits secret access. No new storage location is created.
**Expiry rule:** none. A legal name does not expire, but a founder can rotate the underlying
Doppler value (a legal name change) without touching any tracked artifact, since the artifact only
ever held the pointer. **Revocation rule:** removing the Doppler secret removes the value
everywhere at once; no artifact needs a corresponding edit.

**Open engineering item, out of scope for this document:** a dedicated redaction rule that catches
a legal name if one is ever typed into an event property, ledger action, or audit-log message.
`detectSecret()`/`scanForSecrets()` do not, and should not be stretched to, since a name has no
distinguishing shape the way a key or token does. Flagging this gap is this document's job; closing
it with a redaction heuristic (name-list matching, a founder-supplied denylist string, or similar)
is a separate, later change.

### 4. Go / Kill

**Go** is a `release`-actionClass action: production deploy, store submission, or go-live.
`catalog/workflows/build-release.ts:77` states the rule in prose: "Enrollment, certificate
creation/rotation, agreements, pricing, final review submission, and production release remain
founder decisions unless the opening envelope names that exact action." This rule is load-bearing,
not optional. A Go grant must always be version-pinned, even one pre-named at onboarding
(`knowledge/operations/autonomy-onboarding.md:257`'s "one exact production release" choice). It
needs an exact app id and an exact version, never a wildcard `resourcePattern`.
`check-agent-operations.ts`'s `validateNeverAuthorizeEnvelopes()` enforces this rule. It rejects
any approval envelope whose `actionClasses` include `"release"` or `"destructive"` unless every
`resourcePattern` is exact (contains no `*`). A fixture in
`checks/validation/repository/fixtures/agent-operations.fixtures.ts` proves this.

**Kill** is `control.json`'s `killSwitch` (`kernel/schema/control.schema.json:14-24`). In practice,
`engagedBy` is only ever set to `"founder"`. A repo-wide search of `kernel/` and `checks/verification/`
finds no code path that produces `"system"`, even though the schema allows it
(`kernel/schema/types.ts:407`). That is an intentional, currently-unimplemented reservation for a
future automated safety trip, not a bug; a later session wiring one up should update this
paragraph rather than silently changing what "Kill" means here. `kernel/autonomy/killswitch.ts`'s
`createDispatchHooks()` halts every dispatch batch the instant `killSwitch.engaged` is true,
checked fresh on every call, no caching, so a founder's kill lands on the very next boundary.

**Kill reversal** is not an autonomy-evaluator concern at all. It is a reducer write-path gate.
`kernel/reducer/cli.ts:138-152`'s `AUTONOMY_DOCS` check rejects any patch to `control`, `grants`, or
`waivers` that lacks `--founder-authority true`. State plainly what this is and is not: it is a
bug-defense and honesty layer that keeps the session's own autonomous work from ever targeting
these documents (the session runner never passes this flag), backed by OS write-protection on the
workspace's `control/` directory from the session's own uid. It is **not** a cryptographic
guarantee against a jailbroken, Bash-capable agent that could pass the flag itself. That
distinction is already stated in the source comment (`kernel/reducer/cli.ts:141-144`) and this
document repeats it so nobody reads "founder-authority-gated" as "cryptographically enforced."

### 5. Public voice

**Never a `mode: "standing"` match, full stop, regardless of `voicePolicy`.** Every action that
speaks in the founder's public voice, a social post, a launch announcement, scheduled public
content, routes through a fresh, per-item founder decision (`kernel/session/approve.ts`), never
through envelope auto-consumption. Among the five grants, only this one had running code that
contradicted the mandate. The gap was not merely undocumented:

`kernel/autonomy/standing-approvals.ts`'s `actionCoversNode()` let a `publish`-class node be
auto-approved by a `mode: "standing"` envelope whenever the action's `voicePolicy` string equaled
the envelope's. There is no per-item founder confirmation and no distinction between a founder-voice
social post and routine copy deployment.
`checks/validation/business/operations/check-agent-operations.ts`'s `approvalMatches()` validated the same
rule the same way. Both were real, tested, load-bearing behavior, not stale comments, and both
directly contradicted this document's mandate.

**The fix:** the catalog's own `publish` actionClass is heterogeneous by
design and stays that way. `workflow.growth.landing-funnel-publication-and-live-proof`
(`catalog/workflows/growth-revenue.ts:196-213`, a landing-page deployment) and
`workflow.growth.launch-narrative-and-cadence` (growth-revenue.ts:70-93, a public launch post) both
declare `actionClass: "publish"` and `protectedCategory: "public_actions"`, the catalog-level tags
alone cannot tell them apart. The distinguishing tag lives one layer down, on the actual ledger
action an agent self-attests at execution time: `agent-operations.schema.json`'s
`action.purpose` enum already includes `"social_engagement"` for exactly this case (a social/public
post), separate from `"provider_mutation"` for a routine provider-facing change like a landing
deploy or a store-metadata apply. No schema change was needed. `social_engagement` already
existed and already appears in this exact role in
`checks/validation/repository/fixtures/agent-operations.fixtures.ts`'s pre-existing "publish approval
voice policy is enforced" fixture.

`standing-approvals.ts`'s `actionCoversNode()` refuses the match outright, before it even
reaches the `voicePolicy` comparison, whenever `node.actionClass === "publish"` and
`action.purpose === "social_engagement"` (standing-approvals.ts:119-126).
`check-agent-operations.ts`'s `approvalMatches()` mirrors the same refusal, scoped to
`approval.mode === "standing"` so a legitimate one-shot (fresh, per-item) founder approval of a
public post is unaffected (check-agent-operations.ts:460-469). A landing-page deployment or a
store-metadata apply, tagged `"provider_mutation"`, not `"social_engagement"`, is unaffected by
either change and keeps using standing envelopes exactly as
`knowledge/operations/frontier-agent-operations.md:79` already documents ("Use a matching standing
envelope without a new prompt" for `publish`-class routine copy). A new boundary suite,
`checks/verification/boundaries/standing-approvals-voice.boundaries.ts`, proves both halves against the
real runtime evaluator: a `social_engagement`-tagged publish stays gated even with an exact
`voicePolicy` match and a `mode: "standing"` envelope, and an otherwise-identical publish tagged
`"provider_mutation"` still consumes its standing envelope, so the fix cannot be mistaken for a
blanket regression on every `publish` action.

**A known residual gap, stated plainly rather than hidden:** this enforcement depends on the
executing agent honestly tagging a founder-voice publish with `purpose: "social_engagement"` when
it records the ledger action, the same self-attestation model every other action-ledger field
already relies on (`check-agent-operations.ts`'s validator checks the ledger for internal
consistency; it does not independently observe what a browser or API call actually did).
`checks/verification/fixtures/engine.fixtures.ts`'s pre-existing "standing approvals: public work requires
the exact approved voice policy" fixture models a `workflow.growth-post` action
(`founderOnlyActions: ["Approve this public post"]`) but never sets `purpose` on it, so that
fixture's scenario, which reads, by its own workflow name, as exactly a founder-voice case,
continues to pass through the pre-existing `voicePolicy`-only path unaffected by this PR's gate.
That fixture is not owned by this change and was left as-is; a follow-up should tag its action
`purpose: "social_engagement"` and split it into a blocked case and a routine-copy control case,
matching the pattern this PR added in `standing-approvals-voice.boundaries.ts`.

**Scoping rule:** not applicable in the usual sense. There is no envelope scope that makes a
founder-public-voice publish autonomous. **Expiry / revocation:** not applicable for the same
reason; a fresh per-item decision has no envelope to expire or revoke.

## Envelope lifecycle

One lifecycle, cited once, applies to all five grants above:

1. **Request.** A pending decision surfaces as `business-access.schema.json`'s
   `activeFounderGate` (an object with `id`, `gateClass`, `whatThisIs`, `whyNow`, a two-or-three-way
   `question`, and a `bypassPolicy`, business-access.schema.json:26-88), or, mid-run, as a
   `waiting_founder` node with one or more `approvals` entries on the compiled plan
   (`kernel/engine/compile.ts`'s `ApprovalRequirement`).
2. **Founder decision.** Either `kernel/session/onboard.ts` commits a durable grant/waiver/budget
   answer through the reducer with `--founder-authority true` (onboard.ts:473,506), or
   `kernel/session/approve.ts` records one approval id at a time against the current run.
3. **Record.** A standing or one-shot authority becomes an entry in
   `operations/agent-operations.json`'s `approvalEnvelopes[]`, matched against the workspace's own
   `agent-operations.schema.json`.
4. **Consume.** `standing-approvals.ts`'s `applyStandingApprovals()` re-validates the envelope
   against the exact planned action on every run and only then marks the run-state approval
   `"approved"`, with provenance recorded (standing-approvals.ts:318-322).
5. **Expire or revoke.** The envelope's own `status` field (`active | consumed | expired |
revoked`) is the source of truth; `envelopeCoversNode()` refuses anything not currently
   `"active"` (standing-approvals.ts:143).
6. **Re-present.** `knowledge/operations/founder-zero-operator.md:43`'s re-engagement rule: a
   lane-level founder gate older than 30 days is re-presented with what changed, and silence defers
   again. It never converts to approval.

## Never-authorize list

Each entry names its actual enforcement mechanism, so "never" is a citation, not a promise:

| Never                                                          | Enforced by                                                                                                                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spend beyond the recorded cap                                  | `waivers.ts:88-121`'s fail-closed `maxPerAction`/`maxPerPeriod` checks, including the NaN fail-closed cases                                                                              |
| A production store release outside a version-pinned envelope   | `check-agent-operations.ts`'s `validateNeverAuthorizeEnvelopes()` rejects any `release`/`destructive` envelope with a wildcard `resourcePattern`                                         |
| Kill-switch reversal by anyone but the founder                 | `kernel/reducer/cli.ts:138-152`'s `--founder-authority` gate plus OS write-protection on `control/`, a reducer/process boundary, not an autonomy-evaluator check                         |
| An autonomous public-voice publish                             | `standing-approvals.ts:119-126` and `check-agent-operations.ts:460-469`, a standing envelope never matches a `social_engagement`-tagged publish, regardless of `voicePolicy`             |
| A legal name recorded as a literal value in a tracked artifact | `knowledge/store/apple-signing-release.md`'s Required Artifacts section records a Doppler secret-name pointer only; no automated redaction check exists yet (see Grant 3's residual gap) |

## Cross-links

- `docs/architecture.md`'s Authority model section points here for the five standing-authority
  grant types.
- `knowledge/operations/founder-zero-operator.md`'s Authorization Boundaries section (line ~152)
  points here instead of restating a shorter, looser version of the Public voice rule.
- `knowledge/operations/autonomy-onboarding.md`'s "Protected Moves And Your Okay" section points
  here as the detailed reference for what each of the seven protected moves actually enforces,
  instead of carrying its own ad hoc list as a second, driftable source of truth.
- `knowledge/store/apple-signing-release.md`'s Required Artifacts section points here for the
  legal-name pointer-only convention.

## What this document does not decide

Ownership and staffing for the console/self-serve-opt-out work, Google OIDC, and Stripe billing
objects are roadmap and resourcing calls, not authority-design questions, and are out of scope
here. Setting a real spend ceiling, granting a real Apple/Google role, or approving a real
production release remains, as always, an explicit founder action taken through the mechanisms
this document cites. This document does not itself grant anything.
