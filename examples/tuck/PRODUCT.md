---
version: 1.0
name: "TUCK"
slug: "tuck"
description: "An offline packing planner for short trips. Leave with everything."
status: accepted
---

# TUCK Product

This document is rendered from `product.yaml`. The accepted scope describes the
complete TUCK reference product. Acceptance of this contract does not attest
that the implementation has passed its runtime or independent design review.

## Promise, user, and problem

Promise: Leave with everything.

TUCK helps a person preparing for a short trip turn an uncertain mental list
into an editable bag, then remember what is actually packed. The primary user
wants the reassurance of a checked bag without account setup or planning overhead.
A packed check means the person marked the item packed; TUCK cannot know what
is physically in a bag and must not imply that suggestions cover every need.

## Evidence and category

This is an accepted implementation and design exercise in the packing-planner
category, not evidence of market demand or a released commercial business.
The founder's mandate accepts the product direction and complete journey.
`design/reference-packs/README.md` records inspected craft references and their
limits. No customer interviews, conversion rate, revenue, ratings, or awards
are claimed for TUCK. grug informs a small coherent product world; Is This Seat
Taken? informs objects that explain state; Structured informs readable progress.

## Core loop and first value

Create a named trip with nights and one activity preset. Review editable suggestions.
Pack each item using a tap, a drag into the bag, or the accessible list. See
exactly what remains, undo a mistake, and return to the same state after relaunch.
Finish the bag, export its list, or duplicate the trip for another departure.
First value is a useful, editable packing list after saving a short trip.

## Complete product scope

Complete accepted scope: an iOS phone app with trip collection, trip editor,
packing table and equivalent list, item editor, completed bag, and data/settings;
plus a responsive landing page with a working single browser bag. The browser
bag saves locally and supports trip name/nights, editable item names, quantities,
illustrations, packing/list/undo, reload, JSON export/import, and previous-bag
restore. It does not offer native trip collections, activity presets, categories,
duplication, or native-backup compatibility.
Include create/edit, suggestions, custom items, quantities, pack/unpack, undo,
persistence/relaunch, completion, export, duplication, import validation, and
backup recovery. Every included flow has success, cancellation, and relevant
empty/error/offline/accessibility behavior.

Explicit non-applicability: no account or authentication, remote synchronization,
location, weather API, notifications, camera, contacts, purchase, subscription,
ad tracking, or payment provider. They do not serve this accepted offline job.
iPad, Android, and desktop-native apps are not selected platforms. An App Store
submission and public launch are separate authorized actions, not implied by a
local design proof. The product boundary field does not defer any part
of this accepted journey to a later version.

## Requirements and acceptance

R1–R8 specify the native iOS journey. R9 specifies the working browser bag;
R10 applies to both. Platform differences above are explicit product scope.

- R1 Trip: create and edit a short trip's name, nights, and one activity preset
  (City break, By the coast, Outdoors, or Work trip). Reject
  blank names and out-of-range input in place; cancel leaves the saved trip intact.
- R2 Suggestions: start from understandable suggestions, show their quantities,
  and allow additions, renaming, quantity edits, and removal. Editing trip details
  cannot silently discard custom items or reset already packed items.
- R3 Packing: tap or drag an object to pack it; unpack is reversible. A labeled
  list and accessibility actions perform the same operation without dragging.
  Packed state uses text/checks and counts as well as object placement and color.
- R4 Undo: the last packing or supported edit operation can be reversed immediately;
  its item, quantity, position, and progress agree after undo. Destructive trip or
  data replacement needs explicit confirmation and cancellation.
- R5 Durability: save accepted changes atomically on device. Relaunch preserves
  trip details, custom items, quantities, packing state, and display preferences.
  A failed save must show a recoverable message rather than claim success.
- R6 Completion: show a completed bag only when all current items are packed.
  Unpacking returns to an incomplete bag. Export a readable list through the
  system share flow; cancellation is harmless. Duplicate makes a separate trip
  with the same useful list and all packed marks reset, leaving the source intact.
- R7 Recovery: export a versioned backup; validate import before changing data.
  Malformed, unsupported, empty, or unreadable files keep existing trips intact.
  Confirm replacement, preserve a last known good backup, and restore it on request.
  A damaged saved file cannot silently become an empty collection.
- R8 Access: complete the journey with VoiceOver, large text, reduced motion,
  and one-handed taps. Interactive targets are at least 44 points on iOS;
  drag never provides the sole path. Announce item state and remaining count.
- R9 Landing: at phone and desktop widths, identify packing and provide the
  working browser bag described above. Validate trip/item input and bounded
  versioned imports. Empty lists have a next action; malformed imports and
  failed storage writes preserve the current bag and show recoverable errors.
  Keyboard and no-JavaScript visitors can understand the product; enhanced
  controls must not claim saving when JavaScript or local storage is unavailable.
  No invented store availability, native sync, categories, ratings, or purchase.
- R10 Integrity: independent review must inspect the current native binary and
  browser implementation, with per-surface state and interaction evidence bound
  to their source fingerprint. All seven craft facets must meet their own floor.

## Journey and downstream routes

`DESIGN.md` owns global design and accepted review coverage.
`design/flows/packing-journey.md` owns the complete route and recovery behavior.
`design/screens/native-screens.md` owns screen hierarchy and edge states.
`design/screens/landing.md` owns responsive browser-bag behavior and recovery.
`design/reviews/rubrics/tuck-craft.json` freezes the independent review criteria.

## Metrics and monetization posture

Observe first useful list creation, packing/unpacking accuracy, undo accuracy,
successful relaunch, successful export/import recovery, and task completion in
local verification. No telemetry service or user tracking is required.
Purchase and subscription flows are not applicable to this accepted product.
No price, paid offer, market validation, or revenue outcome has been approved.

## Risks and open questions

The largest design risk is a decorative packing scene that makes editing or
accessibility worse. Resolve it with real tap, drag, list, VoiceOver, and large-text
execution. The largest reliability risk is losing a personalized list; resolve it
with interrupted-save, malformed-import, backup-restore, and relaunch evidence.
Suggestions remain editable and modest: special equipment, travel documents,
medicines, and destination restrictions require the traveler's own judgment.
Working title availability and public distribution have not been established.

## Decision log

| Date | Decision | Evidence | Status |
| --- | --- | --- | --- |
| 2026-09-04 | Use TUCK as a working title and build the full offline packing journey. | Founder mandate and authored scope in this file. | Accepted contract |
| 2026-09-04 | Select iOS phone plus responsive landing, without accounts, permissions, or purchase. | These capabilities do not improve the accepted offline packing job. | Accepted contract |
| 2026-09-04 | Share original object geometry and type across native and landing. | Inspected craft references in design/reference-packs/README.md. | Accepted direction; implementation review pending |

## Source ownership and state boundary

`product.yaml` owns product meaning; `PRODUCT.md` is rendered from it. `DESIGN.md`
owns tokens, surface scope, and acceptance coverage. Studio inventory lists the
implementation surfaces. Native code, landing code, and shared original assets
must satisfy these contracts. Runtime evidence and independent review own proof;
this document does not substitute for either. Git owns authored revisions.
