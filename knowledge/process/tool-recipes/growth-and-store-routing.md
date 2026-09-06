# Growth And Store Routing

Use current tools and live data whenever possible. Treat this file as workflow, not fixed facts.

Part of the [Tool Recipes](../tool-recipes.md) index. Before using any paid or account-gated tool named below, honor the **Paid Tool Decision Protocol** and **Founder-Only Gates** in that index.

---

## ASO Skill Routing

The reviewed Eronred methods remain subordinate to the accepted research,
product, design and copy contracts. `ios-screenshots` is not a skill path
in the reviewed Eronred tree. Resolve a separately installed skill before attributing it
there. Loading these methods does not select Appeeky, authorize paid queries or
make upstream conversion statistics local evidence. Use
[`screenshot-toolchain.md`](../../store/screenshot-toolchain.md) for the screenshot
story and editor handoff. New upstream features require a reviewed contribution.

Purpose: avoid re-creating specialist ASO work inside B2C App Builder.

Use `aso-store-ops.md` as the router. Load `app-store-listing-prep.md` for Apple listing packets, pricing/privacy/growth surfaces, and `store-console-workflow.md` when the work moves into App Store Connect, Google Play Console, privacy forms, screenshots, or submission. When the runtime exposes ASO skills, delegate:

- `aso-router` and `app-marketing-context` before any broad or ambiguous ASO project
- `market-pulse`, `market-movers`, `category-positioning`, `competitor-analysis`, and `competitor-tracking` for category, chart, and competitor context
- `keyword-research`, `metadata-optimization`, `seasonal-aso`, `localization`, and `android-aso` before title/subtitle/keywords/Play copy locks
- `screenshot-optimization`, `ios-screenshots`, `app-icon-optimization`, `app-preview-video`, and `ab-test-store-listing` before screenshot, App Icon, App Preview, or PPO work
- `custom-product-pages`, `in-app-events`, `app-store-featured`, and `app-clips` before Apple marketing-surface plans
- `apple-search-ads`, `ua-campaign`, `attribution-setup`, and `web-to-app-funnel` for paid traffic, CPP routing, SKAN/MMP/deep links, and web-to-app funnels
- `monetization-strategy`, `paywall-optimization`, and `subscription-lifecycle` for pricing, paywall, trial, churn, and subscription lifecycle work
- `onboarding-optimization`, `retention-optimization`, and `referral-program` for activation, engagement, and viral loops that shape store claims
- `review-management`, `rating-prompt-strategy`, `crash-analytics`, and `app-rejection-recovery` for quality loops, ratings/reviews, stability, and resubmission
- `asc-metrics` and `app-analytics` for first-party performance and dashboards after launch
- `app-launch`, `creator-ugc-marketing`, and `press-and-pr` for launch calendar, UGC/creator strategy, and press kit consistency

Fallback:

- If the ASO skills are installed but not discoverable in the current runtime, search local skill/plugin directories for the skill name and read its `SKILL.md`.
- If the Eronred ASO skill set is relevant, refresh `https://github.com/Eronred/aso-skills` and prefer installed or vendored skill docs over memory.
- If no ASO skill pack is installed, use [`paid-tool-routing.md`](../../operations/paid-tool-routing.md) before replacing paid ASO tooling with AppKittie, public App Store/Play Console research, manual keyword sheets, and the same outputs: context, keyword map, metadata variants, `APP_STORE_LISTING.md`, `store/STORE_CONSOLE.md`, `app-store-listing.html`, `store/store-console.html`, `SCREENSHOTS.md`, launch calendar, and post-launch monitoring loop.

## Paid User Acquisition Routing

Purpose: decide whether the product is ready for a small paid acquisition test before treating ad-channel ideas as a growth plan.

Use `paid-user-acquisition.md` before:

- paid ads, Apple Search Ads, Meta/TikTok/Google campaigns, paid creative tests, or paid-growth readiness claims
- custom product page campaign routing or web-to-app paid traffic
- MMP/ad-network SDK decisions, ad-account reporting, or baseline uplift plans
- using RevenueCat LTV/cohort data to judge CPA, trial conversion, payback, or ROAS

Inputs:

- `PRODUCT.md`, `11_STAR_EXPERIENCE.md`, `CONTENT_ASSETS.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, `APP_STORE_LISTING.md`, `state/LAUNCH_TRACE.md`, `trust/PRIVACY.md`, `trust/TERMS.md`
- RevenueCat LTV/cohort/trial/purchase/entitlement data when available
- App Store Connect or Play Console baseline metrics
- ad-channel access and budget approval state

Outputs:

- `PAID_UA.md`
- `growth/paid-ua-report.csv` when spend is planned or active
- updated `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, `CONTENT_ASSETS.md`, `APP_STORE_LISTING.md`, and `state/LAUNCH_TRACE.md`

Rules:

- Start with one channel or document the exception.
- Do not launch campaigns, connect accounts, install privacy-affecting ad SDKs, or change budgets without founder approval.
- Do not call installs success unless paywall reach, purchase, entitlement, revenue, and retention quality are visible.

## Viral Growth Loop Routing

Purpose: decide whether the product can grow through built-in sharing, referrals, invite loops, social-comment mechanics, or creator CTAs before treating content as the whole growth plan.

Use `viral-growth-loops.md` before:

- referral unlocks, share-to-unlock mechanics, invite systems, or referral codes
- viral onboarding/paywall flows and closing-offer mechanics tied to sharing
- TikTok/Reels/Shorts hooks that depend on users commenting, sharing, tagging, searching, or posting their own results
- creator CTAs that must map to product rewards, store search, landing links, or self-reported attribution
- calling a social channel ready from views, likes, or UGC ideas alone

Inputs:

- `PRODUCT.md`, `11_STAR_EXPERIENCE.md`, `product/ONBOARDING.md`, `revenue/REVENUE_OPS.md`, `analytics/ANALYTICS.md`, `state/LAUNCH_TRACE.md`, `trust/PRIVACY.md`, `trust/TERMS.md`
- AppKittie/XPOZ/review/social evidence for category, platform, creator language, device mix, and content formats
- real product screens or truthful prototypes that show the shareable result

Outputs:

- `VIRAL_GROWTH.md`
- `growth/format-lab.csv` or `ugc/script-bank.md`
- `growth/referral-loop-map.md` when referral/unlock mechanics are non-trivial
- updated `growth/UGC_PLAYBOOK.md`, `growth/FASTLANE_OPS.md`, `CONTENT_ASSETS.md`, and `analytics/ANALYTICS.md` when content or automation is in scope

Rules:

- Treat UGC as supply and viral growth as the system that converts attention into product actions.
- Do not force referral/share mechanics without fallback, abuse controls, and policy review.
- Do not scale from one viral post; wait for repeatable format evidence plus downstream app, paywall, revenue, or retention signal.
- Ask before creator payments, paid tools, public posting, social account connections, pricing changes, or legal/policy-sensitive incentives.

## UGC Creator Engine Routing

Purpose: decide whether creator-led organic growth is a real channel and, if so, run a Day 0 format-discovery program before scaling or feeding Fastlane.

Use `ugc-creator-engine.md` before:

- TikTok/Reels/Shorts founder-led organic content
- Sideshift or other creator marketplace work
- creator sourcing, contracts, payments, or account ownership decisions
- UGC scripts, shot lists, creator briefs, or tracker artifacts
- adapting creator videos into ads or Fastlane campaigns

Inputs:

- `PRODUCT.md`, `strategy/BRAND.md`, `DESIGN.md`, `product/ONBOARDING.md`, `LAUNCH.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, `trust/PRIVACY.md`, `trust/TERMS.md`
- AppKittie/XPOZ/review evidence for audience language and competitor creator patterns
- real app screenshots/recordings from MobAI, Codex Desktop native iOS/XcodeBuildMCP, serve-sim, or approved fallback
- Higgsfield visuals only as supporting assets constrained by `DESIGN.md`

Outputs:

- `growth/UGC_PLAYBOOK.md`
- `ugc/creator-list.csv`
- `ugc/creator-brief.md`
- `ugc/script-bank.md`
- `ugc/tracker.csv` or sheet link
- `ugc/weekly-review.md`

Rules:

- Ask before spending on Sideshift, creator platforms, paid creator tools, or creator payments.
- Do not start a mature creator program at Day 0. Start with 3-5 creators and founder-written scripts.
- Do not schedule or post creator content without disclosure, claim review, and founder approval.
- Treat one viral video as luck; treat 2-3 hits from one structure across creators as the earliest scale signal.

## Fastlane Organic Growth Routing

Purpose: set up Fastlane AI as the post-launch content engine for organic TikTok, Instagram Reels, YouTube Shorts, and any other connected destinations supported in the current workspace.

Use `fastlane-growth-ops.md` after launch approval/public beta or when the user asks for `usefastlane.ai`, Fastlane setup, the Fastlane guide, developer API, Blitz campaigns, content generation, scheduling, or short-form analytics.

Access:

- Fastlane AI is paid/account-gated. If the app, API, workspace, or installed skill is unavailable, use `paid-tool-routing.md` before switching to a manual content calendar, local prompt set, platform-native drafts, or spreadsheet schedule.

Delegate:

- load the installed `usefastlane-ai` skill before API work
- compare a user-provided Fastlane `SKILL.md` against the installed skill when the user supplies one
- use current app/docs/API state as source truth because `developers.usefastlane.ai` can be a JavaScript shell
- use safe reads first: preferences, angles, connections, content, posts, analytics when post IDs exist
- build `growth/FASTLANE_OPS.md` and `fastlane/` artifacts before generating or scheduling content

Inputs:

- `PRODUCT.md`, `strategy/BRAND.md`, `DESIGN.md`, `LAUNCH.md`, `product/ONBOARDING.md`, `revenue/REVENUE_OPS.md`, `trust/PRIVACY.md`, `trust/TERMS.md`, and `strategy/RESEARCH.md`
- MobAI screenshots/recordings for real app proof
- Codex Desktop native iOS/XcodeBuildMCP or serve-sim screenshots/recordings when Apple-platform media proof is available or approved as a fallback
- Higgsfield assets for design-system constrained hooks, mascots, backgrounds, and motion
- `growth/UGC_PLAYBOOK.md`, `ugc/script-bank.md`, and creator/post results when a creator-led engine exists

Rules:

- never store or print `FASTLANE_API_KEY`
- ask before connecting accounts, scheduling, canceling, deleting, changing profiles, or posting publicly
- treat platform posting limits and account warmup as launch gates
- QA every generated content item against brand, legal, store, pricing, and product truth before scheduling
- connect content metrics back to installs, trials, purchases, attribution answers, and product analytics

## GEO/SEO Skill Routing

Purpose: make the public launch funnel discoverable by both traditional search and AI answer engines.

Use `geo-seo.md` as the router. When the runtime exposes GEO skills from the `geo-seo-claude` workflow, delegate:

- `geo` or `geo-audit` for the full GEO+SEO pass
- `geo-technical` for crawlability, SSR/static rendering, performance, security, and indexability
- `geo-crawlers` for AI crawler access through `robots.txt`, meta tags, and headers
- `geo-llmstxt` for `llms.txt` generation or validation
- `geo-schema` for JSON-LD entity markup
- `geo-citability` for answer-style sections and citation readiness
- `geo-content` for E-E-A-T and proof structure
- `geo-brand-mentions` for entity/authority gaps
- `geo-platform-optimizer` for ChatGPT, Perplexity, Gemini, Google AI Overviews, and Bing Copilot differences
- `geo-compare` for monthly before/after tracking

Fallback:

- If the GEO skills are installed but not discoverable in the current runtime, search `.agents/skills`, `.claude/skills`, `.codex/skills`, and plugin caches for the relevant `SKILL.md`.
- If no GEO skill pack is installed, still produce the minimum launch outputs: metadata, schema, `robots.txt`, `sitemap.xml`, `llms.txt`, AI-crawler access notes, citability notes, and live HTTP checks.
