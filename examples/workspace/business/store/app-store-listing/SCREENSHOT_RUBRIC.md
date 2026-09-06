# Screenshot Rubric

Version: 1.2
Status: active
Owner: design-guru + marketing-guru + founder (override authority)

This rubric is the scored taste layer for the PRESENT/PROVEN/OPTIMIZED framework defined in SCREENSHOTS.md. Rubric scores fire as WARNINGS with a logged override; technical-correctness and Proven-existence checks are HARD ERRORS. Taste stays human.

## Dimensions

Each dimension is scored 0–3 per slot per locale. Weighted-high dimensions must each reach >= 2 for a slot to auto-pass. The overall weighted score must reach the stated threshold.

| #   | Dimension                     | Weight                           | Score 0                                                                                                     | Score 1                                                                | Score 2 (threshold)                                                                                        | Score 3                                                                                                                          |
| --- | ----------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Thumbnail legibility**      | HIGH                             | headline or key UI is unreadable at 60 px wide; text overlaps UI beyond recognition                         | legible at 120 px but not 60 px; marginal contrast                     | legible at 60 px; key text and icon clear at App Store search size                                         | instantly clear at 40 px; headline dominates; zero ambiguity                                                                     |
| 2   | **Hook-first ordering**       | HIGH                             | slot 1 shows a splash, logo, or secondary feature; no clear payoff                                          | slot 1 hints at value but does not show the magical V1 moment          | slot 1 shows the 11-star V1 payoff; emotional beat lands                                                   | slot 1 is so compelling a user stops scrolling; ordering tells a complete narrative across all slots                             |
| 3   | **Truthfulness**              | HIGH                             | shows UI that does not exist in the shipped build; outcome claims unsupported; fake ratings or endorsements | shows real UI but adds unsupported superlatives ("best", "#1")         | shows real app UI; every visible claim matches `revenue/REVENUE_OPS.md` and legal docs; no bait-and-switch | real UI AND claim-checked against `revenue/REVENUE_OPS.md`; reviewer note drafted; no edge case that could trigger Guideline 5.2 |
| 4   | **One-idea-per-slot**         | MEDIUM                           | multiple unrelated ideas compete in one slot; visual noise                                                  | two ideas present but one dominates                                    | one clear idea per slot; supporting elements reinforce not distract                                        | single idea, zero visual noise; a user can state the idea in four words                                                          |
| 5   | **Brand-token fidelity**      | MEDIUM                           | colors, type, or motion diverge from `DESIGN.md` without a recorded override                                | minor variance (one secondary color off-token)                         | all primary colors, type scale, and frame style match `DESIGN.md`                                          | pixel-perfect token adherence; composition would pass a design-system audit                                                      |
| 6   | **ASO keyword reinforcement** | MEDIUM                           | no visible keyword from `APP_STORE_LISTING.md` appears in any headline or copy overlay                      | one keyword present, buried in body copy                               | primary keyword and one secondary keyword visible in headlines across the deck                             | every headline reinforces a targeted keyword naturally; copy reads human, not stuffed                                            |
| 7   | **Emotional North Star**      | LOW                              | screenshot evokes no recognizable emotion; neutral or cold                                                  | some warmth or aspiration but the target emotion is not clearly landed | the target Emotional North Star from `EMOTIONAL_DESIGN.md` is felt within 2 seconds                        | shot is emotionally decisive; an independent viewer can name the exact emotion without context                                   |
| 8   | **Localization quality**      | LOW (only for non-en-US locales) | machine-translated copy with obvious errors; RTL layout broken                                              | human-reviewed copy but awkward phrasing; RTL partially correct        | natural-sounding translated copy; RTL layout correct; no truncation                                        | native-speaker-approved; locale-specific cultural references used; RTL pixel-checked on device                                   |

### Weighted Score Formula

```
weighted_score = (legibility * 3 + hook_first * 3 + truthfulness * 3
               + one_idea * 2 + brand_token * 2 + aso_keyword * 2
               + emotional_north_star * 1 + localization * 1)
             / (3+3+3+2+2+2+1+1)   # denominator = 17

pass_threshold = 0.65   # 65% of max weighted score = 11.05 out of 17
high_dimension_minimum = 2  # all three HIGH dimensions must reach >= 2
```

For non-en-US locales the localization dimension is included. For en-US it is excluded and the denominator drops to 16.

## Separate-Pass Protocol

### CRITICAL: Producer != Verifier Requirement

**The agent or session that builds the screenshot deck MUST NOT be the same agent or session that grades it.**

This separation exists because the builder has motivated reasoning to pass their own work. A grader with no stake in the outcome notices copy that is too small at thumbnail size, hooks that bury the payoff, and claims that are slightly broader than the shipped UI — the builder reads over these because the work feels familiar.

In v1.2, grading is an **explicitly routed, separately invoked pass** — not just a separate string in the ledger. The `grade-screenshots.ts` scaffold is the entry point for the grading pass. It verifies PNG dimensions from the real IHDR headers, emits a structured grading task template (one block per slot), and validates the assembled ledger before writing `screenshot-rubric-scores.json`.

#### Workflow

1. **Builder session** writes final PNGs to `screenshots/final/` and records `builder: { agent, session_id }` in the ledger header.
2. After final PNGs are written, the builder session stops and hands off — it must not run the grading pass itself. There is no hook to enforce this; `check:store-screenshots` catches a skipped or same-session grading pass after the fact by rejecting a ledger whose `builder.session_id` equals `grader.session_id`.
3. **A separate grader session** (different `session_id`) is spawned. It runs:
   ```bash
   npx tsx tooling/grade-screenshots.ts --root . --state state/business-state.json
   ```
   This emits a grading task template listing each slot, its real IHDR dimensions, and the rubric dimensions to score.
4. **Grader vision agent** opens each PNG and fills in the task template: dimension scores, `grader_notes` (minimum one paragraph), and `observed_evidence` (one line referencing something actually seen in the PNG — headline text, dominant color, a specific UI element).
5. **Grader session** assembles the ledger and validates it:
   ```bash
   npx tsx tooling/grade-screenshots.ts \
     --root . --state state/business-state.json \
     --grading-input /tmp/grading-output.json \
     --write screenshot-rubric-scores.json
   ```
6. The validator (`npm run check:store-screenshots`) will ERROR if `grading_pass.separate_pass` is not `true`, if `builder.session_id` equals `grader.session_id`, or if any slot lacks `grader_notes` or `observed_evidence`.
7. **store_console cannot be marked "done" until all steps above complete and the validator passes.**

#### Bash-Written PNGs Are Also Covered

The `settings.json` Write|Edit hook fires when the tool writes a file. If an agent instead writes final PNGs via a Bash command (`cp`, `mv`, `tee`, `install`, `ditto`, `sips`, `magick`/`convert -o`, or shell redirection `>`/`>>` into `screenshots/final/*.png`), the Bash PostToolUse hook intercepts the command and emits the identical BLOCKING grading-pass signal, then exits 1. This closes the Bash-write bypass.

**Honest limit of the Bash hook:** the hook matches a regex against the Bash command string. A carefully constructed command string that uses the destination path in an unusual position could evade the pattern. It catches straightforward writes (copy, move, redirect) and is not a cryptographic guarantee.

#### Honest Limit of This Control

The validator enforces that:

- `grading_pass.separate_pass: true` is explicitly asserted
- `builder.session_id` and `grader.session_id` are distinct non-empty strings
- every slot has substantive `grader_notes` (≥ 30 chars) and `observed_evidence` (≥ 15 chars)
- `observed_evidence` is DISTINCT per slot — two or more slots sharing the exact same normalized evidence string fires `store_screenshots.observed_evidence_not_distinct` (ERROR at done, WARN at partial)
- `observed_evidence` does not match a stock generic-phrase denylist (e.g. "looks good", "reads clearly", "headline visible") — matches fire `store_screenshots.observed_evidence_generic` (WARN)

**What it cannot prove:** that two truly independent processes ran. A single agent that knows the schema can fabricate both session IDs, an `observed_evidence` field, and write distinct-but-fictional evidence per slot. These controls raise the bar significantly versus the v1.1 string-comparison control (faking now requires deliberate fabrication of two session identities, an explicit separation attestation, per-slot visual evidence notes, AND distinct non-generic observations per slot), but they do not eliminate the gap.

**Founder approval is the ultimate backstop.** The founder's review of the final PNGs alongside the grading ledger is the only control that cannot be mechanically gamed. The validator is a raised-bar deterrent, not a proof.

### Inputs (for the grader session)

- Final PNGs under `screenshots/final/<locale>/<device-well>/`
- `APP_STORE_LISTING.md` (keyword list)
- `DESIGN.md` (brand tokens)
- `EMOTIONAL_DESIGN.md` (Emotional North Star)
- `revenue/REVENUE_OPS.md` (pricing/claim truth-check source)
- This rubric file (current version)

### Steps

1. Run `npx tsx tooling/grade-screenshots.ts --root . --state state/business-state.json` to generate the grading task template. This reads SCREENSHOTS.md, verifies each final PNG exists, and reads its real IHDR width/height.
2. For each slot in the task template, open the final PNG and score each dimension 0–3 using the criteria in the Dimensions table above.
3. Compute the weighted score and the pass boolean.
4. Fill in `grader_notes` for every slot — at minimum one paragraph explaining the score for each dimension that could plausibly change. Empty or missing `grader_notes`, or notes shorter than 30 characters, are treated by the validator as a grading skip.
5. Fill in `observed_evidence` for every slot — one line referencing something you actually saw in the PNG (headline text, dominant color, a specific UI element). This is the per-slot anti-fabrication control. Rules:
   - Minimum 15 characters.
   - Must be DISTINCT across slots: two slots cannot share the same normalized observed_evidence — that signals the grader did not open each PNG separately.
   - Must not be a stock generic phrase: "looks good", "reads clearly", "headline visible", "looks clean", "nice", "good", "clear", "ok" etc. are flagged as warnings.
6. If pass is false AND the founder has not yet filed an override: emit a WARNING with the slot identifier, the failing dimension(s), and the score. Do NOT block launch from this alone.
7. Assemble the complete ledger (identity block + all slot blocks) and run the validate+write command. The script enforces `builder.session_id != grader.session_id`, `grading_pass.separate_pass: true`, and notes presence before writing.
8. If a founder override is provided: log `override.by`, `override.reason`, and `override.at` in the same record.

### Ledger Schema (v1.2)

The ledger root MUST contain:

```json
{
  "rubric_version": "1.2",
  "builder": {
    "agent": "<agent-name-or-role>",
    "session_id": "<unique session token>"
  },
  "grader": {
    "agent": "<agent-name-or-role>",
    "session_id": "<DIFFERENT unique session token>"
  },
  "grading_pass": {
    "separate_pass": true,
    "started_at": "<ISO-8601 timestamp>",
    "method": "vision"
  },
  ...
}
```

And each slot MUST contain both `grader_notes` AND `observed_evidence`:

```json
{
  "grader_notes": "<paragraph explaining the score for each dimension>",
  "observed_evidence": "<one line: e.g. headline reads 'Plan Your Day', dominant color is #1A1A2E>",
  ...
}
```

### Suspicious Perfect Score

When all high-dimension scores are 3 and `grader_notes` is very short (fewer than 50 characters), the validator fires a `store_screenshots.suspicious_perfect` warning. A perfect score requires proportionally detailed justification — it should be harder to explain than an average score, not easier. If scores are genuinely all-3s, write at least one sentence per dimension explaining what specific visual evidence supports the score.

### Auto-Pass Threshold

A slot passes auto-grading when ALL of the following are true:

- `legibility >= 2`
- `hook_first >= 2`
- `truthfulness >= 2`
- `weighted_score >= 0.65`

### Founder Override

When auto-pass is false, the founder may override by recording:

```json
"override": {
  "by": "founder",
  "reason": "<one-sentence human rationale>",
  "at": "<ISO-8601 timestamp>"
}
```

An override with an empty or null `reason` is treated by the validator as no override (still emits WARNING).

## Improve-Over-Time Loop

The rubric is versioned. Each graded deck becomes a permanent fixture.

### Fixture Accumulation

Every time a deck is graded, the `screenshot-rubric-scores.json` is committed alongside the final PNGs. This creates a growing fixture corpus: scores + PNG paths + founder accept/override. The fixture corpus is the basis for future calibration.

### Rubric Versioning

When any dimension definition or threshold changes:

1. Increment the `rubric_version` field (semver patch for threshold tweaks, minor for new dimensions).
2. Re-grade any fixture that was graded under an older version and update `rubric_version` in the record (or mark it `stale: true`).
3. Old fixtures with `stale: true` are excluded from threshold enforcement but kept for historical comparison.

### Conversion Tuning (deferred)

Linking rubric scores to downstream conversion metrics (PPO results, App Analytics impression-to-install) is deferred until the first 90-day post-launch window produces sufficient data. When that data is available: correlate per-dimension scores with conversion lift, re-weight accordingly, and commit a new `rubric_version`.

## Notes for Maintainers

- This rubric is the reference implementation for the PRESENT/PROVEN/OPTIMIZED pattern. Every other lane that adds an OPTIMIZED layer should mirror this structure: versioned rubric, scored fixture ledger, founder override path, improve-over-time loop.
- The validator `check:store-screenshots` reads `screenshot-rubric-scores.json` and enforces this rubric. When the lane is "partial" a missing score is a WARNING. When the lane is "done" a missing score is an ERROR.
- Do not collapse PROVEN checks into OPTIMIZED. A missing file on disk is always a hard error regardless of scores.
- The ledger schema is at `rubric_version: 1.2`. Version 1.2 added `builder`/`grader` as structured objects (`{ agent, session_id }`), the `grading_pass` block (`{ separate_pass, started_at, method }`), and per-slot `observed_evidence`. Ledgers graded under v1.1 (plain string builder/grader) will fire `store_screenshots.grading_not_separate_pass` and `store_screenshots.grader_provenance_missing` warnings; re-grade them before marking the lane "done".
- Tier-1 anti-gaming: the validator rejects `screenshot-rubric-scores.json` that is byte-identical to `screenshot-rubric-scores.example.json` or below 200 bytes. The example file is the scaffold; it must be replaced with real scores, not copied.
- Tier-2 separate-pass enforcement: new in v1.2; tightened in v1.2.1. The validator errors on `store_console=done` if `grading_pass.separate_pass !== true`, if `builder.session_id === grader.session_id`, if any slot lacks `grader_notes` (≥ 30 chars) or `observed_evidence` (≥ 15 chars), if two or more slots share the same normalized `observed_evidence` (issue code: `store_screenshots.observed_evidence_not_distinct`), or if `observed_evidence` matches a stock generic-phrase denylist (issue code: `store_screenshots.observed_evidence_generic`, warning only). Issue codes: `store_screenshots.grading_not_separate_pass`, `store_screenshots.builder_equals_grader`, `store_screenshots.grader_provenance_missing`, `store_screenshots.observed_evidence_not_distinct`, `store_screenshots.observed_evidence_generic`.
- Tier-3 PNG reality checks: for every `final_png` path in the ledger the validator reads the PNG IHDR header bytes and checks that the declared device-well dimensions and alpha-removal claim are true. A final PNG that carries an alpha channel after `alpha removed` is claimed is a hard error when the lane is "done".
- The `grade-screenshots.ts` scaffold is the ONLY supported way to assemble and write the grading ledger. It validates the complete provenance chain before writing. Do not write `screenshot-rubric-scores.json` directly from a build agent.
- The settings.json `Final PNG hook` exits non-zero after final PNG writes (BLOCKING). This is intentional — it forces the agent to route to the grading pass. Do not add `|| true` to this hook.
