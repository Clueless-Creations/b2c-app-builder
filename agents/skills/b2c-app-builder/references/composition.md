# Change packages or providers

## Customize composition

Discover capabilities, providers, and recipes with `b2c_discover` or `b2c catalog --json`. Preview a `b2c/v1` composition with `b2c_compose` or `b2c compose --config b2c.yaml --json`. Both share one versioned result contract. Read `canApply`, blockers, configuration, authority, and verification as separate facts. This declaration preview does not activate a workspace. For an installed runtime, import a local extension with `b2c package-import --workspace ID --source PATH`, inspect `b2c_packages`, then use `b2c_composition_plan` with exact package digests. Apply the returned preview through `b2c composition-activate`; local writes stay CLI-only. Fresh bootstrap activates the complete-business default after canonical product acceptance. Change an installed recipe only through composition activation. Imported package declarations do not install an execution route or prove provider readiness.

`contracts/public-api/REFERENCE.md` holds the supported schema. Use this consumer contract across internal changes. Load this section when the task is changing packages or providers. It is not a prerequisite for creating or resuming a business.
