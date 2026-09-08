# Portable UI Library

This library separates what a component must do from how one native stack implements it.

- `components/<component-id>.md` defines behavior, states, accessibility, and shared token dependencies.
- `component-index.json` routes tools to those contracts.
- `adapters/<adapter-id>.json` points to real native source for one stack.
- `schemas/` defines both file formats.

The contract defines reusable behavior. Each app's `DESIGN.md` remains its design authority. The adapter stays native. Do not build a cross-platform widget runtime here.

## Add a stack

1. Implement the contracts in the selected app stack.
2. Add `adapters/<adapter-id>.json` only when the source exists.
3. Use any lowercase stack slug. `swiftui`, `expo`, and `flutter` are examples, not an allowlist.
4. Record `implemented` until review proof exists. Use `verified` or `stable` only with proof files.
5. In a real app, copy or derive only the selected mapping into `design/platforms/<stack>.json`.

An absent adapter means that the stack is not implemented. Do not add placeholder manifests that imply support.

Paths in repository adapter manifests are relative to the B2C App Builder skill root. Token identifiers resolve from the authored `examples/workspace/business/DESIGN.md` through the shared design loader.

## Typography adapters

`DESIGN.md` owns role metrics and the resource declarations. Promoted outputs are
values, not a text renderer. An adapter must resolve `resourceId`, load the
selected font when required, apply the role weight, size, line-height multiplier,
and tracking, and preserve the declared fallback order. Web sizes retain their
`px` or `rem` unit. Native size and tracking are authored logical values, so an
adapter must not parse a web dimension and assume it is a native point size.
Native adapters must apply the platform's text scaling behavior.

Dart exports `fontWeight`, `nativeSize`, `lineHeight`, `nativeTracking`, and
`fontFallbacks` beside `fontFamily`. Swift exports each role's corresponding
values; the selected implementation maps them to native font and text APIs.
TypeScript preserves web and native values. None of these exports proves that a
font exists on a device, that a variable weight is supported, or that localized
text fits. Inspect representative headings, controls, body text, fallback use,
supported scripts, and the largest supported text size in the actual app.
Record those checks in the existing implementation evidence. A semantic heading
level follows the content structure independently of a visual role's size.
