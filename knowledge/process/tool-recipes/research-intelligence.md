# Research And Market Intelligence

Use current tools and live data whenever possible. Treat this file as workflow, not fixed facts.

Part of the [Tool Recipes](../tool-recipes.md) index. Before using any paid or account-gated tool named below, honor the **Paid Tool Decision Protocol** and **Founder-Only Gates** in that index.

---

## AppKittie App-Store Intelligence

Purpose: choose the market/category by revenue and downloads, then position inside or against it. Also use AppKittie to monitor competitors, ads, creators, screenshots, keywords, reviews, and post-launch deltas.

Access:

- AppKittie is a paid/account-gated intelligence path. If unavailable in the runtime, use [`paid-tool-routing.md`](../../operations/paid-tool-routing.md) before substituting public store research.

Run:

- `search_apps` across 3-5 plausible categories or query clusters
- top revenue apps, top download apps, trending apps, and fastest growth apps by downloads/revenue/reviews
- filtered searches for apps with Meta ads, Apple Search Ads, creator partnerships, websites, or contact emails
- `get_app_detail` for the top 5-10 competitors, including screenshots, IAPs, developer/site/socials, historical downloads/revenue/reviews/ratings, ads, and creator partnerships
- `get_app_reviews` for 50-300 recent reviews across the most relevant competitors, depending on credit budget
- `batch_keyword_difficulty` for the candidate name, subtitle, category terms, competitor alternatives, and long-tail pains; use `get_keyword_difficulty` for final deep dives
- `get_supported_countries` before non-US keyword research

Record:

- monthly downloads and revenue estimates
- lifetime downloads/revenue where available
- rating and review count
- update recency
- pricing and trial structure
- in-app purchase tiers
- app age and growth rate
- ad presence and creative pattern
- screenshots and app-store positioning
- user complaints and feature requests
- Meta/ASA ad presence and creative patterns
- creator/influencer partnership signals
- contact emails, websites, and social links for partnership/press/ads research
- keyword popularity, difficulty, traffic, and top-ranking apps by country

Decision rule:

- The storefront category is where users already search and spend.
- The product identity can be a contrarian wedge against that category.
- If a phrase has no search volume, keep it as brand/category creation, not the only acquisition path.
- AppKittie data is directional unless first-party; cite it as estimates and pair it with reviews/social evidence.

## Social-Language Research

Purpose: find the words users already use for the pain.

Sources:

- Reddit subreddits around the job-to-be-done and competitor categories
- TikTok hashtags and creator formats
- X/Twitter keyword clusters
- YouTube/creator comments when the concept is creator-led

Preferred local tool:

- Use XPOZ for Reddit, TikTok, X/Twitter, and Instagram social/market-language research when available.
- Prefer the installed XPOZ MCP/CLI. If only a local CLI exists, resolve its path before use instead of assuming it is on `PATH`.
- Put global flags before the platform: `xpoz-cli --output json tiktok search_posts ...`
- Check auth first: `xpoz-cli --output pretty auth status`
- Useful platforms/methods: `reddit search_posts`, `reddit search_comments`, `reddit get_subreddit_with_posts`, `tiktok search_posts`, `tiktok search_users`, `tiktok get_posts_by_user`, `twitter search_posts`, `twitter count_posts`, `instagram search_posts`, `instagram get_posts_by_user`.

Access:

- XPOZ is a paid/account-gated research path. If auth is missing or the CLI is unavailable, ask before using public search, platform-native browser search, reviews, or founder-provided screenshots as the fallback.

Queries:

- problem phrases from the source spec
- competitor names plus "quit", "alternative", "too much", "expensive", "worth it"
- category verbs, not just nouns
- aspirational phrases and "I wish..." phrases
- trend containers such as "Sunday reset", "weekly review", "AI coach", "habit tracker", adapted to the current product

Record:

- verbatim language
- emotional register
- repeated failure modes
- screenshots/posts worth citing
- social formats that can become ads or organic content

Rules:

- Do not overfit to one viral post.
- Separate broad cultural trend from app-store search behavior.
- Keep sensitive or copyrighted material summarized unless the source allows direct quotation.
- Prefer creator handles, subreddits, compact hashtags, and competitor names over broad generic phrases; broad XPOZ queries are often noisy.
- Record query, platform, date, result URL/post ID/creator handle where possible, and how the evidence changed positioning or copy.

## Firecrawl Web Intelligence

Purpose: inspect public web surfaces that AppKittie and XPOZ do not cover well: competitor landing pages, pricing pages, docs, help centers, policy pages, blog/SEO content, feature pages, and funnel claims.

Use Firecrawl MCP/API when available:

- `firecrawl_search` for broad web discovery with scraped result content
- `firecrawl_map` to discover URLs on a competitor/domain and find pricing, terms, support, blog, FAQ, or docs pages
- `firecrawl_scrape` for a single page when the URL is known
- `firecrawl_crawl` for multi-page competitor/site audits
- `firecrawl_extract` for structured fields such as pricing, plans, claims, CTAs, features, testimonials, integrations, and policy commitments
- batch scrape when comparing several competitors or policy pages

Fallback:

- Firecrawl is a paid/account-gated crawler. If unavailable or blocked, use `paid-tool-routing.md` before switching to ordinary web search, `curl`, browser snapshots, `sitemap.xml`, `robots.txt`, or manual page notes.

Record:

- source URL, crawl date, page type, extracted facts, claims copied into product/marketing, and claims rejected as unsupported
- competitor pricing and plan names
- funnel steps and CTAs
- support/privacy/contact/deletion pages
- SEO/GEO content patterns: FAQ, schema, blog topics, `llms.txt`, sitemap, and robots behavior

Rules:

- Respect robots, login walls, paywalls, and terms. Do not bypass access controls.
- Use Firecrawl for public web evidence, not for App Store intelligence where AppKittie/ASO tools are stronger.
- Do not rely on Firecrawl metadata extraction alone for schema/security checks; verify important items directly on the live page when launching.

## Refero UX Pattern Research

Purpose: ground web and mobile UX decisions in shipped product screens, styles, and flows before building app screens, onboarding, paywalls, web funnels, settings, support, and legal/account flows.

Current docs basis to refresh at runtime:

- docs index: `https://doc.refero.design/llms.txt`
- MCP server URL: `https://api.refero.design/mcp`
- Getting Started, Tools, Data Model, Examples, and Refero Skill pages

Access:

- Refero is a paid/account-gated design research path. Current docs say Refero Pro is required for MCP use and auth can be OAuth or an Authorization Bearer token.
- If Refero is not available in the runtime, load `paid-tool-routing.md` and ask before using the bundled baseline pattern pack, public inspiration galleries, Page Flows/UI Sources-style public references, app-store screenshots, or founder-provided examples.

Use the current MCP tool names:

- `refero_search_styles` for visual direction, typography, surfaces, spacing, and design-system inspiration.
- `refero_get_style` for full design guidance after choosing style candidates.
- `refero_search_screens` with `platform: "web"` or `platform: "ios"` for concrete UI patterns, components, copy hierarchy, and state handling.
- `refero_get_screen` for detailed screen metadata.
- `refero_get_similar_screens` to expand from one strong reference.
- `refero_get_screen_image` only when metadata is not enough and visual inspection is required.
- `refero_search_flows` with `platform: "web"` or `platform: "ios"` for onboarding, signup, checkout, cancellation, upgrade, account deletion, password reset, permissions, and settings changes.
- `refero_get_flow` for full journey logic, step goals, actions, system responses, and related queries.
- Current Refero docs list `web` and `ios` for screen/flow platform filters. For Android launches, use Refero iOS/mobile findings only as journey evidence, then adapt to Android-native controls, permissions, billing, and device screenshots before marking Android UX ready.

Research packet:

- 3-5 styles for the brand/design direction, with one primary and 1-2 secondary influences.
- 5-10 screens for each critical surface family: onboarding, paywall, pricing, restore, settings/account, support/privacy, empty/error/offline, referral/share, search/filter.
- 2-4 flows for each critical journey: onboarding, purchase/upgrade, cancellation/retention, restore purchases, account deletion, password reset or login recovery, and permission requests when applicable.
- A `UX_PATTERNS.md` source ledger with query, platform, selected records, observed pattern, adopted decision, rejected decisions, and caveats.
- A `ux-patterns.html` or `design/design-room.html` section rendering pattern inventory, flow maps, state matrix, and bug traps.

Rules:

- Use Refero as research ingredients, not a template library to copy.
- Preserve the onboarding conversion playbook unless the user explicitly approves a named experiment.
- Do not commit paid Refero screenshots unless licensing/permission is clear; summarize metadata and link source records instead.
- Pair Refero findings with product trace rows, analytics events, accessibility checks, and implementation state matrices.
- Record free fallback approval and limitations in `strategy/TOOL_DECISIONS.md` when Refero is unavailable.

## Name And Keyword Collision

Check:

- App Store search and exact title collisions
- high-revenue apps/games using the term
- generic utility apps that own the keyword
- domain availability
- trademark obvious conflicts
- social handle availability when relevant
- pronunciation and "did you do your ___?" usability

Decision rule:

- A beautiful name that is invisible in App Store search can still win if the brand has another acquisition path, but the launch dossier must compensate.
- Do not lock a name until ASO collision and domain options are known.

## Planning checkpoints and restart

In a registered planning workspace, use `b2c research-lookup --workspace ID --query QUERY.json --max-age SECONDS --json`
before collecting the same provider observation. The query names the provider version, connection reference,
operation and non-secret semantic parameters. Read the exact public input schema; do not store credentials.

Use `b2c research-record --workspace ID --revision REVISION --observation OBSERVATION.json --json`
to save a pending query before its authorized external dispatch. Immediately checkpoint the actual result
as observed, failed or uncertain. An observed record needs a timestamp and resolvable source references.
Keep useful evidence and sampling limitations in the bounded summary and linked workspace artifacts.
The record is a source observation, not accepted proof or a permission grant.

On restart, inspect the saved research-query summaries in business status/plan. Reuse a matching current
observation, explicitly refresh an expired one, and reconcile pending or uncertain provider requests
before replay. Recording a local pending intent does not prove the external call occurred; readback
or an explicit reconciliation is necessary when the process stopped between those steps. Do not infer
that a changed query string represents a new research need. Search the existing source ledger first.

This checkpoint route is for planning before runtime initialization. Once initialized, existing executor
attempts and receipts remain the execution owner. Do not create a competing run-state file.
