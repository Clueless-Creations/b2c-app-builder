# Mixed-surface independent review

Status: **filled**. Fresh-context review against rubric v1. This is issue
#70 step 7 findings, not closeout.

Frozen rubric: `design/reviews/rubrics/RUBRIC-mixed-surface-v1.md` version 1.

Date: 2026-09-09. The reviewer did not author the Quiet Receipt pages. The three
HTML files were opened in a browser at a wide desktop viewport and at 390px
wide. Studio `interaction`, `growth/landing/surface-contract.json`, and
implemented `data-scene-*` hooks set the class. Purpose prose was not parsed as
authority. Pages were not restyled and copy was not edited.

## Findings

| Surface | Severity | Finding | Fit and usability |
| --- | --- | --- | --- |
| privacy | none | Static disclosures only. Semantic headings cover what is stored, who can read it, and how to delete. Nav links load the other two pages. `mailto:privacy@example.invalid` is a real mail link. Zero forms, zero scripts, zero `data-scene-*` hooks. Ink on paper measures about 15.6:1. The page stays a document. | Fits `static-document`. A privacy page that does not invent scrollytelling is not a fail. |
| conversion | issue | Promise, one labeled email field, one submit, and truthful fixture copy are present. Native `required` blocks an empty submit. `type="email"` rejects a value without `@`. There are no `data-scene-*` hooks. A valid submit uses GET to `#`, puts the address in the query string, and reloads the same empty form with no confirmation. | Fits `conversion` for promise and first action. The action does not acknowledge completion. Scroll-linked animation is correctly absent. |
| cinematic | issue | Situation, mechanism, outcome, and proof are complete as a numbered list and remain readable with JavaScript off (the file has no scripts). `prefers-reduced-motion: reduce` still shows every beat. Studio class is `scroll-linked` and the markup has `data-scene-track` / `data-scene-id="filed-slip"`. Scrolling does not change `data-scene-step` (it stays `found`) or `--scene-p` (declared `1`, unused). There are no animations, no scroll controller, and no pairing that hides or advances a state. Intro copy says motion marks which state is under discussion; no motion exists. The bordered stage uses `role="img"` and appears as an image in the accessibility tree while still containing four paragraphs. | Meets the rubric story, no-JS, and reduced-motion bars. Does not fit as delivered scroll-linked interaction. Unused scene attributes are not earned motion. Fashionable effects are not required and their absence is not a fail. |

Shared note, not a class fail: fixture nav links are about 19px tall at 390px,
below the 24px WCAG 2.2 minimum target. The waitlist control itself is about
46px tall.

## Verdict

hold

Privacy fits a static legal/support page. Conversion fits a waitlist page with
a confirmation gap after submit. Cinematic is a usable no-JS story with hook
attributes, not a measured scroll-linked runtime. This review does not treat
unused `data-scene-*` markup as success and does not punish the story page for
lacking fashionable motion.
