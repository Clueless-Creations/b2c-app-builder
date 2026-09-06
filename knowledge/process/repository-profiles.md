# Repository Profiles

Use this when you select the kind of repository a workspace is. The profile compiles the artifact contract and the validator contract. It does not let a founder turn off a safety gate.

## Vocabulary

Four profile ids exist:

- `app-source` — consumer app source
- `founder-operating` — private founder operating workspace
- `public-package` — public engine or package
- `marketing-site` — public marketing site

Without an accepted profile, the catalog applies its default validator routing. A profile is selected only when its accepted identity and revision are recorded.

Launch scope (`essentials` / `full`) is a different field. Do not mix the two.

## Record

Record founder acceptance in reducer-owned state:

```json
{
  "project": {
    "repositoryProfile": {
      "id": "founder-operating",
      "revision": "rev-repository-profiles-2026-08-24",
      "acceptedAt": "2026-08-24T00:00:00Z"
    }
  }
}
```

The accepted value belongs in `state/business-state.json`. Incomplete profile
identity, revision, or acceptance time fails validation. A profile cannot
silently suppress an applicable safety or trust gate.

## Mandatory gates

These gates stay mandatory when the underlying capability is present:

- privacy and account deletion (`check:privacy`)
- secrets (`check:secrets`)
- authorization (`check:security`)
- billing (`check:revenue`)
- provider proof (`check:provider-proof`)
- paid generative-AI controls (`check:ai-provider-controls`)
- release truth (`check:source-checkpoint`, and `check:apple-release-readiness` when signing is in scope)

A profile cannot suppress these gates.

## Inventory

`check:repository-profile --write` writes `state/generated/requirement-inventory.json` and `state/generated/requirement-inventory.md`. Those files are generated projections. Do not edit them as source. Each row names the profile, pack, workflow, or capability that activated the requirement.

## Paid generative-AI pack

When a capability can create provider spend, composition must pin `capability.paid-generative-ai`. The pack carries the control record and the incident runbook together. `check:pack-composition` fails when a spend pack omits it.

`check:repository-profile` uses the same paid-generation parser as `check:ai-provider-controls`. It reads the `Paid generation:` line from the control record or the safety file. A named not-applicable reason does not skip the pack when product files show paid provider use.
