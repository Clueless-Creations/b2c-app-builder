import { replaceTableBlock } from "./_table-edit.js";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type Harness,
  type MutableRecord,
  expectRecord,
  getLane,
  readState,
  skillRoot,
  writeCompleteCompoundEngineering,
  writeCompleteProviderProof,
  writeSourceRegistryFixture,
  writeState,
} from "./_harness.js";

export function register(h: Harness): void {
  const { makeFixture, makeEmptyFixture, runFixture } = h;

  const orchestrationPermissivePrompt = makeFixture("orchestration-permissive-prompt");
  writeFileSync(
    path.join(orchestrationPermissivePrompt, "operations/ORCHESTRATION.md"),
    [
      "# Orchestration",
      "Orchestration Preflight",
      "Strategy",
      "Candidate Units",
      "Parallel Safety Check",
      "File Ownership",
      "Serialized Work",
      "Subagent Instructions: subagents may stage and commit their changes after they finish.",
      "Integration Plan",
      "Verification",
      "Founder-Only Gates",
      "State Updates",
      "Failure Cards",
      "Review Ledger",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "subagent git authority in prompt fails",
    orchestrationPermissivePrompt,
    "check-parallel-orchestration.ts",
    1,
    "orchestration.subagent_git_authority",
  );

  const compoundComplete = makeFixture("compound-complete");
  writeCompleteCompoundEngineering(compoundComplete);
  runFixture("complete Compound Engineering route passes", compoundComplete, "check-compound-engineering-routing.ts", 0);

  const compoundSkipped = makeFixture("compound-skipped");
  {
    const state = readState(compoundSkipped);
    getLane(state, "engineering")["status"] = "succeeded";
    writeState(compoundSkipped, state);
  }
  writeFileSync(path.join(compoundSkipped, "engineering/ENGINEERING_PLAN.md"), "# Engineering Plan\n\nGeneric implementation checklist.\n", "utf8");
  runFixture(
    "core engineering without Compound Engineering route fails",
    compoundSkipped,
    "check-compound-engineering-routing.ts",
    1,
    "compound_engineering.compound_engineering.missing",
  );

  const compoundFreshnessMissing = makeFixture("compound-freshness-missing");
  writeCompleteCompoundEngineering(compoundFreshnessMissing);
  const freshnessDoc = path.join(compoundFreshnessMissing, "operations/ORCHESTRATION.md");
  writeFileSync(
    freshnessDoc,
    readFileSync(freshnessDoc, "utf8")
      .replaceAll("CE freshness check", "Provider version")
      .replaceAll("ce-update", "provider-update")
      .replaceAll("latest-release check", "version inspection"),
  );
  runFixture(
    "Compound Engineering route without freshness check fails",
    compoundFreshnessMissing,
    "check-compound-engineering-routing.ts",
    1,
    "compound_engineering.freshness_missing",
  );

  const sourceRegistryMissing = makeEmptyFixture("source-registry-missing-url");
  writeSourceRegistryFixture(sourceRegistryMissing, false);
  runFixture("unregistered external source fails source freshness", sourceRegistryMissing, "check-source-freshness.ts", 1, "source_freshness.url_unregistered");

  const designRoomMissingRender = makeFixture("design-room-missing-render");
  rmSync(path.join(designRoomMissingRender, "design/design-room.html"), { force: true });
  runFixture("Design Room state without render fails", designRoomMissingRender, "check-design-room-contract.ts", 1, "design_room.render_missing");

  const designRoomFreeform = makeFixture("design-room-freeform-proposal");
  writeFileSync(path.join(designRoomFreeform, "design-proposal.html"), "<!doctype html><html><body>New idea</body></html>", "utf8");
  runFixture(
    "freeform design proposal fails Design Room contract",
    designRoomFreeform,
    "check-design-room-contract.ts",
    1,
    "design_room.freeform_design_artifact",
  );

  const designRoomSemanticMismatch = makeFixture("design-room-semantic-mismatch");
  {
    const renderPath = path.join(designRoomSemanticMismatch, "design/design-room.html");
    const render = readFileSync(renderPath, "utf8").replaceAll("App Name", "Wrong App");
    writeFileSync(renderPath, render, "utf8");
  }
  runFixture(
    "Design Room visible values must match state",
    designRoomSemanticMismatch,
    "check-design-room-contract.ts",
    1,
    "design_room.render_semantic_mismatch",
  );

  const designRoomPlaceholderReady = makeFixture("design-room-placeholder-ready");
  writeValidDesignExploration(designRoomPlaceholderReady);
  {
    const statePath = path.join(designRoomPlaceholderReady, "studio/seed/business.json");
    const designState = JSON.parse(readFileSync(statePath, "utf8")) as MutableRecord;
    const designRoom = expectRecord(designState["designRoom"], "designRoom");
    designRoom["status"] = "rendered";
    writeFileSync(statePath, `${JSON.stringify(designState, null, 2)}\n`, "utf8");
  }
  runFixture("render placeholder-ready Design Room fixture", designRoomPlaceholderReady, "render-design-room.ts", 0, undefined, ["--static-only"]);
  runFixture("review-ready Design Room rejects starter text", designRoomPlaceholderReady, "check-design-room-contract.ts", 1, "design_room.render_placeholder");

  const designRoomExplorationMissing = makeFixture("design-room-exploration-missing");
  {
    const statePath = path.join(designRoomExplorationMissing, "studio/seed/business.json");
    const designState = JSON.parse(readFileSync(statePath, "utf8")) as MutableRecord;
    expectRecord(designState["designRoom"], "designRoom")["status"] = "rendered";
    writeFileSync(statePath, `${JSON.stringify(designState, null, 2)}\n`, "utf8");
  }
  runFixture(
    "review-ready Design Room requires durable three-direction exploration",
    designRoomExplorationMissing,
    "check-design-room-contract.ts",
    1,
    "design_exploration.missing",
  );

  const designRoomExplorationComplete = makeFixture("design-room-exploration-complete");
  writeValidDesignExploration(designRoomExplorationComplete);
  {
    const statePath = path.join(designRoomExplorationComplete, "studio/seed/business.json");
    const designState = JSON.parse(readFileSync(statePath, "utf8")) as MutableRecord;
    const business = expectRecord(designState["business"], "business");
    business["name"] = "Fixture Packing";
    business["positioning"] = "A calm packing tool that keeps the next useful action visible.";
    business["targetAudience"] = "People who want a clear reusable list for frequent short trips.";
    expectRecord(designState["designRoom"], "designRoom")["status"] = "rendered";
    writeFileSync(statePath, `${JSON.stringify(designState, null, 2)}\n`, "utf8");
  }
  runFixture("render complete direction exploration", designRoomExplorationComplete, "render-design-room.ts", 0, undefined, ["--static-only"]);
  runFixture("complete direction exploration passes the Design Room contract", designRoomExplorationComplete, "check-design-room-contract.ts", 0);
  {
    const renderPath = path.join(designRoomExplorationComplete, "design/design-room.html");
    const render = readFileSync(renderPath, "utf8").replace(
      "Transfer clear completion hierarchy while keeping the chosen product object system original.",
      "Missing rendered principle",
    );
    writeFileSync(renderPath, render, "utf8");
  }
  runFixture(
    "Design Room must expose the preserved reference mapping",
    designRoomExplorationComplete,
    "check-design-room-contract.ts",
    1,
    "design_room.render_semantic_mismatch",
  );

  // Authored DESIGN.md feeds the design-state hash the rendered page pins, so
  // editing it without re-rendering must stale the page. This was previously
  // covered only by accident: the removed Reference Evidence fixtures all
  // mutated DESIGN.md, tripped render_stale on the way to the code they meant
  // to assert, and reported it as a mismatch. Assert it directly instead.
  const designRoomStaleRender = makeFixture("design-room-stale-render");
  {
    const contractPath = path.join(designRoomStaleRender, "DESIGN.md");
    const contract = readFileSync(contractPath, "utf8").replace(/^## Overview$/m, "## Overview\n\nThe authored direction changed after the last render.");
    writeFileSync(contractPath, contract, "utf8");
  }
  runFixture(
    "editing DESIGN.md without re-rendering stales the Design Room",
    designRoomStaleRender,
    "check-design-room-contract.ts",
    1,
    "design_room.render_stale",
  );

  // check-design-md.ts owns DESIGN.md as the authored design authority and had
  // no fixture of its own. Cover both halves: the file must exist, and its
  // canonical sections must be present.
  const designMdMissing = makeFixture("design-md-missing");
  rmSync(path.join(designMdMissing, "DESIGN.md"), { force: true });
  runFixture("a repository without DESIGN.md fails the design authority check", designMdMissing, "check-design-md.ts", 1, "design_md.missing");

  const designMdSectionMissing = makeFixture("design-md-section-missing");
  {
    const contractPath = path.join(designMdSectionMissing, "DESIGN.md");
    const contract = readFileSync(contractPath, "utf8").replace(/^## Typography$/m, "## Type Notes");
    writeFileSync(contractPath, contract, "utf8");
  }
  runFixture("DESIGN.md missing a canonical section fails", designMdSectionMissing, "check-design-md.ts", 1, "design_md.sections_missing");

  const providerProofMissing = makeFixture("provider-proof-missing");
  {
    const state = readState(providerProofMissing);
    const revenue = getLane(state, "revenue");
    revenue["status"] = "succeeded";
    revenue["evidence"] = ["revenue/REVENUE_OPS.md"];
    writeState(providerProofMissing, state);
    rmSync(path.join(providerProofMissing, "operations/PROVIDER_PROOF.md"), { force: true });
  }
  runFixture("provider-backed done lane without proof fails", providerProofMissing, "check-live-provider-proof.ts", 1, "provider_proof.file_missing");

  const providerProofContradiction = makeFixture("provider-proof-contradiction");
  writeFileSync(
    path.join(providerProofContradiction, "operations/PROVIDER_PROOF.md"),
    [
      "# Provider Proof",
      "Status: verified but pending founder-only blocker.",
      "PostHog RevenueCat Resend App Store Connect Sentry MobAI Doppler current status proof command evidence path founder-only",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "provider proof ready claim with open blocker fails",
    providerProofContradiction,
    "check-live-provider-proof.ts",
    1,
    "provider_proof.ready_claim_with_blocker",
  );

  // Ledger grounding: once a mapped lane is done, the provider row's evidence
  // path must exist on disk and its status must read as captured evidence.
  const providerProofGrounded = makeFixture("provider-proof-grounded");
  {
    const state = readState(providerProofGrounded);
    const analytics = getLane(state, "analytics_attribution");
    analytics["status"] = "succeeded";
    analytics["evidence"] = ["analytics/ANALYTICS.md", "analytics/posthog-proof.md"];
    writeState(providerProofGrounded, state);
    writeCompleteProviderProof(providerProofGrounded);
    mkdirSync(path.join(providerProofGrounded, "analytics"), { recursive: true });
    writeFileSync(path.join(providerProofGrounded, "analytics", "posthog-proof.md"), "Captured live event and person property on 2026-07-07.\n", "utf8");
  }
  runFixture("provider proof with on-disk evidence for done lane passes", providerProofGrounded, "check-live-provider-proof.ts", 0);

  const providerProofUngrounded = makeFixture("provider-proof-ungrounded");
  {
    const state = readState(providerProofUngrounded);
    const analytics = getLane(state, "analytics_attribution");
    analytics["status"] = "succeeded";
    analytics["evidence"] = ["analytics/ANALYTICS.md"];
    writeState(providerProofUngrounded, state);
    writeCompleteProviderProof(providerProofUngrounded);
  }
  runFixture(
    "provider proof whose evidence path does not exist fails",
    providerProofUngrounded,
    "check-live-provider-proof.ts",
    1,
    "provider_proof.posthog.evidence_path_missing",
  );

  // Regression (verification pass): a literal pipe in the proof-command cell
  // shifts naive positional column parsing; the whole row is scanned instead.
  const providerProofPipedCommand = makeFixture("provider-proof-piped-command");
  {
    const state = readState(providerProofPipedCommand);
    const analytics = getLane(state, "analytics_attribution");
    analytics["status"] = "succeeded";
    analytics["evidence"] = ["analytics/ANALYTICS.md", "analytics/posthog-proof.md"];
    writeState(providerProofPipedCommand, state);
    writeCompleteProviderProof(providerProofPipedCommand);
    const proofPath = path.join(providerProofPipedCommand, "operations/PROVIDER_PROOF.md");
    const withPipedCommand = readFileSync(proofPath, "utf8").replace(
      "| PostHog | event and person property captured | inspect dashboard/API | analytics/posthog-proof.md |",
      "| PostHog | event and person property captured | curl api.posthog.com \\| jq .results | analytics/posthog-proof.md |",
    );
    writeFileSync(proofPath, withPipedCommand, "utf8");
    mkdirSync(path.join(providerProofPipedCommand, "analytics"), { recursive: true });
    writeFileSync(path.join(providerProofPipedCommand, "analytics", "posthog-proof.md"), "Captured live event on 2026-07-07.\n", "utf8");
  }
  runFixture("provider proof row with a piped proof command still grounds", providerProofPipedCommand, "check-live-provider-proof.ts", 0);

  // Regression (verification pass): the shipped engineering/PRODUCTION_READINESS.md
  // template's cautionary boilerplate ("Do not mark this app launch-ready
  // until ...") must not hard-fail a repo where no lane is done yet.
  const providerProofEarlyRepo = makeFixture("provider-proof-early-repo");
  rmSync(path.join(providerProofEarlyRepo, "operations/PROVIDER_PROOF.md"), { force: true });
  runFixture("readiness boilerplate without done lanes does not hard-fail provider proof", providerProofEarlyRepo, "check-live-provider-proof.ts", 0);

  const providerProofStaleStatus = makeFixture("provider-proof-stale-status");
  {
    const state = readState(providerProofStaleStatus);
    const analytics = getLane(state, "analytics_attribution");
    analytics["status"] = "succeeded";
    analytics["evidence"] = ["analytics/ANALYTICS.md"];
    writeState(providerProofStaleStatus, state);
    // Keep the shipped template ledger: its PostHog status still reads "needs
    // live event and person-property evidence", which cannot back a done lane.
  }
  runFixture(
    "provider proof with still-planned ledger status fails",
    providerProofStaleStatus,
    "check-live-provider-proof.ts",
    1,
    "provider_proof.posthog.status_unproven",
  );

  // Regression: "onboarding" was absent from proofRequiredLanes and providerLaneMap, so a
  // done onboarding lane (ONB-22's own lane) never required operations/PROVIDER_PROOF.md to
  // exist at all, even though ONB-22 declares provider.revenuecat and provider.posthog.
  const providerProofOnboardingMissing = makeFixture("provider-proof-onboarding-missing");
  {
    const state = readState(providerProofOnboardingMissing);
    getLane(state, "onboarding")["status"] = "succeeded";
    writeState(providerProofOnboardingMissing, state);
    rmSync(path.join(providerProofOnboardingMissing, "operations/PROVIDER_PROOF.md"), { force: true });
  }
  runFixture(
    "done onboarding lane without proof now fails, same as any other provider-backed lane",
    providerProofOnboardingMissing,
    "check-live-provider-proof.ts",
    1,
    "provider_proof.file_missing",
  );

  // The onboarding lane maps to both PostHog and RevenueCat: grounding only one must not
  // silence the other.
  const providerProofOnboardingRevenueCatUngrounded = makeFixture("provider-proof-onboarding-revenuecat-ungrounded");
  {
    const state = readState(providerProofOnboardingRevenueCatUngrounded);
    getLane(state, "onboarding")["status"] = "succeeded";
    writeState(providerProofOnboardingRevenueCatUngrounded, state);
    writeCompleteProviderProof(providerProofOnboardingRevenueCatUngrounded);
    mkdirSync(path.join(providerProofOnboardingRevenueCatUngrounded, "analytics"), { recursive: true });
    writeFileSync(
      path.join(providerProofOnboardingRevenueCatUngrounded, "analytics", "posthog-proof.md"),
      "Captured live event and person property on 2026-08-08.\n",
      "utf8",
    );
    // The shipped workspace template ships an (unfilled) revenue/revenuecat-proof.md stub, so
    // "ungrounded" has to remove it explicitly -- its mere presence would otherwise satisfy the
    // existsSync check regardless of content.
    rmSync(path.join(providerProofOnboardingRevenueCatUngrounded, "revenue", "revenuecat-proof.md"), { force: true });
  }
  runFixture(
    "done onboarding lane with PostHog grounded but RevenueCat evidence missing still fails",
    providerProofOnboardingRevenueCatUngrounded,
    "check-live-provider-proof.ts",
    1,
    "provider_proof.revenuecat.evidence_path_missing",
  );

  const providerProofOnboardingGrounded = makeFixture("provider-proof-onboarding-grounded");
  {
    const state = readState(providerProofOnboardingGrounded);
    getLane(state, "onboarding")["status"] = "succeeded";
    writeState(providerProofOnboardingGrounded, state);
    writeCompleteProviderProof(providerProofOnboardingGrounded);
    mkdirSync(path.join(providerProofOnboardingGrounded, "analytics"), { recursive: true });
    writeFileSync(
      path.join(providerProofOnboardingGrounded, "analytics", "posthog-proof.md"),
      "Captured live event and person property on 2026-08-08.\n",
      "utf8",
    );
    mkdirSync(path.join(providerProofOnboardingGrounded, "revenue"), { recursive: true });
    writeFileSync(
      path.join(providerProofOnboardingGrounded, "revenue", "revenuecat-proof.md"),
      "Sandbox purchase confirmed: entitlement active and access granted inside the app.\n",
      "utf8",
    );
  }
  runFixture(
    "done onboarding lane with both PostHog and RevenueCat evidence on disk passes",
    providerProofOnboardingGrounded,
    "check-live-provider-proof.ts",
    0,
  );

  // Regression: the ready-claim/open-blocker check scanned the whole PROVIDER_PROOF.md document,
  // so an unrelated provider's still-pending row could block ONB-22 even though its own declared
  // providers (PostHog, RevenueCat) are genuinely ready. --providers scopes that specific check to
  // the named providers' own rows; every other check in this file (keyword presence, per-provider
  // ledger grounding) is unaffected and still runs against the whole document either way.
  const providerProofUnrelatedBlockerScoped = makeFixture("provider-proof-unrelated-blocker-scoped");
  {
    const state = readState(providerProofUnrelatedBlockerScoped);
    getLane(state, "onboarding")["status"] = "succeeded";
    writeState(providerProofUnrelatedBlockerScoped, state);
    writeFileSync(
      path.join(providerProofUnrelatedBlockerScoped, "operations/PROVIDER_PROOF.md"),
      [
        "# Provider Proof",
        "Status: PostHog and RevenueCat are verified.",
        "Proof Ledger",
        "| Provider | current status | proof command | evidence path | founder-only gate |",
        "| --- | --- | --- | --- | --- |",
        "| PostHog | event and person property captured | inspect dashboard/API | analytics/posthog-proof.md | founder-only account access |",
        "| RevenueCat | sandbox purchase grants entitlement | sandbox purchase and entitlement check | revenue/revenuecat-proof.md | founder-only store product setup |",
        "| Resend | domain verification pending | send test email | email/resend-proof.md | founder-only DNS access |",
        "| App Store Connect | app record and metadata inspected | asc validation commands | store/asc-proof.md | founder-only submission access |",
        "| Sentry | release event captured | trigger handled test event | security/sentry-proof.md | founder-only project access |",
        "| MobAI | target-user onboarding walkthrough captured | run mobile walkthrough | mobile/mobai-proof.md | founder-only device access |",
        "| Doppler | runtime injection captured | doppler run -- printenv APP_ENV | secrets/doppler-proof.md | founder-only secrets access |",
        "No raw secrets, private account screenshots, signing material, or credential screenshots are stored in proof artifacts.",
        "",
      ].join("\n"),
      "utf8",
    );
    mkdirSync(path.join(providerProofUnrelatedBlockerScoped, "analytics"), { recursive: true });
    writeFileSync(path.join(providerProofUnrelatedBlockerScoped, "analytics", "posthog-proof.md"), "Captured live event on 2026-08-09.\n", "utf8");
    mkdirSync(path.join(providerProofUnrelatedBlockerScoped, "revenue"), { recursive: true });
    writeFileSync(
      path.join(providerProofUnrelatedBlockerScoped, "revenue", "revenuecat-proof.md"),
      "Sandbox purchase confirmed: entitlement active on 2026-08-09.\n",
      "utf8",
    );
  }
  runFixture(
    "the unscoped provider-proof check fails on an unrelated pending provider row",
    providerProofUnrelatedBlockerScoped,
    "check-live-provider-proof.ts",
    1,
    "provider_proof.ready_claim_with_blocker",
  );
  runFixture(
    "the --providers-scoped provider-proof check ignores that same unrelated pending row",
    providerProofUnrelatedBlockerScoped,
    "check-live-provider-proof.ts",
    0,
    undefined,
    ["--providers", "PostHog,RevenueCat"],
  );

  // The scope must not become a blanket bypass: a blocker inside one of the NAMED providers' own
  // rows still fails even under --providers.
  const providerProofOwnBlockerStillScoped = makeFixture("provider-proof-own-blocker-still-scoped");
  {
    const state = readState(providerProofOwnBlockerStillScoped);
    getLane(state, "onboarding")["status"] = "succeeded";
    writeState(providerProofOwnBlockerStillScoped, state);
    writeFileSync(
      path.join(providerProofOwnBlockerStillScoped, "operations/PROVIDER_PROOF.md"),
      [
        "# Provider Proof",
        "Status: PostHog and RevenueCat are verified.",
        "Proof Ledger",
        "| Provider | current status | proof command | evidence path | founder-only gate |",
        "| --- | --- | --- | --- | --- |",
        "| PostHog | event capture pending | inspect dashboard/API | analytics/posthog-proof.md | founder-only account access |",
        "| RevenueCat | sandbox purchase grants entitlement | sandbox purchase and entitlement check | revenue/revenuecat-proof.md | founder-only store product setup |",
        "| Resend | domain and test send captured | send test email | email/resend-proof.md | founder-only DNS access |",
        "| App Store Connect | app record and metadata inspected | asc validation commands | store/asc-proof.md | founder-only submission access |",
        "| Sentry | release event captured | trigger handled test event | security/sentry-proof.md | founder-only project access |",
        "| MobAI | target-user onboarding walkthrough captured | run mobile walkthrough | mobile/mobai-proof.md | founder-only device access |",
        "| Doppler | runtime injection captured | doppler run -- printenv APP_ENV | secrets/doppler-proof.md | founder-only secrets access |",
        "No raw secrets, private account screenshots, signing material, or credential screenshots are stored in proof artifacts.",
        "",
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "the --providers-scoped provider-proof check still fails on a blocker inside a named provider's own row",
    providerProofOwnBlockerStillScoped,
    "check-live-provider-proof.ts",
    1,
    "provider_proof.ready_claim_with_blocker",
    ["--providers", "PostHog,RevenueCat"],
  );

  // Regression (round 23): the per-provider ledger-grounding loop above still only ran once one
  // of a provider's mapped lanes read "done" -- but check:provider-proof-onboarding is invoked as
  // the PRECONDITION for marking the onboarding lane done, so at the point it actually needs to
  // run, the onboarding lane cannot yet be "done", and neither analytics_attribution nor revenue
  // is guaranteed done either. Against the untouched shipped workspace (no lane done anywhere,
  // PostHog/RevenueCat rows still reading their own shipped "needs ... evidence" status), the
  // scoped invocation used to pass trivially, letting ONB-22's destructive cutover proceed
  // without ever grounding its own declared providers.
  const providerProofScopedRequiresEvidenceBeforeLaneDone = makeFixture("provider-proof-scoped-requires-evidence-before-lane-done");
  runFixture(
    "the unscoped provider-proof check still passes against the untouched workspace with no lane done",
    providerProofScopedRequiresEvidenceBeforeLaneDone,
    "check-live-provider-proof.ts",
    0,
  );
  runFixture(
    "the --providers-scoped provider-proof check requires named-provider evidence even before any lane is done",
    providerProofScopedRequiresEvidenceBeforeLaneDone,
    "check-live-provider-proof.ts",
    1,
    "provider_proof.posthog.status_unproven",
    ["--providers", "PostHog,RevenueCat"],
  );

  const artifactTemplateGap = makeFixture("artifact-template-gap");
  {
    const state = readState(artifactTemplateGap);
    const design = getLane(state, "design");
    design["evidence"] = ["MISSING_TEMPLATE_STARTER.md"];
    writeState(artifactTemplateGap, state);
  }
  runFixture("template evidence without starter fails", artifactTemplateGap, "check-artifact-templates.ts", 1, "artifact_templates.design.starter_missing", [
    "--skill-root",
    skillRoot,
  ]);

  const artifactTemplatePathDrift = makeFixture("artifact-template-path-drift");
  {
    const state = readState(artifactTemplatePathDrift);
    const design = getLane(state, "design");
    design["evidence"] = ["UX_PATTERNS.md"];
    writeState(artifactTemplatePathDrift, state);
  }
  runFixture("template evidence basename drift fails", artifactTemplatePathDrift, "check-artifact-templates.ts", 1, "no exact starter template path", [
    "--skill-root",
    skillRoot,
  ]);

  const agentEvalGap = makeEmptyFixture("agent-eval-gap");
  runFixture("too few agent behavior evals fail", agentEvalGap, "run-agent-evals.ts", 1, "agent_evals.too_few");

  // Drift the AUTHORED token, not a promoted one. DESIGN.md is the token authority since
  // ae614c1 (studio/seed/theme.tokens.json is gone), and check-token-promotion hashes DESIGN.md's
  // tokens and looks for that hash in every design/system/ output. Editing an output instead
  // would test the wrong direction: the point is that re-authoring without re-promoting fails.
  const tokenPromotionStale = makeFixture("token-promotion-stale");
  {
    const designPath = path.join(tokenPromotionStale, "DESIGN.md");
    const design = readFileSync(designPath, "utf8");
    const authored = '  primary: "#0c7c59"';
    if (!design.includes(authored)) throw new Error(`token-promotion-stale fixture cannot find the authored primary color in ${designPath}`);
    writeFileSync(designPath, design.replace(authored, '  primary: "#123456"'), "utf8");
  }
  runFixture("stale promoted design tokens fail", tokenPromotionStale, "check-token-promotion.ts", 1, "token_promotion.output_stale");

  const staleSkillVersion = makeEmptyFixture("stale-skill-version");
  const latestSkillRoot = path.join(staleSkillVersion, "latest");
  const installedSkillRoot = path.join(staleSkillVersion, "installed");
  mkdirSync(latestSkillRoot, { recursive: true });
  mkdirSync(installedSkillRoot, { recursive: true });
  writeFileSync(
    path.join(latestSkillRoot, "skill-version.json"),
    JSON.stringify({ skill: "b2c-app-builder", version: "0.2.0", updatedAt: "2026-05-30" }, null, 2),
    "utf8",
  );
  writeFileSync(
    path.join(installedSkillRoot, "skill-version.json"),
    JSON.stringify({ skill: "b2c-app-builder", version: "0.1.0", updatedAt: "2026-05-01" }, null, 2),
    "utf8",
  );
  runFixture("stale installed skill version fails", staleSkillVersion, "check-skill-version.ts", 1, "skill_version.stale", [
    "--source",
    latestSkillRoot,
    "--installed",
    installedSkillRoot,
  ]);

  // check:readiness-coverage — the aggregate submit-ready floor.
  const writeReadinessLedger = (root: string, deviceRow: string): void => {
    mkdirSync(path.join(root, "proof/device"), { recursive: true });
    writeFileSync(path.join(root, "proof/device/cold-launch.png"), "png", "utf8");
    writeFileSync(
      path.join(root, "engineering/PRODUCTION_READINESS.md"),
      [
        "# Production Readiness",
        "",
        "Status: submit-ready",
        "",
        "## Device Proof",
        "",
        "| Journey | Route | Evidence | Result |",
        "| --- | --- | --- | --- |",
        deviceRow,
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(root, "engineering/ACCESSIBILITY_READINESS.md"),
      [
        "# Accessibility readiness",
        "",
        "| Task | Device and OS | Result |",
        "| --- | --- | --- |",
        "| Log a colour record | iPhone 15, iOS 18 | Passed |",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(root, "engineering/APP_QUALITY.md"),
      ["# App quality", "", "| Measure | Threshold | Observed | Status |", "| --- | --- | --- | --- |", "| Crashes | < 1% | 0.2% | done |"].join("\n"),
      "utf8",
    );
  };

  const readinessTemplate = makeFixture("readiness-coverage-template");
  runFixture("a readiness ledger with pending rows passes before any submit-ready claim", readinessTemplate, "check-readiness-coverage.ts", 0);

  const readinessClaimedPending = makeFixture("readiness-coverage-claimed-pending");
  {
    const readinessPath = path.join(readinessClaimedPending, "engineering/PRODUCTION_READINESS.md");
    const text = readFileSync(readinessPath, "utf8").replace(/^Status: .*$/m, "Status: submit-ready");
    writeFileSync(readinessPath, text, "utf8");
  }
  runFixture("a submit-ready claim over pending rows fails", readinessClaimedPending, "check-readiness-coverage.ts", 1, "readiness_coverage.row_pending");

  const readinessSimulatorOnly = makeFixture("readiness-coverage-simulator-only");
  writeReadinessLedger(readinessSimulatorOnly, "| cold launch | in-app iOS Simulator, iPhone 17 Pro | `proof/device/cold-launch.png` | Passed |");
  runFixture(
    "simulator-only evidence cannot back a submit-ready claim",
    readinessSimulatorOnly,
    "check-readiness-coverage.ts",
    1,
    "readiness_coverage.simulator_only",
  );

  const readinessDeviceEvidence = makeFixture("readiness-coverage-device-evidence");
  writeReadinessLedger(readinessDeviceEvidence, "| cold launch | Release build on a physical device, iPhone 15 | `proof/device/cold-launch.png` | Passed |");
  runFixture("physical-device evidence with resolved companions passes", readinessDeviceEvidence, "check-readiness-coverage.ts", 0);

  const readinessCompanionPending = makeFixture("readiness-coverage-companion-pending");
  writeReadinessLedger(readinessCompanionPending, "| cold launch | Release build on a physical device, iPhone 15 | `proof/device/cold-launch.png` | Passed |");
  writeFileSync(
    path.join(readinessCompanionPending, "engineering/APP_QUALITY.md"),
    ["# App quality", "", "| Measure | Threshold | Observed | Status |", "| --- | --- | --- | --- |", "| Crashes | TBD | TBD | pending |"].join("\n"),
    "utf8",
  );
  runFixture(
    "placeholder companion readiness rows fail a submit-ready claim",
    readinessCompanionPending,
    "check-readiness-coverage.ts",
    1,
    "readiness_coverage.companion_pending",
  );

  const readinessEvidenceMissing = makeFixture("readiness-coverage-evidence-missing");
  writeReadinessLedger(readinessEvidenceMissing, "| cold launch | Release build on a physical device, iPhone 15 | `proof/device/missing.png` | Passed |");
  runFixture(
    "a passed row citing an absent evidence file fails",
    readinessEvidenceMissing,
    "check-readiness-coverage.ts",
    1,
    "readiness_coverage.evidence_missing",
  );

  // check:orchestration — review-ledger rows.
  const reviewLedgerSelf = makeFixture("orchestration-review-ledger-self");
  {
    const orchestrationPath = path.join(reviewLedgerSelf, "operations/ORCHESTRATION.md");
    const text = replaceTableBlock(
      readFileSync(orchestrationPath, "utf8"),
      "| Surface | Producer | Auditor | Rubric | Verdict | Findings artifact | Date |\n| --- | --- | --- | --- | --- | --- | --- |",
      "| Surface | Producer | Auditor | Rubric | Verdict | Findings artifact | Date |\n| --- | --- | --- | --- | --- | --- | --- |\n| Design system | design-guru (wave 2) | design-guru (wave 2) | design/reviews/rubrics/RUBRIC-design-system-v1.md | pass | DESIGN.md | 2026-09-03 |",
    );
    writeFileSync(orchestrationPath, text, "utf8");
  }
  runFixture(
    "a review-ledger row where producer and auditor match fails",
    reviewLedgerSelf,
    "check-parallel-orchestration.ts",
    1,
    "orchestration.review_ledger.self_review",
  );

  const reviewLedgerFindingsMissing = makeFixture("orchestration-review-ledger-findings-missing");
  {
    const orchestrationPath = path.join(reviewLedgerFindingsMissing, "operations/ORCHESTRATION.md");
    const text = replaceTableBlock(
      readFileSync(orchestrationPath, "utf8"),
      "| Surface | Producer | Auditor | Rubric | Verdict | Findings artifact | Date |\n| --- | --- | --- | --- | --- | --- | --- |",
      "| Surface | Producer | Auditor | Rubric | Verdict | Findings artifact | Date |\n| --- | --- | --- | --- | --- | --- | --- |\n| Design system | design-guru (wave 2) | design-guru (fresh, wave 3) | design/reviews/rubrics/RUBRIC-design-system-v1.md | pass | design/reviews/DESIGN_SYSTEM_REVIEW.md | 2026-09-03 |",
    );
    writeFileSync(orchestrationPath, text, "utf8");
  }
  runFixture(
    "a passing review-ledger row whose findings artifact does not exist fails",
    reviewLedgerFindingsMissing,
    "check-parallel-orchestration.ts",
    1,
    "orchestration.review_ledger.findings_missing",
  );

  const reviewLedgerComplete = makeFixture("orchestration-review-ledger-complete");
  {
    const orchestrationPath = path.join(reviewLedgerComplete, "operations/ORCHESTRATION.md");
    const text = replaceTableBlock(
      readFileSync(orchestrationPath, "utf8"),
      "| Surface | Producer | Auditor | Rubric | Verdict | Findings artifact | Date |\n| --- | --- | --- | --- | --- | --- | --- |",
      "| Surface | Producer | Auditor | Rubric | Verdict | Findings artifact | Date |\n| --- | --- | --- | --- | --- | --- | --- |\n| Design system | design-guru (wave 2) | design-guru (fresh, wave 3) | design/reviews/rubrics/RUBRIC-design-system-v1.md | pass | design/reviews/DESIGN_SYSTEM_REVIEW.md | 2026-09-03 |\n| Copy deck | copy-specialist | marketing-guru (fresh) | workflow auditor contract | pending | product/copy/COPY_REVIEW.md | 2026-09-03 |",
    );
    writeFileSync(orchestrationPath, text, "utf8");
    mkdirSync(path.join(reviewLedgerComplete, "design/reviews"), { recursive: true });
    writeFileSync(path.join(reviewLedgerComplete, "design/reviews/DESIGN_SYSTEM_REVIEW.md"), "# Design system review\n\nNo high-severity findings.\n", "utf8");
  }
  runFixture("a complete review ledger with existing findings passes", reviewLedgerComplete, "check-parallel-orchestration.ts", 0);
}

function writeValidDesignExploration(root: string): void {
  const designPath = path.join(root, "DESIGN.md");
  const source = readFileSync(designPath, "utf8");
  const exploration = `exploration:
  schemaVersion: 1
  selectedConceptId: focus-canvas
  process:
    referenceAccess: structured-source
    referenceAccessNote: The supplied reference pack was available as structured source; no unavailable Figma edit was represented as complete.
    referenceInspection: The reference pack was inspected for object geometry, hierarchy, motion cues, and responsive composition before drafting.
    tangibleDraft: A low-hierarchy packing canvas draft was rendered with the three surface treatments and a first onboarding path.
    critique: The draft review found that narrow-screen omissions and the onboarding empty-state cue were difficult to identify.
    revision: The selected canvas direction clarified object status, the primary action, and the shared object model through onboarding.
    chosenTarget: The chosen target is a calm, direct packing canvas whose object geometry remains recognizable across native and web surfaces.
    runtimeComparison: The implementation was compared with the chosen target on the first viewport, onboarding path, and responsive desktop composition; drift was repaired before acceptance.
  concepts:
    - id: focus-canvas
      name: Focus canvas
      premise: Familiar packing objects move into one calm canvas so task state remains immediately visible.
      referenceMappings:
        - referenceId: reference.hierarchy
          principle: Transfer clear completion hierarchy while keeping the chosen product object system original.
      treatments:
        native: Direct manipulation and native controls share one focused packing scene with persistent status.
        mobileWeb: A narrow proof sequence places the active packing object before concise acquisition copy.
        desktopWeb: A broad split scene keeps interactive packing proof beside the promise and primary action.
      distinguishingMechanic: One object physically changes location while its label and remaining quantity update together.
      decision: selected
      rationale: This direction makes the central behavior legible fastest and carries one identity across both surfaces.
    - id: sequence-rail
      name: Sequence rail
      premise: Packing becomes a paced sequence of category stops with progress moving along a continuous route.
      referenceMappings:
        - referenceId: reference.progress
          principle: Transfer stable progress cues and clear next actions without borrowing another product's visual identity.
      treatments:
        native: A vertical native rail connects category stops and exposes the next incomplete item beside each stop.
        mobileWeb: A compact horizontal sequence scrolls through three useful states before the acquisition action.
        desktopWeb: A long route crosses the page and connects product proof, recovery behavior, and repeat use.
      distinguishingMechanic: Completing an item advances a continuous route marker through ordered packing categories.
      decision: rejected
      rationale: The route communicates progress, but it adds sequence where people need flexible edits across categories.
    - id: labeled-shelf
      name: Labeled shelf
      premise: Belongings sit in a tidy visual shelf where labeled compartments expose omissions and repeated essentials.
      referenceMappings:
        - referenceId: reference.objects
          principle: Transfer expressive object clarity and concise feedback while preserving this product's own composition.
      treatments:
        native: A native grid groups accessible object rows beneath shelf labels and keeps quantity controls nearby.
        mobileWeb: A single shelf crop reveals missing and packed states in a compact vertical landing composition.
        desktopWeb: Multiple shelf bays show category breadth while a fixed proof panel explains the saved result.
      distinguishingMechanic: Each packed object settles into a labeled compartment that exposes gaps through empty silhouettes.
      decision: rejected
      rationale: The shelf makes omissions clear, but its rigid compartments scale poorly for custom items and long names.
`;
  if (!source.includes("colors:")) throw new Error("DESIGN.md fixture lost its colors frontmatter key");
  writeFileSync(designPath, source.replace("colors:\n", `${exploration}colors:\n`), "utf8");
}
