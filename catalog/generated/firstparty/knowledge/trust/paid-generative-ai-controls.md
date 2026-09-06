# Paid Generative-AI Controls

Use this before any app capability can create paid model-provider spend.
Safety content rules still live in `generative-ai-safety.md`.
This file is the cost-boundary contract those safety rules do not carry.

Write the machine-readable control record in `trust/AI_PROVIDER_CONTROLS.md`.
Keep the human incident runbook in the same file.

## Contents

- 1. Control Record
- 2. Spend Boundary
- 3. Secret Binding
- 4. Logging And Rotation
- 5. Cap Status
- 6. Outputs
- 7. Common Failure Modes

## 1. Control Record

Trace every paid AI entry point to all of these controls:

1. Server-side authentication. Verified identity before the first paid call.
2. Server-side entitlement for paid or recurring behavior.
3. Per-owner throttles and global daily and monthly ceilings.
4. Atomic or compensating pre-call reservations.
5. Conservative accounting for timeouts, refusals, provider errors, and invalid output.
6. Request, context, output-token, and timeout limits.
7. A fail-closed operator kill switch that does not disable free or manual product behavior.
8. One approved secret runtime. No provider key in clients, public build variables, analytics, logs, or duplicated edge proxies.
9. Prompt, response, and identity-proof logging rules.
10. Key-rotation and suspected-exposure procedures.
11. Separate status for application-level caps and provider-account billing caps.

Size item 6 from a per-request cost model. Name each cost component: input tokens, output tokens, and cache-token reads and writes, at the provider's current published rates. Count the real token payload, or call the provider's token-counting endpoint. Never estimate token count from character count.

Each business records its own founder-approved limits.
This file does not set universal dollar values.

## 2. Spend Boundary

Anonymous and unverified requests cannot reach paid generation.
A failed or malformed provider response cannot reduce recorded spend below the reservation.
Concurrent calls cannot cross the configured daily or monthly application ceiling.
Paid recurring behavior cannot run without active entitlement.

## 3. Secret Binding

The provider credential stays on the backend.
Do not embed a key in a browser or mobile client.
Do not put a key in public build variables.

## 4. Logging And Rotation

Logs and analytics exclude prompts, responses, secrets, session tokens, and identity proofs.
A model, pricing, token-limit, or request-size change invalidates cost assumptions until review.

## 5. Cap Status

Application cap status and provider-account cap status are separate fields.
One cannot imply the other.
Unknown provider-console state stays unknown.

## 6. Outputs

- Control table in `trust/AI_PROVIDER_CONTROLS.md`
- Bound paid entry points
- Kill-switch exercise evidence that preserves the free path
- Production readback and rollback instructions before the capability is ready

Paid generation applies when product evidence shows model-provider spend.
`check:ai-provider-controls` then requires `trust/AI_PROVIDER_CONTROLS.md`.
A missing file is an error in that case.
Write `Paid generation: not applicable` plus a named reason when spend cannot occur.
A named not-applicable line does not skip the file when product evidence shows paid provider use.
`check:repository-profile` uses the same applicability parser.

## 7. Common Failure Modes

- A public web proxy that reaches the model without verified-account auth
- Failed calls that release their reservations
- A reusable identity token that creates more sessions
- A kill switch that also disables free or manual behavior
- Using application cap status as proof of the provider-account cap
