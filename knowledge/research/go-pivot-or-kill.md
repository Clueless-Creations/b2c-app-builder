# Go, Pivot, Or Kill: The Pre-Build Research Verdict

The launch machinery will polish and ship whatever idea it is given — it has no opinion on
whether the idea is worth building. This is the one evidence-gated exit ramp before Phase 2
spends design, build, and store effort: the agent assembles the evidence, the founder decides
whether the category and the wedge earn a build. `check:research` enforces the shape of this
decision in `strategy/RESEARCH.md`; this file is the judgment behind that shape, not a second
copy of it.

## Contents

- 1. The Category Revenue Reality Bar
- 2. The Go, Pivot, Or Kill Table Contract
- 3. The Verdict Is Founder-Only
- 4. What Kill And Pivot Mean
- 5. When The Verdict Is Mandatory

## 1. The Category Revenue Reality Bar

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

## 2. The Go, Pivot, Or Kill Table Contract

The verdict itself lives in a `## Go, Pivot, Or Kill` table with these required named columns.
The starter uses this canonical order, but projects may reorder the named columns or add
project-specific columns:

| Date | Category revenue reality | Wedge | Demand signal | Distribution proof | Offer test | Verdict (Go / Pivot / Kill) | Decided by |
| ---- | ------------------------ | ----- | ------------- | ------------------ | ---------- | --------------------------- | ---------- |

The five evidence columns are named on purpose: **category revenue reality**, **wedge**,
**demand signal**, **distribution proof**, and **offer test** are the inputs a real verdict is
judged from. A table renamed to Notes/Opinion/Summary carries cells, not the required inputs,
and `check:research` rejects it. The validator resolves the required fields by normalized name,
not by physical position or by a table shaped roughly like a decision.

Row-level requirements once the lane is done:

- **date and verdict must parse.** The date is ISO (`YYYY-MM-DD`); the verdict cell starts with
  `go`, `pivot`, or `kill`. A row with a mistyped date or an unparseable verdict is reported as
  malformed, never silently dropped — dropping it would fall back to an older verdict the
  founder already superseded.
- **the latest date wins ties.** If two rows share the newest date, the later row in the table
  is the one that counts.
- **evidence cells must be substantive.** Each of the five named evidence cells on the latest
  row must be non-empty and free of placeholder text (`unverified`, `tbd`, `todo`, `to be
filled`, `pending`, `placeholder`). A verdict decided over "unverified" is a mood, not a
  decision — fill category revenue, wedge, demand, distribution, and offer evidence before
  recording it.

## 3. The Verdict Is Founder-Only

`"Decided by"` names the founder — by role (`founder`, `owner`) or by the name recorded in
`project.owner` — **never an agent or automation identity**. `check:research` explicitly rejects
`agent`, `codex`, `claude`, `gpt`, `assistant`, `bot`, `automation`, `autopilot`, and `ai` as
decision-makers in this column. This is the one gate in the whole engine designed to stop the
agent from clearing itself: an agent recording Go for itself is the exact bypass the checkpoint
exists to prevent, however confident the evidence looks.

The verdict and its date must also be mirrored into `state/business-state.json`
(`lanes.research.go_pivot_kill_decision` / `lanes.research.go_pivot_kill_decided_at`), and the
mirror must match the latest table row exactly — a stale or forward-dated mirror is what
downstream lanes and the portfolio pipeline would act on instead of the real decision.

## 4. What Kill And Pivot Mean

A Kill or a Pivot at this checkpoint is the process working, not failing — it costs a research
document instead of a shipped app nobody wanted.

- **Kill** winds the idea down before any design or build spend. The research lane is not
  done, and stays not done: `check:research` refuses a `done` status while the latest verdict
  is anything other than `go`.
- **Pivot** re-enters Phase 1 with the wedge changed — new positioning, a different core loop,
  or a narrower niche — and the Category Revenue Reality and Go/Pivot/Kill sections get a fresh
  row once the changed wedge has been evaluated. The old verdict does not carry forward onto a
  materially different idea.
- **Go** is the only verdict that lets the research lane close `done`. Record the follow-up
  verdict once the founder actually decides to build — a lane cannot be `done` on the strength
  of the evidence alone.

## 5. When The Verdict Is Mandatory

This checkpoint does not wait politely for the research lane to claim `done` before it starts
enforcing. `check:research` requires a real verdict the moment any of the following is true:

- `lanes.research.status` is `done`, or
- `project.phase` is `phase_2` or later, or
- any downstream lane — `experience`, `product`, `design`, `content_assets`, or
  `engineering` — is already `partial` or `done`.

The `research-backed-spec` workflow uses `check:research-workflow-output`. This strict wrapper
also requires complete research, signal-corpus, and offer-test outputs when that workflow claims
its work. It does not change the pre-claim behavior of the public `check:research` command.

That last condition is the one that matters most in practice: design and build effort spent
before the founder's verdict is exactly the cost this checkpoint exists to prevent, whatever the
recorded project phase says. Deferring or marking the research lane `not_needed` does not route
around this — from `phase_2` onward, or the moment downstream work goes active, the verdict is
mandatory even for a lane the state file claims is deferred.
