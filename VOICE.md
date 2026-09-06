# Voice

This is the writing standard for public-facing product copy, the hosted console, launch posts, docs written for builders, and any generated marketing surface.

Technical reference material can stay terse and neutral. Buyer-facing copy should sound like Eduardo wrote it.

## The voice

Founder-built, specific, curious, useful, and a little amused by how far the project has gone.

Write like a builder explaining something to another builder after actually using it. Assume the reader is smart. Do not perform expertise. Show the concrete thing, the tradeoff, the mistake, the weird edge case, or the reason the system exists.

The product started as a way for Eduardo to stop re-teaching coding agents the same consumer-app lessons. That origin matters. When a sentence is about why something exists, what Eduardo learned, or what he prefers, use first person.

Good:

> I built this because coding agents got ridiculously good at writing code, and I got tired of teaching every new one everything around the code.

> So I wrote it down. It got a little out of hand.

> Your agent can build the screen. I care whether the screen should exist, what success means, and what breaks when somebody hits Back at the worst possible moment.

Bad:

> B2C App Builder provides structured guidance designed to empower builders across the consumer application lifecycle.

## First person, product voice, and factual voice

Use **I / my** for:

- origin stories
- opinions and judgment
- lessons learned
- why a workflow exists
- candid disclosures
- recommendations that come from Eduardo's experience

Use **you / your** when talking directly to the builder and their project.

Use neutral product language for facts that should not depend on the founder speaking:

- price and billing
- authentication behavior
- privacy and data boundaries
- supported clients
- catalog counts
- API behavior
- security guarantees
- legal terms

Do not write about Eduardo in third person on a surface that is clearly speaking in his voice. Third person is appropriate only for biographies, structured metadata, credits, or independent editorial context.

## Peter Yang's No AI Slop rules

Follow the principles in <https://github.com/petergyang/no-ai-slop>.

In particular, remove:

- binary contrast templates such as "It's not X. It's Y."
- throat-clearing such as "Here's the thing" and "Let's be clear"
- faux-insight setups such as "What nobody tells you"
- colon-reveal copy used for fake drama
- strings of dramatic fragments
- generic innovation or transformation language
- importance puffery
- vague attribution
- synonym cycling
- fake-profound endings

Also fix the basics: lead with the point, prefer active voice, untangle long sentences, and choose concrete details over abstractions.

Do not use these rules to sand away humor, odd phrasing, specificity, or personality. The goal is less AI-shaped writing, not sterile writing.

## What this should sound like

The reader should feel that one person built a slightly unreasonable system because he kept running into the same problems, then decided other builders might want to borrow it.

Useful tonal ingredients:

- candid: "He's my brother, so I'm not pretending this is an independent customer case study."
- specific: "Paywall timing, restore purchases, App Review, activation, analytics events, and the screen your agent confidently built before anyone asked whether it was a good idea."
- lightly funny: "I apparently have opinions about all 111 of these workflows."
- practical: "Give your agent the job you have today."
- restrained confidence: show the system and evidence instead of declaring it revolutionary

Humor should come from recognition, not jokes pasted onto copy.

## The kitchen metaphor

The kitchen is a useful brand device, not the ontology of the universe.

Keep:

- "Give your agents the secret sauce. Let them cook."
- occasional references to a station, the pass, mise en place, or service when they make a complex idea easier to understand
- visual kitchen motifs on the marketing page where they are doing real explanatory work

Avoid:

- translating every technical object into restaurant vocabulary
- making users learn metaphor terms before they can use the product
- calling ordinary settings, billing, API keys, errors, or authentication flows by kitchen names
- repeating "chef," "brigade," "station," or "pass" simply to stay on theme

Rule of thumb: if plain English is clearer, use plain English.

## Console voice

The console is a utility. It should feel related to the marketing site without behaving like a themed attraction.

Use direct labels: Console, Hosted access, Plan, Keys, Connect, Billing.

Explain consequences plainly:

> This key is shown once. Copy it before you leave this page.

> Your plan is active. Your keys can use hosted access.

Do not write:

> Mint a key and send your brigade to its stations.

The console can carry one small piece of personality at a time, but task completion wins.

## Proof and claims

Never invent customer outcomes, conversion lifts, time savings, testimonials, adoption numbers, or causal claims.

When proof has a relationship or caveat, say it. Phoneme is a useful example because Alejandro built and shipped it, and Eduardo helped him. It is also Eduardo's brother. Both facts belong in the story.

Distinguish clearly between:

- a real captured system response
- an illustrative example written to show expected output shape
- a customer or user result
- a founder's own project

Do not quietly upgrade one into another.

## Naming

`b2c-app-builder`, `b2c`, B2C environment variables, scopes, URLs, package names, repository paths, and protocol identifiers are technical contracts. Do not rename them casually.

The customer-facing product name is not considered permanently settled.

Until a deliberate rename is approved:

- prefer **Clueless Creations** as the umbrella brand in shared chrome
- use **Console** or **Hosted access** for account and billing surfaces
- use **B2C App Builder** when the current product must be named explicitly, especially in technical docs or where continuity matters
- do not force "B2C App Builder" into every heading, browser title, button, or nav label

A future rename should be treated as a migration: choose the name, check obvious trademark/domain/package conflicts, define display-name versus technical-name boundaries, update marketing and console surfaces together, and only then decide whether technical identifiers should ever move.

## Final edit checklist

Before shipping buyer-facing copy, ask:

1. Would Eduardo actually say this out loud?
2. Is the sentence concrete enough that a builder knows what it means?
3. Did I use first person where this is really Eduardo's experience or opinion?
4. Did I accidentally write generic SaaS copy?
5. Did I overextend the kitchen metaphor?
6. Is every claim supportable?
7. Can I remove 20 percent without losing meaning?
8. Is there at least one line here that feels worth remembering because it is true, not because it is trying to sound quotable?
