# 00 — Positioning Strategy (Claude.ai, not Claude Code)

**Run this first, on the web interface / Claude.ai.** AI photo apps are a hit-driven, crowded category; "another AI image app" loses. The win is one specific transformation with a visible before/after wow moment, aimed at a niche a general image studio serves poorly. Replace the bracketed parts with the founder's answers.

```
I want to build a photo / AI-media product: [avatar/headshot generator /
photo enhancer-restorer / AI art studio / "turns photos into X" utility] for
[describe your target user and the occasion that makes them reach for it].

Help me define the positioning:
1. What is the ONE transformation this product performs, stated as a
   before → after sentence a user could screenshot and explain?
2. What is the wow moment — the exact second the user sees the output —
   and why would it beat what they get from a general AI image tool or a
   built-in phone editor?
3. Who is the niche (job seekers, parents with old family photos, dating-
   profile users, pet owners, a hobby community)? Why does a focused niche
   beat a general-purpose generator here?
4. What occasion or trigger creates demand (new job hunt, wedding,
   holiday card season, profile refresh), and how often does it recur?
5. What is free, and what does payment unlock (more generations, higher
   resolution, watermark-free export, premium styles, a full pack)?
6. How do the first 100 users arrive — which communities, which share
   format (the before/after image itself?), which creator partnerships?

Also define:
- The product name direction (3 options with rationale)
- The tagline (under 8 words)
- The single before/after example to feature in onboarding and the App Store
- The moat contract for `PRODUCT.md`'s category and wedge section: the top 2-3
  incumbents by revenue (what each does well, the moment we beat them, what stops
  each shipping a copy in a week), the moat class being built (data / workflow /
  community / taste / model / distribution) with its concrete build plan, and the
  one-week-copy test answer

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Answers 1–2 define the wedge → `strategy/RESEARCH.md` and the 11-star magical moment (the reveal in prompt 03/04 must deliver exactly this transformation).
- Answer 3 (niche) is the whole strategy; it also picks the variant (avatar/headshot vs restoration) and feeds comparable-product research in `strategy/RESEARCH.md`.
- Answer 4 (occasion + recurrence) is the monetization-model input: one-shot occasions favor credit packs; recurring use favors subscription. Carry it into prompt 06 and `revenue-monetization.md`.
- Answer 5 constrains metering (prompt 01's credits) and monetization (prompt 06) — per-generation COGS means the free tier is a real cost line, not a marketing default.
- Answer 6 feeds `VIRAL_GROWTH.md` and `growth/LAUNCH_NARRATIVE.md`; the before/after share format is the loop in prompt 07.
- Name directions feed naming/collision checks; the tagline and featured before/after feed `APP_STORE_LISTING.md` and landing copy (run `geo-seo.md` before editing landing copy).
- **Transcribe the wedge into the product contract:** the answers above land in `PRODUCT.md`'s evidence and category section and are held to `product-moat.md`'s tests (one-week-copy, moat class, incumbent beat moment). A done product lane needs a real incumbent row and a named moat class in `PRODUCT.md` — a wedge that lives only in this chat is invisible to every gate.
