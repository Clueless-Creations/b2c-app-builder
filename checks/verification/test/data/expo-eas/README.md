# Independent EAS CLI 23.2.0 native envelopes

These files are command-specific JSON shapes taken from the reviewed EAS CLI
23.2.0 source, not from the builder encoder or decoder under test.

| File | Native command | Upstream owner | Establishes |
| --- | --- | --- | --- |
| `build-cloud-one-element-array.json` | `eas build --json` (no-wait and wait) | `packages/eas-cli/src/build/runBuildAndSubmit.ts` `printJsonOnlyOutput(startedBuilds.map(...))` / `printJsonOnlyOutput(builds)` | Top-level BuildFragment array, even for one platform |
| `build-view-single-object.json` | `eas build:view --json` | `packages/eas-cli/src/commands/build/view.ts` `printJsonOnlyOutput(build)` | Single BuildFragment object |
| `build-cloud-multi-array.json` | `eas build --json` with more than one record | same runBuildAndSubmit array print | Multiplicity must not bind `array[0]` |
| `build-cloud-wait-null-hole.json` | `eas build --wait --json` | `waitForBuildEndAsync` returns `MaybeBuildFragment[]` | Null array holes stay partial; surviving id is retained |
| `build-finished-nested-artifacts.json` | finished BuildFragment | `packages/eas-cli/src/graphql/types/Build.ts` `artifacts.applicationArchiveUrl` | Nested artifacts, not a top-level `artifactsUrl` |
| `build-finished-expired.json` | finished BuildFragment with `expirationDate` | Build fragment `expirationDate` | Expired archive is not currently installable |
| `build-errored-partial.json` | errored BuildFragment | Build fragment `status` / `error` | Partial failure still keeps the id |
| `build-mistaken-single-object.json` | mistaken universal object | not an `eas build` envelope | Old decoder shape; must fail closed for `eas.build.cloud` |
| `build-view-mistaken-array.json` | mistaken array on view | not a `build:view` envelope | Array must not be reduced to `array[0]` |
| `workflow-run-nowait.json` | `eas workflow:run --json` without wait | `packages/eas-cli/src/commands/workflow/run.ts` `{ id, url }` | Run id is not a build array |
| `workflow-status-object.json` | `eas workflow:status --json` | `packages/eas-cli/src/commands/workflow/status.ts` | One workflow-run object |
| `submit-view-object.json` | `eas submit:view --json` | `packages/eas-cli/src/commands/submit/view.ts` | One submission object; finished is not release |
| `build-list-array.json` | `eas build:list --json` | `packages/eas-cli/src/build/queries.ts` `printJsonOnlyOutput(builds)` | List retains every id and does not bind a job |

Statuses use the GraphQL enum spellings (`IN_QUEUE`, `FINISHED`, `IOS`) from
`packages/eas-cli/src/graphql/generated.ts` in v23.2.0. The CLI flag spellings
(`in-queue`, `ios`) are not this JSON contract.

Ids are synthetic. They are not live EAS jobs. No account, paid build, or host
`eas` binary was used to produce these files.
