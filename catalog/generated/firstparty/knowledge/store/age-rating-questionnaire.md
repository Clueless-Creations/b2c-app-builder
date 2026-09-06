# Age Rating Questionnaire

Part of the [ASO And Store Operations](./aso-store-ops.md) hub — it decides which store lane runs and what evidence each lane must leave behind.

Use this before every Apple review submission.
Apple requires extra age-rating answers from September 2026.
A blank field is not a `false` answer.

Load `store-console-workflow.md` for the console packet.
Load `app-store-connect-cli.md` before any `asc` command.

## Contents

- 1. Required Answers
- 2. Product Evidence
- 3. Provider Audit
- 4. Mutation Boundary
- 5. Outputs
- 6. Common Failure Modes

## 1. Required Answers

Record these fields in `store/STORE_CONSOLE.md`:

- `socialMedia`
- `messagingAndChat`
- `socialMediaAgeRestricted`
- `ageAssurance`
- `userGeneratedContent`

Each answer must be `true` or `false`.
Do not infer `false` from a missing field.

If `socialMediaAgeRestricted` is `true`, `ageAssurance` and `userGeneratedContent` must also be `true`.

## 2. Product Evidence

Each answer must cite a product fact.
Do not copy a lower-risk answer to clear the gate.

Ambiguous chat, UGC, or age-assurance behavior is a founder or legal escalation.

## 3. Provider Audit

Run this read before every review submission:

```text
asc age-rating audit --app "<APP_ID>"
```

Confirm `--help` first.
Record the CLI version, app ID, audit time, and a redacted result digest.

Missing or inconsistent provider fields block release.

Use `--paginate` only for an authorized portfolio-wide audit.

## 4. Mutation Boundary

`asc age-rating edit` needs an exact mutation envelope and product evidence.
Read the declaration back after any edit.
Do not change product behavior only to make the questionnaire pass.

## 5. Outputs

- Age Rating Questionnaire table in `store/STORE_CONSOLE.md`
- `asc age-rating audit` evidence
- founder or legal escalation when the product fact is ambiguous

## 6. Common Failure Modes

- Inferring `false` from a blank field
- Submitting with a missing social or UGC answer
- Running `asc age-rating edit` without an envelope
- Selecting a lower-risk answer to clear the gate
