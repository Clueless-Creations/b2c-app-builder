---
$schema: ../schemas/component-contract.schema.json
schemaVersion: 1.0.0
id: feedback.empty-state
name: Empty state
category: feedback
purpose: Explain why a surface is empty and give the user one useful next step.
maturity: specified
states: [empty]
requirements:
  - State what belongs on the surface.
  - Explain why no content is present.
  - Offer one clear next action when an action is available.
accessibility:
  - Keep decorative imagery hidden from assistive technology.
  - Preserve a logical title, message, and action reading order.
tokenIds: []
---

# Empty state

The product supplies the message and action. The adapter supplies native layout and semantics.
