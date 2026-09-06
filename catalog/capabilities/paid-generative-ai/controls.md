# Paid generative-AI control pack

This pack travels with any app capability that can create model-provider spend.

Safety content rules stay in `knowledge/trust/generative-ai-safety.md`.
This pack compiles the cost-boundary contract those safety rules do not carry.

## Control record

Write `trust/AI_PROVIDER_CONTROLS.md` before paid generation can run.

The file must include:

- Server-side authentication before the first paid call
- Server-side entitlement for paid or recurring behavior
- Per-owner throttles and global daily and monthly ceilings
- Atomic or compensating pre-call reservations
- Conservative accounting for timeout, refusal, and invalid output
- A fail-closed kill switch that keeps free and manual behavior
- One backend secret runtime
- Separate application cap status and provider-account cap status

`check:ai-provider-controls` enforces the record. This pack does not weaken that gate.

## Incident runbook

Keep the incident runbook in the same control file. Record:

- Who can engage the kill switch
- How to rotate the backend secret
- How to read application caps and provider-account caps as separate fields
- How to restore free or manual behavior while paid generation stays closed

## Composition

Pack composition fails when a pack that creates provider spend is present without `capability.paid-generative-ai`.
A workspace with an active paid-generation capability also fails `check:repository-profile` when this pack is not pinned.
