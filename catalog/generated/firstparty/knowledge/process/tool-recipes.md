# Tool Recipes

Use current tools and live data whenever possible. Treat this file as workflow, not fixed facts.

**This file is the index.** The recipe bodies live in one file per lane under [`tool-recipes/`](./tool-recipes/research-intelligence.md). Load **only the lane in scope** — each lane file is self-contained, and loading all of them for a single DNS change or one ad batch wastes the context the launch work needs.

The two gates below are cross-cutting: they apply to every lane and stay here so they load with the index.

---

## Recipe Routing

One line per lane: when to load it, and where the bodies live.

| Lane                                     | Load when                                                                                                                                                                                                               | Recipes                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Research And Market Intelligence         | Researching the market, competitors, audience language, competitor web surfaces, shipped UX patterns, or a candidate name                                                                                               | [`tool-recipes/research-intelligence.md`](./tool-recipes/research-intelligence.md) — AppKittie App-Store Intelligence; Social-Language Research; Firecrawl Web Intelligence; Refero UX Pattern Research; Name And Keyword Collision                                            |
| Visual And Motion Production             | Producing icons, mascots, screenshot art, ad creative, UGC video, app-preview B-roll, or any generated/rendered asset — holds the seven canonical chained recipes plus the product-ad and UGC-realism prompt structures | [`tool-recipes/visual-and-motion-production.md`](./tool-recipes/visual-and-motion-production.md) — Higgsfield Visual And Motion Production; Product Ad Structure And Prompt Craft; UGC Realism Prompt Structure; Higgsfield Chained Recipes; Remotion Content Asset Production |
| Device Capture And App Proof             | Running the app, walking a flow, reproducing a bug, or capturing truthful store screenshots and demo recordings                                                                                                         | [`tool-recipes/device-capture-and-proof.md`](./tool-recipes/device-capture-and-proof.md) — In-App Simulator, MobAI Toolbelt, Recorders, Native iOS, And CLI Simulator Capture                                                                                                  |
| Growth And Store Routing                 | Routing ASO, paid acquisition, viral loops, creator/UGC programs, Fastlane organic content, or GEO/SEO work to the owning reference                                                                                     | [`tool-recipes/growth-and-store-routing.md`](./tool-recipes/growth-and-store-routing.md) — ASO Skill Routing; Paid User Acquisition Routing; Viral Growth Loop Routing; UGC Creator Engine Routing; Fastlane Organic Growth Routing; GEO/SEO Skill Routing                     |
| Revenue, Email, And Analytics Routing    | Setting up purchases/entitlements, outbound and lifecycle email, or product analytics and attribution                                                                                                                   | [`tool-recipes/revenue-email-analytics.md`](./tool-recipes/revenue-email-analytics.md) — Revenue And Monetization Routing; Resend Email Routing; PostHog Analytics And Attribution Routing                                                                                     |
| Engineering And Agent Orchestration      | Turning the launch package into real software: Compound Engineering routing, subagent/parallel-lane rules, and the ORCHESTRATION/ENGINEERING_PLAN/PRODUCTION_READINESS record contracts                                 | [`tool-recipes/engineering-and-agent-orchestration.md`](./tool-recipes/engineering-and-agent-orchestration.md) — Compound Engineering And Agent Orchestration                                                                                                                  |
| Secrets And Environment Routing          | Adding or using any secret, provider key, service token, or CI/live environment credential                                                                                                                              | [`tool-recipes/secrets-and-environment.md`](./tool-recipes/secrets-and-environment.md) — Doppler And Secret Routing                                                                                                                                                            |
| Funnel, Domain, And Privacy Verification | Standing up or verifying the public funnel: privacy/terms research, inbound email aliases, deploy verification, the waitlist pattern, and the reusable audit prompt                                                     | [`tool-recipes/funnel-domain-and-privacy.md`](./tool-recipes/funnel-domain-and-privacy.md) — Privacy And Terms Research; Cloudflare Email Routing; Landing Funnel Verification; Cloudflare/Supabase Waitlist Pattern; Audit Prompt Pattern                                     |

---

## Paid Tool Decision Protocol

Before using a free fallback for any paid or account-gated tool, load [`paid-tool-routing.md`](../operations/paid-tool-routing.md) and ask the founder to confirm the route. Missing runtime access is not evidence that the founder lacks the paid tool or does not want to use it.

Paid/account-gated lanes in this skill include AppKittie, XPOZ, Firecrawl, Refero, Higgsfield, MobAI Plus/Pro capabilities, Fastlane AI, paid ASO/MMP/ad tools, Sideshift or creator marketplaces, and paid/account features of RevenueCat, Stripe, PostHog, and Resend. MobAI's free tier does not require spend approval; replacing its cross-platform route still requires a recorded coverage decision.

Record the selected route in `strategy/TOOL_DECISIONS.md` or the relevant ops doc:

- paid tool used
- user-provided export used
- free fallback approved
- blocked waiting for access
- deferred with reason

Do not spend tokens on the weaker fallback until the founder confirms.

## Founder-Only Gates

Always ask before:

- switching from an intended paid/account-gated tool to a free fallback
- buying a domain
- changing DNS or MX records that affect receiving mail
- changing billing, subscriptions, pricing, or spend
- using credentials or secrets not already available
- creating paid cloud resources beyond normal free-tier/dev usage
- publishing or materially changing privacy policy, terms, EULA, subscription terms, data deletion commitments, legal, medical, financial, or endorsement claims
- sending partner/creator emails
- sending marketing/broadcast email to real users
- connecting social accounts, changing social profiles, scheduling posts, canceling posts, deleting content, or posting publicly through Fastlane or another social scheduler
- force-pushing, deleting repos, dropping tables, or destructive cleanup
- final App Store submission, launch, merge, or ship/hold calls

Self-resolve:

- category framing when evidence is clear
- brand/design direction within a locked brief
- document organization
- landing stack among low-risk viable options
- sequencing of non-destructive work
