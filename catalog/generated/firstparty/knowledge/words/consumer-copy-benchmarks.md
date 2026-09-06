# Consumer Copy Benchmarks: The Live-Site Swipe-File

What good consumer marketing and app copy actually looks like, distilled from a structured teardown of fifteen live consumer app surfaces (2026-08-17): wellness/habit (Headspace, Calm, Duolingo, Strava, Fabulous), newer consumer/social (Partiful, BeReal, Locket, Retro, Flighty), and utility/fintech (Cash App, Copilot Money, Monarch, 1Password, AllTrails), plus their current App Store listings and the documented paywall/onboarding case studies at growth.design. This is the words-lane counterpart to [`../design/motion-craft-benchmarks.md`](../design/motion-craft-benchmarks.md): an inspiration benchmark distilled into checkable rules, never a source to clone.

Load it whenever a surface a user reads is being authored or reviewed — landing, store listing, screenshot captions, paywall, onboarding, lifecycle email, share/referral text — and when the product's voice is being established in `product/copy/COPY_BRIEF.md` and `strategy/BRAND.md`. The stable craft contract stays in [`conversion-copy.md`](./conversion-copy.md); this file is the evidence layer under it, refreshed on the source cadence in its manifest so the exemplars track what shipping consumer apps actually say.

Two ground rules:

- **Patterns, not clones.** Verbatim lines below are cited for study. Never reuse a benchmark brand's headline, name, or voice; derive this product's own words from its own voice-of-customer bank (`conversion-copy.md` §Voice-Of-Customer Mining).
- **Rules are review criteria, not adjectives.** Each pattern states something a reviewer can check on the page. "Sounds consumer-grade" does not gate; "the headline's grammatical subject is the user or the outcome, not the system" does.

## Contents

- Sources To Refresh
- The Consumer Register
- Cohort Notes
- Store Listing Rules
- Onboarding And Paywall Rules
- The Internal-Voice Tells (Review Layer)
- Voice Benchmarks In The Copy Brief
- Gates

## Sources To Refresh

Re-tear down these surfaces on the manifest cadence; update exemplars and, when a new tell earns hard-ban confidence, promote it into `conversion-copy.md` §Banned In App Copy so `check:app-copy` follows:

- Wellness/habit cohort: `https://www.headspace.com`, `https://www.calm.com`, `https://www.duolingo.com`, `https://www.strava.com`, `https://www.thefabulous.co`
- Consumer/social cohort: `https://partiful.com`, `https://bereal.com`, `https://locket.camera`, `https://retro.app`, `https://flighty.com`
- Utility/fintech cohort: `https://cash.app`, `https://copilot.money`, `https://www.monarch.com`, `https://1password.com`, `https://www.alltrails.com`
- Store-listing exemplars beyond the cohorts: `https://flo.health` (Flo's listing grounds the description-opening rule)
- Onboarding/paywall teardowns: `https://growth.design/case-studies`
- In-app writing standards (already carried by `conversion-copy.md`'s manifest): Apple HIG Writing, Material 3 content design

## The Consumer Register

Cross-cohort patterns every fifteen sites share. Each is a pass/fail review question.

1. **Hero headline under 8 words; the subject is the user or the outcome.** "Calm your mind. Change your life." (Calm); "Find your next adventure" (AllTrails); "The way money should work" (Cash App). Never a category noun as subject ("Meditation Content Library").
2. **Subhead is one sentence that operationalizes the promise in plain words**, often with a hard number: "Join over 100 million active people on Strava for free." Headline sells the feeling; subhead sells the mechanism without technical words.
3. **Outcome before feature, everywhere above the fold.** No site leads with a mechanism. Mechanism explanation (encryption, algorithms, data sources) is deferred below the fold or into an FAQ — 1Password holds "Secret Key" until trust is already earned.
4. **CTA = verb + what the user gets, with friction named away.** The deck-level contract already in `conversion-copy.md` §App Surface Recipes, confirmed on every landing hero studied: "Try for $0" (Headspace), "Create invite" (Partiful), "Try FREE for 14 days" (1Password). Never a bare system verb. The strongest CTAs name the object created, not the funnel step.
5. **Social proof is either a specific large number or unpolished real voices — not both, and never vague.** "Over 2 million 5-star reviews" (Calm); Partiful ships App Store reviews with usernames, dates, and a typo intact, because the imperfection is the credibility signal. "Loved by users everywhere" is the failure mode.
6. **Named features never stand alone.** Every proper noun (Beacon, Ebb, HabitatZero) gets a same-breath plain-language gloss. A feature name with no gloss is roadmap vocabulary leaking.
7. **Section headers keep the hero's rhythm.** "Stress less." / "Sleep more." / "Live mindfully." (Calm). A page that switches to descriptive-spec register below the fold was written by two different mindsets, and the reader feels the seam.
8. **Identity is signaled, never named.** Copy says "you", "your friends", "your guests" — it never describes its own audience by segment. Locket's "Reach Gen Alpha" line exists only on its partner-facing corner; consumer surfaces earn identification through vibe, not demographics.
9. **One jab at the incumbent, thrown away.** "Evites are so last decade" (Partiful). Never a comparison table on a consumer page.
10. **Claims are declarative, not hedged.** "Duolingo works." Hedge stacks ("designed to help support...") read as legal-review residue. Quantified claims come time-boxed with proof ("reduces stress in just 10 days", Headspace) and live in the claims ledger, or they don't ship.
11. **Second person, contractions, spoken cadence.** "From getting paid to growing what you've got" (Cash App). Passive voice for anything the product does is a spec tell.
12. **Sentence fragments are allowed on purpose.** "Your friends, week to week." (Retro). Complete subject-verb-object-benefit sentences everywhere is spec voice; shipped consumer copy trusts the reader.
13. **Less copy is a valid strategy.** BeReal's hero is a headline and a two-word button. When the product photographs well, restraint outperforms explanation — the copy deck should say where words are deliberately absent.

## Cohort Notes

- **Wellness/habit**: imperative micro-headlines as both hero and section titles; friction-reduced trial CTAs; awards and science-origin stories as credibility ("began at Duke University's Center for Advanced Hindsight", Fabulous).
- **Consumer/social**: near-zero hero copy; emoji as structural punctuation in headers, not decoration; persuasion displaced off the landing page entirely (Retro's /ethos manifesto); testimonials left raw.
- **Utility/fintech (trust-heavy)**: the two-tier vocabulary strategy. Plain outcome words above the fold ("Protect the accounts that power your life", 1Password); technical precision (FDIC, encryption, institution counts) deep in the page or in the FAQ, which acts as the jargon-containment zone. Reassurance is phrased as an absence — "No ads" (Monarch), "without all the fees" (Cash App) — or as a felt state ("Peace of mind for your entire family"), not as a certification list. Small parenthetical humor offsets category anxiety ("That streaming service you forgot about? We didn't", Copilot).

## Store Listing Rules

From the live App Store listings of Headspace, Duolingo, Flo, Strava, and Cash App:

1. **Subtitle is a second keyword field, not a tagline.** A 3-6 word noun phrase naming the outcome domain or literal features ("Track & share with friends", Strava; "Money. Debit Card. Bitcoin.", Cash App). No puns, no abstract brand language.
2. **Description sentence one = category + differentiator; sentence two = who it's for.** "Flo is a science-backed period tracker... used by over 460 million women worldwide." Never open with mission, history, or "Welcome to".
3. **Feature bullets: `[imperative verb + 2-4 words] – [one-sentence payoff]`.** "Move safer – share your real-time location with loved ones while outdoors." (Strava).
4. **Section headers name the job, not the module.** "SIMPLIFIED BANKING SERVICES" (Cash App), never "Banking Module". If a header could survive unchanged inside the tech spec, it is wrong for the listing.
5. **Close claims with a quantified, time-boxed proof point.** "Just 2 weeks of Headspace reduces anxiety." Unverified superlatives appear nowhere on top listings; specific numbers do. Every such claim needs a claims-ledger row (`conversion-copy.md`).
6. **Screenshot captions: verb + benefit, one message per frame, legible at thumbnail size.** The house length rule is `conversion-copy.md` §Surface Recipes' 3-5 words (ASO sources tolerate up to 7; hold the tighter bar). Cut "powerful", "seamless", "all-in-one" — unearned intensifiers. A caption that only lands zoomed-in is not ready.

## Onboarding And Paywall Rules

From the growth.design teardowns (Headspace onboarding, Strava premium preview, Blinkist trial paywall) and the Irrational Labs Headspace experiment:

1. **A personalization question's answer must visibly change a later screen.** Headspace's documented failure: collect a goal, then show a paywall with zero connection to it. Merely asking lifts perceived fit (31%→63% course starts in the Irrational Labs test even with an identical recommendation) — but a downstream screen that contradicts the stated goal breaks trust immediately.
2. **Onboarding questions read as a person asking, not a database field.** "When do you like to walk?" not "Select goal". If the question maps 1:1 onto a backend enum and sounds like it, it's an intake form.
3. **Paywall copy names the specific outcome or the specific fear — never the access flag.** "Talk to a coach anytime" beats "unlimited sessions"; Blinkist's +23% variant dropped the feature list and answered the one fear ("you won't get charged without warning"). "Unlock premium features" is the canonical internal-voice paywall failure.
4. **Never stack sale mechanics on a free moment.** Strava's critique: "Upgrade" + "25% Off" + "Subscription" made a genuinely free trial read as a sales pitch. Match the language register to the actual commitment.
5. **Low-commitment CTA on the primary button.** "Continue" and "Try it free" outperform "Start Free Trial" and "Subscribe now" in documented redesigns; transaction verbs belong to fine print.
6. **Preview the actual content instead of listing capabilities** where possible (Clear's paywall: 20%→30% conversion by showing week one's real program).

## The Internal-Voice Tells (Review Layer)

The judgment-layer companion to the machine-parsed ban list in `conversion-copy.md` §Banned In App Copy. These need a reader; run them as the review pass on every user-facing surface before handoff. A surface showing two or more tells goes back to the deck. Some tells restate Consumer Register rules or `no-slop-writing.md` principles on purpose — this list is the one flat checklist a reviewer runs, so it does not make the reviewer cross-reference three files mid-pass.

1. The grammatical subject of a headline or section header is the system or category, not the user or outcome.
2. The copy names its own audience by segment ("for Gen Z creators") on a consumer surface.
3. A feature is named without a same-breath gloss, or explained by its mechanism ("our delay-prediction algorithm") instead of its effect ("First to know. First to go.", Flighty).
4. Access language stands in for a named outcome: "unlock premium features", "get full access", "upgrade to premium". Test: delete the sentence — if no information about what the user gets is lost, it was internal-facing.
5. A question is shaped like the backend field it fills ("Select experience level").
6. An answer the user gave is never referenced again on any later screen.
7. Every feature gets equal-length treatment — a completeness checklist, not a point of view. Real pages give wildly uneven space to what the team actually cares about.
8. Testimonials are polished, unattributed, and interchangeable. Real ones keep usernames, dates, and imperfections.
9. CTA verbs name the billing or system event ("Subscribe now", "Submit") instead of the user's next experience ("See my plan", "Continue").
10. Proof points are internal metrics ("99.9% uptime", "50+ sport types") instead of user-relevant outcomes.
11. Person and address drift within one surface — "the user", "customers", and "you" in the same paragraph.

## Voice Benchmarks In The Copy Brief

Every new app's brand guidance anchors its voice to real, current consumer benchmarks — that is what keeps an agent from improvising internal-flavored copy when no examples are in view. The gated section lives in `product/copy/COPY_BRIEF.md` because that is the artifact `check:app-copy` already holds; `strategy/BRAND.md` stays the home of the voice and owned-vocabulary tables, and its Voice table should agree with the benchmarks chosen here. `product/copy/COPY_BRIEF.md` carries the required **Voice benchmarks** section (enforced by `check:app-copy`):

- Name 2-3 live consumer apps adjacent to this product's category whose current voice this product borrows from, each with 1-2 borrowed attributes grounded in words actually on their surfaces today (re-check them; do not quote this file from memory).
- Name at least one **anti-benchmark**: a voice this product must not sound like, with the attribute being rejected.
- Date the teardown. When the date is older than the launch's current phase work, re-check the benchmarks before locking new copy.

Pick benchmarks from this file's cohorts when the category fits, or tear down closer competitors with the same method: verbatim hero/subhead/CTA, structure, voice attributes, tells.

## Gates

- `check:app-copy` — the machine-parsed floor: banned internal vocabulary and placeholder shapes in the deck's copy cells and the onboarding copy column, plus the brief's required sections (presence and non-hollowness — the brief is builder-facing planning prose, so its text is not banned-term-scanned). Rule lists live in `conversion-copy.md` §Banned In App Copy; extend the list there when a tell from this file earns hard-ban confidence.
- The Internal-Voice Tells above — the judgment ceiling: run as a review pass; the gate catches shapes, the reviewer catches voice.
- `check:landing-funnel` — truthful-claims patterns on the public funnel.
- Claims ledger (`conversion-copy.md`) — every quantified or comparative claim, substantiated or removed.
