# Operator Readiness

Stable operator ID: `operator.operator-readiness`

Inherited dispatch contract: read `AGENTS.md`, then `APP_AGENTS.md`, then this prompt. Load every mandatory knowledge path in the node brief; evaluate its conditional role knowledge, nested skills, and tool routes; return the required knowledge receipt.

Use this prompt at the first broad launch session and before unattended work resumes.

Read first: `AGENTS.md`, `.b2c-launch/runtime.json`, `catalog.json`, `.b2c-launch/BUSINESS_CONTEXT.md`, `state/business-state.json`, `control/control.json`, `control/budget-ledger.json`, `operations/BUSINESS_ACCESS.md`,
`operations/business-access.json`, `operations/AGENT_OPERATIONS.md`,
`operations/agent-operations.json`, `strategy/TOOL_DECISIONS.md`, `trust/secrets/SECRETS.md`,
`DESIGN.md`, `engineering/TECH_SPEC.md`, `store/STORE_CONSOLE.md`, and
`operations/PROVIDER_PROOF.md`.

Objective: prepare the business so the founder can step away. Complete one readiness pass before
build work. Do not turn the pass into one question per provider.

Inspect and record:

- autonomy grants, protected waivers, budget, expiry, and stop conditions
- founder ownership, recovery, 2FA, operator identity, role, and revocation path
- source control, CI, hosting, DNS, and exact preview and production website targets
- image, video, composition, copy, screenshot, device, simulator, and localization tools
- Apple Developer, signing, App Store Connect, TestFlight, metadata, media, and upload roles
- Google Play Console, service account, app signing, listing, and testing-track upload roles
- analytics, revenue, email, support, and social tools that the launch scope needs

Create the matching protected control waiver in `control/control.json`, then prepare separate
standing envelopes in `operations/agent-operations.json`. Every envelope must use exact catalog
workflow IDs in `operations`, exact output/provider resource prefixes in `resources`, and the
named account, project/app, environment, expiry, exclusions, rollback route, and spend ceiling.
Never use `workflow.*` or another wildcard operation. Prepare envelopes for:

1. Website build and deployment through
   `workflow.growth.pre-launch-funnel-landing-waitlist` and
   `workflow.growth.landing-funnel-publication-and-live-proof` for the named project and domain.
2. Asset generation through `workflow.design.content-assets-remotion-generated-visuals` inside the
   approved spend ceiling.
3. Approved store metadata, screenshots, previews, and product pages through the applicable exact
   `workflow.store.*` IDs named by the current graph; a wildcard is not authorization.
4. Signed build uploads through the exact Apple signing/ASC or Google Play workflow IDs and named
   TestFlight or Play testing tracks.
5. An exact final production release only when the founder chooses that option up front.

Use the current connector, API, CLI, browser, or native tool to verify each capability. Prefer a
durable delegated role. Do not request secrets in chat. If ownership authentication is unavoidable,
present one consolidated founder handoff with exact screens and consequences.

After readiness, consume matching standing envelopes without another prompt. Capture before-state,
act, read back provider state, record proof, and continue. Stop only for missing or expired scope,
a budget overrun, a new price or legal promise, an identity or credential-role change, a destructive
action, or a final release outside the exact envelope.

Return:

- readiness result: unattended, unattended except for named items, or assisted
- capabilities verified and proof paths
- standing envelopes created or reused
- one consolidated founder action, or `none`
- next app, landing, asset, and store work that can start now
- knowledge receipt (`CONTRACT_FILES_LOADED`, `KNOWLEDGE_LOADED`, `ROLE_KNOWLEDGE_USED`, `SKILLS_USED`, `TOOLS_USED`; `none` with a reason where a route did not match)
