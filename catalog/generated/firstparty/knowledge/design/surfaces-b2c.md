# B2C Surface Model

Use this reference when modeling a B2C mobile app business in the Design Room. The goal is to make every consumer-facing promise versionable and visibly consistent across app, web, store, lifecycle, and growth surfaces.

## Surface Families

Model these in `studio/seed/business.json`:

- **Web funnels**: waitlist, preorder, trial, web-to-app, referral, purchase, support, account deletion, privacy, terms, and campaign-specific pages.
- **Landing pages**: hero, proof, method, pricing, FAQ, privacy/security trust blocks, SEO/GEO metadata, and AI-crawler/citability surfaces.
- **Marketing assets**: app icon directions, social ads, UGC hooks, lifecycle email visuals, screenshots, app previews, creator briefs, and press/partner assets.
- **Mobile app**: onboarding, aha moment, core loop, paywall, restore purchases, settings/account, support, privacy/legal, empty/loading/error/offline states, and share/referral paths.
- **Store surfaces**: default product page, custom product pages, Product Page Optimization tests, In-App Events, localized screenshots, app previews, subscription display copy, and promoted IAP assets.

Every surface should reference shared tokens through `tokenReferences` so cross-surface consistency is visible and checkable.

## App Store Custom Product Pages

Apple currently lets you create up to 70 custom product pages per app. Each page can vary screenshots, app previews, promotional text, and keywords, is localizable, can have a unique share URL, and becomes measurable in App Analytics after enough first-time downloads.

State requirements for each custom product page:

- `id`, `status`, `audience`, and `positioning`
- traffic source or organic keyword reason
- screenshot count and app preview count
- promotional text under 170 characters
- keyword set and localization plan drawn from `LOCALIZATION_MARKET_RESEARCH.md` priority tiers (see `localization-market-research.md`), not a blanket translate-everything pass
- deep link when the page should open a specific in-app path
- share URL or blocked reason
- measurement plan and approval state

Do not create a page just because the capability exists. A custom product page needs a traffic source, search intent, or campaign-specific conversion hypothesis.

## Product Page Optimization

Product Page Optimization tests belong in state as explicit experiments. A test can include up to three treatments and should only model assets Apple allows for PPO: alternate app icons, screenshots, and app previews. Do not model title, subtitle, description, promotional text, or keywords as PPO-tested fields.

State requirements:

- `hypothesis`
- `trafficAllocationPercent`
- `durationDays` no more than 90
- up to three treatments
- changed assets per treatment
- winner confidence and application status

Only one test should be running at a time. Wait for high-confidence evidence before applying a winner.

## In-App Events

In-App Events are for timely real content inside the app, not generic awareness campaigns or price promos. Model only events that have:

- real in-app content
- reference name and purpose
- schedule
- deep link
- media status
- localized copy readiness
- IAP/subscription requirement if participation requires purchase
- App Review state

Apple allows up to 10 published In-App Events at a time and up to 15 approved events per app in App Store Connect. The schema allows 15 modeled events; the validator separately fails if more than 10 are published.

## Cross-Surface Consistency

Before rendering, check:

- the same audience and promise appear in app, landing, store, and lifecycle surfaces
- screenshots/app previews show the real complete product experience from `11_STAR_EXPERIENCE.md`
- paywall, pricing, store products, RevenueCat, and web purchase routes use the same names and terms
- App Store claims are supported by app behavior and legal/privacy docs
- tokens come from `DESIGN.md`, not copied literal values

When a design mutation changes copy, pricing, products, feature scope, brand vocabulary, or data behavior, load [`change-cascade.md`](../process/change-cascade.md) before calling the mutation done.

## Source Freshness

Refresh Apple docs before final store packets or hard-coded limits. The current source set includes:

- Custom Product Pages: `https://developer.apple.com/help/app-store-connect/create-custom-product-pages/configure-multiple-product-page-versions/`
- Product Page Optimization: `https://developer.apple.com/help/app-store-connect/create-product-page-optimization-tests/overview-of-product-page-optimization`
- PPO results/confidence: `https://developer.apple.com/help/app-store-connect/view-app-analytics/view-product-page-optimization-results/`
- In-App Events: `https://developer.apple.com/help/app-store-connect/offer-in-app-events/offer-in-app-events`
- In-App Event marketing overview: `https://developer.apple.com/app-store/in-app-events/`
