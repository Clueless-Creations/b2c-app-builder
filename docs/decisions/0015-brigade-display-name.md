# Brigade as the human-facing product name

Status: accepted

## Decision

The human-facing product name is **Brigade**. The company remains Clueless
Creations. Existing technical identities remain unchanged: the `b2c` CLI, the
`b2c_*` MCP names, the `b2c-app-builder` package and repository, schema IDs,
stored records, and hosted service wire values.

Human-facing documentation, package description, hosted prose, and diagrams
may use Brigade. When a hosted response needs to identify the product, it may
add `productName: "Brigade"` without changing the stable `service` value.

## Rationale

The display name separates the product people encounter from the compatibility
identifiers already used by installed clients and persisted contracts. A global
replacement would break those contracts and would rewrite historical or
third-party text without improving the user experience.

## Consequences

- Authored human-facing surfaces are updated first and generated projections are
  regenerated from them.
- Residual `B2C App Builder` matches are classified as technical, historical,
  quoted-source, or a remaining branding defect.
- The repository, npm package, CLI, MCP tools, and deployed service identifiers
  remain compatible.
- The separate Clueless Creations site requires its own follow-up and is not
  changed by this decision.

## Evidence

- Issue #8 records the founder-approved naming split and its allowlist/denylist.
- `docs/decisions/README.md` requires the next available decision record and
  generated ownership to be explicit.
