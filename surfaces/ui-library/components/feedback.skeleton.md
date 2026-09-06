---
$schema: ../schemas/component-contract.schema.json
schemaVersion: 1.0.0
id: feedback.skeleton
name: Skeleton loading
category: feedback
purpose: Preserve the content shape while data loads and prevent layout shifts.
maturity: specified
states: [loading, loaded, reduced-motion]
requirements:
  - Preserve the final content layout while loading.
  - Use the shared reveal duration for shimmer pacing.
  - Render a static placeholder when reduced motion is active.
accessibility:
  - Do not expose decorative shimmer as separate content to assistive technology.
tokenIds: [motion.durationReveal]
---

# Skeleton loading

The adapter should reuse the final layout. It must not introduce a second placeholder layout that can drift from the real surface.
