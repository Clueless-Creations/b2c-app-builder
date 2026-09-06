# Generative-AI Safety

## Applicability

Use this guide when the app generates text, images, audio, or video.

## Required controls

Define prohibited uses and the controls for input, output, reporting, enforcement, and human escalation. Record the model and provider responsibilities. Test harmful, deceptive, exploitative, and sexual-content abuse cases. Set an owner and response target for each failure class.

Any product with generative or conversational AI needs a named self-harm and crisis response: detect self-harm, suicide, or crisis language in user input, and respond with an in-context crisis resource (a crisis line or local emergency guidance) instead of a generic refusal or an ordinary completion. Route to human escalation when the model provider's own safety layer does not already cover this. Test the self-harm path explicitly — a general "harmful content" test does not exercise it — and record the detection method, the response copy, and the escalation owner in `trust/AI_SAFETY.md`. `check:privacy` (`privacy-terms.md` §7, risk 10) checks that `trust/AI_SAFETY.md` names this path whenever it exists.

## Escalation Signal Design

Use three separate escalation triggers: an explicit human request, a policy or scope gap, and an exhausted retry budget. Frustration and an explicit human request are different signals. Never treat anger or repeated questions alone as a request for a human. Route only an explicit request straight to human escalation.

## Output

Write the controls and proof in `trust/AI_SAFETY.md`.
When a capability can create paid model-provider spend, also write `trust/AI_PROVIDER_CONTROLS.md`.
Write that file even when paid generation does not apply.
Record `Paid generation: not applicable` plus a named reason.
Load `paid-generative-ai-controls.md` for that cost-boundary contract.

## Source

- [Google Play AI-generated content policy](https://support.google.com/googleplay/android-developer/answer/14094294?hl=en)
