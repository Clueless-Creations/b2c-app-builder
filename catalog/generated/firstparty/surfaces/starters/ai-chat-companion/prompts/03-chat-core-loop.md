# 03 — Chat Core Loop (the magical moment)

The conversation UI is the product. Streaming that feels alive is the difference between "demo" and "delight." Build the UI against a stub responder first, then wire the real model in prompt 04.

```
Build the core chat interface and conversation management.

Conversation UI:
- Message thread: user and assistant bubbles, markdown rendering (code blocks
  with copy buttons), auto-scroll to newest
- Composer at the bottom: multiline input, send on Enter (Shift+Enter for
  newline), disabled while a response streams
- Streaming assistant responses token-by-token (render as they arrive)
- Stop-generating button while streaming; regenerate-last-response button
- Optimistic UI: the user's message appears instantly

Conversation management:
- Sidebar list of the user's conversations (most recent first), with titles
- New conversation button; auto-generate a title from the first user message
- Rename and delete conversations
- Empty state for a brand-new conversation with 2-3 example prompts

For now, wire the assistant response to a stub server route that streams back a
placeholder; prompt 04 will replace it with the Claude API. Use Supabase to
persist conversations and messages.

Design: clean dark theme, calm and focused, fast.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **Run `eleven-star-experience.md` over this.** Streaming, stop/regenerate, and the empty-state example prompts are the first-impression surface. The streaming reveal is an engineered moment — give it a PostHog event and respect reduced-motion for any typing animation (`consumer-product-design-agency.md`).
- Persist each message (role, content, tokens later) to Supabase as it completes; the optimistic user message needs a rollback path on failure (`engineering/TECH_SPEC.md`).
- Markdown rendering must be sanitized (no raw HTML injection) — note it in `trust/SECURITY.md`.
- Add `conversation_started`, `message_sent`, `response_completed`, `response_stopped`, `response_regenerated` to `analytics/ANALYTICS.md`.
</content>
