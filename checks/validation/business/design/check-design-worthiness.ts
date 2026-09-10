#!/usr/bin/env node
/**
 * check-design-worthiness.ts — mechanical visual floors plus the independent taste gate.
 *
 * knowledge/design/design-worthiness.md splits rules into Mechanical, Attested, and Taste.
 * This gate asserts Mechanical pass/fail, warns on Attested hierarchy until a row exists,
 * and requires a recorded taste decision at review-ready. A founder may decide directly in
 * DESIGN.md. Under the exact Founder opening mandate, the isolated design audit may decide in
 * its own current engine-bound artifact. The audit attempt identity must be engine-issued and
 * differ from every Design Room producer. This gate never grants release or publication authority.
 *
 * npm script: check:design-worthiness
 * Usage: tsx checks/validation/business/design/check-design-worthiness.ts --root /path/to/business [--mechanical-only]
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { parseDesignExploration } from "../../../../tooling/lib/design-exploration.js";
import { loadDesignSystem } from "../../../../tooling/lib/design-md.js";
import { rel } from "../../../../tooling/lib/design-state.js";
import {
  asString,
  collectFiles,
  getPath,
  isRecord,
  issue,
  loadProjectState,
  parseCliArgs,
  reportAndExit,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";
import { isEmptyEquivalentEvidenceValue } from "../../../../kernel/lib/empty-equivalent-evidence.js";
import { inspectRenderedH2Section, parseRenderedPipeTables } from "../../../../kernel/lib/required-table-section.js";
import { checkContrastMechanical, checkTokenScaleMechanical, checkUndeclaredProofColors } from "./lib/worthiness-mechanical.js";
import { isWorkerExecutionIdentity, loadRunState } from "../../../../kernel/engine/runstate.js";
import { workspaceArtifactFingerprint } from "../../../../kernel/engine/review-evidence.js";
import { validateExactDesignAuthorityEvaluation } from "../../../../kernel/engine/design-taste-authority.js";
import type { TrustedFounderDecisionKey } from "../../../../kernel/engine/founder-decision-receipt.js";
import type { AttemptRecordV2, DesignAuthorityEvaluation, RunStateDocument } from "../../../../kernel/schema/types.js";
import { isMainModule } from "../../../../tooling/lib/cli-entrypoint.js";

const AUTOMATION_IDENTITY = /\b(agent|codex|claude|gpt|assistant|bot|automation|autopilot|ai|cursor)\b/i;
const INSTRUCTION_OWNER = /\b(record|awaiting|template|placeholder|todo|tbd)\b/i;
const FOUNDER_OPENING_MANDATE = "Founder opening mandate";
const DESIGN_ROOM_NODE_ID = "run.design.design-room";
const DESIGN_AUDIT_NODE_ID = "run.design.design-system-audit";
const DESIGN_AUDIT_RELATIVE_PATH = "design/reviews/DESIGN_SYSTEM_REVIEW.md";

export interface DesignWorthinessValidationOptions {
  /** Skip taste authority checks while the Design Room is still producing the candidate. */
  readonly mechanicalOnly?: boolean;
  /** Programmatic trust seam for deterministic callers. The CLI never accepts this value. */
  readonly trustedFounderKey?: TrustedFounderDecisionKey;
  /** Preserve an explicitly selected reducer state file for programmatic validation. */
  readonly statePath?: string;
}

interface DesignWorthinessValidationContext {
  readonly root: string;
  readonly projectArgs: ReturnType<typeof parseCliArgs>;
  readonly mechanicalOnly: boolean;
  readonly trustedFounderKey?: TrustedFounderDecisionKey;
  readonly issues: Issue[];
  readonly contractPath: string;
  readonly auditPath: string;
  readonly authorityAuditPath: string;
  readonly businessPath: string;
  readonly proofsRoot: string;
}

/**
 * Validate one workspace and return structured issues without mutating process exit state.
 *
 * The explicit trusted key is intentionally an in-process dependency. The executable entrypoint
 * never parses a key flag or environment shortcut; production validation resolves the protected
 * external founder trust store through the receipt verifier.
 */
export function validateDesignWorthiness(root: string, options: DesignWorthinessValidationOptions = {}): Issue[] {
  const projectArgs = parseCliArgs(["--root", root, ...(options.statePath ? ["--state", options.statePath] : [])]);
  const context: DesignWorthinessValidationContext = {
    root: projectArgs.root,
    projectArgs,
    mechanicalOnly: options.mechanicalOnly ?? false,
    trustedFounderKey: options.trustedFounderKey,
    issues: [],
    contractPath: path.join(projectArgs.root, "DESIGN.md"),
    auditPath: path.join(projectArgs.root, DESIGN_AUDIT_RELATIVE_PATH),
    authorityAuditPath: path.join(projectArgs.root, "control", "audit.jsonl"),
    businessPath: path.join(projectArgs.root, "studio/seed/business.json"),
    proofsRoot: path.join(projectArgs.root, "design/proofs"),
  };
  validateDesignWorthinessContext(context);
  return context.issues;
}

function validateDesignWorthinessContext(context: DesignWorthinessValidationContext): void {
  const { root, mechanicalOnly, issues, contractPath, auditPath, businessPath, proofsRoot } = context;
  const business = readJsonObject(businessPath);
  const design = loadDesignSystem(root);
  issues.push(...design.issues);
  const tokens = design.tokens;
  const designRoom = business && isRecord(business.designRoom) ? business.designRoom : {};
  const designRoomStatus = asString(designRoom.status) ?? "";
  const reviewReady = designRoomStatus === "rendered";
  const designLaneDone = isDesignLaneDone(context);
  const tasteRequired = reviewReady || designLaneDone;

  issues.push(...checkContrastMechanical(tokens));
  issues.push(...checkTokenScaleMechanical(root, tokens, proofsRoot));
  issues.push(...checkUndeclaredProofColors(root, tokens, proofsRoot));
  issues.push(...parseDesignExploration(design.frontmatter, tasteRequired).issues);

  if (existsSync(contractPath)) {
    const contract = readFileSync(contractPath, "utf8");
    const worthinessView = inspectRenderedH2Section(contract, "Design Worthiness");
    const hierarchyAttested = worthinessView.ok && hasHierarchyAttestation(worthinessView.section.renderedBody);

    if (worthinessView.ok) {
      reportUnsupported(context, worthinessView.section.unsupported, "Design Worthiness");
    } else if (tasteRequired) {
      issues.push(
        issue(
          "error",
          "worthiness.scorecard_missing",
          "A review-ready or design-done business needs a Design Worthiness scorecard in DESIGN.md.",
          rel(root, contractPath),
        ),
      );
    }

    const nativePlatforms = selectedNativePlatforms(business);
    const hasNativeFlows = studioHasNativeFlows(business);
    if (
      tasteRequired &&
      nativePlatforms.length > 0 &&
      hasNativeFlows &&
      !(worthinessView.ok && hasNativeFlowAttestation(worthinessView.section.renderedBody))
    ) {
      issues.push(
        issue(
          "error",
          "worthiness.native_flow_semantics_missing",
          `Selected native platform(s) ${nativePlatforms.join(", ")} need a Design Worthiness row for Native flow semantics that records presentation, return, and back behavior. A web-only surface does not invent native Back.`,
          rel(root, contractPath),
        ),
      );
    }

    if (existsSync(proofsRoot) && !hierarchyAttested) {
      for (const filePath of collectFiles(proofsRoot, new Set([".html"]))) {
        const source = readFileSync(filePath, "utf8");
        const headingCount = countTags(source, "h1");
        const primaryCount = countPrimaryEmphasis(source);
        if (headingCount >= 2 || primaryCount >= 2) {
          issues.push(
            issue(
              "warning",
              "worthiness.hierarchy_competing_primaries",
              `${rel(root, filePath)} has competing primary emphasis (${headingCount} h1, ${primaryCount} primary actions). Record a hierarchy attestation row in Design Worthiness.`,
              rel(root, filePath),
            ),
          );
        }
      }
    }

    if (tasteRequired && !mechanicalOnly) {
      const direct = inspectDirectTasteDecision(context, contract);
      const delegated = inspectDelegatedTasteDecision(context, direct.verdict === "pass");
      const delegationActive = hasCurrentDesignTasteDelegation(context);
      // The exact signed founder decision is the local taste authority. Independent Findings
      // remain conjunctive: a founder pass cannot erase an unresolved major/high/blocker finding.
      if (direct.verdict === "fail") {
        reportTasteRejection(context, contractPath);
      } else if (delegated.blockingFindings) {
        reportTasteRejection(context, auditPath);
      } else if (direct.verdict === "pass" && !delegated.evidenceValid) {
        issues.push(
          issue(
            "error",
            "worthiness.taste_gate_review_evidence",
            `A direct founder Taste decision supplies authority, but the design audit must still produce current independent Findings bound to the exact design candidate and frozen rubric in ${DESIGN_AUDIT_RELATIVE_PATH}.`,
            rel(root, auditPath),
          ),
        );
      } else if (direct.verdict === "pass") {
        // A current direct founder pass overrides an audit's taste-only verdict after the
        // independent Findings have cleared the non-negotiable severity floor above.
      } else if (delegated.verdict === "fail") {
        reportTasteRejection(context, auditPath);
      } else if (direct.verdict !== "pass" && delegated.verdict !== "pass") {
        const problem = delegationActive
          ? delegated.problem
          : direct.problem === "agent"
            ? "agent"
            : direct.problem === "authority_evidence"
              ? "authority_evidence"
              : delegated.problem;
        issues.push(
          issue(
            "error",
            problem === "agent"
              ? "worthiness.taste_gate_agent"
              : problem === "authority_evidence"
                ? "worthiness.taste_gate_authority_evidence"
                : problem === "delegation_authority"
                  ? "worthiness.taste_gate_delegation_authority"
                  : problem === "review_evidence"
                    ? "worthiness.taste_gate_review_evidence"
                    : "worthiness.taste_gate_incomplete",
            problem === "agent"
              ? `An agent cannot authorize taste from DESIGN.md. Under "${FOUNDER_OPENING_MANDATE}", the current independent design-system audit must record the structured decision in ${DESIGN_AUDIT_RELATIVE_PATH}.`
              : problem === "authority_evidence"
                ? "A direct founder/owner Taste Gate row needs a signed founder-decision receipt for these exact DESIGN.md bytes. Record it with b2c approve --workspace <path> --design-taste pass|fail --session <founder-session> --founder-receipt-file <path>."
                : problem === "delegation_authority"
                  ? "This audit has no current founder delegation for local design and taste decisions. Record that explicit choice through the founder decision edge, or record a candidate-bound direct founder/owner decision."
                  : problem === "review_evidence"
                    ? `A delegated Taste Gate decision needs a structured, current, engine-bound ${DESIGN_AUDIT_RELATIVE_PATH} produced by an engine-issued audit identity that differs from every Design Room producer.`
                    : `Taste Gate needs either a complete founder/owner decision in DESIGN.md with a current founder-decision receipt, or a structured independent decision in ${DESIGN_AUDIT_RELATIVE_PATH} under the exact ${FOUNDER_OPENING_MANDATE}.`,
            problem === "review_evidence" || problem === "delegation_authority" ? rel(root, auditPath) : rel(root, contractPath),
          ),
        );
      }
    }
  } else if (tasteRequired && !mechanicalOnly) {
    issues.push(
      issue("error", "worthiness.contract_missing", "DESIGN.md is required before a review-ready Design Room or a done design lane.", rel(root, contractPath)),
    );
  }
}

function reportUnsupported(
  context: DesignWorthinessValidationContext,
  unsupported: readonly { sourceLine: number; description: string }[],
  section: string,
  sourcePath: string = context.contractPath,
): void {
  for (const item of unsupported) {
    context.issues.push(
      issue(
        "error",
        "worthiness.unsupported_markdown",
        `${section} uses ${item.description} on line ${item.sourceLine}. Strict evidence Markdown does not allow hidden tables.`,
        rel(context.root, sourcePath),
      ),
    );
  }
}

function selectedNativePlatforms(business: Record<string, unknown> | undefined): string[] {
  const mobileApp = studioMobileApp(business);
  const platforms = mobileApp && Array.isArray(mobileApp.platforms) ? mobileApp.platforms.filter((entry): entry is string => typeof entry === "string") : [];
  return platforms.filter((platform) => platform === "ios" || platform === "android");
}

function studioHasNativeFlows(business: Record<string, unknown> | undefined): boolean {
  const mobileApp = studioMobileApp(business);
  if (!mobileApp) return false;
  const screens = Array.isArray(mobileApp.screens) ? mobileApp.screens : [];
  const flows = Array.isArray(mobileApp.flows) ? mobileApp.flows : [];
  return screens.length > 0 || flows.length > 0;
}

function studioMobileApp(business: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const surfaces = business && isRecord(business.surfaces) ? business.surfaces : undefined;
  return surfaces && isRecord(surfaces.mobileApp) ? surfaces.mobileApp : undefined;
}

function hasNativeFlowAttestation(renderedBody: string): boolean {
  const tables = parseRenderedPipeTables(renderedBody);
  for (const table of tables) {
    const ruleIndex = headerIndex(table.headers, "Rule");
    const attestationIndex = headerIndex(table.headers, "Attestation");
    if (ruleIndex < 0 || attestationIndex < 0) continue;
    for (const row of table.rows) {
      const rule = row[ruleIndex] ?? "";
      const attestation = row[attestationIndex] ?? "";
      if (!/\bnative flow\b/i.test(rule)) continue;
      const mentionsPresentation = /\b(presentation|navigation|sheet|stack|modal)\b/i.test(attestation);
      const mentionsReturn = /\breturn\b/i.test(attestation);
      const mentionsBack = /\bback\b/i.test(attestation);
      if (mentionsPresentation && mentionsReturn && mentionsBack && isSubstantiveTasteAnswer(attestation)) return true;
    }
  }
  return false;
}

function hasHierarchyAttestation(renderedBody: string): boolean {
  const tables = parseRenderedPipeTables(renderedBody);
  for (const table of tables) {
    const ruleIndex = headerIndex(table.headers, "Rule");
    const attestationIndex = headerIndex(table.headers, "Attestation");
    if (ruleIndex < 0 || attestationIndex < 0) continue;
    for (const row of table.rows) {
      const rule = row[ruleIndex] ?? "";
      const attestation = row[attestationIndex] ?? "";
      if (/\bhierarchy\b/i.test(rule) && isSubstantiveTasteAnswer(attestation)) return true;
    }
  }
  return false;
}

function hasHeaders(headers: readonly string[], required: readonly string[]): boolean {
  return required.every((header) => headers.includes(header.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")));
}

function hasAnyHeader(headers: readonly string[], candidates: readonly string[]): boolean {
  return candidates.some((candidate) => headerIndex(headers, candidate) >= 0);
}

function firstHeaderIndex(headers: readonly string[], candidates: readonly string[]): number {
  return candidates.map((candidate) => headerIndex(headers, candidate)).find((index) => index >= 0) ?? -1;
}

function headerIndex(headers: readonly string[], name: string): number {
  return headers.indexOf(name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"));
}

function isSubstantiveTasteAnswer(value: string): boolean {
  if (isEmptyEquivalentEvidenceValue(value)) return false;
  if (INSTRUCTION_OWNER.test(value)) return false;
  return value.trim().replace(/\s+/g, " ").length >= 24;
}

type TasteVerdict = "pass" | "fail";
type TasteProblem = "missing" | "incomplete" | "agent" | "authority_evidence" | "delegation_authority" | "review_evidence";

interface TasteDecisionInspection {
  verdict?: TasteVerdict;
  problem: TasteProblem;
  evidenceValid?: boolean;
  blockingFindings?: boolean;
}

function inspectDirectTasteDecision(context: DesignWorthinessValidationContext, contract: string): TasteDecisionInspection {
  const view = inspectRenderedH2Section(contract, "Taste Gate");
  if (!view.ok) return { problem: "missing" };
  reportUnsupported(context, view.section.unsupported, "Taste Gate");
  if (view.section.unsupported.length > 0) return { problem: "incomplete" };
  const tables = parseRenderedPipeTables(view.section.renderedBody);
  const table = tables.find(
    (candidate) =>
      hasAnyHeader(candidate.headers, ["Reviewer", "Owner"]) &&
      hasHeaders(candidate.headers, ["Date", "Surfaces reviewed", "One-product stranger test", "Copy-test", "Verdict"]),
  );
  if (!table || table.rows.length === 0) {
    return { problem: "incomplete" };
  }
  const reviewerIndex = firstHeaderIndex(table.headers, ["Reviewer", "Owner"]);
  const authorityIndex = headerIndex(table.headers, "Decision authority");
  const dateIndex = headerIndex(table.headers, "Date");
  const surfacesIndex = headerIndex(table.headers, "Surfaces reviewed");
  const strangerIndex = headerIndex(table.headers, "One-product stranger test");
  const copyIndex = headerIndex(table.headers, "Copy-test");
  const verdictIndex = headerIndex(table.headers, "Verdict");
  const projectOwner = projectOwnerName(context);
  const completeRows = table.rows.filter((row) => {
    const authority = authorityIndex >= 0 ? (row[authorityIndex] ?? "") : "";
    return (
      isAuthorizedDirectTasteReviewer(row[reviewerIndex] ?? "", projectOwner, authority) &&
      isValidPastIsoDate((row[dateIndex] ?? "").trim()) &&
      isSubstantiveTasteAnswer(row[surfacesIndex] ?? "") &&
      isSubstantiveTasteAnswer(row[strangerIndex] ?? "") &&
      isSubstantiveTasteAnswer(row[copyIndex] ?? "") &&
      /^(?:pass|fail)$/i.test((row[verdictIndex] ?? "").trim())
    );
  });
  const latest = completeRows.at(-1);
  if (latest) {
    const verdict = (latest[verdictIndex] ?? "").trim().toLowerCase() as TasteVerdict;
    return currentDirectTasteAuthorityVerdict(context) === verdict ? { verdict, problem: "incomplete" } : { problem: "authority_evidence" };
  }
  const agentRow = table.rows.some(
    (row) => AUTOMATION_IDENTITY.test(row[reviewerIndex] ?? "") || (authorityIndex >= 0 && (row[authorityIndex] ?? "").trim() === FOUNDER_OPENING_MANDATE),
  );
  return { problem: agentRow ? "agent" : "incomplete" };
}

/**
 * Direct authority must be the signed decision captured on this exact current audit attempt.
 * A session id, Markdown row, or mutable live approval is never founder authentication.
 */
function currentDirectTasteAuthorityVerdict(context: DesignWorthinessValidationContext): TasteVerdict | undefined {
  const evaluation = currentIndependentAuditContext(context, context.auditPath)?.authority;
  return evaluation?.direct?.verdict;
}

function isAuthorizedDirectTasteReviewer(value: string, projectOwner: string, authority: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || isEmptyEquivalentEvidenceValue(trimmed)) return false;
  if (INSTRUCTION_OWNER.test(trimmed)) return false;
  if (authority.trim() === FOUNDER_OPENING_MANDATE) return false;
  if (AUTOMATION_IDENTITY.test(trimmed)) return false;
  if (/^founder or team$/i.test(trimmed)) return false;
  if (/\b(founder|owner)\b/i.test(trimmed)) return true;
  return projectOwner.length > 2 && projectOwner.toLowerCase() !== "founder or team" && trimmed.toLowerCase().includes(projectOwner.toLowerCase());
}

function inspectDelegatedTasteDecision(context: DesignWorthinessValidationContext, hasDirectPass: boolean): TasteDecisionInspection {
  const { root, auditPath } = context;
  if (!existsSync(auditPath)) return { problem: existsSync(path.join(root, "run", "run-state.json")) ? "review_evidence" : "missing" };
  try {
    if (!lstatSync(auditPath).isFile()) return { problem: "review_evidence" };
    const realRoot = realpathSync(root);
    const realEvidence = realpathSync(auditPath);
    if (realEvidence !== realRoot && !realEvidence.startsWith(`${realRoot}${path.sep}`)) return { problem: "review_evidence" };
    const auditContext = currentIndependentAuditContext(context, auditPath);
    if (!auditContext) return { problem: "review_evidence" };
    const candidateInputFingerprint = auditContext.inputFingerprint;
    const delegationActive = auditContext.authority.source === "dispatch" && auditContext.authority.delegation.status === "approved";
    const review = readFileSync(auditPath, "utf8");
    const decisionView = inspectRenderedH2Section(review, "Delegated Taste Decision");
    const findingsView = inspectRenderedH2Section(review, "Findings");
    if (!findingsView.ok) return { problem: "review_evidence" };
    reportUnsupported(context, findingsView.section.unsupported, "Findings", auditPath);
    if (findingsView.section.unsupported.length > 0) return { problem: "review_evidence" };
    const findingsBody = findingsView.section.renderedBody.trim();
    const findings = findingsBody.replace(/\s+/g, " ");
    const findingsComplete =
      findings.length >= 40 &&
      hasConcreteFrozenRubric(context, findingsBody) &&
      hasExactCandidateInputFingerprint(findingsBody, candidateInputFingerprint) &&
      hasRecognizedSeverityMarker(findingsBody);
    if (!findingsComplete) return { problem: "review_evidence" };
    // Independent audit findings are part of the quality floor in both authority modes.
    // A candidate-bound founder pass supplies the taste decision; it cannot erase a current
    // blocker or high/major finding recorded by the required independent audit.
    if (hasUnresolvedBlockingFinding(findingsBody)) {
      return { verdict: "fail", problem: "review_evidence", evidenceValid: true, blockingFindings: true };
    }

    // In retained-founder mode, the audit supplies independent Findings only. A delegated
    // decision table may remain as historical review content, but it has no authority over the
    // current exact candidate-bound founder decision and cannot reverse that decision.
    if (hasDirectPass) return { problem: "missing", evidenceValid: true };

    // Retained-founder mode still requires current independent Findings. Only the delegated
    // decision table is optional because the candidate-bound direct receipt supplies authority.
    if (!decisionView.ok) {
      if (hasDirectPass) return { problem: "missing", evidenceValid: true };
      // Under a current delegation the audit owns this table. Omitting it is an audit-output
      // defect that retries the audit, not a reason to ask the founder to decide again.
      return delegationActive ? { problem: "review_evidence" } : { problem: "missing", evidenceValid: true };
    }
    reportUnsupported(context, decisionView.section.unsupported, "Delegated Taste Decision", auditPath);
    if (decisionView.section.unsupported.length > 0) return { problem: "review_evidence" };
    if (!delegationActive) return { problem: "delegation_authority" };
    const table = parseRenderedPipeTables(decisionView.section.renderedBody).find((candidate) =>
      hasHeaders(candidate.headers, ["Decision authority", "Date", "Surfaces reviewed", "One-product stranger test", "Copy-test", "Verdict"]),
    );
    if (!table || table.rows.length !== 1) return { problem: "review_evidence" };
    const row = table.rows[0]!;
    const authority = row[headerIndex(table.headers, "Decision authority")] ?? "";
    const date = row[headerIndex(table.headers, "Date")] ?? "";
    const surfaces = row[headerIndex(table.headers, "Surfaces reviewed")] ?? "";
    const stranger = row[headerIndex(table.headers, "One-product stranger test")] ?? "";
    const copyTest = row[headerIndex(table.headers, "Copy-test")] ?? "";
    const verdict = (row[headerIndex(table.headers, "Verdict")] ?? "").trim().toLowerCase();
    const complete =
      authority.trim() === FOUNDER_OPENING_MANDATE &&
      isValidPastIsoDate(date.trim()) &&
      isSubstantiveTasteAnswer(surfaces) &&
      isSubstantiveTasteAnswer(stranger) &&
      isSubstantiveTasteAnswer(copyTest) &&
      /^(?:pass|fail)$/.test(verdict) &&
      findingsComplete;
    if (!complete) return { problem: "review_evidence" };
    return { verdict: verdict as TasteVerdict, problem: "review_evidence", evidenceValid: true };
  } catch {
    return { problem: "review_evidence" };
  }
}

function hasConcreteFrozenRubric(context: DesignWorthinessValidationContext, findings: string): boolean {
  const matches = [...findings.matchAll(/^Frozen rubric: (design\/reviews\/rubrics\/[a-z0-9._/-]+) version ([a-z0-9](?:[a-z0-9._-]*[a-z0-9]))\.\s*$/gim)];
  if (matches.length !== 1) return false;
  const match = matches[0];
  if (!match?.[1] || !match[2]) return false;
  const relativePath = match[1];
  const version = match[2];
  try {
    const rubricsRoot = realpathSync(path.join(context.root, "design", "reviews", "rubrics"));
    const absolute = path.join(context.root, relativePath);
    if (!lstatSync(absolute).isFile()) return false;
    const realRubric = realpathSync(absolute);
    if (realRubric === rubricsRoot || !realRubric.startsWith(`${rubricsRoot}${path.sep}`)) return false;
    const versionLines = readFileSync(realRubric, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^Version:\s*([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\s*$/i)?.[1])
      .filter((candidate): candidate is string => candidate !== undefined);
    return versionLines.length === 1 && versionLines[0] === version;
  } catch {
    return false;
  }
}

function hasExactCandidateInputFingerprint(findings: string, expected: string): boolean {
  const matches = [...findings.matchAll(/^Candidate input fingerprint:\s*`?([a-f0-9]{64})`?\s*$/gim)];
  return matches.length === 1 && matches[0]?.[1] === expected;
}

/** Require exactly one line-bound machine-readable severity declaration. */
function hasRecognizedSeverityMarker(findings: string): boolean {
  const declarations = findings.match(/^\s*severity\b.*$/gim) ?? [];
  if (declarations.length !== 1) return false;
  return /^\s*severity:\s*(?:none|minor|major|high(?:-severity)?|blocker)\.\s*(?:\S.*)?$/i.test(declarations[0]!);
}

/** A pass cannot coexist with an open blocker, high-severity finding, or major finding. */
function hasUnresolvedBlockingFinding(findings: string): boolean {
  const declaredSeverity = findings.match(/^\s*Severity:\s*(none|minor|major|high(?:-severity)?|blocker)\./im)?.[1]?.toLowerCase();
  if (declaredSeverity && /^(?:major|high(?:-severity)?|blocker)$/.test(declaredSeverity)) return true;

  const severity = String.raw`(?:blockers?|major(?:\s+(?:findings?|issues?))?|high(?:-severity)?(?:\s+(?:findings?|issues?))?)`;
  const clearSeverity = String.raw`(?:(?:open|unresolved|outstanding)\s+)?${severity}`;
  const connector = String.raw`(?:\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)`;
  const severityList = String.raw`${severity}(?:${connector}${severity})*`;
  const clearSeverityList = String.raw`${clearSeverity}(?:${connector}${clearSeverity})*`;
  const mentionPattern = new RegExp(String.raw`\b${severity}\b`, "gi");
  const absencePattern = new RegExp(String.raw`\b(?:no|none|zero)\s+${clearSeverityList}\b`, "gi");
  const resolvedPatterns = [
    new RegExp(String.raw`\b${severityList}\s+(?:is|are|was|were|has|have)\s+(?:all\s+)?(?:been\s+)?(?:resolved|closed|fixed)\b`, "gi"),
    new RegExp(String.raw`\b(?:resolved|closed|fixed)\s+(?:the\s+)?${severityList}\b`, "gi"),
  ];
  const negativeResolution = new RegExp(
    String.raw`\b(?:no|none|zero)\s+${clearSeverityList}\s+(?:is|are|was|were|has|have)\s+(?:been\s+)?(?:resolved|closed|fixed)\b`,
    "i",
  );
  const contradictsClearClaim =
    /\b(?:but|however|although|though|claimed?|alleged|apparently|supposedly|uncertain|unverified|missing|still|broken|failing|incomplete|not|never|cannot|without)\b/i;
  const continuationContradicts = (value: string): boolean =>
    /^(?:but|however|although|though)\b/i.test(value) ||
    /\b(?:evidence\s+(?:is|was)\s+missing|it\s+remains?\s+broken|remains?\s+(?:broken|failing|incomplete|unverified))\b/i.test(value);
  const narrative = findings.replace(/^\s*Severity:\s*(?:none|minor|major|high(?:-severity)?|blocker)\.\s*/gim, "");
  // Closure is a paragraph-level claim. A reviewer cannot separate a missing-evidence caveat
  // from "resolved" by inserting an unrelated sentence between them.
  for (const paragraph of narrative.split(/\n\s*\n/)) {
    const hasClearClaim = [absencePattern, ...resolvedPatterns].some((pattern) => [...paragraph.matchAll(pattern)].length > 0);
    if (
      hasClearClaim &&
      /\b(?:no|without)\s+(?:(?:current|supporting|verified)\s+)?evidence\b|\bevidence\s+(?:is|was|remains?)\s+(?:missing|absent|unverified)\b|\b(?:it|this|the\s+finding)\s+(?:still\s+)?remains?\s+(?:open|unresolved|broken|failing|incomplete|unverified)\b/i.test(
        paragraph,
      )
    )
      return true;
  }
  const parts = narrative
    .split(/\n|;|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const [index, part] of parts.entries()) {
    const mentions = [...part.matchAll(mentionPattern)];
    if (mentions.length === 0) continue;
    // "No major finding is resolved" means the opposite of an all-clear.
    if (negativeResolution.test(part)) return true;
    const clearSpans = [absencePattern, ...resolvedPatterns].flatMap((pattern) =>
      [...part.matchAll(pattern)].map((match) => ({ start: match.index ?? -1, end: (match.index ?? -1) + match[0].length })),
    );
    const everyClaimClear = mentions.every((mention) => {
      const start = mention.index ?? -1;
      const end = start + mention[0].length;
      return clearSpans.some((span) => start >= span.start && end <= span.end);
    });
    // A clear claim governs the rest of Findings. An unrelated sentence or paragraph cannot
    // push "however, it remains broken" far enough away to evade the contradiction check.
    if (!everyClaimClear || contradictsClearClaim.test(part) || parts.slice(index + 1).some(continuationContradicts)) return true;
  }
  return false;
}

/**
 * The Markdown carries the human-readable decision and findings. The engine-owned run state
 * proves who produced that current bound audit output and excludes every Design Room producer
 * identity.
 */
interface CurrentIndependentAuditContext {
  run: RunStateDocument;
  attempt: AttemptRecordV2;
  inputFingerprint: string;
  authority: DesignAuthorityEvaluation;
}

function currentIndependentAuditContext(context: DesignWorthinessValidationContext, absolute: string): CurrentIndependentAuditContext | undefined {
  const { root, authorityAuditPath } = context;
  const runStatePath = path.join(root, "run", "run-state.json");
  if (!existsSync(runStatePath)) return undefined;
  try {
    const run = loadRunState(runStatePath);
    const auditState = run.nodes[DESIGN_AUDIT_NODE_ID];
    const designRoomState = run.nodes[DESIGN_ROOM_NODE_ID];
    const auditAttempt = auditState?.attempts.at(-1);
    if (!auditState || !auditAttempt || !designRoomState || designRoomState.attempts.length === 0) return undefined;
    if (auditAttempt.status !== "blocked" && auditAttempt.status !== "succeeded") return undefined;
    if (auditState.status !== auditAttempt.status) return undefined;
    if (!auditAttempt.designAuthorityEvaluation) return undefined;
    if (
      validateExactDesignAuthorityEvaluation(run, authorityAuditPath, auditAttempt.designAuthorityEvaluation, {
        workspaceRoot: root,
        trustedKey: context.trustedFounderKey,
      }).length > 0
    ) {
      return undefined;
    }
    if (!isWorkerExecutionIdentity(auditAttempt.ownerSessionId, run.runId, DESIGN_AUDIT_NODE_ID, auditAttempt.number)) return undefined;
    if (designRoomState.attempts.some((attempt) => attempt.ownerSessionId === auditAttempt.ownerSessionId)) return undefined;
    const binding = run.artifactBindings.find(
      (candidate) =>
        candidate.path.replaceAll("\\", "/") === DESIGN_AUDIT_RELATIVE_PATH &&
        candidate.producedBy === DESIGN_AUDIT_NODE_ID &&
        candidate.attemptId === auditAttempt.id,
    );
    if (!binding?.fingerprint) return undefined;
    // Keep this in the authored compile order: Design Room outputs, followed by the reference
    // librarian's pack and rubric outputs. run/run-state.json deliberately stores only the
    // resulting inputFingerprint, so this validator reconstructs that stable five-artifact seam.
    const inputPaths = ["DESIGN.md", "studio/seed/business.json", "design/design-room.html", "design/reference-packs/", "design/reviews/rubrics/"];
    const inputBindings = inputPaths.map((inputPath) => {
      const normalized = inputPath.replace(/\/+$/, "");
      return run.artifactBindings.find((candidate) => candidate.path.replaceAll("\\", "/").replace(/\/+$/, "") === normalized);
    });
    if (inputBindings.some((candidate) => !candidate?.accepted || !candidate.fingerprint)) return undefined;
    for (const candidate of inputBindings) {
      if (workspaceArtifactFingerprint(root, candidate!.path) !== candidate!.fingerprint) return undefined;
    }
    const currentInputFingerprint = createHash("sha256")
      .update(inputBindings.map((candidate) => `${candidate!.artifactId}:${candidate!.fingerprint}`).join("|"))
      .digest("hex");
    if (currentInputFingerprint !== auditAttempt.inputFingerprint) return undefined;
    if (workspaceArtifactFingerprint(root, DESIGN_AUDIT_RELATIVE_PATH) !== binding.fingerprint || path.resolve(root, binding.path) !== absolute) {
      return undefined;
    }
    return {
      run,
      attempt: auditAttempt,
      inputFingerprint: auditAttempt.inputFingerprint,
      authority: auditAttempt.designAuthorityEvaluation,
    };
  } catch {
    return undefined;
  }
}

function hasCurrentDesignTasteDelegation(context: DesignWorthinessValidationContext): boolean {
  const evaluation = currentIndependentAuditContext(context, context.auditPath)?.authority;
  return evaluation?.source === "dispatch" && evaluation.delegation.status === "approved";
}

function reportTasteRejection(context: DesignWorthinessValidationContext, sourcePath: string): void {
  context.issues.push(
    issue(
      "error",
      "worthiness.taste_gate_rejected",
      "The authorized Taste Gate decision is fail. Repair the declared design producer, obtain a fresh independent audit, and require a later passing decision before downstream work continues.",
      rel(context.root, sourcePath),
    ),
  );
}

function isValidPastIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getTime() <= Date.now();
}

function isDesignLaneDone(context: DesignWorthinessValidationContext): boolean {
  const loaded = loadProjectState(context.projectArgs);
  const status = asString(getPath(loaded.state, "lanes.design.status"));
  return status === "succeeded";
}

function projectOwnerName(context: DesignWorthinessValidationContext): string {
  const loaded = loadProjectState(context.projectArgs);
  return (asString(getPath(loaded.state, "project.owner")) ?? "").trim();
}

function countTags(html: string, tag: string): number {
  const pattern = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  return html.match(pattern)?.length ?? 0;
}

function countPrimaryEmphasis(html: string): number {
  const buttons = html.match(/<(?:button|a)\b[^>]*>/gi) ?? [];
  return buttons.filter((tag) => /\b(?:primary|cta)\b/i.test(tag)).length;
}

function readJsonObject(filePath: string): Record<string, unknown> | undefined {
  const value = readJsonValue(filePath);
  return isRecord(value) ? value : undefined;
}

function readJsonValue(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  const projectArgs = parseCliArgs(argv);
  reportAndExit(
    "Design worthiness check",
    validateDesignWorthiness(projectArgs.root, {
      mechanicalOnly: argv.includes("--mechanical-only"),
      statePath: projectArgs.statePath,
    }),
  );
}
