---
version: "1.0"
name: TUCK
description: A tactile offline packing planner with one original object language across the iOS app
  and responsive landing.
colors:
  background: "#F7F1E6"
  surface: "#FFFDF7"
  primary: "#203A45"
  text: "#203A45"
  muted: "#596967"
  border: "#B5B7A7"
  accent: "#D85A36"
  jade: "#87A99A"
  lilac: "#B7A9CD"
  canvas: "#203A45"
typography:
  display:
    fontFamily: Fraunces, Georgia, serif
    fontWeight: "700"
  body:
    fontFamily: DM Sans, system-ui, sans-serif
    fontWeight: "400"
  label:
    fontFamily: DM Sans, system-ui, sans-serif
    fontWeight: "700"
rounded:
  sm: 6px
  md: 14px
  lg: 24px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  bag:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.background}"
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
  action:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
  supportingLabel:
    textColor: "{colors.muted}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  zipper:
    backgroundColor: "{colors.accent}"
  jadeGarment:
    backgroundColor: "{colors.jade}"
  lilacGarment:
    backgroundColor: "{colors.lilac}"
exploration:
  schemaVersion: 1
  selectedConceptId: canvas-packing-table
  concepts:
    - id: canvas-packing-table
      name: Canvas packing table
      premise: An open canvas bag receives recognizable outlined belongings so planning and packing feel like one continuous physical task.
      referenceMappings:
        - referenceId: reference.grug-mechanism
          principle: Carry one original object system through layout, direct manipulation, motion, and every visible state.
        - referenceId: reference.structured-hierarchy
          principle: Keep the next action, supporting detail, and completion state legible without flattening the expressive object scene.
      treatments:
        native: A direct-manipulation packing table lets a tap or drag move one labeled object into the bag while counts and undo stay visible.
        mobileWeb: A narrow vertical story pairs one compact bag scene with immediate product proof and a single download action.
        desktopWeb: A wide split composition places the tactile bag demonstration beside concise proof, then expands into the complete packing loop.
      distinguishingMechanic: Every item is a reusable outlined object whose position, packed mark, count, and label communicate the same state.
      decision: selected
      rationale: This direction makes the core packing act recognizable at a glance and gives TUCK one ownable system across native and web surfaces.
    - id: departure-board
      name: Departure board
      premise: Trips appear as orderly departures while packing tasks advance through status rows modeled on a calm travel board.
      referenceMappings:
        - referenceId: reference.structured-hierarchy
          principle: Use stable titles, supporting information, and explicit completion hierarchy to make the next useful action obvious.
      treatments:
        native: A compact departure list opens dense itinerary-like packing rows with status markers and restrained utility controls.
        mobileWeb: A stacked travel board reveals one trip and its packing statuses before the download action enters the reading flow.
        desktopWeb: A broad timetable composition compares departure status, remaining items, and repeat-use proof in aligned columns.
      distinguishingMechanic: Packing progress advances like departure status, moving each item from preparing through ready to boarded.
      decision: rejected
      rationale: The hierarchy is clear, but the travel-board metaphor feels category-generic and weakens the personal memory of physical belongings.
    - id: passport-stamp-journal
      name: Passport stamp journal
      premise: Each trip becomes an editorial passport spread where packed categories collect marks and completion earns a final stamp.
      referenceMappings:
        - referenceId: reference.seat-visual
          principle: Connect expressive outlined objects, concise feedback, and a visible arrangement while retaining an original scene and cast.
      treatments:
        native: Paged journal spreads group packing categories and add tactile stamps as users complete each section of the list.
        mobileWeb: A sequence of cropped passport spreads uses editorial pacing to reveal the product promise and final completed state.
        desktopWeb: An open-book composition balances illustrated trip spreads with explanatory copy and a visible category index.
      distinguishingMechanic: Completing a category places a dated stamp into its spread and assembles a visual travel record over time.
      decision: rejected
      rationale: The stamp ritual has character, but page turns slow repeated list editing and decoration competes with quantities and recovery states.
acceptance:
  schemaVersion: 1
  status: accepted
  designContractPaths:
    - design/flows/packing-journey.md
    - design/screens/native-screens.md
    - design/screens/landing.md
  surfaces:
    - id: ios-trip-collection
      surfaceId: trip-collection
      kind: native
      platform: ios
      viewport: native
      productScreenIds:
        - screen.trip-collection
      implementationPaths:
        - native/Sources
        - native/project.yml
        - native/Info.plist
        - native/Assets.xcassets
        - native/Tuck.xcodeproj/project.pbxproj
        - native/Tuck.xcodeproj/xcshareddata/xcschemes/Tuck.xcscheme
        - shared
      rubricPath: design/reviews/rubrics/tuck-craft.json
      locales:
        - en
      states:
        - default
        - reduced-motion
        - large-text
        - screen-reader
        - empty
        - error
      stateExclusions:
        - state: loading
          reason: This screen uses bounded local data already loaded by the app. It has no remote request or
            artificial delay; import progress belongs to Data and settings.
        - state: permission-denied
          reason: TUCK requests no location, camera, contacts, notification, or account permission. File
            selection is explicit system UI; cancellation is tested without permission prompts.
        - state: offline
          reason: "Offline is the identical default state: the native packing journey uses only local data and
            bundled assets. Execute its default interactions with networking disconnected and record
            that condition, without duplicating identical screenshots."
      interactions:
        - id: create-trip
          action: From the empty collection, activate the new-trip control and create a named short trip.
          expected: The saved trip appears once with its name and useful initial list; no account or
            permission interrupts first value.
        - id: relaunch
          action: Create and partly pack a trip, terminate the native app, and relaunch the same installation.
          expected: The same trip, item quantities, packed marks, and view preference return from saved device
            data.
        - id: filter-trips
          action: Create at least two trips with different names, then change the collection filter and clear
            it.
          expected: Only matching trips appear; clearing the filter restores every saved trip without creating
            or removing data.
        - id: storage-recovery
          action: Open the app with a deliberately malformed saved store in its isolated verification
            container.
          expected: A recovery state explains the problem and offers a safe recovery path; the damaged store
            is not silently replaced by an empty collection.
    - id: ios-trip-editor
      surfaceId: trip-editor
      kind: native
      platform: ios
      viewport: native
      productScreenIds:
        - screen.trip-editor
      implementationPaths:
        - native/Sources
        - native/project.yml
        - native/Info.plist
        - native/Assets.xcassets
        - native/Tuck.xcodeproj/project.pbxproj
        - native/Tuck.xcodeproj/xcshareddata/xcschemes/Tuck.xcscheme
        - shared
      rubricPath: design/reviews/rubrics/tuck-craft.json
      locales:
        - en
      states:
        - default
        - reduced-motion
        - large-text
        - screen-reader
        - empty
        - error
      stateExclusions:
        - state: loading
          reason: This screen uses bounded local data already loaded by the app. It has no remote request or
            artificial delay; import progress belongs to Data and settings.
        - state: permission-denied
          reason: TUCK requests no location, camera, contacts, notification, or account permission. File
            selection is explicit system UI; cancellation is tested without permission prompts.
        - state: offline
          reason: "Offline is the identical default state: the native packing journey uses only local data and
            bundled assets. Execute its default interactions with networking disconnected and record
            that condition, without duplicating identical screenshots."
      interactions:
        - id: trip-details
          action: "Enter a trip name, nights, and one preset: City break, By the coast, Outdoors, or Work
            trip. Save the trip."
          expected: The saved trip and initial suggestions reflect the chosen preset and nights, and the
            editor closes after a successful save.
        - id: preserve-personal-list
          action: Customize and pack an item, reopen trip details, change nights or preset, and save.
          expected: Trip details update while customized names, quantities, and packed marks remain intact;
            list preservation is explained in the editor.
        - id: invalid-and-cancel
          action: Attempt to save an empty name, then enter valid changes and cancel the editor.
          expected: Invalid input is explained in place; cancellation leaves the original saved trip unchanged
            and returns focus to the opening control.
        - id: failed-save
          action: Launch an isolated test with the documented save-failure injection, edit trip fields, and
            try to save.
          expected: A visible error retains the entered fields and the prior saved trip; no successful save or
            completed bag is falsely reported.
    - id: ios-packing-table
      surfaceId: packing-table
      kind: native
      platform: ios
      viewport: native
      productScreenIds:
        - screen.packing-table
      implementationPaths:
        - native/Sources
        - native/project.yml
        - native/Info.plist
        - native/Assets.xcassets
        - native/Tuck.xcodeproj/project.pbxproj
        - native/Tuck.xcodeproj/xcshareddata/xcschemes/Tuck.xcscheme
        - shared
      rubricPath: design/reviews/rubrics/tuck-craft.json
      locales:
        - en
      states:
        - default
        - reduced-motion
        - large-text
        - screen-reader
        - empty
        - error
      stateExclusions:
        - state: loading
          reason: This screen uses bounded local data already loaded by the app. It has no remote request or
            artificial delay; import progress belongs to Data and settings.
        - state: permission-denied
          reason: TUCK requests no location, camera, contacts, notification, or account permission. File
            selection is explicit system UI; cancellation is tested without permission prompts.
        - state: offline
          reason: "Offline is the identical default state: the native packing journey uses only local data and
            bundled assets. Execute its default interactions with networking disconnected and record
            that condition, without duplicating identical screenshots."
      interactions:
        - id: pack-tap
          action: Tap an unpacked object or its labeled row, then inspect the bag and the remaining count.
          expected: Exactly that item becomes packed; the object, textual state, and remaining count agree,
            and an undo action is available.
        - id: pack-drag
          action: Drag an unpacked object onto the bag drop target, then drop another outside the bag.
          expected: A valid drop packs exactly one item; an outside drop cancels without data change. Drop
            affordance is visible and drag is never required.
        - id: unpack-undo
          action: Unpack a packed item, then invoke Undo and inspect both the item and the progress label.
          expected: Undo restores the preceding packed state and count exactly without duplicating the item or
            changing another trip.
        - id: list-equivalence
          action: Switch between the packing table and list and perform packing, unpacking, and editing
            through the labeled list.
          expected: Both presentations use the same data and offer the complete task without dragging; labels,
            quantities, and focus remain understandable.
        - id: accessibility-packing
          action: On a physical iPhone with the current candidate installed and VoiceOver enabled, find an
            unpacked item and use its labeled action to pack and unpack it.
          expected: VoiceOver exposes item name, quantity, packed state, and operation; the remaining count is
            announced without reading decorative layers.
        - id: empty-and-add
          action: Remove all items from an isolated trip, inspect the empty bag, and activate Add item.
          expected: The screen offers a clear next action and does not describe an empty list as a
            successfully packed trip.
    - id: ios-item-editor
      surfaceId: item-editor
      kind: native
      platform: ios
      viewport: native
      productScreenIds:
        - screen.item-editor
      implementationPaths:
        - native/Sources
        - native/project.yml
        - native/Info.plist
        - native/Assets.xcassets
        - native/Tuck.xcodeproj/project.pbxproj
        - native/Tuck.xcodeproj/xcshareddata/xcschemes/Tuck.xcscheme
        - shared
      rubricPath: design/reviews/rubrics/tuck-craft.json
      locales:
        - en
      states:
        - default
        - reduced-motion
        - large-text
        - screen-reader
        - empty
        - error
      stateExclusions:
        - state: loading
          reason: This screen uses bounded local data already loaded by the app. It has no remote request or
            artificial delay; import progress belongs to Data and settings.
        - state: permission-denied
          reason: TUCK requests no location, camera, contacts, notification, or account permission. File
            selection is explicit system UI; cancellation is tested without permission prompts.
        - state: offline
          reason: "Offline is the identical default state: the native packing journey uses only local data and
            bundled assets. Execute its default interactions with networking disconnected and record
            that condition, without duplicating identical screenshots."
      interactions:
        - id: edit-item
          action: Add a custom item, set its quantity, category, and object illustration, then reopen it and
            rename it.
          expected: One editable item is added; name, quantity, chosen illustration, and category persist
            without changing unrelated items.
        - id: invalid-item
          action: Clear the item name or try an invalid quantity and attempt to save, then cancel the editor.
          expected: Invalid fields are identified without losing entered text; cancellation preserves the
            existing list and focus returns to the originating control.
        - id: remove-item
          action: Remove an existing item through its labeled action and confirm any presented destructive
            decision.
          expected: Only the chosen item disappears, progress updates correctly, and the control explains the
            consequence before irreversible data removal.
    - id: ios-complete-bag
      surfaceId: complete-bag
      kind: native
      platform: ios
      viewport: native
      productScreenIds:
        - screen.complete-bag
      implementationPaths:
        - native/Sources
        - native/project.yml
        - native/Info.plist
        - native/Assets.xcassets
        - native/Tuck.xcodeproj/project.pbxproj
        - native/Tuck.xcodeproj/xcshareddata/xcschemes/Tuck.xcscheme
        - shared
      rubricPath: design/reviews/rubrics/tuck-craft.json
      locales:
        - en
      states:
        - default
        - reduced-motion
        - large-text
        - screen-reader
      stateExclusions:
        - state: loading
          reason: This screen uses bounded local data already loaded by the app. It has no remote request or
            artificial delay; import progress belongs to Data and settings.
        - state: permission-denied
          reason: TUCK requests no location, camera, contacts, notification, or account permission. File
            selection is explicit system UI; cancellation is tested without permission prompts.
        - state: empty
          reason: Completion requires a nonempty list with every current item packed. An empty list stays in
            the packing screen with Add item.
        - state: error
          reason: This completion presentation is a derived read-only packing state. Persistence failures are
            handled before completion in the packing screen; export cancellation uses the system
            sheet.
        - state: offline
          reason: "Offline is the identical default state: the native packing journey uses only local data and
            bundled assets. Execute its default interactions with networking disconnected and record
            that condition, without duplicating identical screenshots."
      interactions:
        - id: complete-bag
          action: Pack the last remaining item and inspect the completed bag and its available actions.
          expected: A quiet completion treatment shows the actual trip and packed count; unpacking any item
            immediately restores an incomplete state.
        - id: export-list
          action: Export the completed packing list through the native share sheet, and separately cancel that
            sheet.
          expected: The export contains the current trip, item names, quantities, and packed states;
            cancellation leaves the trip untouched.
        - id: duplicate-trip
          action: Use Pack again or the trip menu to duplicate the trip, then compare the new trip with the
            source.
          expected: The copy has a distinct trip identity and the useful item list with packed marks reset;
            the completed source remains unchanged.
    - id: ios-data-settings
      surfaceId: data-settings
      kind: native
      platform: ios
      viewport: native
      productScreenIds:
        - screen.data-settings
      implementationPaths:
        - native/Sources
        - native/project.yml
        - native/Info.plist
        - native/Assets.xcassets
        - native/Tuck.xcodeproj/project.pbxproj
        - native/Tuck.xcodeproj/xcshareddata/xcschemes/Tuck.xcscheme
        - shared
      rubricPath: design/reviews/rubrics/tuck-craft.json
      locales:
        - en
      states:
        - default
        - reduced-motion
        - large-text
        - screen-reader
        - loading
        - error
      stateExclusions:
        - state: permission-denied
          reason: TUCK requests no location, camera, contacts, notification, or account permission. File
            selection is explicit system UI; cancellation is tested without permission prompts.
        - state: empty
          reason: Settings always has local preferences and data actions. An empty trip collection is reviewed
            on Your trips; absence of a backup is a disabled Restore backup state.
        - state: offline
          reason: "Offline is the identical default state: the native packing journey uses only local data and
            bundled assets. Execute its default interactions with networking disconnected and record
            that condition, without duplicating identical screenshots."
      interactions:
        - id: export-backup
          action: Export a backup from settings for a store containing customized and partially packed trips.
          expected: A versioned backup file is offered through native system UI and includes the actual saved
            data without contacting a service.
        - id: invalid-import
          action: Select malformed JSON, an unsupported version, and an unreadable or cancelled file through
            the import flow.
          expected: Each failure or cancellation leaves the saved trip collection unchanged and reports a
            useful recoverable message where needed.
        - id: valid-import
          action: Import a known valid backup into an isolated store, confirm replacement, and inspect the
            resulting collection.
          expected: Validation precedes replacement; the imported trips match the file and a last known good
            backup remains available for recovery.
        - id: restore-backup
          action: After a successful replacement, activate Restore backup, confirm the operation, and relaunch
            the app.
          expected: The previous known-good trips and their packing states return, persist after relaunch, and
            are not merged into duplicate entries.
        - id: delete-cancel
          action: Open Delete all trips and cancel the destructive confirmation.
          expected: Every saved trip remains intact; destructive actions are visually separated from routine
            export and settings controls.
    - id: landing-mobile
      surfaceId: landing
      kind: landing
      platform: web
      viewport: mobile
      routePath: /landing/
      productScreenIds:
        - screen.landing
      implementationPaths:
        - landing
        - shared
      rubricPath: design/reviews/rubrics/tuck-craft.json
      locales:
        - en
      states:
        - default
        - reduced-motion
        - no-js
        - keyboard
        - empty
        - error
      stateExclusions:
        - state: loading
          reason: The page and browser bag have no separate loading presentation. Import reads a bounded local
            JSON file through native file selection, then shows success or an error; do not invent a
            spinner or duplicate the unchanged default view.
        - state: permission-denied
          reason: TUCK requests no location, camera, contacts, notification, or account permission. File
            selection is explicit system UI; cancellation is tested without permission prompts.
        - state: offline
          reason: "After a complete page load, offline is the identical default browser-bag state: edits use
            local storage and bundled assets. Execute the default interaction while disconnected; an
            unavailable first network request is browser-owned."
      interactions:
        - id: understand-and-try
          action: Read the first viewport and use its packing action to reach the working local browser bag.
          expected: The packing job and next action are clear. The page describes a bag saved in this browser
            without claiming a native trip, store release, synchronization, categories, or activity
            presets.
        - id: demo-pack-undo
          action: Pack and unpack using tap, drag, and the labeled list, use Undo, and reload the page after
            an accepted change. Repeat an operation with reduced motion enabled.
          expected: The same local bag persists after reload; objects, packed state, and counts agree.
            Cancelled drops and undo preserve consistency, and reduced motion removes spatial travel
            without changing the operation.
        - id: keyboard-demo
          action: Use Tab, Shift-Tab, Enter, Space, and Escape to operate the bag, edit dialogs, and data
            controls at this viewport.
          expected: Focus is visible and ordered, fields have labels, dialogs can be cancelled, and every
            operation has a keyboard route without relying on dragging or hover.
        - id: progressive-enhancement
          action: Load the landing with JavaScript disabled; separately disconnect networking after a
            successful local load and edit the browser bag.
          expected: The product explanation, illustration, and navigation remain readable without JavaScript
            and do not falsely offer active saving. The loaded planner continues local operations
            without a network service.
        - id: edit-validation-and-empty
          action: Edit trip name and nights; add, rename, change the quantity and illustration of, and remove
            items. Try invalid or duplicate input, then reach an empty list and add an item again.
          expected: Validation preserves existing data and useful input; list changes persist only after
            successful saving. The empty state offers Add a thing and never claims completion.
            Browser items have no category field or preset selector.
        - id: file-and-storage-recovery
          action: Export the browser bag, import valid and malformed or unsupported JSON, restore the previous
            bag, and exercise a denied browser-storage write in an isolated test profile.
          expected: The versioned browser format round-trips; rejected files and failed writes preserve the
            current bag and show a recoverable visible error. Restore uses valid prior data. No
            native backup compatibility is implied.
        - id: complete-and-reset
          action: Pack the last current item, inspect completion, open Unpack all and cancel, then confirm an
            unpack and reload.
          expected: Only a nonempty fully packed list shows completion. Cancellation preserves every mark;
            confirmed unpack keeps names and quantities while resetting marks, and the saved result
            survives reload.
    - id: landing-desktop
      surfaceId: landing
      kind: landing
      platform: web
      viewport: desktop
      routePath: /landing/
      productScreenIds:
        - screen.landing
      implementationPaths:
        - landing
        - shared
      rubricPath: design/reviews/rubrics/tuck-craft.json
      locales:
        - en
      states:
        - default
        - reduced-motion
        - no-js
        - keyboard
        - empty
        - error
      stateExclusions:
        - state: loading
          reason: The page and browser bag have no separate loading presentation. Import reads a bounded local
            JSON file through native file selection, then shows success or an error; do not invent a
            spinner or duplicate the unchanged default view.
        - state: permission-denied
          reason: TUCK requests no location, camera, contacts, notification, or account permission. File
            selection is explicit system UI; cancellation is tested without permission prompts.
        - state: offline
          reason: "After a complete page load, offline is the identical default browser-bag state: edits use
            local storage and bundled assets. Execute the default interaction while disconnected; an
            unavailable first network request is browser-owned."
      interactions:
        - id: understand-and-try
          action: Read the first viewport and use its packing action to reach the working local browser bag.
          expected: The packing job and next action are clear. The page describes a bag saved in this browser
            without claiming a native trip, store release, synchronization, categories, or activity
            presets.
        - id: demo-pack-undo
          action: Pack and unpack using tap, drag, and the labeled list, use Undo, and reload the page after
            an accepted change. Repeat an operation with reduced motion enabled.
          expected: The same local bag persists after reload; objects, packed state, and counts agree.
            Cancelled drops and undo preserve consistency, and reduced motion removes spatial travel
            without changing the operation.
        - id: keyboard-demo
          action: Use Tab, Shift-Tab, Enter, Space, and Escape to operate the bag, edit dialogs, and data
            controls at this viewport.
          expected: Focus is visible and ordered, fields have labels, dialogs can be cancelled, and every
            operation has a keyboard route without relying on dragging or hover.
        - id: progressive-enhancement
          action: Load the landing with JavaScript disabled; separately disconnect networking after a
            successful local load and edit the browser bag.
          expected: The product explanation, illustration, and navigation remain readable without JavaScript
            and do not falsely offer active saving. The loaded planner continues local operations
            without a network service.
        - id: edit-validation-and-empty
          action: Edit trip name and nights; add, rename, change the quantity and illustration of, and remove
            items. Try invalid or duplicate input, then reach an empty list and add an item again.
          expected: Validation preserves existing data and useful input; list changes persist only after
            successful saving. The empty state offers Add a thing and never claims completion.
            Browser items have no category field or preset selector.
        - id: file-and-storage-recovery
          action: Export the browser bag, import valid and malformed or unsupported JSON, restore the previous
            bag, and exercise a denied browser-storage write in an isolated test profile.
          expected: The versioned browser format round-trips; rejected files and failed writes preserve the
            current bag and show a recoverable visible error. Restore uses valid prior data. No
            native backup compatibility is implied.
        - id: complete-and-reset
          action: Pack the last current item, inspect completion, open Unpack all and cancel, then confirm an
            unpack and reload.
          expected: Only a nonempty fully packed list shows completion. Cancellation preserves every mark;
            confirmed unpack keeps names and quantities while resetting marks, and the saved result
            survives reload.
  exclusions: []
---

# TUCK Design System

Status: accepted design contract; implementation and independent visual acceptance remain unproved.

## Overview

Leave with everything. The useful moment is seeing one familiar object move into a bag while the
remaining count becomes smaller. A complete bag should feel settled, not scored. This same physical
vocabulary anchors the landing browser bag, the native packing table, collection labels, forms,
completion, and recovery copy. The app remains a useful packing planner when all motion is disabled.

The accepted surfaces and their exact state/interaction coverage live in the frontmatter above.
The landing includes a real single browser bag with local persistence and its own JSON backup format.
Native alone owns the trip collection, activity presets, categories, and trip duplication.
The product authority is [product.yaml](product.yaml). Detailed behavior lives in
[the packing journey](design/flows/packing-journey.md), [native screens](design/screens/native-screens.md),
and [landing composition](design/screens/landing.md). The acceptance report is deliberately absent
until actual runtime capture, interaction execution, and independent review have happened.

## Direction Exploration

The frontmatter preserves all three developed concepts and their platform
treatments. Canvas packing table is selected because the object, state change,
and product promise remain the same action across native and web. Departure board
kept useful hierarchy but made TUCK resemble a generic travel utility. Passport
stamp journal supplied character but made repeated list editing slower and put
decoration ahead of quantity and recovery clarity.

## Colors

Cream is the working surface. Canvas navy carries type, object outlines, bag construction, and
navigation. Orange is the zipper and a small purposeful action accent; jade and lilac distinguish
cloth objects. Color never carries packed state alone. Use navy text on cream for controls and
body copy. Orange-on-cream is decorative unless its actual text contrast is measured and sufficient.
Do not turn the palette into repeated colored cards, gradients, or unrelated status colors.

## Typography

Fraunces gives display headings a warm luggage-label character. DM Sans is the web reading and
utility face. The native adapter uses Fraunces display with Dynamic Type scaling and platform system
text for accessible utility controls. This is an intentional platform adaptation, not a different
brand. Use real text for labels and quantities. Custom vector art contains no essential rasterized
words. Long trip names and item names wrap or truncate with an accessible full label; form fields
remain editable at large sizes. No uppercase paragraph text or ornamental letter spacing.

## Layout

On iPhone, reserve the safe areas and keep the trip, progress, bag, and next useful action readable.
The collection is a set of actual trips, not a dashboard. The packing table offers a restrained scene
with a real bag target and readable items; the list carries the same data. Editors use native sheets
or navigation, with save/cancel in stable reachable positions. At the largest accessibility sizes,
prefer a single-column labeled list with the same operations. Controls must not overlap or clip.

The landing re-composes at phone widths: product promise first, working browser bag next, brief
explanation and truthful next action after it. Desktop uses generous negative space and larger
object composition, without a grid of generic feature cards. Verify at 390 CSS pixels and at least
1280 CSS pixels; also inspect a narrow 320-pixel layout for horizontal overflow. A web mockup never
substitutes for the actual iOS binary. English is the only selected content locale; international
trip names and ordinary Unicode input must remain intact.

## Elevation & Depth

A small edge shadow under an object can explain pickup; it disappears when the object settles.
The bag has drawn construction seams rather than glass, blur, or a floating dashboard panel.
Native system sheets use platform depth. Do not pile shadows onto every row or toolbar button.

## Shapes

Use the original paths in shared/object-geometry.json: 16 objects with a common outline, imperfect
cloth contours, stitched detail, and small internal highlights. The same object ID must denote
the same illustration in native and web. Luggage labels use small corners, sheets use the native
presentation, and buttons use the authored radius scale. Preserve generous hit areas around narrow
visual shapes. The bag and garments may be expressive; system controls remain recognizable.

## Components

- Trip label: trip name, nights/preset, and honest packed progress; opens its saved trip.
- Packing object: original vector art plus name and quantity; packed state also has a check and text.
- Bag target: an obvious real destination while dragging, with an equivalent tap/list action.
- Packing list: full non-drag alternative with edit, quantity, packed toggle, and progress parity.
- Editor: visible title, labeled native fields, inline validation, save/cancel, and retained input.
- Undo: names the reversible last operation and returns state and counts together.
- Completion: actual trip and complete count, useful export/pack-again actions, no fake award.
- Recovery: plain explanation, preserved data, and a clear safe action; no silent success fallback.

Motion explains movement between unpacked and packed. Cancelled drags return to origin. The count
updates once per completed operation. A completion gesture may be quiet and brief, but never delays
useful actions. Reduced motion removes travel, bounce, parallax, and celebration, with immediate
state changes and optional short opacity transitions. Do not add an endless ambient animation.

<!-- b2c-motion-tokens -->
```yaml
durationFast: 120ms
durationBase: 220ms
durationSlow: 360ms
durationCelebrate: 400ms
reducedMotionDuration: 0ms
easing: cubic-bezier(0.2, 0, 0, 1)
durationReveal: 360ms
durationCinematic: 600ms
easingEmphasis: cubic-bezier(0.16, 1, 0.3, 1)
easingSpring: cubic-bezier(0.34, 1.3, 0.64, 1)
stagger: 40ms
```

## Do's and Don'ts

- Do show real state: packed items, remaining count, saved data, and reversible actions must agree.
- Do retain the visual language in empty, validation, persistence failure, and recovery states.
- Do make 44-point native targets, text contrast, focus visibility, VoiceOver order, and large text observable.
- Do preserve custom items when editing a trip and preserve existing trips when an import fails.
- Do judge every facet against the frozen rubric with actual candidate captures and execution logs.
- Do not substitute decorative phone art, generated screenshots, or a passing build for native proof.
- Do not add an account, permissions, a paywall, fabricated testimonials, or a nonfunctional store badge.
- Do not average away a failed facet or close an unresolved visual or functional finding.

## Object Language

| Object | Definition | Allowed terms | Do not use | Evidence |
| --- | --- | --- | --- | --- |
| Trip | Saved departure and its personal packing list | trip | project, workspace, campaign | product.yaml |
| Item | A named thing to pack with a quantity | item, item name | task, node, asset | product.yaml |
| Bag | The visual and useful state of a trip's packed items | bag, packed, unpacked | inventory dashboard | product.yaml |
| Preset | One chosen trip activity that suggests an initial list | City break, By the coast, Outdoors, Work trip | AI itinerary | product.yaml |
| Backup | A versioned local copy used to recover saved trips | backup, restore backup | cloud sync | product.yaml |

## Review and proof boundary

Each native surface fingerprints the source directory, XcodeGen specification,
Info.plist, actual `native/Assets.xcassets` icon catalog, generated project.pbxproj,
exact shared Tuck scheme, and shared geometry/fonts. Generate the current project
before recording the candidate. Changes to build settings, resource registration,
icons, or the shared scheme invalidate prior captures just as source edits do.
Tests, user-specific Xcode data, caches, build outputs, and proof files are excluded.

The frozen [craft rubric](design/reviews/rubrics/tuck-craft.json) contains seven independent floors.
Coherence, originality, craft, and cross-surface identity must exceed their stated calibration;
functionality, accessibility, and motion must meet every stated observable condition. A single failed
criterion blocks acceptance. Reference imagery is inspected external calibration, never TUCK proof.

Offline execution is recorded with the identical default state rather than duplicating its pixels.
Capture actual runtime pixels for every authored distinct state and locale, with platform, device, OS,
viewport, scale, settings, time, and current source fingerprint. Record each interaction with its
result, before/after capture IDs, and actual execution evidence. The reviewer must be independent
from the producer and inspect these artifacts. An open finding requires repair and a fresh review
of the changed candidate. An unavailable screen reader, missing recovery exercise, or absent native
capture stays an explicit unmet requirement; a screenshot cannot prove an interaction by itself.

Native `screen-reader` evidence requires the current candidate on a physical
iPhone with VoiceOver actually enabled. Apple's [accessibility testing guidance](https://developer.apple.com/documentation/accessibility/performing-accessibility-testing-for-your-app)
states that VoiceOver is unavailable in Simulator. An emulator environment override,
an accessibility tree, or a Boolean report field is not a VoiceOver session. Use
simulator accessibility inspection for diagnosis, retain that evidence honestly,
and leave the screen-reader requirement unmet until real device execution exists.

Routine design corrections after internal review stay within the opening mandate.
Use bounded producer repair and fresh independent review without requesting another
founder design decision after an arbitrary number of failed rounds. Existing access,
protected-action, and shipment authority still applies; an actual execution limit
or missing required evidence remains explicit rather than lowering the floor.
