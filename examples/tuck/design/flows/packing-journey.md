# Leave with everything

This is the complete accepted journey. `product.yaml` owns product meaning and
`DESIGN.md` owns review coverage. The steps below are requirements, not executed proof.

Steps 2–7 describe the native trip journey. The browser bag has its own complete
surface: one local bag, editable name/nights/items, packing/list/undo, reload,
and browser-format JSON export/import/restore. It does not claim native trip
collections, presets, item categories, duplication, sync, or native-backup
compatibility. The landing screen contract specifies that surface in detail.

1. **Arrive.** The landing names the job and shows TUCK's real object language.
   Its working browser bag is explicitly saved in that browser. No account, download,
   paid offer, or store availability is invented.
2. **Make a trip.** From Your trips, choose Plan a trip. Enter a name, nights,
   and one activity preset: City break, By the coast, Outdoors, or Work trip.
   Save creates the trip and its suggestions. Cancel creates nothing. Empty
   names cannot be saved; the nights stepper prevents out-of-range values.
3. **Make the list yours.** Suggestions are a starting point. Add a custom item,
   change its name, category, quantity, or illustration, or remove it. Explain
   removal and offer the same undo behavior as other list changes. Editing
   nights or the preset later preserves the personalized list and packed marks.
4. **Pack.** Tap an item, drag it to the bag, or use its labeled list/accessibility
   action. Placement, packed text/check, and progress change together. Dropping
   outside the bag cancels. Unpack is explicit and reversible. No operation
   requires speed, precise dragging, color recognition, or a network connection.
5. **Correct and return.** Undo restores the last supported change before another
   change replaces it. Dismissing undo does not undo data. Leave and relaunch:
   the same saved trip and packing state return. A failed save preserves the
   prior saved state, retains useful editor input, and explains recovery.
6. **Finish.** A nonempty list becomes complete only after its last item is
   packed. Completion offers export and Pack again. Unpacking returns to the
   incomplete screen. Export opens the native system share flow; cancel is safe.
   Pack again duplicates the useful list with fresh identity and unpacked marks,
   leaving the original trip intact.
7. **Keep control of data.** Data and settings offers a versioned export,
   validated import, and restore of a last known good backup. Validate the whole
   import before replacement. Explain replacement and allow cancellation. Keep
   existing trips when a file is malformed, unsupported, unreadable, or cancelled.
   A damaged saved store shows recovery or a clear notice of successful recovery
   from the known good backup; it never silently becomes a fresh empty account.

## Failure and interruption behavior

| Condition | Required result |
| --- | --- |
| Blank trip or item name | Save is unavailable or validation is visible; the label explains the required field. Existing saved data is unchanged. |
| App leaves foreground mid-edit | An uncommitted draft is not presented as saved; the previously saved trip remains valid. |
| Save fails | A useful message stays visible; fields or the prior view remain available for correction/retry. Packed progress cannot falsely advance. |
| Drag cancelled or dropped elsewhere | Object returns to its source; data and counts do not change. |
| Last item removed | An empty packing list offers Add item and is not called a completed bag. |
| Share sheet cancelled | Dismiss to the same trip without marking it exported, deleting it, or changing its packing state. |
| Import malformed or version unsupported | Explain the file problem; do not replace data or destroy the backup. |
| Import cancelled | Return to settings without modification or an error claim. |
| Backup unavailable | Restore is disabled with an explanation, or fails recoverably; import remains available. |
| Primary store damaged | Read only valid recovery material; preserve damaged bytes for recovery rather than overwriting them silently. |
| Delete trip or all trips cancelled | Keep all data and return focus to the original control. |

## Native verification route

Use the production views with the documented isolated test store. The native
owner provides `--uitesting --reset` for isolation and `--save-failure` for a
controlled failing write. These are diagnostic inputs to real views and storage
boundaries, not a second mock interface. Use actual XCUI queries, current view
identifiers, and observed item UUIDs; do not hard-code a screenshot-only scene.

Execute once with touch, again with the list and VoiceOver alternatives, then
check large text and reduced motion. Run default local operations with networking
disconnected; offline has the same pixels and uses the default capture. Capture every authored state at native
resolution. A test log can prove storage invariants while native screenshots
prove rendering; neither substitutes for the other. The review records the
candidate fingerprint and rejects evidence from an older source revision.
