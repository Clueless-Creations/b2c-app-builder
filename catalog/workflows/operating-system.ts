import { workflow } from "./helpers.js";

/**
 * Process and orchestration workflows are runtime-owned, executable prerequisites.
 * The bridge includes them in CatalogInput; only machine-domain workflows are excluded.
 * System authority admits internal work without making these domains founder-grantable.
 * Protected, costed, and external actions still require their own authority checks.
 *
 * The reducer owns state/business-state.json. Workflows may read that state and request reducer
 * transitions, but they do not declare it as an authored output. Change cascade owns its receipt,
 * not the state or trace document.
 * Retained workflow IDs remain stable after founder presentation retirement, including the
 * historical orient ID. New contracts do not read, produce, or render the retired cockpit.
 */
export const workflows = [
  workflow({
    id: "workflow.orchestration.session-continuity-resume",
    founderPhrasings: [
      "catch me up on where this session left off",
      "resume where we stopped last time",
      "check status before we keep going",
      "hand this off to a fresh session",
    ],
    title: "Session continuity / resume",
    domainId: "domain.orchestration",
    areaIds: ["area.operating-system"],
    trigger: "New session, resume, status check, or handoff on an existing launch",
    instructions:
      "Run `b2c status` and `b2c plan`, then inspect `git status --short` and the relevant authored artifacts before work. Treat `state/business-state.json` as reducer-owned execution state: do not edit it directly. Consult `AGENTS.md`, `operations/ORCHESTRATION.md`, `engineering/PRODUCTION_READINESS.md`, and `operations/FAILURE_CARDS.md` when present. `check:continuity-contract` verifies the installed continuity contract. Prior chat turns do not replace durable evidence.",
    reads: ["state/business-state.json"],
    consults: ["AGENTS.md", "operations/ORCHESTRATION.md", "engineering/PRODUCTION_READINESS.md", "operations/FAILURE_CARDS.md"],
    roleId: "role.orchestrator",
    laneIds: ["orchestration"],
    // outputPaths intentionally empty: reads and verifies durable state, does not author
    // it (see file header) — consistent with actionClass "observe".
    gates: ["check:continuity-contract"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.orchestration.orient-scaffold-and-state-cockpit-upkeep",
    founderPhrasings: [
      "launch this app for me end to end",
      "get this business running from scratch",
      "pull the overall progress across every workstream",
      "something changed and the tracked state needs to catch up",
    ],
    title: "Orient, scaffold & durable state upkeep",
    domainId: "domain.orchestration",
    areaIds: ["area.operating-system"],
    trigger: '"Launch this app" / broad launch request; any lane/provider/proof/blocker status change',
    instructions:
      "Run `b2c status` and `b2c plan` to orient from reducer-owned `state/business-state.json`. Do not edit that file or author a second state document. Submit lane, evidence, and blocker changes through the runtime reducer. A succeeded lane needs evidence or live proof, and a lane cannot succeed while a required upstream lane is running or blocked. Choose the smallest orchestration strategy that fits the ready work, then report what changed, what happens next, and what needs the human. Do not wait for later operational or readiness artifacts during orientation.",
    reads: ["state/business-state.json"],
    consults: ["AGENTS.md", "PRODUCT.md", "DESIGN.md"],
    roleId: "role.orchestrator",
    laneIds: ["orchestration"],
    phaseIds: ["phase.0-orient"],
    // operations/BUSINESS_ACCESS.md dropped: workflow.operations.founder-zero-operator-bootstrap
    // is its dedicated producer (see file header).
    gates: ["check:product-md"],
    actionClass: "mutate",
    idempotent: true,
  }),
  workflow({
    id: "workflow.orchestration.full-launch-program",
    founderPhrasings: [
      "run the full launch program on this app",
      "take this all the way to submit-for-review ready",
      "ship the app, the website, and the store packet as one program",
      "every surface gets a fresh-context review before it counts as done",
    ],
    title: "Full launch program (entry)",
    domainId: "domain.orchestration",
    areaIds: ["area.operating-system"],
    trigger:
      "Founder asks for a complete end-to-end consumer delivery — app, full web funnel, store packet, analytics, trust, revenue, and growth artifacts — carried to Submit-for-Review ready with isolated review on every surface",
    instructions:
      "Open the program. Write `operations/LAUNCH_PROGRAM.md` from the mandate record in `reference.orchestration.full-launch-program`: outcome, stop line, launch scope, start classification, workspace facts, craft references, spend ceiling, autonomy mode, founder-only actions, and the review policy. Record `project.launchScope: full` through the reducer with a dated founder reason when it changes an existing scope; never edit `state/business-state.json` by hand. Confirm the `## Review Ledger` section exists in `operations/ORCHESTRATION.md` before any broad dispatch. Run the paid-tool check for every preferred design-evidence and generation tool and stop when a required one is missing. Classify the start: a brownfield overhaul runs research in audit-and-gap-fill mode with keep, refresh, or redo per artifact. Then let `b2c plan` sequence the existing nodes; this node adds the mandate, the isolated-review edges, the reference-pack edge, and the closeout gates, not a second graph. Hand off with the smallest founder-only ask.",
    reads: ["state/business-state.json"],
    consults: ["PRODUCT.md", "DESIGN.md", "operations/ORCHESTRATION.md", "strategy/TOOL_DECISIONS.md", "operations/BUSINESS_ACCESS.md"],
    roleId: "role.orchestrator",
    laneIds: ["orchestration"],
    phaseIds: ["phase.0-orient"],
    outputPaths: ["operations/LAUNCH_PROGRAM.md"],
    gates: ["check:orchestration"],
    // The approval IS the mandate: the founder grants launch scope full, the Submit-for-Review stop
    // line, the spend ceiling, and the autonomy mode before this node opens the program and records
    // them in operations/LAUNCH_PROGRAM.md. Approvals gate dispatch (kernel/engine/frontier.ts).
    founderOnlyActions: [
      "Approve the full launch program mandate: launch scope full, the Submit-for-Review stop line, the spend ceiling, and the autonomy mode",
    ],
    actionClass: "mutate",
    idempotent: true,
    applicability: {
      mode: "conditional",
      question: "Did the founder ask for the full end-to-end launch program (launch scope full, Submit-for-Review stop line)?",
    },
  }),
  workflow({
    id: "workflow.orchestration.full-launch-closeout",
    founderPhrasings: [
      "are we actually ready for me to click submit",
      "show me the final checklist before I submit for review",
      "close out the launch and tell me the one thing left",
    ],
    title: "Full launch closeout (definition of done)",
    domainId: "domain.orchestration",
    areaIds: ["area.operating-system"],
    trigger: "Every store, trust, engineering, and growth terminal node has succeeded and the founder wants the Submit-for-Review handoff",
    instructions:
      "Close the program against the definition-of-done table in `reference.orchestration.full-launch-program`. Write `LAUNCH.md` as the launch dossier: the store-console click path ending at Submit for Review, pointers to the listing, screenshots, signing, console, email, and revenue artifacts, the launch calendar, the monetization thresholds, and the open founder decisions. Confirm every lane is done, blocked with a founder action, or deferred with a dated reason the founder accepted. Confirm the review ledger holds a passing row for every producer-to-auditor pair and that each findings artifact exists. Confirm `engineering/PRODUCTION_READINESS.md` carries physical-device evidence, not simulator-only proof. Run `check:lane-coverage`, `check:orchestration`, `check:readiness-coverage`, and `check:app-copy`; do not narrate readiness a gate contradicts. Hand off what the founder clicks, in order, and the one remaining founder action. You never click Submit for Review.",
    reads: [
      "state/business-state.json",
      "operations/LAUNCH_PROGRAM.md",
      "operations/ORCHESTRATION.md",
      "engineering/PRODUCTION_READINESS.md",
      "store/STORE_CONSOLE.md",
      "product/copy/COPY_REVIEW.md",
      "design/reviews/DESIGN_SYSTEM_REVIEW.md",
    ],
    consults: ["growth/CRO_AUDIT.md", "strategy/RED_TEAM_FINDINGS.md", "LEGAL_REVIEW.md", "growth/EMAIL_OPS.md", "revenue/REVENUE_OPS.md"],
    roleId: "role.orchestrator",
    laneIds: ["orchestration"],
    dependencies: [
      "workflow.orchestration.full-launch-program",
      "workflow.store.store-console-workflow",
      "workflow.store.apple-signing-and-release-readiness",
      "workflow.store.marketplace-regional-compliance",
      "workflow.trust.privacy-and-terms",
      "workflow.trust.security-architecture-and-release-gate",
      "workflow.engineering.engineering-orchestration-ce-production-readiness",
      "workflow.engineering.accessibility-common-task-proof",
      "workflow.engineering.app-quality-and-vitals",
      "workflow.growth.landing-funnel-publication-and-live-proof",
      "workflow.growth.landing-funnel-audit",
      "workflow.words.copy-review-audit",
      "workflow.design.design-system-audit",
      "workflow.design.implementation-craft-audit",
      "workflow.experience.onboarding-conversion",
      "workflow.growth.launch-narrative-and-cadence",
      "workflow.operations.post-launch-operations",
      "workflow.process.launchbench-failure-cards-coverage-audit",
    ],
    outputPaths: ["LAUNCH.md"],
    gates: ["check:lane-coverage", "check:orchestration", "check:readiness-coverage", "check:app-copy", "check:design-acceptance"],
    // No founderOnlyActions: the founder's Submit for Review click happens after this node, outside
    // the graph, and the agent never performs it. An approval here would gate the handoff itself.
    actionClass: "observe",
    idempotent: true,
    applicability: {
      mode: "conditional",
      question: "Did the founder ask for the full end-to-end launch program (launch scope full, Submit-for-Review stop line)?",
    },
  }),
  workflow({
    id: "workflow.process.provider-proof-verification",
    founderPhrasings: [
      "prove this integration is actually wired up, not just coded",
      "show real evidence a provider is live before calling it done",
      "don't mark this finished without proof it works",
    ],
    title: "Provider-proof verification",
    domainId: "domain.process",
    areaIds: ["area.operating-system"],
    trigger: "Before marking any provider-backed lane (analytics/revenue/email/store/security/eng) succeeded",
    instructions:
      "Before marking any provider-backed lane (analytics/revenue/email/store/security/eng) succeeded, populate or update `operations/PROVIDER_PROOF.md` with one row per provider: name, current status, proof command or inspection route, evidence path, and any founder-only gate. Planned setup and green unit tests are not proof. The row's status must show captured live evidence, and `check:provider-proof` fails unless at least one file named anywhere in the row exists on disk. If access is founder-only, record the gate and keep the lane running or blocked rather than claiming success.",
    reads: ["state/business-state.json"],
    consults: ["operations/PROVIDER_PROOF.md"],
    roleId: "role.orchestrator",
    outputPaths: ["operations/PROVIDER_PROOF.md"],
    gates: ["check:provider-proof"],
    providers: ["provider.posthog", "provider.revenuecat", "provider.resend", "provider.app-store-connect"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.process.change-cascade",
    founderPhrasings: [
      "we changed something, what else needs updating because of it",
      "ripple this edit through every surface it touches",
      "make sure nothing was left stale after that change",
    ],
    title: "Change cascade",
    domainId: "domain.process",
    areaIds: ["area.operating-system"],
    trigger: "When DESIGN.md is accepted, and after each app, product, copy, brand, pricing, product, or data change",
    instructions:
      "Run a design_contract_lock cascade when DESIGN.md is first accepted. This creates the public-surface baseline while app implementation starts. After that, ingest engineering/SOURCE_CHANGE_MANIFEST.json and classify each accepted change with every applicable Change Cascade Map type, not one convenient primary type. Use agents/launch-surface-producer.md for the surface audit and bounded update tasks. Check the app, Apple App Store, Google Play, Apple and Play products, billing, landing site, web onboarding, GEO/SEO, lifecycle email, analytics, legal pages and public privacy claims, screenshots, and marketing assets. Update each affected surface or record why it is unaffected. Submit any lane or evidence transitions through the reducer; do not write them into an authored state document. Updated localized, product, device, product-page, or asset surfaces need one evidence variant per applicable dimension. Re-render any screenshot, App Preview, Play feature graphic, landing screenshot, or ad asset whose source digest changed. Reconcile the locked lexicon in DESIGN.md before the change succeeds and write the checked ledger digest to state/CHANGE_CASCADE_RECEIPT.json.",
    reads: ["state/business-state.json", "state/LAUNCH_TRACE.md", "DESIGN.md", "engineering/SOURCE_CHANGE_MANIFEST.json"],
    roleId: "role.orchestrator",
    outputPaths: ["state/CHANGE_CASCADE_RECEIPT.json"],
    actionClass: "mutate",
    idempotent: true,
  }),
  workflow({
    id: "workflow.process.launch-trace-and-build-contracts",
    founderPhrasings: [
      "trace every decision back to the evidence that justified it",
      "decide if we need a real technical spec before building",
      "connect the research to what we're actually building",
    ],
    title: "Launch trace & build contracts",
    domainId: "domain.process",
    areaIds: ["area.operating-system"],
    trigger: "Crossing research → product/design/build; deciding if engineering/TECH_SPEC.md is needed",
    instructions:
      "When work crosses from research into product/design/build, create or update `state/LAUNCH_TRACE.md` as the decision-trace table (evidence ID, source, tool route, research finding, experience/product/brand decision, build contract, analytics/security/revenue/privacy/store impact, verification, status) so every screen, claim, or paywall behavior traces back to the evidence that produced it. Decide whether `engineering/TECH_SPEC.md` is needed — create it when the app has backend APIs, database/storage, auth, subscriptions, email, analytics, AI, push, account deletion, or non-trivial platform behavior, and cover the data model, API/RPC/webhook contracts, state machines, permissions, and integration contracts so a builder never has to invent schema or endpoint behavior. Do not let a claim, screen, onboarding question, or paywall behavior move forward without a trace row or an explicit, documented founder-only decision.",
    reads: ["strategy/RESEARCH.md", "product/experience/11-star-experience/11_STAR_EXPERIENCE.md", "state/business-state.json"],
    roleId: "role.product-leader",
    laneIds: ["traceability"],
    phaseIds: ["phase.1f"],
    dependencies: ["workflow.research.research-backed-spec", "workflow.experience.11-star-experience"],
    outputPaths: ["state/LAUNCH_TRACE.md", "engineering/TECH_SPEC.md"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.process.launchbench-failure-cards-coverage-audit",
    founderPhrasings: [
      "we keep making the same mistake, turn it into a permanent check",
      "make sure test coverage backs up a launch-readiness claim",
      "log this failure so it never slips through again",
    ],
    title: "LaunchBench / failure-cards / coverage audit",
    domainId: "domain.process",
    areaIds: ["area.operating-system"],
    trigger: "Before any launch-readiness claim, after a repeated miss, or adding a validator/scenario",
    instructions:
      "Before any launch-readiness claim, after a repeated agent miss, or when adding a validator or scenario, run `npm run launchbench` (definition lint plus the validator fixture suite) and turn any known regression into a durable card in `operations/FAILURE_CARDS.md` (card ID, severity, owner, status, detected date, evidence, impact, next action, validator) instead of leaving it as a chat note. Record scenarios run, validators run, expected failures caught, and unexpected misses in `LAUNCHBENCH.md`. Close a card only with evidence or command proof attached. The node's deterministic gate is `launchbench:lint` — scenario YAML shape only — so a session does not re-run the fixture suite that CI already runs on the heavy lane. Use `b2c status` and `b2c plan` to confirm that reducer-owned lane state does not support a launch-ready claim while an upstream lane is still running or blocked.",
    reads: ["state/business-state.json", "engineering/PRODUCTION_READINESS.md"],
    consults: ["operations/FAILURE_CARDS.md"],
    roleId: "role.orchestrator",
    dependencies: ["workflow.orchestration.orient-scaffold-and-state-cockpit-upkeep"],
    outputPaths: ["operations/FAILURE_CARDS.md", "LAUNCHBENCH.md"],
    gates: ["launchbench:lint"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.process.repository-profile-contract",
    founderPhrasings: [
      "figure out what kind of repository this actually is",
      "set the rules this workspace has to follow",
      "pick the artifact and validator contract for this repo kind",
    ],
    title: "Compile the repository profile contract",
    domainId: "domain.process",
    areaIds: ["area.operating-system"],
    trigger: "Selecting the repository kind for a workspace, or compiling its artifact and validator contract",
    instructions:
      "Accept one typed repository profile in reducer-owned project state. Compile the applicable artifact and validator contract from that profile plus the active capability graph. A profile cannot suppress privacy, secrets, authorization, billing, account deletion, provider proof, or release-truth gates when those capabilities are present.",
    reads: ["state/business-state.json"],
    roleId: "role.orchestrator",
    outputPaths: ["state/generated/requirement-inventory.json", "state/generated/requirement-inventory.md"],
    actionClass: "mutate",
    idempotent: true,
  }),
] as const;
