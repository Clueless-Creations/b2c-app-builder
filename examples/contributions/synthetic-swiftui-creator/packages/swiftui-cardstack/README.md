SYNTHETIC FIXTURE: not a real creator's repository

# swiftui-cardstack package

A synthetic reuse example. The package carries one SwiftUI view copied from
`sources/repo-b-components` and the notice that must travel with it.

## What it contains

- `NOTICE.txt`: the verbatim MIT text from repo-b's `LICENSE`. Declared as a
  `notice` resource and named by the `thirdParty` entry in `extension.yaml`.
- `Sources/CardStack/CardStack.swift`: byte-identical copy of the upstream view.
- `Package.swift`: copied and trimmed to the library target.
- `Package.resolved`: an empty pin list. The package has no dependencies.
- `input.json`, `output.json`, `evidence.json`: schemas for the one operation.
- `role.md` and `pack.yaml`: one role and one workflow, in the support-case shape.

The `thirdParty` entry covers the Swift source and the manifest. Any generated
output that includes a covered resource must also include the notice.
`kernel/composition/notices.ts` collects the entry from the verified snapshot
and writes `THIRD_PARTY_NOTICES.md` beside the output.

## What it excludes

`Assets/Fonts/Mystery-Regular.ttf` from repo-b is not in this package. No
license statement covers it, so the contribution defers it. A package that
declared it as a `font/*` asset without a notice would fail
`assertRedistributable` with `notices.rights_unknown`.

## Limits

The Swift sources are illustrative. Repository checks snapshot and verify their
bytes; they do not compile them or run the XCTest. The rendered review declared
by the pack was not performed.
