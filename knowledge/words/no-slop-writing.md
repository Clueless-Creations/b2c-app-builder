# No-Slop Writing And Marketing Copy

Use this before writing or reviewing any founder-facing copy this skill produces (session updates, gate prompts, docs a founder reads) and before writing or reviewing any marketing copy this skill generates for a launched business: App Store/Play descriptions, keywords, screenshot captions, landing page copy, paywall copy, onboarding copy, lifecycle email, launch announcement posts, ad headlines and primary text, UGC scripts, and GEO/SEO metadata.

This reference adapts the rules from [`petergyang/no-ai-slop`](https://github.com/petergyang/no-ai-slop) (MIT licensed). Sections marked **Adapted** port that skill's word lists, phrase lists, patterns, and eval checks with minimal changes for this skill's dual audience. Sections marked **Original** — the voice-preservation framing for brand copy and the channel-specific limits — are not in the source skill and were written for this repo.

## Contents

- 1. Voice Preservation Rule (read first)
- 2. Two Audiences, One Standard
- 3. Editing Principles — Adapted
- 4. Banned Words And Phrases — Adapted
- 5. Patterns To Cut — Adapted
- 6. Self-Check Before Shipping Copy — Adapted
- 7. Channel-Specific Limits — Original
- 8. What This Does Not Govern — Original
- 9. Original: Builder House Style

## 1. Voice Preservation Rule (Read First)

These rules remove slop. They do not remove character. Before cutting a single word, know the voice you are protecting:

- For founder-facing copy, the voice is this skill's own: direct, concrete, no filler, no false cheer about a gate the founder still has to clear. Repository documentation, CLI help, issues, pull requests, reviews, progress reports, and handoffs use section 9.
- For marketing copy generated for a launched business, the voice comes from that business's `strategy/BRAND.md` and the tone set in `11_STAR_EXPERIENCE.md` — not from this file, and not from generic "clean marketing English." A playful app's onboarding copy should still sound playful after editing. A clinical, no-nonsense utility's paywall copy should still sound clinical. If `strategy/BRAND.md` calls for short punchy fragments, an occasional rhetorical question, or a specific slang register, that voice wins over the general preference for complete sentences below.

Brand voice sets the target. This file's job is removing what an AI defaults to when nobody set a target: filler, hedging, importance-inflation, and formatting tics. Make the minimum effective edit — fix the slop, keep everything that sounds like the brand actually talking. A rewrite that reads as generically "clean" or "professional" instead of like the brand has over-corrected and needs to be walked back.

## 2. Two Audiences, One Standard

1. **The skill's own founder-facing copy.** Session digests and handoffs, gate prompts under `founder-zero-operator.md`, and any doc a founder reads to make a decision. A founder-zero user is often reading this at 11pm, tired, deciding whether to approve something. Every filler word costs them attention they do not have.
2. **All marketing copy generated for a launched business.** Store metadata, screenshots, landing/funnel copy, paywall/onboarding copy, lifecycle email, launch posts, ad creative, UGC scripts, GEO/SEO metadata. This copy also has to survive App Review, ASO keyword pressure, and character budgets — see section 7.

Run the same rules against both. The difference is whose voice you are protecting (this skill's own vs. the launched business's `strategy/BRAND.md`) and which channel limits apply.

There is a third surface the gate also covers: this repo's own public docs (`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` at error, `AGENTS.md` and `CLAUDE.md` at warning; `SECURITY.md` and `CODE_OF_CONDUCT.md` live under `.github/`, the standard GitHub community-health-file location). A skill that ships a writing standard and exempts its own front door from it is enforcing words rather than work. Same rules, same voice as founder-facing copy: direct, concrete, no filler.

## 3. Editing Principles — Adapted

- **Preserve the writer's real voice.** Notice the draft's vocabulary, cadence, bluntness, humor, and level of polish before touching it. Keep what is personal to the writer or the brand; do not make every line equally tidy.
- **Make the minimum effective edit.** Fix slop, errors, and unclear passages. Leave strong sentences alone.
- **Lead with the point when the setup adds nothing.** Cut generic throat-clearing; keep a real aside if it creates context or character.
- **Use the portability test.** A sentence is probably filler if it can move unchanged to another person, company, country, or product. Cut it or replace it with a fact, mechanism, consequence, or judgment that is specific to this subject.
- **Show the reason.** Do not tell the reader that a point is important, surprising, subtle, or obvious. Use facts and consequences to show why it matters.
- **Keep the meaning.** Never invent claims, stats, examples, or opinions the founder or the brand did not supply. If a claim needs a source and none exists, flag it instead of inventing one — this matters more in marketing copy, where an invented claim is also a store-policy or legal risk (see `geo-seo.md` §4 and `privacy-terms.md`).
- **Be concrete.** "The app helps you build better habits" becomes "The app tracks your streak and reminds you at 8pm." Names, numbers, and mechanisms beat abstractions.
- **Use active voice.** Human or brand subjects doing things, not abstractions doing human verbs.
- **Make verbs do the work.** "Has the ability to" becomes "can." "Made a decision" becomes "decided."
- **Untangle sentences without flattening cadence.** Split genuinely hard-to-follow sentences. Keep short punchy fragments and spoken rhythm when the brand voice calls for them.
- **Cut empty qualifiers, keep real ones.** "I think," "maybe," or a hedge earns its place when it expresses real uncertainty — a beta-feature label, a "results vary" disclosure — not when it is a verbal tic.

## 4. Banned Words And Phrases — Adapted

Reproduced in full from the source skill so the validator built against this file has a complete list to check.

**Banned outright** (do not use in founder copy or marketing copy, except when quoting a competitor or user verbatim):

delve, foster, leverage, utilize, facilitate, empower, streamline, robust, cutting-edge, paradigm shift, game changer, this is huge, this changes everything, tapestry, realm, beacon, multifaceted, meticulous, intricate, paramount, transformative, elevate, embark, supercharge, harness, ever-evolving

**Often-empty adverbs** — cut when they add nothing, keep when they carry real emphasis or the brand's spoken rhythm:

just, literally, honestly, simply, actually, truly, fundamentally, importantly, crucially, inherently, inevitably

**Often-empty phrases** — cut when they delay the point, keep an occasional one only when it is part of a recognizable voice and the sentence still earns its place:

it's worth noting, it's important to note, at the end of the day, when it comes to, at its core, in today's world, in the age of, in the world of, the reality is, the truth is, in terms of, with regard to, in order to, going forward, in this article, let's dive in

## 5. Patterns To Cut — Adapted

Reproduced in full. Each pattern below is banned outright in App Store/Play copy, ad headlines, and push/email subject lines (no room to earn its place); in longer copy — landing pages, lifecycle email bodies, launch posts — cut it unless it is doing real work.

- **Binary contrasts.** "This is not X. It's Y." State Y directly.
- **Throat-clearing openers.** "Here's the thing," "I'll be honest," "Let me be clear." Cut and state the point.
- **Faux-insight setups.** "What most people get wrong," "here's what nobody tells you." Make the claim stand alone.
- **Colon reveals.** A noun phrase, a colon, a lowercase dramatic reveal. Rewrite as a plain sentence. Colons stay fine for lists, labels, and quotes.
- **Superficial analysis.** Trailing "-ing" clauses that gesture at meaning without stating it: "highlighting," "underscoring," "reflecting." State the actual mechanism or benefit instead.
- **Importance puffery.** "Stands as a testament," "marks a pivotal moment," "solidifies its position." State the fact; let the reader judge whether it matters.
- **Interpretive metadiscourse.** "The key point is," "as you can see," "this distinction matters," and similar asides tell the reader how to interpret the text. Delete the aside when the point is clear. Otherwise, replace it with a fact or consequence.
- **Weasel attribution.** "Experts agree," "studies show," "many argue." Name the source or cut the claim — in marketing copy this is also a substantiation risk (see `geo-seo.md` §4).
- **Fake-strong verbs.** Prefer "is" and "has" when clearer. "Serves as a centralized hub for" becomes a plain description of what it does.
- **Synonym cycling.** Repeat the clear word instead of rotating "app / tool / assistant / platform" for style.
- **Negative listing.** "Not a X. Not a Y. A Z." Just say Z.
- **Dramatic fragmentation.** "X. And Y. And Z." Use complete sentences unless the brand's voice is genuinely fragment-driven.
- **Robotic rhythm.** Repeated sentence shapes, identical paragraph structures, stacked punchy fragments. Vary shape only where it helps.
- **Rhetorical setups.** "What if I told you...", "Think about it:", self-answered "Question? Answer." pairs. Drop and make the point.
- **Fake-profound kickers.** A cute metaphor or mic-drop closing line. Delete it; end on the clearest concrete sentence already in the draft, or a plain next action.
- **Summary-recap endings.** "In conclusion," "Ultimately," a paragraph restating the piece. End on the last concrete point or next action instead.
- **Formatting slop.** Emoji in headings, bold sprinkled mid-sentence for emphasis, bullets where two sentences of prose would read better, headers over two-sentence sections.
- **Em-dash overuse.** No default rhythm crutch. In short copy (store fields, ad headlines, subject lines, launch posts) use none. In longer copy, one or two are fine only when they clearly beat commas or periods. Remove clusters.

## 6. Self-Check Before Shipping Copy — Adapted

Run this before marking any founder-facing doc or generated marketing copy ready. If any check fails, fix it and check again — do not ship on a partial pass.

**Voice and meaning**

1. Does the copy preserve the founder's or brand's actual point, without adding claims, stats, or opinions nobody supplied?
2. Does it preserve the brand's distinctive vocabulary, cadence, and level of polish from `strategy/BRAND.md`/`11_STAR_EXPERIENCE.md` (or, for founder-facing copy, this skill's own direct tone) — not a flattened, generic-professional voice?
3. Does it leave strong lines alone instead of rewriting them for consistency?
4. Is the amount of cutting proportional to the actual slop found, with no over-compression that strips out character?
5. Does it use active voice with real subjects where possible?
6. Does each generic sentence pass the portability test, or did you replace it with a subject-specific fact, mechanism, consequence, or judgment?

**Words and patterns** 7. Are the banned-outright words, empty adverbs, and empty phrases from section 4 removed unless they add real emphasis or voice? 8. Are the patterns in section 5 — binary contrasts, throat-clearing openers, faux-insight setups, colon reveals, superficial analysis, importance puffery, interpretive metadiscourse, weasel attribution, fake-strong verbs, synonym cycling, negative listing, dramatic fragmentation, robotic rhythm, rhetorical setups, fake-profound kickers, summary-recap endings, formatting slop, em-dash overuse — cut or clearly earning their place? 9. Are unsupported claims either sourced, cut, or flagged as a founder decision rather than invented?

**Channel fit** 10. Does the copy fit its channel's character/byte budget (section 7) without the cut making it read as empty puffery instead of substance? 11. For store metadata, ad headlines, and subject lines specifically: is every word pulling weight, with importance-puffery patterns caught before the character limit forces an even worse cut later?

**Final read** 12. Would the founder, or the brand's own voice as defined in `strategy/BRAND.md`, recognize this as itself? 13. Would it sound natural read aloud to a sharp colleague — not like a press release? 14. Does the output include a short **What changed** note when this was an edit pass on existing copy, so the founder can see what moved?

## 7. Channel-Specific Limits — Original

The source skill edits essay-length drafts. This skill also ships copy into hard character and byte budgets, where slop is worse, not better — a wasted word in a 30-character App Store subtitle is a bigger loss than a wasted word in a landing-page paragraph, and formatting slop (emoji, decorative punctuation) eats characters a real word could use.

**App Store title, subtitle, and keywords.** Name and subtitle are 30-character fields (`store-console-workflow.md`); the keywords field is byte-limited — confirm the current byte count in `app-store-listing-prep.md` and official Apple docs before locking, do not assume a remembered number. At this length, throat-clearing patterns cannot occur — there is no room — but importance puffery and synonym cycling get worse: a 30-character field has no space for "the ultimate" or "your go-to" before the word that actually search-matches. Every token should be a keyword, a benefit, or the brand name; nothing else earns its place.

**Ad headlines and primary text.** Platform limits move — verify current specs in the `ad-creative` skill or the platform's own ad-manager docs before locking, rather than trusting a remembered character count. Regardless of the exact limit: lead with the concrete benefit or the hook, not a throat-clearing opener burning the first visible characters before a "see more" truncation. Weasel attribution ("proven results") and importance puffery are the most common ad-copy failures because they read as ad-speak the platform's own reviewers and users have learned to skip.

**Push notifications and lifecycle email subject lines.** These are read in a notification tray or inbox list, competing with everything else on the screen. Cut summary-recap framing and fake-profound kickers entirely — there is no room for a closing line, only the hook. Favor one concrete detail (a name, a number, a specific unlock) over a vague benefit claim. Match the send to `growth/EMAIL_OPS.md`'s brand-token mapping and the tone set in `11_STAR_EXPERIENCE.md` so a lifecycle email does not suddenly sound like a different brand than the app.

**Social launch posts.** This skill's own launch-narrative guardrails already forbid hashtags and emoji in launch and feature-launch post copy (`launch-narrative-cadence.md` — "No hashtags... No emojis carrying the message," §"The 2026 DO-NOT-DO list"). That is a stronger, platform-specific rule than the source skill's general formatting-slop pattern, and it stands: do not soften it back to "use emoji sparingly" for launch posts. The same file's feeling-first thesis (indictment → hopeful reframe → product, no link in the main post) already does the throat-clearing and colon-reveal work this file would otherwise flag — load `launch-narrative-cadence.md` for post structure, and use this file to catch banned words, empty phrases, and importance puffery inside that structure.

**Landing pages, paywall copy, onboarding copy.** No hard character budget, so the full pattern list in section 5 applies at essay-editing density. Cross-check against `geo-seo.md` §4 (the copy compliance pre-edit scan) for claims that are slop _and_ a policy/legal risk — puffery and weasel attribution are exactly the patterns most likely to produce an unsupported superiority or endorsement claim.

## 8. What This Does Not Govern — Original

This file governs voice and slop, not content that has to say something precise for legal, review, or engineering reasons:

- **Legally required text** — privacy policy, terms, EULA, subscription-disclosure language mandated by App Review or Play policy. Edit these for clarity within what `privacy-terms.md` and platform policy require, but do not cut a clause because it reads as "empty phrasing" if removing it breaks the legal requirement. When in doubt, flag it for `privacy-terms.md` review rather than editing it here.
- **Reviewer notes.** App Review / Play Console reviewer notes are functional instructions to a human reviewer, not marketing copy. Clarity and completeness matter more than voice; do not apply the brand-voice rule to them.
- **Code comments.** Out of scope entirely. Use normal engineering documentation standards.
- **Technical documentation.** Architecture docs, engineering specs, ADRs, runbooks, API/config references, and this skill's own `knowledge/*.md` files follow [`technical-documentation-ste100.md`](../engineering/technical-documentation-ste100.md) instead — a flat, literal, ASD-STE100-based standard, the opposite spirit of the voice-preservation rule above. That file's §1 names the public front door this file governs, including mixed README documents: narrative stays here; technical examples keep exact commands and identifiers. Do not send the same sentence through both automatic rewrites.
- **Builder house style.** Section 9 applies to repository agents writing docs, help, issues, pull requests, reviews, progress, and handoffs. It does not replace a customer's `strategy/BRAND.md`.

If a piece of copy straddles both — for example, a paywall screen that includes both persuasive copy and a legally required subscription-terms line — apply this file to the persuasive part and leave the required-disclosure part to `privacy-terms.md`.

## 9. Original: Builder House Style

Repository-original. This section is not in `petergyang/no-ai-slop`. Kitchen meanings live in the repository ethos Kitchen-language boundary. Do not copy that table here. Packaged business work uses this section only; it must not depend on repository-only docs.

Lead with the outcome, finding, or decision needed. Use short, active, concrete sentences. State what changed, what was checked, what remains uncertain, and the next action when relevant. Do not print an eight-state checklist after every small update. Use sentence-case headings. Prefer one established term to rotating synonyms for capability, operation, provider, implementation, binding, recipe, evidence, or acceptance.

Preserve useful personality in explanatory copy. Avoid chef role-play, compulsory greetings, slogans in failure messages, inflated promises, repeated applause, and claims that the output is clear instead of demonstrating it. Do not cut a safety condition, legal disclosure, uncertainty, or technical distinction to satisfy a style rule.

Allow the kitchen metaphor in explanatory prose, diagrams, and selected human-facing headings, with a literal description nearby when the heading would otherwise be ambiguous. Keep operation names, permission requests, errors, recovery, schemas, machine output, and approval or release actions literal. Do not rename an identifier because a new term sounds more thematic.

Use the actual evidence state. A created issue is not implemented code. A fixture pass is not provider execution. A merged pull request is not a deployment. A blocker names the affected action, the known cause, the missing decision or evidence, and what independent work can continue. If a timed-out mutation has an uncertain effect, say that and name the safe reconciliation step.

| Surface | Treatment |
| --- | --- |
| README narrative, ethos, product explanation | Preserve the builder's voice and useful kitchen metaphor |
| CLI help and console utility text | Literal action descriptions; optional approved themed group heading; disclose actual side effects |
| Errors, permissions, recovery, release decisions | Facts, consequence, next safe action |
| ADR, spec, runbook, API documentation | Technical register; exact identifiers |
| Agent progress, GitHub issue or pull request, review, handoff | Direct builder communication; evidence-backed status |
| Customer app copy and marketing | Accepted business brand, not the builder's restaurant identity |
| JSON, schemas, protocol payloads, code, verbatim notices | Do not rewrite; explain beside the literal material |

The public README is a mixed document. Narrative stays with this file. Command examples, flags, and schemas keep exact technical meaning. `check:no-slop` scans the named front-door files; it does not prove every agent message followed this section.

| Avoid | Prefer |
| --- | --- |
| `Your kitchen is ready to serve!` after installation checks | `Installation checks passed. Provider access and product acceptance have not been verified.` |
| `The plate is stuck at the pass.` | `The purchase succeeded. Entitlement verification failed. Resume verification without repeating the purchase.` |
| `RevenueCat integration is complete.` when only fixtures passed | `The adapter passed its fixture tests. An authorized RevenueCat test is still required.` |
| `Shipped!` when the issue was only created | `Created the implementation issue. No code changed.` |
| `Send it out` as a production approval button | `Approve production deployment` |
| Repeated `Preparing / refining / completing` updates with no state change | Name the changed file, completed check, concrete finding, or hold |
| Rewriting `doctor.node_too_old` to `inspection.oven_cold` | Keep the error identifier; explain it in plain prose |
| Flattening `results vary; this is not medical advice` | Keep the uncertainty qualifier and the required legal line |
| Replacing a playful onboarding line with kitchen brigade copy | Keep the accepted customer voice |

`Let your agents cook.` may stay in product explanation when it serves that explanation. Do not ban kitchen words. Do not invent culinary synonyms for each new feature.
