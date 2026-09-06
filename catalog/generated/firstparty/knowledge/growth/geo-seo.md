# GEO And SEO Launch Visibility

Use this before publishing or auditing a launch site, waitlist, policy pages, docs, blog/content, `robots.txt`, `llms.txt`, sitemap, schema, metadata, or any public surface that should be discoverable by search engines and AI answer engines.

This reference incorporates the GEO-first workflow from `https://github.com/zubair-trabzada/geo-seo-claude`. Treat it as a routing layer: use installed GEO skills when available, then leave concrete artifacts and verification notes in the launch package.

## 1. Specialist Skill Delegation

If the GEO skills are installed, use them instead of recreating their full audit logic:

- `geo` - broad GEO-first SEO analysis for a URL or launch surface.
- `geo-audit` - full website GEO+SEO audit with a prioritized action plan.
- `geo-technical` - crawlability, SSR, performance, security, indexability, and AI-crawler access.
- `geo-crawlers` - robots, meta tags, headers, and AI crawler allow/block map.
- `geo-llmstxt` - analyze or generate `llms.txt`.
- `geo-schema` - detect, validate, or generate JSON-LD structured data.
- `geo-citability` - rewrite pages so AI systems can quote/cite self-contained answer passages.
- `geo-content` - E-E-A-T, proof, source quality, and content structure.
- `geo-brand-mentions` - brand/entity mention and authority scan.
- `geo-platform-optimizer` - platform-specific checks for ChatGPT, Perplexity, Gemini, Google AI Overviews, and Bing Copilot.
- `geo-compare` - monthly or pre/post-launch delta tracking.
- `geo-report` or `geo-report-pdf` - client/founder-ready reporting when needed.

If these skills are not visible in the current runtime, search local skill directories for the names above or inspect the linked GitHub repository. Do not assume Claude and Codex expose the same skill/plugin surface.

## 2. Required Launch Artifacts

For any public launch funnel, create or update:

- title, meta description, canonical URL, Open Graph, Twitter/X cards, favicon/app icons, and theme color
- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- JSON-LD schema for Organization, WebSite, SoftwareApplication/MobileApplication, FAQ, BreadcrumbList, and Article/BlogPosting where applicable
- founder/company/entity facts that are consistent across site, store, social, and press pages
- privacy, terms, account deletion/privacy choices, support, and contact pages that are crawlable but not over-indexed when sensitive
- readable answer-style sections for core questions users or AI systems will ask
- for localized landing surfaces, `hreflang` tags, localized `llms.txt`/schema, and translated answer sections **only for the markets ranked Tier 1 in `LOCALIZATION_MARKET_RESEARCH.md`** (see [`localization-market-research.md`](../research/localization-market-research.md)) — localize web demand the same research-first way as the store, not by translating every page into every language

Acceptance:

- Public pages can be fetched without auth, client-only rendering failures, geofencing, or blocked bots.
- The site explains who it is for, what it does, why it is credible, and where the app/store links live.

## 3. GEO Content Rules

Write content for both humans and AI answer engines:

- use clear question-answer sections for category, problem, pricing, privacy, support, and app availability
- make important passages self-contained; avoid copy that only works with surrounding hero context
- include concrete named entities, dates, product names, jurisdictions, app categories, and supported platforms where true
- cite or link evidence for claims; unsupported claims become risks in `LEGAL_REVIEW.md` or `LAUNCH.md`
- keep brand/entity names consistent across site, App Store metadata, schema, `llms.txt`, and social profiles
- avoid thin marketing pages that have no extractable factual answers
- before drafting title tags, meta descriptions, or answer-style sections, load `knowledge/words/no-slop-writing.md`; weasel attribution and importance puffery here are also a copy-compliance risk (see §4 below), not just style noise

When a business publishes a substantial knowledge corpus, keep one canonical authored source.
Generate the human pages, question-shaped routes, Markdown export, sitemap, and `llms.txt` from that source.
Do not create multiple writable copies of the same claim.

The generated set must provide:

- chapter or topic navigation
- answer-shaped page titles and routes
- a complete portable Markdown export
- a sitemap that lists each public route
- an `llms.txt` file that points to the canonical export and topic routes
- inline dates and source pointers for time-sensitive claims

## 3a. Landing Craft: Motion And UI Generation

Landing pages and funnels are web surfaces, so framer-motion / the `motion` library and the `ui-ux-pro-max` skill apply directly here (unlike the shipped mobile binary). **Load [`landing-motion-craft.md`](../design/landing-motion-craft.md) before building or animating any landing section** — it carries the two-lane (Remotion-baked vs motion/react-live) model, the `business/growth/landing/` section library, the landing motion-token scale (`--motion-duration-reveal`/`--motion-duration-cinematic`/`--motion-easing-emphasis`/`--motion-easing-spring`/`--motion-stagger`), and the progressive-enhancement contract that `check:landing-funnel` enforces. Use them to lift conversion without hurting GEO or performance:

- Generate senior-grade landing and section layouts with the `ui-ux-pro-max` skill when available (reference-only; adapt, do not copy its data). Keep section copy answer-style and self-contained per section 3.
- Animate hero, feature reveals, and CTAs with framer-motion reading the tokenized `--motion-*` scale (micro-interactions 150-300ms; in-view reveals and cinematic beats use the landing scale above). Reuse the same `motion.*` tokens as the app so brand motion is consistent across surfaces.
- Server-render or statically render the content; hydrate motion after. Entrance animations must not delay LCP/INP, hide text from crawlers, or gate first paint — motion is progressive enhancement.
- Respect `prefers-reduced-motion` and keep above-the-fold content readable without JavaScript.

## 4. Copy Compliance Pre-Edit Scan

Run this scan before writing or accepting any landing copy, not only before deploy. These are trust-breaking patterns that have required founder corrections after deployment. Run `knowledge/words/no-slop-writing.md`'s self-check (§6) alongside this scan — weasel attribution and importance puffery are both style slop and a compliance risk here.

**False or unverifiable claims — do not write without live proof:**

- Superlatives tied to a ranked cohort: "Top N unlock", "Top 100 referrers get", "first N users receive". Remove unless the waitlist system actively enforces the cutoff and the size is not invented.
- Unshipped-feature promises: device integrations ("WHOOP V2 V3 when they ship"), integrations not yet in code, or features scoped to V2/V3. Remove or move to a clearly labeled roadmap section.
- Implied authority or credential claims: "tested by applied performance researchers", "clinically validated", "neuroscience-backed". Remove unless the founder supplies verifiable citations.
- Lifetime or free-tier promises not reflected in `revenue/REVENUE_OPS.md`: "free first year of Pro at launch", "lifetime access". Cross-check against current pricing and RevenueCat entitlement design before writing.
- Scarcity/urgency claims without a live enforcement mechanism: "spots are almost gone", "limited availability".

**JSON-LD schema check:**

- After writing or modifying any page that includes `application/ld+json`, verify the JSON parses (`JSON.parse(...)` locally or via `jq .` on the raw tag value). Invalid JSON-LD is silent in browsers but blocks structured-data rich results.
- If schema sections reference product names, prices, or dates, cross-check them against `DESIGN.md`, `revenue/REVENUE_OPS.md`, and current copy before deploy.

**Waitlist idempotency contract:**

- Any landing page that collects email for a waitlist must guarantee: duplicate email submissions return HTTP 200 (not 4xx), with a de-duplicated response message. Test with a repeated submit before marking the funnel live.

## 4a. DNS MX Pre-Check Before Writing Contact Email Addresses

Before writing any contact email address (support, privacy, legal, security) into a public page or legal document:

```bash
# Check MX records exist before using the domain for contact addresses
dig MX yourdomain.com +short
# or: host -t MX yourdomain.com
```

If the domain returns no MX records:

- Do not use `@yourdomain.com` addresses in the published copy.
- Use a known-working fallback address (e.g. an existing provider domain or a forwarding alias that has been tested), and record the gap as a failure card with `id: legal-contact-email-mx-unverified`.
- After DNS MX records are live and tested, update the pages and close the card.

This check is required before drafting privacy policy, terms of service, support pages, or any public page where a contact address appears. See also `knowledge/trust/privacy-terms.md` section 5: "contact emails listed on the pages receive mail and have an owner."

## 5. Technical GEO/SEO Gates

Before calling the funnel launch-ready:

- verify live HTTP 200 for homepage, `/privacy`, `/terms`, deletion/privacy choices, `robots.txt`, `sitemap.xml`, and `llms.txt`
- inspect rendered HTML for server-side or static title, description, canonical, OG tags, schema, and meaningful body copy
- confirm AI/search crawlers are not accidentally blocked in `robots.txt`, meta robots, headers, or CDN settings
- run schema validation or at least parse JSON-LD
- verify canonical domain, redirects, HTTPS, compression, cache headers, and security headers
- verify mobile readability and no text overlap
- check that analytics/session replay/cookies match privacy disclosures

Useful checks:

```bash
curl -I https://example.com
curl -s https://example.com/robots.txt
curl -s https://example.com/sitemap.xml
curl -s https://example.com/llms.txt
curl -s https://example.com | rg -i "<title|description|og:|application/ld\\+json|canonical"
```

## 6. AI Visibility Reporting

For launch handoff, record:

- GEO/SEO score or audit summary when a GEO skill produced one
- crawler access map
- `llms.txt` status
- schema types present and validation status
- citability gaps and rewritten sections
- brand/entity mention gaps
- platform-specific notes for ChatGPT, Perplexity, Gemini, Google AI Overviews, and Bing Copilot
- before/after changes and next monitoring date

Store this in `GEO_SEO.md` or in `AUDIT_PROMPT.md`/`LAUNCH.md` for smaller launches.

## 7. Monitoring Loop

After launch:

- rerun `geo-compare` or a manual delta check monthly
- refresh `llms.txt` and sitemap when pages change
- track brand/entity consistency across app store pages, landing pages, social profiles, press, and creator mentions
- add FAQ/content pages only when they answer real questions from reviews, support, social research, or keyword research
- verify policy/contact pages remain reachable after domain, DNS, or routing changes
