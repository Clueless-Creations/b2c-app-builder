# Distribution, Offer, And Signal Validation

Use this reference before the founder records a Go, Pivot, or Kill decision.
It adds distribution and offer evidence to the pre-build decision.

## 1. Required Outcome

Research must answer five questions before design or build work starts:

1. Which people have the problem?
2. Where do these people seek a solution?
3. Which native message or format can reach them?
4. Does a measurable offer response exist?
5. How will the business keep an owned relationship after discovery?

Category revenue proves that money exists in a market.
It does not prove that this business can reach the market.

### Strict Evidence Markdown

Validator-backed evidence sections use a narrow Markdown dialect. Each section has one exact rendered H2 and one simple pipe table. Validators resolve required columns by name. Approved column-zero backtick and tilde fences may hold hidden examples. Outside those fences, every nonblank line indented four or more columns invalidates the evidence document. HTML comment opener tokens, raw HTML block syntax, non-column-zero fences, and container-relative raw HTML also invalidate it. Write checkable records as top-level Markdown.

## 2. Distribution Proof

Record distribution proof in `strategy/RESEARCH.md`.
Use evidence from a current source ledger row.
Give that row a stable source or trace ID in its URL/source-ID or Artifact/trace cell.
The Distribution Proof evidence cell must resolve to that ledger ID or to a `current` or `dated` Signal ID.
Do not use an unverified, rejected, or superseded signal as distribution proof.

The proof must identify:

- one audience segment
- one exact discovery location
- one native content or outreach format
- one route to an owned relationship
- one measured signal from that route

An exact location is a named search result, community, creator audience, keyword cluster, newsletter, ad placement, or partner channel.
"Social media" is not an exact location.

An owned relationship is an email subscriber, account, push permission, or direct community membership.
Do not require email when another durable route fits the product better.

## 3. Signal Corpus

Write `strategy/SIGNAL_CORPUS.md` before every pre-build verdict when reusable source material exists. Source material can include posts, transcripts, reviews, interviews, support records, and prior launch material. When no reusable source exists, keep the artifact. Record a project-specific `Status: not applicable —` reason. The reason must explain why no reusable source material exists. Do not invent evidence. Do not use `none`, `n/a`, `not applicable`, `unknown`, `no reason`, literal `authored reason` text, or an angle-bracket instruction.

Record every source in Corpus Inputs before you cite it.
Give each input a stable `INPUT-` ID, a real date range, an owner or creator, a collection route, a permission or public basis, and collection limits.
Every Source ID in Signal Records must resolve to a declared input.

Keep one signal record for one claim.
Each record must include:

- a stable signal ID
- a signal type
- the claim or exact phrase
- one or more source IDs
- an observation date
- an applicability statement
- a confidence value
- a lifecycle status
- a trace pointer

Use these lifecycle values:

- `current`: the evidence supports current use
- `dated`: the record can still inform work, but time can change it
- `superseded`: a later record replaces it
- `rejected`: the evidence does not support use
- `unverified`: the record needs more evidence

A superseded record must point to its replacement.
Do not delete a material contradiction.
Record the contradiction and the selected current position.
Unverified, rejected, and superseded records can remain in the corpus.
Only `current` and `dated` records can support Distribution Proof or Derived Outputs.

Markdown is the authoritative record.
Indexes, search data, charts, and embeddings are rebuildable outputs.

## 4. Traffic-Backed Offer Test

Write `strategy/OFFER_TEST.md` before the founder records the verdict.
Use the smallest truthful offer surface that can measure response.
Replace every starter field with one project-specific value.
A menu of possible audiences, locations, formats, relationship routes, responses, or stop rules is guidance, not a completed test contract.
The Owned relationship field must name one durable route.
An absent route does not complete the contract.

The test can use:

- a plain landing page
- an existing store page
- a direct-outreach offer
- a partner or creator placement
- a community post with a measurable call to action

The test must record exposure and response.
Exposure can be impressions, qualified visits, or qualified direct contacts.
Response can be sign-ups, deposits, purchases, booked calls, or another named action.

Do not treat compliments, likes, or general survey interest as an offer response.

Public deployment, account connection, and spend need the applicable founder authority.
Research can prepare the test without that authority.

If the founder declines or cannot run the test, record a waiver.
The waiver must include the founder, date, reason, and residual risk.
Silence is not a waiver.

## 5. Decision Use

Add `Distribution proof` and `Offer test` columns to the Go, Pivot, Or Kill table.
The founder decides the verdict after these columns contain evidence.

A zero-conversion test does not force an automatic Kill decision.
It is evidence for the founder to judge.
The test can expose a bad audience, channel, message, offer, or product promise.

## 6. Owned-Relationship Metrics

When the project continues, track these metrics by discovery channel:

- discovery exposure to owned contact
- owned contact to activation
- owned contact to paid conversion
- revenue per owned contact
- share of acquisition from the largest external platform

Raw reach is a diagnostic value.
It is not a business outcome.

## 7. Content Intelligence

Store reusable content observations as structured records.
Each record should include the source, account baseline, audience fit, hook, structure, emotion, format, sales intent, and downstream result.

Normalize performance against the source account's usual result.
Do not rank content by raw views alone.

Extract patterns.
Do not copy another creator's words, identity, assets, or exact composition.

## 8. Manual Proof Before Automation

Run each value-producing process manually before you automate it.
Record the manual input, output, result, cost, and failure mode.

This rule does not apply to necessary security, compliance, backup, or monitoring controls.

Begin each automation decision with `automate` or `keep manual`. Use `automate` only when that process's row passed and its manual evidence shows that repetition has value.

## 9. Optional Persona-Balanced Test Planning

When a beta test is in scope, a mixed group can help plan complementary perspectives:

- a target novice
- a target experienced user
- a user who represents a device or accessibility risk
- a domain, product, or usability reviewer

Use the worksheet only when it helps the project plan recruitment or interpret feedback.
It is optional planning guidance, not app-quality completion evidence.
It does not replace measured quality results or change fresh-context acceptance of the whole app-quality artifact.
Do not use one tester group as a fixed quota for every product, and do not treat a filled worksheet as proof that the app passed quality review.

## 10. Prohibited Transfers

Do not transfer deceptive or unsafe tactics from source material.
Prohibited tactics include:

- hidden fees
- fake scarcity or social proof
- undisclosed engagement manipulation
- platform-rule circumvention
- safety-filter evasion
- close copying of successful content or ads

Treat strong universal claims as hypotheses.
Test them against this business's evidence.

## 11. Source Limits

EP's Signal Knowledgebase is a primary example of corpus compression and portable publishing.
It also contains personal claims, dated tool choices, and aggressive growth tactics.

Use its information architecture and testable business hypotheses.
Do not treat its business claims as verified facts.
