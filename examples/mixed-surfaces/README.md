# Quiet Receipt mixed-surface fixture

Synthetic fixture business for issue #70 step 7 and #108 purpose-versus-technique.
It prepares three honest public pages. Independent review findings live in
`business/design/reviews/MIXED_SURFACE_INDEPENDENT_REVIEW.md`. That file is
historical step 7 findings, not issue closeout. Later producer repairs to
layout, privacy copy, and nav targets are not a rewrite of that review.

## Surfaces

Open the HTML in a browser. Judge fit and usability for the recorded `job`
and `interaction` class, not whether fashionable effects are present.

| Page | File | Studio `job` | Studio `interaction` | What belongs here |
| --- | --- | --- | --- | --- |
| Privacy | `business/growth/landing/privacy.html` | `legal-document` | `static-document` | Readable disclosures, working links, no invented scroll choreography or conversion job |
| Waitlist | `business/growth/landing/conversion.html` | `conversion` | `conversion` | Promise, one CTA, truthful copy, confirmation after a valid submit, no scroll-linked story |
| How a slip is filed | `business/growth/landing/cinematic.html` | `conversion` | `scroll-linked` | Situation to mechanism to outcome to proof; scroll updates scene state; conversion action via the waitlist link; still readable with JavaScript off |

`studio/seed/business.json` owns conversion purpose (`job`) and technique
class (`interaction`) as independent fields. Purpose prose is not authority.
Implemented scroll-linked hooks are attributed by matching the HTML file stem
to the surface id.

## Finding artifact

`business/design/reviews/MIXED_SURFACE_INDEPENDENT_REVIEW.md` records a
fresh-context review against
`business/design/reviews/rubrics/RUBRIC-mixed-surface-v1.md`.

`business/growth/CRO_AUDIT.md` is only the mechanical page-job inventory for
frozen CRO gates. It is not the independent review.
