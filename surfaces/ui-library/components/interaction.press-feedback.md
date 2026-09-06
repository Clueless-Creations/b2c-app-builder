---
$schema: ../schemas/component-contract.schema.json
schemaVersion: 1.0.0
id: interaction.press-feedback
name: Press feedback
category: interaction
purpose: Make a deliberate press feel immediate and physical without adding spectacle.
maturity: specified
states: [idle, pressed, reduced-motion]
requirements:
  - Show an immediate visual response while the control is pressed.
  - Use the shared fast motion token for the release response.
  - Remove scale motion when reduced motion is active.
accessibility:
  - Preserve a non-motion pressed cue when reduced motion is active.
  - Keep the native control role, label, and focus behavior.
tokenIds: [motion.durationFast]
---

# Press feedback

Use this contract for branded controls that need a restrained physical response. Prefer the platform control behavior when it already meets the contract.
