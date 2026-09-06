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
