---
$schema: ../schemas/component-contract.schema.json
schemaVersion: 1.0.0
id: input.keyboard-behavior
name: Keyboard behavior
category: input
purpose: Keep mobile input, focus, submission, and keyboard dismissal predictable.
maturity: specified
states: [focused, dismissed, interactive-dismiss]
requirements:
  - Keep the active field and primary submit action reachable.
  - Support deliberate keyboard dismissal on forms and scrolling surfaces.
  - Preserve focus when a gesture does not cross its declared threshold.
accessibility:
  - Preserve native focus traversal.
  - Give an explicit dismissal control an accessible name.
tokenIds: []
---

# Keyboard behavior

Use the input and gesture conventions of the selected platform. Do not simulate one platform's keyboard behavior on another.
