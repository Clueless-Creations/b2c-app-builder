# Localization Market Research First

Use this **before** localizing any surface — App Store/Google Play metadata, keywords, screenshots, App Previews, custom product pages, paywall/offers, landing pages, lifecycle email, or ads. Localization is a **market-selection decision made from search-demand evidence**, not a translation task you run "to be safe."

This is the research-first inversion of the common indie pattern (translate into N languages, then hope for downloads). The skill's posture is the opposite: **research demand, prioritize markets, then localize only what clears the bar, then measure**. Produce `LOCALIZATION_MARKET_RESEARCH.md` (and `localization-market-research.html`) in the research phase so the priority tiers exist before metadata, screenshots, or paywall copy lock.

Load `aso-store-ops.md` and `app-store-listing-prep.md` for how the chosen markets become metadata, keyword fields, screenshots, custom product pages, and In-App Events. Load `paid-user-acquisition.md` before choosing Apple Search Ads / paid storefronts (campaign storefronts are selected _from_ this matrix). Load `geo-seo.md` before localizing landing/web surfaces (`hreflang`, localized `llms.txt`/schema). Load [`change-cascade.md`](../process/change-cascade.md) to propagate a market's tier across every surface. Load `revenue-monetization.md` for paywall/offer adaptation per market. Whether the app _can_ ship a Tier 1 market cheaply is decided long before this research: [`conversion-copy.md`](../words/conversion-copy.md) §Localization Readiness makes string externalization, ICU plurals, and locale-aware formatting a day-one engineering property, with `product/copy/COPY_DECK.md` keys as the translation keys and each deck row carrying this matrix's tier.

Load [`paid-tool-routing.md`](../operations/paid-tool-routing.md) before replacing AppKittie, XPOZ, paid ASO/MMP tooling, or App Store Connect / Google Play account data with a free or manual fallback. Missing runtime access to a paid intelligence tool is a founder decision, not a reason to guess the language list.

## The Principle

> **Demand → Prioritize → Localize → Measure.**
> No surface is localized into a market until that market clears a popularity / competition / opportunity bar. Translating everything into 20 languages before any demand evidence is the documented anti-pattern. Localize based on search demand, not language.

## Contents

- 1. Why Research First
- 2. Tool Routing (No TryAstro Dependency)
- 3. The Market Opportunity Matrix
- 4. Priority Tiers Drive Effort
- 5. Cross-Surface Rollout (Mobile And App)
- 6. Phase Placement And Traceability
- 7. Post-Launch Refresh
- 8. Outputs
- 9. Seasonal Windows And PPP
- 10. Common Failure Modes

## 1. Why Research First

Translating metadata into every language is expensive (translation, screenshot re-renders, paywall adaptation, support load, review/cultural QA) and most of it earns nothing because there is no search demand or the keyword difficulty is unwinnable in that storefront. Researching demand first means you know, before spending effort:

- which countries/storefronts have real keyword popularity for the app's job
- where competition/difficulty is low enough to rank
- which markets are already sending downloads/revenue (for existing apps)
- which keywords users actually search in-language (not literal translations of the English ones)
- which surfaces are worth localizing per market, and which to defer

The output is a ranked, evidence-backed target list — not a language checklist.

## 2. Tool Routing (No TryAstro Dependency)

This skill does **not** depend on TryAstro or any single ASO MCP. Compose the same "keyword popularity > X, low difficulty, localization priority per country" research from the tools the skill already routes to. Record which tool produced each cell and the data basis (estimates vs first-party).

| Research need                            | Routed tool (preferred)                                                                                                      | Free / fallback (founder-approved)                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Keyword popularity by country/storefront | AppKittie keyword popularity/traffic by country; Apple Search Ads popularity (Search Match / Recommendations) per storefront | public App Store/Play search, store autocomplete, manual keyword sheet |
| Keyword difficulty / competition         | AppKittie `batch_keyword_difficulty` / `get_keyword_difficulty` per storefront                                               | top-ranking-app inspection, manual difficulty estimate                 |
| Market size (downloads/revenue)          | AppKittie downloads/revenue estimates by country                                                                             | category top-charts inspection, public estimates                       |
| Real demand in existing markets          | App Store Connect App Analytics / Google Play statistics (first-party, by territory)                                         | console exports                                                        |
| In-language user vocabulary              | XPOZ (Reddit/TikTok/X/Instagram) social-language research per locale                                                         | platform-native browser search, in-language App Store reviews          |
| Web/landing demand per locale            | web search + Firecrawl on localized competitor/SEO surfaces                                                                  | manual SERP inspection (feeds `geo-seo.md`)                            |
| "Localization priority" output           | **this matrix's tier column** (synthesized from the above)                                                                   | same, documented manually                                              |

If an ASO `localization` / `keyword-research` / `market-pulse` skill pack is installed, delegate the per-market pulls to it and keep the same matrix + tier output. AppKittie and competitor estimates are directional unless first-party — cite them as estimates and pair with App Analytics or reviews/social evidence where it matters.

## 3. The Market Opportunity Matrix

`LOCALIZATION_MARKET_RESEARCH.md` is the single source of truth for _where_ the app localizes. Its core is one row per candidate country/storefront:

| Country / storefront | Top keywords (native, not literal translations) | Popularity | Difficulty | Est. demand / revenue | In-market language notes | Tool source | **Priority tier** |
| -------------------- | ----------------------------------------------- | ---------- | ---------- | --------------------- | ------------------------ | ----------- | ----------------- |

Rules:

- Keywords are the **native** terms users actually search, sourced from in-storefront popularity and social language — not machine translations of the English keyword set.
- Every populated row cites the tool/source for popularity and difficulty (AppKittie, Apple Search Ads, App Analytics, XPOZ).
- The tier is the decision; the other columns are the evidence behind it.
- Record rejected markets too, with the reason (no demand, unwinnable difficulty, no support capacity), so a future agent does not re-open them blindly.

## 4. Priority Tiers Drive Effort

Effort scales with opportunity, **not** with the number of languages available:

- **Tier 1 — full localize.** Metadata + keyword field + screenshots + App Preview + **paywall/offer adaptation** + landing page + lifecycle email + (optional) a market-specific custom product page. Tier 1 means adapting paywall layout, plan anchoring, and offers per market — not word-for-word translation (see `revenue-monetization.md`; e.g. region-adapted paywalls and monthly-equivalent anchoring materially lift conversion).
- **Tier 2 — metadata-only.** Localized title/subtitle/keyword field/description; English (or nearest-Tier-1) screenshots, documented as an intentional gap. A low-cost bet on an emerging market.
- **Tier 3 — defer / track.** No localization yet; revisited from real App Analytics in the post-launch refresh.

Do not localize a surface into a market that has no Tier 1/2 entry. Do not ship translated keywords with English-only screenshots **unless** the matrix records it as an intentional Tier 2 decision.

## 5. Cross-Surface Rollout (Mobile And App)

A market's tier cascades to every surface via `change-cascade.md`, so localization stays consistent across mobile and web:

- **App Store / Google Play:** localized metadata, keyword fields, screenshots, App Preview, In-App Events, and custom product pages (each Tier 1 market can become a CPP entry point).
- **Paywall / RevenueCat:** localized offers, plan anchoring, and layout per Tier 1 market — localize the paywall, not only the listing.
- **Landing / web funnel:** localized pages, `hreflang`, localized `llms.txt`/schema (route through `geo-seo.md`).
- **Lifecycle email (Resend):** localized templates for Tier 1 markets.
- **Paid UA / Apple Search Ads:** campaign storefronts chosen from the matrix (route through `paid-user-acquisition.md`).

## 6. Phase Placement And Traceability

- **Phase 1 (research-backed spec):** produce `LOCALIZATION_MARKET_RESEARCH.md` alongside category economics, before any metadata/screenshot/paywall lock.
- **Phase 3 (store ops):** ASO consumes the tiers instead of defaulting to English-only or translate-everything.
- Trace each Tier 1/2 decision into `state/LAUNCH_TRACE.md` so a future agent can see why a market was localized and which evidence backed it.

## 7. Post-Launch Refresh

The post-launch ASO loop (`aso-store-ops.md` §10) refreshes this same matrix from **first-party** App Analytics / Play statistics: countries that are downloading/converting but are still Tier 2/3 are promotion candidates; localized markets that under-deliver are pruning candidates. The matrix is a living artifact, not a one-time research dump.

## 8. Outputs

- `LOCALIZATION_MARKET_RESEARCH.md`: market matrix, tiers, tool sourcing, seasonal windows, PPP pricing, rejected markets, and refresh cadence.
- `localization-market-research.html`: founder-visible board of the ranked markets and tiers.
- Updated `APP_STORE_LISTING.md` localization matrix, `state/LAUNCH_TRACE.md` traces, and (when in scope) `PAID_UA.md` storefront choices that draw from the tiers.
- The `research` lane's evidence in `state/business-state.json` records why localization is `not_needed`/`deferred`, or points at the completed opportunity matrix.

## 9. Seasonal Windows And PPP

Do not launch keywords or localization into a known peak on the same day.

Record Seasonal Windows in `LOCALIZATION_MARKET_RESEARCH.md`.
Name the category, the window, the peak date, and the submit-by date.
The submit-by date must sit 14 or more days before a dated peak.
ASO index lag is two to four weeks.

Sample plans:

| Category         | Window                    | Peak Date  | Submit By  |
| ---------------- | ------------------------- | ---------- | ---------- |
| habits / fitness | New Year restart          | 2026-01-01 | 2025-12-15 |
| shopping         | Black Friday / Cyber week | 2026-11-27 | 2026-11-10 |

Use In-App Events as hooks inside those windows.
Do not treat the sample dates as this app's plan.
Fill the table with this app's dates.

Record PPP / Territory Pricing before storefront price lock.
Name the territory, the PPP band, the price point, and whether to localize now.
Skip localization when demand evidence is weak.
`asc-ppp-pricing` in `app-store-connect-cli.md` is the store command after this table exists.

`check:localization-research` fails a dated submit-by that sits fewer than 14 days before a dated peak.
Every Seasonal Windows row needs complete ISO Peak Date and Submit By values.
Blank or malformed dates fail before the 14-day check.
An empty Seasonal Windows table fails.

## 10. Common Failure Modes

- **Translate-first:** localized metadata exists but there is no opportunity matrix or priority tiers — effort spent with no demand evidence.
- **Literal keyword translation:** the localized keyword field is a machine translation of the English keywords instead of native search terms with their own popularity/difficulty evidence.
- **Metadata-only drift:** translated keywords shipped with English screenshots and an un-adapted paywall, not recorded as an intentional Tier 2 decision.
- **Single English paywall:** the listing is localized but the paywall/offers are not, under-serving whole regions.
- **Stale tiers:** post-launch App Analytics shows real demand in deferred markets but the matrix is never refreshed.
- **Silent paid-tool downgrade:** AppKittie/XPOZ unavailable in the runtime, so the agent guesses the language list instead of routing through `paid-tool-routing.md`.
