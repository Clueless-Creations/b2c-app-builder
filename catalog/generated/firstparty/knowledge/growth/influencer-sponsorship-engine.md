# Influencer Sponsorship Engine

Use this when growth depends on paying established creators to integrate the app into their own content: sponsorship DMs and calls, flat/CPM/view-guarantee deal structures, brand-account credibility, meme/topic-page amplification, or per-deal payback tracking.

This reference factors in a user-provided consumer-app monetization playbook ("How to Scale Your App to $10K/Month", George Lampropoulos, 2026 — the operator behind Wrestle AI). Treat it as a practitioner case study, not universal law: borrow the deal mechanics and qualification filters, verify every rate against the current niche, and reject the tactics the Rejected Tactics section names.

Scope split: `ugc-creator-engine.md` owns founder-run creator operations — hired micro-creators posting on new niche accounts the program controls, where the algorithm is the distribution engine. This file owns sponsoring creators who already have an audience, where the creator's existing reach and trust are the distribution engine. Both record into `growth/UGC_PLAYBOOK.md`. Load `viral-growth-loops.md` when sponsored content is expected to feed a product-led loop, and `paid-user-acquisition.md` when spend moves to ad platforms.

## Contents

- Fit Gate
- The Five-Second Demo Moment
- Brand Account Credibility
- Prospecting: Engineer The Feed
- Creator Qualification
- Outreach
- The Call And The Deal
- Integration Formats
- After The Post
- Meme And Topic Pages
- Economics And Measurement
- Channel Sequencing
- Rejected Tactics
- Outputs
- Common Failure Modes

## Fit Gate

Sponsorships are a strong candidate when:

- the app has a demo moment a creator can show in 5-15 seconds that a viewer understands without narration (next section)
- the niche has identifiable creators whose audience matches the paying buyer, not just the topic
- onboarding, paywall, and attribution can convert and measure a traffic spike (`onboarding-conversion.md`, `analytics-attribution.md`)
- the founder has approved a sponsorship budget; every creator payment, contract, and public post is founder-gated

Deprioritize sponsorships when there is no visible product moment, the audience is committee-led or high-ticket enterprise, or the category is regulated and claims cannot be reviewed — the same disqualifiers as the `ugc-creator-engine.md` fit gate. Record the fit decision in `growth/UGC_PLAYBOOK.md` and trace it into `state/LAUNCH_TRACE.md`.

## The Five-Second Demo Moment

A sponsorship buys 10-15 seconds inside someone else's video. The unit being sold is not the app; it is one moment that makes a viewer stop and want to try it without a word of explanation. The playbook's examples all share the shape: perform one obvious action, receive personalized feedback the viewer cannot get anywhere else (photograph food → calories; upload a match → what you did wrong).

This is the sponsorship-facing test of the magical moment in [`eleven-star-experience.md`](../experience/eleven-star-experience.md): if the defining product moment cannot be shown convincingly in five seconds of screen time inside a creator's normal content, either the moment needs redesign before creator spend starts, or sponsorships are the wrong first channel. Work the test backward during ideation: before the spec hardens, describe the 5-second clip a creator would drop into their content, then confirm the product actually produces that clip truthfully. A moment that only demos with staged data fails the fit gate.

Push the demo moment in roughly nine of ten sponsored posts. Rotate a secondary feature only when a specific creator's audience saturates (per-creator returns dip across consecutive posts), and expect the secondary uptick to be smaller. The headline stays the headline.

## Brand Account Credibility

The brand's own social account does two jobs at once and must be set up before outreach starts:

- **Sales funnel.** A viewer who sees the app tagged in a creator's post clicks through to the brand page. Three strong pinned demos plus a clear bio CTA turn that click into an educated, primed store visit. Warm traffic gets warmer.
- **Negotiating position.** Creators check the profile before replying. A page showing collab posts with other creators reads as "these are the going rates"; an empty page reads as "no-name app" and doubles the quoted price.

Setup checklist:

- clean bio: who this is, what the app does, one CTA link
- 3 pinned product demos built from the five-second demo moment
- collab-post every sponsored video with the creator so both audiences see it and the page accumulates visible partnerships
- platform verification is a paid decision — route through [`paid-tool-routing.md`](../operations/paid-tool-routing.md) and check the current price; do not quote it from memory
- grow followers with content and collab posts only; purchased followers are a Rejected Tactic

## Prospecting: Engineer The Feed

The lead list comes from behaving like the ideal customer, not from search:

1. Write the ideal-customer profile from `strategy/RESEARCH.md`.
2. On a dedicated research account, consume exactly what that person would: watch their videos to completion, like, save, follow.
3. Within days the recommendation feed becomes a stream of relevant creators. Prospecting becomes scroll → qualify → outreach.

This works best when the founder is the customer (they already know what the audience watches), which is one more argument for the passion filter in idea selection. For tool-backed prospecting at volume, the social-research recipes in `tool-recipes/research-intelligence.md` (XPOZ Instagram/TikTok user and hashtag lookups) can replace or supplement manual scrolling.

To delegate prospecting to a VA, hand over written criteria, not vibes: follower band, average-view floor, engagement shape, posting frequency, target hashtags, and the disqualifiers below. Expect delegated lists to need heavier sifting. VA hire and pay are founder-gated spend.

## Creator Qualification

Followers do not matter. Views and engagement do — followers are a stock, views are the flow being bought.

Green flags:

- average views comfortably above the niche's outreach floor (the playbook used ~25K average as its bar; set the floor from the niche's actual distribution)
- a stable view floor — worst videos still land within a few multiples of the average
- performs across more than one platform
- a distinct style where it is obvious why the audience shows up; not a trend-hopper
- comment sections with real sentences from a recognizable community

Red flags:

- wildly inconsistent views (one 100K video between 5K videos)
- generic trend content with no owned format
- emoji-only or bot-pattern comments — low-quality or purchased engagement
- high views with near-zero comments: an audience that will not comment rarely downloads

## Outreach

Outreach is a volume game run from the credible brand account. Creators' inboxes are flooded; the message that gets answered leads with payment and stays short:

- open with the offer: "Paid promo?" or "Paid promo for [handle]?"
- one sentence on what the app does — enough to create curiosity, not a feature list
- one clear invitation to talk

Every reply gets steered off DMs and onto a call before any number is named. If a creator pushes for a price over text, deflect once ("I'd rather walk you through the integration first — here's my number") and if they hard-close with "just send your offer," let them go warm: "No problem, hit me up when you're free." The sponsor is the buyer; do not negotiate from the supplicant position.

Track every contact in `ugc/creator-list.csv` (platform, handle, average views, floor, status, next action). Daily outreach volume is a founder-set target; the playbook ran ~100 DMs/day when starting cold and dropped volume as inbound replaced outbound.

## The Call And The Deal

Sponsorship deals are sales calls. The structure that closes profitably:

1. **Open specific.** Compliment one real piece of their content by name. It proves this is not a mass blast and it buys rate goodwill.
2. **Describe the integration before money.** How the app appears inside their existing content style, with past examples when they exist.
3. **Ask their rate first**, then anchor to value, not to their number.

Deal math and structure (verify rates against the current niche before quoting; these are the playbook's 2026 consumer-app numbers, not law):

- project views conservatively: underestimate their average, multiply by video count
- anchor flat offers in the $2-3 CPM range against that conservative projection
- attach a **minimum view guarantee** set low enough that the creator is confident clearing it; if they fall short they keep posting until it is met
- pay 20-50% up front, the rest when videos are delivered and the guarantee is met
- when the flat rate is rejected, reframe as a bet on themselves: per-1K-view CPM pay with a per-video cap so one viral hit cannot break the budget — but let the creator open that door; leading with commission reads as bait
- track views for a fixed window (the playbook used 7 days) and say why: unbounded tracking makes the books unmanageable. Recurring weekly posting with a weekly payday drops effective CPM because views keep accruing after the window closes
- after presenting the offer, stop talking

Objection handling, truthfully:

- "Brand X paid me thousands per post" → "Are you still working with them?" One-off brand-awareness deals overpay and do not return; the counter-pitch is a long-term weekly partnership, which most creators have never been offered.
- "Sponsored content tanks my engagement" → that is the argument for subtle integration into a format that already performs, not a typical ad read. Only claim "our promos beat creators' averages" when the tracker proves it.

Every deal needs the contract checklist from `ugc-creator-engine.md` (usage rights, pay terms, termination, tax forms) plus **disclosure**: the post must carry the platform's paid-partnership label and required disclosure language. A deal that depends on hiding the sponsorship is declined. Two relationship rules that compound: pitch long-term partnerships on every call (recurring posts raise floor revenue weekly and are the thing creators cannot get elsewhere), and invest in the relationship personally — creators work harder and price friendlier for a mission they believe in.

## Integration Formats

The creator is the hero; the app is a tool in their hand. Before briefing:

- study their last ~20 posts and note what actually performs: tone, humor, pacing, editing
- use their proven format; never force a new style onto a creator who knows their audience
- the app is a moment inside the content, not the topic of the content
- keep their voice — their language and energy with the app dropped into real life

Format menu, matched to whatever already works for that creator:

| Format                | How the app appears                                                                |
| --------------------- | ---------------------------------------------------------------------------------- |
| Day in the life       | a natural step in their routine; links the app to disciplined, aspirational people |
| Routine video         | part of a stated habit ("every night I check this")                                |
| Educational / tips    | a recommended tool inside real advice                                              |
| Comedy / skit         | a prop or the punchline; self-deprecation is fine                                  |
| Before / after        | the quiet reason behind the improvement, not the focus                             |
| Storytelling          | supports the personal-growth arc                                                   |
| Q&A / comment replies | the honest answer to a real audience question                                      |

The demo moment must land inside the first 30 seconds of the video and read in 5-15 seconds of screen time. Brief against `no-slop-writing.md` for claims; protect the creator's spoken voice, not brand copy.

## After The Post

The post is the top of a funnel, not the finish line. Load `distribution-first-niche.md` before creator spend. A paying audience and a named channel must exist first.

- **Read payback fast.** A working deal shows revenue signal within 1-3 days depending on trial length. Log installs/trials/revenue per deal in the ledger and decide keeper vs one-off while the next call is still pending.
- **Comment from the brand account.** The comment section becomes a second funnel: viewer reads comments → notices the brand → visits the page → hits pinned demos. This is legitimate because the brand is identified.
- **Collab-post the video** so it lives on the brand page as credibility for the next negotiation.
- Planted questions from friends posing as organic viewers are a Rejected Tactic — see below.
- When a creator's returns dip across consecutive posts, their audience is saturating: rotate to a secondary feature for a smaller uptick, or move budget to the next creator.

## Meme And Topic Pages

Meme and topic pages are an amplification channel for already-proven creative, not a discovery channel:

- repost the best-performing sponsored or organic video on niche meme/topic pages
- target CPMs well below creator rates (the playbook paid $0.50-1.00 effective CPM, capped around $50 per post at small scale)
- the strongest pages have community identities; match the content's tone to the page
- disclosure still applies: a paid repost is a paid placement and must be identifiable as one. Framing paid content as fake news or editorial is a Rejected Tactic, whatever the engagement math says

## Economics And Measurement

Keep a per-deal ledger in `ugc/sponsorship-ledger.csv`:

- creator, platform, follower count, average views, view floor
- deal shape: flat / CPM+cap / guarantee terms, upfront %, tracking window
- spend, tracked views at window close, effective CPM
- installs, trials, purchases, revenue at day 1 / 3 / 7 (attributed per `analytics-attribution.md`: creator codes, UTMs, self-reported attribution)
- payback verdict and next action (rebook weekly, rotate feature, drop)

Benchmarks to tune, not worship:

- **Revenue per download (ARPU).** The playbook targets ~$2 in month one. Content style moves it: broad low-intent UGC reach pulls it down; creator posts that clearly explain the app pull it up. A falling ARPU with rising views means the content is buying the wrong audience.
- **Effective CPM per creator over time.** Weekly recurring deals should trend cheaper as post-window views accrue.
- **Views alone prove nothing** — the k-computation rule in `viral-growth-loops.md` and the vanity-reach anti-pattern in `revenue-monetization.md` §3 apply here unchanged.

## Channel Sequencing

Sponsorships and paid ads are different tools at different stages. Creator deals are the high-multiple small-budget channel: hand-picked audiences, negotiated rates, and relationship pricing can return multiples that ad auctions cannot, but each deal is manual and the supply of well-priced creators in a niche is finite. Paid ads return lower multiples but scale without phone calls.

Sequence: prove the demo moment and payback economics through sponsorships first, then move winning creative into paid distribution per `paid-user-acquisition.md` — including hiring one proven creator to make ads directly instead of posting to their own page. When sponsored creative feeds ad campaigns, competitor ad-library mining (in that reference) supplies the angle map.

## Rejected Tactics

The playbook contains tactics this skill rejects. Name them so no agent reinvents them:

- **Purchased followers.** Violates platform terms, poisons the engagement signal the qualification filters depend on, and risks the brand account that the whole engine runs through. Credibility comes from collab posts and pinned demos.
- **Undisclosed planted comments.** Having friends pose as organic viewers asking "what app is that?" is astroturfing. The brand account commenting under its own name achieves the same funnel effect honestly.
- **Undisclosed or news-framed paid posts.** Every sponsored post and paid repost carries the platform's paid-partnership disclosure. Engagement gained by disguising an ad is liability, not growth.
- **Incentivized or priming rating screens.** "Support the mission, rate 5 stars" placed before the paywall violates store policy. The compliant version — the native review prompt outside first-run onboarding, at a later natural success once eligibility is earned by first value — is already the default in `onboarding-conversion.md`.
- **Fake-computation FOMO.** An analysis animation must run the real analysis. Gating the reveal of a real result behind the paywall is legitimate suspense (see Held Value Reveal in `onboarding-conversion.md`); animating nothing is deception.

## Outputs

Create or update when sponsorships are in scope:

- `growth/UGC_PLAYBOOK.md`: sponsorship track — fit decision, budget and founder gates, brand-account setup, outreach volume targets, deal-structure defaults, disclosure rules, saturation/rotation rules
- `ugc/creator-list.csv`: prospect pipeline with qualification data and outreach status
- `ugc/sponsorship-ledger.csv`: the per-deal economics ledger above
- `analytics/ANALYTICS.md`: creator codes, UTMs, and attribution sources for sponsored posts
- `state/LAUNCH_TRACE.md`: rows connecting the demo moment, creator deals, attribution, and revenue evidence

## Common Failure Modes

- Sponsoring creators before the app has a five-second demo moment, then blaming the creator when nothing converts.
- Qualifying on follower count instead of view flow and comment quality.
- Negotiating in DMs and paying rate-card prices a call would have halved.
- Flat deals with no view guarantee, no tracking window, and no ledger row — spend with unreadable results.
- One-off posts with no long-term offer, leaving the cheapest lever (recurring weekly posts) unused.
- Pushing a secondary feature before the demo moment has saturated.
- Buying meme-page reposts of unproven creative.
- Reading views instead of day-1/3/7 payback and ARPU per deal.
- Skipping disclosure, contracts, or founder spend gates because a deal is small.
- Confusing this lane with founder-run creator ops (`ugc-creator-engine.md`) and applying the wrong payment shape to the wrong relationship.
