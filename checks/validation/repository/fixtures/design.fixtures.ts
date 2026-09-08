import { createHash, createPrivateKey, createPublicKey, sign as signEd25519, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, expectRecord, getLane, readState, writeState } from "./_harness.js";
import { compilePlan, type CatalogInput } from "../../../../kernel/engine/compile.js";
import { workspaceArtifactFingerprint } from "../../../../kernel/engine/review-evidence.js";
import {
  beginAttempt,
  DESIGN_TASTE_DELEGATION_APPROVAL_ID,
  loadRunState,
  reconcilePatch,
  seedRunState,
  workerExecutionIdentity,
  writeRunState,
} from "../../../../kernel/engine/runstate.js";
import {
  appendFounderDecisionAuditEntry,
  canonicalFounderDecisionPayload,
  computeDesignDocumentSha256,
  computeFounderWorkspaceBinding,
  FOUNDER_DECISION_RECEIPT_ALGORITHM,
  FOUNDER_DECISION_RECEIPT_AUDIENCE,
  FOUNDER_ED25519_PUBLIC_KEY_ENV,
  founderReceiptApprovalProvenance,
  pinFounderDecisionTrust,
  readFounderDecisionReceiptChain,
  trustedFounderKeyFromBase64Url,
  verifyIncomingFounderDecisionReceipt,
  type FounderDecisionAuditLink,
  type TrustedFounderDecisionKey,
} from "../../../../kernel/engine/founder-decision-receipt.js";
import { captureDesignAuthorityEvaluation } from "../../../../kernel/engine/design-taste-authority.js";
import { validateDesignWorthiness } from "../../business/design/check-design-worthiness.js";
import { laneKeys, type BusinessStateV2, type FounderDecision, type FounderDecisionReceipt, type RunStateDocument } from "../../../../kernel/schema/types.js";

function writeValidDesignExploration(root: string): void {
  const designPath = path.join(root, "DESIGN.md");
  const source = readFileSync(designPath, "utf8");
  // Test the frontmatter only. The reference DESIGN.md documents the record inside a fenced
  // ```yaml example in its body, so a whole-file regex reports it as present and never injects.
  const frontmatterEnd = source.indexOf("\n---", 4);
  const frontmatter = source.startsWith("---\n") && frontmatterEnd > 0 ? source.slice(4, frontmatterEnd) : "";
  if (/^exploration:\s*$/m.test(frontmatter)) return;
  // Three developed directions, one selected, each with its own mechanic, mapping, and per-surface
  // treatment, so the record passes every rule in tooling/lib/design-exploration.ts.
  const exploration = `exploration:
  schemaVersion: 1
  selectedConceptId: focus-canvas
  concepts:
    - id: focus-canvas
      name: Focus canvas
      premise: One packing canvas holds every item as a movable object so the traveler sees the whole trip at a glance.
      referenceMappings:
        - referenceId: reference.design.consumer-craft-benchmarks
          principle: Direct manipulation of concrete objects keeps the primary task visible without modal detours.
      treatments:
        native: The canvas fills the phone screen and objects respond to drag, long-press, and undo gestures.
        mobileWeb: The landing shows a narrow single-column canvas excerpt that scrolls as one continuous story.
        desktopWeb: The landing places the canvas beside its explanation in a two-column wide composition.
      distinguishingMechanic: Every item is a draggable object on one shared canvas and gaps appear as empty silhouettes.
      decision: selected
      rationale: The single canvas makes omissions obvious and keeps editing, undo, and repeat use in one place.
    - id: labeled-shelf
      name: Labeled shelf
      premise: Items settle into fixed labeled compartments so a traveler audits the packing list compartment by compartment.
      referenceMappings:
        - referenceId: reference.design.consumer-craft-benchmarks
          principle: Strong containers communicate completeness through structure rather than through counters.
      treatments:
        native: The phone shows a vertical stack of compartments that expand on tap and collapse when complete.
        mobileWeb: The landing renders one compartment per viewport height as a scrollytelling sequence.
        desktopWeb: The landing arranges all compartments as a grid with a persistent completion summary beside it.
      distinguishingMechanic: Fixed compartments with silhouettes expose missing items through empty labeled slots.
      decision: rejected
      rationale: Rigid compartments scale poorly for custom items and long names and slow down repeat edits.
    - id: checklist-ledger
      name: Checklist ledger
      premise: A dense text ledger lists every item with a checkbox so the traveler ticks items in reading order.
      referenceMappings:
        - referenceId: reference.design.consumer-craft-benchmarks
          principle: Familiar list patterns lower learning cost when the task is short and linear.
      treatments:
        native: The phone shows a scrolling ledger with swipe actions and a sticky progress header.
        mobileWeb: The landing shows an animated ledger excerpt with a single sticky call to action.
        desktopWeb: The landing shows the ledger beside a large device frame in a split layout.
      distinguishingMechanic: Linear checkbox rows ordered by category with progress computed from ticked rows.
      decision: rejected
      rationale: The ledger hides the shape of the trip and gives no visual cue for what is still missing.
`;
  if (!source.includes("colors:\n")) throw new Error("DESIGN.md fixture lost its colors frontmatter key");
  writeFileSync(designPath, source.replace("colors:\n", `${exploration}colors:\n`), "utf8");
}

const FOUNDER_FIXTURE_PRIVATE_KEY_PKCS8_BASE64URL = "MC4CAQAwBQYDK2VwBCIEIDJZUpcKmPH9DNx-TDcfheIEaO4rCzJZEuXuGOZVo73r";
const WRONG_FOUNDER_FIXTURE_PUBLIC_KEY_SPKI_BASE64URL = "MCowBQYDK2VwAyEAW0HW2KzOos7M24PzPNAj_R9Nj_-J7ooecKOj-63OTOs";

interface FounderFixtureKey {
  readonly privateKey: KeyObject;
  readonly trustedKey: TrustedFounderDecisionKey;
  readonly publicKeyBase64Url: string;
}

function founderFixtureKey(): FounderFixtureKey {
  const privateKey = createPrivateKey({
    key: Buffer.from(FOUNDER_FIXTURE_PRIVATE_KEY_PKCS8_BASE64URL, "base64url"),
    format: "der",
    type: "pkcs8",
  });
  const publicKeyDer = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  if (typeof publicKeyDer === "string") throw new Error("fixture Ed25519 public key must export as DER bytes");
  const publicKey = Buffer.from(publicKeyDer).toString("base64url");
  return {
    privateKey,
    trustedKey: trustedFounderKeyFromBase64Url(publicKey),
    publicKeyBase64Url: publicKey,
  };
}

const FOUNDER_FIXTURE_KEY = founderFixtureKey();
const WRONG_FOUNDER_FIXTURE_KEY = trustedFounderKeyFromBase64Url(WRONG_FOUNDER_FIXTURE_PUBLIC_KEY_SPKI_BASE64URL);

export function register(h: Harness): void {
  const { makeFixture, makeEmptyFixture, runFixture, results } = h;

  const zeroCardDecision = `
\`\`\`yaml
experience_card_selection:
  status: not_applicable
  user_job: Locate the household document and read its renewal date.
  rationale: Predictable retrieval needs no commitment, reward, wait or intent mirror.
  alternative: Show the requested record immediately with clear status and recovery.
\`\`\`
`;
  const zeroCardPacket = (name: string, decision = zeroCardDecision) => {
    const root = makeFixture(name);
    const directory = path.join(root, "product/experience/emotional-design");
    writeFileSync(
      path.join(directory, "EMOTIONAL_DESIGN.md"),
      [
        "# Emotional North Star",
        "Clear predictable document retrieval.",
        "## Target Emotional Journey",
        "## Card Application Map",
        "## Ethics Attestation",
        "## Measurement Plan",
        "## Integration",
        "## Acceptance Checklist",
        "11_STAR_EXPERIENCE.md analytics/ANALYTICS.md DESIGN.md product/ONBOARDING.md",
        decision,
      ].join("\n"),
    );
    writeFileSync(
      path.join(directory, "EMOTIONAL_AUDIT.md"),
      ["# Journey Discovery", "## Six-Lens Review", "## Card Application", "## Counter-Metric", "## Star Level", "## Pathway to Better State", decision].join(
        "\n",
      ),
    );
    return root;
  };
  const zeroCards = zeroCardPacket("emotional-explicit-zero-cards");
  runFixture(
    "explicit substantive zero-card design and independent audit pass",
    zeroCards,
    "check-emotional-design.ts",
    0,
    undefined,
    [],
    undefined,
    "card_commitment_not_applied",
  );
  for (const [name, decision] of [
    ["absent", ""],
    ["commented-out", `<!--${zeroCardDecision}-->`],
    ["unclosed-comment", `<!--${zeroCardDecision}`],
    [
      "placeholder",
      zeroCardDecision.replace(
        "Predictable retrieval needs no commitment, reward, wait or intent mirror.",
        "TODO write a substantive product-specific rationale after review.",
      ),
    ],
    ["short", zeroCardDecision.replace("Predictable retrieval needs no commitment, reward, wait or intent mirror.", "Not needed.")],
    ["duplicate", zeroCardDecision + zeroCardDecision],
    ["unknown-key", zeroCardDecision.replace("  status:", "  bypass: true\n  status:")],
  ]) {
    runFixture(
      `zero-card ${name} decision fails`,
      zeroCardPacket(`emotional-zero-${name}`, decision),
      "check-emotional-design.ts",
      1,
      "emotional_design.no_card_blocks",
    );
  }
  const singleCard = zeroCardPacket(
    "emotional-one-selected-card",
    `
experience_card:
  card_id: document-reminder-preference
  mechanism: commitment
  bright_line: The reminder follows the date and cadence chosen by the user.
  dark_line: Never use the preference to pressure a subscription purchase.
  guardrail: The user can edit or delete the reminder at any time in settings.
  posthog_event: reminder_preference_saved
  reduced_motion: OS reduce-motion shows the saved preference immediately without animation.
`,
  );
  {
    const file = path.join(singleCard, "product/experience/emotional-design/EMOTIONAL_AUDIT.md");
    writeFileSync(
      file,
      [
        "# Journey Discovery",
        "## Six-Lens Review",
        "## Card Application",
        "Commitment Card: the preference remains editable in settings.",
        "## Counter-Metric",
        "## Star Level",
        "## Pathway to Better State",
      ].join("\n"),
    );
  }
  runFixture(
    "audit maps only the selected card without inventing other cards",
    singleCard,
    "check-emotional-design.ts",
    0,
    undefined,
    [],
    undefined,
    "card_variable_reward_not_applied",
  );
  const hiddenAuditDecision = zeroCardPacket("emotional-zero-hidden-audit-decision");
  {
    const file = path.join(hiddenAuditDecision, "product/experience/emotional-design/EMOTIONAL_AUDIT.md");
    writeFileSync(file, readFileSync(file, "utf8").replace(zeroCardDecision, `<!--${zeroCardDecision}-->`));
  }
  runFixture(
    "visible zero-card design cannot bless a hidden audit decision",
    hiddenAuditDecision,
    "check-emotional-design.ts",
    1,
    "emotional_audit.no_card_mapping",
  );
  const visibleWithHiddenDraft = zeroCardPacket("emotional-zero-visible-with-hidden-draft", `<!--${zeroCardDecision}-->${zeroCardDecision}`);
  runFixture("visible zero-card decision ignores a hidden draft duplicate", visibleWithHiddenDraft, "check-emotional-design.ts", 0);
  const zeroAuditMissing = zeroCardPacket("emotional-zero-audit-missing-decision");
  {
    const file = path.join(zeroAuditMissing, "product/experience/emotional-design/EMOTIONAL_AUDIT.md");
    writeFileSync(file, readFileSync(file, "utf8").replace(zeroCardDecision, "No selected cards."));
  }
  runFixture("zero-card audit must independently record applicability", zeroAuditMissing, "check-emotional-design.ts", 1, "emotional_audit.no_card_mapping");
  const zeroCardLiveLie = zeroCardPacket("emotional-zero-live-lie");
  writeFileSync(path.join(zeroCardLiveLie, "product/ONBOARDING.md"), "Join 999 users who already started today.");
  runFixture(
    "zero-card decision never excuses fabricated live social proof",
    zeroCardLiveLie,
    "check-emotional-design.ts",
    1,
    "emotional_design.fake_social_proof_phrase",
  );
  const selectedDespiteSkip = zeroCardPacket("emotional-selected-despite-skip");
  {
    const state = readState(selectedDespiteSkip);
    const lane = getLane(state, "emotional_design");
    lane.status = "not_needed";
    lane.reason = "The document retrieval task uses ordinary predictable feedback.";
    writeState(selectedDespiteSkip, state);
    const file = path.join(selectedDespiteSkip, "product/experience/emotional-design/EMOTIONAL_DESIGN.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8") +
        `
experience_card:
  card_id: undeclared-reward
  mechanism: variable_reward
  trigger_moment: record lookup completion
  bright_line: Display only truthful document data from the selected record.
  dark_line: Never hide an existing document to induce another attempt.
  guardrail: Return the available result immediately after lookup completes.
  posthog_event: document_opened
`,
    );
  }
  runFixture(
    "skipped lane and zero-card claim cannot bypass applied reward ethics",
    selectedDespiteSkip,
    "check-emotional-design.ts",
    1,
    "emotional_design.variable_reward_missing_user_control_escape_hatch",
  );
  runFixture("zero-card claim conflicts with an applied card", selectedDespiteSkip, "check-emotional-design.ts", 1, "emotional_design.selection_conflict");

  const emotionalDesignMissing = makeFixture("emotional-design-missing");
  rmSync(path.join(emotionalDesignMissing, "product", "experience", "emotional-design"), { recursive: true, force: true });
  runFixture("missing emotional design contract fails", emotionalDesignMissing, "check-emotional-design.ts", 1, "emotional_design.contract_missing");

  const emotionalDesignLaneAbsent = makeFixture("emotional-design-lane-absent");
  {
    const state = readState(emotionalDesignLaneAbsent);
    const lanes = expectRecord(state.lanes, "state/business-state.json lanes");
    delete lanes.emotional_design;
    writeState(emotionalDesignLaneAbsent, state);
  }
  runFixture("missing emotional design lane fails", emotionalDesignLaneAbsent, "check-emotional-design.ts", 1, "emotional_design.lane_missing");

  const emotionalDesignGenericHtml = makeFixture("emotional-design-generic-html");
  rmSync(path.join(emotionalDesignGenericHtml, "product", "experience", "emotional-design", "emotional-design.html"), { force: true });
  runFixture(
    "general Design Room does not satisfy emotional board",
    emotionalDesignGenericHtml,
    "check-emotional-design.ts",
    1,
    "emotional_design/emotional_board_missing",
  );

  const emotionalSocialProofUnproven = makeFixture("emotional-social-proof-unproven");
  {
    const cardPath = path.join(emotionalSocialProofUnproven, "product", "experience", "emotional-design", "EMOTIONAL_DESIGN.md");
    const text = readFileSync(cardPath, "utf8");
    writeFileSync(
      cardPath,
      `${text}

experience_card:
  card_id: social-proof-attested-elsewhere
  mechanism: social_proof
  trigger_moment: testimonial rail
  bright_line: The claim helps users evaluate whether the app has real usage.
  dark_line: The count must never be fabricated or borrowed from a different market.
  guardrail: Only publish the testimonial rail when the count source is verified.
  posthog_event: social_proof_viewed
  ethics_attestation: The proof supports user confidence without manufacturing pressure.
  counter_metric: Track social_proof_dismissed and complaint reports.
  social_proof_truthfulness_proof: Verified from App Store and Google Play store data.
`,
      "utf8",
    );
    writeFileSync(
      path.join(emotionalSocialProofUnproven, "product/ONBOARDING.md"),
      [
        "# Onboarding",
        "First value / value-reveal step: the user sees a personalized plan before the paywall.",
        "Join 999 users who already started today.",
        "Paywall: present the RevenueCat offering after the plan.",
        "Analytics: onboarding_started, personalized_plan_viewed, paywall_viewed.",
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "unrelated social proof card does not bless live copy",
    emotionalSocialProofUnproven,
    "check-emotional-design.ts",
    1,
    "emotional_design.fake_social_proof_phrase",
  );

  const emotionalDesignUnguardedReward = makeFixture("emotional-design-unguarded-reward");
  {
    const cardPath = path.join(emotionalDesignUnguardedReward, "product", "experience", "emotional-design", "EMOTIONAL_DESIGN.md");
    const text = readFileSync(cardPath, "utf8");
    // Rename the variable_reward escape-hatch + counter-metric keys so the HIGH-tier gate fires.
    const stripped = text.replace("  user_control_escape_hatch: >", "  removed_escape_hatch: >").replace("  counter_metric: >", "  removed_counter_metric: >");
    writeFileSync(cardPath, stripped, "utf8");
  }
  runFixture(
    "variable reward card without escape hatch fails",
    emotionalDesignUnguardedReward,
    "check-emotional-design.ts",
    1,
    "emotional_design.variable_reward_missing_user_control_escape_hatch",
  );

  const emotionalSpendNearReward = makeFixture("emotional-spend-near-reward");
  writeFileSync(
    path.join(emotionalSpendNearReward, "product/ONBOARDING.md"),
    [
      "# Onboarding",
      "Streak reveal: day 7 celebration with the weekly progress recap.",
      "Paywall: present the RevenueCat offering right here.",
      "Analytics: streak_celebrated, paywall_viewed.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "spend prompt beside a streak moment without stated separation fails",
    emotionalSpendNearReward,
    "check-emotional-design.ts",
    1,
    "emotional_design.spend_prompt_after_reward",
  );

  const emotionalSpendSeparated = makeFixture("emotional-spend-separated");
  writeFileSync(
    path.join(emotionalSpendSeparated, "product/ONBOARDING.md"),
    [
      "# Onboarding",
      "Streak reveal: day 7 celebration with the weekly progress recap.",
      "Paywall: presented on a separate screen, one interaction after the streak reveal resolves.",
      "Analytics: streak_celebrated, paywall_viewed.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "spend prompt with a stated separation from the streak moment passes",
    emotionalSpendSeparated,
    "check-emotional-design.ts",
    0,
    undefined,
    [],
    undefined,
    "spend_prompt_after_reward",
  );

  const emotionalSpendProhibited = makeFixture("emotional-spend-prohibited");
  writeFileSync(
    path.join(emotionalSpendProhibited, "product/ONBOARDING.md"),
    ["# Onboarding", "Never show the paywall inside a streak-break grief screen.", "Analytics: streak_celebrated, paywall_viewed."].join("\n"),
    "utf8",
  );
  runFixture(
    "copy that prohibits the spend-near-reward pattern passes",
    emotionalSpendProhibited,
    "check-emotional-design.ts",
    0,
    undefined,
    [],
    undefined,
    "spend_prompt_after_reward",
  );

  // IAP is the guardrail's own spend terminology — it must trip the veto vocabulary.
  const emotionalSpendIap = makeFixture("emotional-spend-iap");
  writeFileSync(
    path.join(emotionalSpendIap, "product/ONBOARDING.md"),
    [
      "# Onboarding",
      "Streak reveal: day 7 celebration with the weekly progress recap.",
      "IAP offer: surface the premium IAP offer right here.",
      "Analytics: streak_celebrated, iap_viewed.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "an IAP offer beside a streak moment without stated separation fails",
    emotionalSpendIap,
    "check-emotional-design.ts",
    1,
    "emotional_design.spend_prompt_after_reward",
  );

  // Markdown wrapping must not turn a compliant prohibition into a false veto.
  const emotionalSpendWrappedProhibition = makeFixture("emotional-spend-wrapped-prohibition");
  writeFileSync(
    path.join(emotionalSpendWrappedProhibition, "product/ONBOARDING.md"),
    ["# Onboarding", "Never show the", "paywall inside a streak-break grief screen.", "Analytics: streak_celebrated, paywall_viewed."].join("\n"),
    "utf8",
  );
  runFixture(
    "a prohibition wrapped across two lines still earns its escape",
    emotionalSpendWrappedProhibition,
    "check-emotional-design.ts",
    0,
    undefined,
    [],
    undefined,
    "spend_prompt_after_reward",
  );

  // A separation note for one compliant flow must not bless a different dark flow beside it.
  const emotionalSpendBorrowedProof = makeFixture("emotional-spend-borrowed-proof");
  writeFileSync(
    path.join(emotionalSpendBorrowedProof, "product/ONBOARDING.md"),
    [
      "# Onboarding",
      "Streak recap flow: the weekly recap celebrates the run so far.",
      "Paywall: presented on a separate screen, one interaction after the recap resolves.",
      "Streak-break grief screen: shows the lost streak with the recovery path.",
      "Paywall: present the RevenueCat offering right here on this screen.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "a separation note for one flow does not bless the dark flow beside it",
    emotionalSpendBorrowedProof,
    "check-emotional-design.ts",
    1,
    "emotional_design.spend_prompt_after_reward",
  );

  // The negation must bind to placing the spend surface — an unrelated negation in the same
  // sentence must not ride past the veto.
  const emotionalSpendUnrelatedNegation = makeFixture("emotional-spend-unrelated-negation");
  writeFileSync(
    path.join(emotionalSpendUnrelatedNegation, "product/ONBOARDING.md"),
    ["# Onboarding", "Do not animate the streak; show the paywall on the same screen.", "Analytics: streak_celebrated, paywall_viewed."].join("\n"),
    "utf8",
  );
  runFixture(
    "an unrelated negation does not suppress the spend veto",
    emotionalSpendUnrelatedNegation,
    "check-emotional-design.ts",
    1,
    "emotional_design.spend_prompt_after_reward",
  );

  // "there is no separate screen" is an admission, not separation proof.
  const emotionalSpendNegatedProof = makeFixture("emotional-spend-negated-proof");
  writeFileSync(
    path.join(emotionalSpendNegatedProof, "product/ONBOARDING.md"),
    [
      "# Onboarding",
      "Streak-break grief screen and paywall share one view; there is no separate screen.",
      "Analytics: streak_celebrated, paywall_viewed.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "a negated separation phrase does not count as proof",
    emotionalSpendNegatedProof,
    "check-emotional-design.ts",
    1,
    "emotional_design.spend_prompt_after_reward",
  );

  // The prohibitive clause must be the one holding the spend/reward keywords.
  const emotionalSpendOtherClause = makeFixture("emotional-spend-other-clause");
  writeFileSync(
    path.join(emotionalSpendOtherClause, "product/ONBOARDING.md"),
    [
      "# Onboarding",
      "Show the paywall on the streak screen, but do not display an upgrade after dismissal.",
      "Analytics: streak_celebrated, paywall_viewed.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "a prohibition in an unrelated clause does not suppress the spend veto",
    emotionalSpendOtherClause,
    "check-emotional-design.ts",
    1,
    "emotional_design.spend_prompt_after_reward",
  );

  // A prohibited clause about a different spend surface must not bless the violating clause.
  const emotionalSpendSecondClause = makeFixture("emotional-spend-second-clause");
  writeFileSync(
    path.join(emotionalSpendSecondClause, "product/ONBOARDING.md"),
    [
      "# Onboarding",
      "Show the paywall on the streak screen, but do not show a purchase offer after dismissal.",
      "Analytics: streak_celebrated, paywall_viewed.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "a prohibited second clause with its own spend word does not suppress the veto",
    emotionalSpendSecondClause,
    "check-emotional-design.ts",
    1,
    "emotional_design.spend_prompt_after_reward",
  );

  // Checkout screens are spend surfaces — the guardrail's own vocabulary.
  const emotionalSpendCheckout = makeFixture("emotional-spend-checkout");
  writeFileSync(
    path.join(emotionalSpendCheckout, "product/ONBOARDING.md"),
    ["# Onboarding", "Streak-break grief screen opens Stripe Checkout here.", "Analytics: streak_celebrated."].join("\n"),
    "utf8",
  );
  runFixture(
    "a checkout surface beside a streak moment fails the spend veto",
    emotionalSpendCheckout,
    "check-emotional-design.ts",
    1,
    "emotional_design.spend_prompt_after_reward",
  );

  // Lane deferral skips deliverables, never the ethics veto over copy that already exists.
  const emotionalSpendDeferredLane = makeFixture("emotional-spend-deferred-lane");
  {
    const state = readState(emotionalSpendDeferredLane);
    getLane(state, "emotional_design")["status"] = "deferred";
    writeState(emotionalSpendDeferredLane, state);
  }
  writeFileSync(
    path.join(emotionalSpendDeferredLane, "product/ONBOARDING.md"),
    [
      "# Onboarding",
      "Streak reveal: day 7 celebration with the weekly progress recap.",
      "Paywall: present the RevenueCat offering right here.",
      "Analytics: streak_celebrated, paywall_viewed.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "a deferred emotional-design lane still runs the spend veto",
    emotionalSpendDeferredLane,
    "check-emotional-design.ts",
    1,
    "emotional_design.spend_prompt_after_reward",
  );

  const guardrailFixtureHeader = [
    "# Ethics And Dark-Pattern Guardrail",
    "## 1. Bright-Line Vs Dark-Line Distinction",
    "## 2. Regulatory And Platform Landscape",
    "## 3. Per-Mechanism Risk Table",
    "| Mechanism | Risk Tier | Primary Risk | Bright-Line Test | Required Attestation Fields |",
    "|---|---|---|---|---|",
  ];
  const guardrailFixtureFooter = ["## 5. Guardrail Contract", "## 7. Acceptance Checklist"];

  const emotionalTierMismatch = makeFixture("emotional-risk-tier-mismatch");
  {
    const refDir = path.join(emotionalTierMismatch, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Endowed Progress | LOW | Fabricated head start | Progress reflects real inputs | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(refDir, "experience-cards.md"),
      [
        "# Experience Cards",
        "## Card Routing",
        "| Card | Load when | Risk | Spec |",
        "|---|---|---|---|",
        "| Endowed Progress | Real prior progress exists to surface | MEDIUM | link |",
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "index risk tier disagreeing with the guardrail table fails",
    emotionalTierMismatch,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_mismatch",
  );

  const emotionalTierConflict = makeFixture("emotional-risk-tier-conflict");
  {
    const refDir = path.join(emotionalTierConflict, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Intent Mirroring | MEDIUM | Retention friction on cancel | Never on cancel/downgrade | `bright_line` |",
        "| Intent Mirroring | LOW-MEDIUM | Cancellation friction disguised as confirmation | Pause serves the user | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "duplicate risk-table rows with disagreeing tiers fail",
    emotionalTierConflict,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_conflict",
  );

  const emotionalTierDuplicate = makeFixture("emotional-risk-tier-duplicate");
  {
    const refDir = path.join(emotionalTierDuplicate, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Endowed Progress | LOW | Fabricated head start | Progress reflects real inputs | `bright_line`, `posthog_event` |",
        "| Endowed Progress | LOW | Manufactured progress on fake tasks | Starting progress reflects real investment | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "duplicate risk-table rows with agreeing tiers fail",
    emotionalTierDuplicate,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_duplicate_row",
  );

  const emotionalTierTypo = makeFixture("emotional-risk-tier-typo");
  {
    const refDir = path.join(emotionalTierTypo, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Endowed Progress | MEDUM | Fabricated head start | Progress reflects real inputs | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "a misspelled risk tier fails instead of silently dropping the row",
    emotionalTierTypo,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_unrecognized",
  );

  // A blank line mid-table must not silently drop the rows below it from parity.
  const emotionalTierInterrupted = makeFixture("emotional-risk-tier-interrupted");
  {
    const refDir = path.join(emotionalTierInterrupted, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Endowed Progress | LOW | Fabricated head start | Progress reflects real inputs | `bright_line`, `posthog_event` |",
        "",
        "| Endowed Progress | LOW | Manufactured progress on fake tasks | Starting progress reflects real investment | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "rows below a mid-table interruption still reach the parity gate",
    emotionalTierInterrupted,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_duplicate_row",
  );

  // A placeholder tier is legitimate only on the motion-fallback row.
  const emotionalTierPlaceholderAbuse = makeFixture("emotional-risk-tier-placeholder-abuse");
  {
    const refDir = path.join(emotionalTierPlaceholderAbuse, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Endowed Progress | — | Fabricated head start | Progress reflects real inputs | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "a placeholder tier on a canonical mechanism fails",
    emotionalTierPlaceholderAbuse,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_unrecognized",
  );

  // A descending or multi-endpoint range must be malformed, not laundered into a
  // permissive full range by min/max.
  const emotionalTierDescendingRange = makeFixture("emotional-risk-tier-descending-range");
  {
    const refDir = path.join(emotionalTierDescendingRange, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Endowed Progress | HIGH-LOW | Fabricated head start | Progress reflects real inputs | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "a descending risk-tier range fails instead of expanding to all tiers",
    emotionalTierDescendingRange,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_unrecognized",
  );

  // The placeholder allowance identifies the motion-fallback row by its full normalized
  // name — the word "motion" inside an unrelated row name earns no exemption.
  const emotionalTierMotionWordAbuse = makeFixture("emotional-risk-tier-motion-word-abuse");
  {
    const refDir = path.join(emotionalTierMotionWordAbuse, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [...guardrailFixtureHeader, "| Variable Reward Motion | — | Compulsion loop | User can always stop | `bright_line` |", ...guardrailFixtureFooter].join(
        "\n",
      ),
      "utf8",
    );
  }
  runFixture(
    "a placeholder tier on a non-fallback row containing the word motion fails",
    emotionalTierMotionWordAbuse,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_unrecognized",
  );

  // Equal-tier duplicates across bucket rows are still duplicate assignments.
  const emotionalTierBucketDuplicate = makeFixture("emotional-risk-tier-bucket-duplicate");
  {
    const refDir = path.join(emotionalTierBucketDuplicate, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| All other deck cards (Reciprocity, Fresh Start) | LOW–MEDIUM | Card-specific | The card's own bright-line test | base fields |",
        "| All other deck cards (Reciprocity) | LOW–MEDIUM | Card-specific | The card's own bright-line test | base fields |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "the same member in two equal-tier bucket rows fails as a duplicate",
    emotionalTierBucketDuplicate,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_duplicate_row",
  );

  // An explicit row may narrow a bucket range but must not contradict it.
  const emotionalTierBucketConflict = makeFixture("emotional-risk-tier-bucket-conflict");
  {
    const refDir = path.join(emotionalTierBucketConflict, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| All other deck cards (Rating Prompt) | LOW–MEDIUM | Card-specific | The card's own bright-line test | base fields |",
        "| Rating Prompt | HIGH | Platform policy violation | Native API only | `bright_line`, `platform_api_used` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "an explicit row contradicting its bucket range fails",
    emotionalTierBucketConflict,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_conflict",
  );

  // A row that lost its leading pipe is a broken row, not prose.
  const emotionalTierBrokenRow = makeFixture("emotional-risk-tier-broken-row");
  {
    const refDir = path.join(emotionalTierBrokenRow, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Variable Reward | HIGH | Compulsion loop | User can always stop | `bright_line` |",
        "Endowed Progress | HIGH | Fabricated head start | Progress reflects real inputs | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "a risk row missing its leading pipe fails instead of vanishing",
    emotionalTierBrokenRow,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_table_malformed_row",
  );

  // An ordered range spans its intermediate tiers: LOW-HIGH admits MEDIUM.
  const emotionalTierRangeSpan = makeFixture("emotional-risk-tier-range-span");
  {
    const refDir = path.join(emotionalTierRangeSpan, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Endowed Progress | LOW–HIGH | Fabricated head start | Progress reflects real inputs | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(refDir, "experience-cards.md"),
      [
        "# Experience Cards",
        "## Card Routing",
        "| Card | Load when | Risk | Spec |",
        "|---|---|---|---|",
        "| Endowed Progress | Real prior progress exists to surface | MEDIUM | link |",
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "an index tier inside an ordered guardrail range passes",
    emotionalTierRangeSpan,
    "check-emotional-design.ts",
    0,
    undefined,
    [],
    undefined,
    "risk_tier_mismatch",
  );

  // "Emotional Commitment" contains "motion" only as a substring — no placeholder pass.
  const emotionalTierMotionSubstring = makeFixture("emotional-risk-tier-motion-substring");
  {
    const refDir = path.join(emotionalTierMotionSubstring, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [...guardrailFixtureHeader, "| Emotional Commitment | — | Confirmshaming | Exit path is frictionless | `bright_line` |", ...guardrailFixtureFooter].join(
        "\n",
      ),
      "utf8",
    );
  }
  runFixture(
    "a motion substring in the name does not license a placeholder tier",
    emotionalTierMotionSubstring,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_unrecognized",
  );

  // A misspelled index card name must not silently skip parity.
  const emotionalTierNameDrift = makeFixture("emotional-risk-tier-name-drift");
  {
    const refDir = path.join(emotionalTierNameDrift, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Endowed Progress | LOW | Fabricated head start | Progress reflects real inputs | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(refDir, "experience-cards.md"),
      [
        "# Experience Cards",
        "## Card Routing",
        "| Card | Load when | Risk | Spec |",
        "|---|---|---|---|",
        "| Endowed Progres | Real prior progress exists to surface | MEDIUM | link |",
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "a drifted index card name fails instead of skipping parity",
    emotionalTierNameDrift,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_unmapped_card",
  );

  // A truncated index name cannot inherit a canonical tier by prefix.
  const emotionalTierTruncatedName = makeFixture("emotional-risk-tier-truncated-name");
  {
    const refDir = path.join(emotionalTierTruncatedName, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Endowed Progress | LOW | Fabricated head start | Progress reflects real inputs | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(refDir, "experience-cards.md"),
      [
        "# Experience Cards",
        "## Card Routing",
        "| Card | Load when | Risk | Spec |",
        "|---|---|---|---|",
        "| Endowed | Real prior progress exists | LOW | link |",
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "a truncated index card name fails instead of inheriting a tier",
    emotionalTierTruncatedName,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_unmapped_card",
  );

  // Deleting canonical cards from the index must not pass on the survivor.
  const emotionalTierIndexTruncated = makeFixture("emotional-risk-tier-index-truncated");
  {
    const refDir = path.join(emotionalTierIndexTruncated, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Variable Reward | HIGH | Compulsion loop | User can always stop | `bright_line` |",
        "| Endowed Progress | LOW | Fabricated head start | Progress reflects real inputs | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(refDir, "experience-cards.md"),
      [
        "# Experience Cards",
        "## Card Routing",
        "| Card | Load when | Risk | Spec |",
        "|---|---|---|---|",
        "| Variable Reward | An outcome genuinely varies | HIGH | link |",
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "an index missing a canonical tiered card fails reverse coverage",
    emotionalTierIndexTruncated,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_index_missing_card",
  );

  // The routing index must not retain two Risk values for one card.
  const emotionalTierIndexDuplicate = makeFixture("emotional-risk-tier-index-duplicate");
  {
    const refDir = path.join(emotionalTierIndexDuplicate, "knowledge", "experience");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| All other deck cards (Reciprocity) | LOW–MEDIUM | Card-specific | The card's own bright-line test | base fields |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(refDir, "experience-cards.md"),
      [
        "# Experience Cards",
        "## Card Routing",
        "| Card | Load when | Risk | Spec |",
        "|---|---|---|---|",
        "| Reciprocity | An unprompted, real gift can precede any ask | LOW | link |",
        "| Reciprocity | An unprompted, real gift can precede any ask | MEDIUM | link |",
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "duplicate routing rows for one card fail even inside a bucket range",
    emotionalTierIndexDuplicate,
    "check-emotional-design.ts",
    1,
    "emotional_design.risk_tier_duplicate_row",
  );

  /**
   * The third leg of the tier triangle: the card stubs. The index and the guardrail table
   * have been checked against each other since v0.45.0, but each stub declares its own
   * "**Risk tier.**" line and nothing read it. check:founder-copy now derives the HIGH set
   * from those lines to decide which technique names a founder attests to by name, so an
   * unchecked stub tier is a forgeable input to a consent surface.
   */
  function writeCardDeck(name: string, indexRows: string[], stubs: { file: string; heading: string; tier: string }[]): string {
    const root = makeFixture(name);
    const refDir = path.join(root, "knowledge", "experience");
    mkdirSync(path.join(refDir, "experience-cards"), { recursive: true });
    writeFileSync(
      path.join(refDir, "ethics-guardrail.md"),
      [
        ...guardrailFixtureHeader,
        "| Variable Reward | HIGH | Compulsion loop | User can always stop | `bright_line` |",
        "| Endowed Progress | LOW | Fabricated head start | Progress reflects real inputs | `bright_line` |",
        ...guardrailFixtureFooter,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(refDir, "experience-cards.md"),
      ["# Experience Cards", "## Card Routing", "| Card | Load when | Risk | Spec |", "|---|---|---|---|", ...indexRows].join("\n"),
      "utf8",
    );
    for (const stub of stubs) {
      writeFileSync(
        path.join(refDir, "experience-cards", stub.file),
        [`# ${stub.heading} Card`, "", `**Risk tier.** ${stub.tier} — canonical in the routing table.`, ""].join("\n"),
        "utf8",
      );
    }
    return root;
  }

  const variableRewardRow = "| Variable Reward | An outcome genuinely varies | HIGH | link |";
  const endowedRow = "| Endowed Progress | Real prior progress exists to surface | LOW | link |";

  runFixture(
    "stub tiers agreeing with the routing index pass",
    writeCardDeck(
      "emotional-card-stub-clean",
      [variableRewardRow, endowedRow],
      [
        { file: "variable-reward-card.md", heading: "Variable Reward", tier: "HIGH" },
        { file: "endowed-progress-card.md", heading: "Endowed Progress", tier: "LOW" },
      ],
    ),
    "check-emotional-design.ts",
    0,
    undefined,
    [],
    undefined,
    "card_stub",
  );

  runFixture(
    "a stub tier disagreeing with its routing row fails",
    writeCardDeck("emotional-card-stub-mismatch", [variableRewardRow], [{ file: "variable-reward-card.md", heading: "Variable Reward", tier: "MEDIUM" }]),
    "check-emotional-design.ts",
    1,
    "emotional_design.card_stub_tier_mismatch",
  );

  // An unparseable tier line drops the card out of parity AND out of the attestation set,
  // so it must fail rather than skip — the same reasoning as risk_tier_unrecognized.
  runFixture(
    "a stub with no parseable risk tier fails instead of skipping",
    writeCardDeck("emotional-card-stub-no-tier", [variableRewardRow], [{ file: "variable-reward-card.md", heading: "Variable Reward", tier: "SEVERE" }]),
    "check-emotional-design.ts",
    1,
    "emotional_design.card_stub_tier_unrecognized",
  );

  // A stub nobody routes still contributes its tier to the HIGH set.
  runFixture(
    "a stub with no routing row fails",
    writeCardDeck(
      "emotional-card-stub-unrouted",
      [variableRewardRow],
      [
        { file: "variable-reward-card.md", heading: "Variable Reward", tier: "HIGH" },
        { file: "invented-mechanic-card.md", heading: "Invented Mechanic", tier: "HIGH" },
      ],
    ),
    "check-emotional-design.ts",
    1,
    "emotional_design.card_stub_unmapped",
  );

  // Deleting a stub must not silently shrink the deck the founder attests against.
  runFixture(
    "a routed card with no stub file fails reverse coverage",
    writeCardDeck(
      "emotional-card-stub-deleted",
      [variableRewardRow, endowedRow],
      [{ file: "variable-reward-card.md", heading: "Variable Reward", tier: "HIGH" }],
    ),
    "check-emotional-design.ts",
    1,
    "emotional_design.card_stub_missing",
  );

  // --- check-vibecoded-tells ---------------------------------------------------------------

  // Negative control: the shipped section library is deliberately clean of every mechanical
  // tell, so the untouched template must produce zero findings — a false positive here would
  // put permanent noise on every audit run.
  runFixture(
    "clean landing template carries no vibecoded tells",
    makeFixture("vibecode-clean"),
    "check-vibecoded-tells.ts",
    0,
    undefined,
    [],
    undefined,
    "vibecode.",
  );

  const vibecodeIconPack = makeFixture("vibecode-icon-pack");
  writeFileSync(
    path.join(vibecodeIconPack, "growth", "landing", "sections", "IconBar.tsx"),
    'import { Sparkles } from "lucide-react";\nexport function IconBar() {\n  return <Sparkles />;\n}\n',
    "utf8",
  );
  runFixture("conventional icon import warns without failing the gate", vibecodeIconPack, "check-vibecoded-tells.ts", 0, "vibecode.default_icon_pack");

  // A site-shaped landing (index.html present) owes the Tier 1 legal links.
  const vibecodeNoLegal = makeFixture("vibecode-no-legal");
  writeFileSync(
    path.join(vibecodeNoLegal, "growth", "landing", "index.html"),
    '<main><h1>Launch</h1><footer><a href="/about">About</a></footer></main>\n',
    "utf8",
  );
  runFixture("site-shaped landing without terms/privacy links fails", vibecodeNoLegal, "check-vibecoded-tells.ts", 1, "vibecode.legal_links_missing");

  // The same site shape with both links passes — the scope check must not demand legal pages
  // from the bare section component library.
  const vibecodeLegalOk = makeFixture("vibecode-legal-ok");
  writeFileSync(
    path.join(vibecodeLegalOk, "growth", "landing", "index.html"),
    '<main><h1>Launch</h1><footer><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer></main>\n',
    "utf8",
  );
  runFixture("site-shaped landing with legal links passes", vibecodeLegalOk, "check-vibecoded-tells.ts", 0);

  const vibecodeMarkdownLegalOk = makeEmptyFixture("vibecode-markdown-legal-ok");
  mkdirSync(path.join(vibecodeMarkdownLegalOk, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMarkdownLegalOk, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMarkdownLegalOk, "src", "Footer.mdx"), "[Terms](/terms)\n\n[Privacy](/privacy)\n", "utf8");
  runFixture("site-shaped MDX accepts Markdown policy links", vibecodeMarkdownLegalOk, "check-vibecoded-tells.ts", 0, undefined, ["--scan-roots", "src"]);

  const vibecodeMarkdownReferenceLegalOk = makeEmptyFixture("vibecode-markdown-reference-legal-ok");
  mkdirSync(path.join(vibecodeMarkdownReferenceLegalOk, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMarkdownReferenceLegalOk, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeMarkdownReferenceLegalOk, "src", "Footer.mdx"),
    "[Terms][terms-policy]\n\n[Privacy][privacy-policy]\n\n[terms-policy]: /terms\n[privacy-policy]: /privacy\n",
    "utf8",
  );
  runFixture("site-shaped MDX accepts reference-style policy links", vibecodeMarkdownReferenceLegalOk, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeMarkdownFileBoundary = makeEmptyFixture("vibecode-markdown-file-boundary");
  mkdirSync(path.join(vibecodeMarkdownFileBoundary, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMarkdownFileBoundary, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMarkdownFileBoundary, "src", "Example.mdx"), "```md\n[Example](/not-a-policy)\n", "utf8");
  writeFileSync(path.join(vibecodeMarkdownFileBoundary, "src", "Footer.mdx"), "[Terms](/terms)\n\n[Privacy](/privacy)\n", "utf8");
  runFixture(
    "an unterminated fence does not mask policy links from another source file",
    vibecodeMarkdownFileBoundary,
    "check-vibecoded-tells.ts",
    0,
    undefined,
    ["--scan-roots", "src"],
  );

  const vibecodeCommentFileBoundary = makeEmptyFixture("vibecode-comment-file-boundary");
  mkdirSync(path.join(vibecodeCommentFileBoundary, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeCommentFileBoundary, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeCommentFileBoundary, "src", "Example.mdx"), "<!-- [Example](/not-a-policy)\n", "utf8");
  writeFileSync(path.join(vibecodeCommentFileBoundary, "src", "Footer.mdx"), "[Terms](/terms)\n\n[Privacy](/privacy)\n", "utf8");
  runFixture(
    "an invalid MDX comment fails closed without masking another source file",
    vibecodeCommentFileBoundary,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.legal_markup_invalid",
    ["--scan-roots", "src"],
  );

  const vibecodeMarkupFileBoundary = makeEmptyFixture("vibecode-markup-file-boundary");
  mkdirSync(path.join(vibecodeMarkupFileBoundary, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMarkupFileBoundary, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMarkupFileBoundary, "src", "Broken.tsx"), 'export const broken = <a data-example="\n', "utf8");
  writeFileSync(
    path.join(vibecodeMarkupFileBoundary, "src", "Footer.tsx"),
    'const href = "/terms";\nexport function Footer() { return <a href="/privacy">Privacy</a>; }\n',
    "utf8",
  );
  runFixture(
    "an unclosed TSX tag fails legal-link analysis closed per file",
    vibecodeMarkupFileBoundary,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.legal_markup_invalid",
    ["--scan-roots", "src"],
  );

  for (const extension of ["html", "astro", "svelte", "vue"] as const) {
    const malformedMarkupRoot = makeEmptyFixture(`vibecode-${extension}-malformed-opening-tag`);
    mkdirSync(path.join(malformedMarkupRoot, "src"), { recursive: true });
    writeFileSync(path.join(malformedMarkupRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(malformedMarkupRoot, "src", `Broken.${extension}`), '<a href="/terms\n', "utf8");
    const validFooter = '<footer><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>\n';
    writeFileSync(
      path.join(malformedMarkupRoot, "src", `Footer.${extension}`),
      extension === "vue" ? `<template>${validFooter}</template>\n` : validFooter,
      "utf8",
    );
    runFixture(
      `a recognized malformed ${extension} opening tag fails legal-link analysis closed`,
      malformedMarkupRoot,
      "check-vibecoded-tells.ts",
      1,
      "vibecode.legal_markup_invalid",
      ["--scan-roots", "src"],
      undefined,
      "vibecode.legal_links_missing",
    );
  }

  const vibecodeMarkdownImages = makeEmptyFixture("vibecode-markdown-policy-images");
  mkdirSync(path.join(vibecodeMarkdownImages, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMarkdownImages, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMarkdownImages, "src", "Footer.mdx"), "![Terms](/terms)\n\n![Privacy](/privacy)\n", "utf8");
  runFixture("Markdown policy images do not satisfy legal navigation", vibecodeMarkdownImages, "check-vibecoded-tells.ts", 1, "vibecode.legal_links_missing", [
    "--scan-roots",
    "src",
  ]);

  for (const markdownMaskCase of [
    {
      slug: "backtick-fence",
      label: "Markdown links inside backtick fences do not satisfy legal navigation",
      source: "```md\n[Terms](/terms)\n```\n\n[Privacy](/privacy)\n",
      missing: "terms",
    },
    {
      slug: "tilde-fence",
      label: "Markdown links inside tilde fences do not satisfy legal navigation",
      source: "[Terms](/terms)\n\n~~~md\n[Privacy](/privacy)\n~~~\n",
      missing: "privacy",
    },
    {
      slug: "long-backtick-fence",
      label: "a shorter backtick run does not close a longer Markdown fence",
      source: "````md\n```\n[Terms](/terms)\n````\n\n[Privacy](/privacy)\n",
      missing: "terms",
    },
    {
      slug: "long-tilde-fence",
      label: "a shorter tilde run does not close a longer Markdown fence",
      source: "[Terms](/terms)\n\n~~~~md\n~~~\n[Privacy](/privacy)\n~~~~\n",
      missing: "privacy",
    },
    {
      slug: "unterminated-backtick-fence",
      label: "an unterminated backtick fence masks Markdown links through end of file",
      source: "[Privacy](/privacy)\n\n```md\n[Terms](/terms)\n",
      missing: "terms",
    },
    {
      slug: "unterminated-tilde-fence",
      label: "an unterminated tilde fence masks Markdown links through end of file",
      source: "[Terms](/terms)\n\n~~~md\n[Privacy](/privacy)\n",
      missing: "privacy",
    },
    {
      slug: "blockquote-fence",
      label: "Markdown links inside a blockquote container fence do not satisfy legal navigation",
      source: "> ```md\n> [Terms](/terms)\n> ```\n\n[Privacy](/privacy)\n",
      missing: "terms",
    },
    {
      slug: "list-fence",
      label: "Markdown links inside a list container fence do not satisfy legal navigation",
      source: "- ```md\n  [Terms](/terms)\n  ```\n\n[Privacy](/privacy)\n",
      missing: "terms",
    },
    {
      slug: "inline-code",
      label: "Markdown links inside inline code do not satisfy legal navigation",
      source: "`[Terms](/terms)`\n\n[Privacy](/privacy)\n",
      missing: "terms",
    },
    {
      slug: "escaped-link",
      label: "escaped Markdown policy syntax does not satisfy legal navigation",
      source: "\\[Terms](/terms)\n\n[Privacy](/privacy)\n",
      missing: "terms",
    },
  ] as const) {
    const markdownMaskRoot = makeEmptyFixture(`vibecode-markdown-${markdownMaskCase.slug}`);
    mkdirSync(path.join(markdownMaskRoot, "src"), { recursive: true });
    writeFileSync(path.join(markdownMaskRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(markdownMaskRoot, "src", "Footer.mdx"), markdownMaskCase.source, "utf8");
    runFixture(markdownMaskCase.label, markdownMaskRoot, "check-vibecoded-tells.ts", 1, `links no ${markdownMaskCase.missing} page`, ["--scan-roots", "src"]);
  }

  const vibecodeMdxIndentedLink = makeEmptyFixture("vibecode-mdx-indented-link");
  mkdirSync(path.join(vibecodeMdxIndentedLink, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxIndentedLink, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMdxIndentedLink, "src", "Footer.mdx"), "    [Terms](/terms)\n\n[Privacy](/privacy)\n", "utf8");
  runFixture("MDX treats an indented policy link as rendered Markdown", vibecodeMdxIndentedLink, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  for (const mdxNonMarkdownCase of [
    {
      slug: "esm",
      label: "MDX ESM strings do not satisfy legal navigation",
      source: 'export const example = "[Terms](/terms)";\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "esm-exported-function",
      label: "MDX exported functions remain inert across nested braces and blank lines",
      source:
        'export function example() {\n  const nested = { policy: { href: "/terms" } };\n\n  return "[Terms](/terms) <Link to=\\"/terms\\">Terms</Link>";\n}\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "esm-multiline-template",
      label: "MDX multiline ESM templates remain inert across blank lines",
      source:
        'export const example = `\n[Terms](/terms)\n\n${JSON.stringify({ nested: { href: "/terms" } })}\n<Link to="/terms">Terms</Link>\n`;\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "esm-async-export",
      label: "MDX async exports remain inert",
      source: 'export async function example() { return <Link to="/terms" /> }\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "expression",
      label: "MDX expressions do not satisfy legal navigation",
      source: '{"[Terms](/terms) <Link to=\\"/terms\\">Terms</Link>"}\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "expression-lexical-regions",
      label: "MDX expression strings, comments, and regex literals do not satisfy legal navigation",
      source:
        '{(() => {\n  const example = "<Link to=\\"/terms\\">Terms</Link>";\n  const pattern = /<Link to="\\/terms">/;\n  // <Link to="/terms">Terms</Link>\n  return null;\n})()}\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "attribute",
      label: "MDX attribute values do not satisfy Markdown legal navigation",
      source: '<section title="[Terms](/terms)">Example</section>\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "jsx-comment",
      label: "MDX JSX comments do not satisfy legal navigation",
      source: '{/* [Terms](/terms) <Link to="/terms">Terms</Link> */}\n\n[Privacy](/privacy)\n',
    },
  ] as const) {
    const mdxNonMarkdownRoot = makeEmptyFixture(`vibecode-mdx-${mdxNonMarkdownCase.slug}`);
    mkdirSync(path.join(mdxNonMarkdownRoot, "src"), { recursive: true });
    writeFileSync(path.join(mdxNonMarkdownRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(mdxNonMarkdownRoot, "src", "Footer.mdx"), mdxNonMarkdownCase.source, "utf8");
    runFixture(mdxNonMarkdownCase.label, mdxNonMarkdownRoot, "check-vibecoded-tells.ts", 1, "links no terms page", ["--scan-roots", "src"]);
  }

  for (const inertMdxExpressionCase of [
    {
      slug: "false-logical-branch",
      label: "MDX JSX in a literal-false logical branch is not rendered navigation",
      source: '{false && <Link to="/terms" />}\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "false-conditional-branch",
      label: "MDX JSX in a literal-false conditional branch is not rendered navigation",
      source: '{false ? <Link to="/terms" /> : null}\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "short-circuited-or-branch",
      label: "MDX JSX in a short-circuited logical branch is not rendered navigation",
      source: '{true || <Link to="/terms" />}\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "arrow-function-body",
      label: "MDX JSX in an uninvoked arrow function body is not rendered navigation",
      source: '{() => <Link to="/terms" />}\n\n[Privacy](/privacy)\n',
    },
    {
      slug: "function-expression-body",
      label: "MDX JSX in an uninvoked function body is not rendered navigation",
      source: '{function Example() { return <Link to="/terms" /> }}\n\n[Privacy](/privacy)\n',
    },
  ] as const) {
    const inertMdxExpressionRoot = makeEmptyFixture(`vibecode-mdx-${inertMdxExpressionCase.slug}`);
    mkdirSync(path.join(inertMdxExpressionRoot, "src"), { recursive: true });
    writeFileSync(path.join(inertMdxExpressionRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(inertMdxExpressionRoot, "src", "Footer.mdx"), inertMdxExpressionCase.source, "utf8");
    runFixture(
      inertMdxExpressionCase.label,
      inertMdxExpressionRoot,
      "check-vibecoded-tells.ts",
      1,
      "links no terms page",
      ["--scan-roots", "src"],
      undefined,
      "links no privacy page",
    );
  }

  const vibecodeMdxNonOutputJsx = makeEmptyFixture("vibecode-mdx-non-output-jsx");
  mkdirSync(path.join(vibecodeMdxNonOutputJsx, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxNonOutputJsx, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeMdxNonOutputJsx, "src", "Footer.mdx"),
    [
      '<Panel fallback={<Link to="/terms" />} />',
      '{consume(<Link to="/terms" />)}',
      '{{ preview: <Link to="/terms" /> }}',
      '{<Link to="/terms" /> ? <a href="/privacy" /> : null}',
      "",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "MDX JSX in attributes, call arguments, object members, and tests is not rendered navigation",
    vibecodeMdxNonOutputJsx,
    "check-vibecoded-tells.ts",
    1,
    "links no terms page",
    ["--scan-roots", "src"],
    undefined,
    "links no privacy page",
  );

  const vibecodeMdxOutputPositions = makeEmptyFixture("vibecode-mdx-output-positions");
  mkdirSync(path.join(vibecodeMdxOutputPositions, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxOutputPositions, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMdxOutputPositions, "src", "Footer.mdx"), '{[<Link to="/terms" />]}\n\n{result = <a href="/privacy" />}\n', "utf8");
  runFixture("rendered MDX array and assignment results satisfy legal navigation", vibecodeMdxOutputPositions, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeMdxJsxLegalOk = makeEmptyFixture("vibecode-mdx-jsx-legal-ok");
  mkdirSync(path.join(vibecodeMdxJsxLegalOk, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxJsxLegalOk, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMdxJsxLegalOk, "src", "Footer.mdx"), '<Link to="/terms">Terms</Link>\n\n<a href={`/privacy`}>Privacy</a>\n', "utf8");
  runFixture("real MDX JSX tags satisfy legal navigation", vibecodeMdxJsxLegalOk, "check-vibecoded-tells.ts", 0, undefined, ["--scan-roots", "src"]);

  const vibecodeMdxCodeElementLinks = makeEmptyFixture("vibecode-mdx-code-element-links");
  mkdirSync(path.join(vibecodeMdxCodeElementLinks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxCodeElementLinks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeMdxCodeElementLinks, "src", "Footer.mdx"),
    '<code>[Terms](/terms)</code>\n\n<pre><a href="/privacy">Privacy</a></pre>\n',
    "utf8",
  );
  runFixture("official MDX navigation inside code and pre elements remains rendered", vibecodeMdxCodeElementLinks, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  for (const tag of ["script", "style", "textarea", "title", "template"] as const) {
    const inertMdxRoot = makeEmptyFixture(`vibecode-mdx-inert-${tag}`);
    mkdirSync(path.join(inertMdxRoot, "src"), { recursive: true });
    writeFileSync(path.join(inertMdxRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(inertMdxRoot, "src", "Footer.mdx"), `<${tag}><Link to="/terms" /></${tag}>\n\n[Privacy](/privacy)\n`, "utf8");
    runFixture(
      `MDX ${tag} contents do not satisfy legal navigation`,
      inertMdxRoot,
      "check-vibecoded-tells.ts",
      1,
      "links no terms page",
      ["--scan-roots", "src"],
      undefined,
      "links no privacy page",
    );
  }

  const vibecodeMdxEscapedAngle = makeEmptyFixture("vibecode-mdx-escaped-angle");
  mkdirSync(path.join(vibecodeMdxEscapedAngle, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxEscapedAngle, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMdxEscapedAngle, "src", "Footer.mdx"), '\\<Link to="/terms" />\n\n[Privacy](/privacy)\n', "utf8");
  runFixture("escaped MDX angle syntax remains text", vibecodeMdxEscapedAngle, "check-vibecoded-tells.ts", 1, "links no terms page", ["--scan-roots", "src"]);

  const vibecodeMdxEscapedBrace = makeEmptyFixture("vibecode-mdx-escaped-brace");
  mkdirSync(path.join(vibecodeMdxEscapedBrace, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxEscapedBrace, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMdxEscapedBrace, "src", "Footer.mdx"), '\\{<Link to="/terms" />}\n\n[Privacy](/privacy)\n', "utf8");
  runFixture("escaping an MDX brace does not hide rendered JSX beside it", vibecodeMdxEscapedBrace, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeMdxParseFailure = makeEmptyFixture("vibecode-mdx-parse-failure");
  mkdirSync(path.join(vibecodeMdxParseFailure, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxParseFailure, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMdxParseFailure, "src", "Broken.mdx"), "{\n", "utf8");
  writeFileSync(path.join(vibecodeMdxParseFailure, "src", "Footer.mdx"), "[Terms](/terms)\n\n[Privacy](/privacy)\n", "utf8");
  runFixture("invalid MDX fails the legal-link analysis closed", vibecodeMdxParseFailure, "check-vibecoded-tells.ts", 1, "vibecode.legal_markup_invalid", [
    "--scan-roots",
    "src",
  ]);

  const vibecodeMdxLazyContinuation = makeEmptyFixture("vibecode-mdx-lazy-continuation");
  mkdirSync(path.join(vibecodeMdxLazyContinuation, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxLazyContinuation, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeMdxLazyContinuation, "src", "Footer.mdx"),
    "Policy links follow this paragraph.\n    [Terms](/terms)\n\n[Privacy](/privacy)\n",
    "utf8",
  );
  runFixture("an indented lazy paragraph continuation remains navigable Markdown", vibecodeMdxLazyContinuation, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeMdxEvenBackslashes = makeEmptyFixture("vibecode-mdx-even-backslashes");
  mkdirSync(path.join(vibecodeMdxEvenBackslashes, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxEvenBackslashes, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMdxEvenBackslashes, "src", "Footer.mdx"), "\\\\[Terms](/terms)\n\n[Privacy](/privacy)\n", "utf8");
  runFixture("an even backslash run does not escape a Markdown policy link", vibecodeMdxEvenBackslashes, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeMdxEscapedBackticks = makeEmptyFixture("vibecode-mdx-escaped-backticks");
  mkdirSync(path.join(vibecodeMdxEscapedBackticks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxEscapedBackticks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMdxEscapedBackticks, "src", "Footer.mdx"), "\\`[Terms](/terms)\\`\n\n[Privacy](/privacy)\n", "utf8");
  runFixture("odd backslashes escape inline backtick delimiters", vibecodeMdxEscapedBackticks, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeMdxEvenEscapedBackticks = makeEmptyFixture("vibecode-mdx-even-escaped-backticks");
  mkdirSync(path.join(vibecodeMdxEvenEscapedBackticks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxEvenEscapedBackticks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeMdxEvenEscapedBackticks, "src", "Footer.mdx"), "\\\\`[Terms](/terms)`\n\n[Privacy](/privacy)\n", "utf8");
  runFixture(
    "even backslashes leave inline backtick delimiters active",
    vibecodeMdxEvenEscapedBackticks,
    "check-vibecoded-tells.ts",
    1,
    "links no terms page",
    ["--scan-roots", "src"],
  );

  const vibecodeMdxExpressionJsx = makeEmptyFixture("vibecode-mdx-expression-jsx");
  mkdirSync(path.join(vibecodeMdxExpressionJsx, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeMdxExpressionJsx, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeMdxExpressionJsx, "src", "Footer.mdx"),
    '{true && <Link to="/terms">Terms</Link>}\n\n{false ? null : <a href="/privacy">Privacy</a>}\n',
    "utf8",
  );
  runFixture("selected JSX results inside MDX expressions satisfy legal navigation", vibecodeMdxExpressionJsx, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeRouterLegalOk = makeFixture("vibecode-router-legal-ok");
  mkdirSync(path.join(vibecodeRouterLegalOk, "growth", "landing", "app"), { recursive: true });
  writeFileSync(
    path.join(vibecodeRouterLegalOk, "growth", "landing", "app", "Footer.tsx"),
    'import { Link } from "react-router-dom";\nexport function Footer() {\n  return <footer><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link></footer>;\n}\n',
    "utf8",
  );
  runFixture("site-shaped landing accepts React Router legal links", vibecodeRouterLegalOk, "check-vibecoded-tells.ts", 0);

  const vibecodeVueRouterLegalOk = makeEmptyFixture("vibecode-vue-router-legal-ok");
  mkdirSync(path.join(vibecodeVueRouterLegalOk, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeVueRouterLegalOk, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeVueRouterLegalOk, "src", "Footer.vue"),
    '<template><footer><RouterLink to="/terms">Terms</RouterLink><router-link to="/privacy">Privacy</router-link></footer></template>\n',
    "utf8",
  );
  runFixture("site-shaped landing accepts Vue Router legal links", vibecodeVueRouterLegalOk, "check-vibecoded-tells.ts", 0, undefined, ["--scan-roots", "src"]);

  const vibecodeResourceLinks = makeFixture("vibecode-resource-links");
  writeFileSync(
    path.join(vibecodeResourceLinks, "growth", "landing", "index.html"),
    '<head><link href="/terms.css" rel="stylesheet"><link href="/privacy.css" rel="stylesheet"></head><main>Launch</main>\n',
    "utf8",
  );
  runFixture("HTML resource links do not satisfy legal navigation", vibecodeResourceLinks, "check-vibecoded-tells.ts", 1, "vibecode.legal_links_missing");

  const vibecodeJsxCommentLinks = makeEmptyFixture("vibecode-jsx-comment-links");
  mkdirSync(path.join(vibecodeJsxCommentLinks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeJsxCommentLinks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeJsxCommentLinks, "src", "Footer.tsx"),
    'export function Footer() { return <>{/* <Link to="/terms">Terms</Link> */}<a href="/privacy">Privacy</a></>; }\n',
    "utf8",
  );
  runFixture("JSX comments do not satisfy legal navigation", vibecodeJsxCommentLinks, "check-vibecoded-tells.ts", 1, "links no terms page", [
    "--scan-roots",
    "src",
  ]);

  for (const extension of ["tsx", "jsx"] as const) {
    for (const tag of ["script", "style", "textarea", "title", "template"] as const) {
      const inertJsxRoot = makeEmptyFixture(`vibecode-${extension}-inert-${tag}`);
      mkdirSync(path.join(inertJsxRoot, "src"), { recursive: true });
      writeFileSync(path.join(inertJsxRoot, "package.json"), '{"private":true}\n', "utf8");
      writeFileSync(
        path.join(inertJsxRoot, "src", `Footer.${extension}`),
        `export function Footer() { return <><${tag}><Link to="/terms" /></${tag}><a href="/privacy">Privacy</a></>; }\n`,
        "utf8",
      );
      runFixture(
        `${extension.toUpperCase()} ${tag} contents do not satisfy legal navigation`,
        inertJsxRoot,
        "check-vibecoded-tells.ts",
        1,
        "links no terms page",
        ["--scan-roots", "src"],
        undefined,
        "links no privacy page",
      );
    }
  }

  for (const unreachableTsxCase of [
    { slug: "false-and", expression: 'false && <Link to="/terms" />', label: "a false TSX logical branch" },
    { slug: "true-or", expression: 'true || <Link to="/terms" />', label: "a short-circuited TSX logical branch" },
    { slug: "false-ternary", expression: 'false ? <Link to="/terms" /> : null', label: "a false TSX conditional branch" },
    { slug: "true-ternary", expression: 'true ? null : <Link to="/terms" />', label: "an unselected TSX conditional branch" },
    { slug: "wrapped-false", expression: '(false as const) && <Link to="/terms" />', label: "a wrapped false TSX branch" },
    { slug: "negative-zero", expression: '(-0) && <Link to="/terms" />', label: "a negative-zero TSX branch" },
    { slug: "positive-zero", expression: '(+0) && <Link to="/terms" />', label: "a positive-zero TSX branch" },
    { slug: "false-equality", expression: '(1 === 2) && <Link to="/terms" />', label: "a false TSX literal equality branch" },
    { slug: "false-relational", expression: '(2 < 1) && <Link to="/terms" />', label: "a false TSX literal relational branch" },
    { slug: "false-nullish", expression: 'false ?? <Link to="/terms" />', label: "a non-nullish false TSX branch" },
  ] as const) {
    const unreachableTsxRoot = makeEmptyFixture(`vibecode-tsx-${unreachableTsxCase.slug}`);
    mkdirSync(path.join(unreachableTsxRoot, "src"), { recursive: true });
    writeFileSync(path.join(unreachableTsxRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(
      path.join(unreachableTsxRoot, "src", "Footer.tsx"),
      `export const Decoy = () => ${unreachableTsxCase.expression};\nexport const Footer = () => <a href="/privacy">Privacy</a>;\n`,
      "utf8",
    );
    runFixture(
      `${unreachableTsxCase.label} does not satisfy legal navigation`,
      unreachableTsxRoot,
      "check-vibecoded-tells.ts",
      1,
      "links no terms page",
      ["--scan-roots", "src"],
      undefined,
      "links no privacy page",
    );
  }

  for (const reachableTsxCase of [
    { slug: "true-and", expression: 'true && <Link to="/terms" />', label: "a literal-true TSX logical branch" },
    { slug: "false-or", expression: 'false || <Link to="/terms" />', label: "a literal-false TSX fallback branch" },
    { slug: "dynamic-and", expression: 'show && <Link to="/terms" />', label: "an unknown TSX logical branch" },
    { slug: "dynamic-ternary", expression: 'show ? <Link to="/terms" /> : null', label: "an unknown TSX conditional branch" },
    { slug: "truthy-string", expression: '"false" && <Link to="/terms" />', label: "a truthy TSX string branch" },
    { slug: "negative-one", expression: '(-1) && <Link to="/terms" />', label: "a negative nonzero TSX branch" },
    { slug: "positive-one", expression: '(+1) && <Link to="/terms" />', label: "a positive nonzero TSX branch" },
    { slug: "true-equality", expression: '(1 === 1) && <Link to="/terms" />', label: "a true TSX literal equality branch" },
    { slug: "true-relational", expression: '(1 < 2) && <Link to="/terms" />', label: "a true TSX literal relational branch" },
    { slug: "null-nullish", expression: 'null ?? <Link to="/terms" />', label: "a nullish TSX fallback branch" },
  ] as const) {
    const reachableTsxRoot = makeEmptyFixture(`vibecode-tsx-${reachableTsxCase.slug}`);
    mkdirSync(path.join(reachableTsxRoot, "src"), { recursive: true });
    writeFileSync(path.join(reachableTsxRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(
      path.join(reachableTsxRoot, "src", "Footer.tsx"),
      `declare const show: boolean;\nexport const Terms = () => ${reachableTsxCase.expression};\nexport const Privacy = () => <a href="/privacy">Privacy</a>;\n`,
      "utf8",
    );
    runFixture(`${reachableTsxCase.label} remains eligible legal navigation`, reachableTsxRoot, "check-vibecoded-tells.ts", 0, undefined, [
      "--scan-roots",
      "src",
    ]);
  }

  for (const hiddenTsxCase of [
    {
      slug: "unused-local",
      label: "an unused local JSX value",
      source: 'const decoy = <Link to="/terms" />;\nexport const Footer = () => <a href="/privacy">Privacy</a>;\n',
    },
    {
      slug: "event-handler",
      label: "JSX returned only by an event handler",
      source:
        'export function Footer() { return <footer><button onClick={() => <Link to="/terms" />}>Open</button><a href="/privacy">Privacy</a></footer>; }\n',
    },
    {
      slug: "nested-unused-function",
      label: "JSX returned only by an unused nested function",
      source: 'export function Footer() { const decoy = () => <Link to="/terms" />; return <a href="/privacy">Privacy</a>; }\n',
    },
  ] as const) {
    const hiddenTsxRoot = makeEmptyFixture(`vibecode-tsx-${hiddenTsxCase.slug}`);
    mkdirSync(path.join(hiddenTsxRoot, "src"), { recursive: true });
    writeFileSync(path.join(hiddenTsxRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(hiddenTsxRoot, "src", "Footer.tsx"), hiddenTsxCase.source, "utf8");
    runFixture(
      `${hiddenTsxCase.label} does not satisfy legal navigation`,
      hiddenTsxRoot,
      "check-vibecoded-tells.ts",
      1,
      "links no terms page",
      ["--scan-roots", "src"],
      undefined,
      "links no privacy page",
    );
  }

  const vibecodeLocalLinkShadow = makeEmptyFixture("vibecode-tsx-local-link-shadow");
  mkdirSync(path.join(vibecodeLocalLinkShadow, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeLocalLinkShadow, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeLocalLinkShadow, "src", "Footer.tsx"),
    'const Link = () => <span />;\nexport function Footer() { return <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>; }\n',
    "utf8",
  );
  runFixture(
    "a locally shadowed Link component does not satisfy legal navigation from its props",
    vibecodeLocalLinkShadow,
    "check-vibecoded-tells.ts",
    1,
    "links no terms page",
    ["--scan-roots", "src"],
  );

  for (const localShadowCase of [
    {
      slug: "nested-link-shadow",
      label: "a component-local Link declaration does not satisfy legal navigation from its props",
      source: 'export function Footer() { const Link = () => <span />; return <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>; }\n',
    },
    {
      slug: "parameter-link-shadow",
      label: "a Link parameter does not satisfy legal navigation from its props",
      source: 'export function Footer({ Link }: { Link: any }) { return <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>; }\n',
    },
  ] as const) {
    const root = makeEmptyFixture(`vibecode-tsx-${localShadowCase.slug}`);
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(root, "src", "Footer.tsx"), localShadowCase.source, "utf8");
    runFixture(localShadowCase.label, root, "check-vibecoded-tells.ts", 1, "links no terms page", ["--scan-roots", "src"]);
  }

  for (const scopedShadowCase of [
    {
      slug: "for-of-link-shadow",
      label: "a for-of Link binding does not satisfy legal navigation from its props",
      source:
        'export function Footer() { for (const Link of [() => <span />]) { return <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>; } return <a href="/privacy">Privacy</a>; }\n',
    },
    {
      slug: "hoisted-var-link-shadow",
      label: "a hoisted var Link binding does not satisfy legal navigation from its props",
      source: 'export function Footer() { return <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>; var Link = () => <span />; }\n',
    },
    {
      slug: "module-hoisted-var-link-shadow",
      label: "a nested module var Link binding does not satisfy legal navigation from its props",
      source:
        'if (true) { var Link = () => <span />; }\nexport function Footer() { return <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>; }\n',
    },
  ] as const) {
    const root = makeEmptyFixture(`vibecode-tsx-${scopedShadowCase.slug}`);
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(root, "src", "Footer.tsx"), scopedShadowCase.source, "utf8");
    runFixture(scopedShadowCase.label, root, "check-vibecoded-tells.ts", 1, "links no terms page", ["--scan-roots", "src"]);
  }

  const vibecodeAliasedBindingKey = makeEmptyFixture("vibecode-tsx-aliased-binding-key");
  mkdirSync(path.join(vibecodeAliasedBindingKey, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeAliasedBindingKey, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeAliasedBindingKey, "src", "Footer.tsx"),
    'import { Link } from "router";\nexport function Footer(value: unknown) { const { Link: Alias } = value as any; return <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>; }\n',
    "utf8",
  );
  runFixture("a destructuring property key does not shadow an imported Link", vibecodeAliasedBindingKey, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeDeadReturnLink = makeEmptyFixture("vibecode-tsx-dead-return-link");
  mkdirSync(path.join(vibecodeDeadReturnLink, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeDeadReturnLink, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeDeadReturnLink, "src", "Footer.tsx"),
    'export function Footer() { return <a href="/privacy">Privacy</a>; return <Link to="/terms" />; }\n',
    "utf8",
  );
  runFixture(
    "a link after an unconditional return does not satisfy legal navigation",
    vibecodeDeadReturnLink,
    "check-vibecoded-tells.ts",
    1,
    "links no terms page",
    ["--scan-roots", "src"],
  );

  for (const terminalControlFlowCase of [
    {
      slug: "try-return-dead-link",
      label: "a link after a terminal try statement does not satisfy legal navigation",
      source: 'export function Footer() { try { return <a href="/privacy">Privacy</a>; } finally {} return <Link to="/terms" />; }\n',
    },
    {
      slug: "throw-dead-link",
      label: "a link after a throw does not satisfy legal navigation",
      source:
        'export const Privacy = () => <a href="/privacy">Privacy</a>;\nexport function Footer() { throw new Error("stop"); return <Link to="/terms" />; }\n',
    },
    {
      slug: "finally-overrides-return",
      label: "a terminal finally block overrides legal navigation from the try return",
      source: 'export function Footer() { try { return <Link to="/terms" />; } finally { return <a href="/privacy">Privacy</a>; } }\n',
    },
  ] as const) {
    const root = makeEmptyFixture(`vibecode-tsx-${terminalControlFlowCase.slug}`);
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(root, "src", "Footer.tsx"), terminalControlFlowCase.source, "utf8");
    runFixture(terminalControlFlowCase.label, root, "check-vibecoded-tells.ts", 1, "links no terms page", ["--scan-roots", "src"]);
  }

  for (const compoundControlFlowCase of [
    {
      slug: "labeled-return-dead-link",
      label: "a link after a terminal labeled statement does not satisfy legal navigation",
      source: 'export function Footer() { legal: { return <a href="/privacy">Privacy</a>; } return <Link to="/terms" />; }\n',
    },
    {
      slug: "exhaustive-switch-dead-link",
      label: "a link after an exhaustive terminal switch does not satisfy legal navigation",
      source:
        'export function Footer(kind: boolean) { switch (kind) { case true: return <a href="/privacy">Privacy</a>; default: return <a href="/privacy">Privacy</a>; } return <Link to="/terms" />; }\n',
    },
    {
      slug: "mixed-labeled-exits-dead-link",
      label: "a link after return-or-break branches inside a label does not satisfy legal navigation",
      source:
        'export function Footer(flag: boolean) { legal: { if (flag) return <a href="/privacy">Privacy</a>; else break legal; return <Link to="/terms" />; } return <a href="/privacy">Privacy</a>; }\n',
    },
  ] as const) {
    const root = makeEmptyFixture(`vibecode-tsx-${compoundControlFlowCase.slug}`);
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(root, "src", "Footer.tsx"), compoundControlFlowCase.source, "utf8");
    runFixture(compoundControlFlowCase.label, root, "check-vibecoded-tells.ts", 1, "links no terms page", ["--scan-roots", "src"]);
  }

  const vibecodeNonExhaustiveSwitch = makeEmptyFixture("vibecode-tsx-non-exhaustive-switch");
  mkdirSync(path.join(vibecodeNonExhaustiveSwitch, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeNonExhaustiveSwitch, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeNonExhaustiveSwitch, "src", "Footer.tsx"),
    'export function Footer(kind: boolean) { switch (kind) { case true: return <a href="/privacy">Privacy</a>; } return <Link to="/terms" />; }\n',
    "utf8",
  );
  runFixture("a non-exhaustive switch keeps later legal navigation reachable", vibecodeNonExhaustiveSwitch, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  for (const exportedTsxCase of [
    {
      slug: "default-arrow",
      label: "a default-exported JSX arrow",
      source: 'export default () => <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>;\n',
    },
    {
      slug: "named-alias",
      label: "a locally declared named export",
      source: 'const Footer = () => <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>;\nexport { Footer as default };\n',
    },
    {
      slug: "local-composition",
      label: "a local component rendered by an exported component",
      source:
        'const LegalFooter = () => <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>;\nexport default function App() { return <LegalFooter />; }\n',
    },
    {
      slug: "direct-jsx",
      label: "a directly exported JSX initializer",
      source: 'export const Footer = <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>;\n',
    },
    {
      slug: "default-class-method",
      label: "a default-exported class render method",
      source: 'export default class App extends React.Component { render() { return <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>; } }\n',
    },
    {
      slug: "named-class-property",
      label: "a named exported class render property",
      source: 'class App extends React.Component { render = () => <footer><Link to="/terms" /><a href="/privacy">Privacy</a></footer>; }\nexport { App };\n',
    },
  ] as const) {
    const exportedTsxRoot = makeEmptyFixture(`vibecode-tsx-${exportedTsxCase.slug}`);
    mkdirSync(path.join(exportedTsxRoot, "src"), { recursive: true });
    writeFileSync(path.join(exportedTsxRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(exportedTsxRoot, "src", "Footer.tsx"), exportedTsxCase.source, "utf8");
    runFixture(`${exportedTsxCase.label} satisfies legal navigation`, exportedTsxRoot, "check-vibecoded-tells.ts", 0, undefined, ["--scan-roots", "src"]);
  }

  for (const staticRenderCase of [
    {
      slug: "static-render-method",
      label: "a static class render method",
      source:
        'export const Privacy = () => <a href="/privacy">Privacy</a>;\nexport default class App extends React.Component { static render() { return <Link to="/terms" />; } }\n',
    },
    {
      slug: "static-render-property",
      label: "a static class render property",
      source:
        'export const Privacy = () => <a href="/privacy">Privacy</a>;\nexport default class App extends React.Component { static render = () => <Link to="/terms" />; }\n',
    },
  ] as const) {
    const root = makeEmptyFixture(`vibecode-tsx-${staticRenderCase.slug}`);
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(root, "src", "Footer.tsx"), staticRenderCase.source, "utf8");
    runFixture(`${staticRenderCase.label} does not satisfy legal navigation`, root, "check-vibecoded-tells.ts", 1, "links no terms page", [
      "--scan-roots",
      "src",
    ]);
  }

  const vibecodeCodeExampleLinks = makeEmptyFixture("vibecode-code-example-links");
  mkdirSync(path.join(vibecodeCodeExampleLinks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeCodeExampleLinks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeCodeExampleLinks, "src", "Footer.tsx"),
    [
      "const tagExample = '<Link to=\"/terms\">Terms</Link>';",
      "const arrowExample = () => '<Link to=\"/terms\">Terms</Link>';",
      'const markdownExample = "[Terms](/terms)";',
      'export function Footer() { return <a href="/privacy">Privacy</a>; }',
      "",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "TSX string literals and Markdown-like text do not satisfy legal navigation",
    vibecodeCodeExampleLinks,
    "check-vibecoded-tells.ts",
    1,
    "links no terms page",
    ["--scan-roots", "src"],
  );

  const vibecodeTaggedTemplateLinks = makeEmptyFixture("vibecode-tagged-template-links");
  mkdirSync(path.join(vibecodeTaggedTemplateLinks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeTaggedTemplateLinks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeTaggedTemplateLinks, "src", "Footer.tsx"),
    'const example = html`<Link to="/terms">Terms</Link>`;\nexport function Footer() { return <a href="/privacy">Privacy</a>; }\n',
    "utf8",
  );
  runFixture(
    "tagged-template JSX examples do not satisfy legal navigation",
    vibecodeTaggedTemplateLinks,
    "check-vibecoded-tells.ts",
    1,
    "links no terms page",
    ["--scan-roots", "src"],
  );

  const vibecodeRegexLiteralLinks = makeEmptyFixture("vibecode-regex-literal-links");
  mkdirSync(path.join(vibecodeRegexLiteralLinks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeRegexLiteralLinks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeRegexLiteralLinks, "src", "Footer.tsx"),
    'const example = /<Link to="\\/terms">/;\nexport function Footer() { return <a href="/privacy">Privacy</a>; }\n',
    "utf8",
  );
  runFixture(
    "regular-expression JSX examples do not satisfy legal navigation",
    vibecodeRegexLiteralLinks,
    "check-vibecoded-tells.ts",
    1,
    "links no terms page",
    ["--scan-roots", "src"],
  );

  const vibecodeUrlTextLegalOk = makeEmptyFixture("vibecode-url-text-legal-ok");
  mkdirSync(path.join(vibecodeUrlTextLegalOk, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeUrlTextLegalOk, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeUrlTextLegalOk, "src", "Footer.tsx"),
    'export function Footer() { return <footer>//example.test <Link to="/terms">Terms</Link><a href="/privacy">Privacy</a></footer>; }\n',
    "utf8",
  );
  runFixture("protocol-relative URL text does not hide later JSX policy links", vibecodeUrlTextLegalOk, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeTemplateLiteralAttributes = makeEmptyFixture("vibecode-template-literal-attributes");
  mkdirSync(path.join(vibecodeTemplateLiteralAttributes, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeTemplateLiteralAttributes, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeTemplateLiteralAttributes, "src", "Footer.tsx"),
    "export function Footer() { return <footer><Link to={`/terms`}>Terms</Link><a href={`/privacy`}>Privacy</a></footer>; }\n",
    "utf8",
  );
  runFixture("literal template JSX attributes satisfy legal navigation", vibecodeTemplateLiteralAttributes, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeOuterExpressionAttributes = makeEmptyFixture("vibecode-outer-expression-attributes");
  mkdirSync(path.join(vibecodeOuterExpressionAttributes, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeOuterExpressionAttributes, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeOuterExpressionAttributes, "src", "Footer.tsx"),
    'export function Footer() { return <footer><Link to={("/terms" as const)}>Terms</Link><a href={("/privacy" satisfies string)}>Privacy</a></footer>; }\n',
    "utf8",
  );
  runFixture("wrapped literal JSX attributes satisfy legal navigation", vibecodeOuterExpressionAttributes, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeHtmlScriptLinks = makeEmptyFixture("vibecode-html-script-links");
  mkdirSync(path.join(vibecodeHtmlScriptLinks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeHtmlScriptLinks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeHtmlScriptLinks, "src", "index.html"),
    '<script>const example = \'<a href="/terms">Terms</a>\';</script><footer><a href="/privacy">Privacy</a></footer>\n',
    "utf8",
  );
  runFixture("HTML script strings do not satisfy legal navigation", vibecodeHtmlScriptLinks, "check-vibecoded-tells.ts", 1, "links no terms page", [
    "--scan-roots",
    "src",
  ]);

  const vibecodeHtmlCommentContexts = makeEmptyFixture("vibecode-html-comment-contexts");
  mkdirSync(path.join(vibecodeHtmlCommentContexts, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeHtmlCommentContexts, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeHtmlCommentContexts, "src", "index.html"),
    '<script>const example = "<!--";</script><div title="<!--"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>\n',
    "utf8",
  );
  runFixture(
    "comment openers inside script and attribute strings do not hide rendered links",
    vibecodeHtmlCommentContexts,
    "check-vibecoded-tells.ts",
    0,
    undefined,
    ["--scan-roots", "src"],
  );

  for (const expressionCommentCase of [
    {
      extension: "astro",
      source: '{"<!--"}<a href="/terms">Terms</a><a href="/privacy">Privacy</a>\n',
    },
    {
      extension: "svelte",
      source: '{"<!--"}<a href="/terms">Terms</a><a href="/privacy">Privacy</a>\n',
    },
    {
      extension: "vue",
      source: '<template>{{ "<!--" }}<a href="/terms">Terms</a><a href="/privacy">Privacy</a></template>\n',
    },
  ] as const) {
    const expressionCommentRoot = makeEmptyFixture(`vibecode-${expressionCommentCase.extension}-expression-comment-string`);
    mkdirSync(path.join(expressionCommentRoot, "src"), { recursive: true });
    writeFileSync(path.join(expressionCommentRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(expressionCommentRoot, "src", `Footer.${expressionCommentCase.extension}`), expressionCommentCase.source, "utf8");
    runFixture(
      `a comment opener inside a ${expressionCommentCase.extension} expression string does not hide rendered links`,
      expressionCommentRoot,
      "check-vibecoded-tells.ts",
      0,
      undefined,
      ["--scan-roots", "src"],
    );
  }

  for (const falseVueCase of [
    {
      slug: "direct-false",
      label: "a Vue link with v-if false",
      source: '<template><RouterLink v-if="false" to="/terms"/><a href="/privacy"/></template>\n',
    },
    {
      slug: "ancestor-false",
      label: "a link below a Vue v-if false wrapper",
      source: '<template><section v-if="false"><RouterLink to="/terms"/></section><a href="/privacy"/></template>\n',
    },
    {
      slug: "zero",
      label: "a Vue link with v-if zero",
      source: '<template><RouterLink v-if="0" to="/terms"/><a href="/privacy"/></template>\n',
    },
    {
      slug: "negative-zero",
      label: "a Vue link with v-if negative zero",
      source: '<template><RouterLink v-if="-0" to="/terms"/><a href="/privacy"/></template>\n',
    },
    {
      slug: "false-comparison",
      label: "a Vue link with a false literal comparison",
      source: '<template><RouterLink v-if="1 === 2" to="/terms"/><a href="/privacy"/></template>\n',
    },
    {
      slug: "null",
      label: "a Vue link with v-if null",
      source: '<template><RouterLink v-if="null" to="/terms"/><a href="/privacy"/></template>\n',
    },
    {
      slug: "empty-string",
      label: "a Vue link with an empty-string v-if",
      source: `<template><RouterLink v-if="''" to="/terms"/><a href="/privacy"/></template>\n`,
    },
    {
      slug: "false-else-chain",
      label: "false Vue v-if and v-else-if branches",
      source: '<template><RouterLink v-if="false" to="/terms"/><RouterLink v-else-if="false" to="/terms-alt"/><a v-else href="/privacy"/></template>\n',
    },
    {
      slug: "selected-if-hides-else",
      label: "an unreachable Vue v-else branch",
      source: '<template><a v-if="true" href="/privacy"/><RouterLink v-else to="/terms"/></template>\n',
    },
    {
      slug: "dynamic-then-true-hides-else",
      label: "a Vue dynamic branch followed by a literal-true branch makes v-else unreachable",
      source: '<template><a v-if="showFirst" href="/privacy"/><a v-else-if="true" href="/privacy"/><RouterLink v-else to="/terms"/></template>\n',
    },
  ] as const) {
    const falseVueRoot = makeEmptyFixture(`vibecode-vue-${falseVueCase.slug}`);
    mkdirSync(path.join(falseVueRoot, "src"), { recursive: true });
    writeFileSync(path.join(falseVueRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(falseVueRoot, "src", "Footer.vue"), falseVueCase.source, "utf8");
    runFixture(
      `${falseVueCase.label} does not satisfy legal navigation`,
      falseVueRoot,
      "check-vibecoded-tells.ts",
      1,
      "links no terms page",
      ["--scan-roots", "src"],
      undefined,
      "links no privacy page",
    );
  }

  for (const liveVueCase of [
    {
      slug: "truthy-string",
      label: "a quoted false string in Vue remains truthy",
      source: `<template><RouterLink v-if="'false'" to="/terms"/><a href="/privacy"/></template>\n`,
    },
    {
      slug: "dynamic",
      label: "an unknown Vue condition remains eligible",
      source: '<template><RouterLink v-if="showTerms" to="/terms"/><a href="/privacy"/></template>\n',
    },
    {
      slug: "dynamic-else",
      label: "both branches of an unknown Vue condition remain eligible",
      source: '<template><RouterLink v-if="showTerms" to="/terms"/><a v-else href="/privacy"/></template>\n',
    },
    {
      slug: "dynamic-else-if-chain",
      label: "a fully dynamic Vue branch chain remains eligible",
      source: '<template><a v-if="showFirst" href="/privacy"/><a v-else-if="showSecond" href="/privacy"/><RouterLink v-else to="/terms"/></template>\n',
    },
    {
      slug: "negative-one",
      label: "a Vue link with a truthy negative number remains eligible",
      source: '<template><RouterLink v-if="-1" to="/terms"/><a href="/privacy"/></template>\n',
    },
    {
      slug: "true-comparison",
      label: "a Vue link with a true literal comparison remains eligible",
      source: '<template><RouterLink v-if="1 < 2" to="/terms"/><a href="/privacy"/></template>\n',
    },
  ] as const) {
    const liveVueRoot = makeEmptyFixture(`vibecode-vue-${liveVueCase.slug}`);
    mkdirSync(path.join(liveVueRoot, "src"), { recursive: true });
    writeFileSync(path.join(liveVueRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(liveVueRoot, "src", "Footer.vue"), liveVueCase.source, "utf8");
    runFixture(`${liveVueCase.label} legal navigation`, liveVueRoot, "check-vibecoded-tells.ts", 0, undefined, ["--scan-roots", "src"]);
  }

  for (const extension of ["html", "astro", "svelte"] as const) {
    const directiveBoundaryRoot = makeEmptyFixture(`vibecode-${extension}-vue-directive-boundary`);
    mkdirSync(path.join(directiveBoundaryRoot, "src"), { recursive: true });
    writeFileSync(path.join(directiveBoundaryRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(
      path.join(directiveBoundaryRoot, "src", `Footer.${extension}`),
      '<section v-if="false"><a href="/terms">Terms</a></section><a href="/privacy">Privacy</a>\n',
      "utf8",
    );
    runFixture(`${extension} does not apply Vue v-if semantics`, directiveBoundaryRoot, "check-vibecoded-tells.ts", 0, undefined, ["--scan-roots", "src"]);
  }

  for (const deadAstroCase of [
    { slug: "false-and", expression: 'false && <a href="/terms">Terms</a>', label: "a false Astro logical branch" },
    { slug: "true-or", expression: 'true || <a href="/terms">Terms</a>', label: "a short-circuited Astro logical branch" },
    {
      slug: "false-ternary",
      expression: 'false ? <a href="/terms">Terms</a> : <span>Not terms</span>',
      label: "a false Astro conditional branch",
    },
    { slug: "false-array", expression: '[false && <a href="/terms">Terms</a>]', label: "a false Astro branch inside an array result" },
    { slug: "empty-array-or", expression: '[] || <a href="/terms">Terms</a>', label: "an Astro fallback after a truthy empty array" },
    { slug: "regex-nullish", expression: '/x/ ?? <a href="/terms">Terms</a>', label: "an Astro fallback after a non-nullish regex literal" },
    {
      slug: "spread-false",
      expression: '[...[false && <a href="/terms">Terms</a>]]',
      label: "a false Astro branch inside a spread array result",
    },
    {
      slug: "arithmetic-assignment",
      expression: 'value += <a href="/terms">Terms</a>',
      label: "JSX on the right of an Astro arithmetic assignment",
    },
    {
      slug: "new-argument",
      expression: 'new Widget(<a href="/terms">Terms</a>) || <span>Fallback</span>',
      label: "JSX in a truthy Astro new-expression argument",
    },
    {
      slug: "dynamic-template-nullish",
      expression: '`${value}` ?? <a href="/terms">Terms</a>',
      label: "an Astro fallback after a non-nullish dynamic template",
    },
    {
      slug: "static-empty-template-and",
      expression: '`${""}` && <a href="/terms">Terms</a>',
      label: "an Astro branch after a statically empty interpolated template",
    },
    {
      slug: "static-template-or",
      expression: '`policy-${0}` || <a href="/terms">Terms</a>',
      label: "an Astro fallback after a statically nonempty interpolated template",
    },
    {
      slug: "or-assignment-true",
      expression: '(enabled ||= true) || <a href="/terms">Terms</a>',
      label: "an Astro fallback after a definitely truthy OR assignment",
    },
    {
      slug: "or-assignment-nonnull",
      expression: '(enabled ||= true) ?? <a href="/terms">Terms</a>',
      label: "an Astro nullish fallback after a definitely non-null OR assignment",
    },
    {
      slug: "and-assignment-false",
      expression: '(enabled &&= false) && <a href="/terms">Terms</a>',
      label: "an Astro branch after a definitely false AND assignment",
    },
    {
      slug: "nullish-assignment-nonnull",
      expression: '(value ??= 1) ?? <a href="/terms">Terms</a>',
      label: "an Astro fallback after a definitely non-nullish assignment",
    },
    {
      slug: "await-false",
      expression: '(await false) && <a href="/terms">Terms</a>',
      label: "an Astro branch after an awaited false primitive",
    },
    {
      slug: "await-import",
      expression: '(await import("./policy")) || <a href="/terms">Terms</a>',
      label: "an Astro fallback after an awaited import namespace",
    },
    { slug: "typeof-or", expression: 'typeof value || <a href="/terms">Terms</a>', label: "an Astro fallback after a truthy typeof result" },
    {
      slug: "false-nested-array",
      expression: '[[false ? <a href="/terms">Terms</a> : null]]',
      label: "a false Astro conditional inside nested array results",
    },
  ] as const) {
    const deadAstroRoot = makeEmptyFixture(`vibecode-astro-${deadAstroCase.slug}`);
    mkdirSync(path.join(deadAstroRoot, "src"), { recursive: true });
    writeFileSync(path.join(deadAstroRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(deadAstroRoot, "src", "Footer.astro"), `{${deadAstroCase.expression}}<a href="/privacy">Privacy</a>\n`, "utf8");
    runFixture(
      `${deadAstroCase.label} does not satisfy legal navigation`,
      deadAstroRoot,
      "check-vibecoded-tells.ts",
      1,
      "links no terms page",
      ["--scan-roots", "src"],
      undefined,
      "links no privacy page",
    );
  }

  for (const liveAstroCase of [
    { slug: "true-and", expression: 'true && <a href="/terms">Terms</a>', label: "a live Astro logical branch" },
    { slug: "dynamic-and", expression: 'showTerms && <a href="/terms">Terms</a>', label: "an unknown Astro logical branch" },
    { slug: "true-array", expression: '[true && <a href="/terms">Terms</a>]', label: "a live Astro branch inside an array result" },
    { slug: "empty-array-and", expression: '[] && <a href="/terms">Terms</a>', label: "an Astro branch after a truthy empty array" },
    { slug: "null-nullish", expression: 'null ?? <a href="/terms">Terms</a>', label: "an Astro fallback after a null literal" },
    { slug: "regex-and", expression: '/x/ && <a href="/terms">Terms</a>', label: "an Astro branch after a truthy regex literal" },
    { slug: "spread-live", expression: '[...[<a href="/terms">Terms</a>]]', label: "a live Astro link inside a spread array result" },
    { slug: "simple-assignment", expression: 'value = <a href="/terms">Terms</a>', label: "an Astro simple-assignment result" },
    { slug: "logical-assignment", expression: 'value ||= <a href="/terms">Terms</a>', label: "a possible Astro logical-assignment result" },
    { slug: "await", expression: 'await (<a href="/terms">Terms</a>)', label: "an awaited Astro rendered result" },
    {
      slug: "dynamic-template-or",
      expression: '`${value}` || <a href="/terms">Terms</a>',
      label: "a possible Astro fallback after a dynamically empty template",
    },
    {
      slug: "static-false-template-and",
      expression: '`${false}` && <a href="/terms">Terms</a>',
      label: "an Astro branch after a truthy interpolated false string",
    },
    {
      slug: "or-assignment-unknown",
      expression: '(enabled ||= false) || <a href="/terms">Terms</a>',
      label: "a possible Astro fallback after an OR assignment",
    },
    {
      slug: "and-assignment-unknown",
      expression: '(enabled &&= true) && <a href="/terms">Terms</a>',
      label: "a possible Astro branch after an AND assignment",
    },
    {
      slug: "nullish-assignment-unknown",
      expression: '(value ??= null) ?? <a href="/terms">Terms</a>',
      label: "a possible Astro fallback after a nullish assignment",
    },
    {
      slug: "await-true",
      expression: '(await true) && <a href="/terms">Terms</a>',
      label: "an Astro branch after an awaited true primitive",
    },
    {
      slug: "await-thenable",
      expression: '(await maybeThenable) || <a href="/terms">Terms</a>',
      label: "a possible Astro fallback after an unknown awaited thenable",
    },
    {
      slug: "fragment-array",
      expression: '[<><a href="/terms">Terms</a></>]',
      label: "an Astro fragment inside an array result",
    },
  ] as const) {
    const liveAstroRoot = makeEmptyFixture(`vibecode-astro-${liveAstroCase.slug}`);
    mkdirSync(path.join(liveAstroRoot, "src"), { recursive: true });
    writeFileSync(path.join(liveAstroRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(liveAstroRoot, "src", "Footer.astro"), `{${liveAstroCase.expression}}<a href="/privacy">Privacy</a>\n`, "utf8");
    runFixture(`${liveAstroCase.label} remains eligible legal navigation`, liveAstroRoot, "check-vibecoded-tells.ts", 0, undefined, ["--scan-roots", "src"]);
  }

  for (const svelteBranchCase of [
    {
      slug: "false-if",
      label: "a false Svelte if branch",
      source: '{#if false}<a href="/terms">Terms</a>{:else}<a href="/privacy">Privacy</a>{/if}\n',
      pass: false,
    },
    {
      slug: "true-else",
      label: "an unselected Svelte else branch",
      source: '{#if true}<a href="/privacy">Privacy</a>{:else}<a href="/terms">Terms</a>{/if}\n',
      pass: false,
    },
    {
      slug: "nested-false",
      label: "a nested link below a false Svelte if branch",
      source: '{#if false}{#if true}<a href="/terms">Terms</a>{/if}{:else}<a href="/privacy">Privacy</a>{/if}\n',
      pass: false,
    },
    {
      slug: "false-else-if",
      label: "false Svelte if and else-if branches",
      source: '{#if false}<a href="/terms">Terms</a>{:else if false}<a href="/terms-alt">Alternate</a>{:else}<a href="/privacy">Privacy</a>{/if}\n',
      pass: false,
    },
    {
      slug: "negative-zero",
      label: "a Svelte negative-zero if branch",
      source: '{#if -0}<a href="/terms">Terms</a>{:else}<a href="/privacy">Privacy</a>{/if}\n',
      pass: false,
    },
    {
      slug: "false-comparison",
      label: "a Svelte false literal-comparison branch",
      source: '{#if 1 === 2}<a href="/terms">Terms</a>{:else}<a href="/privacy">Privacy</a>{/if}\n',
      pass: false,
    },
    {
      slug: "dynamic",
      label: "both branches of an unknown Svelte condition",
      source: '{#if showTerms}<a href="/terms">Terms</a>{:else}<a href="/privacy">Privacy</a>{/if}\n',
      pass: true,
    },
    {
      slug: "dynamic-then-true",
      label: "a Svelte dynamic branch followed by a literal-true branch makes the final else unreachable",
      source: '{#if showFirst}<a href="/privacy">Privacy</a>{:else if true}<a href="/privacy">Privacy</a>{:else}<a href="/terms">Terms</a>{/if}\n',
      pass: false,
    },
    {
      slug: "dynamic-chain",
      label: "a fully dynamic Svelte branch chain",
      source: '{#if showFirst}<a href="/privacy">Privacy</a>{:else if showSecond}<a href="/privacy">Privacy</a>{:else}<a href="/terms">Terms</a>{/if}\n',
      pass: true,
    },
    {
      slug: "negative-one",
      label: "a Svelte truthy negative-number branch",
      source: '{#if -1}<a href="/terms">Terms</a>{/if}<a href="/privacy">Privacy</a>\n',
      pass: true,
    },
    {
      slug: "true-comparison",
      label: "a Svelte true literal-comparison branch",
      source: '{#if 1 < 2}<a href="/terms">Terms</a>{/if}<a href="/privacy">Privacy</a>\n',
      pass: true,
    },
  ] as const) {
    const svelteBranchRoot = makeEmptyFixture(`vibecode-svelte-${svelteBranchCase.slug}`);
    mkdirSync(path.join(svelteBranchRoot, "src"), { recursive: true });
    writeFileSync(path.join(svelteBranchRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(svelteBranchRoot, "src", "Footer.svelte"), svelteBranchCase.source, "utf8");
    runFixture(
      `${svelteBranchCase.label} ${svelteBranchCase.pass ? "remain eligible" : "does not satisfy"} legal navigation`,
      svelteBranchRoot,
      "check-vibecoded-tells.ts",
      svelteBranchCase.pass ? 0 : 1,
      svelteBranchCase.pass ? undefined : "links no terms page",
      ["--scan-roots", "src"],
      undefined,
      svelteBranchCase.pass ? undefined : "links no privacy page",
    );
  }

  for (const svelteBlockCase of [
    {
      slug: "each-close",
      label: "a Svelte each block close",
      source: '{#each items as item}<span>{item}</span>{:else}<span>Empty</span>{/each}<a href="/terms">Terms</a><a href="/privacy">Privacy</a>\n',
    },
    {
      slug: "await-close",
      label: "a Svelte await block close",
      source:
        '{#await promise}<span>Loading</span>{:then value}<span>{value}</span>{:catch error}<span>{error}</span>{/await}<a href="/terms">Terms</a><a href="/privacy">Privacy</a>\n',
    },
    {
      slug: "key-close",
      label: "a Svelte key block close",
      source: '{#key value}<span>{value}</span>{/key}<a href="/terms">Terms</a><a href="/privacy">Privacy</a>\n',
    },
    {
      slug: "snippet-close",
      label: "a Svelte snippet block close",
      source: '{#snippet child()}<span>Child</span>{/snippet}<a href="/terms">Terms</a><a href="/privacy">Privacy</a>\n',
    },
  ] as const) {
    const svelteBlockRoot = makeEmptyFixture(`vibecode-svelte-${svelteBlockCase.slug}`);
    mkdirSync(path.join(svelteBlockRoot, "src"), { recursive: true });
    writeFileSync(path.join(svelteBlockRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(svelteBlockRoot, "src", "Footer.svelte"), svelteBlockCase.source, "utf8");
    runFixture(`${svelteBlockCase.label} does not hide later legal navigation`, svelteBlockRoot, "check-vibecoded-tells.ts", 0, undefined, [
      "--scan-roots",
      "src",
    ]);
  }

  for (const nestedSvelteBlockCase of [
    {
      slug: "false-if-each-else",
      label: "an each else nested in a false Svelte if",
      source: '{#if false}{#each items as item}<span>{item}</span>{:else}<a href="/terms">Terms</a>{/each}{:else}<a href="/privacy">Privacy</a>{/if}\n',
    },
    {
      slug: "false-if-await",
      label: "an await block nested in a false Svelte if",
      source:
        '{#if false}{#await promise}<a href="/terms">Terms</a>{:then value}<a href="/terms-alt">Terms</a>{/await}{:else}<a href="/privacy">Privacy</a>{/if}\n',
    },
  ] as const) {
    const nestedSvelteBlockRoot = makeEmptyFixture(`vibecode-svelte-${nestedSvelteBlockCase.slug}`);
    mkdirSync(path.join(nestedSvelteBlockRoot, "src"), { recursive: true });
    writeFileSync(path.join(nestedSvelteBlockRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(path.join(nestedSvelteBlockRoot, "src", "Footer.svelte"), nestedSvelteBlockCase.source, "utf8");
    runFixture(
      `${nestedSvelteBlockCase.label} does not satisfy legal navigation`,
      nestedSvelteBlockRoot,
      "check-vibecoded-tells.ts",
      1,
      "links no terms page",
      ["--scan-roots", "src"],
      undefined,
      "links no privacy page",
    );
  }

  for (const inertHtmlCase of [
    { tag: "textarea", label: "HTML textarea contents do not satisfy legal navigation" },
    { tag: "title", label: "HTML title contents do not satisfy legal navigation" },
    { tag: "template", label: "plain HTML template contents do not satisfy legal navigation" },
  ] as const) {
    const inertHtmlRoot = makeEmptyFixture(`vibecode-html-inert-${inertHtmlCase.tag}`);
    mkdirSync(path.join(inertHtmlRoot, "src"), { recursive: true });
    writeFileSync(path.join(inertHtmlRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(
      path.join(inertHtmlRoot, "src", "index.html"),
      `<${inertHtmlCase.tag}><a href="/terms">Terms</a></${inertHtmlCase.tag}><a href="/privacy">Privacy</a>\n`,
      "utf8",
    );
    runFixture(inertHtmlCase.label, inertHtmlRoot, "check-vibecoded-tells.ts", 1, "links no terms page", ["--scan-roots", "src"]);
  }

  for (const extension of ["astro", "svelte"] as const) {
    const inertTemplateRoot = makeEmptyFixture(`vibecode-${extension}-inert-template`);
    mkdirSync(path.join(inertTemplateRoot, "src"), { recursive: true });
    writeFileSync(path.join(inertTemplateRoot, "package.json"), '{"private":true}\n', "utf8");
    writeFileSync(
      path.join(inertTemplateRoot, "src", `Footer.${extension}`),
      '<template><a href="/terms">Terms</a></template><a href="/privacy">Privacy</a>\n',
      "utf8",
    );
    runFixture(
      `${extension} template contents do not satisfy legal navigation`,
      inertTemplateRoot,
      "check-vibecoded-tells.ts",
      1,
      "links no terms page",
      ["--scan-roots", "src"],
      undefined,
      "links no privacy page",
    );
  }

  const vibecodeSelfClosingRawElement = makeEmptyFixture("vibecode-self-closing-raw-element");
  mkdirSync(path.join(vibecodeSelfClosingRawElement, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeSelfClosingRawElement, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeSelfClosingRawElement, "src", "Footer.astro"),
    '<script src="/analytics.js" /><footer><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>\n',
    "utf8",
  );
  runFixture("self-closing raw elements do not mask following rendered links", vibecodeSelfClosingRawElement, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeHtmlSelfClosingRawElement = makeEmptyFixture("vibecode-html-self-closing-raw-element");
  mkdirSync(path.join(vibecodeHtmlSelfClosingRawElement, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeHtmlSelfClosingRawElement, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeHtmlSelfClosingRawElement, "src", "index.html"),
    '<script /><footer><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>\n',
    "utf8",
  );
  runFixture(
    "plain HTML keeps a non-void raw element open despite slash syntax",
    vibecodeHtmlSelfClosingRawElement,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.legal_links_missing",
    ["--scan-roots", "src"],
  );

  const vibecodeHtmlLiteralBrace = makeEmptyFixture("vibecode-html-literal-brace");
  mkdirSync(path.join(vibecodeHtmlLiteralBrace, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeHtmlLiteralBrace, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeHtmlLiteralBrace, "src", "index.html"),
    '<p>{ is visible text in HTML.</p><a href="/terms">Terms</a><a href="/privacy">Privacy</a>\n',
    "utf8",
  );
  runFixture("a literal HTML brace does not hide following links", vibecodeHtmlLiteralBrace, "check-vibecoded-tells.ts", 0, undefined, ["--scan-roots", "src"]);

  const vibecodeAstroExpressionJsx = makeEmptyFixture("vibecode-astro-expression-jsx");
  mkdirSync(path.join(vibecodeAstroExpressionJsx, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeAstroExpressionJsx, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeAstroExpressionJsx, "src", "Footer.astro"),
    '---\nconst example = "<Link to=\\"/not-a-policy\\">";\n---\n{true && <a href="/terms">Terms</a>}<a href="/privacy">Privacy</a>\n',
    "utf8",
  );
  runFixture("real markup inside an Astro expression satisfies legal navigation", vibecodeAstroExpressionJsx, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeVueScriptLinks = makeEmptyFixture("vibecode-vue-script-links");
  mkdirSync(path.join(vibecodeVueScriptLinks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeVueScriptLinks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeVueScriptLinks, "src", "Footer.vue"),
    '<script setup>const example = \'<RouterLink to="/terms">Terms</RouterLink>\';</script><template><a href="/privacy">Privacy</a></template>\n',
    "utf8",
  );
  runFixture("Vue script strings do not satisfy legal navigation", vibecodeVueScriptLinks, "check-vibecoded-tells.ts", 1, "links no terms page", [
    "--scan-roots",
    "src",
  ]);

  const vibecodeVueLiteralBindings = makeEmptyFixture("vibecode-vue-literal-bindings");
  mkdirSync(path.join(vibecodeVueLiteralBindings, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeVueLiteralBindings, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeVueLiteralBindings, "src", "Footer.vue"),
    "<template><footer><RouterLink :to=\"'/terms'\">Terms</RouterLink><a v-bind:href=\"'/privacy'\">Privacy</a></footer></template>\n",
    "utf8",
  );
  runFixture("Vue literal bindings satisfy legal navigation", vibecodeVueLiteralBindings, "check-vibecoded-tells.ts", 0, undefined, ["--scan-roots", "src"]);

  const vibecodeUnquotedHtmlLinks = makeEmptyFixture("vibecode-unquoted-html-links");
  mkdirSync(path.join(vibecodeUnquotedHtmlLinks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeUnquotedHtmlLinks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeUnquotedHtmlLinks, "src", "index.html"), "<footer><a href=/terms>Terms</a><a href=/privacy>Privacy</a></footer>\n", "utf8");
  runFixture("unquoted HTML hrefs satisfy legal navigation", vibecodeUnquotedHtmlLinks, "check-vibecoded-tells.ts", 0, undefined, ["--scan-roots", "src"]);

  const vibecodeAngularRouterLinks = makeEmptyFixture("vibecode-angular-router-links");
  mkdirSync(path.join(vibecodeAngularRouterLinks, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeAngularRouterLinks, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeAngularRouterLinks, "src", "index.html"),
    '<footer><a routerLink="/terms">Terms</a><a routerLink="/privacy">Privacy</a></footer>\n',
    "utf8",
  );
  runFixture("literal Angular routerLink anchors satisfy legal navigation", vibecodeAngularRouterLinks, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeDataAttributes = makeEmptyFixture("vibecode-data-policy-attributes");
  mkdirSync(path.join(vibecodeDataAttributes, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeDataAttributes, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeDataAttributes, "src", "Footer.tsx"),
    'export function Footer() { return <a data-href="/terms" href="/privacy">Privacy</a>; }\n',
    "utf8",
  );
  runFixture("data-href does not satisfy legal navigation", vibecodeDataAttributes, "check-vibecoded-tells.ts", 1, "links no terms page", [
    "--scan-roots",
    "src",
  ]);

  const vibecodeDataRoutes = makeEmptyFixture("vibecode-data-policy-routes");
  mkdirSync(path.join(vibecodeDataRoutes, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeDataRoutes, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeDataRoutes, "src", "Footer.tsx"),
    'export function Footer() { return <Link data-to="/privacy" to="/terms">Terms</Link>; }\n',
    "utf8",
  );
  runFixture("data-to does not satisfy legal navigation", vibecodeDataRoutes, "check-vibecoded-tells.ts", 1, "links no privacy page", ["--scan-roots", "src"]);

  const vibecodeRouterRedirects = makeEmptyFixture("vibecode-router-redirects");
  mkdirSync(path.join(vibecodeRouterRedirects, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeRouterRedirects, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(
    path.join(vibecodeRouterRedirects, "src", "App.tsx"),
    'import { Navigate } from "react-router-dom";\nconst to = "/terms";\nconst href = "/privacy";\nexport function App() { return <><Navigate to={to} /><Navigate to="/privacy" /><span>{href}</span></>; }\n',
    "utf8",
  );
  runFixture(
    "router redirects and ordinary to assignments do not satisfy legal navigation",
    vibecodeRouterRedirects,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.legal_links_missing",
    ["--scan-roots", "src"],
  );

  // Tier 2 default tells surface as warnings — visible, exit 0 — per the reference's scoring
  // rule: a warning demands a derivation row, it does not block the build on its own.
  const vibecodeWarningTier = makeFixture("vibecode-warning-tier");
  writeFileSync(
    path.join(vibecodeWarningTier, "growth", "landing", "sections", "Glass.tsx"),
    'export function Glass() {\n  return <div className="backdrop-blur-md">glass panel</div>;\n}\n',
    "utf8",
  );
  runFixture("warning-tier tell reports without failing", vibecodeWarningTier, "check-vibecoded-tells.ts", 0, "vibecode.glassmorphism");

  // --scan-roots overrides the business-layout roots for plain web-app repos (the flagship
  // site keeps its surface in src/). A tell under an explicit root must fire like any other.
  const vibecodeWebApp = makeEmptyFixture("vibecode-webapp-scan-roots");
  mkdirSync(path.join(vibecodeWebApp, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeWebApp, "src", "App.tsx"), 'import { Star } from "lucide-react";\nexport function App() {\n  return <Star />;\n}\n', "utf8");
  runFixture("--scan-roots scans a plain web-app src/ layout", vibecodeWebApp, "check-vibecoded-tells.ts", 0, "vibecode.default_icon_pack", [
    "--scan-roots",
    "src",
  ]);

  for (const extension of ["astro", "mdx", "svelte", "vue"] as const) {
    const componentRoot = makeEmptyFixture(`vibecode-webapp-${extension}`);
    mkdirSync(path.join(componentRoot, "src"), { recursive: true });
    writeFileSync(path.join(componentRoot, "src", `App.${extension}`), 'import { Star } from "lucide-react";\n<Star />\n', "utf8");
    runFixture(`--scan-roots scans .${extension} web-surface source`, componentRoot, "check-vibecoded-tells.ts", 0, "vibecode.default_icon_pack", [
      "--scan-roots",
      "src",
    ]);
  }

  for (const extension of ["scss", "sass", "less"] as const) {
    const styleRoot = makeEmptyFixture(`vibecode-webapp-${extension}`);
    mkdirSync(path.join(styleRoot, "src"), { recursive: true });
    writeFileSync(path.join(styleRoot, "src", `motion.${extension}`), "@keyframes bounce { from { opacity: 0; } to { opacity: 1; } }\n", "utf8");
    runFixture(`--scan-roots scans .${extension} stylesheet source`, styleRoot, "check-vibecoded-tells.ts", 0, "vibecode.bouncing_cue", [
      "--scan-roots",
      "src",
    ]);
  }

  // A clean explicit root passes while proving the scan actually ran — the no-scope title
  // was the false-clean signature this flag exists to eliminate.
  const vibecodeWebAppClean = makeEmptyFixture("vibecode-webapp-clean");
  mkdirSync(path.join(vibecodeWebAppClean, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeWebAppClean, "src", "App.tsx"), "export function App() {\n  return <main>calm</main>;\n}\n", "utf8");
  runFixture(
    "--scan-roots on clean web-app source passes with a real scan",
    vibecodeWebAppClean,
    "check-vibecoded-tells.ts",
    0,
    undefined,
    ["--scan-roots", "src"],
    undefined,
    "no web-surface source in scope",
  );

  // App markers live at the repository root in Vite-style layouts. The explicit source root
  // must still enforce legal links against the combined app surface.
  const vibecodeWebAppNoLegal = makeEmptyFixture("vibecode-webapp-no-legal");
  mkdirSync(path.join(vibecodeWebAppNoLegal, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeWebAppNoLegal, "package.json"), '{"private":true}\n', "utf8");
  writeFileSync(path.join(vibecodeWebAppNoLegal, "src", "App.tsx"), "export function App() {\n  return <main>launch</main>;\n}\n", "utf8");
  runFixture("--scan-roots detects site shape from the web-app root", vibecodeWebAppNoLegal, "check-vibecoded-tells.ts", 1, "vibecode.legal_links_missing", [
    "--scan-roots",
    "src",
  ]);

  const vibecodeWebAppRootLegal = makeEmptyFixture("vibecode-webapp-root-legal");
  mkdirSync(path.join(vibecodeWebAppRootLegal, "src"), { recursive: true });
  writeFileSync(
    path.join(vibecodeWebAppRootLegal, "index.html"),
    '<main>launch</main><footer><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>\n',
    "utf8",
  );
  writeFileSync(path.join(vibecodeWebAppRootLegal, "src", "App.tsx"), "export function App() {\n  return <main>calm</main>;\n}\n", "utf8");
  runFixture("--scan-roots includes root index markup in the legal-link scan", vibecodeWebAppRootLegal, "check-vibecoded-tells.ts", 0, undefined, [
    "--scan-roots",
    "src",
  ]);

  const vibecodeNestedIndexNoLegal = makeEmptyFixture("vibecode-webapp-nested-index-no-legal");
  mkdirSync(path.join(vibecodeNestedIndexNoLegal, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeNestedIndexNoLegal, "src", "index.html"), "<main>Launch</main>\n", "utf8");
  runFixture(
    "--scan-roots detects an index marker inside an explicit source root",
    vibecodeNestedIndexNoLegal,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.legal_links_missing",
    ["--scan-roots", "src"],
  );

  const vibecodeNestedAppNoLegal = makeEmptyFixture("vibecode-webapp-nested-app-no-legal");
  mkdirSync(path.join(vibecodeNestedAppNoLegal, "src", "app"), { recursive: true });
  writeFileSync(path.join(vibecodeNestedAppNoLegal, "src", "app", "page.tsx"), "export default function Page() { return <main>Launch</main>; }\n", "utf8");
  runFixture(
    "--scan-roots detects an app marker inside an explicit source root",
    vibecodeNestedAppNoLegal,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.legal_links_missing",
    ["--scan-roots", "src"],
  );

  const vibecodeLinkedIndexRoot = makeEmptyFixture("vibecode-webapp-linked-index-root");
  const vibecodeLinkedIndexOutside = makeEmptyFixture("vibecode-webapp-linked-index-outside");
  mkdirSync(path.join(vibecodeLinkedIndexRoot, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeLinkedIndexRoot, "src", "App.tsx"), "export function App() { return <main>inside</main>; }\n", "utf8");
  writeFileSync(
    path.join(vibecodeLinkedIndexOutside, "index.html"),
    '<main>outside</main><footer><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>\n',
    "utf8",
  );
  symlinkSync(path.join(vibecodeLinkedIndexOutside, "index.html"), path.join(vibecodeLinkedIndexRoot, "index.html"), "file");
  runFixture(
    "--scan-roots rejects root index markup linked outside the web-app root",
    vibecodeLinkedIndexRoot,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.legal_markup_outside_root",
    ["--scan-roots", "src"],
  );

  const vibecodeDanglingIndex = makeEmptyFixture("vibecode-webapp-dangling-index");
  mkdirSync(path.join(vibecodeDanglingIndex, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeDanglingIndex, "src", "App.tsx"), "export function App() { return <main>inside</main>; }\n", "utf8");
  symlinkSync(path.join(vibecodeDanglingIndex, "missing-index.html"), path.join(vibecodeDanglingIndex, "index.html"), "file");
  runFixture("--scan-roots rejects a dangling root index link", vibecodeDanglingIndex, "check-vibecoded-tells.ts", 1, "vibecode.legal_markup_invalid", [
    "--scan-roots",
    "src",
  ]);

  const vibecodeDirectoryIndex = makeEmptyFixture("vibecode-webapp-directory-index");
  mkdirSync(path.join(vibecodeDirectoryIndex, "src"), { recursive: true });
  mkdirSync(path.join(vibecodeDirectoryIndex, "index.html"), { recursive: true });
  writeFileSync(path.join(vibecodeDirectoryIndex, "src", "App.tsx"), "export function App() { return <main>inside</main>; }\n", "utf8");
  runFixture(
    "--scan-roots rejects a root index entry that is not a file",
    vibecodeDirectoryIndex,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.legal_markup_invalid",
    ["--scan-roots", "src"],
  );

  // Explicit roots assert surface exists: a named root that is absent, or present but
  // empty of scannable source, fails instead of exiting falsely clean.
  runFixture(
    "--scan-roots naming a missing directory fails loudly",
    makeEmptyFixture("vibecode-webapp-missing-root"),
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_root_missing",
    ["--scan-roots", "src"],
  );

  const vibecodeWebAppEmpty = makeEmptyFixture("vibecode-webapp-empty-root");
  mkdirSync(path.join(vibecodeWebAppEmpty, "src"), { recursive: true });
  runFixture(
    "--scan-roots with no scannable source fails instead of passing clean",
    vibecodeWebAppEmpty,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_roots_no_source",
    ["--scan-roots", "src"],
  );

  const vibecodeWebAppFileRoot = makeEmptyFixture("vibecode-webapp-file-root");
  writeFileSync(path.join(vibecodeWebAppFileRoot, "src"), "not a directory\n", "utf8");
  runFixture(
    "--scan-roots naming a file fails instead of crashing",
    vibecodeWebAppFileRoot,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_root_not_directory",
    ["--scan-roots", "src"],
  );

  const vibecodeWebAppPartiallyEmpty = makeEmptyFixture("vibecode-webapp-partially-empty-roots");
  mkdirSync(path.join(vibecodeWebAppPartiallyEmpty, "src"), { recursive: true });
  mkdirSync(path.join(vibecodeWebAppPartiallyEmpty, "public"), { recursive: true });
  writeFileSync(path.join(vibecodeWebAppPartiallyEmpty, "src", "App.tsx"), "export function App() {\n  return <main>calm</main>;\n}\n", "utf8");
  runFixture(
    "--scan-roots fails each named root that has no scannable source",
    vibecodeWebAppPartiallyEmpty,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_roots_no_source",
    ["--scan-roots", "src,public"],
  );

  const vibecodeTraversalRoot = makeEmptyFixture("vibecode-webapp-traversal-root");
  const vibecodeTraversalOutside = makeEmptyFixture("vibecode-webapp-traversal-outside");
  mkdirSync(path.join(vibecodeTraversalOutside, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeTraversalOutside, "src", "App.tsx"), "export function App() {\n  return <main>outside</main>;\n}\n", "utf8");
  runFixture(
    "--scan-roots rejects traversal outside the web-app root",
    vibecodeTraversalRoot,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_root_outside_root",
    ["--scan-roots", "../vibecode-webapp-traversal-outside/src"],
  );

  const vibecodeSymlinkRoot = makeEmptyFixture("vibecode-webapp-symlink-root");
  const vibecodeSymlinkOutside = makeEmptyFixture("vibecode-webapp-symlink-outside");
  mkdirSync(path.join(vibecodeSymlinkOutside, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeSymlinkOutside, "src", "App.tsx"), "export function App() {\n  return <main>outside</main>;\n}\n", "utf8");
  symlinkSync(path.join(vibecodeSymlinkOutside, "src"), path.join(vibecodeSymlinkRoot, "src"), "dir");
  runFixture("--scan-roots rejects a symlink outside the web-app root", vibecodeSymlinkRoot, "check-vibecoded-tells.ts", 1, "vibecode.scan_root_outside_root", [
    "--scan-roots",
    "src",
  ]);
  mkdirSync(path.join(vibecodeSymlinkRoot, "growth"), { recursive: true });
  symlinkSync(path.join(vibecodeSymlinkOutside, "src"), path.join(vibecodeSymlinkRoot, "growth", "landing"), "dir");
  runFixture(
    "default scan roots reject a symlink outside the application root",
    vibecodeSymlinkRoot,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_root_outside_root",
  );

  const vibecodeIgnoredSymlinkRoot = makeEmptyFixture("vibecode-webapp-ignored-symlink-root");
  const vibecodeIgnoredSymlinkOutside = makeEmptyFixture("vibecode-webapp-ignored-symlink-outside");
  mkdirSync(path.join(vibecodeIgnoredSymlinkRoot, "src"), { recursive: true });
  mkdirSync(path.join(vibecodeIgnoredSymlinkOutside, "source"), { recursive: true });
  writeFileSync(path.join(vibecodeIgnoredSymlinkRoot, "src", "App.tsx"), "export function App() { return <main>inside</main>; }\n", "utf8");
  symlinkSync(path.join(vibecodeIgnoredSymlinkOutside, "source"), path.join(vibecodeIgnoredSymlinkRoot, "src", "dist"), "dir");
  runFixture(
    "--scan-roots validates ignored-name symlinks before skipping them",
    vibecodeIgnoredSymlinkRoot,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_root_outside_root",
    ["--scan-roots", "src"],
  );

  const vibecodeIgnoredFiles = makeEmptyFixture("vibecode-webapp-ignored-files");
  mkdirSync(path.join(vibecodeIgnoredFiles, "src", "node_modules", "example"), { recursive: true });
  writeFileSync(path.join(vibecodeIgnoredFiles, "src", "App.tsx"), "export function App() { return <main>inside</main>; }\n", "utf8");
  writeFileSync(
    path.join(vibecodeIgnoredFiles, "src", "node_modules", "example", "Icon.tsx"),
    'import { Star } from "lucide-react";\nexport const Icon = Star;\n',
    "utf8",
  );
  runFixture(
    "--scan-roots audits ignored directories without scanning their ordinary files",
    vibecodeIgnoredFiles,
    "check-vibecoded-tells.ts",
    0,
    undefined,
    ["--scan-roots", "src"],
    undefined,
    "vibecode.default_icon_pack",
  );

  const vibecodeIgnoredThenSource = makeEmptyFixture("vibecode-webapp-ignored-then-source");
  mkdirSync(path.join(vibecodeIgnoredThenSource, "src", "node_modules", "example"), { recursive: true });
  mkdirSync(path.join(vibecodeIgnoredThenSource, "shared"), { recursive: true });
  writeFileSync(path.join(vibecodeIgnoredThenSource, "src", "App.tsx"), "export function App() { return <main>inside</main>; }\n", "utf8");
  writeFileSync(path.join(vibecodeIgnoredThenSource, "shared", "Icon.tsx"), 'import { Star } from "lucide-react";\nexport const Icon = Star;\n', "utf8");
  symlinkSync(path.join(vibecodeIgnoredThenSource, "shared"), path.join(vibecodeIgnoredThenSource, "src", "node_modules", "example", "audited-shared"), "dir");
  symlinkSync(path.join(vibecodeIgnoredThenSource, "shared"), path.join(vibecodeIgnoredThenSource, "src", "zz-source-shared"), "dir");
  runFixture(
    "a directory audited through an ignored tree is still scanned when reached as source",
    vibecodeIgnoredThenSource,
    "check-vibecoded-tells.ts",
    0,
    "vibecode.default_icon_pack",
    ["--scan-roots", "src"],
  );

  const vibecodeIgnoredNestedLinkRoot = makeEmptyFixture("vibecode-webapp-ignored-nested-link-root");
  const vibecodeIgnoredNestedLinkOutside = makeEmptyFixture("vibecode-webapp-ignored-nested-link-outside");
  mkdirSync(path.join(vibecodeIgnoredNestedLinkRoot, "src", "node_modules", "example", "deep"), { recursive: true });
  mkdirSync(path.join(vibecodeIgnoredNestedLinkOutside, "source"), { recursive: true });
  writeFileSync(path.join(vibecodeIgnoredNestedLinkRoot, "src", "App.tsx"), "export function App() { return <main>inside</main>; }\n", "utf8");
  symlinkSync(
    path.join(vibecodeIgnoredNestedLinkOutside, "source"),
    path.join(vibecodeIgnoredNestedLinkRoot, "src", "node_modules", "example", "deep", "outside"),
    "dir",
  );
  runFixture(
    "--scan-roots rejects an outward symlink nested below an ignored directory",
    vibecodeIgnoredNestedLinkRoot,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_root_outside_root",
    ["--scan-roots", "src"],
  );

  const vibecodeIgnoredBrokenLink = makeEmptyFixture("vibecode-webapp-ignored-broken-link");
  mkdirSync(path.join(vibecodeIgnoredBrokenLink, "src", "node_modules", "example", "deep"), { recursive: true });
  writeFileSync(path.join(vibecodeIgnoredBrokenLink, "src", "App.tsx"), "export function App() { return <main>inside</main>; }\n", "utf8");
  symlinkSync(
    path.join(vibecodeIgnoredBrokenLink, "missing-source"),
    path.join(vibecodeIgnoredBrokenLink, "src", "node_modules", "example", "deep", "broken"),
    "file",
  );
  runFixture(
    "--scan-roots rejects a broken symlink nested below an ignored directory",
    vibecodeIgnoredBrokenLink,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_root_outside_root",
    ["--scan-roots", "src"],
  );

  const vibecodeNestedSymlinkRoot = makeEmptyFixture("vibecode-webapp-nested-symlink-root");
  const vibecodeNestedSymlinkOutside = makeEmptyFixture("vibecode-webapp-nested-symlink-outside");
  mkdirSync(path.join(vibecodeNestedSymlinkRoot, "src"), { recursive: true });
  mkdirSync(path.join(vibecodeNestedSymlinkOutside, "src"), { recursive: true });
  writeFileSync(path.join(vibecodeNestedSymlinkRoot, "src", "App.tsx"), "export function App() {\n  return <main>inside</main>;\n}\n", "utf8");
  writeFileSync(path.join(vibecodeNestedSymlinkOutside, "src", "Linked.tsx"), "export function Linked() {\n  return <main>outside</main>;\n}\n", "utf8");
  symlinkSync(path.join(vibecodeNestedSymlinkOutside, "src"), path.join(vibecodeNestedSymlinkRoot, "src", "linked"), "dir");
  runFixture(
    "--scan-roots rejects a nested symlink outside the web-app root",
    vibecodeNestedSymlinkRoot,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_root_outside_root",
    ["--scan-roots", "src"],
  );

  const vibecodeNestedSymlinkInside = makeEmptyFixture("vibecode-webapp-nested-symlink-inside");
  mkdirSync(path.join(vibecodeNestedSymlinkInside, "src"), { recursive: true });
  mkdirSync(path.join(vibecodeNestedSymlinkInside, "shared"), { recursive: true });
  writeFileSync(path.join(vibecodeNestedSymlinkInside, "src", "App.tsx"), "export function App() {\n  return <main>inside</main>;\n}\n", "utf8");
  writeFileSync(
    path.join(vibecodeNestedSymlinkInside, "shared", "Linked.tsx"),
    'import { Star } from "lucide-react";\nexport function Linked() {\n  return <Star />;\n}\n',
    "utf8",
  );
  symlinkSync(path.join(vibecodeNestedSymlinkInside, "shared"), path.join(vibecodeNestedSymlinkInside, "src", "linked"), "dir");
  runFixture(
    "--scan-roots follows a nested symlink that stays inside the web-app root",
    vibecodeNestedSymlinkInside,
    "check-vibecoded-tells.ts",
    0,
    "vibecode.default_icon_pack",
    ["--scan-roots", "src"],
  );

  const vibecodeLinkedFileAlias = makeEmptyFixture("vibecode-webapp-linked-file-alias");
  mkdirSync(path.join(vibecodeLinkedFileAlias, "src"), { recursive: true });
  mkdirSync(path.join(vibecodeLinkedFileAlias, "shared"), { recursive: true });
  writeFileSync(path.join(vibecodeLinkedFileAlias, "src", "App.tsx"), "export function App() { return <main>inside</main>; }\n", "utf8");
  writeFileSync(
    path.join(vibecodeLinkedFileAlias, "shared", "LinkedSource"),
    'import { Star } from "lucide-react";\nexport function Linked() { return <Star />; }\n',
    "utf8",
  );
  symlinkSync(path.join(vibecodeLinkedFileAlias, "shared", "LinkedSource"), path.join(vibecodeLinkedFileAlias, "src", "Linked.tsx"), "file");
  runFixture(
    "--scan-roots preserves the supported extension of a contained file-link alias",
    vibecodeLinkedFileAlias,
    "check-vibecoded-tells.ts",
    0,
    "vibecode.default_icon_pack",
    ["--scan-roots", "src"],
  );

  const vibecodeFileLimit = makeEmptyFixture("vibecode-webapp-file-limit");
  mkdirSync(path.join(vibecodeFileLimit, "src"), { recursive: true });
  for (let index = 0; index <= 5000; index += 1) {
    writeFileSync(path.join(vibecodeFileLimit, "src", `Component${String(index).padStart(4, "0")}.tsx`), "export {};\n", "utf8");
  }
  runFixture(
    "--scan-roots fails closed when the explicit file limit would truncate the scan",
    vibecodeFileLimit,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_roots_file_limit",
    ["--scan-roots", "src"],
  );
  mkdirSync(path.join(vibecodeFileLimit, "growth"), { recursive: true });
  symlinkSync(path.join(vibecodeFileLimit, "src"), path.join(vibecodeFileLimit, "growth", "landing"), "dir");
  runFixture(
    "default scan roots fail closed when the file limit would truncate the scan",
    vibecodeFileLimit,
    "check-vibecoded-tells.ts",
    1,
    "vibecode.scan_roots_file_limit",
  );

  // Without the flag the business-layout defaults are untouched: a repo with no web
  // surface still reports the no-scope title and exits clean.
  runFixture(
    "default roots keep the exit-0 no-scope pass for business repos",
    makeEmptyFixture("vibecode-default-no-scope"),
    "check-vibecoded-tells.ts",
    0,
    "no web-surface source in scope",
  );

  // --- check-scrollytelling-contract ------------------------------------------------------

  const validScrollySource = `
import { useReducedMotion } from "motion/react";
export function Story() {
  const reduced = useReducedMotion();
  const anchor = document.querySelector("[data-scrolly-step]")?.getBoundingClientRect();
  const style = { "--scene-p": 0.5, "--beat-t": 0.25, "--beat-index": 1 };
  return <section style={style} data-scene-id="response" data-state-id="response-ready">
    <ol><li data-scrolly-step="response">The complete static story remains visible.</li></ol>
    <span>{String(reduced)} {String(anchor)}</span>
  </section>;
}
`;

  const localizedTextDigest = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

  function validScrollyContract(): Record<string, unknown> {
    const scene = (id: string, guide: number): Record<string, unknown> => ({
      id,
      narrative_roles: ["need", "mechanism", "proof"],
      states: [`${id}-need`, `${id}-mechanism`, `${id}-proof`],
      visual_job: `Show the evidence-bearing ${id} state and its relationship to the next beat.`,
      source_kind: "html",
      evidence_id: `evidence-${id}`,
      localizations: ["en-US", "es-US"].map((locale) => {
        const captionText = locale === "en-US" ? `Caption for ${id}.` : `Leyenda para ${id}.`;
        const descriptionText = locale === "en-US" ? `Description of the ${id} evidence and change.` : `Descripción de la evidencia y el cambio de ${id}.`;
        return {
          locale,
          beats: [`${id}-need`, `${id}-mechanism`, `${id}-proof`].map((stateId) => {
            const text = locale === "en-US" ? `Copy for ${id}, state ${stateId}.` : `Texto para ${id}, estado ${stateId}.`;
            return {
              state_id: stateId,
              text,
              copy_key: `landing.story.${id}.${stateId}.${locale}`,
              copy_sha256: localizedTextDigest(text),
            };
          }),
          caption: {
            text: captionText,
            copy_key: `landing.story.${id}.caption.${locale}`,
            copy_sha256: localizedTextDigest(captionText),
          },
          accessible_description: {
            text: descriptionText,
            copy_key: `landing.story.${id}.accessible_description.${locale}`,
            copy_sha256: localizedTextDigest(descriptionText),
          },
        };
      }),
      activation_guides: { desktop: guide, mobile: guide + 0.2, short_mobile: guide + 0.35 },
      modes: { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "code-native" },
      forward_reverse: true,
    });
    const scenes = [scene("need", 0.15), scene("response", 0.5)];
    const qa: Array<Record<string, unknown>> = [];
    for (const row of scenes) {
      const id = String(row.id);
      const states = row.states as string[];
      for (const locale of ["en-US", "es-US"]) {
        for (const [stateIndex, state] of states.entries()) {
          for (const direction of ["forward", "reverse"]) {
            const browser = direction === "reverse" ? "Chrome" : (["Chrome", "Safari", "Firefox"][stateIndex] ?? "Chrome");
            const platform = browser === "Firefox" ? "Windows 11" : "macOS 15";
            const viewport = browser === "Safari" ? "desktop 1024x768" : browser === "Firefox" ? "desktop 1366x768" : "desktop 1440x900";
            qa.push({
              viewport,
              browser,
              platform,
              mode: "default",
              locale,
              direction,
              scene_id: id,
              expected_state: state,
              result: "pass",
              evidence: `growth/landing/evidence/browser-matrix.md#${id}-${locale}-${state}-${direction}`,
            });
          }
        }
        qa.push({
          viewport: "mobile 390x844",
          browser: "Chrome",
          platform: "Android 16",
          mode: "default",
          locale,
          direction: "jump",
          scene_id: id,
          expected_state: states[1],
          result: "pass",
          evidence: `growth/landing/evidence/browser-matrix.md#${id}-${locale}-jump`,
        });
        for (const [mode, viewport, browser, platform] of [
          ["short_mobile", "short-mobile 667x375", "Safari", "iOS 19"],
          ["reduced_motion", "mobile 390x844", "Chrome", "Android 16"],
          ["no_js", "desktop 1440x900", "Firefox", "Linux"],
          ["save_data", "mobile 390x844", "Chrome", "Android 16"],
        ] as const) {
          qa.push({
            viewport,
            browser,
            platform,
            mode,
            locale,
            direction: "jump",
            scene_id: id,
            expected_state: states.at(-1),
            result: "pass",
            evidence: `growth/landing/evidence/browser-matrix.md#${id}-${locale}-${mode}`,
          });
        }
      }
    }
    const matrixScene = String(scenes[0]!.id);
    const matrixState = (scenes[0]!.states as string[]).at(-1);
    for (const [browser, platform] of [
      ["Chrome", "macOS 15"],
      ["Safari", "macOS 15"],
      ["Firefox", "Windows 11"],
    ] as const) {
      for (const viewport of ["desktop 1280x720", "desktop 1440x1000"]) {
        qa.push({
          viewport,
          browser,
          platform,
          mode: "default",
          locale: "en-US",
          direction: "jump",
          scene_id: matrixScene,
          expected_state: matrixState,
          result: "pass",
          evidence: `growth/landing/evidence/browser-matrix.md#${browser.toLowerCase()}-${viewport.replaceAll(" ", "-")}`,
        });
      }
    }
    for (const [browser, platform] of [
      ["Safari", "iOS 19"],
      ["Chrome", "Android 16"],
    ] as const) {
      for (const [mode, viewport] of [
        ["short_mobile", "mobile 390x568"],
        ["default", "mobile 390x844"],
      ] as const) {
        qa.push({
          viewport,
          browser,
          platform,
          mode,
          locale: "en-US",
          direction: "jump",
          scene_id: matrixScene,
          expected_state: matrixState,
          result: "pass",
          evidence: `growth/landing/evidence/browser-matrix.md#${platform.toLowerCase().replaceAll(" ", "-")}-${mode}`,
        });
      }
    }
    return {
      locales: [
        { locale: "en-US", evidence: "growth/landing/evidence/en-US/" },
        { locale: "es-US", evidence: "growth/landing/evidence/es-US/" },
      ],
      scrollytelling: {
        applicable: true,
        evidence: "growth/landing/evidence/scrollytelling-contract.md#decision",
        locales: ["en-US", "es-US"],
        scenes,
        qa,
      },
    };
  }

  function writeScrollyFixture(name: string, mutate?: (contract: Record<string, unknown>) => void, source = validScrollySource): string {
    const root = makeEmptyFixture(name);
    const appDir = path.join(root, "growth/landing/app");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "ScrollyStory.tsx"), source, "utf8");
    const evidenceDir = path.join(root, "growth/landing/evidence");
    mkdirSync(evidenceDir, { recursive: true });
    const contract = validScrollyContract();
    const baselineScrolly = expectRecord(contract.scrollytelling, "scrollytelling");
    const baselineFragments = new Set(
      (baselineScrolly.qa as Array<Record<string, unknown>>)
        .map((row) => String(row.evidence).split("#")[1])
        .filter((fragment): fragment is string => Boolean(fragment)),
    );
    writeFileSync(
      path.join(evidenceDir, "scrollytelling-contract.md"),
      "# Scrollytelling contract\n\n## Decision\n\nThe evidence supports a sequence.\n",
      "utf8",
    );
    writeFileSync(
      path.join(evidenceDir, "browser-matrix.md"),
      `# Browser matrix\n\n${[...baselineFragments].map((fragment) => `<a id="${fragment}"></a>`).join("\n")}\n`,
      "utf8",
    );
    mutate?.(contract);
    writeFileSync(path.join(root, "growth/landing/surface-contract.json"), `${JSON.stringify(contract, null, 2)}\n`, "utf8");
    return root;
  }

  interface ScrollyContentAssetSpec {
    assetId: string;
    kind: "image" | "video";
    status?: string;
    writeOutput?: boolean;
    overrides?: Record<string, unknown>;
  }

  function writeScrollyContentAssetManifest(root: string, specs: ScrollyContentAssetSpec[]): void {
    const manifestDir = path.join(root, "growth/content-assets");
    const outputDir = path.join(manifestDir, "out");
    mkdirSync(outputDir, { recursive: true });
    const input = "growth/landing/surface-contract.json";
    const inputDigest = createHash("sha256")
      .update(readFileSync(path.join(root, input)))
      .digest("hex");
    const assets = specs.map((spec) => {
      const extension = spec.kind === "video" ? "mp4" : "webp";
      const output = `growth/content-assets/out/${spec.assetId}.${extension}`;
      if (spec.writeOutput !== false) {
        writeFileSync(path.join(root, output), `fixture ${spec.kind} output for ${spec.assetId}\n`, "utf8");
      }
      return {
        asset_id: spec.assetId,
        surface: "landing_scrollytelling",
        route: spec.kind === "video" ? "founder_owned_recording" : "authored_still",
        status: spec.status ?? "approved",
        composition_id: `Scrolly${spec.kind === "video" ? "Video" : "Still"}`,
        dimensions: spec.kind === "video" ? "1920x1080" : "1280x720",
        ...(spec.kind === "video" ? { duration_seconds: 12, asset_kind: "demo" } : {}),
        inputs: [input],
        input_digests: { [input]: inputDigest },
        outputs: [output],
        truth_constraints: ["The approved output supports only the scene narrative recorded in the landing contract."],
        approvals: ["Founder approved this fixture asset for landing use."],
        render_proof: `Authored fixture output: ${output}`,
        license_status: "Rights cleared for approved fixture use.",
        ...spec.overrides,
      };
    });
    writeFileSync(path.join(manifestDir, "manifest.json"), `${JSON.stringify({ schema_version: "1", assets }, null, 2)}\n`, "utf8");
  }

  function writeScrollyMediaFixture(name: string, mutate: (contract: Record<string, unknown>) => void, assets: ScrollyContentAssetSpec[]): string {
    const root = writeScrollyFixture(name, mutate);
    writeScrollyContentAssetManifest(root, assets);
    return root;
  }

  runFixture("complete scrollytelling contract and source hooks pass", writeScrollyFixture("scrolly-complete"), "check-scrollytelling-contract.ts", 0);

  runFixture(
    "a bare shipped section library does not require an active surface contract",
    makeFixture("scrolly-inactive-library"),
    "check-scrollytelling-contract.ts",
    0,
  );

  const scrollyMissingContract = makeEmptyFixture("scrolly-surface-contract-missing");
  mkdirSync(path.join(scrollyMissingContract, "growth/landing/app"), { recursive: true });
  writeFileSync(path.join(scrollyMissingContract, "growth/landing/app/ScrollyStory.tsx"), validScrollySource, "utf8");
  runFixture(
    "active scrollytelling source without a surface contract fails",
    scrollyMissingContract,
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.business.surface_contract_missing",
  );

  const scrollyDeclarationMissing = makeEmptyFixture("scrolly-declaration-missing");
  mkdirSync(path.join(scrollyDeclarationMissing, "growth/landing"), { recursive: true });
  writeFileSync(path.join(scrollyDeclarationMissing, "growth/landing/index.html"), "<main><h1>Active landing</h1></main>\n", "utf8");
  writeFileSync(path.join(scrollyDeclarationMissing, "growth/landing/surface-contract.json"), '{"locales":[]}\n', "utf8");
  runFixture(
    "every active landing surface contract declares scrollytelling applicability",
    scrollyDeclarationMissing,
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.business.declaration_missing",
  );

  runFixture(
    "duplicate scene IDs fail while state IDs may recur across scenes",
    writeScrollyFixture("scrolly-duplicate-ids", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      scenes[1]!.id = scenes[0]!.id;
      scenes[1]!.states = scenes[0]!.states;
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.scene_id.duplicate",
  );

  runFixture(
    "contract slugs reject digit-leading IDs before SSR does",
    writeScrollyFixture("scrolly-digit-leading-scene-id", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      scenes[0]!.id = "1-need";
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.scene_id.invalid",
  );

  runFixture(
    "stable state IDs may recur in different scenes",
    writeScrollyFixture("scrolly-state-ids-recur", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      scenes[1]!.states = scenes[0]!.states;
      for (const localization of scenes[1]!.localizations as Array<Record<string, unknown>>) {
        for (const beat of localization.beats as Array<Record<string, unknown>>) {
          beat.state_id = String(beat.state_id).replace(/^response-/u, "need-");
        }
      }
      for (const row of scrolly.qa as Array<Record<string, unknown>>) {
        if (row.scene_id === "response") row.expected_state = String(row.expected_state).replace(/^response-/u, "need-");
      }
    }),
    "check-scrollytelling-contract.ts",
    0,
  );

  runFixture(
    "out-of-order narrative roles fail",
    writeScrollyFixture("scrolly-role-order", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      scenes[0]!.narrative_roles = ["proof", "mechanism", "need"];
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.narrative_sequence.out_of_order",
  );

  runFixture(
    "narrative roles and visual states must map one to one",
    writeScrollyFixture("scrolly-role-state-count", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      scenes[0]!.narrative_roles = ["need", "mechanism", "outcome", "proof"];
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.role_state_count_mismatch",
  );

  runFixture(
    "responsive activation guides cannot all reuse the desktop value",
    writeScrollyFixture("scrolly-activation-guides-uniform", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      scenes[0]!.activation_guides = { desktop: 0.5, mobile: 0.5, short_mobile: 0.5 };
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.activation_guides.responsive_authorship_missing",
  );

  runFixture(
    "short-mobile activation is independently authored",
    writeScrollyFixture("scrolly-short-mobile-guide-reused", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      scenes[0]!.activation_guides = { desktop: 0.5, mobile: 0.7, short_mobile: 0.7 };
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.activation_guides.short_mobile_not_distinct",
  );

  runFixture(
    "an active contract cannot claim bidirectional completion with a false proof flag",
    writeScrollyFixture("scrolly-forward-reverse-unverified", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      scenes[0]!.forward_reverse = false;
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.forward_reverse.missing",
  );

  runFixture(
    "every scene carries exactly one localization row per locale",
    writeScrollyFixture("scrolly-localization-coverage", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      (scenes[0]!.localizations as Array<Record<string, unknown>>).pop();
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.localization.locale_coverage",
  );

  runFixture(
    "localized beats must preserve scene state order",
    writeScrollyFixture("scrolly-localization-beat-order", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      const localizations = scenes[0]!.localizations as Array<Record<string, unknown>>;
      (localizations[0]!.beats as Array<Record<string, unknown>>).reverse();
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.localization.beat_state_order_mismatch",
  );

  runFixture(
    "active localized copy cannot keep a zero digest",
    writeScrollyFixture("scrolly-localization-placeholder-digest", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      const localizations = scenes[0]!.localizations as Array<Record<string, unknown>>;
      const beats = localizations[0]!.beats as Array<Record<string, unknown>>;
      beats[0]!.copy_sha256 = "0".repeat(64);
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.scene.0.localization.0.beat.0.copy_sha256.placeholder",
  );

  runFixture(
    "every localized beat carries the exact rendered text",
    writeScrollyFixture("scrolly-localization-beat-text-missing", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      const localizations = scenes[0]!.localizations as Array<Record<string, unknown>>;
      const beats = localizations[0]!.beats as Array<Record<string, unknown>>;
      delete beats[0]!.text;
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.scene.0.localization.0.beat.0.text.missing",
  );

  runFixture(
    "localized beat digests hash their exact rendered text",
    writeScrollyFixture("scrolly-localization-beat-digest-mismatch", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      const localizations = scenes[0]!.localizations as Array<Record<string, unknown>>;
      const beats = localizations[0]!.beats as Array<Record<string, unknown>>;
      beats[0]!.text = `${String(beats[0]!.text)} Changed after hashing.`;
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.localization.copy_digest_mismatch",
  );

  runFixture(
    "localized caption and description digests hash their exact text",
    writeScrollyFixture("scrolly-localization-text-digest-mismatch", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      const localizations = scenes[0]!.localizations as Array<Record<string, unknown>>;
      const caption = expectRecord(localizations[0]!.caption, "caption");
      caption.text = `${String(caption.text)} Changed after hashing.`;
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.localization.copy_digest_mismatch",
  );

  runFixture(
    "heavy narrative media resolves approved primary and poster records",
    writeScrollyMediaFixture(
      "scrolly-media-poster-complete",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "video";
        scenes[0]!.asset_id = "response-sequence-video";
        scenes[0]!.poster_asset_id = "response-sequence-poster";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "poster" };
      },
      [
        { assetId: "response-sequence-video", kind: "video" },
        { assetId: "response-sequence-poster", kind: "image" },
      ],
    ),
    "check-scrollytelling-contract.ts",
    0,
  );

  runFixture(
    "heavy narrative media may be explicitly omitted under Save-Data after its primary asset resolves",
    writeScrollyMediaFixture(
      "scrolly-media-save-data-omit",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "video";
        scenes[0]!.asset_id = "response-sequence-video";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "omit" };
      },
      [{ assetId: "response-sequence-video", kind: "video" }],
    ),
    "check-scrollytelling-contract.ts",
    0,
  );

  runFixture(
    "a poster mode without an authored poster identifier fails",
    writeScrollyMediaFixture(
      "scrolly-media-poster-missing",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "image";
        scenes[0]!.asset_id = "response-sequence-image";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "poster" };
      },
      [{ assetId: "response-sequence-image", kind: "image" }],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.poster_asset_id.missing",
  );

  runFixture(
    "an omitted heavy-media fallback cannot retain a stale poster claim",
    writeScrollyMediaFixture(
      "scrolly-media-omit-stale-poster",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "image";
        scenes[0]!.asset_id = "response-sequence-image";
        scenes[0]!.poster_asset_id = "unused-poster";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "omit" };
      },
      [{ assetId: "response-sequence-image", kind: "image" }],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.poster_asset_id.unexpected",
  );

  runFixture(
    "active heavy media fails when the canonical content-asset manifest is missing",
    writeScrollyFixture("scrolly-media-manifest-missing", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const scenes = scrolly.scenes as Array<Record<string, unknown>>;
      scenes[0]!.source_kind = "video";
      scenes[0]!.asset_id = "response-sequence-video";
      scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "omit" };
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.content_asset_manifest.missing",
  );

  runFixture(
    "an active image or video scene cannot omit its primary asset ID",
    writeScrollyMediaFixture(
      "scrolly-media-primary-id-missing",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "video";
        delete scenes[0]!.asset_id;
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "omit" };
      },
      [{ assetId: "approved-video", kind: "video" }],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.asset_id.missing",
  );

  runFixture(
    "an arbitrary primary asset ID that is absent from the manifest fails",
    writeScrollyMediaFixture(
      "scrolly-media-primary-unknown",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "video";
        scenes[0]!.asset_id = "invented-video";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "omit" };
      },
      [{ assetId: "approved-video", kind: "video" }],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.asset_id.unknown",
  );

  runFixture(
    "a draft primary content asset is not approved scrollytelling evidence",
    writeScrollyMediaFixture(
      "scrolly-media-primary-unapproved",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "video";
        scenes[0]!.asset_id = "draft-video";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "omit" };
      },
      [{ assetId: "draft-video", kind: "video", status: "draft" }],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.asset_id.unapproved",
  );

  runFixture(
    "an unknown status cannot masquerade as content-asset approval",
    writeScrollyMediaFixture(
      "scrolly-media-primary-status-unknown",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "image";
        scenes[0]!.asset_id = "self-described-verified-image";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "omit" };
      },
      [{ assetId: "self-described-verified-image", kind: "image", status: "verified" }],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.asset_id.unapproved",
  );

  runFixture(
    "an arbitrary Save-Data poster ID that is absent from the manifest fails",
    writeScrollyMediaFixture(
      "scrolly-media-poster-unknown",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "video";
        scenes[0]!.asset_id = "approved-video";
        scenes[0]!.poster_asset_id = "invented-poster";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "poster" };
      },
      [{ assetId: "approved-video", kind: "video" }],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.poster_asset_id.unknown",
  );

  runFixture(
    "a draft poster is not approved Save-Data evidence",
    writeScrollyMediaFixture(
      "scrolly-media-poster-unapproved",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "video";
        scenes[0]!.asset_id = "approved-video";
        scenes[0]!.poster_asset_id = "draft-poster";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "poster" };
      },
      [
        { assetId: "approved-video", kind: "video" },
        { assetId: "draft-poster", kind: "image", status: "draft" },
      ],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.poster_asset_id.unapproved",
  );

  runFixture(
    "a heavy primary record cannot also serve as its own poster",
    writeScrollyMediaFixture(
      "scrolly-media-poster-same-as-primary",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "video";
        scenes[0]!.asset_id = "approved-video";
        scenes[0]!.poster_asset_id = "approved-video";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "poster" };
      },
      [{ assetId: "approved-video", kind: "video" }],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.poster_asset_id.same_as_primary",
  );

  runFixture(
    "a distinct video record is still too heavy to serve as a Save-Data poster",
    writeScrollyMediaFixture(
      "scrolly-media-poster-heavy",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "video";
        scenes[0]!.asset_id = "approved-video";
        scenes[0]!.poster_asset_id = "other-video";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "poster" };
      },
      [
        { assetId: "approved-video", kind: "video" },
        { assetId: "other-video", kind: "video" },
      ],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.poster_asset_id.not_lightweight",
  );

  runFixture(
    "a done-tier manifest row with a missing local output is not usable evidence",
    writeScrollyMediaFixture(
      "scrolly-media-output-missing",
      (contract) => {
        const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
        const scenes = scrolly.scenes as Array<Record<string, unknown>>;
        scenes[0]!.source_kind = "image";
        scenes[0]!.asset_id = "missing-output-image";
        scenes[0]!.modes = { mobile: "recomposed", reduced_motion: "final", no_js: "final", save_data: "omit" };
      },
      [{ assetId: "missing-output-image", kind: "image", writeOutput: false }],
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.asset_id.output_missing",
  );

  runFixture(
    "missing short-height QA evidence fails",
    writeScrollyFixture("scrolly-short-height-qa", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      scrolly.qa = (scrolly.qa as Array<Record<string, unknown>>).filter((row) => row.mode !== "short_mobile");
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.short_mobile.missing",
  );

  runFixture(
    "each state needs forward and reverse default QA",
    writeScrollyFixture("scrolly-direction-state-qa", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      scrolly.qa = (scrolly.qa as Array<Record<string, unknown>>).filter(
        (row) => !(row.mode === "default" && row.direction === "reverse" && row.scene_id === "need" && row.expected_state === "need-mechanism"),
      );
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.state_direction.missing",
  );

  runFixture(
    "every Tier 1 locale covers every state in both directions",
    writeScrollyFixture("scrolly-locale-state-direction-qa", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      scrolly.qa = (scrolly.qa as Array<Record<string, unknown>>).filter(
        (row) =>
          !(
            row.locale === "es-US" &&
            row.mode === "default" &&
            row.direction === "reverse" &&
            row.scene_id === "need" &&
            row.expected_state === "need-mechanism"
          ),
      );
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.locale_state_direction.missing",
  );

  runFixture(
    "each scene needs default-mode restored-position QA",
    writeScrollyFixture("scrolly-default-jump-qa", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      scrolly.qa = (scrolly.qa as Array<Record<string, unknown>>).filter(
        (row) => !(row.mode === "default" && row.direction === "jump" && row.scene_id === "need"),
      );
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.jump.missing",
  );

  runFixture(
    "every Tier 1 locale covers restored-position QA",
    writeScrollyFixture("scrolly-locale-default-jump-qa", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      scrolly.qa = (scrolly.qa as Array<Record<string, unknown>>).filter(
        (row) => !(row.locale === "es-US" && row.mode === "default" && row.direction === "jump" && row.scene_id === "need"),
      );
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.locale_jump.missing",
  );

  runFixture(
    "every Tier 1 locale covers each degraded mode",
    writeScrollyFixture("scrolly-locale-degraded-mode-qa", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      scrolly.qa = (scrolly.qa as Array<Record<string, unknown>>).filter(
        (row) => !(row.locale === "es-US" && row.mode === "save_data" && row.scene_id === "need"),
      );
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.locale_mode.missing",
  );

  runFixture(
    "every QA row names its browser and platform",
    writeScrollyFixture("scrolly-qa-browser-platform-fields", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const qa = scrolly.qa as Array<Record<string, unknown>>;
      delete qa[0]!.browser;
      delete qa[1]!.platform;
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.0.browser.missing",
  );

  runFixture(
    "desktop browser-family coverage includes Firefox",
    writeScrollyFixture("scrolly-qa-firefox-missing", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      for (const row of scrolly.qa as Array<Record<string, unknown>>) {
        if (row.browser === "Firefox") row.browser = "Chrome";
      }
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.browser.firefox.missing",
  );

  runFixture(
    "mobile coverage includes iOS Safari",
    writeScrollyFixture("scrolly-qa-ios-safari-missing", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      for (const row of scrolly.qa as Array<Record<string, unknown>>) {
        if (String(row.platform).includes("iOS")) row.platform = "macOS 15";
      }
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.ios_safari.missing",
  );

  runFixture(
    "mobile coverage includes Android Chrome",
    writeScrollyFixture("scrolly-qa-android-chrome-missing", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      for (const row of scrolly.qa as Array<Record<string, unknown>>) {
        if (String(row.platform).includes("Android")) row.platform = "macOS 15";
      }
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.android_chrome.missing",
  );

  runFixture(
    "desktop QA uses at least two distinct viewport heights",
    writeScrollyFixture("scrolly-qa-desktop-viewports", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      for (const row of scrolly.qa as Array<Record<string, unknown>>) {
        if (/macOS|Windows|Linux/u.test(String(row.platform))) {
          row.viewport = row.browser === "Safari" ? "desktop 1024x900" : row.browser === "Firefox" ? "desktop 1366x900" : "desktop 1440x900";
        }
      }
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.desktop_viewports.insufficient",
  );

  runFixture(
    "each desktop browser carries its own short and tall height evidence",
    writeScrollyFixture("scrolly-qa-desktop-browser-height-cross-product", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      for (const row of scrolly.qa as Array<Record<string, unknown>>) {
        if (row.browser === "Safari" && String(row.platform).includes("macOS")) row.viewport = "desktop 1280x900";
      }
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.browser.safari.heights_insufficient",
  );

  runFixture(
    "short-mobile QA is shorter than the normal mobile viewport",
    writeScrollyFixture("scrolly-qa-mobile-height-diversity", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      for (const row of scrolly.qa as Array<Record<string, unknown>>) {
        if (row.mode === "short_mobile") row.viewport = "short-mobile 390x844";
      }
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.mobile_heights.insufficient",
  );

  runFixture(
    "iOS Safari carries its own genuinely shorter short-mobile evidence",
    writeScrollyFixture("scrolly-qa-ios-height-cross-product", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      for (const row of scrolly.qa as Array<Record<string, unknown>>) {
        if (String(row.platform).includes("iOS") && row.mode === "short_mobile") row.viewport = "mobile 390x844";
      }
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.ios_safari.heights_insufficient",
  );

  runFixture(
    "Android Chrome carries its own short-mobile evidence",
    writeScrollyFixture("scrolly-qa-android-height-cross-product", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      scrolly.qa = (scrolly.qa as Array<Record<string, unknown>>).filter((row) => !(String(row.platform).includes("Android") && row.mode === "short_mobile"));
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.qa.android_chrome.heights_insufficient",
  );

  runFixture(
    "active evidence paths must exist inside the workspace",
    writeScrollyFixture("scrolly-evidence-path-missing", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      scrolly.evidence = "growth/landing/evidence/does-not-exist.md#decision";
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.evidence_path.missing",
  );

  runFixture(
    "every active QA evidence path must exist inside the workspace",
    writeScrollyFixture("scrolly-qa-evidence-path-missing", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const qa = scrolly.qa as Array<Record<string, unknown>>;
      qa[0]!.evidence = "growth/landing/evidence/missing-browser-run.md#need-forward";
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.evidence_path.missing",
  );

  runFixture(
    "active evidence fragments resolve to authored anchors",
    writeScrollyFixture("scrolly-qa-evidence-fragment-missing", (contract) => {
      const scrolly = expectRecord(contract.scrollytelling, "scrollytelling");
      const qa = scrolly.qa as Array<Record<string, unknown>>;
      qa[0]!.evidence = "growth/landing/evidence/browser-matrix.md#not-an-authored-run";
    }),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.evidence_fragment.missing",
  );

  const scrollyNotApplicable = makeEmptyFixture("scrolly-not-applicable-reason");
  mkdirSync(path.join(scrollyNotApplicable, "growth/landing"), { recursive: true });
  writeFileSync(path.join(scrollyNotApplicable, "growth/landing/index.html"), "<main><h1>Static landing</h1></main>\n", "utf8");
  writeFileSync(
    path.join(scrollyNotApplicable, "growth/landing/surface-contract.json"),
    `${JSON.stringify(
      {
        scrollytelling: {
          applicable: false,
          evidence: "The short landing has no sequential evidence that needs a scroll-linked treatment.",
          locales: [],
          scenes: [],
          qa: [],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  runFixture("a not-applicable declaration keeps a plain non-path rationale", scrollyNotApplicable, "check-scrollytelling-contract.ts", 0);

  const scrollyNotApplicableWithoutReason = makeEmptyFixture("scrolly-not-applicable-reason-missing");
  mkdirSync(path.join(scrollyNotApplicableWithoutReason, "growth/landing"), { recursive: true });
  writeFileSync(path.join(scrollyNotApplicableWithoutReason, "growth/landing/index.html"), "<main><h1>Static landing</h1></main>\n", "utf8");
  writeFileSync(
    path.join(scrollyNotApplicableWithoutReason, "growth/landing/surface-contract.json"),
    `${JSON.stringify({ scrollytelling: { applicable: false, evidence: "", locales: [], scenes: [], qa: [] } }, null, 2)}\n`,
    "utf8",
  );
  runFixture(
    "a not-applicable declaration still needs a plain rationale",
    scrollyNotApplicableWithoutReason,
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.evidence.missing",
  );

  const scrollyNotApplicableWrongShape = makeEmptyFixture("scrolly-not-applicable-shape-invalid");
  mkdirSync(path.join(scrollyNotApplicableWrongShape, "growth/landing"), { recursive: true });
  writeFileSync(path.join(scrollyNotApplicableWrongShape, "growth/landing/index.html"), "<main><h1>Static landing</h1></main>\n", "utf8");
  writeFileSync(
    path.join(scrollyNotApplicableWrongShape, "growth/landing/surface-contract.json"),
    `${JSON.stringify(
      {
        scrollytelling: {
          applicable: false,
          evidence: "The landing has no sequential evidence.",
          locales: "none",
          scenes: {},
          qa: null,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  runFixture(
    "a not-applicable declaration still uses the exact array shape",
    scrollyNotApplicableWrongShape,
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.locales.invalid",
  );

  const scrollyNotApplicableWithRows = makeEmptyFixture("scrolly-not-applicable-rows-present");
  mkdirSync(path.join(scrollyNotApplicableWithRows, "growth/landing"), { recursive: true });
  writeFileSync(path.join(scrollyNotApplicableWithRows, "growth/landing/index.html"), "<main><h1>Static landing</h1></main>\n", "utf8");
  writeFileSync(
    path.join(scrollyNotApplicableWithRows, "growth/landing/surface-contract.json"),
    `${JSON.stringify(
      {
        scrollytelling: {
          applicable: false,
          evidence: "The landing has no sequential evidence.",
          locales: ["en-US"],
          scenes: [{ id: "should-not-exist" }],
          qa: [{ result: "pending" }],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  runFixture(
    "a not-applicable declaration cannot retain scene or QA rows",
    scrollyNotApplicableWithRows,
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.contract.not_applicable.locales_not_empty",
  );

  const scrollyReducedMotionCss = writeScrollyFixture(
    "scrolly-reduced-motion-shared-css",
    undefined,
    validScrollySource
      .replace('import { useReducedMotion } from "motion/react";\n', "")
      .replace("  const reduced = useReducedMotion();\n", "")
      .replace("{String(reduced)} ", ""),
  );
  writeFileSync(
    path.join(scrollyReducedMotionCss, "growth/landing/motion.css"),
    "@media (prefers-reduced-motion: reduce) { .lm-scrolly { scroll-behavior: auto; } }\n",
    "utf8",
  );
  runFixture("shared landing CSS can own the reduced-motion fallback", scrollyReducedMotionCss, "check-scrollytelling-contract.ts", 0);

  runFixture(
    "equal-bucket source quantization fails",
    writeScrollyFixture("scrolly-equal-buckets", undefined, `${validScrollySource}\nconst active = Math.floor(scrollYProgress * steps.length);\n`),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.business.equal_bucket_quantization",
  );

  runFixture(
    "Save-Data cannot freeze code-native progress",
    writeScrollyFixture(
      "scrolly-save-data-freeze",
      undefined,
      `${validScrollySource}\nfunction sceneProgress(saveData: boolean) { if (saveData) return 0; return 1; }\n`,
    ),
    "check-scrollytelling-contract.ts",
    1,
    "scrollytelling.business.save_data_code_native_freeze",
  );

  // --- check-design-worthiness -------------------------------------------------------------

  runFixture(
    "shipped design template passes design-worthiness before review",
    makeFixture("worthiness-clean"),
    "check-design-worthiness.ts",
    0,
    undefined,
    [],
    undefined,
    "worthiness.",
  );

  const worthinessContrastFail = makeFixture("worthiness-contrast-fail");
  {
    const designPath = path.join(worthinessContrastFail, "DESIGN.md");
    const design = readFileSync(designPath, "utf8").replace('  text: "#161512"', '  text: "#c8c4bc"');
    writeFileSync(designPath, design, "utf8");
  }
  runFixture("body text below WCAG AA fails design-worthiness", worthinessContrastFail, "check-design-worthiness.ts", 1, "worthiness.contrast_text");

  const worthinessScaleFail = makeFixture("worthiness-scale-fail");
  {
    mkdirSync(path.join(worthinessScaleFail, "design/proofs"), { recursive: true });
    writeFileSync(path.join(worthinessScaleFail, "design/proofs/home.html"), '<main style="padding: 13px; font-size: 13px"><h1>Home</h1></main>\n', "utf8");
  }
  runFixture("proof HTML with pixel values outside the token scale fails", worthinessScaleFail, "check-design-worthiness.ts", 1, "worthiness.scale_raw_px");

  const worthinessHierarchyWarn = makeFixture("worthiness-hierarchy-warn");
  {
    mkdirSync(path.join(worthinessHierarchyWarn, "design/proofs"), { recursive: true });
    writeFileSync(
      path.join(worthinessHierarchyWarn, "design/proofs/home.html"),
      '<main><button class="primary">Save</button><button class="primary">Continue</button></main>\n',
      "utf8",
    );
  }
  runFixture(
    "competing primaries warn until a hierarchy attestation exists",
    worthinessHierarchyWarn,
    "check-design-worthiness.ts",
    0,
    "worthiness.hierarchy_competing_primaries",
  );

  const worthinessHierarchyAttested = makeFixture("worthiness-hierarchy-attested");
  {
    mkdirSync(path.join(worthinessHierarchyAttested, "design/proofs"), { recursive: true });
    writeFileSync(
      path.join(worthinessHierarchyAttested, "design/proofs/home.html"),
      '<main><button class="primary">Save</button><button class="primary">Continue</button></main>\n',
      "utf8",
    );
    const contractPath = path.join(worthinessHierarchyAttested, "DESIGN.md");
    const contract = readFileSync(contractPath, "utf8").replace(
      /^\|\s*Hierarchy\s*\|\s*Attested\s*\|\s*Open\s*\|\s*Record a hierarchy note when two primaries share a proof frame\.\s*\|$/m,
      "| Hierarchy | Attested | Open | Two primaries share this checkout frame because save and continue are equal. |",
    );
    writeFileSync(contractPath, contract, "utf8");
  }
  runFixture(
    "a hierarchy attestation row silences the competing-primary warning",
    worthinessHierarchyAttested,
    "check-design-worthiness.ts",
    0,
    undefined,
    [],
    undefined,
    "worthiness.hierarchy_competing_primaries",
  );

  const setDesignRoomRendered = (root: string): void => {
    writeValidDesignExploration(root);
    const statePath = path.join(root, "studio/seed/business.json");
    const designState = JSON.parse(readFileSync(statePath, "utf8")) as { designRoom?: Record<string, unknown> };
    designState.designRoom = { ...(designState.designRoom ?? {}), status: "rendered" };
    writeFileSync(statePath, `${JSON.stringify(designState, null, 2)}\n`, "utf8");
  };

  const fillTasteGate = (root: string, reviewer: string, authority: string, verdict = "pass"): void => {
    const contractPath = path.join(root, "DESIGN.md");
    const contract = readFileSync(contractPath, "utf8")
      .replace(
        "| Owner | Date | Surfaces reviewed | One-product stranger test | Copy-test | Verdict |\n| --- | --- | --- | --- | --- | --- |",
        "| Reviewer | Decision authority | Date | Surfaces reviewed | One-product stranger test | Copy-test | Verdict |\n| --- | --- | --- | --- | --- | --- | --- |",
      )
      .replace(
        "| Record the founder or owner | Record founder direct decision or owner direct decision | Record an ISO date at review | Record proof paths and key screens | Record whether a stranger would recognize one product | Record whether we would rather competitors copy this version | Record pass or fail |",
        `| ${reviewer} | ${authority} | 2026-08-01 | design/proofs/home.html and store screens | A stranger still reads this as one product from silhouette and type | We would rather competitors copy this version than the last | ${verdict} |`,
      )
      .replace(
        "| Record the founder, owner, or independent reviewer | Record founder direct decision, owner direct decision, or Founder opening mandate | For an agent decision, record the fresh-context findings path under design/reviews/ | Record an ISO date at review | Record proof paths and key screens | Record whether a stranger would recognize one product | Record whether we would rather competitors copy this version | Record pass or fail |",
        `| ${reviewer} | ${authority} | design/reviews/DESIGN_SYSTEM_REVIEW.md | 2026-08-01 | design/proofs/home.html and store screens | A stranger still reads this as one product from silhouette and type | We would rather competitors copy this version than the last | ${verdict} |`,
      )
      .replace(
        "| Record the founder, owner, or current design audit attempt owner | Record founder direct decision, owner direct decision, or Founder opening mandate | For an agent decision, record that attempt's engine-bound findings path under design/reviews/ | Record an ISO date at review | Record proof paths and key screens | Record whether a stranger would recognize one product | Record whether we would rather competitors copy this version | Record pass or fail |",
        `| ${reviewer} | ${authority} | design/reviews/DESIGN_SYSTEM_REVIEW.md | 2026-08-01 | design/proofs/home.html and store screens | A stranger still reads this as one product from silhouette and type | We would rather competitors copy this version than the last | ${verdict} |`,
      );
    writeFileSync(contractPath, contract, "utf8");
  };

  const writeDelegatedTasteReview = (
    root: string,
    verdict: "pass" | "fail" = "pass",
    authority = "Founder opening mandate",
    blockingFindings = verdict === "fail",
  ): void => {
    mkdirSync(path.join(root, "design/reference-packs"), { recursive: true });
    writeFileSync(
      path.join(root, "design/reference-packs/current-surface.md"),
      "# Current surface reference pack\n\nThe landing and native hierarchy share one object model and product promise.\n",
      "utf8",
    );
    mkdirSync(path.join(root, "design/reviews/rubrics"), { recursive: true });
    writeFileSync(
      path.join(root, "design/reviews/rubrics/design-system-v1.md"),
      "# Design system rubric\n\nVersion: RUBRIC-design-system-v1\n\nScore hierarchy, identity, continuity, states, copy, and platform fit.\n",
      "utf8",
    );
    writeFileSync(
      path.join(root, "design/reviews/DESIGN_SYSTEM_REVIEW.md"),
      [
        "# Independent design-system audit",
        "",
        "The fresh-context audit scored frozen rubric RUBRIC-design-system-v1 against the current rendered surfaces.",
        "",
        "## Delegated Taste Decision",
        "",
        "| Decision authority | Date | Surfaces reviewed | One-product stranger test | Copy-test | Verdict |",
        "| --- | --- | --- | --- | --- | --- |",
        `| ${authority} | 2026-08-01 | Landing first viewport, onboarding first-value screen, and store first frames | A stranger recognizes one coherent product from its object geometry, type, and interaction hierarchy | The direction is specific enough that we would rather competitors copy this version than the previous one | ${verdict} |`,
        "",
        "## Findings",
        "",
        "Frozen rubric: design/reviews/rubrics/design-system-v1.md version RUBRIC-design-system-v1.",
        "",
        blockingFindings
          ? "Severity: major. The frozen rubric has one unresolved finding: the landing object geometry and native onboarding hierarchy do not yet read as one product."
          : "Severity: none. The frozen rubric has no unresolved blocker or major finding; hierarchy, identity, and cross-surface continuity meet the recorded bar.",
        "",
      ].join("\n"),
      "utf8",
    );
  };

  const writeDirectModeTasteReview = (root: string): void => {
    mkdirSync(path.join(root, "design/reference-packs"), { recursive: true });
    writeFileSync(
      path.join(root, "design/reference-packs/current-surface.md"),
      "# Current surface reference pack\n\nThe landing and native hierarchy share one object model and product promise.\n",
      "utf8",
    );
    mkdirSync(path.join(root, "design/reviews/rubrics"), { recursive: true });
    writeFileSync(
      path.join(root, "design/reviews/rubrics/design-system-v1.md"),
      "# Design system rubric\n\nVersion: RUBRIC-design-system-v1\n\nScore hierarchy, identity, continuity, states, copy, and platform fit.\n",
      "utf8",
    );
    writeFileSync(
      path.join(root, "design/reviews/DESIGN_SYSTEM_REVIEW.md"),
      [
        "# Independent design-system audit",
        "",
        "## Findings",
        "",
        "Frozen rubric: design/reviews/rubrics/design-system-v1.md version RUBRIC-design-system-v1.",
        "",
        "Severity: none. The independent audit found no unresolved blocker or major finding across the current landing, onboarding, and store surfaces.",
        "",
      ].join("\n"),
      "utf8",
    );
  };

  const founderAuditPath = (root: string): string => path.join(root, "control/audit.jsonl");

  const signedFounderDecision = (
    root: string,
    run: RunStateDocument,
    decision: FounderDecision,
    key: FounderFixtureKey = FOUNDER_FIXTURE_KEY,
  ): FounderDecisionAuditLink => {
    const auditPath = founderAuditPath(root);
    mkdirSync(path.dirname(auditPath), { recursive: true });
    const history = readFounderDecisionReceiptChain({
      run,
      workspaceRoot: root,
      auditPath,
      kind: decision.kind,
      trustedKey: key.trustedKey,
    });
    const predecessor = history.at(-1);
    const sequence = (predecessor?.receipt.payload.sequence ?? 0) + 1;
    const issuedBase = decision.kind === "design_taste_delegation" ? "2026-08-01T00:00:02.100Z" : "2026-08-01T00:00:05.100Z";
    const issuedAt = new Date(Date.parse(issuedBase) + sequence).toISOString();
    const payload = {
      audience: FOUNDER_DECISION_RECEIPT_AUDIENCE,
      receiptId: `fixture.${decision.kind}.${sequence}`,
      previousReceiptId: predecessor?.receipt.payload.receiptId ?? null,
      sequence,
      workspaceBinding: computeFounderWorkspaceBinding(root),
      runId: run.runId,
      issuedAt,
      expiresAt: new Date(Date.parse(issuedAt) + 10 * 60 * 1000).toISOString(),
      decision,
    } as const;
    const receipt: FounderDecisionReceipt = {
      schemaVersion: "1.0.0",
      algorithm: FOUNDER_DECISION_RECEIPT_ALGORITHM,
      keyId: key.trustedKey.keyId,
      payload,
      signature: signEd25519(null, Buffer.from(canonicalFounderDecisionPayload(payload), "utf8"), key.privateKey).toString("base64url"),
    };
    const incoming = verifyIncomingFounderDecisionReceipt(receipt, {
      run,
      workspaceRoot: root,
      auditPath,
      expectedDecision: decision,
      trustedKey: key.trustedKey,
      now: issuedAt,
    });
    if (incoming.disposition !== "append") throw new Error(`fixture receipt ${payload.receiptId} unexpectedly already exists`);
    return appendFounderDecisionAuditEntry(auditPath, incoming, "fixture-founder", issuedAt);
  };

  const applySignedDelegation = (root: string, run: RunStateDocument, status: "approved" | "rejected"): FounderDecisionAuditLink => {
    const link = signedFounderDecision(root, run, { kind: "design_taste_delegation", status });
    run.approvals[DESIGN_TASTE_DELEGATION_APPROVAL_ID] = status;
    (run.approvalProvenance ??= {})[DESIGN_TASTE_DELEGATION_APPROVAL_ID] = founderReceiptApprovalProvenance(link);
    return link;
  };

  const bindIndependentTasteReview = (root: string, sameIdentity = false, delegated = true): void => {
    if (!existsSync(path.join(root, "design/reference-packs/current-surface.md"))) {
      mkdirSync(path.join(root, "design/reference-packs"), { recursive: true });
      writeFileSync(
        path.join(root, "design/reference-packs/current-surface.md"),
        "# Current surface reference pack\n\nThe landing and native hierarchy share one object model and product promise.\n",
        "utf8",
      );
    }
    const catalog: CatalogInput = {
      version: "catalog.design-worthiness-receipt-fixture",
      artifacts: [
        { id: "artifact.design-contract", path: "DESIGN.md" },
        { id: "artifact.design-seed", path: "studio/seed/business.json" },
        { id: "artifact.design-room", path: "design/design-room.html" },
        { id: "artifact.design-review", path: "design/reviews/DESIGN_SYSTEM_REVIEW.md" },
        { id: "artifact.design-reference-packs", path: "design/reference-packs/" },
        { id: "artifact.design-rubrics", path: "design/reviews/rubrics/" },
      ],
      workflows: [
        {
          id: "workflow.design.design-room",
          title: "Fixture Design Room",
          domainId: "domain.design",
          actionClass: "mutate",
          dependencies: [],
          outputPaths: ["DESIGN.md", "studio/seed/business.json", "design/design-room.html"],
          providerIds: [],
          laneIds: ["design"],
          founderOnlyActions: [],
          gateCommands: ["check:design-worthiness-mechanical"],
          idempotent: true,
        },
        {
          id: "workflow.design.design-system-audit",
          title: "Fixture design audit",
          domainId: "domain.design",
          actionClass: "draft",
          dependencies: ["workflow.design.design-room"],
          reviewOf: ["workflow.design.design-room"],
          reads: ["design/reference-packs/", "design/reviews/rubrics/"],
          outputPaths: ["design/reviews/DESIGN_SYSTEM_REVIEW.md"],
          providerIds: [],
          laneIds: ["design"],
          founderOnlyActions: [],
          gateCommands: ["check:design-worthiness"],
          idempotent: true,
        },
      ],
    };
    const plan = compilePlan(catalog, "2026-08-01T00:00:00.000Z");
    const lanes = {} as BusinessStateV2["lanes"];
    for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
    const businessState: BusinessStateV2 = {
      schemaVersion: "2.0.0",
      updatedAt: "2026-08-01T00:00:00.000Z",
      narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
      project: {
        name: "Taste receipt fixture",
        slug: "taste-receipt-fixture",
        owner: "Daisy Rivera",
        phase: "phase_2_design",
        launchScope: "complete",
        kickoffDate: "2026-08-01",
        platforms: ["ios"],
        bundleIds: { ios: "com.example.taste", android: "" },
        publicUrls: { landing: "", privacy: "", terms: "" },
      },
      lanes,
      founderGates: { pending: [] },
    };
    const run = seedRunState(plan, businessState, {
      ownerSessionId: "fixture-orchestrator",
      ttlSeconds: 300,
      wallClockCapSeconds: 300,
      now: "2026-08-01T00:00:00.000Z",
      runId: "run.design-worthiness-receipt-fixture",
    });
    pinFounderDecisionTrust(run, FOUNDER_FIXTURE_KEY.trustedKey);
    for (const evidencePath of ["design/reference-packs/", "design/reviews/rubrics/"]) {
      const evidenceBinding = run.artifactBindings.find((binding) => binding.path === evidencePath)!;
      evidenceBinding.accepted = true;
      evidenceBinding.fingerprint = workspaceArtifactFingerprint(root, evidenceBinding.path);
    }
    const produce = (nodeId: "run.design.design-room", owner: string, paths: readonly string[]): void => {
      const attempt = beginAttempt(plan, run, nodeId, owner, "2026-08-01T00:00:01.000Z");
      const node = plan.nodes.find((candidate) => candidate.id === nodeId)!;
      reconcilePatch(
        plan,
        run,
        {
          nodeId,
          attemptId: attempt.id,
          outputs: paths.map((relativePath) => ({
            artifactId: node.outputs.find((artifactId) =>
              run.artifactBindings.some((binding) => binding.artifactId === artifactId && binding.path === relativePath),
            )!,
            path: relativePath,
            fingerprint: workspaceArtifactFingerprint(root, relativePath),
            evidence: [`Produced ${relativePath} in the isolated fixture context.`],
          })),
        },
        "2026-08-01T00:00:02.000Z",
      );
    };
    const auditOwner = workerExecutionIdentity("fixture-audit-session", run.runId, "run.design.design-system-audit", 1);
    const designRoomOwner = sameIdentity ? auditOwner : "fixture-design-room-producer";
    produce("run.design.design-room", designRoomOwner, ["DESIGN.md", "studio/seed/business.json", "design/design-room.html"]);
    run.nodes["run.design.design-room"]!.status = "succeeded";
    run.nodes["run.design.design-room"]!.attempts.at(-1)!.status = "succeeded";
    for (const binding of run.artifactBindings) {
      if (binding.producedBy === "run.design.design-room") binding.accepted = true;
    }
    // Delegation is a founder-authenticated dispatch capability. Record and project its signed
    // edge before the audit attempt begins, then persist that exact authority on the attempt.
    if (delegated) applySignedDelegation(root, run, "approved");
    const auditExecutionOwner = sameIdentity
      ? workerExecutionIdentity("fixture-temporary-audit-session", run.runId, "run.design.design-system-audit", 1)
      : auditOwner;
    const auditInputFingerprint = createHash("sha256")
      .update(
        ["DESIGN.md", "studio/seed/business.json", "design/design-room.html", "design/reference-packs/", "design/reviews/rubrics/"]
          .map((relativePath) => {
            const binding = run.artifactBindings.find((candidate) => candidate.path === relativePath)!;
            return `${binding.artifactId}:${binding.fingerprint}`;
          })
          .join("|"),
      )
      .digest("hex");
    const reviewPath = path.join(root, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    const review = readFileSync(reviewPath, "utf8");
    writeFileSync(
      reviewPath,
      review.includes("## Findings")
        ? review.replace("## Findings\n", `## Findings\n\nCandidate input fingerprint: ${auditInputFingerprint}\n`)
        : `${review}\nCandidate input fingerprint: ${auditInputFingerprint}\n`,
      "utf8",
    );
    const auditNodeId = "run.design.design-system-audit";
    const auditAttempt = beginAttempt(plan, run, auditNodeId, auditExecutionOwner, "2026-08-01T00:00:03.000Z");
    auditAttempt.designAuthorityEvaluation = captureDesignAuthorityEvaluation(run, founderAuditPath(root), "dispatch", {
      workspaceRoot: root,
      trustedKey: FOUNDER_FIXTURE_KEY.trustedKey,
      now: "2026-08-01T00:00:03.000Z",
      evaluatedAt: "2026-08-01T00:00:03.000Z",
    });
    const auditNode = plan.nodes.find((candidate) => candidate.id === auditNodeId)!;
    reconcilePatch(
      plan,
      run,
      {
        nodeId: auditNodeId,
        attemptId: auditAttempt.id,
        outputs: [
          {
            artifactId: auditNode.outputs.find((artifactId) =>
              run.artifactBindings.some((binding) => binding.artifactId === artifactId && binding.path === "design/reviews/DESIGN_SYSTEM_REVIEW.md"),
            )!,
            path: "design/reviews/DESIGN_SYSTEM_REVIEW.md",
            fingerprint: workspaceArtifactFingerprint(root, "design/reviews/DESIGN_SYSTEM_REVIEW.md"),
            evidence: ["Produced design/reviews/DESIGN_SYSTEM_REVIEW.md in the isolated fixture context."],
          },
        ],
      },
      "2026-08-01T00:00:04.000Z",
    );
    // Model a tampered same-identity receipt only after the engine has created a valid
    // independent audit. beginAttempt itself now refuses this identity reuse.
    if (sameIdentity) run.nodes["run.design.design-system-audit"]!.attempts.at(-1)!.ownerSessionId = auditOwner;
    mkdirSync(path.join(root, "run"), { recursive: true });
    writeRunState(path.join(root, "run", "run-state.json"), run);
  };

  const bindDirectTasteDecision = (root: string, verdict: "pass" | "fail"): FounderDecisionAuditLink => {
    const runPath = path.join(root, "run/run-state.json");
    const run = loadRunState(runPath);
    const link = signedFounderDecision(root, run, {
      kind: "design_taste_direct",
      verdict,
      designSha256: computeDesignDocumentSha256(root),
    });
    const auditAttempt = run.nodes["run.design.design-system-audit"]?.attempts.at(-1);
    if (!auditAttempt) throw new Error("a direct founder fixture requires an existing current design audit attempt");
    const evaluatedAt = new Date(Date.parse(link.auditEntry.timestamp) + 100).toISOString();
    auditAttempt.designAuthorityEvaluation = captureDesignAuthorityEvaluation(run, founderAuditPath(root), "founder_revalidation", {
      workspaceRoot: root,
      trustedKey: FOUNDER_FIXTURE_KEY.trustedKey,
      now: evaluatedAt,
      evaluatedAt,
    });
    writeRunState(runPath, run);
    return link;
  };

  const recordTasteFixture = (
    trustedFounderKey: TrustedFounderDecisionKey,
    label: string,
    root: string,
    script: string,
    expectedCode: number,
    expectedText?: string,
    extraArgs: string[] = [],
    forbiddenText?: string,
  ): void => {
    if (script !== "check-design-worthiness.ts") {
      throw new Error(`the in-process taste fixture seam only supports check-design-worthiness.ts, received ${script}`);
    }
    const fixtureIssues = validateDesignWorthiness(root, {
      mechanicalOnly: extraArgs.includes("--mechanical-only"),
      trustedFounderKey,
    });
    const output = fixtureIssues.map((item) => `${item.severity.toUpperCase()} ${item.code}: ${item.message}`).join("\n");
    const actualCode = fixtureIssues.some((item) => item.severity === "error") ? 1 : 0;
    results.push({
      label,
      ok: actualCode === expectedCode && (!expectedText || output.includes(expectedText)) && (!forbiddenText || !output.includes(forbiddenText)),
      expectedCode,
      actualCode,
      expectedText,
      output,
    });
  };

  const runTasteFixture: typeof runFixture = (label, root, script, expectedCode, expectedText, extraArgs = [], _env, forbiddenText) => {
    recordTasteFixture(FOUNDER_FIXTURE_KEY.trustedKey, label, root, script, expectedCode, expectedText, extraArgs, forbiddenText);
  };

  const worthinessTasteMissing = makeFixture("worthiness-taste-missing");
  setDesignRoomRendered(worthinessTasteMissing);
  runTasteFixture(
    "review-ready design without a passing Taste Gate decision fails",
    worthinessTasteMissing,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_incomplete",
  );
  runTasteFixture(
    "the Design Room can prove mechanical worthiness before an independent taste decision exists",
    worthinessTasteMissing,
    "check-design-worthiness.ts",
    0,
    undefined,
    ["--mechanical-only"],
  );

  const worthinessTasteAgent = makeFixture("worthiness-taste-agent");
  setDesignRoomRendered(worthinessTasteAgent);
  fillTasteGate(worthinessTasteAgent, "Cursor agent automation", "Agent suggestion only");
  runTasteFixture(
    "an agent without delegated decision authority cannot pass the taste gate",
    worthinessTasteAgent,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_agent",
  );

  const worthinessTasteDelegatedAgent = makeFixture("worthiness-taste-delegated-agent");
  setDesignRoomRendered(worthinessTasteDelegatedAgent);
  writeDelegatedTasteReview(worthinessTasteDelegatedAgent);
  bindIndependentTasteReview(worthinessTasteDelegatedAgent);
  runTasteFixture(
    "a current independent audit can decide taste under the founder opening mandate without editing DESIGN.md",
    worthinessTasteDelegatedAgent,
    "check-design-worthiness.ts",
    0,
  );

  const worthinessTasteDelegatedMissingDecision = makeFixture("worthiness-taste-delegated-missing-decision");
  setDesignRoomRendered(worthinessTasteDelegatedMissingDecision);
  writeDirectModeTasteReview(worthinessTasteDelegatedMissingDecision);
  bindIndependentTasteReview(worthinessTasteDelegatedMissingDecision);
  runTasteFixture(
    "a delegated audit with current Findings but no delegated decision table is invalid audit evidence",
    worthinessTasteDelegatedMissingDecision,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteDelegatedAgentMissingEvidence = makeFixture("worthiness-taste-delegated-agent-missing-evidence");
  setDesignRoomRendered(worthinessTasteDelegatedAgentMissingEvidence);
  writeDelegatedTasteReview(worthinessTasteDelegatedAgentMissingEvidence);
  bindIndependentTasteReview(worthinessTasteDelegatedAgentMissingEvidence);
  rmSync(path.join(worthinessTasteDelegatedAgentMissingEvidence, "design/reviews/DESIGN_SYSTEM_REVIEW.md"));
  runTasteFixture(
    "a delegated decision whose bound audit artifact is missing fails",
    worthinessTasteDelegatedAgentMissingEvidence,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteDelegatedAgentUnboundProse = makeFixture("worthiness-taste-delegated-agent-unbound-prose");
  setDesignRoomRendered(worthinessTasteDelegatedAgentUnboundProse);
  writeDelegatedTasteReview(worthinessTasteDelegatedAgentUnboundProse);
  runTasteFixture(
    "a structured delegated decision without an engine-bound audit attempt cannot authorize taste",
    worthinessTasteDelegatedAgentUnboundProse,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteProducerAuthoredReview = makeFixture("worthiness-taste-producer-authored-review");
  setDesignRoomRendered(worthinessTasteProducerAuthoredReview);
  writeDelegatedTasteReview(worthinessTasteProducerAuthoredReview);
  bindIndependentTasteReview(worthinessTasteProducerAuthoredReview, true);
  runTasteFixture(
    "an audit output authored by a Design Room producer cannot authorize its own taste decision",
    worthinessTasteProducerAuthoredReview,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteStaleAuditBytes = makeFixture("worthiness-taste-stale-audit-bytes");
  setDesignRoomRendered(worthinessTasteStaleAuditBytes);
  writeDelegatedTasteReview(worthinessTasteStaleAuditBytes);
  const staleAuditPath = path.join(worthinessTasteStaleAuditBytes, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
  bindIndependentTasteReview(worthinessTasteStaleAuditBytes);
  writeFileSync(staleAuditPath, `${readFileSync(staleAuditPath, "utf8")}\nThis finding changed after the engine bound the audit output.\n`, "utf8");
  runTasteFixture(
    "an audit file changed after its bound fingerprint cannot authorize an agent taste decision",
    worthinessTasteStaleAuditBytes,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteStaleDesignInput = makeFixture("worthiness-taste-stale-design-input");
  setDesignRoomRendered(worthinessTasteStaleDesignInput);
  writeDelegatedTasteReview(worthinessTasteStaleDesignInput);
  bindIndependentTasteReview(worthinessTasteStaleDesignInput);
  {
    const designPath = path.join(worthinessTasteStaleDesignInput, "DESIGN.md");
    writeFileSync(designPath, `${readFileSync(designPath, "utf8")}\n<!-- out-of-band candidate change -->\n`, "utf8");
  }
  runTasteFixture(
    "a design candidate changed after the audit input binding cannot retain the delegated pass",
    worthinessTasteStaleDesignInput,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteStaleReferencePack = makeFixture("worthiness-taste-stale-reference-pack");
  setDesignRoomRendered(worthinessTasteStaleReferencePack);
  writeDelegatedTasteReview(worthinessTasteStaleReferencePack);
  bindIndependentTasteReview(worthinessTasteStaleReferencePack);
  {
    const packPath = path.join(worthinessTasteStaleReferencePack, "design/reference-packs/current-surface.md");
    writeFileSync(packPath, `${readFileSync(packPath, "utf8")}\nThe reference observations changed after the audit.\n`, "utf8");
  }
  runTasteFixture(
    "a reference pack changed after the audit input binding cannot retain the delegated pass",
    worthinessTasteStaleReferencePack,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteWhitespaceReboundStalePass = makeFixture("worthiness-taste-whitespace-rebound-stale-pass");
  setDesignRoomRendered(worthinessTasteWhitespaceReboundStalePass);
  writeDelegatedTasteReview(worthinessTasteWhitespaceReboundStalePass);
  bindIndependentTasteReview(worthinessTasteWhitespaceReboundStalePass);
  {
    // Model a broken engine rebinding old prose to a changed candidate after the worker only
    // appends whitespace. Every engine-owned binding is made current deliberately; the old
    // marker inside Findings is the remaining stale-candidate signal and must fail closed.
    const designPath = path.join(worthinessTasteWhitespaceReboundStalePass, "DESIGN.md");
    writeFileSync(designPath, `${readFileSync(designPath, "utf8")}\n<!-- changed candidate rebound by fixture -->\n`, "utf8");
    const reviewPath = path.join(worthinessTasteWhitespaceReboundStalePass, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(reviewPath, `${readFileSync(reviewPath, "utf8")}\n`, "utf8");
    const runPath = path.join(worthinessTasteWhitespaceReboundStalePass, "run/run-state.json");
    const run = loadRunState(runPath);
    for (const relativePath of ["DESIGN.md", "design/reviews/DESIGN_SYSTEM_REVIEW.md"]) {
      const binding = run.artifactBindings.find((candidate) => candidate.path === relativePath)!;
      binding.fingerprint = workspaceArtifactFingerprint(worthinessTasteWhitespaceReboundStalePass, binding.path);
    }
    const auditAttempt = run.nodes["run.design.design-system-audit"]!.attempts.at(-1)!;
    auditAttempt.inputFingerprint = createHash("sha256")
      .update(
        ["DESIGN.md", "studio/seed/business.json", "design/design-room.html", "design/reference-packs/", "design/reviews/rubrics/"]
          .map((relativePath) => {
            const binding = run.artifactBindings.find((candidate) => candidate.path === relativePath)!;
            return `${binding.artifactId}:${binding.fingerprint}`;
          })
          .join("|"),
      )
      .digest("hex");
    writeRunState(runPath, run);
  }
  runTasteFixture(
    "whitespace cannot disguise an old delegated pass rebound to a changed design candidate",
    worthinessTasteWhitespaceReboundStalePass,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteMalformedAudit = makeFixture("worthiness-taste-malformed-audit");
  setDesignRoomRendered(worthinessTasteMalformedAudit);
  mkdirSync(path.join(worthinessTasteMalformedAudit, "design/reviews"), { recursive: true });
  writeFileSync(
    path.join(worthinessTasteMalformedAudit, "design/reviews/DESIGN_SYSTEM_REVIEW.md"),
    "# Independent design review\n\nA fresh-context reviewer says the frozen rubric passes, but supplied no structured decision or findings.\n",
    "utf8",
  );
  mkdirSync(path.join(worthinessTasteMalformedAudit, "design/reviews/rubrics"), { recursive: true });
  writeFileSync(
    path.join(worthinessTasteMalformedAudit, "design/reviews/rubrics/design-system-v1.md"),
    "# Design system rubric\n\nVersion: RUBRIC-design-system-v1\n",
    "utf8",
  );
  bindIndependentTasteReview(worthinessTasteMalformedAudit);
  runTasteFixture(
    "qualifying audit prose without the structured delegated decision fails closed",
    worthinessTasteMalformedAudit,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteDelegatedRejected = makeFixture("worthiness-taste-delegated-rejected");
  setDesignRoomRendered(worthinessTasteDelegatedRejected);
  writeDelegatedTasteReview(worthinessTasteDelegatedRejected, "fail");
  bindIndependentTasteReview(worthinessTasteDelegatedRejected);
  runTasteFixture(
    "a structurally valid delegated fail verdict keeps the design in the bounded producer-repair loop",
    worthinessTasteDelegatedRejected,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteWrongDelegatedAuthority = makeFixture("worthiness-taste-wrong-delegated-authority");
  setDesignRoomRendered(worthinessTasteWrongDelegatedAuthority);
  writeDelegatedTasteReview(worthinessTasteWrongDelegatedAuthority, "pass", "Agent suggestion only");
  bindIndependentTasteReview(worthinessTasteWrongDelegatedAuthority);
  runTasteFixture(
    "a bound audit without the exact founder opening mandate cannot authorize taste",
    worthinessTasteWrongDelegatedAuthority,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteDelegationUnapproved = makeFixture("worthiness-taste-delegation-unapproved");
  setDesignRoomRendered(worthinessTasteDelegationUnapproved);
  writeDelegatedTasteReview(worthinessTasteDelegationUnapproved);
  bindIndependentTasteReview(worthinessTasteDelegationUnapproved, false, false);
  runTasteFixture(
    "a magic opening-mandate cell cannot replace the current typed founder delegation",
    worthinessTasteDelegationUnapproved,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_delegation_authority",
  );

  const worthinessTasteDelegationLatestRejected = makeFixture("worthiness-taste-delegation-latest-rejected");
  setDesignRoomRendered(worthinessTasteDelegationLatestRejected);
  writeDelegatedTasteReview(worthinessTasteDelegationLatestRejected);
  bindIndependentTasteReview(worthinessTasteDelegationLatestRejected);
  {
    const run = loadRunState(path.join(worthinessTasteDelegationLatestRejected, "run/run-state.json"));
    // Model a stop after the rejection reached the hash-chained audit log but before an older
    // run-state approval was replaced. Latest authority evidence must win and fail closed.
    signedFounderDecision(worthinessTasteDelegationLatestRejected, run, {
      kind: "design_taste_delegation",
      status: "rejected",
    });
  }
  runTasteFixture(
    "a latest current-run delegation rejection invalidates the prior dispatch snapshot",
    worthinessTasteDelegationLatestRejected,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTastePassWithMajorFinding = makeFixture("worthiness-taste-pass-with-major-finding");
  setDesignRoomRendered(worthinessTastePassWithMajorFinding);
  writeDelegatedTasteReview(worthinessTastePassWithMajorFinding);
  {
    const reviewPath = path.join(worthinessTastePassWithMajorFinding, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(reviewPath, `${readFileSync(reviewPath, "utf8")}\n### Major: Native hierarchy diverges across the accepted surfaces.\n`, "utf8");
  }
  bindIndependentTasteReview(worthinessTastePassWithMajorFinding);
  runTasteFixture(
    "a delegated pass cannot coexist with an unresolved major finding",
    worthinessTastePassWithMajorFinding,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteClaimedResolvedButBroken = makeFixture("worthiness-taste-claimed-resolved-but-broken");
  setDesignRoomRendered(worthinessTasteClaimedResolvedButBroken);
  writeDelegatedTasteReview(worthinessTasteClaimedResolvedButBroken);
  {
    const reviewPath = path.join(worthinessTasteClaimedResolvedButBroken, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      `${readFileSync(reviewPath, "utf8")}\nMajor finding has been resolved. However, evidence is missing and it remains broken.\n`,
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteClaimedResolvedButBroken);
  runTasteFixture(
    "a delegated pass cannot excuse a claimed resolution whose evidence is missing and remains broken",
    worthinessTasteClaimedResolvedButBroken,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteDelayedContradiction = makeFixture("worthiness-taste-delayed-contradiction");
  setDesignRoomRendered(worthinessTasteDelayedContradiction);
  writeDelegatedTasteReview(worthinessTasteDelayedContradiction);
  {
    const reviewPath = path.join(worthinessTasteDelayedContradiction, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      `${readFileSync(reviewPath, "utf8")}\nMajor finding has been resolved. There is no supporting evidence. However, it remains broken.\n`,
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteDelayedContradiction);
  runTasteFixture(
    "a delegated pass cannot hide a delayed contradiction to a claimed resolution",
    worthinessTasteDelayedContradiction,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteParagraphSeparatedContradiction = makeFixture("worthiness-taste-paragraph-separated-contradiction");
  setDesignRoomRendered(worthinessTasteParagraphSeparatedContradiction);
  writeDelegatedTasteReview(worthinessTasteParagraphSeparatedContradiction);
  {
    const reviewPath = path.join(worthinessTasteParagraphSeparatedContradiction, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      `${readFileSync(reviewPath, "utf8")}\nMajor finding has been resolved.\n\nThe reviewer revisited the screen.\n\nHowever, it remains broken.\n`,
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteParagraphSeparatedContradiction);
  runTasteFixture(
    "a delegated pass cannot hide a contradiction behind an unrelated paragraph",
    worthinessTasteParagraphSeparatedContradiction,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteMixedClearAndOpen = makeFixture("worthiness-taste-mixed-clear-and-open");
  setDesignRoomRendered(worthinessTasteMixedClearAndOpen);
  writeDelegatedTasteReview(worthinessTasteMixedClearAndOpen);
  {
    const reviewPath = path.join(worthinessTasteMixedClearAndOpen, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      readFileSync(reviewPath, "utf8").replace(/^Severity: none\..*$/m, "Severity: none. No blockers remain; one major finding is open."),
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteMixedClearAndOpen);
  runTasteFixture(
    "an all-clear for blockers cannot mask an open major finding in delegated mode",
    worthinessTasteMixedClearAndOpen,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteMalformedSeverity = makeFixture("worthiness-taste-malformed-severity");
  setDesignRoomRendered(worthinessTasteMalformedSeverity);
  writeDelegatedTasteReview(worthinessTasteMalformedSeverity);
  {
    const reviewPath = path.join(worthinessTasteMalformedSeverity, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").replace("Severity: none.", "Severity: potato."), "utf8");
  }
  bindIndependentTasteReview(worthinessTasteMalformedSeverity);
  runTasteFixture(
    "a delegated pass with an unrecognized severity value is malformed audit evidence",
    worthinessTasteMalformedSeverity,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteMissingSeverity = makeFixture("worthiness-taste-missing-severity");
  setDesignRoomRendered(worthinessTasteMissingSeverity);
  writeDelegatedTasteReview(worthinessTasteMissingSeverity);
  {
    const reviewPath = path.join(worthinessTasteMissingSeverity, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").replace(/^Severity: none\..*\n?/m, ""), "utf8");
  }
  bindIndependentTasteReview(worthinessTasteMissingSeverity);
  runTasteFixture(
    "a delegated pass without the exact severity line is malformed audit evidence",
    worthinessTasteMissingSeverity,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteDuplicateSeverity = makeFixture("worthiness-taste-duplicate-severity");
  setDesignRoomRendered(worthinessTasteDuplicateSeverity);
  writeDelegatedTasteReview(worthinessTasteDuplicateSeverity);
  {
    const reviewPath = path.join(worthinessTasteDuplicateSeverity, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(reviewPath, `${readFileSync(reviewPath, "utf8")}\nSeverity: none. Duplicate declaration.\n`, "utf8");
  }
  bindIndependentTasteReview(worthinessTasteDuplicateSeverity);
  runTasteFixture(
    "duplicate severity declarations are malformed audit evidence",
    worthinessTasteDuplicateSeverity,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteDeceptiveSeverityLabel = makeFixture("worthiness-taste-deceptive-severity-label");
  setDesignRoomRendered(worthinessTasteDeceptiveSeverityLabel);
  writeDelegatedTasteReview(worthinessTasteDeceptiveSeverityLabel);
  {
    const reviewPath = path.join(worthinessTasteDeceptiveSeverityLabel, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").replace(/^Severity: none\..*$/m, "Severity: none of the screenshots loaded"), "utf8");
  }
  bindIndependentTasteReview(worthinessTasteDeceptiveSeverityLabel);
  runTasteFixture(
    "a severity label needs an exact enum or punctuation-delimited explanation",
    worthinessTasteDeceptiveSeverityLabel,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteDeceptiveSeverityHeading = makeFixture("worthiness-taste-deceptive-severity-heading");
  setDesignRoomRendered(worthinessTasteDeceptiveSeverityHeading);
  writeDelegatedTasteReview(worthinessTasteDeceptiveSeverityHeading);
  {
    const reviewPath = path.join(worthinessTasteDeceptiveSeverityHeading, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").replace(/^Severity: none\..*$/m, "### None of the screenshots loaded"), "utf8");
  }
  bindIndependentTasteReview(worthinessTasteDeceptiveSeverityHeading);
  runTasteFixture(
    "an unrelated heading beginning with a severity word is not a severity marker",
    worthinessTasteDeceptiveSeverityHeading,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteDeceptiveSeverityTable = makeFixture("worthiness-taste-deceptive-severity-table");
  setDesignRoomRendered(worthinessTasteDeceptiveSeverityTable);
  writeDelegatedTasteReview(worthinessTasteDeceptiveSeverityTable);
  {
    const reviewPath = path.join(worthinessTasteDeceptiveSeverityTable, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      readFileSync(reviewPath, "utf8").replace(/^Severity: none\..*$/m, "| Option | Status |\n| --- | --- |\n| None | Complete |"),
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteDeceptiveSeverityTable);
  runTasteFixture(
    "an enum in a table without a Severity column is not a severity marker",
    worthinessTasteDeceptiveSeverityTable,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteRubricMissing = makeFixture("worthiness-taste-rubric-missing");
  setDesignRoomRendered(worthinessTasteRubricMissing);
  writeDelegatedTasteReview(worthinessTasteRubricMissing);
  bindIndependentTasteReview(worthinessTasteRubricMissing);
  rmSync(path.join(worthinessTasteRubricMissing, "design/reviews/rubrics/design-system-v1.md"));
  runTasteFixture(
    "a delegated decision whose declared frozen rubric is missing fails",
    worthinessTasteRubricMissing,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteRubricWrongVersion = makeFixture("worthiness-taste-rubric-wrong-version");
  setDesignRoomRendered(worthinessTasteRubricWrongVersion);
  writeDelegatedTasteReview(worthinessTasteRubricWrongVersion);
  {
    const reviewPath = path.join(worthinessTasteRubricWrongVersion, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").replaceAll("RUBRIC-design-system-v1", "RUBRIC-design-system-v2"), "utf8");
  }
  bindIndependentTasteReview(worthinessTasteRubricWrongVersion);
  runTasteFixture(
    "a delegated decision whose declared rubric version is absent from the rubric fails",
    worthinessTasteRubricWrongVersion,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteDuplicateRubricMarker = makeFixture("worthiness-taste-duplicate-rubric-marker");
  setDesignRoomRendered(worthinessTasteDuplicateRubricMarker);
  writeDelegatedTasteReview(worthinessTasteDuplicateRubricMarker);
  {
    const reviewPath = path.join(worthinessTasteDuplicateRubricMarker, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      `${readFileSync(reviewPath, "utf8")}\nFrozen rubric: design/reviews/rubrics/design-system-v1.md version RUBRIC-design-system-v1.\n`,
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteDuplicateRubricMarker);
  runTasteFixture(
    "duplicate frozen-rubric markers invalidate a delegated audit",
    worthinessTasteDuplicateRubricMarker,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteRubricVersionOnlyInProse = makeFixture("worthiness-taste-rubric-version-only-in-prose");
  setDesignRoomRendered(worthinessTasteRubricVersionOnlyInProse);
  writeDelegatedTasteReview(worthinessTasteRubricVersionOnlyInProse);
  {
    const rubricPath = path.join(worthinessTasteRubricVersionOnlyInProse, "design/reviews/rubrics/design-system-v1.md");
    const rubric = readFileSync(rubricPath, "utf8")
      .replace("Version: RUBRIC-design-system-v1", "Version: RUBRIC-design-system-v2")
      .concat("\nChangelog: previous version: RUBRIC-design-system-v1.\n");
    writeFileSync(rubricPath, rubric, "utf8");
  }
  bindIndependentTasteReview(worthinessTasteRubricVersionOnlyInProse);
  runTasteFixture(
    "a stale rubric version mentioned only in prose cannot satisfy the canonical Version line",
    worthinessTasteRubricVersionOnlyInProse,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteRubricStale = makeFixture("worthiness-taste-rubric-stale");
  setDesignRoomRendered(worthinessTasteRubricStale);
  writeDelegatedTasteReview(worthinessTasteRubricStale);
  bindIndependentTasteReview(worthinessTasteRubricStale);
  {
    const rubricPath = path.join(worthinessTasteRubricStale, "design/reviews/rubrics/design-system-v1.md");
    writeFileSync(rubricPath, `${readFileSync(rubricPath, "utf8")}\nThe rubric changed after the audit started.\n`, "utf8");
  }
  runTasteFixture(
    "a delegated decision bound to stale rubric-directory bytes fails",
    worthinessTasteRubricStale,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteStaleAuditState = makeFixture("worthiness-taste-stale-audit-state");
  setDesignRoomRendered(worthinessTasteStaleAuditState);
  writeDelegatedTasteReview(worthinessTasteStaleAuditState);
  bindIndependentTasteReview(worthinessTasteStaleAuditState);
  {
    const runPath = path.join(worthinessTasteStaleAuditState, "run/run-state.json");
    const run = loadRunState(runPath);
    run.nodes["run.design.design-system-audit"]!.status = "stale";
    writeRunState(runPath, run);
  }
  runTasteFixture(
    "a stale audit node cannot authorize taste through its old attempt and binding",
    worthinessTasteStaleAuditState,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteForgedFounder = makeFixture("worthiness-taste-forged-founder");
  setDesignRoomRendered(worthinessTasteForgedFounder);
  fillTasteGate(worthinessTasteForgedFounder, "Daisy Rivera founder", "Founder direct decision");
  runTasteFixture(
    "a producer-authored founder-looking row cannot authorize the direct taste gate",
    worthinessTasteForgedFounder,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_authority_evidence",
  );

  const worthinessTasteDelegatedForgedFounder = makeFixture("worthiness-taste-delegated-forged-founder");
  setDesignRoomRendered(worthinessTasteDelegatedForgedFounder);
  fillTasteGate(worthinessTasteDelegatedForgedFounder, "Daisy Rivera founder", "Founder direct decision");
  writeDelegatedTasteReview(worthinessTasteDelegatedForgedFounder);
  {
    const reviewPath = path.join(worthinessTasteDelegatedForgedFounder, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").replace("Severity: none.", "Severity: potato."), "utf8");
  }
  bindIndependentTasteReview(worthinessTasteDelegatedForgedFounder);
  runTasteFixture(
    "current delegation makes malformed audit output retryable despite a forged founder-looking row",
    worthinessTasteDelegatedForgedFounder,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteFounder = makeFixture("worthiness-taste-founder");
  setDesignRoomRendered(worthinessTasteFounder);
  fillTasteGate(worthinessTasteFounder, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounder);
  bindIndependentTasteReview(worthinessTasteFounder, false, false);
  bindDirectTasteDecision(worthinessTasteFounder, "pass");
  runTasteFixture("a candidate-bound founder taste-gate decision passes at review-ready", worthinessTasteFounder, "check-design-worthiness.ts", 0);
  runFixture(
    "the executable validator ignores the untrusted raw founder-key environment value",
    worthinessTasteFounder,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_authority_evidence",
    [],
    { [FOUNDER_ED25519_PUBLIC_KEY_ENV]: FOUNDER_FIXTURE_KEY.publicKeyBase64Url },
  );

  const worthinessTasteFounderWrongKey = makeFixture("worthiness-taste-founder-wrong-key");
  setDesignRoomRendered(worthinessTasteFounderWrongKey);
  fillTasteGate(worthinessTasteFounderWrongKey, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderWrongKey);
  bindIndependentTasteReview(worthinessTasteFounderWrongKey, false, false);
  bindDirectTasteDecision(worthinessTasteFounderWrongKey, "pass");
  recordTasteFixture(
    WRONG_FOUNDER_FIXTURE_KEY,
    "a valid receipt is not authority under a different trusted founder key",
    worthinessTasteFounderWrongKey,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_authority_evidence",
  );

  const worthinessTasteFounderTamperedReceipt = makeFixture("worthiness-taste-founder-tampered-receipt");
  setDesignRoomRendered(worthinessTasteFounderTamperedReceipt);
  fillTasteGate(worthinessTasteFounderTamperedReceipt, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderTamperedReceipt);
  bindIndependentTasteReview(worthinessTasteFounderTamperedReceipt, false, false);
  bindDirectTasteDecision(worthinessTasteFounderTamperedReceipt, "pass");
  {
    const auditPath = founderAuditPath(worthinessTasteFounderTamperedReceipt);
    const entries = readFileSync(auditPath, "utf8").trimEnd().split("\n");
    const last = JSON.parse(entries.at(-1)!) as { receipt?: { signature?: string } };
    const signature = last.receipt?.signature;
    if (!signature) throw new Error("fixture expected a signed direct receipt in the audit tip");
    last.receipt!.signature = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
    entries[entries.length - 1] = JSON.stringify(last);
    writeFileSync(auditPath, `${entries.join("\n")}\n`, "utf8");
  }
  runTasteFixture(
    "a tampered signed founder receipt fails closed",
    worthinessTasteFounderTamperedReceipt,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_authority_evidence",
  );

  const worthinessTasteFounderStaleReceipt = makeFixture("worthiness-taste-founder-stale-receipt");
  setDesignRoomRendered(worthinessTasteFounderStaleReceipt);
  fillTasteGate(worthinessTasteFounderStaleReceipt, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderStaleReceipt);
  bindIndependentTasteReview(worthinessTasteFounderStaleReceipt, false, false);
  bindDirectTasteDecision(worthinessTasteFounderStaleReceipt, "pass");
  {
    const designPath = path.join(worthinessTasteFounderStaleReceipt, "DESIGN.md");
    writeFileSync(designPath, `${readFileSync(designPath, "utf8")}\n<!-- candidate changed after founder receipt -->\n`, "utf8");
  }
  runTasteFixture(
    "a signed direct pass becomes stale when the exact DESIGN.md candidate changes",
    worthinessTasteFounderStaleReceipt,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_authority_evidence",
  );

  const worthinessTasteFounderMissingEvaluation = makeFixture("worthiness-taste-founder-missing-evaluation");
  setDesignRoomRendered(worthinessTasteFounderMissingEvaluation);
  fillTasteGate(worthinessTasteFounderMissingEvaluation, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderMissingEvaluation);
  bindIndependentTasteReview(worthinessTasteFounderMissingEvaluation, false, false);
  bindDirectTasteDecision(worthinessTasteFounderMissingEvaluation, "pass");
  {
    const runPath = path.join(worthinessTasteFounderMissingEvaluation, "run/run-state.json");
    const run = loadRunState(runPath);
    delete run.nodes["run.design.design-system-audit"]!.attempts.at(-1)!.designAuthorityEvaluation;
    writeRunState(runPath, run);
  }
  runTasteFixture(
    "a signed direct receipt without the exact attempt authority evaluation fails closed",
    worthinessTasteFounderMissingEvaluation,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_authority_evidence",
  );

  const worthinessTasteFounderMalformedAudit = makeFixture("worthiness-taste-founder-malformed-audit");
  setDesignRoomRendered(worthinessTasteFounderMalformedAudit);
  fillTasteGate(worthinessTasteFounderMalformedAudit, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderMalformedAudit);
  bindIndependentTasteReview(worthinessTasteFounderMalformedAudit, false, false);
  bindDirectTasteDecision(worthinessTasteFounderMalformedAudit, "pass");
  {
    const reviewPath = path.join(worthinessTasteFounderMalformedAudit, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(reviewPath, "# Malformed audit\n\nNo current structured findings.\n", "utf8");
    const runPath = path.join(worthinessTasteFounderMalformedAudit, "run/run-state.json");
    const run = loadRunState(runPath);
    const binding = run.artifactBindings.find((candidate) => candidate.path === "design/reviews/DESIGN_SYSTEM_REVIEW.md")!;
    binding.fingerprint = workspaceArtifactFingerprint(worthinessTasteFounderMalformedAudit, binding.path);
    writeRunState(runPath, run);
  }
  runTasteFixture(
    "a direct founder pass cannot excuse malformed independent audit Findings",
    worthinessTasteFounderMalformedAudit,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteFounderDuplicateRubricMarker = makeFixture("worthiness-taste-founder-duplicate-rubric-marker");
  setDesignRoomRendered(worthinessTasteFounderDuplicateRubricMarker);
  fillTasteGate(worthinessTasteFounderDuplicateRubricMarker, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderDuplicateRubricMarker);
  {
    const reviewPath = path.join(worthinessTasteFounderDuplicateRubricMarker, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      `${readFileSync(reviewPath, "utf8")}\nFrozen rubric: design/reviews/rubrics/design-system-v1.md version RUBRIC-design-system-v1.\n`,
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteFounderDuplicateRubricMarker, false, false);
  bindDirectTasteDecision(worthinessTasteFounderDuplicateRubricMarker, "pass");
  runTasteFixture(
    "duplicate frozen-rubric markers invalidate a direct-founder audit",
    worthinessTasteFounderDuplicateRubricMarker,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_review_evidence",
  );

  const worthinessTasteFounderPassWithMajorFinding = makeFixture("worthiness-taste-founder-pass-with-major-finding");
  setDesignRoomRendered(worthinessTasteFounderPassWithMajorFinding);
  fillTasteGate(worthinessTasteFounderPassWithMajorFinding, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderPassWithMajorFinding);
  {
    const reviewPath = path.join(worthinessTasteFounderPassWithMajorFinding, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      `${readFileSync(reviewPath, "utf8")}\n| Severity | Finding |\n| --- | --- |\n| Major | Native hierarchy diverges across the accepted surfaces. |\n`,
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteFounderPassWithMajorFinding, false, false);
  bindDirectTasteDecision(worthinessTasteFounderPassWithMajorFinding, "pass");
  runTasteFixture(
    "a candidate-bound direct founder pass cannot override unresolved independent major findings",
    worthinessTasteFounderPassWithMajorFinding,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteFounderClaimedResolvedButBroken = makeFixture("worthiness-taste-founder-claimed-resolved-but-broken");
  setDesignRoomRendered(worthinessTasteFounderClaimedResolvedButBroken);
  fillTasteGate(worthinessTasteFounderClaimedResolvedButBroken, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderClaimedResolvedButBroken);
  {
    const reviewPath = path.join(worthinessTasteFounderClaimedResolvedButBroken, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      `${readFileSync(reviewPath, "utf8")}\nMajor finding has been resolved. However, evidence is missing and it remains broken.\n`,
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteFounderClaimedResolvedButBroken, false, false);
  bindDirectTasteDecision(worthinessTasteFounderClaimedResolvedButBroken, "pass");
  runTasteFixture(
    "a direct founder pass cannot excuse a claimed resolution whose evidence is missing and remains broken",
    worthinessTasteFounderClaimedResolvedButBroken,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteFounderDelayedContradiction = makeFixture("worthiness-taste-founder-delayed-contradiction");
  setDesignRoomRendered(worthinessTasteFounderDelayedContradiction);
  fillTasteGate(worthinessTasteFounderDelayedContradiction, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderDelayedContradiction);
  {
    const reviewPath = path.join(worthinessTasteFounderDelayedContradiction, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      `${readFileSync(reviewPath, "utf8")}\nMajor finding has been resolved. There is no supporting evidence. However, it remains broken.\n`,
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteFounderDelayedContradiction, false, false);
  bindDirectTasteDecision(worthinessTasteFounderDelayedContradiction, "pass");
  runTasteFixture(
    "a direct founder pass cannot hide a delayed contradiction to a claimed resolution",
    worthinessTasteFounderDelayedContradiction,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteFounderParagraphSeparatedContradiction = makeFixture("worthiness-taste-founder-paragraph-separated-contradiction");
  setDesignRoomRendered(worthinessTasteFounderParagraphSeparatedContradiction);
  fillTasteGate(worthinessTasteFounderParagraphSeparatedContradiction, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderParagraphSeparatedContradiction);
  {
    const reviewPath = path.join(worthinessTasteFounderParagraphSeparatedContradiction, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      `${readFileSync(reviewPath, "utf8")}\nMajor finding has been resolved.\n\nThe reviewer revisited the screen.\n\nHowever, it remains broken.\n`,
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteFounderParagraphSeparatedContradiction, false, false);
  bindDirectTasteDecision(worthinessTasteFounderParagraphSeparatedContradiction, "pass");
  runTasteFixture(
    "a direct founder pass cannot hide a contradiction behind an unrelated paragraph",
    worthinessTasteFounderParagraphSeparatedContradiction,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteFounderMixedClearAndOpen = makeFixture("worthiness-taste-founder-mixed-clear-and-open");
  setDesignRoomRendered(worthinessTasteFounderMixedClearAndOpen);
  fillTasteGate(worthinessTasteFounderMixedClearAndOpen, "Daisy Rivera founder", "Founder direct decision");
  writeDirectModeTasteReview(worthinessTasteFounderMixedClearAndOpen);
  {
    const reviewPath = path.join(worthinessTasteFounderMixedClearAndOpen, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
    writeFileSync(
      reviewPath,
      readFileSync(reviewPath, "utf8").replace(/^Severity: none\..*$/m, "Severity: none. No blockers remain; one major finding is open."),
      "utf8",
    );
  }
  bindIndependentTasteReview(worthinessTasteFounderMixedClearAndOpen, false, false);
  bindDirectTasteDecision(worthinessTasteFounderMixedClearAndOpen, "pass");
  runTasteFixture(
    "an all-clear for blockers cannot mask an open major finding in direct-founder mode",
    worthinessTasteFounderMixedClearAndOpen,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteFounderPassThenFail = makeFixture("worthiness-taste-founder-pass-then-fail");
  setDesignRoomRendered(worthinessTasteFounderPassThenFail);
  fillTasteGate(worthinessTasteFounderPassThenFail, "Daisy Rivera founder", "Founder direct decision", "fail");
  writeDirectModeTasteReview(worthinessTasteFounderPassThenFail);
  bindIndependentTasteReview(worthinessTasteFounderPassThenFail, false, false);
  bindDirectTasteDecision(worthinessTasteFounderPassThenFail, "pass");
  bindDirectTasteDecision(worthinessTasteFounderPassThenFail, "fail");
  runTasteFixture(
    "a later founder fail for the same DESIGN.md candidate invalidates its older direct pass",
    worthinessTasteFounderPassThenFail,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteRejected = makeFixture("worthiness-taste-rejected");
  setDesignRoomRendered(worthinessTasteRejected);
  fillTasteGate(worthinessTasteRejected, "Daisy Rivera founder", "Founder direct decision", "fail");
  writeDirectModeTasteReview(worthinessTasteRejected);
  bindIndependentTasteReview(worthinessTasteRejected, false, false);
  bindDirectTasteDecision(worthinessTasteRejected, "fail");
  runTasteFixture(
    "a complete fail verdict keeps the design blocked for producer repair",
    worthinessTasteRejected,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_rejected",
  );

  const worthinessTasteDirectPassDelegatedFail = makeFixture("worthiness-taste-direct-pass-delegated-fail");
  setDesignRoomRendered(worthinessTasteDirectPassDelegatedFail);
  fillTasteGate(worthinessTasteDirectPassDelegatedFail, "Daisy Rivera founder", "Founder direct decision", "pass");
  writeDelegatedTasteReview(worthinessTasteDirectPassDelegatedFail, "fail", "Founder opening mandate", false);
  bindIndependentTasteReview(worthinessTasteDirectPassDelegatedFail);
  bindDirectTasteDecision(worthinessTasteDirectPassDelegatedFail, "pass");
  runTasteFixture(
    "a candidate-bound direct founder pass overrides a delegated taste-only fail after independent Findings clear",
    worthinessTasteDirectPassDelegatedFail,
    "check-design-worthiness.ts",
    0,
  );

  const worthinessTasteMissingVerdict = makeFixture("worthiness-taste-missing-verdict");
  setDesignRoomRendered(worthinessTasteMissingVerdict);
  {
    const contractPath = path.join(worthinessTasteMissingVerdict, "DESIGN.md");
    const lines = readFileSync(contractPath, "utf8").split("\n");
    const header = lines.findIndex((line) => line.includes("| Reviewer") && line.includes("| Verdict"));
    if (header < 0) throw new Error("fixture setup could not find the current Taste Gate table");
    lines.splice(
      header,
      3,
      "| Owner | Date | Surfaces reviewed | One-product stranger test | Copy-test |",
      "| --- | --- | --- | --- | --- |",
      "| Daisy Rivera founder | 2026-08-01 | design/proofs/home.html and store screens | A stranger still reads this as one product from silhouette and type | We would rather competitors copy this version than the last |",
    );
    writeFileSync(contractPath, lines.join("\n"), "utf8");
  }
  runTasteFixture(
    "a Taste Gate table missing its required Verdict is rejected",
    worthinessTasteMissingVerdict,
    "check-design-worthiness.ts",
    1,
    "worthiness.taste_gate_incomplete",
  );

  // check:audience-identity — one object language across surfaces.
  const objectLanguageRow = (object: string, allowed: string, forbidden: string, evidence = "strategy/RESEARCH.md#audience"): string =>
    `| ${object} | The ${object.toLowerCase()} a person keeps for one hair-colour session | ${allowed} | ${forbidden} | ${evidence} |`;
  const setObjectLanguage = (root: string, rows: string[], status = "accepted"): void => {
    const designPath = path.join(root, "DESIGN.md");
    const original = readFileSync(designPath, "utf8");
    const withStatus = original.replace("Status: not started", `Status: ${status}`);
    const placeholderRow = /^\|\s*Not defined\s*\|\s*Not defined\s*\|\s*Not defined\s*\|\s*Not defined\s*\|\s*Not captured\s*\|$/m;
    if (!placeholderRow.test(withStatus)) throw new Error("DESIGN.md template lost its Object Language placeholder row");
    writeFileSync(designPath, withStatus.replace(placeholderRow, rows.join("\n")), "utf8");
  };

  const audienceIdentityTemplate = makeFixture("audience-identity-template");
  runFixture("object language placeholder passes before the design is accepted", audienceIdentityTemplate, "check-audience-identity.ts", 0);

  const audienceIdentityPlaceholderAccepted = makeFixture("audience-identity-placeholder-accepted");
  {
    const designPath = path.join(audienceIdentityPlaceholderAccepted, "DESIGN.md");
    writeFileSync(designPath, readFileSync(designPath, "utf8").replace("Status: not started", "Status: accepted"), "utf8");
  }
  runFixture(
    "an accepted design with a placeholder object row fails",
    audienceIdentityPlaceholderAccepted,
    "check-audience-identity.ts",
    1,
    "audience_identity.placeholder_row",
  );

  const audienceIdentitySectionMissing = makeFixture("audience-identity-section-missing");
  {
    const designPath = path.join(audienceIdentitySectionMissing, "DESIGN.md");
    const text = readFileSync(designPath, "utf8").replace("Status: not started", "Status: accepted").replace("## Object Language", "## Retired Section");
    writeFileSync(designPath, text, "utf8");
  }
  runFixture(
    "an accepted design without an Object Language section fails",
    audienceIdentitySectionMissing,
    "check-audience-identity.ts",
    1,
    "audience_identity.section_missing",
  );

  const audienceIdentityBannedTerm = makeFixture("audience-identity-banned-term");
  setObjectLanguage(audienceIdentityBannedTerm, [objectLanguageRow("Colour record", "record, entry", "shade streak, colour diary")]);
  mkdirSync(path.join(audienceIdentityBannedTerm, "product/copy"), { recursive: true });
  writeFileSync(
    path.join(audienceIdentityBannedTerm, "product/copy/COPY_DECK.md"),
    [
      "# Copy deck",
      "",
      "| Key | String |",
      "| --- | --- |",
      "| home.empty.body | Start your first colour record. |",
      "| home.streak.body | Keep your shade streak alive. |",
    ].join("\n"),
    "utf8",
  );
  runFixture("a surface that uses a forbidden term fails", audienceIdentityBannedTerm, "check-audience-identity.ts", 1, "audience_identity.banned_term");

  const audienceIdentityConflict = makeFixture("audience-identity-term-conflict");
  setObjectLanguage(audienceIdentityConflict, [
    objectLanguageRow("Colour record", "record, entry", "shade streak"),
    objectLanguageRow("Wash count", "wash, rinse", "entry"),
  ]);
  runFixture(
    "a term allowed for one object and forbidden for another fails",
    audienceIdentityConflict,
    "check-audience-identity.ts",
    1,
    "audience_identity.term_conflict",
  );

  const audienceIdentityNoEvidence = makeFixture("audience-identity-no-evidence");
  setObjectLanguage(audienceIdentityNoEvidence, [objectLanguageRow("Colour record", "record", "shade streak", "the designer liked it")]);
  runFixture(
    "an accepted object row without research evidence fails",
    audienceIdentityNoEvidence,
    "check-audience-identity.ts",
    1,
    "audience_identity.object_evidence_missing",
  );

  const audienceIdentityCoherent = makeFixture("audience-identity-coherent");
  setObjectLanguage(audienceIdentityCoherent, [objectLanguageRow("Colour record", "record, entry", "shade streak, colour diary")]);
  mkdirSync(path.join(audienceIdentityCoherent, "product/copy"), { recursive: true });
  writeFileSync(
    path.join(audienceIdentityCoherent, "product/copy/COPY_DECK.md"),
    ["# Copy deck", "", "| Key | String |", "| --- | --- |", "| home.empty.body | Start your first colour record. |"].join("\n"),
    "utf8",
  );
  runFixture("an accepted design whose surfaces speak the object language passes", audienceIdentityCoherent, "check-audience-identity.ts", 0);
}
