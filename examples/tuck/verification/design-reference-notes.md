# Design reference notes

## Runnable Reference

[TUCK](../README.md) contains the authored scope,
native and landing sources, and shared original assets used to exercise this loop.
Inspect its [browser persistence tests](../tests/landing.test.mjs),
[native store tests](../native/Tests/TripStoreTests.swift),
and [native UI journeys](../native/UITests/TuckJourneyTests.swift).
Use the [native run instructions](../native/README.md)
for the current target and isolated test store.

The Node browser harness tests command and storage behavior; it is not a real
browser accessibility or visual review. Native source and test files likewise do
not establish that the current binary was installed or every journey passed.
TUCK remains an evolving reference implementation, not a fully accepted design
or evidence that generated businesses will succeed. Read its current findings
and runtime artifacts before making any stronger claim.

## Apply The References To Real Implementation

[TUCK](../README.md) is an evolving execution example.
Its [shared object geometry](../shared/object-geometry.json)
supplies original bag and item paths to the native and browser renderers. Shared
display typography and a deliberate palette connect the two surfaces; accessible
native utility text adapts to the platform. Inspect both actual renders to detect
missing font registration, different objects, or a generic fallback behind the hero.
Shared filenames or copied token values alone do not prove visual consistency.

Its concrete review findings turn the reference principles into useful criteria:
packing must preserve data and its previous recovery point when storage fails;
malformed saved data must not disappear behind a fresh-looking screen; and keyboard
focus must survive packing rerenders, undo, editor closure, and item removal.
The landing's real browser bag also needs input and import error coverage. Do not
claim a native-only category or preset in a browser surface that lacks it.

Use the [execution loop](../../../knowledge/design/design-acceptance.md#execute-the-complete-design-loop) and
TUCK's runnable sources/tests to reproduce these checks. Compare the signature
interaction and recovery states against the frozen facets, then repair the actual
candidate. The reference does not yet establish complete visual acceptance;
screenshots, test declarations, and schema validity cannot stand in for executed
interactions and independent judgment.
