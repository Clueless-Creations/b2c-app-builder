# Conversion Copywriting, App Copy, And Localization Readiness

Use this before writing or editing any words a user reads. That is two jobs with one voice:

1. **Conversion-critical words** — landing hero/subhead/CTA, App Store title/subtitle/keywords/description/promo text, paywall headline and plan copy, onboarding question and value-reveal strings, push/email subject and body, screenshot captions, and ad hooks.
2. **Every other user-facing string in the app** — buttons, tab labels, empty states, errors, permission primes, confirmation dialogs, loading and success moments, settings, tooltips. These are where internal vocabulary leaks: a builder with no authored copy fills the screen from the spec, and the user reads the plan instead of the product.

Copy is the one input shared by almost every B2C surface, so it gets a craft contract instead of being improvised per screen. The words are authored in `product/copy/COPY_DECK.md` before they are typed into code; builders consume the deck, they do not invent strings.

This reference governs the _words_. Load [`consumer-copy-benchmarks.md`](./consumer-copy-benchmarks.md) for the live-site evidence layer — what shipping consumer apps actually say on these surfaces, the internal-voice tells, and the Voice benchmarks contract the brief carries. Load [`cro-landing.md`](../growth/cro-landing.md) for landing-page _structure_ (above-the-fold layout, CTA hierarchy, trust blocks, friction audit). Load [`onboarding-conversion.md`](../experience/onboarding-conversion.md) for in-app flow sequencing and paywall timing, [`aso-store-ops.md`](../store/aso-store-ops.md) and [`app-store-listing-prep.md`](../store/app-store-listing-prep.md) for store-field character limits and metadata rules, [`resend-email-ops.md`](../operations/resend-email-ops.md) for lifecycle email mechanics, [`geo-seo.md`](../growth/geo-seo.md) before editing any public page copy, and [`emotional-design-system.md`](../experience/emotional-design-system.md) when copy carries an Experience Card moment. Do not duplicate those contracts here; this file decides whether the sentence converts.

> Adapted from Corey Haines' marketingskills (`https://github.com/coreyhaines31/marketingskills`, MIT License, © Corey Haines 2025): the conversion-copy craft, voice-of-customer mining, and copy-QA discipline. Reframed for B2C mobile surfaces and wired into this skill's artifact/traceability contracts.

## Contents

- Sources To Refresh
- Required Artifacts
- Voice-Of-Customer Mining
- Copy Craft Rules
- Surface Recipes
- The Copy Deck (All User-Facing Strings)
- App Surface Recipes
- Banned In App Copy (Machine-Parsed)
- Localization Readiness
- Copy QA Checklist
- Analytics Events
- Gates Before Handoff

## Sources To Refresh

Refresh current craft and platform-constraint sources before locking copy:

- Corey Haines marketingskills `copywriting` and `copy-editing` skills (MIT): `https://github.com/coreyhaines31/marketingskills`
- Apple App Store product page character limits and editorial guidelines: `https://developer.apple.com/app-store/product-page/`
- Apple App Store Review Guidelines (metadata, claims, pricing language): `https://developer.apple.com/app-store/review/guidelines/`
- Google Play listing policy and metadata rules: `https://support.google.com/googleplay/android-developer/answer/9859455`
- Apple HIG writing guidance (in-app voice, dialogs, errors): `https://developer.apple.com/design/human-interface-guidelines/writing`
- Material 3 writing guidance (Android in-app voice; mandates sentence case): `https://m3.material.io/foundations/content-design/style-guide`
- Xcode String Catalogs (`.xcstrings`) for iOS string externalization: `https://developer.apple.com/documentation/xcode/localizing-and-varying-text-with-a-string-catalog`
- Expo localization guidance (RN string externalization with `expo-localization` + i18next): `https://docs.expo.dev/guides/localization/`
- Flutter i18n (ARB + `gen-l10n`): `https://docs.flutter.dev/ui/internationalization`
- The project's own `strategy/RESEARCH.md` review-mining and `11_STAR_EXPERIENCE.md` north-star language as the primary voice-of-customer source (prefer real user words over invented ones)
- 60fps.design shot library for how premium consumer apps actually phrase these moments (see the pattern citations in App Surface Recipes)

## Required Artifacts

Two artifacts, two layers:

- **`product/copy/COPY_BRIEF.md`** — the promise and the voice. Create or update it when a launch ships any landing page, App Store listing, paywall, lifecycle email, or onboarding copy that conversion depends on. It is the single source of truth for the product's message, so the same promise appears on every surface. Start from [`business/product/copy/COPY_BRIEF.md`](../../examples/workspace/business/product/copy/COPY_BRIEF.md).
- **`product/copy/COPY_DECK.md`** — every user-facing string, authored screen by screen before the build consumes it. The deck is the bridge between the brief and the code: keys in the deck become the app's localization keys. Start from [`business/product/copy/COPY_DECK.md`](../../examples/workspace/business/product/copy/COPY_DECK.md); the contract lives in The Copy Deck section below. `check:app-copy` gates it.

Load [`flow-traceability.md`](../process/flow-traceability.md) before locking copy: every headline claim must trace to evidence in `strategy/RESEARCH.md` or `11_STAR_EXPERIENCE.md`, not to taste. Load [`analytics-attribution.md`](../data/analytics-attribution.md) before naming copy-test events so variants implement the approved catalog. Load [`change-cascade.md`](../process/change-cascade.md) whenever a core promise, name, or price changes — copy lives on many surfaces and must be reconciled, not patched on one screen.

`product/copy/COPY_BRIEF.md` must include:

- the one-sentence value proposition (the promise the whole product makes) traced to evidence
- the message hierarchy: primary promise, 2-3 supporting benefits, the proof for each
- voice and tone rules (3-5 lines): reading level, person/POV, words to use, words banned
- voice benchmarks: 2-3 named live consumer apps whose current voice this product borrows from (with the borrowed attributes and a teardown date) plus one anti-benchmark to reject — the method and cohorts live in [`consumer-copy-benchmarks.md`](./consumer-copy-benchmarks.md)
- the voice-of-customer phrase bank: exact words from reviews/interviews to mirror back
- per-surface copy blocks (landing hero, ASO fields, paywall, key emails, onboarding value-reveal, screenshot captions) with the variant under test marked
- the claims ledger: every quantified or comparative claim and its substantiation (or a note that it is removed)

## Voice-Of-Customer Mining

The strongest conversion copy is not written — it is found. Mine the words real users already use:

- pull verbatim phrases from App Store/Play reviews of the product and 2-3 competitors (their words for the problem, the relief, the objection)
- pull from any interview notes, support threads, or social-language research already in `strategy/RESEARCH.md`
- cluster phrases into: the problem in their words, the desired outcome in their words, the objection/risk in their words
- write headlines and CTAs from that bank. Mirroring the user's own language outperforms clever copy because it resolves the "this is for me" question instantly.

## Copy Craft Rules

- **Lead with the outcome, not the feature.** The user buys the after-state. Name it concretely.
- **Specific beats clever.** A concrete number, timeframe, or named outcome converts better than a pun. Cut adjectives that survive deletion without changing meaning.
- **One idea per block.** A headline makes one promise; a CTA asks for one action. Stacked promises dilute.
- **Match message to awareness.** Cold traffic needs the problem named; warm traffic needs the differentiator; ready traffic needs the offer. Do not pitch the offer to someone who does not yet feel the problem.
- **Earn every claim.** Every quantified, comparative, health, earnings, or urgency claim is a liability — substantiate it in the claims ledger or remove it. This is a hard line, not a style note (see [`privacy-terms.md`](../trust/privacy-terms.md) and the skill's public-claims posture).
- **Write the CTA as a verb the user wants to take**, describing the value received, not the system action ("Get my plan", not "Submit").
- **Read it aloud.** If it sounds like a brochure, it will read like one. Cut to the spoken version.

## Surface Recipes

- **Landing hero:** outcome headline (user's words) → one-line subhead naming who it is for and the differentiator → single primary CTA → one proof element near the fold. Structure and placement live in [`cro-landing.md`](../growth/cro-landing.md).
- **App Store:** title carries the brand + primary value; subtitle carries the differentiator and a keyword; first 1-2 description lines carry the promise (most users never tap "more"). Honor field limits from [`aso-store-ops.md`](../store/aso-store-ops.md); never keyword-stuff at the cost of readability.
- **Paywall:** restate the value the user just felt (tie to the emotional peak), make the plan choice obvious, name what they get — not what they pay. Timing belongs to [`onboarding-conversion.md`](../experience/onboarding-conversion.md).
- **Lifecycle email:** subject earns the open with curiosity or value; first line delivers it; one CTA. Mechanics belong to [`resend-email-ops.md`](../operations/resend-email-ops.md).
- **Screenshot captions:** each caption sells one benefit in 3-5 words; the sequence tells the value story. Production belongs to [`app-store-listing-prep.md`](../store/app-store-listing-prep.md).

## The Copy Deck (All User-Facing Strings)

`product/copy/COPY_DECK.md` carries the final words for every screen and moment, keyed so the same entry drives the code and the translations. Builders read the deck and type its strings; a builder who reaches a screen with no deck row stops and authors the row first (voice from `product/copy/COPY_BRIEF.md` and `strategy/BRAND.md`), rather than improvising a label from the spec.

Deck rules:

- **One row per string.** `| key | screen / moment | copy (source language) | voice notes | locale tier |`. The copy cell holds the exact words that ship. A literal pipe in copy is escaped (`\|`); a row that does not parse into five cells is an error, never a silent skip.
- **Keys are localization keys.** Lowercase dot-namespaced (`onboarding.promise.headline`, `paywall.cta`, `errors.network.body`), and unique — string resources keep one value per key, so a duplicate silently overwrites another row's copy. The key in the deck is the key in the string resource — one name from author to translator. Where the format rejects dots in identifiers (ARB names must be Dart members for `gen-l10n`; Android `strings.xml` names), apply one mechanical, reversible transform — dots become underscores (`onboarding.promise.headline` → `onboarding_promise_headline`) — and record it in `engineering/TECH_SPEC.md`; the deck key stays canonical.
- **Coverage is reconciled, not assumed.** Every deck-key prefix the `product/ONBOARDING.md` screen table names (`onboarding.promise.*`, `paywall.*`, …) must resolve to authored rows — a one-row deck wearing an authored status fails `check:app-copy`. References follow the same lowercase key shape; a mistyped reference and a screen-table row whose cells shifted are errors, not silent skips.
- **Sections follow surfaces**, at minimum: onboarding (every screen in the `product/ONBOARDING.md` sequence, permission primes included), paywall, core loop, empty states, errors, settings and dialogs. Keep those canonical section headings so `check:app-copy` can hold the set; a surface this product genuinely lacks keeps its heading with one line — `Not applicable — <reason>` — instead of rows. Push and email copy live in their own artifacts (`operations/POST_LAUNCH_OPS.md`, `growth/EMAIL_OPS.md`) — the deck may point there, not duplicate.
- **Locale tier per row** from `LOCALIZATION_MARKET_RESEARCH.md`: `1` ships translated at launch, `2` ships source-language, `3` deferred. Tier decisions belong to that reference; the deck records them.
- **Brand terms are declared, not smuggled.** Words the product owns that could look like violations (a coined feature name, a stylized lowercase brand) go under the deck's `**Allowed terms**` list so `check:app-copy` can tell voice from leakage.
- **The deck is spec-blind.** Spec vocabulary, schema identifiers, lane/gate/phase words, and placeholder filler never appear in a copy cell — see Banned In App Copy. A deck cell that says "Product-specific value promise" is an unfilled deck, and `check:app-copy` fails it.
- **Change cascade applies.** A promise, name, or price change reconciles through [`change-cascade.md`](../process/change-cascade.md); the deck is one of the surfaces the cascade must touch.

## App Surface Recipes

How premium consumer apps phrase these moments, mined from the 60fps.design shot library (shot slugs cited so the source stays checkable). Write to the formula, then re-voice per `product/copy/COPY_BRIEF.md`.

- **CTA = verb + what the user gets.** "Allow Location", "Try three days for free", "Get my plan" — never "Submit", "Continue" alone when the tap has a consequence worth naming (`sesame-allow-location-permission-pulse-animation`, `whistle-value-prop-animation`).
- **Onboarding headline claims agency for the user.** Verb + possessive: "Experiment your way" — the app adapts to them, not the reverse (`easlo-experiments-onboarding`).
- **Permission prime = the benefit first, then the OS dialog.** "Stay on track" before the notification alert; the system prompt fires only from an affirmative tap on the prime screen (`duolingo-allow-notifications-sheet`; timing contract in [`push-notification-lifecycle.md`](../experience/push-notification-lifecycle.md)).
- **Empty state = name it, reframe it, point at the next tap.** "Empty." / "But so full of possibilities." plus a cue aimed at the exact control that fills it (`riveo-projects-empty-state`).
- **Error = what happened + why + what to do next.** Never blame the user, never show a code or identifier. "Couldn't save your entry — you're offline. It will retry when you're back."
- **Loading = conversational narration; success = spoken-out-loud confirmation.** "setting things up", then "all done!" — not "Processing request" / "Operation complete" (`push-setup-to-pricing-sheet`).
- **Destructive dialogs name the consequence on the button.** "Delete 3 entries", not "OK". The neutral option stays neutral: "Cancel", "Not now" — no shame copy, per [`ethics-guardrail.md`](../experience/ethics-guardrail.md) (`carrot-pricing`).
- **Plan names are identities, not commodity tiers.** "Peak" / "Plus" / "The everyday package" — the user self-selects by identity, not by feature count (`alltrails-plan-selection-interaction`, `amie-pricing`).
- **Milestones celebrate briefly, then point forward.** Big number as the hero, one forward CTA — momentum over dwelling (`duolingo-14-day-streak-goal-checkpoint-reveal-animation`).
- **Capitalization is a consistency contract, not a universal rule.** Apple says pick title case or sentence case and hold it; Material mandates sentence case. Choose per platform convention, record the choice in `product/copy/COPY_BRIEF.md`, and never mix within a surface. `check:app-copy` warns on mixing; it never hard-fails case, because the platforms genuinely disagree.
- **Second person, present tense, one reading level.** The app talks to "you" like a person who respects your time. If a string sounds like a system explaining itself, rewrite it as a person helping.

## Banned In App Copy (Machine-Parsed)

`check:app-copy` parses the two lists below from this file — edit the reference and the gate follows; do not duplicate them in code. Identifier shapes (snake_case, SCREAMING_SNAKE, pipe-delimited state) are detected structurally by the gate itself, same as `check:founder-copy`.

**Banned in app copy** (internal vocabulary that must never reach a user's screen; whole-word, case-insensitive; three families — this skill's own nouns, product-org/growth jargon, and raw system-state vocabulary; evidence for the second and third families in [`consumer-copy-benchmarks.md`](./consumer-copy-benchmarks.md))
lane, gate, phase, artifact, archetype, scaffold, prompt pack, value reveal, value-reveal, spec, backlog, milestone gate, launch lane, frontstage, backstage, attribution question, personalization matrix, state file, project state, autonomy mode, founder approval, activation, retention, engagement, funnel, cohort, persona, user journey, value prop, north star, growth loop, flywheel, roadmap, sprint, deliverable, edge case, happy path, mvp, cta, user, submit, configure, invalid, error occurred, sync failed, operation failed, request failed, timed out, session expired, unauthorized, click here, unlock premium features, paywall, onboarding

**Placeholder shapes** (filler that means the deck row was never authored; substring, case-insensitive; `fernpath`, `wrenfeed`, `loomroom`, and `glimmerjar` are the fictional example brands in the deck template and archetype starters, so their survival means example copy shipped verbatim)
product-specific, tbd, todo, to be filled, lorem ipsum, placeholder, insert copy, your headline here, app name here, archetype scaffold, runnable starter, customize it with the prompt, fernpath, wrenfeed, loomroom, glimmerjar

Say instead: the human sentence the moment needs, authored in the deck. The second family (growth jargon: "activation", "funnel", "user journey") describes how the team measures the product, never what the user is doing — no major style guide treats any of it as user-facing vocabulary. The third family (system state: "invalid", "sync failed", "session expired", "unauthorized") narrates the machine's internals; translate to what happened and what to do next ("You've been signed out. Sign back in to continue."). "User" is "you" or the person's name; "submit" is the specific verb ("Send", "Post", "Save"); "unlock premium features" and "paywall" name the access flag, not the outcome — name what they get ("Go ad-free and download episodes offline"). If a banned term is genuinely part of the product's own voice (an app about racing "lanes", a fantasy-sports "MVP" vote, a wedding app's "engagement"), declare it under `**Allowed terms**` in `product/copy/COPY_DECK.md` with a one-line reason — the gate honors deck-local allowlists, mirroring `check:founder-copy`.

## Localization Readiness

Localize-ready is an engineering property decided on day one, not a retrofit. Which locales ship is [`localization-market-research.md`](../research/localization-market-research.md)'s call; this section makes the app able to ship them.

- **Every user-facing string is externalized from the first commit.** iOS: String Catalogs (`.xcstrings`). Native Android: `res/values/strings.xml` with per-locale `values-*` folders. React Native/Expo: `expo-localization` + i18next resources. Flutter: ARB + `gen-l10n`. Next.js landing/web: a typed strings module or `next-intl` messages. Deck keys are the resource keys. `engineering/TECH_SPEC.md` records ONE concrete choice for the stack — leaving the template's option menu untouched fails `check:app-copy`.
- **No sentence assembly by concatenation.** A translated language will reorder the sentence; use full-sentence templates with named interpolations (`"You've logged {count} days"`), never `"You've logged " + count`.
- **Plurals and gender go through ICU MessageFormat** (or the platform's plural rules: `.xcstrings` variants, ARB plurals, i18next plural keys) — English's two forms are the exception, not the rule.
- **Dates, numbers, and prices format through locale APIs**, never hand-built strings. Paywall prices come from StoreKit/RevenueCat locale-formatted values.
- **No text baked into images.** A screenshot caption or hero word rendered into a PNG cannot be translated; keep text in the text layer.
- **RTL is a layout decision made early**: leading/trailing instead of left/right, mirrored navigation, tested once with an RTL pseudo-locale even when no RTL market is in Tier 1.
- **Pseudo-localization pass before store submission.** Run the app once in a length-doubling pseudo-locale (Xcode Double-Length Pseudolanguage; Android `en-XA`/`ar-XB`) and fix truncation and clipped layouts.
- **String freeze before submission.** Lock the deck's source copy before store screenshots and translations start; late edits reconcile through [`change-cascade.md`](../process/change-cascade.md), not ad-hoc patches.

## Analytics Events

When copy is under test, declare events in `analytics/ANALYTICS.md` first (do not invent here):

- `copy_variant_viewed` (surface, variant_id)
- `copy_cta_clicked` (surface, variant_id)
- downstream conversion event already owned by the surface's funnel (install, trial_start, purchase)
  Tie any A/B copy test to the experiment discipline in [`analytics-attribution.md`](../data/analytics-attribution.md) — a copy test is still an experiment and needs a hypothesis, sample size, and stop rule.

## Copy QA Checklist

Before copy is called ready:

- the value proposition is one sentence and traces to evidence
- the same primary promise appears on landing, store, and paywall (no drift)
- every claim is in the claims ledger with substantiation or removed
- headlines use voice-of-customer language, not invented jargon
- each CTA is a single value-named verb
- reading level and tone match the `product/copy/COPY_BRIEF.md` rules
- every screen in the build has its strings in `product/copy/COPY_DECK.md` — no string invented at the keyboard
- deck copy cells carry no banned internal vocabulary, placeholder shapes, or raw identifiers (`check:app-copy`)
- read the deck aloud surface by surface: anything that sounds like a system explaining itself gets rewritten as a person helping
- capitalization follows the one case system recorded in `product/copy/COPY_BRIEF.md`
- store fields respect platform character limits and policy
- public-page copy was routed through [`geo-seo.md`](../growth/geo-seo.md) before the edit

## Gates Before Handoff

- `product/copy/COPY_BRIEF.md` exists for any launch with a landing page, store listing, paywall, or lifecycle email — and is authored (its own status set, not the shipped template) before the design/onboarding lane is done, because the deck inherits its voice from the brief
- `product/copy/COPY_DECK.md` exists and covers every screen before the build starts; `npm run check:app-copy` passes (deck coverage, banned vocabulary, placeholder shapes, identifier shapes; the same requirements apply after launch)
- the build plan names the string-externalization mechanism (Localization Readiness above) and `engineering/TECH_SPEC.md` carries it
- claims ledger has no unsubstantiated quantified/comparative/health/earnings claim
- the primary promise is reconciled across surfaces via [`change-cascade.md`](../process/change-cascade.md)
- any copy test is registered as an experiment with a hypothesis and stop rule
- `state/LAUNCH_TRACE.md` links the copy promise back to its evidence
