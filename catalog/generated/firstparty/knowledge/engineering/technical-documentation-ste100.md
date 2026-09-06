# Technical Documentation In Simplified Technical English (ASD-STE100)

Use this register before you write or edit any of these files:

- `docs/architecture.md` or `docs/validators.md`
- This skill's own `README.md` or `SKILL.md`
- Any `knowledge/*.md` reference file
- A maintainer-authored engineering spec inside this repository
- An ADR or a runbook
- An API or config reference inside this repository

This is the flat, literal register. Its job is prose that a reader parses correctly on one pass, not prose that persuades or entertains.

This section does not cover three files a launched business receives as templates: `engineering/TECH_SPEC.md`, `engineering/ENGINEERING_PLAN.md`, and `engineering/PRODUCTION_READINESS.md`. The templates live under `examples/workspace/business/engineering/` and under `workspace-template/`. Every file with these three names in this repository today is one of those templates, not a maintainer document. §2 states this exclusion in full.

## 1. Boundary With `no-slop-writing.md` (Read First)

This repo already has one writing-quality standard: [`no-slop-writing.md`](../words/no-slop-writing.md). That standard is voice-**preserving**: it cuts AI-slop filler but keeps the brand's or the skill's own character. ASD-STE100 is voice-**flattening** instead: one meaning per word, active voice, simple tense, short sentences, no idiom, no character. Apply both standards to the same sentence and you get contradictory edits.

To avoid that collision, the two files split the repo's documentation by file, never by a vague genre label:

- `no-slop-writing.md` alone governs the repo's public front door: root `README.md`, `CONTRIBUTING.md`, `.github/SECURITY.md`, `.github/CODE_OF_CONDUCT.md`, root `AGENTS.md`, and root `CLAUDE.md`. `no-slop-writing.md` §2 calls this set the "third surface," and `check:no-slop` enforces it. Do not apply ASD-STE100 to these six files.
- This file alone governs the technical documentation named in the trigger paragraph above.
- Founder-facing copy, marketing copy, and brand voice stay with `no-slop-writing.md` and its channel-specific sections. Never apply ASD-STE100 there: it does not cover text where voice, nuance, or persuasion is the point.

Some documents straddle both standards — for example, a `README.md` with a narrative introduction and a technical API section. Apply `no-slop-writing.md` to the narrative part and this file to the technical part. `no-slop-writing.md` §8 uses the same split for legally required text inside persuasive copy.

## 2. Scope

This file governs technical, procedural, and reference documentation authored inside this repository:

- Architecture docs and validator or gate references
- This skill's own knowledge base
- A maintainer-authored engineering spec inside this repository
- ADRs and runbooks
- API or config references

This file does not extend to documentation the skill generates for a launched business. Three exclusions: the `examples/workspace/business/engineering/{TECH_SPEC,ENGINEERING_PLAN,PRODUCTION_READINESS}.md` templates, their `workspace-template/` counterparts, and a launched business's own `AGENTS.md` or `CLAUDE.md`. That is a separate, later decision, not covered here.

## 3. Core Rewrite Rules

Full rule set and worked examples: the `asd-ste100` skill (`~/.claude/skills/asd-ste100/SKILL.md` on a maintainer machine). This table is the condensed version for day-to-day drafting.

| Rule                         | Do                                                                        | Don't                                                                          |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| One word, one meaning        | Pick one verb for one action and reuse it every time                      | Rotate synonyms for the same idea ("check" / "verify" / "confirm")             |
| Active voice                 | "The gate blocks the merge."                                              | "The merge is blocked (by the gate)."                                          |
| Simple tenses only           | "The validator read the file."                                            | "The validator has read the file."                                             |
| One instruction per sentence | "Open the file. Read line 3."                                             | "Open the file and read line 3, then check if it matches."                     |
| Sentence length              | Keep instructions and procedures at 20 words or fewer                     | Long compound or subordinate-clause sentences                                  |
| Noun clusters                | 3 words or fewer stacked as a noun phrase                                 | 4 or more words stacked ("catalog reference graph node loadWhen trigger text") |
| No ellipsis                  | Keep the subject, verb, and article explicit                              | Drop words to save space                                                       |
| Lists for sequences          | Use a numbered or bulleted list for 3 or more steps                       | Bury a sequence inside one prose sentence                                      |
| Domain terms                 | Keep necessary technical nouns, but define an unfamiliar one on first use | Use jargon without ever defining it                                            |

## 4. Self-Check Before Committing

- Does every sentence have one reading, not two?
- Does every verb use active voice and a simple tense?
- Is every instruction sentence 20 words or fewer?
- Would a reader outside this repo's context still parse each sentence correctly on the first read?
- Did the edit keep every fact, condition, and scope qualifier from the original, with no silently dropped precision?

A rewrite can drop required precision: a safety condition, a scope qualifier, a number. When that risk appears, keep the longer phrasing instead and note why nearby. Do not cut precision just to hit the word count.

## 5. What This Does Not Govern

- Founder-facing copy, marketing copy, and brand voice — `no-slop-writing.md`.
- The repo's public front door (root `README.md`/`CONTRIBUTING.md`/`.github/SECURITY.md`/`.github/CODE_OF_CONDUCT.md`/`AGENTS.md`/`CLAUDE.md`) — `no-slop-writing.md` §2.
- Code comments — normal engineering documentation standards, per `no-slop-writing.md` §8.
- Legally required text (privacy policy, terms, disclosures) — `privacy-terms.md`.

## 6. Enforcement Status

Every workflow node with a `loadWhen` that covers §2's files loads this file before drafting. A second layer sits on top: `check:documentation-ste100` (`checks/validation/business/engineering/check-technical-docs-ste100.ts`). This script checks two rules from §3 by machine, without judgment. Rule one: sentence length. Rule two: present-perfect tense, a `has`, `have`, or `had` plus a past-participle shape.

The checker cannot tell an instruction sentence from a reference sentence. So it applies §3's 20-word ceiling to every sentence in a governed file, not only to instructions and procedures. That is a stricter, blanket version of the authored rule, never a looser one. The other rules in §3 stay judgment-only: one word per meaning, active voice, and noun-cluster length. `no-slop-rules.ts` documents the same limit for the sibling standard, for the same reason. A regex would punish good writing as often as it catches bad writing.

The gate runs at two tiers, the same split `check-no-slop.ts` uses for its own front door.

- **Error** tier applies today to one file only: this reference, the one file it can currently guarantee compliant.
- **Warning** tier applies to the rest of the governed surface: `docs/architecture.md`, `docs/validators.md`, and every `knowledge/**/*.md` file outside `knowledge/words/`. That directory keeps `no-slop-writing.md`'s voice-preserving register instead.

An edit anywhere in scope gets real, visible signal. The build does not fail over prose written before this standard existed.

To promote a file from warning to error tier, audit it against §3 and §4 first. Then add the file to the validator's error-tier list. `check-no-slop.ts`'s own history used the same one-file-at-a-time promotion path.
