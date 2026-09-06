# Design

Root `DESIGN.md` owns the global design system and routes into this directory.

- `flows/` holds detailed flow plans when needed.
- `screens/` holds detailed screen and state plans when needed.
- `components/` holds app-specific component contracts.
- `platforms/<stack>.json` maps contracts to real native implementations.
- `system/` holds generated platform token outputs.
- `design-room.html` is the generated, read-only review page.

Git owns revisions. A missing platform adapter means the component is not implemented on that stack.
