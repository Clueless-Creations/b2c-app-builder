# Mixed-surface independent review

Status: **filled**. Fresh-context re-score against rubric v1. This is issue
#70 step 7 findings, not closeout.

Frozen rubric: `design/reviews/rubrics/RUBRIC-mixed-surface-v1.md` version 1.

Date: 2026-09-09. The reviewer did not author the Quiet Receipt pages and did
not author the waitlist confirmation or cinematic scroll repair. The three
HTML files were opened in a browser at 1280×800 and at 390×844. Studio
`interaction`, `growth/landing/surface-contract.json`, and implemented
`data-scene-*` behavior set the class. Purpose prose was not parsed as
authority. Pages were not restyled and copy was not edited.

## Findings

| Surface | Severity | Finding | Fit and usability |
| --- | --- | --- | --- |
| privacy | none | Static disclosures only. Semantic headings cover what is stored, who can read it, and how to delete. Nav links load the other two pages. `mailto:privacy@example.invalid` is a real mail link. Zero forms, zero scripts, zero `data-scene-*` hooks. Ink on paper measures 15.59:1. The page stays a document. One leftover claim: the page says the waitlist form stores the submitted address; a valid conversion submit now says the fixture did not store it. | Fits `static-document`. A privacy page that does not invent scrollytelling is not a fail. The leftover claim is copy drift, not invented motion. |
| conversion | none | Promise, one labeled email field, one submit, and truthful fixture copy are present. Native `required` keeps an empty submit on `conversion.html` with `valueMissing` and `#joined` at `display:none`. `type="email"` rejects a value without `@`. A valid GET submit lands on `conversion.html?email=…#joined`. `#joined` is `display:block`, names the address, says it was put in the URL and was not stored, and takes focus. JavaScript off: `:target` still shows the generic confirmation; the address remains in the query string. There are no `data-scene-*` hooks. The waitlist control is 46px tall. | Fits `conversion` for promise, first action, and confirmation. Scroll-linked animation is correctly absent. |
| cinematic | leftover | Situation, mechanism, outcome, and proof are complete as a numbered list. Scrolling changes `data-scene-lifecycle` to `active` and `data-scene-motion` to `scroll`. State moves unowned → captured → filed → found. `--scene-p` is `0` at the top and `1` at the bottom. The pin is `position: sticky`. Visible copy is "Now under discussion:" plus the current state. Reverse scroll returns found → filed → captured → unowned and sets `data-scene-direction="reverse"`. Step and visual state IDs pair; only the active plate is shown. `prefers-reduced-motion: reduce`: lifecycle `static`, pin `static`, all four visuals visible, `.now` hidden, scroll does not retarget state. JavaScript off: lifecycle stays `static`; all four steps and all four plates remain visible. At 1280 the active plate overflows the stage by 48px and overlaps the figcaption (the inner label overlaps the caption by about 21px). At 390 the inner labels are `display:none` and there is no overlap. | Fits `scroll-linked`. Motion marks which state is under discussion. The 48px plate/caption collision is a leftover layout defect, not unused `--scene-p`. Fashionable extra effects are not required. |

Shared leftover, not a class fail: fixture nav links remain 19px tall at 390px
and at 1280, below the 24px WCAG 2.2 minimum target. The waitlist control itself
is 46px tall.

## Verdict

pass

Privacy fits a static legal/support page. Conversion fits a waitlist page and
acknowledges a valid submit. Cinematic is a measured scroll-linked runtime that
still reads with JavaScript off and with reduced motion. The 48px plate and
figcaption overlap at 1280 remains. It is a leftover layout defect, not a missing
scroll runtime.
