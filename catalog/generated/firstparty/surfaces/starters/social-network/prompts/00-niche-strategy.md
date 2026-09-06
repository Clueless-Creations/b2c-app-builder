# 00 — Niche Platform Strategy (Claude.ai, not Claude Code)

**Run this first, on the web interface / Claude.ai.** It is strategic work about people, not systems. Nobody is building "the next X" — the goal is to be X for one community that the incumbents serve poorly. A focused community of 5,000 highly engaged users beats 50,000 disengaged general users on retention, willingness to pay, and word of mouth.

Replace `[describe your target community]` with the niche from the founder's AskUserQuestion answer.

```
I want to build a social platform for [describe your target community]. Help me
define the platform's positioning:

1. What does this community hate about existing platforms (X, Instagram, Reddit,
   Discord)?
2. What specific features would make them switch to a new platform?
3. What should the platform NOT have? (Features that would dilute the community)
4. What is the monetization model that fits this community's values?
5. What is the one feature that would make a member of this community tell their
   friends about it?

Also define:
- The platform's name direction (3 options with rationale)
- The tagline (under 8 words)
- The first 100 users — where do I find them and what do I say?
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

- The five answers and the "tell a friend" feature feed `strategy/RESEARCH.md` and the 11-star magical moment in `11_STAR_EXPERIENCE.md`.
- "What it should NOT have" is the V2/banned-scope list — record it so the build does not drift into a general-purpose clone.
- The name directions feed naming + collision checks; the tagline feeds `APP_STORE_LISTING.md` / landing copy (run `geo-seo.md` before editing landing copy).
- The "first 100 users" plan feeds `growth/LAUNCH_NARRATIVE.md` and `viral-growth-loops.md` (build-in-public → invite-only beta → referral codes).
- The monetization-fit answer constrains prompt 07: pick the model that matches the community's values, do not bolt on a generic paywall.
</content>
- **Transcribe the wedge into the product contract:** the answers above land in `PRODUCT.md`'s evidence and category section and are held to `product-moat.md`'s tests (one-week-copy, moat class, incumbent beat moment). A done product lane needs a real incumbent row and a named moat class in `PRODUCT.md` — a wedge that lives only in this chat is invisible to every gate.
