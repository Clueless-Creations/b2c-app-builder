# Landing composition and browser bag

One landing surface is reviewed at mobile and desktop widths. It explains TUCK
and contains a working single browser bag. Local persistence, editors, and JSON
recovery are real product behavior and require actual error-state review.
The page shares the original object geometry and Fraunces display voice with
native, without claiming a released app, ratings, paid offer, or synchronization.

## First viewport

Show TUCK, the promise “Leave with everything.”, a short packing explanation,
and the real working bag. Objects must be recognizable and their labels legible.
The useful action is obvious before scrolling. At phone width, stack promise
and bag deliberately. At desktop width, use negative space and considered object
scale, rather than generic feature cards. Inspect 390-pixel and 1280-pixel
viewports and check 320 pixels for overflow and obscured controls.

## Accepted browser scope

The page starts with one example bag that becomes the visitor's locally saved
bag. They can edit trip name and 1–30 nights; add, rename, remove, and change the
quantity or illustration of items; pack/unpack by tap, drag, or list; undo; and
reload to the same saved data. Item quantities range from 1–20, names are bounded,
duplicate item names are rejected by the editor, and imports are size bounded.

The browser bag contains no activity preset, category field, trip collection,
or duplication operation. “Looks like” selects an illustration, not a category.
Native has those additional authored trip capabilities. Copy must describe the
browser's actual fields and avoid promising categories merely because native
has them. Browser backups and native backups use distinct versioned formats;
neither promises interchangeability. No data crosses between browser and app.

Packed objects, textual state, and counts update together. Dropping outside the
bag cancels. List mode supports the same packing and editing task without drag.
Completion requires a nonempty list with every item packed. Unpack all explains
the effect, offers cancellation, and resets marks without deleting the useful list.
An empty list offers Add a thing and is never represented as completed packing.

## Input, storage, and recovery

The editors validate required names, bounded quantities/nights, duplicate item
names, and item-count limits. An invalid form retains useful input and leaves
saved data intact. A denied storage write must not advance the object, count, or
saved indicator; a visible persistent message offers retry after storage recovery.
Keep a valid previous snapshot and never replace a good backup with corrupt bytes.

Your data stays yours opens the local data dialog. Save a copy downloads the
versioned browser JSON. Selecting a file is an explicit import action: validate
the whole bounded file before replacing the current bag, retain the previous
known-good state, and offer undo/restore. Malformed, unsupported, oversized, or
unreadable files show a recoverable error and preserve the current bag. Cancelling
file selection changes nothing. Restore previous saved bag validates its input;
absence or damage produces an understandable message rather than success.

If startup storage cannot be read, explain that condition without claiming
the fresh on-screen table was saved or overwriting a recoverable prior snapshot.
Use an isolated browser test profile for corrupt-file and denied-write exercises.

## Accessibility and progressive enhancement

Tab/Enter/Space operate controls; Escape and the close controls cancel dialogs.
Focus is visible and returns to a useful origin. Labels and pressed state expose
packing to assistive technology; decorative SVG paths do not create extra stops.
Keyboard review includes editing and the data dialog, not only the hero anchor.

Without JavaScript, semantic explanation, original illustration, and navigation
remain available. Enhanced save/edit controls must not appear to work silently.
After a successful load, the working bag uses local data and continues disconnected.
That offline condition is semantically identical to default: record it in the
interaction evidence and use the default capture rather than duplicating pixels.
Reduced motion removes travel and bounce while preserving the real operation.

## Required evidence

At both viewports capture default, empty, recoverable error, keyboard,
no-JavaScript, and reduced-motion states. The error capture may support multiple
validation and recovery observations; execute each required behavior but do not
manufacture one screenshot per assertion. Keep separate logs when different
failure causes share the same visual treatment. The page has no permission
request. It also has no authored loading screen: bounded file-read work resolves
to success or error without inventing an artificial spinner.

The accepted interaction IDs in DESIGN.md bind the complete browser route:
understand-and-try, demo-pack-undo, keyboard-demo, progressive-enhancement,
edit-validation-and-empty, file-and-storage-recovery, and complete-and-reset.
Actual runtime evidence must show the current source candidate and recorded
browser settings. Each mobile and desktop receipt must cite a current browser runtime
for `/landing/`. That runtime must bind the current source, exact build and served
response manifests, browser context, and launch and navigation transcripts. A source
inspection, Node harness, old tab, or this contract is not proof of execution.
