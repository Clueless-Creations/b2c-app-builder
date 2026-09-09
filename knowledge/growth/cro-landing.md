# Landing Page CRO (Public Funnel Structure)

Use this before building or auditing the public pre-launch/marketing funnel for conversion: the landing/waitlist page, the web-to-app or app-preview page, a Product Hunt/launch page, or any web surface whose job is to turn a visitor into an install, signup, or purchase. This governs page _structure and conversion mechanics_; it is the web-funnel complement to [`onboarding-conversion.md`](../experience/onboarding-conversion.md), which owns the in-app flow.

Load [`conversion-copy.md`](../words/conversion-copy.md) for the words on the page (hero, CTA, proof copy) — do not rewrite copy craft here. Load [`geo-seo.md`](./geo-seo.md) before editing any landing file, policy page, metadata, `robots.txt`, `llms.txt`, sitemap, or schema — that gate fires before the first edit, not after. Load [`analytics-attribution.md`](../data/analytics-attribution.md) before naming funnel events, and [`design-room.md`](../design/design-room.md) when the page is a Design Room surface (mutate `studio/seed/business.json`, do not hand-author one-off HTML).

> Adapted from Corey Haines' marketingskills (`https://github.com/coreyhaines31/marketingskills`, MIT License, © Corey Haines 2025): the `cro` landing-page conversion discipline. Reframed for B2C mobile waitlist/web-to-app funnels and wired into this skill's funnel proof and traceability contracts.

## Contents

- Sources To Refresh
- Required Artifacts
- Page Conversion Structure
- Trust And Proof Placement
- Mobile Viewport Rules
- Friction Audit
- Analytics Events
- Gates Before Handoff

## Sources To Refresh

- Corey Haines marketingskills `cro` skill (MIT): `https://github.com/coreyhaines31/marketingskills`
- Current Core Web Vitals thresholds (LCP/INP/CLS) — slow pages cap conversion: `https://web.dev/articles/vitals`
- The project's `strategy/RESEARCH.md` competitor landing teardown and `11_STAR_EXPERIENCE.md` for the one promise the page must carry
- Refero shipped-flow research for current landing/waitlist patterns when access is available (see [`refero-ux-patterns.md`](../design/refero-ux-patterns.md))

## Required Artifacts

Create or update `CRO_AUDIT.md` when a launch ships a public conversion page. It records the page's conversion structure, the friction removed, and the test queue. The `check:landing-funnel` gates still apply. They cover live deploy, a form smoke test, and a frozen per-page CRO hold when a listed studio surface has a conversion job. A static legal or support page must not invent that layer.

`CRO_AUDIT.md` must include:

- the single conversion goal of the page (one primary action) and the secondary action if any
- the above-the-fold inventory: promise, subhead, primary CTA, one proof element, hero visual
- the full section order with the job each section does (problem → outcome → how → proof → objection handling → final CTA)
- trust/proof placement map (where each social-proof, security, and risk-reversal element sits)
- the friction audit: every required field, every click before conversion, every load-time risk, with the removal decision
- the test queue: ranked CRO hypotheses (highest-traffic, highest-impact first), each handed to the experiment discipline

## Page Conversion Structure

- **One page, one job.** A landing page that asks for an install _and_ a newsletter signup _and_ a follow converts for none. Pick the primary action; make every section serve it.
- **Above the fold earns the scroll.** The promise, a clarifying subhead, one CTA, and one proof element must be visible without scrolling. Everything else is permission to keep reading.
- **Section order follows awareness:** name the problem in the user's words → show the after-state → show how it works in 3 steps → stack proof → handle the top objection → repeat the CTA. Cold mobile traffic rarely reaches a buried CTA.
- **Repeat the CTA** at each natural decision point (after the value, after the proof, at the end) — same action, same words.
- **Match the ad to the page.** The hero promise must echo the ad/creative that drove the click ([`paid-user-acquisition.md`](./paid-user-acquisition.md)); a message mismatch is the most common silent conversion killer.

## Trust And Proof Placement

- put one proof element near the fold (rating, user count, recognizable logo, or a single strong quote)
- cluster richer proof (testimonials, screenshots, press) right before or after the primary CTA, where the decision happens
- add risk reversal at the CTA (free, no card, cancel anytime, restore purchases) — only claims that are true and honored
- never fabricate counts, ratings, endorsements, or scarcity; unsupported proof is a claims-ledger and compliance liability (see [`conversion-copy.md`](../words/conversion-copy.md) and [`privacy-terms.md`](../trust/privacy-terms.md))

## Mobile Viewport Rules

Most B2C traffic is mobile — design and QA the small viewport first:

- the promise and CTA fit a phone fold without pinch-zoom; tap targets are thumb-reachable
- the primary CTA is reachable without hunting (sticky or repeated)
- forms ask for the minimum (email-only for a waitlist; defer everything else)
- the page passes Core Web Vitals on a mid-tier device; a slow hero caps every downstream metric
- verify on real mobile/desktop visual QA, not just a desktop browser

## Friction Audit

Conversion rises faster from removing friction than from adding persuasion. For each step from visit to conversion, ask: is this field required _now_? is this click necessary? does this load fast? Cut every "no". Defer optional data to after the conversion.

## Analytics Events

Declare in `analytics/ANALYTICS.md` first; implement the approved catalog:

- `landing_viewed` (variant_id, traffic_source)
- `landing_cta_clicked` (variant_id, cta_position)
- `waitlist_submitted` / `app_store_redirect` / `purchase_started` (the page's primary conversion)
  Tie every CRO test to the experiment discipline in [`analytics-attribution.md`](../data/analytics-attribution.md): a CRO change is an experiment with a hypothesis, a minimum sample, and a stop rule.

## Gates Before Handoff

- `CRO_AUDIT.md` exists for any public conversion page
- the page has one primary conversion goal and an above-the-fold promise + CTA + proof
- [`geo-seo.md`](./geo-seo.md) was loaded before the first file edit; AI-crawler/metadata/schema checks pass
- `check:landing-funnel` gates (live deploy, form smoke test) pass; record the results in `engineering/PRODUCTION_READINESS.md`
- mobile viewport and Core Web Vitals verified with visual QA proof
- the top CRO hypothesis is registered as an experiment with a stop rule
- copy on the page traces to `product/copy/COPY_BRIEF.md`; the hero matches the driving ad
