import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { accessLabel } from "../../../../tooling/lib/founder-copy.js";
import { isRecord } from "../../../../tooling/lib/launch-state.js";
import { type Harness, readState, writeState } from "./_harness.js";

export function register(h: Harness): void {
  const { makeFixture, runFixture: runFixtureBase } = h;
  const literalAccessLabels: Record<string, string> = {
    active: "Active",
    ready: "Ready",
    founder_action_needed: "Needs your help",
    access_pending: "Waiting for access",
    access_ready: "Ready",
  };
  for (const [status, expected] of Object.entries(literalAccessLabels)) {
    if (accessLabel(status) !== expected) {
      throw new Error(`Founder-visible access label drifted for ${status}: expected "${expected}", got "${accessLabel(status)}".`);
    }
  }
  const keepTemp = process.argv.includes("--keep-temp");
  const runFixture: Harness["runFixture"] = (...args) => {
    try {
      runFixtureBase(...args);
    } finally {
      if (!keepTemp) rmSync(args[1], { recursive: true, force: true });
    }
  };

  const baseline = makeFixture("founder-operator-baseline");
  runFixture("shipped founder-zero operator bootstrap passes", baseline, "check-founder-operator-bootstrap.ts", 0);

  const unsupportedGateContract = makeFixture("founder-operator-unsupported-contract");
  const unsupportedLedger = readLedger(unsupportedGateContract);
  unsupportedLedger.schemaVersion = "9.0.0";
  writeLedger(unsupportedGateContract, unsupportedLedger);
  runFixture("unsupported gate contracts fail closed", unsupportedGateContract, "check-founder-operator-bootstrap.ts", 1);

  const noActiveGate = makeFixture("founder-operator-no-active-gate");
  const noActiveGateValue = readLedger(noActiveGate);
  const noActiveFounder = noActiveGateValue.founderModel as Record<string, unknown>;
  noActiveFounder.activeFounderGate = null;
  noActiveFounder.nextFounderAction = "";
  noActiveFounder.nextAgentAction = "Continue product and evidence review while no founder decision is required.";
  writeLedger(noActiveGate, noActiveGateValue);
  reconcileFixture(noActiveGate, noActiveGateValue);
  runFixture("agent work may continue with no invented founder gate", noActiveGate, "check-founder-operator-bootstrap.ts", 0);

  const staleHumanGate = makeFixture("founder-operator-no-active-gate-stale-human");
  const staleHumanValue = readLedger(staleHumanGate);
  const staleHumanFounder = staleHumanValue.founderModel as Record<string, unknown>;
  staleHumanFounder.activeFounderGate = null;
  staleHumanFounder.nextFounderAction = "";
  staleHumanFounder.nextAgentAction = "Continue product and evidence review while no founder decision is required.";
  writeLedger(staleHumanGate, staleHumanValue);
  reconcileFixture(staleHumanGate, staleHumanValue);
  const staleHumanPath = path.join(staleHumanGate, "operations/BUSINESS_ACCESS.md");
  writeFileSync(
    staleHumanPath,
    readFileSync(staleHumanPath, "utf8").replace("- Agent action next:", "- Recommended choice: Approve the stale decision.\n- Agent action next:"),
    "utf8",
  );
  runFixture(
    "no-gate human handoff removes stale choices",
    staleHumanGate,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.human_stale_gate_visible",
  );

  const missingLedger = makeFixture("founder-operator-missing-ledger");
  rmSync(path.join(missingLedger, "operations", "business-access.json"), { force: true });
  runFixture(
    "founder operator bootstrap without structured access state fails",
    missingLedger,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.ledger_missing",
  );

  const invalidLedger = makeFixture("founder-operator-invalid-ledger");
  writeFileSync(path.join(invalidLedger, "operations", "business-access.json"), "{invalid json\n", "utf8");
  runFixture("founder ledger refuses malformed JSON", invalidLedger, "check-founder-operator-bootstrap.ts", 1, "founder_operator.ledger_invalid_json");

  const expertAssumption = makeFixture("founder-operator-expert-assumption");
  const expertValue = readLedger(expertAssumption);
  (expertValue.founderModel as Record<string, unknown>).assumedExperience = "expert";
  writeLedger(expertAssumption, expertValue);
  runFixture("operator cannot assume founder expertise", expertAssumption, "check-founder-operator-bootstrap.ts", 1, "founder_zero_contract_invalid");

  const checklistDump = makeFixture("founder-operator-checklist-dump");
  const checklistValue = readLedger(checklistDump);
  (checklistValue.founderModel as Record<string, unknown>).neverDumpChecklist = false;
  writeLedger(checklistDump, checklistValue);
  runFixture(
    "operator must present one founder action instead of dumping a checklist",
    checklistDump,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_zero_contract_invalid",
  );

  const rawPassword = makeFixture("founder-operator-raw-password");
  const humanPath = path.join(rawPassword, "operations/BUSINESS_ACCESS.md");
  writeFileSync(humanPath, `${readFileSync(humanPath, "utf8")}\npassword: \"do-not-store-this\"\n`, "utf8");
  runFixture("business access artifact with raw password fails", rawPassword, "check-founder-operator-bootstrap.ts", 1, "founder_operator.raw_secret_detected");

  const rawUnquotedToken = makeFixture("founder-operator-raw-unquoted-token");
  const rawUnquotedTokenPath = path.join(rawUnquotedToken, "operations/BUSINESS_ACCESS.md");
  writeFileSync(rawUnquotedTokenPath, `${readFileSync(rawUnquotedTokenPath, "utf8")}\naccess_token=secretvalue123456\n`, "utf8");
  runFixture(
    "business access artifact with an unquoted token fails",
    rawUnquotedToken,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.raw_secret_detected",
  );

  const shortMfa = makeFixture("founder-operator-short-mfa");
  const shortMfaPath = path.join(shortMfa, "operations/BUSINESS_ACCESS.md");
  writeFileSync(shortMfaPath, `${readFileSync(shortMfaPath, "utf8")}\nmfa_code=123456\n`, "utf8");
  runFixture("six-digit MFA values fail secret scanning", shortMfa, "check-founder-operator-bootstrap.ts", 1, "founder_operator.raw_secret_detected");

  const recoveryCodeProof = makeFixture("founder-operator-recovery-code-proof");
  const recoveryValue = completeValue(recoveryCodeProof);
  writeFileSync(path.join(recoveryCodeProof, "operations", "proof", "x-access.log"), "recovery_code: ABCD-EFGH-IJKL-MNOP\n", "utf8");
  writeLedger(recoveryCodeProof, recoveryValue);
  reconcileFixture(recoveryCodeProof, recoveryValue);
  runFixture(
    "recovery or MFA values in access proof fail",
    recoveryCodeProof,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.raw_secret_detected",
  );

  const multipleFounderActions = makeFixture("founder-operator-multiple-actions");
  const multipleValue = readLedger(multipleFounderActions);
  const multipleAction = "Create the business email, set up Doppler, connect X, invite the operator, and publish the first post.";
  (multipleValue.founderModel as Record<string, unknown>).nextFounderAction = multipleAction;
  ((multipleValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>).founderAction = multipleAction;
  writeLedger(multipleFounderActions, multipleValue);
  runFixture(
    "founder receives one action instead of a multi-task setup dump",
    multipleFounderActions,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.multiple_founder_actions",
  );

  const twoFounderTasks = makeFixture("founder-operator-two-actions");
  const twoTaskValue = readLedger(twoFounderTasks);
  const twoTaskAction = "Confirm the working business name and approve the domain purchase.";
  (twoTaskValue.founderModel as Record<string, unknown>).nextFounderAction = twoTaskAction;
  ((twoTaskValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>).founderAction = twoTaskAction;
  writeLedger(twoFounderTasks, twoTaskValue);
  runFixture(
    "two coordinated founder tasks do not count as one action",
    twoFounderTasks,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.multiple_founder_actions",
  );

  const missingPhase = makeFixture("founder-operator-gate-missing-phase");
  const missingPhaseValue = readLedger(missingPhase);
  applyFounderGateUxContract(missingPhaseValue);
  delete ((missingPhaseValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>).phase;
  writeLedger(missingPhase, missingPhaseValue);
  runFixture(
    "founder gate names the current phase and outcome",
    missingPhase,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.active_gate_phase_missing",
  );

  const unexplainedTerms = makeFixture("founder-operator-gate-unexplained-terms");
  const unexplainedTermsValue = readLedger(unexplainedTerms);
  applyFounderGateUxContract(unexplainedTermsValue);
  const unexplainedGate = (unexplainedTermsValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>;
  unexplainedGate.whatThisIs = "Choose the compensation and recruitment route for the first research interview.";
  (unexplainedGate.question as Record<string, unknown>).prompt = "Which compensation and recruitment route should I use?";
  unexplainedGate.definitions = [];
  writeLedger(unexplainedTerms, unexplainedTermsValue);
  runFixture(
    "founder gate defines specialist terms before asking",
    unexplainedTerms,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.active_gate_terms_undefined",
  );

  const tooFewOptions = makeFixture("founder-operator-gate-too-few-options");
  const tooFewOptionsValue = readLedger(tooFewOptions);
  applyFounderGateUxContract(tooFewOptionsValue);
  const tooFewQuestion = (((tooFewOptionsValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>).question ?? {}) as Record<
    string,
    unknown
  >;
  tooFewQuestion.options = (tooFewQuestion.options as unknown[]).slice(0, 1);
  writeLedger(tooFewOptions, tooFewOptionsValue);
  runFixture(
    "founder gate presents two or three mutually exclusive choices",
    tooFewOptions,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.active_gate_options_invalid",
  );

  const multipleRecommendations = makeFixture("founder-operator-gate-multiple-recommendations");
  const multipleRecommendationsValue = readLedger(multipleRecommendations);
  applyFounderGateUxContract(multipleRecommendationsValue);
  const recommendationOptions = (
    ((multipleRecommendationsValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>).question as Record<string, unknown>
  ).options as Array<Record<string, unknown>>;
  recommendationOptions[1]!.recommended = true;
  writeLedger(multipleRecommendations, multipleRecommendationsValue);
  runFixture(
    "founder gate has exactly one recommended option",
    multipleRecommendations,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.active_gate_recommendation_invalid",
  );

  const recommendationNotFirst = makeFixture("founder-operator-gate-recommendation-not-first");
  const recommendationNotFirstValue = readLedger(recommendationNotFirst);
  const recommendationNotFirstOptions = (
    ((recommendationNotFirstValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>).question as Record<string, unknown>
  ).options as Array<Record<string, unknown>>;
  recommendationNotFirstOptions.reverse();
  writeLedger(recommendationNotFirst, recommendationNotFirstValue);
  runFixture(
    "recommended founder choice must be first",
    recommendationNotFirst,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.active_gate_recommendation_invalid",
  );

  const missingConsequence = makeFixture("founder-operator-gate-missing-consequence");
  const missingConsequenceValue = readLedger(missingConsequence);
  applyFounderGateUxContract(missingConsequenceValue);
  const consequenceOptions = (
    ((missingConsequenceValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>).question as Record<string, unknown>
  ).options as Array<Record<string, unknown>>;
  consequenceOptions[1]!.consequence = "";
  writeLedger(missingConsequence, missingConsequenceValue);
  runFixture(
    "every founder choice explains its consequence",
    missingConsequence,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.active_gate_option_incomplete",
  );

  const unsafeBypass = makeFixture("founder-operator-gate-unsafe-bypass");
  const unsafeBypassValue = readLedger(unsafeBypass);
  applyFounderGateUxContract(unsafeBypassValue);
  const unsafeGate = (unsafeBypassValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>;
  unsafeGate.gateClass = "spend";
  unsafeGate.bypassPolicy = {
    mode: "fallback_allowed",
    optionId: "decide_later",
    reason: "Use a different route without waiting for explicit budget approval.",
    fallbackAction: "Continue the paid action through an alternate account.",
    revisitTrigger: "After the paid action finishes.",
  };
  const unsafeOptions = (unsafeGate.question as Record<string, unknown>).options as Array<Record<string, unknown>>;
  unsafeOptions[1]!.route = "fallback";
  writeLedger(unsafeBypass, unsafeBypassValue);
  runFixture(
    "protected founder gates cannot expose an authorization bypass",
    unsafeBypass,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.active_gate_unsafe_bypass",
  );

  const proceedAsFallback = makeFixture("founder-operator-gate-proceed-as-fallback");
  const proceedAsFallbackValue = readLedger(proceedAsFallback);
  const proceedAsFallbackGate = (proceedAsFallbackValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>;
  (proceedAsFallbackGate.bypassPolicy as Record<string, unknown>).optionId = "choose_working_name";
  writeLedger(proceedAsFallback, proceedAsFallbackValue);
  runFixture(
    "fallback policy cannot point at the proceed choice",
    proceedAsFallback,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.active_gate_bypass_invalid",
  );

  const jargonInEvidence = makeFixture("founder-operator-gate-jargon-in-evidence");
  const jargonInEvidenceValue = readLedger(jargonInEvidence);
  const jargonOptions = (
    ((jargonInEvidenceValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>).question as Record<string, unknown>
  ).options as Array<Record<string, unknown>>;
  jargonOptions[1]!.evidenceEffect = "Retention and data/privacy operator review remain incomplete until this choice returns.";
  writeLedger(jargonInEvidence, jargonInEvidenceValue);
  runFixture(
    "all founder-visible option fields define specialist terms",
    jargonInEvidence,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.active_gate_terms_undefined",
  );

  const protectedDefer = makeFixture("founder-operator-gate-protected-defer");
  const protectedDeferValue = readLedger(protectedDefer);
  applyFounderGateUxContract(protectedDeferValue);
  const protectedGate = (protectedDeferValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>;
  protectedGate.gateClass = "spend";
  protectedGate.bypassPolicy = {
    mode: "defer_only",
    optionId: "decide_later",
    reason: "Spending requires the founder's explicit budget approval and cannot be bypassed.",
    fallbackAction: "Keep the paid lane blocked and continue reversible preparation that does not spend money.",
    revisitTrigger: "Before the first paid credit, subscription, or campaign is started.",
  };
  writeLedger(protectedDefer, protectedDeferValue);
  reconcileFixture(protectedDefer, protectedDeferValue);
  runFixture("protected gates may defer while safe work continues", protectedDefer, "check-founder-operator-bootstrap.ts", 0);

  const resolvedActiveGate = makeFixture("founder-operator-resolved-active-gate");
  const resolvedActiveGateValue = readLedger(resolvedActiveGate);
  applyFounderGateUxContract(resolvedActiveGateValue);
  (
    ((resolvedActiveGateValue.founderModel as Record<string, unknown>).activeFounderGate as Record<string, unknown>).lifecycle as Record<string, unknown>
  ).status = "resolved";
  writeLedger(resolvedActiveGate, resolvedActiveGateValue);
  runFixture(
    "resolved or superseded gates move out of the active slot",
    resolvedActiveGate,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.active_gate_not_pending",
  );

  const agentDeadEnd = makeFixture("founder-operator-agent-dead-end");
  const deadEndValue = readLedger(agentDeadEnd);
  const deadEndFounder = deadEndValue.founderModel as Record<string, unknown>;
  deadEndFounder.nextAgentAction = "Wait for the founder to finish setup and tell me when it is done.";
  (deadEndFounder.activeFounderGate as Record<string, unknown>).agentActionNext = deadEndFounder.nextAgentAction;
  deadEndFounder.nextBusinessOperation = "";
  writeLedger(agentDeadEnd, deadEndValue);
  runFixture("operator cannot stop at a wait-for-me instruction", agentDeadEnd, "check-founder-operator-bootstrap.ts", 1, "founder_operator.agent_dead_end");

  const paraphrasedDeadEnd = makeFixture("founder-operator-paraphrased-dead-end");
  const paraphrasedValue = readLedger(paraphrasedDeadEnd);
  const paraphrasedFounder = paraphrasedValue.founderModel as Record<string, unknown>;
  paraphrasedFounder.nextAgentAction = "Ask the founder to complete all account setup manually before work continues.";
  (paraphrasedFounder.activeFounderGate as Record<string, unknown>).agentActionNext = paraphrasedFounder.nextAgentAction;
  writeLedger(paraphrasedDeadEnd, paraphrasedValue);
  runFixture(
    "paraphrased manual handoff cannot stop business operation",
    paraphrasedDeadEnd,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.agent_dead_end",
  );

  const kindBypass = makeFixture("founder-operator-social-kind-bypass");
  const kindValue = readLedger(kindBypass);
  (kindValue.accounts as Array<Record<string, unknown>>).find((entry) => entry.id === "x")!.kind = "store";
  writeLedger(kindBypass, kindValue);
  runFixture("social accounts cannot be reclassified around readiness", kindBypass, "check-founder-operator-bootstrap.ts", 1, "kind_invalid");

  const incompleteDoppler = makeFixture("founder-operator-incomplete-doppler");
  const incompleteDopplerValue = readLedger(incompleteDoppler);
  (incompleteDopplerValue.doppler as Record<string, unknown>).status = "ready";
  writeLedger(incompleteDoppler, incompleteDopplerValue);
  reconcileFixture(incompleteDoppler, incompleteDopplerValue);
  runFixture(
    "Doppler cannot be ready without account project config and proof",
    incompleteDoppler,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.doppler_ready_unproven",
  );

  const accessNoProof = makeFixture("founder-operator-access-no-proof");
  const accessNoProofValue = completeValue(accessNoProof);
  (accessNoProofValue.accounts as Array<Record<string, unknown>>).find((entry) => entry.id === "x")!.proofPath = "";
  writeLedger(accessNoProof, accessNoProofValue);
  reconcileFixture(accessNoProof, accessNoProofValue);
  runFixture("social access cannot be ready without sanitized proof", accessNoProof, "check-founder-operator-bootstrap.ts", 1, "proof_missing");

  const directoryProof = makeFixture("founder-operator-directory-proof");
  const directoryProofValue = completeValue(directoryProof);
  (directoryProofValue.accounts as Array<Record<string, unknown>>).find((entry) => entry.id === "x")!.proofPath = "operations/proof";
  writeLedger(directoryProof, directoryProofValue);
  reconcileFixture(directoryProof, directoryProofValue);
  runFixture("access proof must be a regular file", directoryProof, "check-founder-operator-bootstrap.ts", 1, "proof_missing");

  const emptyProof = makeFixture("founder-operator-empty-proof");
  const emptyProofValue = completeValue(emptyProof);
  writeFileSync(path.join(emptyProof, "operations", "proof", "x-access.log"), "", "utf8");
  writeLedger(emptyProof, emptyProofValue);
  reconcileFixture(emptyProof, emptyProofValue);
  runFixture("access proof cannot be empty", emptyProof, "check-founder-operator-bootstrap.ts", 1, "proof_missing");

  const binaryProof = makeFixture("founder-operator-binary-proof");
  const binaryProofValue = completeValue(binaryProof);
  writeFileSync(path.join(binaryProof, "operations", "proof", "x-access-sanitized.png"), "not a reviewed binary proof artifact", "utf8");
  (binaryProofValue.accounts as Array<Record<string, unknown>>).find((entry) => entry.id === "x")!.proofPath = "operations/proof/x-access-sanitized.png";
  writeLedger(binaryProof, binaryProofValue);
  reconcileFixture(binaryProof, binaryProofValue);
  runFixture(
    "binary access proof is routed through the Agent Operations redaction contract",
    binaryProof,
    "check-founder-operator-bootstrap.ts",
    1,
    "binary_requires_operations_ledger",
  );

  const wrongOwner = makeFixture("founder-operator-wrong-owner");
  const wrongOwnerValue = completeValue(wrongOwner);
  (wrongOwnerValue.accounts as Array<Record<string, unknown>>).find((entry) => entry.id === "x")!.owner = "agent";
  writeLedger(wrongOwner, wrongOwnerValue);
  reconcileFixture(wrongOwner, wrongOwnerValue);
  runFixture("access-ready business assets remain founder-owned", wrongOwner, "check-founder-operator-bootstrap.ts", 1, "founder_recovery_control_missing");

  const dopplerWrongOwner = makeFixture("founder-operator-doppler-wrong-owner");
  const dopplerWrongOwnerValue = completeValue(dopplerWrongOwner);
  (dopplerWrongOwnerValue.doppler as Record<string, unknown>).workspaceOwner = "agent";
  writeLedger(dopplerWrongOwner, dopplerWrongOwnerValue);
  reconcileFixture(dopplerWrongOwner, dopplerWrongOwnerValue);
  runFixture(
    "ready Doppler remains founder-owned and recoverable",
    dopplerWrongOwner,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.doppler_ownership_invalid",
  );

  const founderCliReady = makeFixture("founder-operator-doppler-founder-cli-ready");
  const founderCliValue = completeValue(founderCliReady);
  (founderCliValue.doppler as Record<string, unknown>).authenticationMethod = "founder_authenticated_cli";
  writeLedger(founderCliReady, founderCliValue);
  reconcileFixture(founderCliReady, founderCliValue);
  runFixture(
    "founder personal CLI authentication is bootstrap-only",
    founderCliReady,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.doppler_ownership_invalid",
  );

  const unreasonedNotNeeded = makeFixture("founder-operator-unreasoned-not-needed");
  const unreasonedValue = readLedger(unreasonedNotNeeded);
  (unreasonedValue.accounts as Array<Record<string, unknown>>).find((entry) => entry.id === "youtube")!.status = "not_needed";
  writeLedger(unreasonedNotNeeded, unreasonedValue);
  runFixture("not-needed account decisions require a reason", unreasonedNotNeeded, "check-founder-operator-bootstrap.ts", 1, "not_needed_unreasoned");

  const trivialNotNeeded = makeFixture("founder-operator-trivial-not-needed");
  const trivialNotNeededValue = readLedger(trivialNotNeeded);
  const trivialYoutube = (trivialNotNeededValue.accounts as Array<Record<string, unknown>>).find((entry) => entry.id === "youtube")!;
  trivialYoutube.status = "not_needed";
  trivialYoutube.statusReason = "n/a";
  writeLedger(trivialNotNeeded, trivialNotNeededValue);
  runFixture("not-needed account reasons must be traceable", trivialNotNeeded, "check-founder-operator-bootstrap.ts", 1, "not_needed_unreasoned");

  const hiddenScope = makeFixture("founder-operator-hidden-scope");
  const hiddenScopeValue = completeValue(hiddenScope);
  const hiddenScopeX = (hiddenScopeValue.accounts as Array<Record<string, unknown>>).find((entry) => entry.id === "x")!;
  hiddenScopeX.grantedScopes = [...(hiddenScopeX.grantedScopes as string[]), "publish"];
  hiddenScopeX.canPublish = false;
  writeLedger(hiddenScope, hiddenScopeValue);
  reconcileFixture(hiddenScope, hiddenScopeValue);
  runFixture("granted scopes cannot hide dangerous permissions", hiddenScope, "check-founder-operator-bootstrap.ts", 1, "scope_mismatch");

  const weakTokenException = makeFixture("founder-operator-weak-token-exception");
  const weakTokenValue = completeValue(weakTokenException);
  const weakTokenX = (weakTokenValue.accounts as Array<Record<string, unknown>>).find((entry) => entry.id === "x")!;
  weakTokenX.accessMethod = "api_token";
  weakTokenX.secretNames = ["X_ACCESS_TOKEN"];
  weakTokenX.limitations = ["No role available."];
  writeLedger(weakTokenException, weakTokenValue);
  reconcileFixture(weakTokenException, weakTokenValue);
  runFixture(
    "exceptional token access needs a real delegation gap and rotation contract",
    weakTokenException,
    "check-founder-operator-bootstrap.ts",
    1,
    "exceptional_social_access_unproven",
  );

  const missingUpdatedAt = makeFixture("founder-operator-missing-updated-at");
  const missingUpdatedValue = completeValue(missingUpdatedAt);
  missingUpdatedValue.updatedAt = "";
  writeLedger(missingUpdatedAt, missingUpdatedValue);
  reconcileFixture(missingUpdatedAt, missingUpdatedValue);
  runFixture("active operator state needs an update timestamp", missingUpdatedAt, "check-founder-operator-bootstrap.ts", 1, "updated_at_missing");

  const prematureReady = makeFixture("founder-operator-premature-ready");
  const prematureReadyValue = completeValue(prematureReady);
  prematureReadyValue.status = "ready";
  writeLedger(prematureReady, prematureReadyValue);
  reconcileFixture(prematureReady, prematureReadyValue);
  runFixtureBase(
    "operator bootstrap cannot be ready before the ownership spine and account inventory are resolved",
    prematureReady,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.ready_with_setup_gaps",
  );
  runFixture(
    "ready state cannot retain the initial step-away gate",
    prematureReady,
    "check-founder-operator-bootstrap.ts",
    1,
    "founder_operator.ready_with_stale_gate",
  );

  const complete = makeFixture("founder-operator-complete");
  const value = completeValue(complete);
  writeLedger(complete, value);
  reconcileFixture(complete, value);
  runFixture("founder-zero operator with Doppler and delegated social proof passes", complete, "check-founder-operator-bootstrap.ts", 0);

  const ready = makeFixture("founder-operator-ready");
  const readyLedger = readyValue(ready);
  writeLedger(ready, readyLedger);
  reconcileFixture(ready, readyLedger);
  runFixture("resolved founder-owned operator bootstrap passes ready state", ready, "check-founder-operator-bootstrap.ts", 0);

  const escapedAction = makeFixture("founder-operator-escaped-action");
  const escapedValue = readLedger(escapedAction);
  const escapedFounder = escapedValue.founderModel as Record<string, unknown>;
  const escapedGate = escapedFounder.activeFounderGate as Record<string, unknown>;
  escapedGate.target = "X & Instagram profile choice";
  escapedGate.founderAction = "Confirm X & Instagram as the first social profile target.";
  (escapedGate.question as Record<string, unknown>).prompt = escapedGate.founderAction;
  escapedFounder.nextFounderAction = escapedGate.founderAction;
  writeLedger(escapedAction, escapedValue);
  reconcileFixture(escapedAction, escapedValue);
  runFixture("founder actions containing punctuation reconcile with the human handoff", escapedAction, "check-founder-operator-bootstrap.ts", 0);
}

function readLedger(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, "operations", "business-access.json"), "utf8")) as Record<string, unknown>;
}

function applyFounderGateUxContract(value: Record<string, unknown>): void {
  value.schemaVersion = "2.0.0";
  const founder = value.founderModel as Record<string, unknown>;
  founder.questionMode = "ask_user_question_when_available";
  founder.gateHistory = [];
  founder.currentPhase = {
    id: "phase_0_orient",
    label: "Set the foundation",
    outcome: "A clear working identity and the next safe setup step.",
  };
  const gate = founder.activeFounderGate as Record<string, unknown>;
  Object.assign(gate, {
    gateClass: "scope",
    origin: "skill_requirement",
    phase: {
      id: "phase_0_orient",
      label: "Set the foundation",
      outcome: "A clear working identity and the next safe setup step.",
    },
    definitions: [],
    question: {
      header: "Working name",
      prompt: founder.nextFounderAction,
      options: [
        {
          id: "choose_working_name",
          label: "Choose a name",
          route: "proceed",
          description: "Use a working name now so account and product research can stay organized.",
          consequence: "The name remains provisional until collision and storefront checks are complete.",
          agentActionNext: founder.nextAgentAction,
          evidenceEffect: "The business identity gate can move forward with a clearly provisional name.",
          recommended: true,
        },
        {
          id: "decide_later",
          label: "Decide later",
          route: "defer",
          description: "Keep the name open while I continue work that does not depend on public identity.",
          consequence: "Account creation and public naming remain blocked, but reversible product inspection continues.",
          agentActionNext: "Continue repo and product-state inspection without creating identity-bound accounts or public assets.",
          evidenceEffect: "The identity lane remains partial and cannot be used as launch-ready proof.",
          recommended: false,
        },
      ],
    },
    bypassPolicy: {
      mode: "fallback_allowed",
      optionId: "decide_later",
      reason: "A working name can be deferred because private, reversible discovery does not depend on it.",
      fallbackAction: "Continue private product and repo discovery without creating identity-bound accounts.",
      revisitTrigger: "Before creating public accounts, buying a domain, or locking store metadata.",
    },
    safeWorkWhileWaiting: "Continue read-only repo and product-state inspection; do not infer consent or create public identity assets.",
    lifecycle: {
      status: "pending",
      presentedAt: "",
      supersedesGateId: "",
    },
  });
}

function writeLedger(root: string, value: Record<string, unknown>): void {
  writeFileSync(path.join(root, "operations", "business-access.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function completeValue(root: string): Record<string, unknown> {
  const value = readLedger(root);
  const now = "2026-07-12T18:00:00.000Z";
  value.status = "active";
  value.updatedAt = now;
  const proofDir = path.join(root, "operations", "proof");
  mkdirSync(proofDir, { recursive: true });
  writeFileSync(path.join(proofDir, "doppler.log"), "Doppler identity, project/config, and safe injection smoke test passed; values not printed.\n", "utf8");
  writeFileSync(path.join(proofDir, "x-access.log"), "X Delegate contributor access read back for @example; recovery and 2FA remain founder-owned.\n", "utf8");
  Object.assign(value.doppler as Record<string, unknown>, {
    status: "ready",
    cliVersion: "v3.76.0",
    docsCheckedAt: now,
    authenticatedAccountLabel: "founder business workspace",
    workspaceOwner: "founder",
    operatorIdentityLabel: "launch operator",
    operatorRole: "collaborator with config read access",
    authenticationMethod: "delegated_role",
    recoveryOwner: "founder",
    mfaOwner: "founder",
    revocationPath: "Doppler workplace members: remove launch operator",
    project: "example-app",
    configs: ["dev_personal", "stg", "prd"],
    secretNames: ["X_OAUTH_ACCESS_TOKEN"],
    proofPath: "operations/proof/doppler.log",
  });
  const x = (value.accounts as Array<Record<string, unknown>>).find((entry) => entry.id === "x")!;
  Object.assign(x, {
    status: "access_ready",
    exactAccount: "@example",
    businessAsset: "Example App X account",
    owner: "founder",
    accessMethod: "delegated_role",
    operatorIdentityLabel: "launch operator X identity",
    operatorRole: "contributor",
    delegatedBy: "founder",
    revocationPath: "X Delegate: remove contributor access",
    grantedScopes: ["observe", "draft", "analytics"],
    canObserve: true,
    canDraft: true,
    canPublish: false,
    canReply: false,
    canModerate: false,
    canViewAnalytics: true,
    canSpend: false,
    canChangeIdentity: false,
    canDelete: false,
    recoveryOwner: "founder",
    mfaOwner: "founder",
    secretNames: [],
    checkedAt: now,
    proofPath: "operations/proof/x-access.log",
    limitations: ["Publishing remains founder-gated through the Agent Operations approval envelope."],
  });
  return value;
}

function readyValue(root: string): Record<string, unknown> {
  const value = completeValue(root);
  value.status = "ready";
  const founder = value.founderModel as Record<string, unknown>;
  const activeGate = founder.activeFounderGate as Record<string, unknown>;
  Object.assign(activeGate, {
    id: "approve-first-social-draft",
    actionType: "approval",
    target: "first social content draft",
    gateClass: "public_action",
    origin: "skill_requirement",
    phase: {
      id: "phase_6",
      label: "Prepare the first public action",
      outcome: "An approved social draft with a scoped publish envelope and no inferred permission.",
    },
    whatThisIs: "Review the first social content draft before any public publishing is authorized.",
    whyNow: "It lets the agent begin the operating rhythm while the founder retains final public voice control.",
    founderAction: "Approve or revise the first social content draft; nothing will be published until you approve it.",
    definitions: [],
    question: {
      header: "Social draft",
      prompt: "Approve or revise the first social content draft; nothing will be published until you approve it.",
      options: [
        {
          id: "approve_draft",
          label: "Approve draft",
          route: "proceed",
          description: "Approve this exact draft for the separately scoped publishing action.",
          consequence: "The agent may prepare the exact publish envelope, but approval does not widen its account, content, or time scope.",
          agentActionNext: "Finalize the approved draft, verify the exact account and approval envelope, then prepare the scheduled publishing action.",
          evidenceEffect: "The approved content digest can be attached to the one-shot Agent Operations envelope.",
          recommended: true,
        },
        {
          id: "decide_later",
          label: "Decide later",
          route: "defer",
          description: "Keep public publishing blocked while the agent continues private preparation and research.",
          consequence: "Nothing is published, and the public-action lane remains blocked until an explicit approval is recorded.",
          agentActionNext: "Continue private content preparation and account verification without posting or scheduling anything.",
          evidenceEffect: "Draft evidence remains preparation-only and cannot count as public launch proof.",
          recommended: false,
        },
      ],
    },
    bypassPolicy: {
      mode: "defer_only",
      optionId: "decide_later",
      reason: "Public publishing requires explicit founder approval and cannot be bypassed.",
      fallbackAction: "Keep publishing blocked and continue private content preparation and account verification.",
      revisitTrigger: "Before scheduling or publishing this or any replacement social draft.",
    },
    safeWorkWhileWaiting: "Continue private preparation and verification; do not infer consent or publish, schedule, or reply publicly.",
    agentActionNext: "Finalize the approved draft, verify the exact account and approval envelope, then prepare the scheduled publishing action.",
    successProof: "The approved content digest and scoped publish envelope are recorded in Agent Operations before execution.",
  });
  founder.currentPhase = activeGate.phase;
  founder.nextFounderAction = activeGate.founderAction;
  founder.nextAgentAction = activeGate.agentActionNext;
  founder.nextBusinessOperation = "Continue the weekly social, support, analytics, store, and launch operating rhythm with proof after each action.";
  const proofDir = path.join(root, "operations", "proof");
  writeFileSync(
    path.join(proofDir, "business-email.log"),
    "Founder-owned business email and recovery custody read back; operator access is revocable and values are not recorded.\n",
    "utf8",
  );
  const accounts = value.accounts as Array<Record<string, unknown>>;
  const email = accounts.find((entry) => entry.id === "business_email")!;
  Object.assign(email, {
    status: "access_ready",
    exactAccount: "founder-owned business inbox",
    businessAsset: "Example App business email",
    owner: "founder",
    accessMethod: "delegated_role",
    operatorIdentityLabel: "launch operator email identity",
    operatorRole: "mailbox delegate",
    delegatedBy: "founder",
    revocationPath: "Business email admin: remove mailbox delegate",
    grantedScopes: ["observe", "draft"],
    canObserve: true,
    canDraft: true,
    recoveryOwner: "founder",
    mfaOwner: "founder",
    checkedAt: value.updatedAt,
    proofPath: "operations/proof/business-email.log",
  });
  for (const account of accounts) {
    if (!["business_email", "x"].includes(String(account.id))) {
      account.status = "not_needed";
      account.statusReason = `Not required for the current platform and launch scope; revisit when ${String(account.platform)} enters scope.`;
    }
  }
  return value;
}

function reconcileFixture(root: string, value: Record<string, unknown>): void {
  const founder = value.founderModel as Record<string, unknown>;
  const activeFounderGate = founder.activeFounderGate;
  const hasActiveGate = isRecord(activeFounderGate);
  const gate: Record<string, unknown> = hasActiveGate ? activeFounderGate : {};
  const state = readState(root);
  const phase = founder.currentPhase as Record<string, unknown>;
  const question = (gate.question ?? {}) as Record<string, unknown>;
  const options = (question.options ?? []) as Array<Record<string, unknown>>;
  const definitions = (gate.definitions ?? []) as Array<Record<string, unknown>>;
  const bypass = (gate.bypassPolicy ?? {}) as Record<string, unknown>;
  if (value.schemaVersion === "2.0.0") {
    (state.project as Record<string, unknown>).phase = phase.id;
  }
  writeState(root, state);

  const humanPath = path.join(root, "operations/BUSINESS_ACCESS.md");
  const currentHuman = readFileSync(humanPath, "utf8");
  const definitionText = definitions.map((entry) => `${String(entry.term)}: ${String(entry.meaning)}`).join("; ") || "None needed for this decision.";
  const optionLines = options
    .map(
      (option, index) =>
        `- ${index === 0 ? "Recommended" : "Alternative"} choice: ${String(option.label)} - ${String(option.consequence)} Agent next: ${String(option.agentActionNext)} Evidence: ${String(option.evidenceEffect)}`,
    )
    .join("\n");
  const gateLines = hasActiveGate
    ? `- Decision type: ${gateClassLabel(gate.gateClass)}; requested by ${gateOriginLabel(gate.origin)}.
- What this is: ${String(gate.whatThisIs)}
- Why now: ${String(gate.whyNow)}
- Definitions: ${definitionText}
- Founder action: ${String(founder.nextFounderAction)}
${optionLines}
- Skip/bypass policy: ${bypassModeLabel(bypass.mode)} through \`${String(bypass.optionId)}\`; ${String(bypass.reason)} ${String(bypass.fallbackAction)}
- Revisit before: ${String(bypass.revisitTrigger)}
- Safe work while waiting: ${String(gate.safeWorkWhileWaiting)}
- Agent action next: ${String(founder.nextAgentAction)}
- Success proof: ${String(gate.successProof)}`
    : `- Definitions: No founder decision is pending.
- Founder action: None. The agent continues the recorded next action.
- Agent action next: ${String(founder.nextAgentAction)}`;
  const section = `## One Next Action

- Phase: ${String(phase.label)} (\`${String(phase.id)}\`)
- Outcome: ${String(phase.outcome)}
${gateLines}
- Next business operation: ${String(founder.nextBusinessOperation)}`;
  writeFileSync(humanPath, currentHuman.replace(/## One Next Action[\s\S]*?(?=\n## )/, section), "utf8");
}

function gateClassLabel(value: unknown): string {
  return value === "public_action" ? "Public action" : value === "scope" ? "Working-scope choice" : String(value ?? "Founder decision");
}

function gateOriginLabel(value: unknown): string {
  return value === "skill_requirement" ? "the launch workflow" : value === "agent_proposal" ? "the agent recommendation" : String(value ?? "current work");
}

function bypassModeLabel(value: unknown): string {
  return value === "fallback_allowed" ? "A safe fallback is available" : "This can be deferred, not bypassed";
}
