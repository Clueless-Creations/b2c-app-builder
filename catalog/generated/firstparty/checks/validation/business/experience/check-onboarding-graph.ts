#!/usr/bin/env node
/**
 * Deterministic contract gate for the generalized onboarding system graph.
 *
 * This validator does not grade conversion taste. It proves that the canonical artifact carries the graph, evidence joins, first-value and activation distinctions,
 * screen and control contracts, provider and policy research, typed analytics, compliant review timing, visual design requirements, and replacement-mode deletion plan.
 */
import { loadDesignSurfaceApplicability } from "../../../../catalog/ontology/design-surface-applicability.js";
import { loadOnboardingApplicability } from "../../../../catalog/ontology/onboarding-applicability.js";
import {
  asArray,
  asString,
  getPath,
  issue,
  loadProjectState,
  parseCliArgs,
  readText,
  reportAndExit,
  stripNonRenderedMarkdown,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";

const TEMPLATE_DIRECTIVE_VERBS = new Set([
  "add",
  "added",
  "capture",
  "captured",
  "choose",
  "chosen",
  "complete",
  "completed",
  "define",
  "defined",
  "describe",
  "described",
  "document",
  "documented",
  "enter",
  "entered",
  "fill",
  "filled",
  "finish",
  "finished",
  "include",
  "included",
  "insert",
  "inserted",
  "mark",
  "marked",
  "note",
  "noted",
  "provide",
  "provided",
  "record",
  "replace",
  "replaced",
  "select",
  "selected",
  "specify",
  "specified",
  "update",
  "updated",
  "write",
  "written",
]);

// The shipped template's own Verification section carries 11 checklist items (product/ONBOARDING.md).
// Deleting an item outright, rather than checking it off, is invisible to countUncheckedItems() --
// it would read 0 unchecked items just as happily as a genuinely complete checklist.
const EXPECTED_VERIFICATION_ITEM_COUNT = 11;

// A distinguishing substring from each of the shipped template's 11 canonical checklist
// assertions. verificationItemCount alone only counts checked-looking lines: deleting one
// canonical assertion and duplicating a remaining checked line keeps the count at 11 and the
// unchecked count at 0, so the destructive ONB-22 completion gate would accept a checklist that
// no longer actually contains every required assertion. requireUniqueCheckedFingerprints() below
// verifies each assertion's own text is still carried by its own distinct checked line, not just
// present as text anywhere in the section.
const VERIFICATION_ITEM_FINGERPRINTS = [
  "ONB-00` through `ONB-22` are done, or the lane is not claimed done",
  "internal guidance, provider, policy, seven-principle, and motion research are joined",
  "review eligibility, and completion are distinct",
  "personalization proof, and the interruption budget are justified",
  "Experiment, review, permission, and lifecycle owners are explicit",
  "paywall, error, and recovery state is specified and designed",
  "interactive prototype, accessibility, localization, privacy, security, performance, and observability checks exist",
  "provider-confirmed outcomes, and Expected Event Sequences pass",
  "Compound Engineering planning, implementation, review, tests, and provider validation pass",
  "Hard cutover preserves durable user value and leaves only the target runtime and removes transformation tooling",
  "check-onboarding-graph.ts` passes",
];

// Not a shared parseCliArgs flag: this is the one caller-specific switch that turns the
// lane-state-derived strict check into an unconditional one, used only by ONB-22's own gate
// invocation (check:onboarding-graph-complete) -- see the requireDone block below.
const requireDone = process.argv.includes("--require-done");
const args = parseCliArgs(process.argv.slice(2));
const stateSourceFile = "state/business-state.json";
const loaded = loadProjectState(args);
const issues: Issue[] = [...loaded.issues];
const state = loaded.state;

const candidates = ["product/ONBOARDING.md", "business/product/ONBOARDING.md"];
const artifact = candidates
  .map((relativePath) => ({ relativePath, text: readText(args.root, relativePath) }))
  .find((candidate) => candidate.text !== undefined);

const laneStatus = state ? asString(getPath(state, "lanes.onboarding.status")) : undefined;
const laneAbsent = state ? getPath(state, "lanes.onboarding") === undefined : true;
const laneExempt = laneStatus === "not_needed" || laneStatus === "deferred";
// check-lane-coverage.ts also treats nonempty evidence as sufficient rationale for a skip --
// evidence answers "did the lane produce anything," not "why is it not happening," so a
// deferred/not_needed onboarding lane with no recorded reason still isn't actually explained.
const laneBlockers = state
  ? asArray(getPath(state, "lanes.onboarding.blockers")).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  : [];
const laneReason = state ? asString(getPath(state, "lanes.onboarding.reason")) : undefined;
const hasDeferralReason = laneBlockers.length > 0 || Boolean(laneReason?.trim());
if (laneExempt && !hasDeferralReason) {
  issues.push(
    issue(
      "error",
      "onboarding_graph.deferred_without_reason",
      `${stateSourceFile} marks lanes.onboarding ${laneStatus} but records no blockers or reason explaining why. Record a dated blocker or reason before this exemption applies.`,
      stateSourceFile,
    ),
  );
}
// The not_needed/deferred exemption belongs to the general (lenient) invocation only, and only
// once it is actually explained. Under --require-done -- ONB-22's own gate -- a deferred or
// not_needed lane must still fail: skipping it here would let the engine accept the final
// execute/cutover/verify node on a workspace that never finished onboarding at all.
const skip = laneExempt && hasDeferralReason && !requireDone;

if (!skip && laneAbsent) {
  issues.push(
    issue(
      "error",
      "onboarding_graph.lane_missing",
      `${stateSourceFile} must include lanes.onboarding unless the lane is explicitly not_needed or deferred with a founder-approved reason.`,
      stateSourceFile,
    ),
  );
}

if (!skip && !artifact) {
  issues.push(
    issue(
      "error",
      "onboarding_graph.artifact_missing",
      "product/ONBOARDING.md is required as the canonical onboarding graph, evidence, journey, screen, control, analytics, and cutover contract.",
      "product/ONBOARDING.md",
    ),
  );
}

if (!skip && artifact) {
  const text = artifact.text ?? "";
  // Fence-stripped once, up front, and used for every structural check below (required
  // sections, node presence, required-phrase contracts, forbidden-event names, review-timing
  // regex) -- not only the deep --require-done completion block. hasHeading()/requirePhrases()
  // etc. have no notion of fences, so a required live section (or phrase, or node ID) deleted
  // from the live document and relocated into a fenced code example would otherwise still be
  // found and accepted as present.
  const liveText = stripNonRenderedMarkdown(text);
  const relativePath = artifact.relativePath;
  const applicability = loadOnboardingApplicability(args.root);
  const designApplicability = loadDesignSurfaceApplicability(args.root);
  const requiredSections = [
    "Execution Mode",
    "Graph Run",
    "Source Map And Current-State Trace",
    "Evidence Ledger",
    "Competitor Review Matrix",
    "Onbo Hub Pattern Atlas",
    "Internal Guidance Audit",
    "Seven-Principle Activation Audit",
    "Provider Capability Matrix",
    "Platform Policy Matrix",
    "Motion Research",
    "Evidence Decision And Complaint Traceability",
    "First Value And Activation",
    "Effort-Before-Value Ledger",
    "Question Usefulness Matrix",
    "Canonical State Model",
    "Architecture Decision",
    "Journey Graph",
    ...(applicability.commitmentFunnel === "selected" ? ["Commitment Funnel", "Funnel Quality Metrics"] : []),
    "Screen Inventory",
    "Control And Action Contract",
    "Paywall Contract",
    ...(applicability.headlineBind === "selected" ? ["Paywall Goal Headline"] : []),
    "Review Request Contract",
    "Analytics Contract",
    "Experimentation",
    "Permissions And Lifecycle",
    "Failure And Recovery",
    "Accessibility And Localization",
    "Privacy And Security",
    "Performance And Observability",
    "Prototype And Design Proof",
    "Synthetic One-Star Pre-Mortem",
    "Compound Engineering Implementation Plan",
    "Target Runtime Cutover",
    "Verification",
  ];
  if (applicability.commitmentFunnel === "unresolved") {
    issues.push(
      issue(
        "error",
        "onboarding_graph.commitment_funnel_unresolved",
        `${relativePath} cannot treat the Commitment Funnel as free, skipped, or selected until product.yaml records feature.commitment-funnel with slot.feature.scope required, excluded, or non-goal.`,
        "product.yaml",
      ),
    );
  }
  if (applicability.headlineBind === "unresolved") {
    issues.push(
      issue(
        "error",
        "onboarding_graph.paywall_goal_headline_unresolved",
        `${relativePath} cannot treat the Paywall Goal Headline bind as free, skipped, or selected until product.yaml records feature.paywall-goal-headline with slot.feature.scope required, excluded, or non-goal, and a parseable b2c.yaml declares the present-paywall owner. Absence of either is not a free or no-billing default.`,
        "product.yaml",
      ),
    );
  }
  if (applicability.headlineBind === "unavailable") {
    issues.push(
      issue(
        "error",
        "onboarding_graph.paywall_goal_headline_unavailable",
        `${relativePath} selected feature.paywall-goal-headline, but the declared present-paywall owner cannot bind RevenueCat offering metadata or customVariables. Do not invent that bind for an unselected presenter.`,
        relativePath,
      ),
    );
  }
  if (designApplicability.interactionUnresolved) {
    issues.push(
      issue(
        "error",
        "onboarding_graph.surface_interaction_unresolved",
        `${relativePath} cannot treat motion, scrollytelling, or conversion techniques as free, skipped, or selected until every listed studio/seed/business.json surface records interaction as static-document, conversion, scroll-linked, standard-transition, or bespoke-motion. Do not infer the class from purpose prose.`,
        "studio/seed/business.json",
      ),
    );
  }
  if (designApplicability.sixtyFpsRegister === "unresolved") {
    issues.push(
      issue(
        "error",
        "onboarding_graph.motion_reference_unresolved",
        `${relativePath} cannot treat 60fps motion research as free, skipped, or selected until studio interaction (or implemented scroll-linked behavior) is classified and strategy/TOOL_DECISIONS.md records 60fps MCP access. Absence is not a free distilled-recipe default.`,
        "strategy/TOOL_DECISIONS.md",
      ),
    );
  }
  if (designApplicability.sixtyFpsRegister === "unavailable") {
    issues.push(
      issue(
        "error",
        "onboarding_graph.motion_reference_unavailable",
        `${relativePath} selected bespoke-motion or scroll-linked research, but strategy/TOOL_DECISIONS.md records the 60fps MCP as blocked, unavailable, or fallback. Hold with the current selection. Do not claim a distilled recipe is equivalent and do not spend.`,
        relativePath,
      ),
    );
  }

  for (const section of requiredSections) {
    if (!hasHeading(liveText, section)) {
      issues.push(
        issue("error", `onboarding_graph.section_${codeFor(section)}_missing`, `${relativePath} must include a "## ${section}" section.`, relativePath),
      );
    }
  }

  for (let index = 0; index <= 22; index += 1) {
    const node = `ONB-${String(index).padStart(2, "0")}`;
    if (!liveText.includes(node)) {
      issues.push(
        issue(
          "error",
          "onboarding_graph.node_missing",
          `${relativePath} must include graph node ${node}; the nested onboarding graph runs ONB-00 through ONB-22.`,
          relativePath,
        ),
      );
    }
  }

  requirePhrases(
    issues,
    relativePath,
    liveText,
    "onboarding_graph.evidence_contract",
    ["authorized Onbo Hub", "Do not scrape", "positive", "root-cause", "RevenueCat", "technically possible", "policy permitted", "seven-principle"],
    "The evidence contract must cover authorized Onbo Hub research, review controls, provider capabilities, policy distinctions, and the seven-principle audit.",
  );
  if (designApplicability.sixtyFpsRegister === "selected") {
    requirePhrases(
      issues,
      relativePath,
      liveText,
      "onboarding_graph.motion_reference",
      ["60fps MCP", "search_shots", "get_motion_breakdown"],
      "When 60fps motion research is selected and available, the evidence contract must name the 60fps MCP and its shot operations.",
    );
  }

  requirePhrases(
    issues,
    relativePath,
    liveText,
    "onboarding_graph.activation_contract",
    ["First value rendered", "First value engaged", "Activation", "Effort-Before-Value", "personalization proof", "populated normal product"],
    "The artifact must distinguish first value, engagement, activation, effort, visible personalization proof, and entry into a populated product experience.",
  );

  requirePhrases(
    issues,
    relativePath,
    liveText,
    "onboarding_graph.design_contract",
    ["ONB-SCR-001", "ONB-CTL-001", "Every screen has one dominant", "Actual high-fidelity", "interactive", "reduced motion"],
    "The artifact must carry stable screen and control IDs, one dominant action, actual visual and interactive design requirements, and reduced-motion behavior.",
  );

  requirePhrases(
    issues,
    relativePath,
    liveText,
    "onboarding_graph.analytics_contract",
    [
      "machine-readable schema",
      "typed clients",
      "event_id",
      "Authoritative emitter",
      "identity stitching",
      "Deduplication",
      "Experiment",
      "Expected Event Sequences",
      "provider-confirmed",
    ],
    "Analytics must be a typed cross-surface contract with authoritative emitters, identity stitching, deduplication, exposure semantics, expected sequences, and provider-confirmed revenue.",
  );

  requirePhrases(
    issues,
    relativePath,
    liveText,
    "onboarding_graph.review_contract",
    [
      "outside first-run onboarding",
      "Native platform API only",
      "Sentiment gate",
      "Custom rating UI",
      "review_eligibility_earned",
      "review_request_attempted",
      "remote kill switch",
    ],
    "Review eligibility may be earned early, but the request must be native, outside first-run onboarding, ungated by sentiment, observable, and remotely suppressible.",
  );

  for (const forbiddenEvent of ["review_prompt_shown", "review_submitted", "review_rating_value"]) {
    if (liveText.includes(forbiddenEvent)) {
      issues.push(
        issue(
          "error",
          "onboarding_graph.review_unobservable_event",
          `${relativePath} names ${forbiddenEvent}, which claims a platform outcome the app cannot reliably observe. Record eligibility, suppression, API attempt, and API return only.`,
          relativePath,
        ),
      );
    }
  }

  const reviewInsideFirstRun =
    /native (?:app )?review (?:prompt|request) immediately after first value inside first-run onboarding/i.test(liveText) ||
    /immediately after first value inside first-run onboarding.{0,80}(?:review|rating)/i.test(liveText);
  if (reviewInsideFirstRun) {
    issues.push(
      issue(
        "error",
        "onboarding_graph.review_inside_first_run",
        `${relativePath} directs a review request immediately after first value inside onboarding. Earn eligibility there if appropriate, finish onboarding, and request at a later natural success.`,
        relativePath,
      ),
    );
  }

  requirePhrases(
    issues,
    relativePath,
    liveText,
    "onboarding_graph.replacement_contract",
    [
      "hard cutover",
      "durable user value",
      "one-time",
      "Removal Inventory",
      "minimum supported client",
      "Do not keep the old runtime",
      "only the target runtime",
    ],
    "Replacement mode must preserve durable user value through an isolated one-time transformation while hard-cutting to one runtime and deleting replaced architecture.",
  );

  requirePhrases(
    issues,
    relativePath,
    liveText,
    "onboarding_graph.reliability_contract",
    ["Purchase pending", "Restore", "deep link", "identity", "Analytics failure does not block first value", "unsupported client", "observability"],
    "The artifact must cover purchase, restore, handoff, identity, nonblocking analytics, unsupported-client, and observability behavior.",
  );

  if (applicability.commitmentFunnel === "selected") {
    requirePhrases(
      issues,
      relativePath,
      liveText,
      "onboarding_graph.commitment_funnel",
      ["welcome", "quiz", "micro-commitment", "personalized insight", "hard paywall", "skip path"],
      "The Commitment Funnel must name welcome, quiz or goals, micro-commitment, personalized insight, and hard paywall, with a skip path on the commitment step.",
    );

    requirePhrases(
      issues,
      relativePath,
      liveText,
      "onboarding_graph.funnel_quality",
      ["onboarding complete", "install-to-trial", "trial-to-paid", "drop-off", "refund rate"],
      "Funnel Quality Metrics must include onboarding complete, install-to-trial, trial-to-paid, per-step drop-off, and refund rate. Trial starts alone cannot mark the lane done.",
    );
  }

  const paywallGoalHeadline = extractSection(liveText, "Paywall Goal Headline");
  if (paywallGoalHeadline && applicability.headlineBind === "selected") {
    requirePhrases(
      issues,
      relativePath,
      paywallGoalHeadline,
      "onboarding_graph.paywall_goal_headline",
      ["paywall_headline_key", "fallback", "RevenueCat", "offering metadata", "customVariables"],
      "The Paywall Goal Headline must bind paywall_headline_key through RevenueCat offering metadata and customVariables, with a fallback when the goal is skipped.",
    );
    if (!paywallGoalHeadlineTableComplete(paywallGoalHeadline)) {
      issues.push(
        issue(
          "error",
          "onboarding_graph.paywall_goal_headline_table",
          `${relativePath} Paywall Goal Headline must include a table with Goal key, Headline template, and Fallback columns and at least one goal row.`,
          relativePath,
        ),
      );
    }
  }
  if (
    paywallGoalHeadline &&
    (/\binvented (goal|outcome) is (ok|fine|allowed)\b/i.test(paywallGoalHeadline) ||
      /\ballow(?:s|ed)? invented (goals?|outcomes?)\b/i.test(paywallGoalHeadline))
  ) {
    issues.push(
      issue(
        "error",
        "onboarding_graph.paywall_goal_headline_invented",
        `${relativePath} allows an invented goal or outcome on the paywall. Interpolate only the selected key. A skip uses the fallback template.`,
        relativePath,
      ),
    );
  }

  // requireDone forces the strict block below to run unconditionally, independent of
  // lanes.onboarding.status: no production path ever commits that field to "done"/"succeeded" as
  // a *result* of ONB-22's gate passing (kernel/engine/runstate.ts's reconcilePatch()/
  // acceptVerification() only mutate run-state.json, never business-state.json), and pre-setting
  // it beforehand instead makes seedRunState() pre-accept the entire onboarding graph -- including
  // ONB-22 -- without ever running this gate for real. Requiring the field to already say "done"
  // as its own precondition is therefore a deadlock the durable engine can never clear on a
  // genuine run. The artifact-content checks below (Graph Run table, placeholders, prose
  // directives, artifact Status header, Verification checklist) are the real proof of completion
  // and are sufficient on their own; they still reject the shipped, unstarted template exactly as
  // before (its Graph Run rows all read not_started, tripping onboarding_graph.placeholder_complete
  // and onboarding_graph.node_not_done for every node), so removing this precondition does not
  // weaken the gate against an incomplete launch.
  if (requireDone || laneStatus === "succeeded") {
    const genericPlaceholders = [/\bnot_started\b/i, /\bTODO\b/i, /\bTBD\b/i];
    const placeholderCells = tablePlaceholderCells(liveText);
    const placeholderProseLines = proseDirectiveLines(liveText);

    if (genericPlaceholders.some((pattern) => pattern.test(liveText)) || placeholderCells.length > 0 || placeholderProseLines.length > 0) {
      issues.push(
        issue(
          "error",
          "onboarding_graph.placeholder_complete",
          `${relativePath} cannot support lanes.onboarding.status=done while template directives, generic completion labels, or not_started graph nodes remain.`,
          relativePath,
        ),
      );
    }

    const headerStatus = artifactStatus(liveText);
    if (headerStatus !== "done") {
      issues.push(
        issue(
          "error",
          "onboarding_graph.artifact_status_not_done",
          `${relativePath} claims the onboarding lane is done but its own "Status: \`${headerStatus ?? "(missing)"}\`" header does not say done.`,
          relativePath,
        ),
      );
    }

    for (let index = 0; index <= 22; index += 1) {
      const node = `ONB-${String(index).padStart(2, "0")}`;
      // Reads liveText (fence-stripped), not text -- otherwise a fenced code sample containing
      // its own fake "## Graph Run" heading and 23 done rows would be parsed as the canonical
      // run record by sectionBody()/graphRunRows(), letting ONB-22's destructive gate pass while
      // the real, live Graph Run table stays incomplete.
      const status = graphRunNodeStatus(liveText, node);
      if (status === "duplicate") {
        issues.push(
          issue(
            "error",
            "onboarding_graph.node_duplicate_row",
            `${relativePath} claims the onboarding lane is done but graph node ${node} has more than one row in the Graph Run table; a resumed or merged run must leave exactly one row per node instead of retaining conflicting rows.`,
            relativePath,
          ),
        );
      } else if (status !== "done") {
        issues.push(
          issue(
            "error",
            "onboarding_graph.node_not_done",
            `${relativePath} claims the onboarding lane is done but graph node ${node} is not recorded as done in the Graph Run table.`,
            relativePath,
          ),
        );
      }
    }

    const verificationSection = sectionBody(liveText, "Verification");
    // countUncheckedItems() alone only catches an item left as "- [ ]"; it reads 0 just as
    // happily when every item was deleted outright instead of checked off. Require the section
    // to still carry at least the shipped template's own checklist item count (checked or not) so
    // a shortened/emptied Verification section cannot pass by having nothing left to be unchecked.
    const verificationItemCount = countChecklistItems(verificationSection);
    if (verificationItemCount < EXPECTED_VERIFICATION_ITEM_COUNT) {
      issues.push(
        issue(
          "error",
          "onboarding_graph.verification_items_missing",
          `${relativePath} claims the onboarding lane is done but its Verification section has only ${verificationItemCount} checklist item(s); the canonical checklist requires ${EXPECTED_VERIFICATION_ITEM_COUNT}.`,
          relativePath,
        ),
      );
    }

    requireUniqueCheckedFingerprints(
      issues,
      relativePath,
      verificationSection,
      "onboarding_graph.verification_assertion_missing",
      VERIFICATION_ITEM_FINGERPRINTS,
    );

    const uncheckedVerificationItems = countUncheckedItems(verificationSection);
    if (uncheckedVerificationItems > 0) {
      issues.push(
        issue(
          "error",
          "onboarding_graph.verification_incomplete",
          `${relativePath} claims the onboarding lane is done but its Verification section still has ${uncheckedVerificationItems} unchecked item(s).`,
          relativePath,
        ),
      );
    }
  }
}

reportAndExit("Onboarding system graph check", issues);

function hasHeading(text: string, heading: string): boolean {
  return text.split(/\r?\n/).some((line) => line.trim() === `## ${heading}`);
}

/** Returns the line range right after a "## {heading}" line, up to (not including) the next "## " heading or the end of the artifact. */
function sectionBody(text: string, heading: string): string {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (startIndex === -1) return "";
  const rest = lines.slice(startIndex + 1);
  const endIndex = rest.findIndex((line) => /^##\s/.test(line.trim()));
  return (endIndex === -1 ? rest : rest.slice(0, endIndex)).join("\n");
}

function isTableSeparatorRow(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line);
}

// Reads every row's node and status from the Graph Run table's own Node and Status columns
// (located by the header row), not from any other cell -- an owner/result cell that happens to
// mention "done" in prose must not be mistaken for the node's actual recorded status.
function graphRunRows(text: string): Array<{ node: string; status: string }> {
  const tableLines = sectionBody(text, "Graph Run")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  const headerLine = tableLines[0];
  if (!headerLine) return [];
  const header = headerLine.split("|").map((cell) => cell.trim().toLowerCase());
  const nodeIndex = header.indexOf("node");
  const statusIndex = header.indexOf("status");
  if (nodeIndex === -1 || statusIndex === -1) return [];

  return tableLines
    .slice(1)
    .filter((line) => !isTableSeparatorRow(line))
    .map((line) => {
      const cells = line.split("|").map((cell) => cell.trim());
      return { node: cells[nodeIndex] ?? "", status: cells[statusIndex] ?? "" };
    });
}

// A resumed or merged run must retain exactly one Graph Run row per node. If it retains a stale
// row (e.g. `partial`) alongside an appended row (e.g. `done`) for the same node, that conflict
// has to be surfaced and fixed in the artifact itself -- this must not silently resolve it by
// accepting the node because *some* row says done.
function graphRunNodeStatus(text: string, node: string): "done" | "not_done" | "duplicate" {
  const rows = graphRunRows(text).filter((row) => row.node === `\`${node}\``);
  if (rows.length > 1) return "duplicate";
  if (rows.length === 0) return "not_done";
  return rows[0]?.status === "done" ? "done" : "not_done";
}

function countUncheckedItems(section: string): number {
  return (section.match(/^-\s*\[\s*\]/gm) ?? []).length;
}

function countChecklistItems(section: string): number {
  return (section.match(/^-\s*\[[ xX]\]/gm) ?? []).length;
}

/** Text of every checked ("- [x]" / "- [X]") checklist line, in document order. */
function checkedItemTexts(section: string): string[] {
  return [...section.matchAll(/^-\s*\[[xX]\]\s*(.*)$/gm)].map((match) => match[1] ?? "");
}

/**
 * Verifies each canonical fingerprint is still carried by its own distinct checked checklist
 * line, not merely present anywhere in the section's raw text. A plain requirePhrases() substring
 * search over the whole section passes even when a canonical item's checked line was deleted
 * outright and its distinguishing text left behind as ordinary (unchecked or non-list) prose
 * elsewhere -- with a different checked line duplicated to keep the total count at eleven, the
 * item count, unchecked count, and phrase-presence checks all stay green while the checklist no
 * longer actually asserts that item. Matching against a pool of checked lines, each consumable at
 * most once, closes that gap without letting one physical line satisfy two fingerprints either.
 */
function requireUniqueCheckedFingerprints(target: Issue[], relativePath: string, section: string, code: string, fingerprints: string[]): void {
  const pool = checkedItemTexts(section);
  const consumed = new Array(pool.length).fill(false);
  for (const fingerprint of fingerprints) {
    const matchIndex = pool.findIndex((text, index) => !consumed[index] && text.includes(fingerprint));
    if (matchIndex === -1) {
      target.push(
        issue(
          "error",
          code,
          `${relativePath}'s Verification section has no distinct checked checklist item carrying "${fingerprint}". Every one of the eleven canonical assertions must be its own checked item, not merely present as text elsewhere in the section.`,
          relativePath,
        ),
      );
    } else {
      consumed[matchIndex] = true;
    }
  }
}

/** The artifact's own "Status: `word`" header, mirrored from tooling/lib/artifact-pages.ts's renderSourceArtifactPage. */
function artifactStatus(text: string): string | undefined {
  return text.match(/^Status:\s*`?([^`\n]+)`?/m)?.[1]?.trim();
}

// tablePlaceholderCells() only ever looked at table rows; the shipped template also opens
// several sections (Execution Mode, Source Map And Current-State Trace, First Value And
// Activation, ...) with an ordinary directive-verb-led paragraph rather than a table, and those
// were never checked -- a "done" artifact could authorize ONB-22's destructive cutover while
// its own execution mode, evidence trace, and activation contract were still literally the
// unfilled instruction text.
function proseDirectiveLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const flagged: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (trimmed.length === 0 || trimmed.startsWith("|") || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const firstWord = trimmed.match(/^[A-Za-z][A-Za-z-]*/)?.[0]?.toLowerCase();
    if (!firstWord || !TEMPLATE_DIRECTIVE_VERBS.has(firstWord)) continue;
    // A directive sentence is the fill-in surface only when nothing else in its own section
    // (down to the next heading) captures the answer. Analytics Contract's "Define a
    // machine-readable schema and typed clients..." sits directly above that contract's own
    // capture table and also carries onboarding_graph.analytics_contract's required doctrine
    // phrases verbatim -- flagging it would reject a genuinely complete artifact for preserving
    // canonical requirement language the table, not this sentence, is meant to answer.
    let hasTableInSection = false;
    for (let cursor = index + 1; cursor < lines.length && !(lines[cursor]?.trim().startsWith("#") ?? false); cursor += 1) {
      if (lines[cursor]?.trim().startsWith("|")) {
        hasTableInSection = true;
        break;
      }
    }
    if (!hasTableInSection) flagged.push(lines[index] ?? "");
  }
  return flagged;
}

function tablePlaceholderCells(text: string): string[] {
  const cells = text
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .flatMap((line) => line.split("|").slice(1, -1))
    .map((cell) => cell.trim().replaceAll("`", ""))
    .filter((cell) => cell.length > 0 && !/^:?-{3,}:?$/.test(cell));

  // Repetition signals still-templated content when the *whole cell* repeats verbatim (e.g.
  // every row left as "TBD"), or when the same boilerplate repeats with only an embedded number
  // varying (e.g. "Evidence-1: source-backed implementation detail dated 2026-08-08", "Evidence-
  // 2: ..." -- a counter making otherwise-identical filler technically "unique" is not content).
  // A normalized count (digits collapsed to "#") catches the counter case without rejecting
  // legitimately distinct rows, whose differing words survive normalization untouched.
  const cellTextCounts = new Map<string, number>();
  const normalizedCellCounts = new Map<string, number>();
  for (const cell of cells) {
    cellTextCounts.set(cell, (cellTextCounts.get(cell) ?? 0) + 1);
    const normalized = normalizeForRepetition(cell);
    normalizedCellCounts.set(normalized, (normalizedCellCounts.get(normalized) ?? 0) + 1);
  }
  const repeatedThreshold = Math.max(8, Math.ceil(cells.length * 0.15));

  return cells.filter((cell) => {
    // "Yes"/"No"/"N/A"/"Pass"/"done"/etc. are legitimate prescribed terminal answers in the
    // template's own matrices (Effort-Before-Value, policy, Prototype And Design Proof, Graph
    // Run status) -- rejecting them as generic filler words would make a genuinely completed
    // artifact unable to pass without replacing truthful answers with artificial prose. Only
    // the literal word "placeholder" itself has no legitimate answer use.
    if (/^placeholder$/i.test(cell)) return true;
    const firstWord = cell.match(/^[A-Za-z][A-Za-z-]*/)?.[0]?.toLowerCase();
    if (firstWord && TEMPLATE_DIRECTIVE_VERBS.has(firstWord)) return true;
    if ((cellTextCounts.get(cell) ?? 0) >= repeatedThreshold) return true;
    return (normalizedCellCounts.get(normalizeForRepetition(cell)) ?? 0) >= repeatedThreshold;
  });
}

function normalizeForRepetition(cell: string): string {
  return cell.replace(/\d+/g, "#");
}

function paywallGoalHeadlineTableComplete(section: string): boolean {
  const tableLines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  const headerLine = tableLines[0];
  if (!headerLine) return false;
  const header = headerLine.split("|").map((cell) => cell.trim().toLowerCase());
  const goalIndex = header.findIndex((cell) => cell === "goal key" || cell === "goal");
  const templateIndex = header.findIndex((cell) => cell === "headline template" || cell === "template");
  const fallbackIndex = header.findIndex((cell) => cell.includes("fallback"));
  if (goalIndex === -1 || templateIndex === -1 || fallbackIndex === -1) return false;
  return tableLines.slice(1).some((line) => {
    if (isTableSeparatorRow(line)) return false;
    const cells = line.split("|").map((cell) => cell.trim());
    return Boolean(cells[goalIndex] && cells[templateIndex] && cells[fallbackIndex]);
  });
}

function extractSection(text: string, heading: string): string | undefined {
  const pattern = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return undefined;
  const rest = text.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function requirePhrases(target: Issue[], relativePath: string, text: string, code: string, phrases: string[], message: string): void {
  const missing = phrases.filter((phrase) => !text.toLowerCase().includes(phrase.toLowerCase()));
  if (missing.length === 0) return;
  target.push(issue("error", code, `${message} Missing: ${missing.join(", ")}.`, relativePath));
}

function codeFor(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
