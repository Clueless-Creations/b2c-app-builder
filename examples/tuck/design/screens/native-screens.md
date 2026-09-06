# Native screen contract

Selected platform: iOS phone with native SwiftUI controls and original shared
vector art. Screen IDs below match the studio inventory and accepted scope.
An inline completion presentation counts as a distinct review surface because
it has a different state, hierarchy, and actions. It need not be a separate file.

| Surface | Hierarchy and useful action | Edge states |
| --- | --- | --- |
| `trip-collection` | TUCK wordmark/display heading, saved trips with name and progress, Plan a trip, Settings. The empty state explains packing with an original bag and one clear action. | Empty first launch, populated collection, filter with no matches, long trip name, damaged-store recovery, successful automatic backup recovery notice. |
| `trip-editor` | A luggage-label-like title area; labeled trip name, nights stepper, and one activity preset. Save and Cancel stay predictable. Editing an existing trip explains why its personalized list stays intact. | Empty name, bounded nights, long/Unicode name, keyboard visible, failed save retaining input, cancelled change, largest accessible text. |
| `packing-table` | Trip name/preset, honest remaining count, objects with visible names/quantities, and the real bag target. List, Add item, Edit trip, share/menu remain findable. The scene cannot obscure its controls. | None packed, partly packed, all packed transition, empty list, filtered list, dragged object, cancelled drop, undo, save failure, long custom item. |
| `item-editor` | Item name, quantity, category, and illustration choice. The selected drawing stays a choice aid, not the only item identity. Save/Cancel and a separate explained removal action. | New blank item, existing item, invalid input, long/Unicode item name, remove confirmation, failed save, cancelled edit. |
| `complete-bag` | Settled bag, actual trip name and complete count, then Export and Pack again. Completion is a useful stopping point; unpacking returns to packing. | Completed current list, export/share sheet and cancellation, duplicate produces a separate unpacked trip, reduced-motion completion. Empty lists are ineligible. |
| `data-settings` | Preferences and honest local-data explanation, then Export backup, Import backup, Restore backup, with Delete all trips visually separated. | Import progress, validation failure, unsupported file, unreadable file, cancelled picker, replacement confirmation, unavailable backup, restore result, cancelled deletion. |

## Accessibility and input

The minimum interactive area is 44 by 44 points even when an object outline is
narrower. Do not make the entire art layer independently focusable: each item
exposes one useful name/quantity/state plus its actions. Announce a packed-state
change and remaining count without repeatedly reading the entire screen. Provide
native VoiceOver actions for pack/unpack and edit; the visible list provides the
same behavior for people who avoid gestures. Decorative stitches, highlights,
and luggage-tag holes are hidden from accessibility.

Use Dynamic Type and preserve actual labels at the largest supported accessibility
size. Move to a single-column list when the scene no longer fits; this cannot
remove editing, quantities, undo, or completion. System text renders utility
information; Fraunces display uses scaling without converting essential words
to paths. Respect native back, sheet cancellation, keyboard dismissal, focus
restoration, and safe areas. A selected control uses shape/text as well as color.

The user does not grant permissions. Offline is the app's normal useful mode.
No artificial loaders are needed on already loaded local screens. Only settings
owns the real file-import progress state. External share/file pickers are system
UI and must be exercised in the real app; their cancellation is a required path.

## Observed implementation identifiers

The native implementer supplied these identifiers for runtime discovery. They
are test routes, not evidence that a test has been performed.

| Surface | Stable identifiers |
| --- | --- |
| Collection | `emptyCollection`, `storageRecovery`, `tripCollectionFilter`, `createTrip`, `openSettings` |
| Trip editor | `tripEditor`, `tripName`, `tripNights`, `tripKind`, `saveTrip`, `cancelTrip` |
| Packing | `packingTable`, `packingFilter`, `packingProgress`, `packingBagDropTarget`, `addItem`, `toggleList`, `editTrip`, `shareTrip`, `tripMenu`, `undoAction` |
| Item editor | `itemEditor`, `itemName`, `itemQuantity`, `itemCategory`, `itemObject`, `saveItem`, `deleteItem` |
| Completion | `completeBag`, `shareCompleted`, `packAgain` |
| Settings | `dataSettings`, `exportBackup`, `importBackup`, `restoreBackup`, `deleteAllTrips` |

Item controls contain current model UUIDs (`packingItem-<UUID>`, `editItem-<UUID>`).
Read actual runtime identifiers; do not guess fixed UUIDs. Capture the control
tree alongside pixels when demonstrating screen-reader order or labeled actions.
