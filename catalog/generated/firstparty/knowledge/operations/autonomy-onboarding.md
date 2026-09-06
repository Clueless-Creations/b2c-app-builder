# Autonomy Onboarding

Use this at the very start of a business's first session — interactive or scheduled, since both are
sessions and both act — and again whenever the founder wants to change how much they've handed over
in one area. Waiting for the first _unattended_ run is too late: a founder who says "launch me a
business" and watches it happen is not watching every step of it, and an agent that never held this
conversation is one deciding its own permissions.

It reuses the conversation shape in [`founder-zero-operator.md`](./founder-zero-operator.md) (phase and
outcome first, plain definitions, two or three choices with the recommendation first, consequences
spelled out, a safe way to skip or come back later) applied to two specific decisions: how much this
agent should be allowed to do on its own, area by area, and how much it may spend doing it.

Nothing here is settled by silence. The first session offers one recommended operator-ready setup.
This setup lets the founder step away after the agent verifies access, tools, limits, and targets.

## Contents

- The Promise
- The Three Ways To Set Up Each Area
- The Nine Areas Of The Business
- The Step-Away Readiness Check
- Protected Moves And Your Okay
- How Much It May Spend
- The Fast Path
- After The Conversation

## The Promise

Open with something like:

> I can prepare this business so you can step away. I will check the accounts, roles, tools,
> deployment targets, store access, signing access, and spending limit now. I will then build,
> create assets, deploy the approved website, and upload approved store material without asking
> again. You can change or revoke this access later.

## The Three Ways To Set Up Each Area

Every area of the business gets one of three settings. Explain these once, before going area by
area:

- **Ask me first.** The safest setting. I'll research, draft, and prepare things in this area, but
  I stop and check with you before anything actually happens. Nothing moves without your yes.
- **Handle the routine stuff.** I do the everyday work in this area myself and tell you what I did
  afterward. I still stop and ask before anything unusual, risky, or outside the ordinary pattern
  for this area.
- **Full trust.** I run this area on my own judgment, start to finish. I use standing approvals for
  named accounts and routine public work. I stop only when the work exceeds a recorded limit or
  changes a protected item. See "Protected Moves And Your Okay" below.

If the founder isn't sure about an area, the safe move is to skip it: nothing in that area happens
on its own until they decide, and it comes back up later rather than staying an open question
forever.

## The Nine Areas Of The Business

Walk through these one at a time, or all at once if the founder takes the fast path below. For
each area: say what it covers in one sentence, give the recommended setting first, then the other
two options, then the skip route.

### Product

What you're building: the market research behind it, the product itself, how it feels to use, and
every word inside it.

- **Recommended: handle the routine stuff.** I'll keep researching, refining, and writing here on
  my own, and check with you before anything unusual.
- Ask me first, if you'd rather see everything before it's final.
- Full trust, if you want me making the calls here without checking in.
- Not sure? Skip it for now — I'll keep this area on the safest setting until you decide.

### Design

Look and feel: brand, visuals, motion, and the on-screen craft.

- **Recommended: handle the routine stuff.** I'll keep the visual system moving on my own and flag
  anything that's a real style decision rather than routine polish.
- Ask me first, if you want to review the look before it ships.
- Full trust, if you're comfortable with me making style calls independently.
- Not sure? Skip it for now.

### Engineering

Building the app: the code, the architecture, and getting it running on real devices.

- **Recommended: handle the routine stuff.** I'll write and ship ordinary code changes myself and
  flag anything structural or unusual.
- Ask me first, if you want to see changes before they land.
- Full trust, if you want me building independently.
- Not sure? Skip it for now.

### Growth

Marketing and growth: getting people to find and try the app.

- **Recommended: handle the routine stuff.** I'll run ordinary growth work — content, outreach,
  everyday campaign upkeep — on my own and flag anything that's a real strategy change.
- Ask me first, if you want to approve growth moves before they go out.
- Full trust, if you want me driving growth independently.
- Not sure? Skip it for now.

### Analytics

Analytics and tracking: knowing what's working and what isn't.

- **Recommended: handle the routine stuff.** I'll keep tracking and reporting on my own and flag
  anything that looks off.
- Ask me first, if you want to review findings before I act on them.
- Full trust, if you want me acting on what the numbers say without checking in.
- Not sure? Skip it for now.

### Revenue

Pricing and getting paid: subscriptions, purchases, and the money side.

- **Recommended: handle the routine stuff.** I keep products, entitlements, approved offers, and
  billing operations current. I do not choose a new price, trial, or payment account.
- Handle the routine stuff, if you want me managing the everyday money work myself and only
  flagging anything unusual.
- Full trust, if you want me running this independently. Spending beyond what's routine is always
  a protected move either way — see below.
- Not sure? Skip it for now — this stays on the safest setting until you decide.

### Store

App Store and Google Play: the listing, screenshots, and the submission itself.

- **Recommended: full trust.** I create and update listings, screenshots, previews, product pages,
  release notes, and review information. I upload builds to TestFlight and internal or closed Play
  tracks when the standing approval names the app, account, and track. I do not publish a final
  production release unless that exact release is also approved.
- Handle the routine stuff, if you're comfortable with me keeping the listing current on my own.
- Full trust, if you want me managing this independently.
- Not sure? Skip it for now.

### Trust

Privacy, security, and legal: keeping the app, and your users' data, safe and compliant.

- **Recommended: handle the routine stuff.** I keep security, privacy inventories, disclosures,
  and compliance evidence current. New legal promises and final legal text stay protected.
- Handle the routine stuff, if you want me keeping this current on my own and flagging anything
  that changes what the app promises.
- Full trust, if you want me running this independently. Changing a price or a legal term stays a
  protected move either way — see below.
- Not sure? Skip it for now — this stays on the safest setting until you decide.

### Operations

Running the business day to day: accounts, tools, and the operating work behind the scenes.

- **Recommended: handle the routine stuff.** I'll keep the operating work moving on my own and
  flag anything unusual.
- Ask me first, if you want to review this work before it happens.
- Full trust, if you want me running this independently.
- Not sure? Skip it for now.

## The Step-Away Readiness Check

Run this once before build work starts. Ask one combined question, not one question per provider.
Offer the operator-ready choice first. Then inspect and verify each item yourself.

The check covers:

- autonomy grants for all nine business areas
- a spending amount, currency, period, and stop condition
- founder-owned business email, recovery, 2FA, and revocation paths
- Doppler or the approved secret manager and a durable operator identity
- source control, CI, hosting, DNS, and the exact website project and environment
- image, video, copy, screenshot, device, simulator, and localization tools
- Apple Developer, App Store Connect, signing, TestFlight, and upload roles
- Google Play Console, service-account access, app signing, and testing-track roles
- analytics, revenue, email, support, and social accounts that are in scope
- standing approval envelopes for the routine operations below

The agent records the matching protected authorization and separate standing approvals behind this
conversation. Each approval names the provider, account, project or app, environment, exact work
and resources, exclusions, expiry, and rollback route. It cannot use a broad wildcard. Prepare
approvals for:

1. Deploy the approved landing site to the named preview and production project.
2. Generate and revise marketing, landing, store, and lifecycle assets inside the spending limit.
3. Apply approved website copy, onboarding, metadata, screenshots, previews, and product pages.
4. Upload signed builds to TestFlight and approved Play testing tracks.
5. Update approved prices only when the exact price table has separate pricing approval.

Do not ask again when a current capability and standing envelope match the action. Record the
action, read back the result, and continue. If several permissions or tools are missing, combine
them into one founder handoff. Continue all work that does not depend on those missing items.

The founder can choose an assisted setup instead. In that mode, use ask-me-first settings and
prepare drafts without publishing. A skipped answer grants nothing.

## Protected Moves And Your Okay

Even at full trust, seven kinds of moves need a current standing or one-shot approval. `docs/authority-envelopes.md` names what actually enforces each one. Read it before treating any of these as fully covered by a standing envelope:

- Spending money beyond the routine, already-approved amount
- Connecting a new account or changing a credential role
- Changing a price or a legal term
- Publishing outside the approved site, store, or copy scope
- Any post in the founder's public voice — a social post, a launch announcement. This always needs a fresh, per-item decision. It never runs on a standing envelope, no matter how exactly it matches an approved scope
- Submitting or releasing an app outside an exact, version-pinned release envelope
- Deleting or otherwise permanently changing something

If the founder wants to pre-approve one of these, collect all of the following before recording
it — a pre-approval with any of these missing does not take effect:

1. **Exactly what this covers.** Name the provider, account, project, environment, allowed
   operations, resources, and exclusions.
2. **A cap, and how often it resets.** A maximum for one action, a maximum for a stretch of time,
   and whether that stretch is a day, a week, a month, or a single work session.
3. **When this pre-approval runs out.** A firm date. It does not renew itself — when it passes,
   the founder is asked again.
4. **What happens if it goes wrong.** Either a real way to undo it ("I can reverse this by doing
   X"), or, for the handful of moves that truly can't be undone — submitting to a store, deleting
   something for good — a plain acknowledgment that it can't be undone, plus the exact steps that
   limit the damage if it does go wrong.

Never record a vague or open-ended pre-approval. One onboarding answer can create several separate
envelopes. Each envelope must cover only one protected category and one clear operation family.

## How Much It May Spend

The settings above answer whether the agent may act. They do not answer how much it may commit, and
those are different questions — a business with all nine areas granted and no money answer still
cannot pay for a web address. Ask this once, in the same conversation:

> Separately from what I'm allowed to do: how much is this business willing to spend, and over what
> stretch of time? I'll work inside that and stop when it's used up, instead of asking you to
> approve every small thing. If you'd rather not set anything aside yet, that's a fine answer — I'll
> bring you each spending decision as it comes.

For each area that gets money, collect three things: **which area** it belongs to, **an amount and a
currency**, and **how often it resets** — a day, a week, or a month. The founder can approve a
repeating budget during onboarding. The agent stops at the ceiling and reports actual spending.
It does not infer a higher limit.

Setting nothing aside is a real answer and the default. It blocks nothing that costs nothing; it
means spending waits for the founder each time instead of running inside an agreed limit.

Keep this separate from a pre-approval above. An approval envelope says which operations are
allowed. A budget says how much the area may use. Collect both during step-away setup so routine
spending does not create repeated questions.

## The Fast Path

Offer this first:

> I can set up step-away mode now. I will use full trust for product, design, engineering, growth,
> store, and operations. I will use routine authority for analytics, revenue, and trust. I will
> verify every required account and tool, and create separate standing approvals for website
> deployment, asset creation, store material, and test-build uploads. I will stop only for missing
> access, a budget overrun, a new price or legal promise, an identity change, deletion, a social or
> public-voice post, or a final public release that you did not approve here. Do you want this
> recommended setup?

If they say yes, collect the spending limit and release choice in the same exchange. The release
choice is either test uploads only or one exact production release. Do not add later confirmation
steps for operations already covered by the resulting standing envelopes.

## After The Conversation

Once the founder has answered, put their choices into effect right away — there's no separate
"activate" step. Tell them plainly what just changed and where they can see and change it later:
their autonomy console shows every area's current setting, any pre-approvals in effect and when
they expire, money committed and remaining, and anything currently waiting on their decision.
Changing an answer later means having this same conversation again for just the one area they
want to revisit — nothing about the rest is disturbed.
