---
name: b2c-research-opportunity
description: "Research whether a consumer-app idea is worth building. Compare demand, competitors, distribution, offer evidence, and product scope; recommend Go, Pivot, or Kill. Use for opportunity validation or delegated idea selection, not a narrow code fix or execution of an entire launch."
compatibility: Markdown and supplied evidence. Provider-backed work needs the corresponding authorized tools. The B2C runtime is optional for focused advisory work.
metadata:
  source-workflow: "workflow.research.research-backed-spec"
  generated-by: b2c-catalog
---

# Research an opportunity

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

## Choose the scope

Use this task directly for focused advice, review, or an authorized change. Do not require setup, install software, create a workspace, or activate a full launch graph merely to use this expertise. A review is read-only unless the user also requests changes.

For an existing managed business, read business-status then business-plan and use its current brief. This skill cannot choose executable next work, bypass prerequisites, change provider bindings, or replace runtime acceptance. Do not inspect raw reducer files merely to start a focused task.

## Method

For a review, assess the existing evidence against this method and return findings; do not execute its authoring or mutation instructions. For requested creation or implementation, follow the method only within the accepted scope and authority.

Before the spec hardens, ask the question a good idea and a good business both answer
differently: **is this market big enough to be worth building in at all?** Pull top-competitor
revenue estimates (AppKittie, sorted by revenue) and judge them against a stated bar.

Default bar: the top 10 apps in the target category gross at least **$5M/year combined**, with
at least **two independent apps each clearing $1M/year**. A category whose leaders gross too
little cannot become a real business however well the launch executes — no amount of good
onboarding, ASO, or paid UA fixes a market that is not there. Adjust the bar with the founder
for a deliberate niche play, and record why the adjustment is legitimate rather than a way to
pass a category that would otherwise fail.

`check:research` reads the `## Category Revenue Reality` section's table, not the phrase in
prose, and requires:

- at least one competitor row with a real dollar estimate in the revenue column AND a dated
  (`YYYY-MM-DD`), non-placeholder source in the source column — collecting the AppKittie data
  is not the gate, the sourced number judged against the bar is
- a "stated bar" line carrying an actual number, not a blank or placeholder
- an explicit `pass or fail:` judgment line against that bar

A pass verdict over no stated threshold, or a table with rows but no judgment line, is data
collection wearing a gate's clothes.

## Load only what the task needs

[Task inputs, outputs, checks, and knowledge selectors](references/task.md) supplies the canonical details when they are needed. Open the specific referenced sections, not the whole library. In connected knowledge retrieval, follow exact section selectors, revision hashes, and continuation calls. Unresolved guidance remains unresolved.

## Tools and evidence

Keep the method independent of the agent host and business provider. Honor explicit selections. Use already available, authorized tools that implement the required operation; do not infer availability from the agent's name or silently substitute a provider. Load a provider's procedure only when its action is current. Record missing capabilities without inventing provider proof.

Pause for access or secrets, spend, pricing or legal decisions, destructive changes, hosted deployment, store submission, or production release. Guidance is not permission. A proposed price is not an approved price, and a mock is not live evidence.

## Return

Report findings or changes, the evidence inspected, applicable checks actually run, unresolved requirements, and the next decision. Label advisory findings separately from accepted business evidence. Do not record business completion or modify reducer-owned state outside the supported runtime.
