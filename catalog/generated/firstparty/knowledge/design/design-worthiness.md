# Design Worthiness

Use this file before DESIGN.md authoring or its generated Design Room review hardens into engineering work.

This file does not replace eleven-star, emotional design, quality-lens, vibecoded-tells, motion craft, or [mobile-flow-craft.md](mobile-flow-craft.md).

It fills the floor those files leave open: contrast, scale, hierarchy, native-flow semantics, mechanical anti-generic consistency, and a recorded taste decision.

Do not invent a beauty score.

## Three tiers

Mechanical: a validator may assert pass or fail.

Attested: a validator may warn. A named person must record a short attestation.

Taste: the founder or owner may decide directly in `DESIGN.md` and bind that decision to the exact candidate through a signed `b2c approve --design-taste` receipt. An independent fresh-context audit may decide in `design/reviews/DESIGN_SYSTEM_REVIEW.md` only when its exact attempt was dispatched with a signed `decision.design.taste.delegation: approved` founder capability and binds that current output to an engine-issued non-producer identity. Both routes must verify through the externally protected founder public-key store and the current run's exact trust-binding audit edge.

## Direction exploration

A review-ready design preserves at least three developed directions in the
`DESIGN.md` frontmatter `exploration` map. Each concept names the frozen
reference principles it transfers. It also defines distinct native, mobile-web,
and desktop-web treatments and one ownable mechanic. Mark exactly one concept as
selected. Mark the others as rejected and state why.

The Design Room renders all preserved concepts beside the selected system. The
independent audit receives the complete `DESIGN.md` bytes, so a later change to
the alternatives or rationale invalidates its input fingerprint. Keep these
records in the design authority. Do not create parallel concept documents.

## Twelve rules

### 1. One primary emphasis per view

Give each view one dominant action or message.

Tier: Attested.

Bind this rule to the screen matrix in `DESIGN.md`.

### 2. Spacing encodes grouping

Place related items closer than unrelated items.

Tier: Mechanical for token steps. Attested for grouping judgment.

### 3. Declared type and space scale

Declare a short type scale and a short space scale in tokens.

Proof HTML must use those steps. Do not invent one-off pixel values.

Tier: Mechanical.

### 4. Contrast floor

Body text on its background must meet WCAG 2.2 AA at 4.5:1.

Applicable large text requires 3:1. Essential non-text indicators require 3:1 against adjacent colors. Decorative accents, inactive controls, and logotypes have specific exceptions; a token name cannot establish actual usage.

For body text on dark backgrounds, review whether the 7:1 AAA target improves legibility. This is a contextual signal, not an APCA calculation or a universal design requirement. Review actual text/control combinations and states; this palette check alone is not an accessibility audit.

See [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Tier: Mechanical.

Named standards: WCAG 2.2. Dieter Rams. Apple Human Interface Guidelines.

### 5. Motion answers a user question

Motion must explain state, order, feedback, spatial continuity, comprehension, or an earned moment.

Classify its frequency before choosing custom choreography. High-frequency platform interactions default to platform behavior. A deliberate decision to add no custom motion is valid.

Do not add motion only to decorate. Reduced-motion behavior belongs to the same contract.

Tier: Attested here. Motion craft files own the recipes and `mobile-flow-craft.md` owns the frequency/purpose gate.

### 6. Peak and proof before paywall

Show the product peak and proof before a hard paywall.

Tier: Attested.

Bind this rule to the emotional curve. Do not rewrite that system here.

### 7. Progressive disclosure

Ask for only the next needed fact. Hide the rest until the user needs it.

Tier: Attested.

Named source: Nielsen Norman Group progressive disclosure.

### 8. Originality under logo-swap

A stranger must still read the product as one product after the wordmark is gone.

Tier: Attested.

Bind this rule to vibecoded-tells and audience-derived-identity. Do not copy those checklists here.

### 9. Edge-state thoroughness

Empty, loading, success, error, and offline states must exist for each primary surface when applicable. Permission-denied and platform accessibility states follow the acceptance contract.

Tier: Attested before implementation; mechanical coverage is enforced by strict design acceptance once the implementation exists.

The screen matrix in `DESIGN.md` owns the rows.

### 10. Native flow semantics are explicit

For each primary native flow, record the presentation/navigation semantic, return expectation, and back behavior. Mark true one-way doors and state why returning would expose an invalid prior state.

Do not use funnel pressure as a reason to trap Back. Do not let a framework's default stack behavior become the product decision by accident.

Tier: Attested for the authored flow; strict runtime interaction evidence verifies the implementation.

### 11. Mechanical anti-generic consistency

Before taste review, check objective drift against the accepted system: accent/token families, shape/radius scale, canonical labels for repeated intents, icon-system consistency, unexplained decorative effects, and required state coverage.

An explicit accepted exception is allowed. An accidental one-off is a finding.

Tier: Mechanical where the repository can derive the fact from authored tokens/contracts; otherwise Attested until a shared validator owns the field. Do not pretend prose review is machine proof.

### 12. Taste as a decision gate

Do not compute a beauty score.

After mechanical checks pass and attested warnings have rows, prepare a taste packet for the authorized decision maker.

The packet asks two questions:

1. Would a stranger recognize this as one product?
2. Would we rather competitors copy this version?

The founder or owner may record the decision directly in `DESIGN.md`, then have the authenticated founder UI or keychain broker sign the exact decision request. Apply it with `b2c approve --workspace <path> --design-taste pass|fail --founder-receipt-file <path> --session <receipt-consumer-session>`. The command loads the Ed25519 public key from the protected external trust store, requires the receipt consumer and workspace control directory to share a non-founder OS identity that cannot modify the trust directory, verifies the run's exact store/workspace/audit binding, requires the signed verdict to match the table, and records the signed envelope inside the hash-chained audit entry for the exact current `DESIGN.md` fingerprint. `--session` is audit attribution only. The latest valid matching signed receipt for those bytes is authoritative, so an older pass cannot survive a later fail.

When the founder signs `decision.design.taste.delegation: approved` for the current run and applies it through `b2c approve --design-taste-delegation approved --founder-receipt-file <path>`, the next independent audit attempt records `pass` or `fail` in `design/reviews/DESIGN_SYSTEM_REVIEW.md` after reviewing the frozen rubric. Its structured decision table sets `Decision authority` to exactly `Founder opening mandate` and records the date, reviewed surfaces, both taste observations, and verdict. It does not claim its own identity or its own authority. `run/run-state.json` stores the signed delegation reference captured before that attempt was spawned. The protected store is public-key-only; the private signing key never enters the workspace or a worker environment. Before the first worker, the engine binds the canonical store path and bytes, key ID, real workspace identity, run ID, time, and exact audit entry hash. An existing unbound run cannot acquire authority because a store later appeared. Every reuse revalidates that binding and the signed decision chain. Run-state must also bind the current file fingerprint to the current `workflow.design.design-system-audit` attempt. That attempt must carry a valid engine-issued worker identity and differ from every recorded `workflow.design.design-room` producer attempt. A delegation granted after an audit was written cannot authorize that old output. It opens a new audit attempt; if the audit has exhausted its attempt cap, the work stays blocked. When delegation is absent or rejected, the audit waits for a direct founder decision instead of repairing product work.

The `## Findings` section must contain exactly one `Severity: <value>.` line. Allowed values are `none`, `minor`, `major`, `high`, `high-severity`, and `blocker`. Any explanation follows the period on that same line. It must include both `Candidate input fingerprint: <64-hex engine-bound fingerprint>` and `Frozen rubric: design/reviews/rubrics/<file> version <version>`. The candidate line must exactly match the current audit attempt's engine-issued input fingerprint. The rubric file must exist under that directory, contain the same version, and match the rubric-directory bytes bound into the audit attempt. A pass cannot coexist with an unresolved blocker, a high or high-severity finding, or a major finding, including when a direct founder receipt supplies taste authority.

This decision accepts or rejects local design direction. It does not authorize publication, deployment, store submission, production release, spend, pricing, or legal terms. Those actions keep their separate founder authority checks.

Tier: Taste.

## Artifact

Record the scorecard and an optional direct founder/owner taste decision in `DESIGN.md`. Keep `DESIGN.md` producer-owned.

The row alone carries no authority. Bind it to the exact candidate with a founder-signed receipt and `b2c approve --design-taste pass|fail --founder-receipt-file <path>`. A later candidate edit requires a new receipt. A current direct founder pass may override an audit's taste-only verdict after independent Findings clear. It cannot waive an unresolved blocker, high, or major finding.

Use this table shape:

| Reviewer         | Decision authority                               | Date     | Surfaces reviewed           | One-product stranger test | Copy-test          | Verdict      |
| ---------------- | ------------------------------------------------ | -------- | --------------------------- | ------------------------- | ------------------ | ------------ |
| Founder or owner | Founder direct decision or owner direct decision | ISO date | Proof paths and key screens | Substantive answer        | Substantive answer | pass or fail |

For a delegated decision, write this inside `design/reviews/DESIGN_SYSTEM_REVIEW.md` beside a substantive `## Findings` section that uses the exact severity line above, the exact `Candidate input fingerprint: <64-hex engine-bound fingerprint>` line, and the exact frozen rubric path/version line:

| Decision authority      | Date     | Surfaces reviewed           | One-product stranger test | Copy-test          | Verdict      |
| ----------------------- | -------- | --------------------------- | ------------------------- | ------------------ | ------------ |
| Founder opening mandate | ISO date | Proof paths and key screens | Substantive answer        | Substantive answer | pass or fail |

Do not copy design decisions into a second design document. The audit artifact records judgment and findings only.

`check:design-worthiness-mechanical` owns the producer's mechanical floor. `check:design-worthiness` adds the direct-or-delegated taste decision after the independent audit output is bound.

## Gates before build

Run design-worthiness with 11-star and the emotional curve before engineering harden. For native flows, apply `mobile-flow-craft.md` before the detailed flow is frozen. Runtime implementation proof belongs to `design-acceptance.md`, not the pre-build taste decision.

## Evidence dialect coverage

`required-table-section.ts` defines the strict evidence dialect.

These surfaces use that dialect:

- Research Source Ledger, offer, signal, and Founder Waiver tables.

These surfaces still strip hidden Markdown. They do not fail closed yet:

- Onboarding graph and evidence packets, through `launch-state.ts`.
- Motion contract, through a local stripper. The stripper omits `<pre>` and `<textarea>`.

Do not add another tag-by-tag parser. Move a surface onto the shared dialect. Or keep the stripper until you move it.
