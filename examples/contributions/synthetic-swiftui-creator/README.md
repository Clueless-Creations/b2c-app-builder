SYNTHETIC FIXTURE: not a real creator's repository

# Synthetic SwiftUI creator contribution

A labeled fixture that shows how two repositories by one creator decompose into
a contribution. Nothing under this directory comes from a real creator. The
hosts are under `example.invalid` and the author is "Synthetic Creator".

## What it shows

- Several sources improve one method. repo-a's layered depth heuristics are
  proposed as an adaptation into the existing active reference
  `reference.design.audience-derived-identity` as a selectable method. The unit
  is `proposed`: on acceptance it would change that reference, and the reference
  is unchanged until then. The corpus does not gain a second reference that says
  the same thing.
- One separate tool. repo-b's CardStack view is reused as its own extension
  package, `packages/swiftui-cardstack`, with the verbatim MIT text as a `notice`
  resource. `kernel/composition/notices.ts` can render that notice into an output
  directory on request; the `package-notices` suite proves that library path. No
  composition or render path calls it yet.
- No upstream skill is installed. repo-a ships a `SKILL.md` that says to run
  `setup.sh` and to overwrite `DESIGN.md`. Both sentences are recorded as refused
  directives. The script never runs and the fixture suite checks its marker file
  does not exist.
- A conflict is recorded, not resolved by fiat. repo-a wants flat shadows and
  repo-b wants soft layered shadows. Both stay selectable. Neither is a default.
- Unknown rights stay unknown. repo-b's font has no license statement. It is
  deferred and not redistributed.

## Layout

- `sources/repo-a-design-method`: README, SKILL.md, setup.sh, LICENSE.
- `sources/repo-b-components`: Package.swift, one SwiftUI view, one XCTest, a
  placeholder font, LICENSE, README.
- `packages/swiftui-cardstack`: the extension package with the notice.
- `contribution.yaml`: the manifest. `ADOPTION_MAP.md`: the human table.

## Re-run

From this directory:

```sh
b2c contribute plan --source sources/repo-a-design-method --source sources/repo-b-components --goal "Adapt the layered depth method and reuse CardStack" --batch
b2c contribute check --target .
```

The plan command is a dry run without `--target`. It inspects the two
directories, records their directives, and prints a proposed map. It does not
overwrite this `contribution.yaml`, which sets `synthetic: true` by hand. The
check command validates `contribution.yaml`. The fixture suite that proves the
notice path is:

```sh
npx tsx checks/verification/fixtures/run.ts package-notices
```

## Limits

- Synthetic. No real creator, repository, or license was inspected.
- The Swift sources are illustrative. Nothing compiles or runs them.
- The rendered review declared in the manifest was not performed.
- The scrollTransition claim was not checked against Apple documentation and
  stays a draft.
- The u1 adaptation is proposed for review. The active reference it targets was
  not changed.
