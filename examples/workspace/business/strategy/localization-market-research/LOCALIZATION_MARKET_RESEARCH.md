# Localization Market Research

Research-first localization for this app. **Demand → Prioritize → Localize → Measure.** We do not translate into every language and hope for downloads; we research search demand per market, rank markets into priority tiers, and localize only what clears the bar — then refresh from first-party analytics after launch.

See [`knowledge/research/localization-market-research.md`](../../../../../knowledge/research/localization-market-research.md) for the full method. Produce this in the research phase, before any metadata, keyword field, screenshot, or paywall copy locks.

Status: partial — replace the example rows with researched markets for this app and record the data basis for each cell.

## Tool Sourcing (No TryAstro Dependency)

Compose the per-market signal from the tools this skill already routes to; cite the source and basis (estimate vs first-party) per cell. Route through `paid-tool-routing.md` before any free fallback.

| Signal                           | Tool used here                                                                              | Basis                  |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- |
| Keyword popularity by storefront | AppKittie keyword popularity/traffic by country; Apple Search Ads popularity per storefront | estimate / first-party |
| Keyword difficulty               | AppKittie `batch_keyword_difficulty` / `get_keyword_difficulty`                             | estimate               |
| Market size (downloads/revenue)  | AppKittie downloads/revenue estimates by country                                            | estimate               |
| Real demand in live markets      | App Store Connect App Analytics / Google Play statistics by territory                       | first-party            |
| In-language user vocabulary      | XPOZ social-language research (Reddit/TikTok/X/Instagram) per locale                        | qualitative            |

## Market Opportunity Matrix

One row per candidate country/storefront. Keywords are the **native** terms users actually search — not literal translations of the English keyword set. Every populated row cites a tool source for popularity and difficulty.

| Country / storefront | Top keywords (native)                      | Popularity | Difficulty | Est. demand / revenue | In-market language notes                                    | Tool source                  | Priority tier |
| -------------------- | ------------------------------------------ | ---------- | ---------- | --------------------- | ----------------------------------------------------------- | ---------------------------- | ------------- |
| US (en-US)           | example primary keyword, secondary keyword | 45         | 38         | high                  | reference market                                            | AppKittie + Apple Search Ads | Tier 1        |
| Japan (ja)           | （ネイティブ検索語）                       | 32         | 18         | medium-high           | adapt paywall layout + plan anchoring; cultural QA required | AppKittie + XPOZ             | Tier 1        |
| Brazil (pt-BR)       | termo de busca nativo                      | 28         | 15         | medium                | anchor yearly to monthly equivalent                         | AppKittie                    | Tier 2        |
| Germany (de-DE)      | natives suchwort                           | 22         | 41         | low-medium            | high difficulty — metadata-only bet                         | AppKittie                    | Tier 2        |
| France (fr-FR)       | mot-clé natif                              | 12         | 47         | low                   | no demand evidence yet                                      | AppKittie                    | Tier 3        |

### Rejected / deferred markets (record the reason)

| Market         | Reason deferred                                                  | Revisit signal                                           |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| France (fr-FR) | keyword popularity below threshold and difficulty unwinnable now | App Analytics shows organic downloads from FR storefront |

## Priority Tiers Drive Effort

Effort scales with opportunity, not with the number of languages available.

- **Tier 1 — full localize:** metadata + keyword field + screenshots + App Preview + paywall/offer adaptation + landing + lifecycle email + optional market custom product page. Adapt paywall layout, plan anchoring, and offers — not word-for-word translation (see [`knowledge/money/revenue-monetization.md`](../../../../../knowledge/money/revenue-monetization.md)).
- **Tier 2 — metadata-only:** localized title/subtitle/keyword field/description; English (or nearest Tier 1) screenshots, recorded here as an intentional gap.
- **Tier 3 — defer / track:** no localization yet; revisit from real App Analytics in the post-launch refresh.

Do not localize a surface into a market with no Tier 1/2 entry. Do not ship translated keywords with English-only screenshots unless this matrix records it as an intentional Tier 2 decision.

## Cross-Surface Rollout (Mobile And App)

Each market's tier cascades via [`knowledge/process/change-cascade.md`](../../../../../knowledge/process/change-cascade.md):

| Surface                                        | Tier 1 markets      | Tier 2 markets              | Owner artifact         |
| ---------------------------------------------- | ------------------- | --------------------------- | ---------------------- |
| App Store / Play metadata + keywords           | localize            | localize                    | APP_STORE_LISTING.md   |
| Screenshots + App Preview                      | localize            | English/nearest, documented | SCREENSHOTS.md         |
| Custom product pages / In-App Events           | optional per market | no                          | APP_STORE_LISTING.md   |
| Paywall / RevenueCat offers + anchoring        | adapt               | no                          | revenue/REVENUE_OPS.md |
| Landing / web (`hreflang`, `llms.txt`, schema) | localize            | no                          | geo-seo route          |
| Lifecycle email                                | localize            | no                          | growth/EMAIL_OPS.md    |
| Paid UA / Apple Search Ads storefronts         | from this matrix    | from this matrix            | growth/PAID_UA.md      |

## Traceability

| Trace ID | Market decision                 | Evidence source                                                  | Tier   | Surfaces affected                       |
| -------- | ------------------------------- | ---------------------------------------------------------------- | ------ | --------------------------------------- |
| LOC-001  | Japan is a full-localize market | AppKittie popularity 32 / difficulty 18; XPOZ in-language demand | Tier 1 | metadata, screenshots, paywall, landing |

Map each Tier 1/2 decision into `state/LAUNCH_TRACE.md`.

## Seasonal Windows

Do not launch keywords or localization into a known peak on the same day. Submit-by must sit 14 or more days before a dated peak.

| Category         | Window           | Peak Date  | Submit By  | Asset Lock |
| ---------------- | ---------------- | ---------- | ---------- | ---------- |
| habits / fitness | New Year restart | 2026-01-01 | 2025-12-15 | 2025-12-01 |

## PPP / Territory Pricing

Record purchasing-power bands before storefront price lock. Defer localization when demand evidence is weak.

| Territory               | PPP Band              | Price Point              | Localize now?            | Evidence                     |
| ----------------------- | --------------------- | ------------------------ | ------------------------ | ---------------------------- |
| replace with storefront | replace with PPP band | replace with price point | replace with yes / defer | replace with demand evidence |

## Post-Launch Refresh

Refresh this matrix from first-party App Store Connect App Analytics / Google Play statistics on the post-launch ASO cadence (`aso-store-ops.md` §10): promote Tier 2/3 markets that are downloading/converting, prune localized markets that under-deliver. This is a living artifact.

## Founder-Only Gates

Paid AppKittie/XPOZ provisioning, translation/cultural-QA spend, and any market launch decision are founder gates. Prepare the matrix and rollout plan; do not commit spend or submit localized listings without approval.
