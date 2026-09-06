# TUCK reference calibration

Inspected 2026-09-04. These are craft references, not TUCK screenshots or evidence
that TUCK has matched their quality. Original assets belong to their creators.
TUCK must use its own geometry, palette, copy, composition, and type treatment.

| Reference | Inspected source | Observation and transfer |
| --- | --- | --- |
| Is This Seat Taken? | [Apple developer interview](https://developer.apple.com/news/?id=z12xq8fa), and the official theater screenshot stored temporarily as `/tmp/b2c-design-research-20260904/seat.jpeg` | Consistent dark outlines, restrained warm colors, and expressive scene objects make feedback legible. The theater image connects a character's objection to a visible seat arrangement. TUCK should connect an item's move to the packed count and a reversible state, with readable object labels. Its people, scene, lettering, and palette are not a TUCK asset library. |
| Structured | [Official product site](https://structured.app/), and its phone image stored temporarily as `/tmp/b2c-design-research-20260904/structured-phone.webp` | The inspected phone image separates the large date, task names, lighter timing, and completion controls. Repeated rows make the timeline easy to scan. TUCK should keep the trip name, remaining count, item name, quantity, and packed control in a stable hierarchy. TUCK is not a calendar and should not inherit a timeline without a user need. |
| grug | [Apple developer interview](https://developer.apple.com/news/?id=ux44ymcr) | The developers describe building layout, animation, sizing, and interaction states around their own stroke data. TUCK's shared object geometry must therefore work in the real packing interaction and secondary states, not merely decorate a landing hero. No local grug screenshot is claimed in this pack. |

The rubric uses one inspected visual artifact and two authored documentation
observations. The Structured WebP remains outside the repository; it is not
misrepresented as a PNG capture. Reference artifacts are neither generated TUCK
captures nor native-runtime interaction proof.

## Runtime materialization

The frozen rubric expects the exact theater JPEG at
`design/reference-packs/runtime/seat.jpeg`. This directory is ignored by Git.
The source file stays in temporary research storage until local review needs it.
Copy the bytes, verify the SHA-256 recorded in `sources.json`, and inspect the
image in the same review context as the TUCK candidate. Do not replace it with
a prose file, fabricated screenshot, or a silently changed URL response.

Visual source URL:
https://devimages-cdn.apple.com/wwdc-services/articles/images/34234D96-2BFE-4A20-9A1E-C18664BF803F/2048.jpeg

The rubric's documentation artifacts below are original observations with source
links. They may be committed; copyrighted product imagery stays in ignored runtime
storage. Freeze a new rubric revision if any calibration reference changes.
