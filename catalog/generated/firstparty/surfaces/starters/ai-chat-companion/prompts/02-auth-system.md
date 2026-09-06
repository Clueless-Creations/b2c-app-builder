# 02 — Authentication System

Identity first. Same pattern as any Supabase app; the chat-specific part is that the authenticated user ID scopes every conversation, usage row, and memory entry.

```
Build the authentication system using the Next.js App Router and Supabase Auth.

Requirements:
- Email/password registration with email verification
- OAuth login with Google and Apple
- Protected routes that redirect to login if not authenticated
- User profile row created on first sign-in (display name, optional avatar)
- Session management with JWT refresh
- Forgot password flow

Create:
1. Login page (/login) with email/password form and OAuth buttons
2. Register page (/register) with inline validation
3. Auth middleware that protects all /app/* routes (the chat app)
4. A useUser() hook that returns the current user anywhere in the app
5. A lightweight first-run step (display name) before the first conversation

Design: clean, modern, dark theme. Form validation with clear error messages.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- OAuth client secrets and the Supabase service role key are secrets → route via `SECRETS.md` (`secrets-management.md`). Verification/reset emails go through `resend-email-ops.md`.
- The first-run step is an onboarding surface (`onboarding-conversion.md`) and a chance to capture one personalization fact (a Commitment moment, `consumer-product-design-agency.md`) that seeds memory (prompt 05).
- Reconcile the dark-theme look with Design Room tokens (`design-room.md`), don't invent a one-off style.
- Add `sign_up_completed`, `oauth_used`, `first_run_completed` to `analytics/ANALYTICS.md`.
</content>
