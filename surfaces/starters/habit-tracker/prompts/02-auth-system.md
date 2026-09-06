# 02 — Authentication System

Identity first. Same pattern as any Supabase app, with one archetype-specific requirement: **capture the user's timezone at signup**, because every streak in the product depends on the user's local midnight.

```
Build the authentication system using Next.js App Router and Supabase Auth.

Requirements:
- Email magic-link sign-in (passwordless) as the primary path
- OAuth login with Google and Apple
- Protected routes that redirect to login if not authenticated
- A profile row created on first sign-in: display name and IANA timezone.
  Detect the timezone automatically from the browser
  (Intl.DateTimeFormat().resolvedOptions().timeZone), show it for confirmation,
  and let the user change it — do not silently guess wrong
- Session management with JWT refresh
- A settings page where the user can later change display name and timezone;
  on timezone change, note that today's check-in day boundary moves with it

Create:
1. Login page (/login) with magic-link form and OAuth buttons
2. Auth middleware that protects all /app/* routes
3. A useUser() hook that returns the current user and profile anywhere
4. A lightweight first-run step: display name + timezone confirmation + create
   your first habit (name only; the full habit editor comes later)

Design: clean, calm, fast. Form validation with clear error messages.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- OAuth client secrets and the Supabase service role key are secrets → route via `SECRETS.md` (`secrets-management.md`). Magic-link and lifecycle emails go through `resend-email-ops.md`.
- **Timezone capture is load-bearing**, not profile decoration: prompts 01 and 04 compute the local check-in date and streaks from it. A wrong timezone silently breaks streaks — confirm it visibly rather than guessing. Handle timezone *changes* deliberately (recompute the day boundary going forward; do not retroactively rewrite past local dates).
- The first-run "create your first habit" step is an onboarding surface (`onboarding-conversion.md`) and a Commitment moment (`consumer-product-design-agency.md`): the user states a goal in their own words, which seeds the today view (prompt 03) and reminder copy (prompt 04).
- Reconcile the look with Design Room tokens (`design-room.md`); don't invent a one-off style.
- Add `sign_up_completed`, `oauth_used`, `timezone_confirmed`, `first_run_completed` to `analytics/ANALYTICS.md`.
