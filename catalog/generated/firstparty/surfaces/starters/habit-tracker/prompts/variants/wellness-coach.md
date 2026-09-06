# Variant — Wellness Coach / Guided Program

Apply after the base (prompts 01–04). Turns the self-defined habit tracker into a **guided wellness/coaching program app**: the app supplies structured programs (e.g. "30 days of mobility", "two-week sleep reset"), each day has a plan and content, and habits are generated from the program rather than invented by the user. Content quality becomes the product; the check-in loop stays the engine.

```
Modify the habit app into a guided wellness/coaching program experience.

Changes from the base version:
- Programs: a programs table (title, description, duration in days, level,
  category) and program_days (day number, title, instructional content as
  markdown, the day's actions). Programs are app-supplied content; users
  enroll rather than define habits from scratch
- Enrollment: enrolling in a program generates its daily actions into the
  user's today view (reusing the prompt 01 habit/check-in model, tagged with
  the program and day); one active program at a time in V1
- Day plan screen: today's program day with its content, the actions to check
  off, and progress through the program (Day 9 of 30)
- Program progression: a missed day pauses the program rather than failing
  it — the user resumes at the day they left, and the program never punishes
  or resets progress for missing days
- Completion: finishing a program gets a real completion moment (summary of
  what was done, honest completion rate) and suggests a next program
- Keep self-defined habits available alongside the active program

Content rules (do not remove):
- The app presents general wellness guidance, not medical advice; include a
  clear disclaimer and never claim diagnosis, treatment, or guaranteed outcomes
- Program copy follows the prompt 04 rules: no guilt, no fear, no shame for
  pausing or quitting a program; quitting is one tap and judgment-free

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Program content is a product asset: version it, review tone against `strategy/BRAND.md §Voice`, and treat content changes as `change-cascade.md` events. Day-plan content tables are app content, not user data — RLS differs (read-only to users, write via admin role); enrollments and check-ins remain owner-only per prompt 01.
- **Health-adjacent copy raises the compliance bar**: the no-medical-claims rule threads into `privacy-terms.md` and store review (health claims are a rejection risk on both stores — see the store lanes). If the niche touches a sensitive condition, confirm scope with the founder before writing content.
- The pause-don't-punish progression is the program-level expression of the streak escape hatch (`ethics-guardrail.md`): progress reflects real completed days (endowed-progress truthfulness), and resuming is always free.
- Program completion is a strong reflective peak (`emotional-design-system.md`) and the natural paywall position for prompt 06 (first program free, library behind the subscription is a common split — founder-gated).
- Add `program_enrolled`, `program_day_completed`, `program_paused`, `program_resumed`, `program_completed` to `analytics/ANALYTICS.md`.
