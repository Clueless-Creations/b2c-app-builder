---
$schema: ../schemas/component-contract.schema.json
schemaVersion: 1.0.0
id: feedback.haptics
name: Semantic haptics
category: feedback
purpose: Confirm meaningful decisions and state changes with native tactile feedback.
maturity: specified
states: [selection, confirmation, success, warning, error, unavailable]
requirements:
  - Map product intent to semantic native feedback.
  - Use haptics for decisions and state changes, not routine navigation.
  - Degrade safely when the device does not support haptics.
accessibility:
  - Never use haptics as the only signal for a result or state change.
tokenIds: []
---

# Semantic haptics

Use native semantic feedback. The adapter decides the platform API and safe fallback.
