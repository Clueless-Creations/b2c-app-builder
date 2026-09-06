# 05 — Memory & Personalization (optional)

Long-term memory is the "it actually knows me" moment that separates a companion/copilot from a stateless chatbot. It is also sensitive personal data — make it user-visible and user-editable.

```
Add long-term memory and personalization to the assistant.

Requirements:
- After (or during) a conversation, extract durable facts/preferences worth
  remembering (e.g. the user's goals, name, stable preferences) and store them in
  the per-user memory table from prompt 01
- On each new request, put the user's memory list in a message block after the
  cached system prompt. A changed prefix breaks the cache. Do not set up
  pgvector by default. Load the full memory list directly while it stays
  small. Add embedding-based retrieval only once memory volume blows the
  token budget or returns low-relevance recall. Record that decision and its
  trigger in engineering/TECH_SPEC.md
- A "What the assistant remembers about you" settings screen: list memories,
  let the user edit or delete any of them, and let the user turn memory off
- When the assistant uses a memory, it should feel natural ("Last time you
  mentioned…"), never creepy or fabricated

Do not invent facts the user never provided. Memory is recalled, not guessed.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Memory recall is an **Intent Mirroring** moment (`consumer-product-design-agency.md`): it must use the user's actual stored words, be dismissable/editable, and follow the Human-Centered AI honesty rule — attribute to user context, never fabricate. Add `memory_recalled` and `memory_edited` to `analytics/ANALYTICS.md`.
- The memory store and any embeddings are sensitive PII: document retention, export, and deletion in `privacy-terms.md`, and ensure "delete my data" actually clears memory.
- The user-editable memory screen is a trust/agency surface — a ≤2-tap path to edit/delete satisfies the agency requirement and is a strong differentiator.
- Including memory in the system prompt pairs well with prompt caching (prompt 04) to control cost.
</content>
