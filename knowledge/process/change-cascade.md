# Change Cascade

A B2C app change rarely affects only one surface. A feature rename can make store, landing, paywall, billing, and screenshot content stale.

This reference is the impact checklist. List each affected surface. Update it or record why the change does not affect it.

Use this reference when `DESIGN.md` is first accepted. This first run creates the public-surface baseline.

Use it again after each app, product, brand, copy, price, product, or data change. Do not wait for public assets to exist.

Run the affected work while the next app slice continues. Use the Lexicon Lock in [`flow-traceability.md`](./flow-traceability.md).

## Surface Inventory

The full set of surfaces a B2C mobile launch maintains. A cascade check walks the relevant rows of this list.

- **App (in-app):** onboarding copy/flow, core feature UI + copy, paywall copy + plan labels, settings, empty/error states, push/notification copy.
- **App Store Connect listing:** name, subtitle, promotional text, description, keywords, What's New, screenshots, App Preview, App Icon, events, custom product pages, and localizations.
- **Google Play listing:** name, short and full descriptions, screenshots, feature graphic, promo video, custom store listings, events, and localizations.
- **App Store Connect products:** IAP/subscription **display names + descriptions**, **promoted-IAP promotional images** (unique per product, never the app icon — see `app-store-connect-cli.md`), pricing, intro/trial offers, **App Review Information notes**.
- **Google Play products:** one-time products, subscriptions, base plans, offers, localized names and descriptions, prices, tags, and review notes.
- **RevenueCat / billing:** offering/package/product display names, paywall configuration, entitlement identifiers, Stripe/web-funnel product copy and prices.
- **Landing / web:** hero, method, optional web onboarding, FAQ, prices, footer, metadata, Open Graph, JSON-LD, crawler files, and app screenshots.
- **Landing onboarding:** qualification questions, branches, consent, completion state, and install, waitlist, or purchase handoff when applicable.
- **SEO / GEO:** target keywords, citability content, brand-entity signals.
- **Lifecycle email:** transactional + lifecycle templates, brand tokens, plan/price/feature mentions.
- **Analytics:** event names, funnel/dashboard definitions, attribution sources.
- **Legal:** privacy policy, terms, App Privacy answers, Data safety — when data collection, third-party SDKs, or account behavior changes.
- **Content / UGC / ads:** ad creative, demo videos, screenshots reused in ads, creator scripts.

## Change Cascade Map

For each change type, the surfaces most likely to need an update. Treat these as "check and update or justify," not "always edit."

This table has a machine-readable twin: [`cascade-edges.yaml`](./cascade-edges.yaml) carries the same surface inventory and the same change-type edges as data, and `check:change-cascade` grades recorded cascades against it. **Change both in the same edit** — the YAML's `mirrors` field names the row each change type comes from, so drift is visible.

Record each change in `state/business-state.json` at
`lanes.post_launch_ops.changeCascade`. Each record has `id`, all applicable
`types`, `recorded_at`, and `surfaces`. A surface records its status and evidence
or reason. For example, a lexicon change can record `app_in_app` as updated with
`product/ONBOARDING.md` evidence and `content_ugc_ads` as unaffected because no
ad creative uses the term. Add per-locale or per-product `variants` when those
dimensions apply. Write through the reducer; do not add a top-level duplicate.

Every surface in the union of all recorded change types must be accounted for: `updated` needs `evidence`, `unaffected` needs a `reason`, and `blocked` needs a `blocker`. Surfaces with locale, product, device, product-page, or asset dimensions need one `variants` evidence row for each applicable value. A surface left out by omission fails the gate as `change_cascade.<id>.<surface>.unaccounted` — which is the `change-cascade-incomplete` failure card, caught mechanically instead of at review time. The edge set ships with the skill and is never copied into a business repo, so a launch run records against the map but cannot edit it.

| Change type                                                                   | Cascade to                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Design contract accepted**                                                  | app → landing and optional web onboarding → Apple and Google Play product pages → screenshot plans → marketing assets → lifecycle email → prices and products when applicable                                                                                                                          |
| **Feature added / changed / removed**                                         | app → Apple and Google Play descriptions, keywords, release notes, screenshots, previews, events, and custom pages → landing → GEO/SEO → email → analytics → legal when needed → ads                                                                                                                   |
| **Core copy / feature name / brand vocabulary change** (lexicon)              | every surface that uses the term: app, onboarding, paywall, both stores, landing, schema, billing products, email, and ads                                                                                                                                                                             |
| **Onboarding flow change**                                                    | app onboarding → Apple and Google Play screenshot sets → previews → activation analytics → review timing → landing method and web onboarding                                                                                                                                                           |
| **Paywall / pricing / plan / trial change**                                   | paywall → store screenshots and products → billing → web funnel → landing prices → terms → lifecycle email → revenue analytics                                                                                                                                                                         |
| **Visual / UI / design-token change**                                         | app → Apple and Google Play screenshots and previews → icons and feature graphics → landing → email tokens → ads → `DESIGN.md`                                                                                                                                                                         |
| **New / renamed IAP or subscription product**                                 | RevenueCat product+entitlement+offering → App Store product display name/description/**promo image** → App Store listing (check whether the app description, keyword field, or in-app-event copy names the plan/tier) → paywall copy → pricing/terms → analytics product IDs → review notes            |
| **Privacy / data / SDK change**                                               | `PrivacyInfo.xcprivacy` + required-reason APIs → App Privacy answers → Play Data safety → privacy policy + terms → App Review notes (external services) → App Store listing (check for an invalidated claim, e.g. "no ads"/"no tracking", in the description or keyword field) → analytics/attribution |
| **Domain / brand / company-name change**                                      | everything in "lexicon" + email sender domains + legal entity references + landing footer + App Store seller/marketing URLs                                                                                                                                                                            |
| **Design token / feature / copy / pricing change affecting generated assets** | all Higgsfield-generated surfaces that carry the changed token → see **Generated-Asset Regeneration** below                                                                                                                                                                                            |

## Generated-Asset Regeneration

Higgsfield-generated assets embed design tokens, feature names, copy, and pricing at generation time. When any locked token changes, every previously-generated asset that carries it is **stale** and must be regenerated before the change is considered done.

**Stale-trigger changes:** locked design token (palette, typography, illustration style), feature addition/removal/rename, brand vocabulary or copy change, pricing/offer change.

**Surfaces that go stale:**

| Surface                                                                                             | Regeneration path                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ad creative** (UGC video, DTC static, Marketing Studio)                                           | See the **App Store URL → UGC Ad Batch (Click-to-Ad)** and **Soul-Once Founder-Face Ads** recipes in `tool-recipes/visual-and-motion-production.md`                                     |
| **Screenshot supporting art** (backgrounds, mascots, illustration overlays — not the real-UI layer) | See the **Cheap-First Direction** recipe in `tool-recipes/visual-and-motion-production.md`; real-UI screenshot layer is re-rendered separately per the Visual/UI row in the cascade map |
| **App Preview B-roll** (motion backdrops, intro/outro art — NOT the real app footage layer)         | See the **Master → All Platforms** recipe in `tool-recipes/visual-and-motion-production.md`; real app footage source must remain unchanged                                              |
| **Promoted-IAP promotional images**                                                                 | See the **Cheap-First Direction** recipe in `tool-recipes/visual-and-motion-production.md`; re-upload via `app-store-connect-cli.md` after founder approval                             |
| **CPP and in-app-event art**                                                                        | See the **Seasonal restyle Refresh** recipe in `tool-recipes/visual-and-motion-production.md` as a model; re-upload via `app-store-connect-cli.md` after founder approval               |
| **Viral share cards**                                                                               | See the **Cheap-First Direction** recipe in `tool-recipes/visual-and-motion-production.md`; update `CONTENT_ASSETS.md` and linked `viral-growth-loops.md` surfaces                      |
| **Lifecycle-email header art**                                                                      | See the **Cheap-First Direction** recipe in `tool-recipes/visual-and-motion-production.md`; update `resend-email-ops.md` template references                                            |

**Guardrails that apply to every regeneration:**

- Higgsfield output is supporting art only. It must **never substitute** for truthful real app UI in store screenshots or App Preview footage.
- Every generation prompt must carry current `DESIGN.md` tokens. Regenerating without an updated brief defeats the purpose of a cascade.
- Confirm spend with the founder per [`paid-tool-routing.md`](../operations/paid-tool-routing.md) before each generation run. Surface current credit balance (`mcp__claude_ai_Higgsfield__balance`) at the confirmation prompt.
- Record every new asset in `CONTENT_ASSETS.md` with updated `prompt_brief`, `source_job_id`, and `virality_score` fields, and mark prior entries `status:superseded`.
- Store uploads, ad launches, and public posting remain **founder-gated** regardless of regeneration trigger.

## Process

1. Classify the change with `types`. Use every applicable type and the union of their edges; never choose a convenient primary type to reduce the work.
2. Start a read-only surface audit before the changed app slice merges.
3. List each affected surface. Include each Tier 1 locale and each required store device size.
4. Assign update tasks with disjoint file paths. Run them while the next app slice continues.
5. Update each surface or record why it is not affected. Record a blocker when the source does not exist yet.
6. Re-render derived assets. Do not use a document edit as proof of a screenshot or video update.
7. Check canonical terms across the app, both stores, landing, schema, billing, and email.
8. Record the cascade in `state/LAUNCH_TRACE.md` and `state/business-state.json`. Report the changed evidence and next action.
9. Keep public deployment, store changes, prices, legal changes, and paid generation behind founder approval.

## Done Definition

A change is done only when each affected surface has a recorded result. Re-render each affected asset. Keep terms consistent across all surfaces.

Record the cascade in state and trace files. Obtain founder approval before each protected public action.
