# Copy Deck

Status: template — every copy cell below is example voice from Fernpath, a fictional daily-walks app. Author this product's own words cell by cell, then set the status to `authored` with the date. `check:app-copy` fails a deck that ships example or unfilled cells.

The deck is the single source for every string a user reads in the app. Builders type what a row says; a screen with no row stops the build until the row is authored. Voice comes from `product/copy/COPY_BRIEF.md` and `strategy/BRAND.md`; craft rules and surface formulas live in `knowledge/words/conversion-copy.md`; which locales ship comes from `LOCALIZATION_MARKET_RESEARCH.md`.

Keys are the app's localization keys — the same name flows from this deck into the string resources unchanged where the format allows dots (String Catalogs, i18next); for ARB + `gen-l10n` and Android `strings.xml`, dots become underscores (the mechanical transform recorded in `engineering/TECH_SPEC.md`). Locale tier: `1` ships translated at launch, `2` ships source language, `3` deferred.

Case system (from `product/copy/COPY_BRIEF.md`): sentence case everywhere except proper nouns.

## Allowed terms

None yet. Add a product-owned word here (with a one-line reason) only when `check:app-copy` would otherwise read it as internal vocabulary.

## Onboarding

Rows mirror the `product/ONBOARDING.md` screen sequence — one row per string, including buttons.

| Key                             | Screen / moment           | Copy (source language)                                         | Voice notes                | Locale tier |
| ------------------------------- | ------------------------- | -------------------------------------------------------------- | -------------------------- | ----------- |
| onboarding.promise.headline     | Promise screen            | A ten-minute walk, every day                                   | outcome, user's words      | 1           |
| onboarding.promise.body         | Promise screen            | Fernpath turns your daily walk into a streak you can see grow. | one idea                   | 1           |
| onboarding.promise.cta          | Promise screen            | Get started                                                    | verb-first                 | 1           |
| onboarding.attribution.question | Attribution screen        | How did you hear about us?                                     | keep short, honest         | 1           |
| onboarding.attribution.other    | Attribution screen        | Somewhere else                                                 | plain option label         | 1           |
| onboarding.personalize.question | Personalization screen    | When do you like to walk?                                      | one question per screen    | 1           |
| onboarding.personalize.cta      | Personalization screen    | Continue                                                       | neutral step               | 1           |
| onboarding.plan.loading         | Plan generation           | putting your week together                                     | lowercase narration        | 1           |
| onboarding.plan.headline        | First value / plan reveal | Your first week, mapped                                        | the aha moment             | 1           |
| onboarding.plan.cta             | First value / plan reveal | Start my week                                                  | possessive, forward        | 1           |
| onboarding.push.prime.headline  | Push permission prime     | Keep your streak safe                                          | benefit before the dialog  | 1           |
| onboarding.push.prime.body      | Push permission prime     | A nudge at your walking time, nothing else.                    | name exactly what they get | 1           |
| onboarding.push.prime.accept    | Push permission prime     | Turn on reminders                                              | states the consequence     | 1           |
| onboarding.push.prime.decline   | Push permission prime     | Not now                                                        | neutral, no shame          | 1           |

## Paywall

| Key                | Screen / moment | Copy (source language)            | Voice notes               | Locale tier |
| ------------------ | --------------- | --------------------------------- | ------------------------- | ----------- |
| paywall.headline   | Paywall         | Walk further with Fernpath Trails | restate the felt value    | 1           |
| paywall.plan.name  | Plan card       | Trails                            | identity noun, not "Pro"  | 1           |
| paywall.trial.line | Plan card       | Try one week for free             | spelled out, low pressure | 1           |
| paywall.cta        | Paywall         | Start free week                   | value-named verb          | 1           |
| paywall.restore    | Paywall footer  | Restore purchase                  | plain, always visible     | 1           |
| paywall.decline    | Paywall footer  | Not now                           | neutral exit              | 1           |

## Core loop

| Key                 | Screen / moment | Copy (source language) | Voice notes                          | Locale tier |
| ------------------- | --------------- | ---------------------- | ------------------------------------ | ----------- |
| today.checkin.cta   | Today screen    | Log today's walk       | the one action                       | 1           |
| today.done.headline | After check-in  | That's day {count}     | ICU interpolation, celebrate briefly | 1           |
| today.done.cta      | After check-in  | See my streak          | forward-pointing                     | 1           |

## Empty states

| Key                    | Screen / moment       | Copy (source language)            | Voice notes           | Locale tier |
| ---------------------- | --------------------- | --------------------------------- | --------------------- | ----------- |
| history.empty.headline | History, no walks yet | Nothing here yet.                 | name it               | 1           |
| history.empty.body     | History, no walks yet | Your first walk starts the story. | reframe it            | 1           |
| history.empty.cta      | History, no walks yet | Log a walk                        | point at the next tap | 1           |

## Errors

| Key                 | Screen / moment        | Copy (source language)                                        | Voice notes                 | Locale tier |
| ------------------- | ---------------------- | ------------------------------------------------------------- | --------------------------- | ----------- |
| errors.offline.body | Any save while offline | Couldn't save — you're offline. We'll retry when you're back. | what happened + what's next | 1           |
| errors.generic.body | Unexpected failure     | Something went wrong on our side. Try again in a moment.      | own it, no codes            | 1           |

## Settings and dialogs

| Key                      | Screen / moment     | Copy (source language) | Voice notes               | Locale tier |
| ------------------------ | ------------------- | ---------------------- | ------------------------- | ----------- |
| settings.reminders.label | Settings            | Walking reminders      | noun the user recognizes  | 1           |
| dialogs.delete.title     | Delete confirmation | Delete this walk?      | consequence in the title  | 1           |
| dialogs.delete.confirm   | Delete confirmation | Delete walk            | consequence on the button | 1           |
| dialogs.delete.cancel    | Delete confirmation | Keep it                | neutral, human            | 1           |

## Handoff checks

- Every screen the build plan names has its rows here before the build starts.
- Keys ship into the string resources via the mechanism and key transform `engineering/TECH_SPEC.md` records (unchanged where dots are allowed; dots→underscores for ARB and `strings.xml`).
- Read each surface aloud once; rewrite anything that sounds like a system explaining itself.
- `npm run check:app-copy -- --root <app> --state state/business-state.json` passes (a relative state path joins the root).
