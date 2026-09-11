import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign as signEd25519 } from "node:crypto";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { laneKeys, type BusinessStateV2, type FounderDecision, type FounderDecisionReceipt, type RunStateDocument } from "../../../kernel/schema/types.js";
import { acquireLock, releaseLock } from "../../../kernel/reducer/lock.js";
import { compilePlan, type CatalogInput, type RunNodeId } from "../../../kernel/engine/compile.js";
import { allowAllAutonomyEvaluator, computeFrontier } from "../../../kernel/engine/frontier.js";
import { captureDesignAuthorityEvaluation } from "../../../kernel/engine/design-taste-authority.js";
import {
  DESIGN_TASTE_DELEGATION_APPROVAL_ID,
  loadCheckpoint,
  loadRunState,
  seedRunState,
  workerExecutionIdentity,
  writeRunState,
} from "../../../kernel/engine/runstate.js";
import { workspaceArtifactFingerprint } from "../../../kernel/engine/review-evidence.js";
import { captureReviewEvidence } from "../../../kernel/engine/review-evidence.js";
import {
  FOUNDER_DECISION_RECEIPT_ALGORITHM,
  FOUNDER_DECISION_RECEIPT_AUDIENCE,
  FOUNDER_ED25519_PUBLIC_KEY_ENV,
  canonicalFounderDecisionPayload,
  canonicalFounderDecisionReceipt,
  computeDesignDocumentSha256,
  computeFounderWorkspaceBinding,
  trustedFounderKeyFromBase64Url,
} from "../../../kernel/engine/founder-decision-receipt.js";
import { recordDeterministicVerification, VERIFICATION_REQUIRED_BLOCKER } from "../../../kernel/engine/verification.js";
import {
  bindFounderTrustToNewRun,
  FOUNDER_TRUST_FILE_ENV,
  installFounderTrustStore,
  loadFounderTrustStore,
} from "../../../kernel/engine/founder-trust-store.js";
import { internalVocabularyBlocklist } from "../../../kernel/session/digest.js";
import { pathToFileURL } from "node:url";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { composeCatalog } from "../../../catalog/index.js";
import { toCatalogInput } from "../../../catalog/bridge.js";
import { acceptVerification, beginAttempt, reconcilePatch, requestVerificationRepair } from "../../../kernel/engine/runstate.js";
import { workerEnvironment } from "../../../kernel/session/executor.js";
import { stringify as stringifyYaml } from "yaml";
import { DESIGN_FACETS, designArtifact } from "../../validation/business/design/design-acceptance.js";

/**
 * U5 session-runner fixtures: exercises kernel/session/run.ts as a real subprocess (mirroring
 * reducer.fixtures.ts's convention) against a bootstrapped temp workspace, plus a few in-process
 * checks of digest.ts's pure translation/push functions where a subprocess would add nothing.
 * RESEND_API_KEY is never present in any spawned session's environment here — no fixture may ever
 * attempt a real network send; the "attempted" push paths are covered in-process with a fake
 * transport instead.
 */

const tsxBin = resolveTsxBin(skillRoot);
const reducerCliPath = path.join(skillRoot, "kernel/reducer/cli.ts");
const runCliPath = path.join(skillRoot, "kernel/session/run.ts");
const approveCliPath = path.join(skillRoot, "kernel/session/approve.ts");
const verifyCliPath = path.join(skillRoot, "kernel/session/verify.ts");
const b2cBinPath = path.join(skillRoot, "entrypoints/cli/b2c.mjs");

interface CliResult {
  readonly code: number;
  readonly output: string;
}

const fixtureFounderKeyPair = generateKeyPairSync("ed25519");
const fixtureFounderPublicKey = Buffer.from(fixtureFounderKeyPair.publicKey.export({ format: "der", type: "spki" })).toString("base64url");
const fixtureFounderTrustedKey = trustedFounderKeyFromBase64Url(fixtureFounderPublicKey);
let fixtureFounderReceiptCounter = 0;
const fixtureFounderReceiptTips = new Map<string, { readonly decision: FounderDecision; readonly receipt: FounderDecisionReceipt }>();
const fixtureFounderTrustFiles = new Map<string, string>();

function runReducer(args: string[], input?: string): CliResult {
  const result = spawnSync(tsxBin, [reducerCliPath, ...args], { cwd: skillRoot, encoding: "utf8", input });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

/** Env with RESEND_API_KEY stripped, regardless of the host shell — a spawned session must never see a real key. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.RESEND_API_KEY;
  delete env[FOUNDER_ED25519_PUBLIC_KEY_ENV];
  delete env[FOUNDER_TRUST_FILE_ENV];
  return env;
}

function ensureFixtureFounderTrust(workspace: string): string {
  const canonicalWorkspace = path.resolve(workspace);
  const existing = fixtureFounderTrustFiles.get(canonicalWorkspace);
  if (existing) return existing;
  const trustFile = path.join(canonicalWorkspace, ".fixture-founder-trust", "founder-ed25519-v1.json");
  installFounderTrustStore({
    publicKeyBase64Url: fixtureFounderPublicKey,
    trustFile,
    apply: true,
    installedAt: "2026-09-04T00:00:00.000Z",
  });
  fixtureFounderTrustFiles.set(canonicalWorkspace, trustFile);
  return trustFile;
}

function fixtureFounderTrustEnvironment(workspace: string | undefined): NodeJS.ProcessEnv {
  if (!workspace) return {};
  const trustFile = fixtureFounderTrustFiles.get(path.resolve(workspace));
  return trustFile ? { [FOUNDER_TRUST_FILE_ENV]: trustFile } : {};
}

function bindFixtureFounderTrust(handle: WorkspaceHandle, run: RunStateDocument, sessionId: string, boundAt: string): void {
  const trustFile = ensureFixtureFounderTrust(handle.dir);
  const controlOwnerUid = lstatSync(path.join(handle.dir, "control")).uid;
  const store = loadFounderTrustStore({ trustFile, role: "founder_mutation", controlOwnerUid });
  bindFounderTrustToNewRun(run, {
    workspaceRoot: handle.dir,
    auditPath: handle.auditPath,
    runStatePath: path.join(handle.dir, "run/run-state.json"),
    sessionId,
    store,
    boundAt,
  });
}

function runSession(args: string[], envOverrides: NodeJS.ProcessEnv = {}): CliResult {
  const workspaceIndex = args.indexOf("--workspace");
  const workspace = workspaceIndex >= 0 ? args[workspaceIndex + 1] : undefined;
  const result = spawnSync(tsxBin, [runCliPath, ...args], {
    cwd: skillRoot,
    encoding: "utf8",
    env: { ...cleanEnv(), ...fixtureFounderTrustEnvironment(workspace), ...envOverrides },
  });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function runApprove(args: string[]): CliResult {
  const valueAfter = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const workspace = valueAfter("--workspace");
  const directTaste = valueAfter("--design-taste");
  const delegatedTaste = valueAfter("--design-taste-delegation");
  const alreadyHasReceipt = args.includes("--founder-receipt") || args.includes("--founder-receipt-file");
  let receiptTipKey: string | undefined;
  let receiptToRecord: { readonly decision: FounderDecision; readonly receipt: FounderDecisionReceipt } | undefined;
  let invocation = args;

  if (
    workspace &&
    !alreadyHasReceipt &&
    (directTaste === "pass" || directTaste === "fail") !== (delegatedTaste === "approved" || delegatedTaste === "rejected")
  ) {
    ensureFixtureFounderTrust(workspace);
    const runStatePath = path.join(workspace, "run/run-state.json");
    const run = loadRunState(runStatePath);
    const decision: FounderDecision =
      directTaste === "pass" || directTaste === "fail"
        ? { kind: "design_taste_direct", verdict: directTaste, designSha256: computeDesignDocumentSha256(workspace) }
        : { kind: "design_taste_delegation", status: delegatedTaste as "approved" | "rejected" };
    receiptTipKey = `${workspace}\n${run.runId}\n${decision.kind}`;
    const tip = fixtureFounderReceiptTips.get(receiptTipKey);
    if (tip && JSON.stringify(tip.decision) === JSON.stringify(decision)) {
      receiptToRecord = tip;
    } else {
      const issuedAt = new Date(Date.now() - 1_000).toISOString();
      const payload = {
        audience: FOUNDER_DECISION_RECEIPT_AUDIENCE,
        receiptId: `session-fixture-founder-receipt-${++fixtureFounderReceiptCounter}`,
        previousReceiptId: tip?.receipt.payload.receiptId ?? null,
        sequence: (tip?.receipt.payload.sequence ?? 0) + 1,
        workspaceBinding: computeFounderWorkspaceBinding(workspace),
        runId: run.runId,
        issuedAt,
        expiresAt: new Date(Date.parse(issuedAt) + 10 * 60 * 1_000).toISOString(),
        decision,
      } as const;
      receiptToRecord = {
        decision,
        receipt: {
          schemaVersion: "1.0.0",
          algorithm: FOUNDER_DECISION_RECEIPT_ALGORITHM,
          keyId: fixtureFounderTrustedKey.keyId,
          payload,
          signature: signEd25519(null, Buffer.from(canonicalFounderDecisionPayload(payload), "utf8"), fixtureFounderKeyPair.privateKey).toString("base64url"),
        },
      };
    }
    invocation = [...args, "--founder-receipt", canonicalFounderDecisionReceipt(receiptToRecord.receipt)];
  }

  const result = spawnSync(tsxBin, [approveCliPath, ...invocation], {
    cwd: skillRoot,
    encoding: "utf8",
    env: { ...cleanEnv(), ...fixtureFounderTrustEnvironment(workspace) },
  });
  const cliResult = { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
  if (cliResult.code === 0 && receiptTipKey && receiptToRecord) fixtureFounderReceiptTips.set(receiptTipKey, receiptToRecord);
  return cliResult;
}

function runVerify(args: string[]): CliResult {
  const result = spawnSync(tsxBin, [verifyCliPath, ...args], { cwd: skillRoot, encoding: "utf8" });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

let patchCounter = 0;
function nextPatchId(): string {
  patchCounter += 1;
  return `session-fixture-patch-${patchCounter}`;
}

function buildPatch(targetDoc: string, ops: Array<Record<string, unknown>>, declaredOutputs: string[][]): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    patchId: nextPatchId(),
    targetDoc,
    reason: "session fixture setup",
    authoredBy: "session-fixture-setup",
    authoredAt: "2026-08-05T00:00:00.000Z",
    preconditions: [],
    ops,
    declaredOutputs,
  };
}

function minimalLanes(): Record<string, unknown> {
  const lanes: Record<string, unknown> = {};
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return lanes;
}

interface WorkspaceHandle {
  readonly dir: string;
  readonly statePath: string;
  readonly controlPath: string;
  readonly ledgerPath: string;
  readonly manifestPath: string;
  readonly auditPath: string;
  readonly catalogPath: string;
  readonly briefPath: string;
  readonly digestPath: (sessionId: string) => string;
}

function commit(handle: WorkspaceHandle, targetFile: string, patch: Record<string, unknown>): CliResult {
  const patchPath = path.join(handle.dir, `${patch.patchId as string}.json`);
  writeJson(patchPath, patch);
  // Workspace bootstrap stands in for the founder-initiated onboarding flow, so it carries
  // --founder-authority (the reducer requires it for control/grants/waivers patches).
  const result = runReducer([
    "commit",
    "--patch",
    patchPath,
    "--file",
    targetFile,
    "--manifest",
    handle.manifestPath,
    "--audit",
    handle.auditPath,
    "--session",
    "session-fixture-setup",
    "--founder-authority",
    "true",
  ]);
  assert(result.code === 0, `workspace bootstrap commit failed: ${result.output}`);
  return result;
}

interface BootstrapOptions {
  readonly pendingGates?: Array<{ id: string; category: string; reason: string; createdAt: string }>;
  readonly grants?: Record<string, unknown>;
  readonly waivers?: unknown[];
  readonly balances?: unknown[];
  readonly founderEmail?: string;
  readonly scopeHints?: string[];
}

function bootstrapWorkspace(harness: Harness, name: string, catalog: CatalogInput, options: BootstrapOptions = {}): WorkspaceHandle {
  const dir = harness.makeTempDir(`session-${name}`);
  const handle: WorkspaceHandle = {
    dir,
    statePath: path.join(dir, "state", "business-state.json"),
    controlPath: path.join(dir, "control", "control.json"),
    ledgerPath: path.join(dir, "control", "budget-ledger.json"),
    manifestPath: path.join(dir, "control", "manifest.json"),
    auditPath: path.join(dir, "control", "audit.jsonl"),
    catalogPath: path.join(dir, "catalog.json"),
    briefPath: path.join(dir, "brief.json"),
    digestPath: (sessionId: string) => path.join(dir, "digests", `${sessionId}.md`),
  };

  commit(
    handle,
    handle.statePath,
    buildPatch(
      "business-state",
      [
        { op: "set", path: ["narrative"], value: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" } },
        {
          op: "set",
          path: ["project"],
          value: {
            name: "Fixture App",
            slug: name,
            owner: "Founder",
            phase: "phase_0_orient",
            launchScope: "essentials",
            kickoffDate: "",
            platforms: ["ios"],
            bundleIds: { ios: "com.example.app", android: "" },
            publicUrls: { landing: "", privacy: "", terms: "" },
          },
        },
        { op: "set", path: ["lanes"], value: minimalLanes() },
        { op: "set", path: ["founderGates"], value: { pending: options.pendingGates ?? [] } },
      ],
      [["narrative"], ["project"], ["lanes"], ["founderGates"]],
    ),
  );

  commit(
    handle,
    handle.controlPath,
    buildPatch(
      "control",
      [
        { op: "set", path: ["businessSlug"], value: name },
        { op: "set", path: ["killSwitch"], value: { engaged: false, engagedAt: "", engagedBy: "", reason: "" } },
        { op: "set", path: ["grants"], value: options.grants ?? {} },
        { op: "set", path: ["waivers"], value: options.waivers ?? [] },
      ],
      [["businessSlug"], ["killSwitch"], ["grants"], ["waivers"]],
    ),
  );

  commit(
    handle,
    handle.ledgerPath,
    buildPatch(
      "budget-ledger",
      [
        { op: "set", path: ["balances"], value: options.balances ?? [] },
        { op: "set", path: ["entries"], value: [] },
      ],
      [["balances"], ["entries"]],
    ),
  );

  writeJson(handle.catalogPath, catalog);
  writeJson(handle.briefPath, {
    schemaVersion: "1.0.0",
    businessSlug: name,
    founderContact: { email: options.founderEmail ?? "founder@example.com" },
    ...(options.scopeHints ? { scopeHints: options.scopeHints } : {}),
  });

  return handle;
}

function grant(domainId: string, level: string, now = "2026-08-01T00:00:00.000Z"): Record<string, unknown> {
  return { domainId, level, prerequisites: [], grantedAt: now, grantedBy: "founder", updatedAt: now };
}

function waiver(id: string, domainId: string, actionClass: string, protectedCategory: string, now = "2026-08-01T00:00:00.000Z"): Record<string, unknown> {
  return {
    id,
    domainId,
    actionClass,
    protectedCategory,
    scope: { resourcePattern: "*", description: "Fixture-authored waiver for the session-runner fixture suite." },
    caps: { maxPerAction: 1000, maxPerPeriod: 10000, currency: "USD" },
    budgetPeriod: "monthly",
    expiry: "2099-01-01T00:00:00.000Z",
    undoContract: {
      kind: "mitigation",
      irreversibilityAcknowledgment: "This fixture waiver models an irreversible action for the session-runner suite.",
      mitigationSteps: ["Review the audit log"],
    },
    auditRef: "audit.fixture",
    status: "active",
    createdAt: now,
    createdBy: "founder",
  };
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function assertNoInternalVocabulary(label: string, text: string): void {
  const leaked = internalVocabularyBlocklist.filter((term) => text.includes(term));
  assert(leaked.length === 0, `${label}: digest leaked internal vocabulary: ${JSON.stringify(leaked)}\n---\n${text}`);
}

function readDigest(handle: WorkspaceHandle, sessionId: string): string {
  const filePath = handle.digestPath(sessionId);
  assert(existsSync(filePath), `expected a digest file at ${filePath} — a session must never exit silently`);
  return readFileSync(filePath, "utf8");
}

function readRunState(handle: WorkspaceHandle): RunStateDocument {
  return JSON.parse(readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8")) as RunStateDocument;
}

function assertUnsignedDesignAuditReachedAuthorityBoundary(audit: RunStateDocument["nodes"][string], attemptCount: number, context: string): void {
  const latest = audit.attempts.at(-1);
  assert(
    audit.status === "waiting_founder" &&
      audit.attempts.length === attemptCount &&
      latest?.deterministicVerification?.passed === false &&
      latest.independentVerification === undefined,
    `${context}; the fresh audit should stop at the external founder-authority boundary (${audit.status}, ${audit.attempts.length})`,
  );
}

function assertCheckpointMatches(handle: WorkspaceHandle, run: RunStateDocument, sessionId: string): void {
  const checkpoint = loadCheckpoint(path.join(handle.dir, "run", "checkpoint.json"));
  assert(checkpoint.writerSessionId === sessionId, "checkpoint must identify its writing session");
  assert(JSON.stringify(checkpoint.runState) === JSON.stringify(run), "checkpoint must preserve the complete durable run");
}

function readAuditEntries(handle: WorkspaceHandle): Array<Record<string, unknown>> {
  return readFileSync(handle.auditPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// --- fixture catalogs -----------------------------------------------------------------------

function singleNodeCatalog(): CatalogInput {
  return {
    version: "catalog.session-fixture.single",
    artifacts: [{ id: "artifact.eng-change", path: "engineering/change.log" }],
    workflows: [
      {
        id: "workflow.eng-change",
        title: "Update the onboarding copy",
        domainId: "domain.engineering",
        actionClass: "observe",
        dependencies: [],
        outputPaths: ["engineering/change.log"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

/**
 * Same single node, but carrying a real, workspace-independent gate (check:gates-layout defends
 * the skill's own validation/ tree, so it passes against any BUSINESS_ROOT). Since gateless
 * outputs stopped auto-accepting (the 2026-08 verification flip), a scenario that needs a node
 * to reach VERIFIED inside one headless session must give it a deterministic gate — this is the
 * sanctioned path, not a fixture cheat.
 */
function gatedSingleNodeCatalog(): CatalogInput {
  const catalog = singleNodeCatalog();
  return {
    ...catalog,
    version: "catalog.session-fixture.single-gated",
    workflows: catalog.workflows.map((workflowNode) => ({ ...workflowNode, gateCommands: ["check:gates-layout"] })),
  };
}

function comprehensiveCatalog(): CatalogInput {
  return {
    version: "catalog.session-fixture.comprehensive",
    artifacts: [
      { id: "artifact.growth-scan", path: "growth/scan.md" },
      { id: "artifact.money-report", path: "money/report.md" },
      { id: "artifact.eng-change", path: "engineering/change.log" },
    ],
    workflows: [
      {
        id: "workflow.growth-scan",
        title: "Scan what people are saying",
        domainId: "domain.growth",
        actionClass: "observe",
        dependencies: [],
        outputPaths: ["growth/scan.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.money-report",
        title: "Pull this week's revenue report",
        domainId: "domain.money",
        actionClass: "spend",
        protectedCategory: "spend",
        costEstimate: { amount: 25, currency: "USD" },
        dependencies: [],
        outputPaths: ["money/report.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: false,
      },
      {
        id: "workflow.eng-change",
        title: "Update the onboarding copy",
        domainId: "domain.engineering",
        actionClass: "mutate",
        dependencies: [],
        outputPaths: ["engineering/change.log"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

/** growth-entry's only dependency sits in a different domain, both granted, so an unscoped session could dispatch either -- reproduces a scoped session's entry node being blocked entirely by an out-of-scope, not-yet-succeeded prerequisite. */
function crossDomainDependencyCatalog(): CatalogInput {
  return {
    version: "catalog.session-fixture.cross-domain-dependency",
    artifacts: [
      { id: "artifact.money-prereq", path: "money/prereq.md" },
      { id: "artifact.growth-entry", path: "growth/entry.md" },
    ],
    workflows: [
      {
        id: "workflow.money-prereq",
        title: "Confirm the revenue baseline",
        domainId: "domain.money",
        actionClass: "observe",
        dependencies: [],
        outputPaths: ["money/prereq.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.growth-entry",
        title: "Scan what people are saying",
        domainId: "domain.growth",
        actionClass: "observe",
        dependencies: ["workflow.money-prereq"],
        outputPaths: ["growth/entry.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

/** eng-change is deliberately capped at maxAttempts: 1 so a single hand-seeded prior attempt puts it at its ceiling. */
function exhaustibleTwoNodeCatalog(): CatalogInput {
  return {
    version: "catalog.session-fixture.exhausted-attempts",
    artifacts: [
      { id: "artifact.growth-scan", path: "growth/scan.md" },
      { id: "artifact.eng-change", path: "engineering/change.log" },
    ],
    workflows: [
      {
        id: "workflow.growth-scan",
        title: "Scan what people are saying",
        domainId: "domain.growth",
        actionClass: "observe",
        dependencies: [],
        outputPaths: ["growth/scan.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.eng-change",
        title: "Update the onboarding copy",
        domainId: "domain.engineering",
        actionClass: "mutate",
        dependencies: [],
        outputPaths: ["engineering/change.log"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
        maxAttempts: 1,
      },
    ],
  };
}

/** A single node with a non-empty founderOnlyActions, so — once autonomy (grant+waiver+budget) allows it — it still lands waiting_founder pending an explicit approval decision. */
function approvalGatedCatalog(): CatalogInput {
  return {
    version: "catalog.session-fixture.approval-gated",
    artifacts: [{ id: "artifact.money-report", path: "money/report.md" }],
    workflows: [
      {
        id: "workflow.money-report",
        title: "Pull this week's revenue report",
        domainId: "domain.money",
        actionClass: "spend",
        protectedCategory: "spend",
        costEstimate: { amount: 25, currency: "USD" },
        dependencies: [],
        outputPaths: ["money/report.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: ["Approve pulling this week's revenue report"],
        gateCommands: [],
        idempotent: false,
      },
    ],
  };
}

function designTasteDecisionCatalog(): CatalogInput {
  return {
    version: "catalog.session-fixture.design-taste-decision",
    artifacts: [
      { id: "artifact.design-contract", path: "DESIGN.md" },
      { id: "artifact.design-review", path: "design/reviews/DESIGN_SYSTEM_REVIEW.md" },
    ],
    workflows: [
      {
        id: "workflow.design.design-room",
        title: "Design Room",
        domainId: "domain.design",
        actionClass: "mutate",
        dependencies: [],
        outputPaths: ["DESIGN.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.design.design-system-audit",
        title: "Independent design-system audit",
        domainId: "domain.design",
        actionClass: "draft",
        dependencies: ["workflow.design.design-room"],
        reviewOf: ["workflow.design.design-room"],
        outputPaths: ["design/reviews/DESIGN_SYSTEM_REVIEW.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
        maxAttempts: 8,
        maxConsecutiveNoProgressAttempts: 2,
      },
    ],
  };
}

function designTasteAuditRetryCatalog(maxAttempts = 3): CatalogInput {
  const worthinessReference = {
    id: "reference.design.design-worthiness",
    path: "knowledge/design/design-worthiness.md",
    title: "Design Worthiness",
    loadWhen: "judging or repairing the current design direction",
  };
  return {
    version: `catalog.session-fixture.design-taste-audit-retry.${maxAttempts}`,
    artifacts: [
      { id: "artifact.design-rubric", path: "design/reviews/rubrics/" },
      { id: "artifact.design-reference-pack", path: "design/reference-packs/" },
      { id: "artifact.design-contract", path: "DESIGN.md" },
      { id: "artifact.design-seed", path: "studio/seed/business.json" },
      { id: "artifact.design-room", path: "design/design-room.html" },
      { id: "artifact.design-review", path: "design/reviews/DESIGN_SYSTEM_REVIEW.md" },
    ],
    workflows: [
      {
        id: "workflow.design.reference-pack-librarian",
        title: "Freeze design rubric",
        domainId: "domain.design",
        actionClass: "observe",
        dependencies: [],
        outputPaths: ["design/reference-packs/", "design/reviews/rubrics/"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.design.design-room",
        title: "Design Room",
        domainId: "domain.design",
        actionClass: "observe",
        references: [worthinessReference],
        dependencies: ["workflow.design.reference-pack-librarian"],
        outputPaths: ["DESIGN.md", "studio/seed/business.json", "design/design-room.html"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.design.design-system-audit",
        title: "Independent design-system audit",
        domainId: "domain.design",
        actionClass: "draft",
        instructions: "Write a structured delegated Taste Gate decision and substantive findings against the frozen rubric.",
        references: [worthinessReference],
        reads: ["DESIGN.md", "studio/seed/business.json", "design/design-room.html", "design/reference-packs/", "design/reviews/rubrics/"],
        dependencies: ["workflow.design.design-room", "workflow.design.reference-pack-librarian"],
        reviewOf: ["workflow.design.design-room"],
        outputPaths: ["design/reviews/DESIGN_SYSTEM_REVIEW.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: ["check:design-worthiness"],
        idempotent: true,
        maxAttempts,
        maxConsecutiveNoProgressAttempts: 2,
      },
    ],
  };
}

function seedDesignTasteAuditRetry(
  handle: WorkspaceHandle,
  catalog: CatalogInput,
  options: {
    producerAuthoredUnreceiptedTastePass?: boolean;
  } = {},
): ReturnType<typeof compilePlan> {
  mkdirSync(path.join(handle.dir, "knowledge/design"), { recursive: true });
  cpSync(path.join(skillRoot, "knowledge/design/design-worthiness.md"), path.join(handle.dir, "knowledge/design/design-worthiness.md"));
  cpSync(path.join(skillRoot, "examples/workspace/business/DESIGN.md"), path.join(handle.dir, "DESIGN.md"));
  if (options.producerAuthoredUnreceiptedTastePass) {
    const designPath = path.join(handle.dir, "DESIGN.md");
    const design = readFileSync(designPath, "utf8");
    writeFileSync(
      designPath,
      design.replace(
        /^\| Record the founder or owner \|.*$/m,
        "| Fixture Founder | Founder direct decision | 2026-09-04 | Landing, onboarding, and store first frames | A stranger recognizes one coherent product from its geometry, type, and interaction hierarchy | We would rather competitors copy this specific direction than the previous generic one | pass |",
      ),
      "utf8",
    );
  }
  mkdirSync(path.join(handle.dir, "studio/seed"), { recursive: true });
  cpSync(path.join(skillRoot, "examples/workspace/business/studio/seed/business.json"), path.join(handle.dir, "studio/seed/business.json"));
  const seedPath = path.join(handle.dir, "studio/seed/business.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as { designRoom?: Record<string, unknown> };
  seed.designRoom = { ...(seed.designRoom ?? {}), status: "rendered" };
  writeJson(seedPath, seed);
  mkdirSync(path.join(handle.dir, "design/reviews/rubrics"), { recursive: true });
  writeFileSync(
    path.join(handle.dir, "design/reviews/rubrics/design-system-v1.md"),
    "# Design system rubric\n\nVersion: RUBRIC-design-system-v1\n\nJudge coherence, identity, hierarchy, and copy.\n",
    "utf8",
  );
  mkdirSync(path.join(handle.dir, "design/reference-packs"), { recursive: true });
  writeFileSync(
    path.join(handle.dir, "design/reference-packs/current-surface.md"),
    "# Current surface reference pack\n\nThe landing and native hierarchy share one object model and one product promise.\n",
    "utf8",
  );
  cpSync(path.join(skillRoot, "examples/workspace/business/design/design-room.html"), path.join(handle.dir, "design/design-room.html"));

  const plan = compilePlan(catalog);
  const businessState = JSON.parse(readFileSync(handle.statePath, "utf8")) as BusinessStateV2;
  const run = seedRunState(plan, businessState, {
    ownerSessionId: "fixture-design-program",
    ttlSeconds: 300,
    wallClockCapSeconds: 300,
    now: "2026-09-04T16:00:00.000Z",
  });
  const acceptExisting = (workflowId: string, owner: string): void => {
    const node = plan.nodes.find((candidate) => candidate.workflowId === workflowId)!;
    const attempt = beginAttempt(plan, run, node.id, owner, "2026-09-04T16:00:01.000Z");
    reconcilePatch(
      plan,
      run,
      {
        nodeId: node.id,
        attemptId: attempt.id,
        outputs: node.outputs.map((artifactId) => {
          const binding = run.artifactBindings.find((candidate) => candidate.artifactId === artifactId)!;
          return {
            artifactId,
            path: binding.path,
            fingerprint: workspaceArtifactFingerprint(handle.dir, binding.path),
            evidence: [`Accepted fixture prerequisite ${binding.path}.`],
          };
        }),
      },
      "2026-09-04T16:00:02.000Z",
    );
    run.nodes[node.id]!.status = "succeeded";
    run.nodes[node.id]!.attempts.at(-1)!.status = "succeeded";
    for (const artifactId of node.outputs) run.artifactBindings.find((binding) => binding.artifactId === artifactId)!.accepted = true;
  };
  acceptExisting("workflow.design.reference-pack-librarian", "fixture-reference-librarian");
  acceptExisting("workflow.design.design-room", "fixture-design-room-producer");
  mkdirSync(path.join(handle.dir, "run"), { recursive: true });
  writeRunState(path.join(handle.dir, "run/run-state.json"), run);
  return plan;
}

function seedStaleDesignAuditReplay(handle: WorkspaceHandle, catalog: CatalogInput, options: { directMode?: boolean } = {}): void {
  const plan = seedDesignTasteAuditRetry(handle, catalog, { producerAuthoredUnreceiptedTastePass: options.directMode });
  const runPath = path.join(handle.dir, "run/run-state.json");
  const run = loadRunState(runPath);
  const audit = plan.nodes.find((candidate) => candidate.workflowId === "workflow.design.design-system-audit")!;
  const producer = plan.nodes.find((candidate) => candidate.workflowId === "workflow.design.design-room")!;
  const reviewPath = "design/reviews/DESIGN_SYSTEM_REVIEW.md";
  writeFileSync(
    path.join(handle.dir, reviewPath),
    [
      "# Old independent design-system audit",
      "",
      ...(options.directMode
        ? []
        : [
            "## Delegated Taste Decision",
            "",
            "| Decision authority | Date | Surfaces reviewed | One-product stranger test | Copy-test | Verdict |",
            "| --- | --- | --- | --- | --- | --- |",
            "| Founder opening mandate | 2026-09-04 | Landing, onboarding, and store first frames | A stranger recognizes one coherent product from its geometry, type, and interaction hierarchy | We would rather competitors copy this specific direction than the previous generic one | pass |",
            "",
          ]),
      "## Findings",
      "",
      "Frozen rubric: design/reviews/rubrics/design-system-v1.md version RUBRIC-design-system-v1.",
      "",
      "| Severity | Observation |",
      "| --- | --- |",
      "| none | The current candidate clears the frozen hierarchy, identity, and copy checks. |",
      "",
      "Severity: none. The old candidate had no unresolved blocker, high-severity finding, or major finding.",
      "",
    ].join("\n"),
    "utf8",
  );
  const oldAuditAttempt = beginAttempt(
    plan,
    run,
    audit.id,
    workerExecutionIdentity("fixture-old-audit-session", run.runId, audit.id, 1),
    "2026-09-04T16:01:00.000Z",
  );
  {
    const absoluteReviewPath = path.join(handle.dir, reviewPath);
    writeFileSync(
      absoluteReviewPath,
      readFileSync(absoluteReviewPath, "utf8").replace("## Findings\n", `## Findings\n\nCandidate input fingerprint: ${oldAuditAttempt.inputFingerprint}\n`),
      "utf8",
    );
  }
  reconcilePatch(
    plan,
    run,
    {
      nodeId: audit.id,
      attemptId: oldAuditAttempt.id,
      outputs: [
        {
          artifactId: audit.outputs[0]!,
          path: reviewPath,
          fingerprint: workspaceArtifactFingerprint(handle.dir, reviewPath),
          evidence: ["Old candidate audit fixture."],
        },
      ],
    },
    "2026-09-04T16:01:01.000Z",
  );
  run.nodes[audit.id]!.status = "succeeded";
  oldAuditAttempt.status = "succeeded";
  run.artifactBindings.find((binding) => binding.artifactId === audit.outputs[0])!.accepted = true;

  const producerAttempt = beginAttempt(plan, run, producer.id, "fixture-changed-design-room-producer", "2026-09-04T16:02:00.000Z");
  writeFileSync(path.join(handle.dir, "DESIGN.md"), `${readFileSync(path.join(handle.dir, "DESIGN.md"), "utf8")}\n<!-- changed candidate -->\n`, "utf8");
  reconcilePatch(
    plan,
    run,
    {
      nodeId: producer.id,
      attemptId: producerAttempt.id,
      outputs: producer.outputs.map((artifactId) => {
        const binding = run.artifactBindings.find((candidate) => candidate.artifactId === artifactId)!;
        return {
          artifactId,
          path: binding.path,
          fingerprint: workspaceArtifactFingerprint(handle.dir, binding.path),
          evidence: [`Changed candidate fixture ${binding.path}.`],
        };
      }),
    },
    "2026-09-04T16:02:01.000Z",
  );
  run.nodes[producer.id]!.status = "succeeded";
  producerAttempt.status = "succeeded";
  for (const artifactId of producer.outputs) run.artifactBindings.find((binding) => binding.artifactId === artifactId)!.accepted = true;
  assert(run.nodes[audit.id]!.status === "stale", "changed Design Room bytes must stale the old delegated audit before replay");
  writeRunState(runPath, run);
}

function seedPendingDesignAuditGate(handle: WorkspaceHandle, catalog: CatalogInput, gatePassed: boolean): void {
  const plan = seedDesignTasteAuditRetry(handle, catalog);
  const runPath = path.join(handle.dir, "run/run-state.json");
  const run = loadRunState(runPath);
  const audit = plan.nodes.find((candidate) => candidate.workflowId === "workflow.design.design-system-audit")!;
  const attempt = beginAttempt(plan, run, audit.id, `fixture-pending-${gatePassed ? "pass" : "failed"}-gate`, "2026-09-04T18:10:00.000Z");
  attempt.proofSource = "workspace";
  const evaluatedAt = new Date().toISOString();
  attempt.designAuthorityEvaluation = captureDesignAuthorityEvaluation(run, handle.auditPath, "dispatch", {
    workspaceRoot: handle.dir,
    trustedKey: fixtureFounderTrustedKey,
    now: evaluatedAt,
    evaluatedAt,
  });
  const reviewPath = "design/reviews/DESIGN_SYSTEM_REVIEW.md";
  writeFileSync(
    path.join(handle.dir, reviewPath),
    [
      "# Pending independent design-system audit",
      "",
      "## Delegated Taste Decision",
      "",
      "| Decision authority | Date | Surfaces reviewed | One-product stranger test | Copy-test | Verdict |",
      "| --- | --- | --- | --- | --- | --- |",
      "| Founder opening mandate | 2026-09-04 | Landing, onboarding, and store first frames | A stranger recognizes one coherent product from its geometry, type, and interaction hierarchy | We would rather competitors copy this specific direction than the previous generic one | pass |",
      "",
      "## Findings",
      "",
      `Candidate input fingerprint: ${attempt.inputFingerprint}`,
      "",
      "Frozen rubric: design/reviews/rubrics/design-system-v1.md version RUBRIC-design-system-v1.",
      "",
      "Severity: none. The pending audit found no unresolved blocker, high-severity finding, or major finding.",
      "",
    ].join("\n"),
    "utf8",
  );
  reconcilePatch(
    plan,
    run,
    {
      nodeId: audit.id,
      attemptId: attempt.id,
      outputs: [
        {
          artifactId: audit.outputs[0]!,
          path: reviewPath,
          fingerprint: workspaceArtifactFingerprint(handle.dir, reviewPath),
          evidence: [`Pending ${gatePassed ? "passing" : "failed"} gate fixture.`],
        },
      ],
    },
    "2026-09-04T18:10:01.000Z",
  );
  recordDeterministicVerification(
    plan,
    run,
    audit.id,
    gatePassed
      ? { allPassed: true, evidence: ["gate:check:design-worthiness=passed"] }
      : {
          allPassed: false,
          evidence: ["gate:check:design-worthiness=exit 1", "gate_issue:worthiness.taste_gate_rejected"],
        },
    "2026-09-04T18:10:02.000Z",
  );
  writeRunState(runPath, run);
}

function seedAcceptedDesignAudit(handle: WorkspaceHandle, catalog: CatalogInput): void {
  seedPendingDesignAuditGate(handle, catalog, true);
  const runPath = path.join(handle.dir, "run/run-state.json");
  const run = loadRunState(runPath);
  const plan = compilePlan(catalog);
  const audit = plan.nodes.find((candidate) => candidate.workflowId === "workflow.design.design-system-audit")!;
  const reviewReceipt = captureReviewEvidence(plan, run, audit.id, handle.dir, "fixture-independent-design-reviewer", "2026-09-04T18:10:03.000Z", "workspace");
  acceptVerification(
    plan,
    run,
    audit.id,
    ["Independent fixture acceptance of the exact current design audit output."],
    "2026-09-04T18:10:03.000Z",
    "fixture-independent-design-reviewer",
    reviewReceipt,
    handle.dir,
  );
  writeRunState(runPath, run);
}

type FakeDesignAuditMode =
  | "always-pass"
  | "malformed-then-pass"
  | "always-malformed"
  | "missing-then-pass"
  | "missing-decision-then-pass"
  | "fail-then-pass"
  | "craft-date-only-then-pass"
  | "craft-missing-then-pass"
  | "craft-malformed-then-pass"
  | "craft-producer-evidence-fail-then-pass"
  | "craft-semantic-replay-then-pass"
  | "craft-product-fail-then-pass"
  | "craft-surface-coverage-fail-then-pass"
  | "direct-entity-only-then-pass"
  | "direct-framing-only-then-pass"
  | "direct-inline-only-then-pass"
  | "duplicate-rubric-then-pass"
  | "entity-only-then-pass"
  | "framing-only-then-pass"
  | "gate-crash-then-pass"
  | "inline-only-then-pass"
  | "marker-only-then-pass"
  | "marker-and-date-only-then-pass"
  | "rubric-binding-only-then-pass"
  | "unchanged-then-pass";

function fakeDesignAuditRuntime(harness: Harness, workspace: string, mode: FakeDesignAuditMode): string {
  const bin = harness.makeTempDir(`design-audit-${mode}-bin`);
  const fakeCli = path.join(bin, "codex");
  writeFileSync(
    fakeCli,
    `#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
if (process.argv.includes("--version")) { console.log("fixture-runtime"); process.exit(0); }
const prompt = process.argv.at(-1);
const begin = "BEGIN_KNOWLEDGE_RECEIPT";
const end = "END_KNOWLEDGE_RECEIPT";
const receipt = JSON.parse(prompt.slice(prompt.lastIndexOf(begin) + begin.length, prompt.lastIndexOf(end)).trim());
const inputFingerprint = prompt.match(/ENGINE-BOUND INPUT FINGERPRINT:\\s*([a-f0-9]{64})/)?.[1];
if (!inputFingerprint) throw new Error("fixture prompt omitted the engine-bound input fingerprint");
const counterPath = path.join(${JSON.stringify(workspace)}, ".fixture-design-audit-count");
const count = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, "utf8")) : 0;
fs.writeFileSync(counterPath, String(count + 1));
const mode = ${JSON.stringify(mode)};
const isDesignRoom = receipt.workflowId === "workflow.design.design-room";
const isImplementationCraftAudit = receipt.workflowId === "workflow.design.implementation-craft-audit";
const valid = mode === "always-malformed" ? false : mode === "malformed-then-pass" ? count > 0 : true;
const fail = mode === "fail-then-pass" && count === 0;
const omitDecision =
  (mode === "missing-decision-then-pass" && count === 0) ||
  mode === "direct-entity-only-then-pass" ||
  mode === "direct-framing-only-then-pass" ||
  mode === "direct-inline-only-then-pass";
const contents = valid ? [
  "# Independent design-system audit",
  "",
  ...(omitDecision ? [] : [
    "## Delegated Taste Decision",
    "",
    "| Decision authority | Date | Surfaces reviewed | One-product stranger test | Copy-test | Verdict |",
    "| --- | --- | --- | --- | --- | --- |",
    "| Founder opening mandate | 2026-09-04 | Landing, onboarding, and store first frames | A stranger recognizes one coherent product from its geometry, type, and interaction hierarchy | We would rather competitors copy this specific direction than the previous generic one | " + (fail ? "fail" : "pass") + " |",
    "",
  ]),
  "## Findings",
  "",
  "Candidate input fingerprint: " + inputFingerprint,
  "",
  "Frozen rubric: design/reviews/rubrics/design-system-v1.md version RUBRIC-design-system-v1.",
  "",
  fail
    ? "Severity: major. The landing hierarchy obscures the primary action, the stranger test reads as two products, and generic copy breaks the frozen product voice."
    : "Severity: none. The frozen rubric has no unresolved blocker, high-severity finding, or major finding.",
    mode.startsWith("craft-") ||
    mode === "missing-decision-then-pass" ||
    mode === "always-pass" ||
    mode === "unchanged-then-pass" ||
    mode === "marker-only-then-pass" ||
    mode === "gate-crash-then-pass" ||
    mode.endsWith("framing-only-then-pass")
    ? "This regenerated audit observation binds attempt " + String(count + 1) + " to the current candidate."
    : "",
  ""
].join("\\n") : "# Incomplete audit\\n\\nThe reviewer supplied unstructured prose without a decision or findings.\\n";
const implementationAcceptanceContents = JSON.stringify(
  {
    schemaVersion: 1,
    reviewedAt: "2026-09-0" + String(4 + Math.min(count, 5)) + "T17:00:00.000Z",
    fixtureReviewIteration: count + 1,
    findings: ["The current native and landing implementation clears the recorded craft checks on audit attempt " + String(count + 1) + "."],
  },
  null,
  2,
) + "\\n";
const implementationReviewContents = [
  "# Independent implementation craft review",
  "",
  "## Findings",
  "",
  "Reviewed at: 2026-09-0" + String(4 + Math.min(count, 5)) + "T17:00:00.000Z",
  "",
  "Acceptance report SHA-256: " + crypto.createHash("sha256").update(implementationAcceptanceContents).digest("hex"),
  "",
  "The reviewer inspected current native and landing evidence on audit attempt " + String(count + 1) + ".",
  "",
].join("\\n");
for (const item of receipt.outputEvidence) {
  item.knowledgePaths = receipt.mandatoryKnowledge.map(entry => entry.path);
  item.summary = isDesignRoom
    ? "Changed the Design Room candidate in response to the independent findings."
    : valid
      ? "Wrote the structured decision and findings after reviewing the current candidate."
      : "Wrote incomplete audit evidence for the bounded attempt.";
  if ((mode === "missing-then-pass" || mode === "craft-missing-then-pass" || mode === "unchanged-then-pass") && count === 0) continue;
  fs.mkdirSync(path.dirname(item.outputPath), { recursive: true });
  if (isDesignRoom) {
    if (item.outputPath.endsWith(".json")) {
      const prior = JSON.parse(fs.readFileSync(item.outputPath, "utf8"));
      prior.fixtureRepairIteration = count + 1;
      fs.writeFileSync(item.outputPath, JSON.stringify(prior, null, 2) + "\\n");
    } else {
      const prior = fs.existsSync(item.outputPath) ? fs.readFileSync(item.outputPath, "utf8") : "";
      fs.writeFileSync(item.outputPath, prior + "\\n<!-- fixture Design Room repair " + String(count + 1) + " -->\\n");
    }
  } else if ((mode === "framing-only-then-pass" || mode === "direct-framing-only-then-pass") && count === 0) {
    const prior = fs.readFileSync(item.outputPath, "utf8");
    const rebound = prior.replace(/^Candidate input fingerprint:\\s*\x60?[a-f0-9]{64}\x60?\\s*$/im, "Candidate input fingerprint: " + inputFingerprint);
    const commentAnchor = mode === "direct-framing-only-then-pass" ? "## Findings" : "## Delegated Taste Decision";
    const reframed = rebound
      .replace(/^# .*$/m, "# Reframed independent design-system audit")
      .split("\\n")
      .map(line => /^\\|(?:\\s*:?-{3,}:?\\s*\\|)+$/.test(line) ? line.replace(/-{3,}/g, "-----") : line)
      .join("\\n");
    fs.writeFileSync(
      item.outputPath,
      reframed.replace(commentAnchor, "<!-- changed non-rendered framing only -->\\n\\n" + commentAnchor) + "\\n",
    );
  } else if (mode === "marker-only-then-pass" && count === 0) {
    const prior = fs.readFileSync(item.outputPath, "utf8");
    fs.writeFileSync(
      item.outputPath,
      prior.replace(/^Candidate input fingerprint:\\s*\x60?[a-f0-9]{64}\x60?\\s*$/im, "Candidate input fingerprint: " + inputFingerprint) + "\\n  \\n",
    );
  } else if (mode === "marker-and-date-only-then-pass" && count === 0) {
    const prior = fs.readFileSync(item.outputPath, "utf8");
    fs.writeFileSync(
      item.outputPath,
      prior
        .replace(/^Candidate input fingerprint:\\s*\x60?[a-f0-9]{64}\x60?\\s*$/im, "Candidate input fingerprint: " + inputFingerprint)
        .replace("| Founder opening mandate | 2026-09-04 |", "| Founder opening mandate | 2026-09-01 |"),
    );
  } else if (mode === "rubric-binding-only-then-pass" && count === 0) {
    const prior = fs.readFileSync(item.outputPath, "utf8");
    fs.writeFileSync(
      item.outputPath,
      prior
        .replace(/^Candidate input fingerprint:\\s*\x60?[a-f0-9]{64}\x60?\\s*$/im, "Candidate input fingerprint: " + inputFingerprint)
        .replace(
          "Frozen rubric: design/reviews/rubrics/design-system-v1.md version RUBRIC-design-system-v1.",
          "Frozen rubric path: design/reviews/rubrics/design-system-v1.md version RUBRIC-design-system-v1",
        ),
    );
  } else if (mode === "duplicate-rubric-then-pass" && count === 0) {
    const prior = fs.readFileSync(item.outputPath, "utf8");
    const rubric = "Frozen rubric: design/reviews/rubrics/design-system-v1.md version RUBRIC-design-system-v1.";
    fs.writeFileSync(
      item.outputPath,
      prior
        .replace(/^Candidate input fingerprint:\\s*\x60?[a-f0-9]{64}\x60?\\s*$/im, "Candidate input fingerprint: " + inputFingerprint)
        .replace(rubric, rubric + "\\n\\n" + rubric),
    );
  } else if ((mode === "entity-only-then-pass" || mode === "direct-entity-only-then-pass") && count === 0) {
    const prior = fs.readFileSync(item.outputPath, "utf8");
    fs.writeFileSync(
      item.outputPath,
      prior
        .replace(/^Candidate input fingerprint:\\s*\x60?[a-f0-9]{64}\x60?\\s*$/im, "Candidate input fingerprint: " + inputFingerprint)
        .replace(/\\bhierarchy\\b/, "hier&#97;rchy"),
    );
  } else if ((mode === "inline-only-then-pass" || mode === "direct-inline-only-then-pass") && count === 0) {
    const prior = fs.readFileSync(item.outputPath, "utf8");
    fs.writeFileSync(
      item.outputPath,
      prior
        .replace(/^Candidate input fingerprint:\\s*\x60?[a-f0-9]{64}\x60?\\s*$/im, "Candidate input fingerprint: " + inputFingerprint)
        .replace(/\\bhierarchy\\b/, "**hierarchy**"),
    );
  } else if (mode === "craft-semantic-replay-then-pass") {
    if (item.outputPath.endsWith(".json")) {
      const prior = JSON.parse(fs.readFileSync(item.outputPath, "utf8"));
      if (count > 0) prior.fixtureReviewIteration = count + 1;
      fs.writeFileSync(item.outputPath, count === 0 ? JSON.stringify(prior) : JSON.stringify(prior, null, 2) + "\\n");
    } else {
      const prior = fs.readFileSync(item.outputPath, "utf8");
      fs.writeFileSync(
        item.outputPath,
        count === 0
          ? prior + "\\nThe reviewer added a current rendered comparison across both product surfaces.\\n"
          : count === 1
            ? prior.replace(/\\n/g, "  \\n") + "\\n   \\n"
            : count === 2
              ? prior.replace(/implementation/, "implement&#97;tion")
              : prior.replace(/implement&#97;tion/, "implementation") + "\\nThe reviewer added new current-candidate interaction findings.\\n",
      );
    }
  } else if (mode === "craft-date-only-then-pass") {
    if (item.outputPath.endsWith(".json")) {
      const prior = JSON.parse(fs.readFileSync(item.outputPath, "utf8"));
      prior.reviewedAt = "2026-09-0" + String(5 + count) + "T17:00:00.000Z";
      if (count > 0) prior.fixtureReviewIteration = count + 1;
      fs.writeFileSync(item.outputPath, count === 0 ? JSON.stringify(prior) : JSON.stringify(prior, null, 2) + "\\n");
    } else {
      const prior = fs
        .readFileSync(item.outputPath, "utf8")
        .replace(/Reviewed at: [^\\n]+/, "Reviewed at: 2026-09-0" + String(5 + count) + "T17:00:00.000Z")
        .replace(/Acceptance report SHA-256: [a-f0-9]{64}/, "Acceptance report SHA-256: " + String(count + 2).repeat(64));
      fs.writeFileSync(
        item.outputPath,
        count === 0
          ? prior + "\\nThe reviewer added a current rendered comparison across both product surfaces.\\n"
          : count === 1
            ? prior
            : prior + "\\nThe reviewer added new current-candidate interaction findings.\\n",
      );
    }
  } else {
    fs.writeFileSync(
      item.outputPath,
      isImplementationCraftAudit
        ? item.outputPath.endsWith(".json")
          ? implementationAcceptanceContents
          : implementationReviewContents
        : contents,
    );
  }
}
for (const item of [...receipt.contractFiles, ...receipt.taskArtifacts, ...receipt.mandatoryKnowledge]) {
  item.sha256 = "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(item.path)).digest("hex");
}
console.log(begin + "\\n" + JSON.stringify(receipt) + "\\n" + end);
`,
    "utf8",
  );
  chmodSync(fakeCli, 0o755);
  if (
    mode === "craft-missing-then-pass" ||
    mode === "craft-date-only-then-pass" ||
    mode === "craft-malformed-then-pass" ||
    mode === "craft-producer-evidence-fail-then-pass" ||
    mode === "craft-semantic-replay-then-pass" ||
    mode === "craft-product-fail-then-pass" ||
    mode === "craft-surface-coverage-fail-then-pass" ||
    mode === "gate-crash-then-pass"
  ) {
    const fakeNpm = path.join(bin, "npm");
    writeFileSync(
      fakeNpm,
      `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const counterPath = path.join(${JSON.stringify(workspace)}, ".fixture-craft-gate-count");
const count = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, "utf8")) : 0;
fs.writeFileSync(counterPath, String(count + 1));
if (${JSON.stringify(mode)} === "craft-malformed-then-pass" && count === 0) {
  console.log("Design acceptance check\\n- ERROR design_acceptance.report The report is malformed.");
  process.exit(1);
}
if (${JSON.stringify(mode)} === "craft-product-fail-then-pass" && count === 0) {
  console.log("Design acceptance check\\n- ERROR design_acceptance.report_coverage The report duplicates or omits its own required index rows.");
  process.exit(1);
}
if (${JSON.stringify(mode)} === "craft-producer-evidence-fail-then-pass" && count === 0) {
  console.log("Design acceptance check\\n- ERROR design_acceptance.evidence_artifact The required native runtime capture is missing or unreadable.");
  process.exit(1);
}
if (${JSON.stringify(mode)} === "craft-surface-coverage-fail-then-pass" && count === 0) {
  console.log("Design acceptance check\\n- ERROR design_acceptance.surface_coverage The accepted native surface is missing from current implementation evidence.");
  process.exit(1);
}
if (${JSON.stringify(mode)} === "gate-crash-then-pass" && count === 0) {
  console.error("Synthetic deterministic gate process crashed before reporting any issue code.");
  process.exit(70);
}
console.log("Design acceptance check passed.");
`,
      "utf8",
    );
    chmodSync(fakeNpm, 0o755);
  }
  return bin;
}

function implementationCraftAuditRetryCatalog(maxAttempts = 3): CatalogInput {
  const acceptanceReference = {
    id: "reference.design.design-acceptance",
    path: "knowledge/design/design-acceptance.md",
    title: "Design Acceptance",
    loadWhen: "auditing implemented native and landing craft",
  };
  return {
    version: `catalog.session-fixture.implementation-craft-audit-retry.${maxAttempts}`,
    artifacts: [
      { id: "artifact.implementation-candidate", path: "engineering/candidate.md" },
      { id: "artifact.design-acceptance", path: "design/proofs/design-acceptance.json" },
      { id: "artifact.implementation-review", path: "design/reviews/IMPLEMENTATION_REVIEW.md" },
    ],
    workflows: [
      {
        id: "workflow.engineering.engineering-orchestration-ce-production-readiness",
        title: "Implementation candidate",
        domainId: "domain.engineering",
        actionClass: "observe",
        references: [acceptanceReference],
        dependencies: [],
        outputPaths: ["engineering/candidate.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.design.implementation-craft-audit",
        title: "Implemented mobile and landing craft audit",
        domainId: "domain.design",
        actionClass: "draft",
        instructions: "Write the candidate-bound design acceptance report and independent implementation findings.",
        references: [acceptanceReference],
        reads: ["engineering/candidate.md"],
        dependencies: ["workflow.engineering.engineering-orchestration-ce-production-readiness"],
        reviewOf: ["workflow.engineering.engineering-orchestration-ce-production-readiness"],
        outputPaths: ["design/proofs/design-acceptance.json", "design/reviews/IMPLEMENTATION_REVIEW.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: ["check:design-acceptance"],
        idempotent: true,
        maxAttempts,
        maxConsecutiveNoProgressAttempts: 2,
      },
    ],
  };
}

function seedImplementationCraftAuditRetry(handle: WorkspaceHandle, catalog: CatalogInput): void {
  mkdirSync(path.join(handle.dir, "knowledge/design"), { recursive: true });
  cpSync(path.join(skillRoot, "knowledge/design/design-acceptance.md"), path.join(handle.dir, "knowledge/design/design-acceptance.md"));
  mkdirSync(path.join(handle.dir, "engineering"), { recursive: true });
  writeFileSync(path.join(handle.dir, "engineering/candidate.md"), "# Current implementation candidate\n\nBound native and landing source.\n", "utf8");
  const plan = compilePlan(catalog);
  const businessState = JSON.parse(readFileSync(handle.statePath, "utf8")) as BusinessStateV2;
  const run = seedRunState(plan, businessState, {
    ownerSessionId: "fixture-craft-program",
    ttlSeconds: 300,
    wallClockCapSeconds: 300,
    now: "2026-09-04T17:00:00.000Z",
  });
  const producer = plan.nodes.find((candidate) => candidate.workflowId === "workflow.engineering.engineering-orchestration-ce-production-readiness")!;
  const attempt = beginAttempt(plan, run, producer.id, "fixture-implementation-producer", "2026-09-04T17:00:01.000Z");
  reconcilePatch(
    plan,
    run,
    {
      nodeId: producer.id,
      attemptId: attempt.id,
      outputs: producer.outputs.map((artifactId) => ({
        artifactId,
        path: "engineering/candidate.md",
        fingerprint: workspaceArtifactFingerprint(handle.dir, "engineering/candidate.md"),
        evidence: ["Accepted implementation fixture candidate."],
      })),
    },
    "2026-09-04T17:00:02.000Z",
  );
  run.nodes[producer.id]!.status = "succeeded";
  run.nodes[producer.id]!.attempts.at(-1)!.status = "succeeded";
  run.artifactBindings.find((binding) => binding.producedBy === producer.id)!.accepted = true;
  mkdirSync(path.join(handle.dir, "run"), { recursive: true });
  writeRunState(path.join(handle.dir, "run/run-state.json"), run);
}

/**
 * Keep a missing-report routing fixture free of unrelated product/scope parse failures.
 *
 * `check:design-acceptance` runs `validateDesignSourceReferences` first, and a DESIGN.md that
 * declares `acceptance:` is a locked design: every surface's frozen rubric must parse and resolve.
 * A workspace that named a rubric path without writing the rubric therefore failed the gate with
 * `design_source.contract_invalid` alongside the missing report — two codes, so
 * isRetryableDesignAuditGateFailure() saw a mixed result, declined the audit-only retry route, and
 * sent a Design Room rubric defect to product producers this audit never reviewed. Write the whole
 * locked design, so the only thing wrong with this workspace is the audit's own missing report.
 *
 * The references are documentation-kind on purpose: the rubric schema constrains only their count
 * and criteria coverage, and documentation evidence keeps the fixture free of the image and
 * interaction artifacts a visual reference would have to retain for a routing test that never
 * reads them.
 */
function writeAcceptedDesignInputsWithoutAuditReport(handle: WorkspaceHandle): void {
  const put = (relative: string, data: string): void => {
    mkdirSync(path.dirname(path.join(handle.dir, relative)), { recursive: true });
    writeFileSync(path.join(handle.dir, relative), data, "utf8");
  };
  put("product.yaml", "meta:\n  status: accepted\n");
  put(
    "design/reference-packs/hierarchy.md",
    "# Fixture hierarchy reference\n\nThe source keeps one dominant action per screen with a quiet supporting hierarchy.\n",
  );
  put("design/reference-packs/behavior.md", "# Fixture behavior reference\n\nThe source explains keyboard and screen-reader behavior for the primary task.\n");
  const reference = (id: string, relative: string, observation: string) => ({
    id,
    // Observed before the rubric was frozen, so the chronology rule holds.
    resolution: { status: "retained_snapshot" as const, observedAt: "2026-09-01T00:00:00.000Z", provider: "session-fixture", sourceId: id },
    url: `https://example.com/${id}`,
    kind: "documentation" as const,
    artifact: designArtifact(handle.dir, relative),
    observation,
  });
  put(
    "design/reviews/rubrics/fixture.md",
    `---\n${stringifyYaml({
      designRubric: {
        schemaVersion: 2,
        id: "fixture-craft-rubric",
        frozenAt: "2026-09-02T00:00:00.000Z",
        references: [
          reference("hierarchy", "design/reference-packs/hierarchy.md", "The source keeps one dominant action with a quiet content hierarchy."),
          reference("behavior", "design/reference-packs/behavior.md", "The source explains keyboard and screen-reader behavior for the primary task."),
        ],
        criteria: DESIGN_FACETS.map((facet) => ({
          id: facet,
          facet,
          minimum: "meets",
          condition: `Observe the product-specific ${facet} criterion during the complete user task.`,
          referenceIds: ["hierarchy", "behavior"],
        })),
      },
    })}---\n# Frozen fixture craft rubric\n`,
  );
  put(
    "DESIGN.md",
    [
      "---",
      "acceptance:",
      "  schemaVersion: 1",
      "  status: accepted",
      "  designContractPaths: []",
      "  surfaces:",
      "    - id: fixture-native-ios",
      "      surfaceId: fixture-home",
      "      kind: native",
      "      platform: ios",
      "      viewport: native",
      "      productScreenIds: [screen.fixture-home]",
      "      implementationPaths: [engineering]",
      "      rubricPath: design/reviews/rubrics/fixture.md",
      "      locales: [en]",
      "      states: [default, reduced-motion, large-text, screen-reader]",
      "      stateExclusions: []",
      "      interactions:",
      "        - id: fixture-open",
      "          action: Open the fixture native home screen.",
      "          expected: The complete fixture home state is visible.",
      "  exclusions: []",
      "---",
      "",
      "# Accepted fixture design",
      "",
    ].join("\n"),
  );
  writeJson(path.join(handle.dir, "studio/seed/business.json"), {});
}

function seedStaleImplementationCraftReplay(handle: WorkspaceHandle, catalog: CatalogInput): void {
  seedImplementationCraftAuditRetry(handle, catalog);
  const plan = compilePlan(catalog);
  const runPath = path.join(handle.dir, "run/run-state.json");
  const run = loadRunState(runPath);
  const audit = plan.nodes.find((candidate) => candidate.workflowId === "workflow.design.implementation-craft-audit")!;
  const producer = plan.nodes.find((candidate) => candidate.workflowId === "workflow.engineering.engineering-orchestration-ce-production-readiness")!;
  const jsonPath = "design/proofs/design-acceptance.json";
  const reviewPath = "design/reviews/IMPLEMENTATION_REVIEW.md";
  writeJson(path.join(handle.dir, jsonPath), {
    schemaVersion: 1,
    candidate: { sha256: "old-candidate" },
    reviewedAt: "2026-09-04T17:00:00.000Z",
    findings: ["The old implementation candidate cleared the recorded craft checks."],
  });
  mkdirSync(path.join(handle.dir, "design/reviews"), { recursive: true });
  writeFileSync(
    path.join(handle.dir, reviewPath),
    [
      "# Old implementation craft review",
      "",
      "## Findings",
      "",
      "Reviewed at: 2026-09-04T17:00:00.000Z",
      "",
      `Acceptance report SHA-256: ${"1".repeat(64)}`,
      "",
      "The old implementation candidate cleared the recorded native and landing craft checks.",
      "",
    ].join("\n"),
    "utf8",
  );
  const auditAttempt = beginAttempt(
    plan,
    run,
    audit.id,
    workerExecutionIdentity("fixture-old-craft-audit", run.runId, audit.id, 1),
    "2026-09-04T17:01:00.000Z",
  );
  reconcilePatch(
    plan,
    run,
    {
      nodeId: audit.id,
      attemptId: auditAttempt.id,
      outputs: audit.outputs.map((artifactId) => {
        const binding = run.artifactBindings.find((candidate) => candidate.artifactId === artifactId)!;
        return {
          artifactId,
          path: binding.path,
          fingerprint: workspaceArtifactFingerprint(handle.dir, binding.path),
          evidence: [`Old implementation audit fixture ${binding.path}.`],
        };
      }),
    },
    "2026-09-04T17:01:01.000Z",
  );
  run.nodes[audit.id]!.status = "succeeded";
  auditAttempt.status = "succeeded";
  for (const artifactId of audit.outputs) run.artifactBindings.find((binding) => binding.artifactId === artifactId)!.accepted = true;

  const producerAttempt = beginAttempt(plan, run, producer.id, "fixture-changed-implementation-producer", "2026-09-04T17:02:00.000Z");
  writeFileSync(
    path.join(handle.dir, "engineering/candidate.md"),
    `${readFileSync(path.join(handle.dir, "engineering/candidate.md"), "utf8")}\nChanged implementation candidate.\n`,
    "utf8",
  );
  reconcilePatch(
    plan,
    run,
    {
      nodeId: producer.id,
      attemptId: producerAttempt.id,
      outputs: producer.outputs.map((artifactId) => ({
        artifactId,
        path: "engineering/candidate.md",
        fingerprint: workspaceArtifactFingerprint(handle.dir, "engineering/candidate.md"),
        evidence: ["Changed implementation fixture candidate."],
      })),
    },
    "2026-09-04T17:02:01.000Z",
  );
  run.nodes[producer.id]!.status = "succeeded";
  producerAttempt.status = "succeeded";
  for (const artifactId of producer.outputs) run.artifactBindings.find((binding) => binding.artifactId === artifactId)!.accepted = true;
  assert(run.nodes[audit.id]!.status === "stale", "changed implementation bytes must stale the old implementation audit before replay");
  writeRunState(runPath, run);
}

function seedWaitingDesignTaste(handle: WorkspaceHandle, verdict: "pass" | "fail" = "pass"): ReturnType<typeof compilePlan> {
  writeFileSync(
    path.join(handle.dir, "DESIGN.md"),
    [
      "# Design",
      "",
      "## Taste Gate",
      "",
      "| Reviewer | Decision authority | Date | Surfaces reviewed | One-product stranger test | Copy-test | Verdict |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      `| Fixture Founder | Founder direct decision | 2026-08-01 | Landing, onboarding, and store first frames | A stranger reads one coherent product from the object geometry and hierarchy | We would rather competitors copy this specific direction than the previous one | ${verdict} |`,
      "",
    ].join("\n"),
    "utf8",
  );
  const catalog = designTasteDecisionCatalog();
  const plan = compilePlan(catalog);
  const businessState = JSON.parse(readFileSync(handle.statePath, "utf8")) as BusinessStateV2;
  const run = seedRunState(plan, businessState, {
    ownerSessionId: "fixture-design-program",
    ttlSeconds: 300,
    wallClockCapSeconds: 300,
    now: "2026-08-01T00:00:00.000Z",
  });
  const producer = plan.nodes.find((node) => node.workflowId === "workflow.design.design-room")!;
  const attempt = beginAttempt(plan, run, producer.id, "fixture-design-producer", "2026-08-01T00:00:01.000Z");
  reconcilePatch(
    plan,
    run,
    {
      nodeId: producer.id,
      attemptId: attempt.id,
      outputs: [
        {
          artifactId: producer.outputs[0]!,
          path: "DESIGN.md",
          fingerprint: workspaceArtifactFingerprint(handle.dir, "DESIGN.md"),
          evidence: ["Fixture Design Room candidate."],
        },
      ],
    },
    "2026-08-01T00:00:02.000Z",
  );
  // This fixture isolates the founder-decision edge. Model the Design Room prerequisite as
  // already accepted by its separate reviewer so the audit can become schedulable afterward.
  run.nodes[producer.id]!.status = "succeeded";
  run.nodes[producer.id]!.attempts.at(-1)!.status = "succeeded";
  run.artifactBindings.find((binding) => binding.artifactId === producer.outputs[0])!.accepted = true;
  const audit = run.nodes["run.design.design-system-audit"]!;
  audit.status = "waiting_founder";
  audit.blocker = "Taste Gate needs a direct founder decision or current delegation.";
  bindFixtureFounderTrust(handle, run, "fixture-design-decision-trust-bootstrap", "2026-08-01T00:00:03.000Z");
  mkdirSync(path.join(handle.dir, "run"), { recursive: true });
  writeRunState(path.join(handle.dir, "run", "run-state.json"), run);
  return plan;
}

function singleGrowthNodeCatalog(): CatalogInput {
  return {
    version: "catalog.session-fixture.orphan",
    artifacts: [{ id: "artifact.growth-scan", path: "growth/scan.md" }],
    workflows: [
      {
        id: "workflow.growth-scan",
        title: "Scan what people are saying",
        domainId: "domain.growth",
        actionClass: "observe",
        dependencies: [],
        outputPaths: ["growth/scan.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

/** ttlSeconds: 1 keeps the lock-liveness fixture fast — the slow-silent executor's delay is several multiples of this TTL, not real-world minutes. */
function slowSilentCatalog(): CatalogInput {
  return {
    version: "catalog.session-fixture.slow-silent",
    artifacts: [{ id: "artifact.eng-change", path: "engineering/change.log" }],
    workflows: [
      {
        id: "workflow.eng-change",
        title: "Update the onboarding copy",
        domainId: "domain.engineering",
        actionClass: "mutate",
        dependencies: [],
        outputPaths: ["engineering/change.log"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
        ttlSeconds: 1,
      },
    ],
  };
}

/** A slow executor leaves enough time to request an interactive yield while this judgment node's attempt is running. */
function slowSilentFreshContextCatalog(): CatalogInput {
  return {
    version: "catalog.session-fixture.slow-silent-fresh-context",
    artifacts: [{ id: "artifact.research-scan", path: "research/scan.md" }],
    workflows: [
      {
        id: "workflow.research-scan",
        title: "Research what people need",
        domainId: "domain.research",
        actionClass: "draft",
        dependencies: [],
        outputPaths: ["research/scan.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

/** Two independent judgment nodes let a resumed session carry older pending work while producing one exact new verification candidate. */
function resumedFreshContextCatalog(): CatalogInput {
  return {
    version: "catalog.session-fixture.resumed-fresh-context",
    artifacts: [
      { id: "artifact.research-scan", path: "research/scan.md" },
      { id: "artifact.engineering-change", path: "engineering/change.md" },
    ],
    workflows: [
      {
        id: "workflow.research-scan",
        title: "Research what people need",
        domainId: "domain.research",
        actionClass: "draft",
        dependencies: [],
        outputPaths: ["research/scan.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.engineering-change",
        title: "Apply the researched change",
        domainId: "domain.engineering",
        actionClass: "mutate",
        dependencies: [],
        outputPaths: ["engineering/change.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

function driveCooperativeYield(
  harness: Harness,
  handle: WorkspaceHandle,
  options: {
    readonly sessionId: string;
    readonly trigger: "lock-acquired" | "attempt-running";
    readonly runningNodeId?: string;
    readonly executor: "fixture" | "slow-silent";
    readonly slowDelayMs?: number;
    readonly verifier?: "fixture" | "fixture-reject";
  },
): CliResult {
  const lockPath = path.join(handle.dir, "control", "session.lock");
  const runStatePath = path.join(handle.dir, "run", "run-state.json");
  const lockModuleUrl = pathToFileURL(path.join(skillRoot, "kernel/reducer/lock.ts")).href;
  const watchdogMs = (options.slowDelayMs ?? 0) + 12_000;
  const driverPath = path.join(harness.makeTempDir(`session-yield-driver-${options.sessionId}`), "drive-yield.mts");
  const driverSource = `
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { requestInteractive } from ${JSON.stringify(lockModuleUrl)};

const child = spawn(${JSON.stringify(tsxBin)}, [
  ${JSON.stringify(runCliPath)},
  "--workspace", ${JSON.stringify(handle.dir)},
  "--brief", ${JSON.stringify(handle.briefPath)},
  "--session", ${JSON.stringify(options.sessionId)},
  "--executor", ${JSON.stringify(options.executor)},
  ${options.slowDelayMs === undefined ? "" : `"--slow-delay-ms", ${JSON.stringify(String(options.slowDelayMs))},`}
  "--verifier", ${JSON.stringify(options.verifier ?? "fixture")},
  "--lock-retries", "0",
], { cwd: ${JSON.stringify(skillRoot)}, env: (() => { const env = { ...process.env }; delete env.RESEND_API_KEY; return env; })() });

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });

const exitPromise = new Promise((resolve, reject) => {
  const watchdog = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new Error("cooperative-yield driver timed out"));
  }, ${watchdogMs});
  watchdog.unref();
  child.on("exit", (code, signal) => { clearTimeout(watchdog); resolve({ code, signal }); });
  child.on("error", (error) => { clearTimeout(watchdog); reject(error); });
});

function lockIsOwned() {
  if (!existsSync(${JSON.stringify(lockPath)})) return false;
  try {
    return JSON.parse(readFileSync(${JSON.stringify(lockPath)}, "utf8")).ownerSessionId === ${JSON.stringify(options.sessionId)};
  } catch {
    return false;
  }
}

function targetAttemptIsRunning() {
  if (!existsSync(${JSON.stringify(runStatePath)})) return false;
  try {
    const run = JSON.parse(readFileSync(${JSON.stringify(runStatePath)}, "utf8"));
    const state = run.nodes?.[${JSON.stringify(options.runningNodeId ?? "")}];
    const attempts = Array.isArray(state?.attempts) ? state.attempts : [];
    const latest = attempts[attempts.length - 1];
    return latest?.ownerSessionId === ${JSON.stringify(options.sessionId)} && latest?.status === "running";
  } catch {
    return false;
  }
}

async function main() {
  const deadline = Date.now() + 8_000;
  while (!(${options.trigger === "lock-acquired" ? "lockIsOwned()" : "targetAttemptIsRunning()"})) {
    if (child.exitCode !== null) throw new Error("session exited before the requested yield seam\\n" + stdout + "\\n" + stderr);
    if (Date.now() >= deadline) {
      child.kill("SIGKILL");
      throw new Error("timed out waiting for the requested yield seam\\n" + stdout + "\\n" + stderr);
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  if (${JSON.stringify(options.trigger)} === "lock-acquired") {
    child.kill("SIGSTOP");
    if (!lockIsOwned()) throw new Error("session lock disappeared before the pre-batch request");
  }
  requestInteractive(${JSON.stringify(lockPath)});
  if (${JSON.stringify(options.trigger)} === "lock-acquired") child.kill("SIGCONT");

  const exit = await exitPromise;
  if (exit.code !== 0) throw new Error("session exited " + String(exit.code) + " signal " + String(exit.signal) + "\\n" + stdout + "\\n" + stderr);
  console.log("COOPERATIVE_YIELD_DRIVER_OK");
}

main().catch((error) => { console.error(String(error?.stack ?? error)); process.exit(1); });
`;
  writeFileSync(driverPath, driverSource, "utf8");
  const result = spawnSync(tsxBin, [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: watchdogMs + 10_000 });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function researchScanCatalog(version: string): CatalogInput {
  return {
    version,
    artifacts: [{ id: "artifact.research-scan", path: "research/scan.md" }],
    workflows: [
      {
        id: "workflow.research-scan",
        title: "Research what people need",
        domainId: "domain.research",
        actionClass: "draft",
        dependencies: [],
        outputPaths: ["research/scan.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

function seedWorkspacePendingResearch(handle: WorkspaceHandle, catalog: CatalogInput, producer: string): void {
  mkdirSync(path.join(handle.dir, "research"), { recursive: true });
  writeFileSync(path.join(handle.dir, "research/scan.md"), "Workspace research scan.\n", "utf8");
  const plan = compilePlan(catalog, "2026-09-11T16:00:00.000Z");
  const businessState = JSON.parse(readFileSync(handle.statePath, "utf8")) as BusinessStateV2;
  const run = seedRunState(plan, businessState, {
    ownerSessionId: producer,
    ttlSeconds: 600,
    wallClockCapSeconds: 3600,
    now: "2026-09-11T16:00:00.000Z",
  });
  const nodeId = "run.research-scan" as RunNodeId;
  const attempt = beginAttempt(plan, run, nodeId, producer, "2026-09-11T16:00:01.000Z");
  attempt.proofSource = "workspace";
  reconcilePatch(
    plan,
    run,
    {
      nodeId,
      attemptId: attempt.id,
      outputs: [
        {
          artifactId: "artifact.research-scan",
          path: "research/scan.md",
          fingerprint: workspaceArtifactFingerprint(handle.dir, "research/scan.md"),
          evidence: ["workspace bytes produced"],
        },
      ],
    },
    "2026-09-11T16:00:02.000Z",
  );
  mkdirSync(path.join(handle.dir, "run"), { recursive: true });
  writeRunState(path.join(handle.dir, "run/run-state.json"), run);
}

function proofStrengthLine(handle: WorkspaceHandle): string | undefined {
  return readRunState(handle).nodes["run.research-scan"]!.attempts.at(-1)?.independentVerification?.evidence.find((line) =>
    line.startsWith("Proof strength:"),
  );
}

export function register(harness: Harness): void {
  // --- scenario 1: all nodes gated exits cleanly with a parked digest, not silence -----------

  harness.check("session: a session with all nodes gated exits cleanly with a populated 'parked' digest, not silence", () => {
    const handle = bootstrapWorkspace(harness, "all-gated", singleNodeCatalog(), { grants: {} }); // no grants at all: everything parks
    const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-all-gated-1"]);
    assert(result.code === 0, `expected exit 0 for a cleanly-parked session, got ${result.code}: ${result.output}`);

    const text = readDigest(handle, "sess-all-gated-1");
    assert(text.includes("Nothing moved forward this time."), `expected an explicit 'nothing moved forward' line, got:\n${text}`);
    assert(text.includes("Update the onboarding copy"), `expected the gated node's title in the digest, got:\n${text}`);
    assert(!text.includes("Nothing is waiting on you right now."), `expected the parked section to be populated (not the empty state), got:\n${text}`);
    assert(text.includes("You haven't told me how much I can do in this area yet."), `expected the translated no-grant reason, got:\n${text}`);
    assertNoInternalVocabulary("all-gated", text);
  });

  // --- scenario 2: digest content (advanced/parked/spend/anomalies), founder vocabulary only -

  harness.check(
    "session: digest content is populated from run state (advanced/parked/spend) in founder vocabulary only, and push-skipped-no-from-address is recorded",
    () => {
      const period = currentPeriod();
      const handle = bootstrapWorkspace(harness, "comprehensive", comprehensiveCatalog(), {
        grants: { "domain.growth": grant("domain.growth", "review-first"), "domain.money": grant("domain.money", "full") },
        waivers: [waiver("waiver.money.1", "domain.money", "spend", "spend")],
        balances: [
          { unit: "Revenue", period, currency: "USD", allocated: 1000, committed: 0, spent: 0, remaining: 1000, updatedAt: "2026-08-01T00:00:00.000Z" },
        ],
        pendingGates: [
          {
            id: "gate.eng-change",
            category: "other",
            reason: "Update the onboarding copy",
            createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
          },
        ],
      });

      const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-comprehensive-1", "--executor", "fixture"]);
      assert(result.code === 0, `expected exit 0, got ${result.code}: ${result.output}`);

      const text = readDigest(handle, "sess-comprehensive-1");
      assert(text.includes("Scan what people are saying"), `expected the observe node in 'advanced', got:\n${text}`);
      assert(text.includes("Pull this week's revenue report"), `expected the spend node in 'advanced', got:\n${text}`);
      assert(text.includes("Update the onboarding copy"), `expected the ungranted node in 'parked', got:\n${text}`);
      assert(
        text.includes("You haven't told me how much I can do in this area yet."),
        `expected the translated no-grant reason for the parked node, got:\n${text}`,
      );
      assert(/waiting 3 days?/.test(text), `expected an age annotation on the parked founder-gate item, got:\n${text}`);
      assert(text.includes("$25.00 of $1000.00 spent"), `expected the spend section to reflect the recorded actual, got:\n${text}`);
      assert(text.includes("$975.00 left"), `expected the spend section to reflect the decremented remaining balance, got:\n${text}`);
      // run.ts calls pushDigest() with no `from` argument (that's the exact integration point the
      // provisioning layer's from-address config is meant to fill in later — see adapters/provisioning),
      // so today this always skips on the from-address check, before the key is even looked at.
      assert(
        text.includes("Sent to your inbox: skipped (the digest from-address isn't configured yet"),
        `expected a push-skipped-no-from-address line, got:\n${text}`,
      );
      assertNoInternalVocabulary("comprehensive", text);
    },
  );

  // --- judgment scenario: a node execution failure is reported, not silently dropped ---------

  harness.check("session: a node execution failure is neither 'advanced' nor silently dropped — it shows up as something to watch", () => {
    const handle = bootstrapWorkspace(harness, "exec-failure", singleNodeCatalog(), {
      grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
    });
    // Explicit no-op mode fails every attempt without invoking a real worker CLI.
    const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-exec-failure-1", "--executor", "noop"]);
    assert(result.code === 0, `expected exit 0 (a node failure is not a session crash), got ${result.code}: ${result.output}`);

    const text = readDigest(handle, "sess-exec-failure-1");
    assert(text.includes("Update the onboarding copy"), `expected the failed node's title to be named, got:\n${text}`);
    assert(text.includes("didn't go through"), `expected the execution failure to be reported as an anomaly rather than silently dropped, got:\n${text}`);
    assert(!text.includes("Nothing out of the ordinary."), `expected the anomalies section to be populated, got:\n${text}`);
    const advancedSection = text.split("## What moved forward")[1]!.split("## Needs your call")[0]!;
    assert(
      !advancedSection.includes("Update the onboarding copy"),
      `a failed node must not be reported as 'advanced', got advanced section:\n${advancedSection}`,
    );
    assertNoInternalVocabulary("exec-failure", text);
  });

  // --- judgment scenario: a node that already exhausted its retries must park, never crash the whole session ----

  harness.check(
    "session: a node that already exhausted its retry budget is parked for that node only — the session keeps going and other nodes still advance",
    () => {
      const handle = bootstrapWorkspace(harness, "exhausted-attempts", exhaustibleTwoNodeCatalog(), {
        grants: { "domain.growth": grant("domain.growth", "review-first"), "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
      });

      // Pre-seed run-state with workflow.eng-change already at its (maxAttempts: 1) ceiling, status
      // still "pending" so frontier still offers it as ready — this is exactly the shape beginAttempt
      // throws on (state.attempts.length >= node.maxAttempts) if the dispatch loop doesn't guard it.
      const catalog = exhaustibleTwoNodeCatalog();
      const plan = compilePlan(catalog, "2026-08-01T00:00:00.000Z");
      const businessState = JSON.parse(readFileSync(handle.statePath, "utf8"));
      const run = seedRunState(plan, businessState, {
        ownerSessionId: "prior-session",
        ttlSeconds: 300,
        wallClockCapSeconds: 1800,
        now: "2026-08-01T00:00:00.000Z",
      });
      const engNodeId = plan.nodes.find((node) => node.id.includes("eng-change"))!.id;
      run.nodes[engNodeId]!.attempts.push({
        id: `${engNodeId}.attempt.1`,
        nodeId: engNodeId,
        number: 1,
        status: "failed",
        ownerSessionId: "prior-session",
        heartbeatAt: "2026-08-01T00:00:00.000Z",
        ttlSeconds: 300,
        inputFingerprint: "x",
        startedAt: "2026-08-01T00:00:00.000Z",
        finishedAt: "2026-08-01T00:00:05.000Z",
        evidence: [],
        readbackRequired: false,
      });
      mkdirSync(path.join(handle.dir, "run"), { recursive: true });
      writeRunState(path.join(handle.dir, "run", "run-state.json"), run);

      const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-exhausted-1", "--executor", "fixture"]);
      assert(result.code === 0, `expected exit 0 — an exhausted-attempts node must park, not crash the whole session, got ${result.code}: ${result.output}`);

      const text = readDigest(handle, "sess-exhausted-1");
      assert(!text.toLowerCase().includes("something went wrong"), `expected no whole-session crash framing, got:\n${text}`);
      assert(
        text.includes("Scan what people are saying"),
        `expected the independent, healthy node to still advance despite the other node's exhausted retries, got:\n${text}`,
      );
      const advancedSection = text.split("## What moved forward")[1]?.split("## Needs your call")[0] ?? "";
      assert(
        !advancedSection.includes("Update the onboarding copy"),
        `the exhausted-attempts node must not be reported as advanced, got advanced section:\n${advancedSection}`,
      );
      assert(
        text.includes("Update the onboarding copy"),
        `expected the exhausted-attempts node's title to still be named (parked, not vanished), got:\n${text}`,
      );
      assert(text.includes("stopped trying it automatically"), `expected the translated exhausted-attempts blocker text, got:\n${text}`);
      assertNoInternalVocabulary("exhausted-attempts", text);
    },
  );

  // --- judgment scenario: an internal crash never leaks engine vocabulary into the digest ----

  harness.check("session: an internal crash after compatibility is reported without leaking engine vocabulary, and still exits non-zero", () => {
    const handle = bootstrapWorkspace(harness, "crash", singleNodeCatalog());
    // A stale expected version is shape-valid and executable, so it passes the read-only
    // compatibility boundary and then exercises the session's internal crash/digest path.
    const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-crash-1"], {
      B2C_EXPECTED_CATALOG_VERSION: "catalog.session-fixture.unexpected",
    });
    assert(result.code === 1, `expected exit 1 on an internal crash, got ${result.code}: ${result.output}`);

    const text = readDigest(handle, "sess-crash-1");
    assert(text.toLowerCase().includes("unexpected"), `expected a plain 'something went wrong' anomaly, got:\n${text}`);
    assertNoInternalVocabulary("crash", text);
  });

  // --- scenario 3: preflight failure -> anomalies digest entry + non-zero exit ---------------

  harness.check("session: a preflight failure (state-hash mismatch) produces an anomalies digest entry and a non-zero exit, never a silent death", () => {
    const handle = bootstrapWorkspace(harness, "preflight-fail", singleNodeCatalog());
    // Out-of-band edit: mutate business-state.json directly, bypassing the reducer entirely.
    const doc = JSON.parse(readFileSync(handle.statePath, "utf8")) as { project: { name: string } };
    doc.project.name = "Tampered Directly";
    writeJson(handle.statePath, doc);

    const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-preflight-fail-1"]);
    assert(result.code === 3, `expected exit 3 on preflight failure, got ${result.code}: ${result.output}`);

    const text = readDigest(handle, "sess-preflight-fail-1");
    assert(
      text.toLowerCase().includes("saved files") || text.toLowerCase().includes("changed them outside"),
      `expected an anomaly describing the out-of-band edit, got:\n${text}`,
    );
    assert(!text.includes("Nothing out of the ordinary."), `expected the anomalies section to be populated, not the empty state, got:\n${text}`);
    assertNoInternalVocabulary("preflight-fail", text);
  });

  // --- scenario 4: wall-clock cap exceeded -> timed-out digest entry -------------------------

  harness.check("session: a run exceeding its wall-clock cap stops on purpose and writes a timed-out digest entry", () => {
    const period = currentPeriod();
    const handle = bootstrapWorkspace(harness, "timeout", comprehensiveCatalog(), {
      grants: { "domain.growth": grant("domain.growth", "review-first"), "domain.money": grant("domain.money", "full") },
      waivers: [waiver("waiver.money.1", "domain.money", "spend", "spend")],
      balances: [{ unit: "Revenue", period, currency: "USD", allocated: 1000, committed: 0, spent: 0, remaining: 1000, updatedAt: "2026-08-01T00:00:00.000Z" }],
    });

    const result = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "sess-timeout-1",
      "--executor",
      "fixture",
      "--wall-clock-seconds",
      "0",
    ]);
    assert(result.code === 0, `expected exit 0 for a graceful timeout, got ${result.code}: ${result.output}`);

    const text = readDigest(handle, "sess-timeout-1");
    assert(text.includes("ran out of time") || text.includes("hit my time limit"), `expected timed-out language in the digest, got:\n${text}`);
    assert(text.includes("Nothing moved forward this time."), `expected zero progress once the cap was already exceeded at session start, got:\n${text}`);
    assertNoInternalVocabulary("timeout", text);
  });

  // --- scenario 5: crash before digest -> next session detects the orphaned run --------------

  harness.check("session: a crash before the digest is detected as an orphaned run by the next session and reported in its digest", () => {
    const handle = bootstrapWorkspace(harness, "orphan", singleGrowthNodeCatalog(), { grants: { "domain.growth": grant("domain.growth", "review-first") } });

    // Simulate a prior session that crashed mid-attempt: seed a plan/run and hand-craft a stale "running" attempt, then write it directly (this IS the engine's own file, not reducer-owned).
    const catalog = singleGrowthNodeCatalog();
    const plan = compilePlan(catalog, "2026-08-01T00:00:00.000Z");
    const businessState = JSON.parse(readFileSync(handle.statePath, "utf8"));
    const run = seedRunState(plan, businessState, {
      ownerSessionId: "prior-crashed-session",
      ttlSeconds: 300,
      wallClockCapSeconds: 1800,
      now: "2026-08-01T00:00:00.000Z",
    });
    const nodeId = plan.nodes[0]!.id;
    const staleHeartbeat = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    run.nodes[nodeId]!.status = "running";
    run.nodes[nodeId]!.attempts.push({
      id: `${nodeId}.attempt.1`,
      nodeId,
      number: 1,
      status: "running",
      ownerSessionId: "prior-crashed-session",
      heartbeatAt: staleHeartbeat,
      ttlSeconds: 300,
      inputFingerprint: "x",
      startedAt: staleHeartbeat,
      evidence: [],
      readbackRequired: false,
    });
    mkdirSync(path.join(handle.dir, "run"), { recursive: true });
    writeRunState(path.join(handle.dir, "run", "run-state.json"), run);

    const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-orphan-2", "--executor", "fixture"]);
    assert(result.code === 0, `expected exit 0, got ${result.code}: ${result.output}`);

    const text = readDigest(handle, "sess-orphan-2");
    assert(text.includes("didn't finish cleanly last session"), `expected an orphan anomaly, got:\n${text}`);
    assert(
      text.includes("Scan what people are saying"),
      `expected the orphaned (idempotent) node to be retried and appear in 'advanced' this session, got:\n${text}`,
    );
    assertNoInternalVocabulary("orphan", text);
  });

  // --- judgment scenario: lock back-off digest ------------------------------------------------

  harness.check("session: lock contention backs off, exits 2, and still writes a 'did not run' digest", () => {
    const handle = bootstrapWorkspace(harness, "lock-contention", singleNodeCatalog());
    const lockPath = path.join(handle.dir, "control", "session.lock");
    const held = acquireLock(lockPath, { ownerSessionId: "other-session", ttlSeconds: 60 });
    assert(held.ok, "test setup: failed to pre-acquire the session lock");

    const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-lock-1", "--lock-retries", "0"]);
    assert(result.code === 2, `expected exit 2 on lock contention, got ${result.code}: ${result.output}`);

    const text = readDigest(handle, "sess-lock-1");
    assert(text.toLowerCase().includes("backed off") || text.toLowerCase().includes("locked"), `expected a lock-contention anomaly, got:\n${text}`);
    assertNoInternalVocabulary("lock-contention", text);

    releaseLock(lockPath, "other-session");
  });

  // --- judgment scenario: lock/attempt heartbeat liveness does not depend on the executor -----
  // Run as a spawned driver script (same reason as the pushDigest driver below: this needs to
  // poll a *running* child process while it executes, which the shared harness's synchronous
  // `check` cannot do). The driver spawns run.ts itself against the --executor slow-silent stand-
  // in (kernel/session/executor.ts), which sleeps well past the (deliberately tiny) TTL window and
  // never calls context.heartbeat() — proving the session's own timer, not executor cooperation,
  // is what keeps the lock's heartbeatAt fresh. The driver also bounds the child with a watchdog:
  // if a lingering un-cleared timer kept the runner's event loop alive, the child would never emit
  // its own 'exit' and the watchdog would fire, failing the test instead of hanging the suite.

  harness.check(
    "session: a slow, silent executor that never calls context.heartbeat still gets its lock/attempt heartbeat refreshed by the session's own timer, staying fresh past the TTL window, and the runner exits cleanly with no lingering handle",
    () => {
      const handle = bootstrapWorkspace(harness, "slow-silent-heartbeat", slowSilentCatalog(), {
        grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
      });
      const lockPath = path.join(handle.dir, "control", "session.lock");
      const sessionId = "sess-slow-silent-1";
      const ttlSeconds = 1;
      // 6s (not 3s): more heartbeat-interval ticks (~333ms each) means a single delayed tick from
      // host scheduling jitter costs less of the "at least 3 distinct refreshes" budget below.
      const slowDelayMs = 6000;
      const watchdogMs = slowDelayMs + 10_000;

      const driverPath = path.join(harness.makeTempDir("session-heartbeat-driver"), "drive-heartbeat.mts");
      const driverSource = `
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const tsxBin = ${JSON.stringify(tsxBin)};
const runCliPath = ${JSON.stringify(runCliPath)};
const skillRoot = ${JSON.stringify(skillRoot)};
const workspace = ${JSON.stringify(handle.dir)};
const briefPath = ${JSON.stringify(handle.briefPath)};
const lockPath = ${JSON.stringify(lockPath)};
const ttlSeconds = ${ttlSeconds};
const slowDelayMs = ${slowDelayMs};
const watchdogMs = ${watchdogMs};

function readLockHeartbeat() {
  if (!existsSync(lockPath)) return undefined;
  try {
    return JSON.parse(readFileSync(lockPath, "utf8")).heartbeatAt;
  } catch {
    return undefined;
  }
}

async function main() {
  const env = { ...process.env };
  delete env.RESEND_API_KEY;
  const child = spawn(tsxBin, [
    runCliPath,
    "--workspace", workspace,
    "--brief", briefPath,
    "--session", ${JSON.stringify(sessionId)},
    "--executor", "slow-silent",
    "--slow-delay-ms", String(slowDelayMs),
    "--lock-ttl-seconds", String(ttlSeconds),
    "--lock-retries", "0",
  ], { cwd: skillRoot, env });

  const seen = [];
  const poller = setInterval(() => {
    const hb = readLockHeartbeat();
    if (hb && seen[seen.length - 1] !== hb) seen.push(hb);
  }, 100);

  const exitInfo = await new Promise((resolve, reject) => {
    const watchdog = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("runner did not exit within the watchdog window (" + watchdogMs + "ms) — a lingering handle likely kept the process alive"));
    }, watchdogMs);
    watchdog.unref();
    child.on("exit", (code, signal) => {
      clearTimeout(watchdog);
      resolve({ code, signal });
    });
    child.on("error", (error) => {
      clearTimeout(watchdog);
      reject(error);
    });
  });
  clearInterval(poller);

  if (exitInfo.code !== 0) throw new Error("expected exit 0, got " + exitInfo.code + " signal " + String(exitInfo.signal));
  if (seen.length < 3) throw new Error("expected at least 3 distinct lock heartbeat refreshes during the " + slowDelayMs + "ms slow execution (TTL " + ttlSeconds + "s), saw " + seen.length + ": " + JSON.stringify(seen));

  // kernel/reducer/lock.ts's own isStale() has no grace period at all (gap > ttlSeconds*1000 is
  // stale, full stop) — that bare comparison is only evaluated when a second session actually
  // contends for the lock, never proactively against a live holder. The per-tick interval this
  // proves out (kernel/session/run.ts: ttlSeconds*1000/3, here ~333ms) is what keeps a real
  // contended gap far under that bound in practice. The tolerance below is deliberately much
  // looser than either of those: Node's setInterval is best-effort, not real-time, and a spawned
  // child two process-hops deep (harness -> driver -> run.ts) can lose the CPU for a second or
  // more on a busy host without any regression in the mechanism itself. This check exists to
  // catch the timer not firing at all (interval math regresses, unref/clearInterval breaks, etc.)
  // — a real break shows up as a gap near the full slowDelayMs, not a one-or-two-tick slip.
  for (let i = 1; i < seen.length; i++) {
    const gapMs = Date.parse(seen[i]) - Date.parse(seen[i - 1]);
    const toleranceMs = Math.max(ttlSeconds * 1000 * 5, 5000);
    if (gapMs > toleranceMs) {
      throw new Error("heartbeat gap " + gapMs + "ms between refreshes exceeded the liveness tolerance (TTL " + (ttlSeconds * 1000) + "ms, tolerance " + toleranceMs + "ms) — the lock would have gone stale mid-execution: " + JSON.stringify(seen));
    }
  }

  console.log("HEARTBEAT_DRIVER_OK " + seen.length + " refreshes, clean exit, code " + exitInfo.code);
}
main().catch((error) => { console.error(String((error && error.stack) || error)); process.exit(1); });
`;
      writeFileSync(driverPath, driverSource, "utf8");
      const result = spawnSync(tsxBin, [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: watchdogMs + 15_000 });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      assert(
        result.status === 0 && output.includes("HEARTBEAT_DRIVER_OK"),
        `heartbeat-liveness driver failed (exit ${result.status}, signal ${result.signal}):\n${output}`,
      );
    },
  );

  harness.check("session: ordinary empty-frontier completion invokes an unavailable verifier only once", () => {
    const handle = bootstrapWorkspace(harness, "unavailable-verifier-single-sweep", slowSilentFreshContextCatalog(), {
      grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
    });
    const sessionId = "sess-unavailable-verifier-single-sweep-1";
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        sessionId,
        "--executor",
        "fixture",
        "--verifier",
        "cli",
        "--worker-runtime",
        "cursor",
        "--lock-retries",
        "0",
      ],
      { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin` },
    );
    assert(result.code === 0, `expected exit 0 with an unavailable verifier, got ${result.code}: ${result.output}`);
    const unavailableCalls = result.output.match(/session\.verifier_unavailable/g)?.length ?? 0;
    assert(unavailableCalls === 1, `ordinary completion must run the unavailable verifier once, got ${unavailableCalls}:\n${result.output}`);
  });

  harness.check("session: a cooperative yield before any dispatch batch never verifies older pending work", () => {
    const handle = bootstrapWorkspace(harness, "yield-before-batch", resumedFreshContextCatalog(), {
      grants: {
        "domain.research": grant("domain.research", "run-with-guardrails"),
        "domain.engineering": grant("domain.engineering", "run-with-guardrails"),
      },
      scopeHints: ["domain.research"],
    });
    const seeded = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "sess-yield-before-batch-seed",
      "--executor",
      "fixture",
      "--verifier",
      "off",
    ]);
    assert(seeded.code === 0, `expected seed exit 0, got ${seeded.code}: ${seeded.output}`);

    const before = readRunState(handle);
    const oldNodeBefore = JSON.stringify(before.nodes["run.research-scan"]);
    const oldBindingBefore = JSON.stringify(before.artifactBindings.find((binding) => binding.artifactId === "artifact.research-scan"));
    assert(
      before.nodes["run.research-scan"]?.status === "blocked" && before.nodes["run.research-scan"]?.blocker === "Verification required",
      `seed session must leave the research output pending verification, got ${oldNodeBefore}`,
    );

    const brief = JSON.parse(readFileSync(handle.briefPath, "utf8")) as { scopeHints?: string[] };
    brief.scopeHints = ["domain.research", "domain.engineering"];
    writeFileSync(handle.briefPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8");
    const sessionId = "sess-yield-before-batch-2";
    const driven = driveCooperativeYield(harness, handle, { sessionId, trigger: "lock-acquired", executor: "fixture" });
    assert(driven.code === 0 && driven.output.includes("COOPERATIVE_YIELD_DRIVER_OK"), `pre-batch cooperative-yield driver failed:\n${driven.output}`);

    const after = readRunState(handle);
    assert(
      !Object.values(after.nodes).some((state) => state.attempts.some((attempt) => attempt.ownerSessionId === sessionId)),
      `the pre-batch yield must occur before this session owns an attempt: ${JSON.stringify(after.nodes)}`,
    );
    assert(JSON.stringify(after.nodes["run.research-scan"]) === oldNodeBefore, "pre-batch yield must leave the older pending node byte-for-byte unchanged");
    assert(
      JSON.stringify(after.artifactBindings.find((binding) => binding.artifactId === "artifact.research-scan")) === oldBindingBefore,
      "pre-batch yield must leave the older pending artifact binding byte-for-byte unchanged",
    );
    const verifierEntries = readAuditEntries(handle).filter((entry) => entry.sessionId === `${sessionId}.verifier`);
    assert(verifierEntries.length === 0, `pre-batch yield must not invoke or attest a verifier, got ${JSON.stringify(verifierEntries)}`);
  });

  harness.check("session: cooperative-yield verification is limited to fresh-context output from the completed new batch", () => {
    const handle = bootstrapWorkspace(harness, "yield-new-candidates-only", resumedFreshContextCatalog(), {
      grants: {
        "domain.research": grant("domain.research", "run-with-guardrails"),
        "domain.engineering": grant("domain.engineering", "run-with-guardrails"),
      },
      scopeHints: ["domain.research"],
    });
    const seeded = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "sess-yield-new-candidates-seed",
      "--executor",
      "fixture",
      "--verifier",
      "off",
    ]);
    assert(seeded.code === 0, `expected seed exit 0, got ${seeded.code}: ${seeded.output}`);
    const before = readRunState(handle);
    const oldNodeBefore = JSON.stringify(before.nodes["run.research-scan"]);
    const oldBindingBefore = JSON.stringify(before.artifactBindings.find((binding) => binding.artifactId === "artifact.research-scan"));

    const brief = JSON.parse(readFileSync(handle.briefPath, "utf8")) as { scopeHints?: string[] };
    brief.scopeHints = ["domain.research", "domain.engineering"];
    writeFileSync(handle.briefPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8");
    const sessionId = "sess-yield-new-candidates-2";
    const driven = driveCooperativeYield(harness, handle, {
      sessionId,
      trigger: "attempt-running",
      runningNodeId: "run.engineering-change",
      executor: "slow-silent",
      slowDelayMs: 700,
    });
    assert(driven.code === 0 && driven.output.includes("COOPERATIVE_YIELD_DRIVER_OK"), `mid-batch cooperative-yield driver failed:\n${driven.output}`);

    const after = readRunState(handle);
    assert(JSON.stringify(after.nodes["run.research-scan"]) === oldNodeBefore, "the older pending node must remain durable and unjudged");
    assert(
      JSON.stringify(after.artifactBindings.find((binding) => binding.artifactId === "artifact.research-scan")) === oldBindingBefore,
      "the older pending artifact binding must remain durable and unjudged",
    );
    const newNode = after.nodes["run.engineering-change"];
    assert(
      newNode?.status === "succeeded" && newNode.verifiedBySessionId === `${sessionId}.verifier`,
      `the new batch output must be independently verified before the cooperative yield, got ${JSON.stringify(newNode)}`,
    );
    const verifierEntries = readAuditEntries(handle).filter((entry) => entry.sessionId === `${sessionId}.verifier` && entry.action === "verification_accepted");
    assert(
      verifierEntries.length === 1 && String(verifierEntries[0]?.summary).startsWith("run.engineering-change:"),
      `only the exact new batch output may be attested by this verifier, got ${JSON.stringify(verifierEntries)}`,
    );

    const newBinding = after.artifactBindings.find((binding) => binding.artifactId === "artifact.engineering-change");
    assert(
      newBinding?.accepted === true && newBinding.attemptId === newNode.attempts.at(-1)?.id,
      "the completed batch must retain its accepted output binding",
    );
    assert(newNode.attempts.at(-1)?.ownerSessionId === sessionId, "the new output must retain its producer identity");
    assertCheckpointMatches(handle, after, sessionId);
  });

  harness.check("session: a cooperative yield requested during a fresh-context attempt still verifies the completed batch before yielding", () => {
    const handle = bootstrapWorkspace(harness, "yield-final-verification", slowSilentFreshContextCatalog(), {
      grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
    });
    const lockPath = path.join(handle.dir, "control", "session.lock");
    const runStatePath = path.join(handle.dir, "run", "run-state.json");
    const sessionId = "sess-yield-final-verification-1";
    const slowDelayMs = 1500;
    const watchdogMs = slowDelayMs + 10_000;
    const lockModuleUrl = pathToFileURL(path.join(skillRoot, "kernel/reducer/lock.ts")).href;

    // The shared harness is synchronous, so a small async driver owns the running child and
    // asks it to yield only after durable run-state proves the producer attempt is in flight.
    const driverPath = path.join(harness.makeTempDir("session-yield-final-verification-driver"), "drive-yield.mts");
    const driverSource = `
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { requestInteractive } from ${JSON.stringify(lockModuleUrl)};

const tsxBin = ${JSON.stringify(tsxBin)};
const runCliPath = ${JSON.stringify(runCliPath)};
const skillRoot = ${JSON.stringify(skillRoot)};
const workspace = ${JSON.stringify(handle.dir)};
const briefPath = ${JSON.stringify(handle.briefPath)};
const lockPath = ${JSON.stringify(lockPath)};
const runStatePath = ${JSON.stringify(runStatePath)};
const sessionId = ${JSON.stringify(sessionId)};
const slowDelayMs = ${slowDelayMs};
const watchdogMs = ${watchdogMs};

function attemptIsRunning() {
  if (!existsSync(runStatePath)) return false;
  try {
    const run = JSON.parse(readFileSync(runStatePath, "utf8"));
    return Object.values(run.nodes ?? {}).some((state) => {
      const attempts = Array.isArray(state?.attempts) ? state.attempts : [];
      return attempts.length > 0 && attempts[attempts.length - 1]?.status === "running";
    });
  } catch {
    return false;
  }
}

async function main() {
  const env = { ...process.env };
  delete env.RESEND_API_KEY;
  const child = spawn(tsxBin, [
    runCliPath,
    "--workspace", workspace,
    "--brief", briefPath,
    "--session", sessionId,
    "--executor", "slow-silent",
    "--slow-delay-ms", String(slowDelayMs),
    "--verifier", "fixture",
    "--lock-retries", "0",
  ], { cwd: skillRoot, env });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const exitInfoPromise = new Promise((resolve, reject) => {
    const watchdog = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("runner did not exit within the cooperative-yield watchdog window (" + watchdogMs + "ms)"));
    }, watchdogMs);
    watchdog.unref();
    child.on("exit", (code, signal) => {
      clearTimeout(watchdog);
      resolve({ code, signal });
    });
    child.on("error", (error) => {
      clearTimeout(watchdog);
      reject(error);
    });
  });

  const runningDeadline = Date.now() + 8_000;
  while (!attemptIsRunning()) {
    if (child.exitCode !== null) {
      throw new Error("runner exited before its attempt reached running state (code " + child.exitCode + ")\\n" + stdout + "\\n" + stderr);
    }
    if (Date.now() >= runningDeadline) {
      child.kill("SIGKILL");
      throw new Error("timed out waiting for the slow-silent attempt to reach running state\\n" + stdout + "\\n" + stderr);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  requestInteractive(lockPath);
  const exitInfo = await exitInfoPromise;
  if (exitInfo.code !== 0) {
    throw new Error("expected runner exit 0 after cooperative yield, got " + exitInfo.code + " signal " + String(exitInfo.signal) + "\\n" + stdout + "\\n" + stderr);
  }
  console.log("COOPERATIVE_YIELD_DRIVER_OK");
}
main().catch((error) => { console.error(String((error && error.stack) || error)); process.exit(1); });
`;
    writeFileSync(driverPath, driverSource, "utf8");
    const driven = spawnSync(tsxBin, [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: watchdogMs + 15_000 });
    const drivenOutput = `${driven.stdout ?? ""}\n${driven.stderr ?? ""}`;
    assert(
      driven.status === 0 && drivenOutput.includes("COOPERATIVE_YIELD_DRIVER_OK"),
      `cooperative-yield driver failed (exit ${driven.status}, signal ${driven.signal}):\n${drivenOutput}`,
    );

    const after = readRunState(handle);
    const completed = Object.values(after.nodes).filter((node) => node.status === "succeeded");
    assert(completed.length === 1, "the completed batch must retain exactly one verified result before yielding");
    const result = completed[0]!;
    assert(
      result.attempts.at(-1)?.ownerSessionId === sessionId && result.verifiedBySessionId === `${sessionId}.verifier`,
      "the producer and independent verifier provenance must survive the cooperative yield",
    );
    assert(
      after.artifactBindings.every((binding) => binding.accepted && binding.attemptId === result.attempts.at(-1)?.id),
      "verified output bindings must survive yield",
    );
    assertCheckpointMatches(handle, after, sessionId);
    assert(
      readAuditEntries(handle).some((entry) => entry.sessionId === `${sessionId}.verifier` && entry.action === "verification_accepted"),
      "independent verification must remain attested in the audit log",
    );

    const text = readDigest(handle, sessionId);
    assert(
      text.includes("I stepped aside partway through because this business is being worked on directly right now."),
      `expected the cooperative-yield outcome in the digest, got:\n${text}`,
    );
    assert(
      text.includes("I stopped partway through because this business started being worked on directly."),
      `expected the cooperative-yield reason in the digest, got:\n${text}`,
    );
    assertNoInternalVocabulary("yield-final-verification", text);
  });

  // --- judgment scenario: founder-vocabulary blocklist is real, not vacuous -------------------

  harness.check("session/digest: the internal-vocabulary blocklist actually catches a leak (the check is not vacuous)", () => {
    assert(internalVocabularyBlocklist.length > 0, "the blocklist must not be empty");
    const leaking = "See run.workflow.eng-change in domain.engineering — schemaVersion 1.0.0, actionClass mutate, reasonCode autonomy.no_grant.";
    const leaked = internalVocabularyBlocklist.filter((term) => leaking.includes(term));
    assert(leaked.length > 0, "the blocklist scan failed to catch an obviously internal-vocabulary string — the check would pass vacuously");
  });

  // --- judgment scenario: pushDigest attempted-ok / attempted-failed, in-process with a fake --
  // Run as a spawned script (not an in-harness async check: the shared harness's `check` runs
  // fn() synchronously — see _harness.ts — so an async assertion here would race cleanup()/
  // reportResults() rather than being awaited). A tiny driver script exercises the real,
  // async pushDigest with an injected fake transport; nothing here ever touches the real network.

  harness.check(
    "session/digest: pushDigest requires a configured from-address before it will even check for a key, attempts a send only once both are present, and a push failure never throws",
    () => {
      const digestModuleUrl = pathToFileURL(path.join(skillRoot, "kernel/session/digest.ts")).href;
      const driverPath = path.join(harness.makeTempDir("session-push-driver"), "drive-push.mts");
      const driverSource = `
import { pushDigest, renderDigest } from ${JSON.stringify(digestModuleUrl)};
const rendered = renderDigest({ sessionId: "s1", businessSlug: "app", startedAt: "2026-08-05T00:00:00.000Z", endedAt: "2026-08-05T00:05:00.000Z", outcome: "completed", advanced: [], parked: [], spend: [], anomalies: [] });
async function main() {
  // No from-address at all: must skip before ever looking at the key, even when a key is present —
  // this is the fix for the motivating bug (a hardcoded placeholder from-address).
  const noFrom = await pushDigest(rendered, "founder@example.com", { env: { RESEND_API_KEY: "fixture-fake-key" } });
  if (noFrom.attempted !== false || !noFrom.skippedReason || !noFrom.skippedReason.includes("from-address")) throw new Error("no-from-path failed: " + JSON.stringify(noFrom));

  // From-address present, key absent: skip on the key, not the from-address.
  const skipped = await pushDigest(rendered, "founder@example.com", { env: {}, from: "Launch Digest <digest@updates.fixture-domain.test>" });
  if (skipped.attempted !== false || skipped.skippedReason !== "no key") throw new Error("skip-path failed: " + JSON.stringify(skipped));

  const ok = await pushDigest(rendered, "founder@example.com", { env: { RESEND_API_KEY: "fixture-fake-key" }, from: "Launch Digest <digest@updates.fixture-domain.test>", transport: { send: async () => ({ ok: true, id: "fixture-send-1" }) } });
  if (!(ok.attempted && ok.ok === true && ok.id === "fixture-send-1")) throw new Error("ok-path failed: " + JSON.stringify(ok));

  const failed = await pushDigest(rendered, "founder@example.com", { env: { RESEND_API_KEY: "fixture-fake-key" }, from: "Launch Digest <digest@updates.fixture-domain.test>", transport: { send: async () => ({ ok: false, error: "fixture: simulated network failure" }) } });
  if (!(failed.attempted && failed.ok === false && failed.error === "fixture: simulated network failure")) throw new Error("fail-path failed: " + JSON.stringify(failed));

  console.log("PUSH_DRIVER_OK");
}
main().catch((error) => { console.error(String(error)); process.exit(1); });
`;
      writeFileSync(driverPath, driverSource, "utf8");
      const result = spawnSync(tsxBin, [driverPath], { cwd: skillRoot, encoding: "utf8" });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      assert(result.status === 0 && output.includes("PUSH_DRIVER_OK"), `pushDigest driver failed (exit ${result.status}):\n${output}`);
    },
  );

  harness.check("session/executor: founder trust material is never forwarded to a worker allowlist", () => {
    const publicKeyEnv = FOUNDER_ED25519_PUBLIC_KEY_ENV;
    const trustFileEnv = FOUNDER_TRUST_FILE_ENV;
    const allowedFixtureEnv = "B2C_SESSION_FIXTURE_ALLOWED_ENV";
    const previousPublicKey = process.env[publicKeyEnv];
    const previousTrustFile = process.env[trustFileEnv];
    const previousAllowlist = process.env.B2C_WORKER_ENV_ALLOWLIST;
    const previousAllowedFixture = process.env[allowedFixtureEnv];
    process.env[publicKeyEnv] = "fixture-public-verification-key";
    process.env[trustFileEnv] = "/fixture/founder-trust.json";
    process.env[allowedFixtureEnv] = "allowed-fixture-value";
    process.env.B2C_WORKER_ENV_ALLOWLIST = `${publicKeyEnv},${trustFileEnv},${allowedFixtureEnv}`;
    try {
      const env = workerEnvironment("codex");
      assert(env[publicKeyEnv] === undefined, "the founder verification key must stay outside every specialist worker environment");
      assert(env[trustFileEnv] === undefined, "the founder trust-store path must stay outside every specialist worker environment");
      assert(env[allowedFixtureEnv] === "allowed-fixture-value", "the hard denial must preserve ordinary explicit worker allowlist entries");
    } finally {
      if (previousPublicKey === undefined) delete process.env[publicKeyEnv];
      else process.env[publicKeyEnv] = previousPublicKey;
      if (previousTrustFile === undefined) delete process.env[trustFileEnv];
      else process.env[trustFileEnv] = previousTrustFile;
      if (previousAllowlist === undefined) delete process.env.B2C_WORKER_ENV_ALLOWLIST;
      else process.env.B2C_WORKER_ENV_ALLOWLIST = previousAllowlist;
      if (previousAllowedFixture === undefined) delete process.env[allowedFixtureEnv];
      else process.env[allowedFixtureEnv] = previousAllowedFixture;
    }
  });

  harness.check("session/founder-key: dry-run reports stable identity and path without a misleading file hash", () => {
    const fixture = harness.makeTempDir("founder-key-dry-run-output");
    const publicKeyFile = path.join(fixture, "founder-ed25519-public.txt");
    const trustFile = path.join(fixture, "trust", "founder-ed25519-v1.json");
    const canonicalTrustFile = path.join(realpathSync.native(fixture), "trust", "founder-ed25519-v1.json");
    writeFileSync(publicKeyFile, `${fixtureFounderPublicKey}\n`, "utf8");
    const result = spawnSync(process.execPath, [b2cBinPath, "founder-key", "install", "--public-key-file", publicKeyFile, "--trust-file", trustFile], {
      cwd: skillRoot,
      encoding: "utf8",
      env: cleanEnv(),
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert(result.status === 0, `founder-key dry-run must succeed: ${output}`);
    assert(output.includes(`keyId=${fixtureFounderTrustedKey.keyId}`), `dry-run must identify the reviewed key: ${output}`);
    assert(output.includes(`trustFile=${canonicalTrustFile}`), `dry-run must identify the exact target path: ${output}`);
    assert(!output.includes("sha256="), `dry-run must not claim the hash of a file that does not exist yet: ${output}`);
    assert(
      output.includes("installed file hash includes its apply-time installedAt"),
      `dry-run must explain why the exact installed hash is available only after apply: ${output}`,
    );
    assert(!existsSync(trustFile), "dry-run must not create the founder trust file");
  });

  // --- judgment scenario: scope hints restrict what a session dispatches ---------------------

  harness.check("session: scope hints restrict this session to matching domains, leaving out-of-scope ready nodes untouched for a future session", () => {
    const handle = bootstrapWorkspace(harness, "scope-hints", comprehensiveCatalog(), {
      grants: { "domain.growth": grant("domain.growth", "review-first"), "domain.money": grant("domain.money", "full") },
      waivers: [waiver("waiver.money.1", "domain.money", "spend", "spend")],
      balances: [
        {
          unit: "Revenue",
          period: currentPeriod(),
          currency: "USD",
          allocated: 1000,
          committed: 0,
          spent: 0,
          remaining: 1000,
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      scopeHints: ["domain.growth"],
    });

    const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-scope-1", "--executor", "fixture"]);
    assert(result.code === 0, `expected exit 0, got ${result.code}: ${result.output}`);

    const text = readDigest(handle, "sess-scope-1");
    assert(text.includes("Scan what people are saying"), `expected the in-scope growth node to advance, got:\n${text}`);
    assert(
      !text.includes("Pull this week's revenue report"),
      `expected the out-of-scope money node to be left untouched (neither advanced nor parked) this session, got:\n${text}`,
    );
    assertNoInternalVocabulary("scope-hints", text);
  });

  harness.check(
    "session: a scoped session whose entry node is blocked entirely by an out-of-scope prerequisite reports why instead of exiting silently",
    () => {
      const handle = bootstrapWorkspace(harness, "scope-cross-domain", crossDomainDependencyCatalog(), {
        grants: { "domain.growth": grant("domain.growth", "review-first"), "domain.money": grant("domain.money", "review-first") },
        scopeHints: ["domain.growth"],
      });

      const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-scope-2", "--executor", "fixture"]);
      assert(result.code === 0, `expected exit 0, got ${result.code}: ${result.output}`);

      const text = readDigest(handle, "sess-scope-2");
      assert(!text.includes("Scan what people are saying"), `expected the growth entry node to NOT advance -- its only dependency never ran, got:\n${text}`);
      assert(
        text.includes("Confirm the revenue baseline"),
        `expected an anomaly naming the blocking out-of-scope prerequisite by title, so the session doesn't exit with no explanation, got:\n${text}`,
      );
      assertNoInternalVocabulary("scope-cross-domain", text);
    },
  );

  harness.check("session: an in-scope consumer dispatches the exact out-of-scope dependency it reopened for a declared refresh", () => {
    const catalog = crossDomainDependencyCatalog();
    catalog.workflows[1]!.refreshDependencies = [
      { workflowId: "workflow.money-prereq", instructions: "Refresh the revenue baseline for the growth evidence scope before scanning." },
    ];
    const handle = bootstrapWorkspace(harness, "scope-refresh-dependency", catalog, {
      grants: { "domain.growth": grant("domain.growth", "review-first"), "domain.money": grant("domain.money", "review-first") },
      scopeHints: ["domain.money"],
    });

    const seed = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-scope-refresh-seed", "--executor", "fixture"]);
    assert(seed.code === 0, `expected seed exit 0, got ${seed.code}: ${seed.output}`);
    const brief = JSON.parse(readFileSync(handle.briefPath, "utf8")) as { scopeHints?: string[] };
    brief.scopeHints = ["domain.growth"];
    writeFileSync(handle.briefPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8");

    const interrupted = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "sess-scope-refresh-interrupted",
      "--executor",
      "fixture",
      "--verifier",
      "off",
    ]);
    assert(interrupted.code === 0, `expected interrupted refresh exit 0, got ${interrupted.code}: ${interrupted.output}`);

    const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-scope-refresh", "--executor", "fixture"]);
    assert(result.code === 0, `expected refresh exit 0, got ${result.code}: ${result.output}`);
    const text = readDigest(handle, "sess-scope-refresh");
    assert(text.includes("Confirm the revenue baseline"), `expected the explicitly reopened dependency to advance, got:\n${text}`);
    assert(text.includes("Scan what people are saying"), `expected the in-scope consumer to advance after its scoped refresh, got:\n${text}`);
    assertNoInternalVocabulary("scope-refresh-dependency", text);
  });

  // --- judgment scenario: approve.ts against a workspace with no run yet fails with a friendly message, never an uncaught exception ----

  harness.check("session/approve: a workspace with no run state yet produces the friendly no_run_state message and exit 1, not an uncaught exception", () => {
    const handle = bootstrapWorkspace(harness, "approve-no-run", singleNodeCatalog());
    // Deliberately never run a session: run/run-state.json does not exist yet.
    const result = runApprove([
      "--workspace",
      handle.dir,
      "--approval",
      "workflow.eng-change.approval.1",
      "--decision",
      "approved",
      "--session",
      "sess-approve-1",
    ]);
    assert(result.code === 1, `expected exit 1 when no run state exists yet, got ${result.code}: ${result.output}`);
    assert(result.output.includes("ISSUE approve.no_run_state"), `expected the named no_run_state ISSUE, got:\n${result.output}`);
    assert(!/at\s+\S+\s+\(.*:\d+:\d+\)/.test(result.output), `expected a friendly message, not a raw stack trace, got:\n${result.output}`);

    const listResult = runApprove(["--workspace", handle.dir, "--list"]);
    assert(listResult.code === 1, `expected --list to also fail cleanly with no run state, got ${listResult.code}: ${listResult.output}`);
    assert(listResult.output.includes("ISSUE approve.no_run_state"), `expected the named no_run_state ISSUE on --list too, got:\n${listResult.output}`);
  });

  harness.check("session/approve: an existing pending approval can be listed and granted once a session has run", () => {
    const handle = bootstrapWorkspace(harness, "approve-happy", approvalGatedCatalog(), {
      grants: { "domain.money": grant("domain.money", "full") },
      waivers: [waiver("waiver.money.1", "domain.money", "spend", "spend")],
      balances: [
        {
          unit: "Revenue",
          period: currentPeriod(),
          currency: "USD",
          allocated: 1000,
          committed: 0,
          spent: 0,
          remaining: 1000,
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      // Autonomy (grant+waiver+budget) is fully satisfied, but founderOnlyActions is non-empty,
      // so the node still lands waiting_founder pending an explicit approval decision.
    });
    const sessionResult = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-approve-setup-1", "--executor", "fixture"]);
    assert(sessionResult.code === 0, `expected exit 0 for the setup session, got ${sessionResult.code}: ${sessionResult.output}`);

    const listResult = runApprove(["--workspace", handle.dir, "--list"]);
    assert(listResult.code === 0, `expected exit 0 when a run state exists, got ${listResult.code}: ${listResult.output}`);
    assert(listResult.output.includes("PENDING"), `expected at least one PENDING approval listed, got:\n${listResult.output}`);
    const pendingId = listResult.output.match(/PENDING (\S+)/)?.[1];
    assert(Boolean(pendingId), `could not parse a pending approval id from:\n${listResult.output}`);

    const approveResult = runApprove(["--workspace", handle.dir, "--approval", pendingId!, "--decision", "approved", "--session", "sess-approve-grant-1"]);
    assert(approveResult.code === 0, `expected exit 0 recording the approval, got ${approveResult.code}: ${approveResult.output}`);
    assert(approveResult.output.includes(`RECORDED ${pendingId} approved`), `expected a RECORDED confirmation, got:\n${approveResult.output}`);
  });

  harness.check("session: same-UID subprocesses refuse founder-owned trust for approval and autonomous execution", () => {
    const catalog = designTasteDecisionCatalog();
    const handle = bootstrapWorkspace(harness, "founder-trust-role-boundary", catalog);
    seedWaitingDesignTaste(handle, "pass");
    const before = readRunState(handle);

    const approval = runApprove(["--workspace", handle.dir, "--design-taste", "pass", "--session", "fixture-same-uid-receipt-consumer"]);
    assert(
      approval.code === 1 && approval.output.includes("receipt_consumer cannot run as the founder trust-store owner"),
      `a same-UID receipt consumer must refuse founder-owned trust: ${approval.output}`,
    );

    const session = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "fixture-same-uid-autonomous-session",
      "--executor",
      "fixture",
      "--verifier",
      "fixture",
    ]);
    assert(
      session.code === 1 && session.output.includes("autonomous_session cannot run as the founder trust-store owner"),
      `a same-UID autonomous session must refuse founder-owned trust: ${session.output}`,
    );

    const after = readRunState(handle);
    assert(
      after.nodes["run.design.design-system-audit"]?.attempts.length === before.nodes["run.design.design-system-audit"]?.attempts.length &&
        after.approvalProvenance?.[DESIGN_TASTE_DELEGATION_APPROVAL_ID] === undefined,
      "refused trust roles must not append authority provenance or dispatch an audit attempt",
    );
  });

  // --- approvals remain durable and block dispatch until the recorded decision ---------------

  harness.check("session/approve: durable approval state preserves the requirement and recorded decision", () => {
    const handle = bootstrapWorkspace(harness, "approve-boundary", approvalGatedCatalog(), {
      grants: { "domain.money": grant("domain.money", "full") },
      waivers: [waiver("waiver.money.1", "domain.money", "spend", "spend")],
      balances: [
        {
          unit: "Revenue",
          period: currentPeriod(),
          currency: "USD",
          allocated: 1000,
          committed: 0,
          spent: 0,
          remaining: 1000,
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });

    assert(!existsSync(path.join(handle.dir, "run", "run-state.json")), "bootstrap must not invent a durable approval decision");
    const before = runApprove(["--workspace", handle.dir, "--list"]);
    assert(before.code === 1 && before.output.includes("approve.no_run_state"), "approvals need a durable run before they can be answered");

    const sessionResult = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-approve-boundary-1", "--executor", "fixture"]);
    assert(sessionResult.code === 0, `expected exit 0 for the setup session, got ${sessionResult.code}: ${sessionResult.output}`);

    const parked = readRunState(handle);
    const businessState = JSON.parse(readFileSync(handle.statePath, "utf8")) as BusinessStateV2;
    const plan = compilePlan(approvalGatedCatalog());
    const node = plan.nodes.find((candidate) => candidate.workflowId === "workflow.money-report")!;
    assert(Object.keys(parked.approvals).length === 1, "the durable run must contain exactly one required approval");
    const approval = node.approvals[0]!;
    assert(approval.id === "workflow.money-report.approval.1", "approval identity must remain bound to the workflow");
    assert(parked.approvals[approval.id] === "pending", "the required approval must remain pending");
    assert(node.title === "Pull this week's revenue report", "compiled approval owner must retain its title");
    assert(
      approval.description === "Approve pulling this week's revenue report",
      `approval must carry the catalog's founder-facing description: ${JSON.stringify(approval)}`,
    );
    assert(node.actionClass === "spend", "the approval must remain attached to the spend action");
    assert(parked.nodes[node.id]?.status === "waiting_founder", "the node must wait for the explicit decision");
    assert(parked.nodes[node.id]?.attempts.length === 0, "an unanswered approval must prevent an attempt");
    assert(
      !computeFrontier(plan, structuredClone(parked), businessState, allowAllAutonomyEvaluator).ready.includes(node.id),
      "the approval must block even when autonomy is granted",
    );
    assertCheckpointMatches(handle, parked, "sess-approve-boundary-1");

    const approveResult = runApprove(["--workspace", handle.dir, "--approval", approval.id, "--decision", "approved", "--session", "sess-approve-boundary-2"]);
    assert(approveResult.code === 0, `expected exit 0 recording the approval, got ${approveResult.code}: ${approveResult.output}`);

    const after = readRunState(handle);
    assert(Object.keys(after.approvals).length === 1 && after.approvals[approval.id] === "approved", "the recorded decision must persist");
    assert(
      computeFrontier(plan, structuredClone(after), businessState, allowAllAutonomyEvaluator).ready.includes(node.id),
      "the approved step must become ready",
    );
    assert(
      readAuditEntries(handle).some((entry) => entry.action === "founder_approval_granted" && entry.sessionId === "sess-approve-boundary-2"),
      "the approval decision must remain attested",
    );
  });

  // --- accepted results retain their proof, while unverified output stays blocked ---------------

  harness.check("session: deterministic acceptance retains workflow identity, evidence, accepted artifacts, and declared budget", () => {
    const handle = bootstrapWorkspace(harness, "results-boundary", gatedSingleNodeCatalog(), {
      grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
    });

    assert(!existsSync(path.join(handle.dir, "run", "run-state.json")), "bootstrap must not invent a durable result");

    const sessionResult = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-results-boundary-1", "--executor", "fixture"]);
    assert(sessionResult.code === 0, `expected exit 0 for the session, got ${sessionResult.code}: ${sessionResult.output}`);

    const after = readRunState(handle);
    const plan = compilePlan(gatedSingleNodeCatalog());
    const node = plan.nodes.find((candidate) => candidate.workflowId === "workflow.eng-change")!;
    const result = after.nodes[node.id]!;
    const attempt = result.attempts[0]!;
    assert(result.nodeId === node.id && node.title === "Update the onboarding copy", "durable result must retain its stable compiled workflow identity");
    assert(result.status === "succeeded" && result.attempts.length === 1 && attempt.id.length > 0, "deterministic acceptance must retain its sole attempt");
    assert(node.verification.kind === "deterministic", "a gated engineering node must verify deterministically");
    assert(
      attempt.evidence.some((line) => line.includes("gate:check:gates-layout=passed")),
      "accepted attempt must retain the gate's own pass evidence",
    );
    const artifactState = after.artifactBindings.find((entry) => entry.artifactId === "artifact.eng-change")!;
    assert(
      artifactState.accepted && artifactState.producedBy === node.id && artifactState.attemptId === attempt.id && Boolean(artifactState.fingerprint),
      "accepted output must retain its fingerprint and producing attempt",
    );
    assert(node.tokenBudget > 0, "the compiled node must retain its declared token budget");
    assertCheckpointMatches(handle, after, "sess-results-boundary-1");
  });

  for (const scenario of [
    { name: "accepted", gate: "check:gates-layout", verifier: "fixture", accepted: true },
    { name: "rejected", gate: "check:gates-layout", verifier: "fixture-reject", accepted: false },
    { name: "failed-gate", gate: "check:fixture-missing-gate", verifier: "fixture", accepted: false },
    { name: "operator", gate: "check:gates-layout", verifier: "off", accepted: false },
    { name: "repaired", gate: "check:gates-layout", verifier: "fixture-reject-once", accepted: true },
  ]) {
    harness.check(`session: gated judgment ${scenario.name} preserves conjunctive acceptance`, () => {
      const source = gatedSingleNodeCatalog();
      const catalog: CatalogInput = {
        ...source,
        version: `catalog.session-fixture.gated-judgment-${scenario.name}`,
        workflows: source.workflows.map((node) => ({ ...node, domainId: "domain.research", gateCommands: [scenario.gate] })),
      };
      const handle = bootstrapWorkspace(harness, `gated-judgment-${scenario.name}`, catalog, {
        grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
      });
      const producer = `sess-gated-judgment-${scenario.name}`;
      const result = runSession([
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        producer,
        "--executor",
        "fixture",
        "--verifier",
        scenario.verifier,
      ]);
      assert(result.code === 0, `session should report the disposition, got ${result.code}: ${result.output}`);
      const after = readRunState(handle);
      const state = after.nodes["run.eng-change"]!;
      const attempt = state.attempts.at(-1)!;
      assert((state.status === "succeeded") === scenario.accepted, `${scenario.name} must ${scenario.accepted ? "accept" : "remain unaccepted"}`);
      assert(
        after.artifactBindings.every((binding) => binding.accepted === scenario.accepted),
        "all output acceptance must match the joint verdict",
      );
      assert(attempt.deterministicVerification?.attemptId === attempt.id, "gate evidence must name the actual producing attempt");
      if (scenario.name === "failed-gate") {
        assert(attempt.deterministicVerification?.passed === false, "the failing gate must remain recorded as failure");
        assert(!attempt.evidence.some((entry) => entry.includes("fixture verifier")), "failed mechanical gates must not reach the independent reviewer");
        const refused = runVerify(["--workspace", handle.dir, "--node", "run.eng-change", "--session", "external-reviewer", "--evidence", "looks good"]);
        assert(refused.code === 1, `manual review must not bypass failed gates or exhausted repair: ${refused.output}`);
      } else {
        assert(attempt.deterministicVerification?.passed === true, "passing mechanical gates must be retained");
      }
      if (scenario.accepted) assert(state.verifiedBySessionId === `${producer}.verifier`, "acceptance must identify the independent reviewer, not gate runner");
      if (scenario.name === "rejected") {
        assert(state.blocker?.includes("repair attempts exhausted"), "repeated rejection must end incomplete after bounded repair");
        assert(
          state.attempts.some(
            (entry) =>
              entry.independentVerification?.verdict === "rejected" &&
              Boolean(entry.independentVerification.evidence.find((line) => line.startsWith("Proof strength:"))),
          ),
          "a live session reject must store a proof-strength line on the rejected receipt",
        );
      }
      if (scenario.name === "repaired") {
        assert(state.attempts.length === 2, "one mandate must run the initial producer and its repair");
        assert(
          state.attempts[0]!.independentVerification?.verdict === "rejected" && state.attempts[1]!.independentVerification?.verdict === "accepted",
          "durable receipts must retain rejection and acceptance",
        );
        assert(
          Boolean(state.attempts[0]!.independentVerification?.evidence.find((line) => line.startsWith("Proof strength:"))),
          "the rejected attempt must carry a proof-strength line before the later accept",
        );
        assert(
          state.attempts.every((entry) => entry.proofSource === "synthetic"),
          "a fixture loop must remain explicitly synthetic",
        );
        assert(state.repairInstructions === undefined, "successful repair must clear the now-resolved instructions");
      }
      if (scenario.name === "operator") {
        const listed = runVerify(["--workspace", handle.dir, "--list"]);
        assert(listed.output.includes("PENDING run.eng-change"), "operator list must include gated independent review");
        const self = runVerify(["--workspace", handle.dir, "--node", "run.eng-change", "--session", producer, "--evidence", "all gates passed"]);
        assert(self.code === 1 && self.output.includes("verify.producer_cannot_verify"), "operator CLI must reject producer self-review for gated judgment");
        const accepted = runVerify([
          "--workspace",
          handle.dir,
          "--node",
          "run.eng-change",
          "--session",
          "external-reviewer",
          "--evidence",
          "independent review of the current output passed",
        ]);
        assert(accepted.code === 0, `operator CLI must accept current composite proof: ${accepted.output}`);
        assert(readRunState(handle).nodes["run.eng-change"]!.verifiedBySessionId === "external-reviewer", "operator provenance must survive persistence");
      }
    });
  }

  harness.check("session: auditor rejection repairs its producer then rechecks under one mandate", () => {
    const source = singleNodeCatalog();
    const catalog: CatalogInput = {
      ...source,
      version: "catalog.session-fixture.targeted-review-repair",
      artifacts: [...source.artifacts, { id: "artifact.audit-findings", path: "design/review.md" }],
      workflows: [
        ...source.workflows,
        {
          id: "workflow.design-check",
          title: "Review current implementation",
          domainId: "domain.design",
          actionClass: "draft",
          dependencies: ["workflow.eng-change"],
          reviewOf: ["workflow.eng-change"],
          outputPaths: ["design/review.md"],
          providerIds: [],
          laneIds: [],
          founderOnlyActions: [],
          gateCommands: [],
          idempotent: true,
        },
      ],
    };
    const handle = bootstrapWorkspace(harness, "targeted-review-repair", catalog, {
      grants: {
        "domain.engineering": grant("domain.engineering", "run-with-guardrails"),
        "domain.design": grant("domain.design", "run-with-guardrails"),
      },
    });
    const result = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "targeted-repair",
      "--executor",
      "fixture",
      "--verifier",
      "fixture-repair-reviewed-once",
    ]);
    assert(result.code === 0, `targeted repair session failed: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.eng-change"]!;
    const auditor = run.nodes["run.design-check"]!;
    assert(producer.status === "succeeded" && auditor.status === "succeeded", "both producer and auditor must finish after repair");
    assert(producer.attempts.length === 2 && auditor.attempts.length === 2, "auditor findings must trigger exactly one producer repair and one new audit");
    assert(
      auditor.attempts[0]!.independentVerification?.subjects.some((entry) => entry.artifactId === "artifact.eng-change"),
      "audit proof must include the producer output under review",
    );
    assertCheckpointMatches(handle, run, "targeted-repair");
  });

  harness.check("session: one mandate gives the producer and its audit distinct engine-issued execution identities", () => {
    const source = singleNodeCatalog();
    const catalog: CatalogInput = {
      ...source,
      version: "catalog.session-fixture.independent-audit-identity",
      artifacts: [...source.artifacts, { id: "artifact.audit-findings", path: "design/review.md" }],
      workflows: [
        ...source.workflows,
        {
          id: "workflow.design-check",
          title: "Review current implementation",
          domainId: "domain.design",
          actionClass: "draft",
          dependencies: ["workflow.eng-change"],
          reviewOf: ["workflow.eng-change"],
          outputPaths: ["design/review.md"],
          providerIds: [],
          laneIds: [],
          founderOnlyActions: [],
          gateCommands: [],
          idempotent: true,
        },
      ],
    };
    const handle = bootstrapWorkspace(harness, "independent-audit-identity", catalog, {
      grants: {
        "domain.engineering": grant("domain.engineering", "run-with-guardrails"),
        "domain.design": grant("domain.design", "run-with-guardrails"),
      },
    });
    const sessionId = "one-shot-independent-audit";
    const result = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      sessionId,
      "--executor",
      "fixture",
      "--verifier",
      "fixture",
    ]);
    assert(result.code === 0, `one-shot producer/audit session failed: ${result.output}`);
    const run = readRunState(handle);
    const producerAttempt = run.nodes["run.eng-change"]!.attempts.at(-1)!;
    const auditAttempt = run.nodes["run.design-check"]!.attempts.at(-1)!;
    assert(
      run.nodes["run.eng-change"]!.status === "succeeded" && run.nodes["run.design-check"]!.status === "succeeded",
      "one mandate must complete producer then audit",
    );
    assert(producerAttempt.ownerSessionId === sessionId, "the ordinary producer remains owned by the orchestrating session");
    assert(
      auditAttempt.ownerSessionId === workerExecutionIdentity(sessionId, run.runId, "run.design-check", auditAttempt.number),
      "the audit attempt must retain its stable engine-issued worker identity",
    );
    assert(auditAttempt.ownerSessionId !== producerAttempt.ownerSessionId, "the audit worker identity must differ from its reviewed producer");
    assertCheckpointMatches(handle, run, sessionId);
  });

  harness.check("session: the engine fails closed when an audit reuses a reviewed producer execution identity", () => {
    const source = singleNodeCatalog();
    const catalog: CatalogInput = {
      ...source,
      version: "catalog.session-fixture.audit-identity-reuse",
      artifacts: [...source.artifacts, { id: "artifact.audit-findings", path: "design/review.md" }],
      workflows: [
        ...source.workflows,
        {
          id: "workflow.design-check",
          title: "Review current implementation",
          domainId: "domain.design",
          actionClass: "draft",
          dependencies: ["workflow.eng-change"],
          reviewOf: ["workflow.eng-change"],
          outputPaths: ["design/review.md"],
          providerIds: [],
          laneIds: [],
          founderOnlyActions: [],
          gateCommands: [],
          idempotent: true,
        },
      ],
    };
    const handle = bootstrapWorkspace(harness, "audit-identity-reuse", catalog);
    const plan = compilePlan(catalog, "2026-08-05T00:00:00.000Z");
    const businessState = JSON.parse(readFileSync(handle.statePath, "utf8")) as BusinessStateV2;
    const run = seedRunState(plan, businessState, {
      ownerSessionId: "same-worker",
      ttlSeconds: 300,
      wallClockCapSeconds: 300,
      now: "2026-08-05T00:00:00.000Z",
    });
    beginAttempt(plan, run, "run.eng-change", "same-worker", "2026-08-05T00:00:01.000Z");
    let refusal = "";
    try {
      beginAttempt(plan, run, "run.design-check", "same-worker", "2026-08-05T00:00:02.000Z");
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
    assert(refusal.includes("cannot reuse reviewed producer execution identity"), `same-identity audit must fail closed, got: ${refusal}`);
    assert(run.nodes["run.design-check"]!.attempts.length === 0, "a refused same-identity audit must not create an attempt");
  });

  harness.check("session: malformed design-audit evidence retries only the audit before fresh evidence reaches authority", () => {
    const catalog = designTasteAuditRetryCatalog(3);
    const handle = bootstrapWorkspace(harness, "design-audit-evidence-repair", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedDesignTasteAuditRetry(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "malformed-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-repair-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the bounded audit-evidence repair session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 1, "invalid audit evidence must never reopen Design Room");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 2, "the malformed first artifact must consume one audit-only retry");
    assert(audit.attempts[0]?.status === "failed", "the invalid first audit attempt must remain explicit");
  });

  harness.check("session: Findings without signed delegation stop at the founder authority boundary", () => {
    const catalog = designTasteAuditRetryCatalog(3);
    const handle = bootstrapWorkspace(harness, "design-audit-missing-delegated-decision", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedDesignTasteAuditRetry(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "missing-decision-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-missing-decision-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the missing delegated decision repair session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 1, "a missing delegated table must never reopen Design Room");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 1, "the unbound Findings-only audit must fail closed");
  });

  harness.check("session: an unreceipted producer-authored founder-looking row cannot activate delegated authority", () => {
    const catalog = designTasteAuditRetryCatalog(3);
    const handle = bootstrapWorkspace(harness, "design-audit-producer-founder-lookalike", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedDesignTasteAuditRetry(handle, catalog, { producerAuthoredUnreceiptedTastePass: true });
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "missing-decision-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-producer-founder-lookalike-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the delegated audit-only repair must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 1, "unreceipted producer prose must not reopen Design Room");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 1, "the producer-authored founder-looking row must not grant authority");
    assert(
      !readAuditEntries(handle).some((entry) => entry.action === "founder_design_taste_pass"),
      "producer-authored founder-looking prose must not invent a candidate-bound founder decision receipt",
    );
  });

  harness.check("session: unchanged pre-existing delegated review bytes cannot be rebound after the Design Room candidate changes", () => {
    const catalog = designTasteAuditRetryCatalog(4);
    const handle = bootstrapWorkspace(harness, "design-audit-stale-pass-replay", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedStaleDesignAuditReplay(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "unchanged-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-stale-pass-replay-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the stale-pass replay session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 2, "the replay guard must not reopen the already changed Design Room candidate");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 3, "old audit + refused replay + regenerated audit must be retained");
    assert(
      audit.attempts[1]?.status === "failed" && audit.attempts[1]?.error?.includes("unchanged from before dispatch"),
      `the no-op audit must fail before its old pass can be rebound (${audit.attempts[1]?.error ?? "no error"})`,
    );
  });

  harness.check("session: changing only the engine marker and whitespace cannot rebind an old delegated pass", () => {
    const catalog = designTasteAuditRetryCatalog(4);
    const handle = bootstrapWorkspace(harness, "design-audit-marker-only-stale-pass-replay", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedStaleDesignAuditReplay(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "marker-only-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-marker-only-replay-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the marker-only stale-pass replay session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 2, "the marker-only replay guard must not reopen Design Room");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 3, "old audit + refused marker-only replay + regenerated audit must be retained");
    assert(
      audit.attempts[1]?.status === "failed" && audit.attempts[1]?.error?.includes("unchanged from before dispatch"),
      `the marker-only audit must fail before its old findings can be rebound (${audit.attempts[1]?.error ?? "no error"})`,
    );
  });

  harness.check("session: changing only the engine marker and delegated decision date cannot rebind old Findings", () => {
    const catalog = designTasteAuditRetryCatalog(4);
    const handle = bootstrapWorkspace(harness, "design-audit-marker-date-only-replay", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedStaleDesignAuditReplay(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "marker-and-date-only-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-marker-date-only-replay-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the marker-and-date stale-pass replay session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 2, "delegated-date replay must not reopen Design Room");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 3, "old audit + refused marker/date replay + regenerated Findings must be retained");
    assert(
      audit.attempts[1]?.status === "failed" && audit.attempts[1]?.error?.includes("unchanged from before dispatch"),
      `delegation date metadata cannot substitute for new Findings (${audit.attempts[1]?.error ?? "no error"})`,
    );
  });

  harness.check("session: changing only the candidate and frozen-rubric binding presentation cannot rebind old Findings", () => {
    const catalog = designTasteAuditRetryCatalog(4);
    const handle = bootstrapWorkspace(harness, "design-audit-rubric-binding-only-replay", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedStaleDesignAuditReplay(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "rubric-binding-only-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-rubric-binding-only-replay-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the rubric-binding-only stale-pass replay session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 2, "rubric-binding presentation must not reopen Design Room");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 3, "old audit + refused rubric-binding replay + regenerated Findings must be retained");
    assert(
      audit.attempts[1]?.status === "failed" && audit.attempts[1]?.error?.includes("unchanged from before dispatch"),
      `rubric label and terminal punctuation cannot substitute for new Findings (${audit.attempts[1]?.error ?? "no error"})`,
    );
  });

  harness.check("session: duplicate frozen-rubric markers are audit evidence defects, not new findings", () => {
    const catalog = designTasteAuditRetryCatalog(4);
    const handle = bootstrapWorkspace(harness, "design-audit-duplicate-rubric-replay", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedStaleDesignAuditReplay(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "duplicate-rubric-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-duplicate-rubric-replay-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the duplicate-rubric replay session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 2, "duplicate audit markers must not reopen Design Room");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 3, "old audit + malformed duplicate marker + corrected audit must be retained");
    assert(
      audit.attempts[1]?.status === "failed" && audit.attempts[1]?.error?.includes("exactly one valid Frozen rubric marker; found 2"),
      `a duplicate Frozen rubric marker must fail closed before acceptance (${audit.attempts[1]?.error ?? "no error"})`,
    );
  });

  harness.check("session: delegated framing and table-separator changes cannot rebind an old pass", () => {
    const catalog = designTasteAuditRetryCatalog(4);
    const handle = bootstrapWorkspace(harness, "design-audit-framing-only-stale-pass-replay", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedStaleDesignAuditReplay(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "framing-only-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-framing-only-replay-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the framing-only stale-pass replay session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 2, "framing-only replay must not reopen Design Room");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 3, "old audit + refused framing-only replay + regenerated audit must be retained");
    assert(
      audit.attempts[1]?.status === "failed" && audit.attempts[1]?.error?.includes("unchanged from before dispatch"),
      `title, comment, marker, and separator-width changes must fail before rebinding old findings (${audit.attempts[1]?.error ?? "no error"})`,
    );
  });

  harness.check("session: direct-mode Findings ignore framing and table-separator changes", () => {
    const catalog = designTasteAuditRetryCatalog(4);
    const handle = bootstrapWorkspace(harness, "design-audit-direct-framing-only-replay", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedStaleDesignAuditReplay(handle, catalog, { directMode: true });
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "direct-framing-only-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-direct-framing-only-replay-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the direct-mode framing replay session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 2, "direct-mode framing replay must not reopen Design Room");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 3, "old direct audit + refused framing replay + regenerated Findings must be retained");
    assert(
      audit.attempts[1]?.status === "failed" && audit.attempts[1]?.error?.includes("unchanged from before dispatch"),
      `direct-mode title, comment, marker, and separator-width changes must not rebind old Findings (${audit.attempts[1]?.error ?? "no error"})`,
    );
  });

  for (const authority of ["delegated", "direct"] as const) {
    harness.check(`session: ${authority} marker and inline emphasis changes cannot rebind an old pass`, () => {
      const catalog = designTasteAuditRetryCatalog(4);
      const handle = bootstrapWorkspace(harness, `design-audit-${authority}-inline-only-replay`, catalog, {
        grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
      });
      seedStaleDesignAuditReplay(handle, catalog, { directMode: authority === "direct" });
      const bin = fakeDesignAuditRuntime(harness, handle.dir, authority === "direct" ? "direct-inline-only-then-pass" : "inline-only-then-pass");
      const result = runSession(
        [
          "--workspace",
          handle.dir,
          "--brief",
          handle.briefPath,
          "--session",
          `fixture-design-audit-${authority}-inline-only-replay-session`,
          "--executor",
          "codex",
          "--verifier",
          "fixture",
        ],
        { PATH: `${bin}:${process.env.PATH ?? ""}` },
      );
      assert(result.code === 0, `the ${authority} inline-only stale-pass replay session must complete: ${result.output}`);
      const run = readRunState(handle);
      const producer = run.nodes["run.design.design-room"]!;
      const audit = run.nodes["run.design.design-system-audit"]!;
      assert(producer.status === "succeeded" && producer.attempts.length === 2, `${authority} inline replay must not reopen Design Room`);
      assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 3, `old ${authority} audit + refused inline replay + regenerated evidence must be retained`);
      assert(
        audit.attempts[1]?.status === "failed" && audit.attempts[1]?.error?.includes("unchanged from before dispatch"),
        `${authority} marker and bold presentation changes must not rebind old evidence (${audit.attempts[1]?.error ?? "no error"})`,
      );
    });
  }

  for (const authority of ["delegated", "direct"] as const) {
    harness.check(`session: ${authority} render-equivalent HTML entities fail closed during audit replay`, () => {
      const catalog = designTasteAuditRetryCatalog(4);
      const handle = bootstrapWorkspace(harness, `design-audit-${authority}-entity-only-replay`, catalog, {
        grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
      });
      seedStaleDesignAuditReplay(handle, catalog, { directMode: authority === "direct" });
      const bin = fakeDesignAuditRuntime(harness, handle.dir, authority === "direct" ? "direct-entity-only-then-pass" : "entity-only-then-pass");
      const result = runSession(
        [
          "--workspace",
          handle.dir,
          "--brief",
          handle.briefPath,
          "--session",
          `fixture-design-audit-${authority}-entity-only-replay-session`,
          "--executor",
          "codex",
          "--verifier",
          "fixture",
        ],
        { PATH: `${bin}:${process.env.PATH ?? ""}` },
      );
      assert(result.code === 0, `the ${authority} entity-only stale-pass replay session must complete: ${result.output}`);
      const run = readRunState(handle);
      const producer = run.nodes["run.design.design-room"]!;
      const audit = run.nodes["run.design.design-system-audit"]!;
      assert(producer.status === "succeeded" && producer.attempts.length === 2, `${authority} entity replay must not reopen Design Room`);
      assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 3, `old ${authority} audit + rejected entity replay + regenerated evidence must be retained`);
      assert(
        audit.attempts[1]?.status === "failed" && audit.attempts[1]?.error?.includes("HTML character reference"),
        `render-equivalent entities must fail closed before rebinding ${authority} evidence (${audit.attempts[1]?.error ?? "no error"})`,
      );
    });
  }

  harness.check("session: a missing declared design-audit output consumes an audit-only retry before fresh evidence reaches authority", () => {
    const catalog = designTasteAuditRetryCatalog(3);
    const handle = bootstrapWorkspace(harness, "design-audit-output-missing", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedDesignTasteAuditRetry(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "missing-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-missing-output-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the missing-output audit repair session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 1, "a missing audit artifact must never reopen Design Room");
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 2, "the missing artifact must consume one audit-only retry");
    assert(
      audit.attempts[0]?.status === "failed" && audit.attempts[0]?.error?.includes("declared output is missing"),
      `the first audit attempt must retain the missing-output failure (${audit.attempts[0]?.error ?? "no error"})`,
    );
  });

  harness.check("session: an unclassified design-audit gate crash consumes an audit-only retry", () => {
    const catalog = designTasteAuditRetryCatalog(3);
    const handle = bootstrapWorkspace(harness, "design-audit-unclassified-gate-crash", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedDesignTasteAuditRetry(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "gate-crash-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-unclassified-gate-crash-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the unclassified gate-crash retry must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 1, "an unclassified audit gate crash must not reopen Design Room");
    assert(
      audit.status === "succeeded" && audit.attempts.length === 2 && audit.attempts[0]?.status === "failed",
      `an unclassified gate crash must consume one bounded audit-only retry (${audit.status}, ${audit.attempts.length})`,
    );
    assert(
      audit.attempts[0]?.deterministicVerification?.passed === false &&
        audit.attempts[0]?.deterministicVerification?.evidence.some((entry) => entry.includes("gate:check:design-worthiness=exit 70")) &&
        !audit.attempts[0]?.deterministicVerification?.evidence.some((entry) => entry.startsWith("gate_issue:")),
      "the failed attempt must retain the unclassified gate outcome without inventing an issue code",
    );
  });

  for (const [label, mode] of [
    ["missing output", "craft-missing-then-pass"],
    ["malformed report", "craft-malformed-then-pass"],
  ] as const) {
    harness.check(`session: implementation craft audit ${label} consumes an audit-only retry`, () => {
      const catalog = implementationCraftAuditRetryCatalog(3);
      const handle = bootstrapWorkspace(harness, `implementation-craft-${mode}`, catalog, {
        grants: {
          "domain.design": grant("domain.design", "run-with-guardrails"),
          "domain.engineering": grant("domain.engineering", "run-with-guardrails"),
        },
      });
      seedImplementationCraftAuditRetry(handle, catalog);
      const bin = fakeDesignAuditRuntime(harness, handle.dir, mode);
      const result = runSession(
        [
          "--workspace",
          handle.dir,
          "--brief",
          handle.briefPath,
          "--session",
          `fixture-implementation-craft-${mode}`,
          "--executor",
          "codex",
          "--verifier",
          "fixture",
        ],
        { PATH: `${bin}:${process.env.PATH ?? ""}` },
      );
      assert(result.code === 0, `the implementation audit retry session must complete: ${result.output}`);
      const run = readRunState(handle);
      const producer = run.nodes["run.engineering.engineering-orchestration-ce-production-readiness"]!;
      const audit = run.nodes["run.design.implementation-craft-audit"]!;
      assert(producer.status === "succeeded" && producer.attempts.length === 1, `${label} must not reopen the implementation producer`);
      assert(
        audit.status === "succeeded" && audit.attempts.length === 2 && audit.attempts[0]?.status === "failed",
        `${label} must consume exactly one craft-audit retry (${audit.status}, ${audit.attempts.length})`,
      );
      if (mode === "craft-missing-then-pass") {
        assert(audit.attempts[0]?.error?.includes("declared output is missing"), "the first craft attempt must retain missing-output evidence");
      } else {
        assert(
          audit.attempts[0]?.deterministicVerification?.evidence.some((entry) => entry.includes("design_acceptance.report")),
          "the first craft attempt must retain malformed-report gate evidence",
        );
      }
    });
  }

  harness.check("session: implementation craft audit rejects JSON reformat and Markdown whitespace as stale replay", () => {
    const catalog = implementationCraftAuditRetryCatalog(5);
    const handle = bootstrapWorkspace(harness, "implementation-craft-semantic-replay", catalog, {
      grants: {
        "domain.design": grant("domain.design", "run-with-guardrails"),
        "domain.engineering": grant("domain.engineering", "run-with-guardrails"),
      },
    });
    seedStaleImplementationCraftReplay(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "craft-semantic-replay-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-implementation-craft-semantic-replay-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the semantic implementation replay session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.engineering.engineering-orchestration-ce-production-readiness"]!;
    const audit = run.nodes["run.design.implementation-craft-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 2, "stale implementation-review framing must not reopen its producer");
    assert(
      audit.status === "succeeded" && audit.attempts.length === 5,
      `old audit + JSON-format replay + Markdown-whitespace replay + entity replay + substantive audit must be retained (${audit.status}, ${audit.attempts.length})`,
    );
    assert(
      audit.attempts[1]?.status === "failed" &&
        audit.attempts[1]?.error?.includes("design/proofs/design-acceptance.json") &&
        audit.attempts[1]?.error?.includes("unchanged from before dispatch"),
      `JSON formatting alone must consume an audit-only retry (${audit.attempts[1]?.error ?? "no error"})`,
    );
    assert(
      audit.attempts[2]?.status === "failed" &&
        audit.attempts[2]?.error?.includes("design/reviews/IMPLEMENTATION_REVIEW.md") &&
        audit.attempts[2]?.error?.includes("unchanged from before dispatch"),
      `Markdown whitespace alone must consume an audit-only retry (${audit.attempts[2]?.error ?? "no error"})`,
    );
    assert(
      audit.attempts[3]?.status === "failed" && audit.attempts[3]?.error?.includes("HTML character reference"),
      `render-equivalent HTML entities must fail closed on the implementation review (${audit.attempts[3]?.error ?? "no error"})`,
    );
    assert(audit.attempts[4]?.independentVerification?.verdict === "accepted", "only substantively changed implementation evidence may pass");
  });

  harness.check("session: implementation audit timestamps cannot rebind old evidence or judgment", () => {
    const catalog = implementationCraftAuditRetryCatalog(5);
    const handle = bootstrapWorkspace(harness, "implementation-craft-date-only-replay", catalog, {
      grants: {
        "domain.design": grant("domain.design", "run-with-guardrails"),
        "domain.engineering": grant("domain.engineering", "run-with-guardrails"),
      },
    });
    seedStaleImplementationCraftReplay(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "craft-date-only-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-implementation-craft-date-only-replay-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the implementation date-only replay session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.engineering.engineering-orchestration-ce-production-readiness"]!;
    const audit = run.nodes["run.design.implementation-craft-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 2, "timestamp-only replay must not reopen the implementation producer");
    assert(
      audit.status === "succeeded" && audit.attempts.length === 4,
      `old audit + JSON-date replay + Markdown-date replay + substantive audit must be retained (${audit.status}, ${audit.attempts.length})`,
    );
    assert(
      audit.attempts[1]?.status === "failed" &&
        audit.attempts[1]?.error?.includes("design/proofs/design-acceptance.json") &&
        audit.attempts[1]?.error?.includes("unchanged from before dispatch"),
      `reviewedAt alone must not change JSON evidence semantics (${audit.attempts[1]?.error ?? "no error"})`,
    );
    assert(
      audit.attempts[2]?.status === "failed" &&
        audit.attempts[2]?.error?.includes("design/reviews/IMPLEMENTATION_REVIEW.md") &&
        audit.attempts[2]?.error?.includes("unchanged from before dispatch"),
      `a reviewed-date line alone must not change Markdown judgment semantics (${audit.attempts[2]?.error ?? "no error"})`,
    );
    assert(audit.attempts[3]?.independentVerification?.verdict === "accepted", "only substantively changed evidence and judgment may pass");
  });

  harness.check("session: a malformed craft report index retries only the implementation audit", () => {
    const catalog = implementationCraftAuditRetryCatalog(4);
    const handle = bootstrapWorkspace(harness, "implementation-craft-product-repair", catalog, {
      grants: {
        "domain.design": grant("domain.design", "run-with-guardrails"),
        "domain.engineering": grant("domain.engineering", "run-with-guardrails"),
      },
    });
    seedImplementationCraftAuditRetry(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "craft-product-fail-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-implementation-craft-product-repair-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the craft report-index repair session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.engineering.engineering-orchestration-ce-production-readiness"]!;
    const audit = run.nodes["run.design.implementation-craft-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 1, "report-index defects must not reopen an implementation producer");
    assert(audit.status === "succeeded" && audit.attempts.length === 2, "corrected report indexing must receive one fresh craft-audit attempt");
    assert(
      audit.attempts[0]?.deterministicVerification?.evidence.some((entry) => entry.includes("design_acceptance.report_coverage")),
      "the rejected craft attempt must retain the audit-authored report coverage issue",
    );
    assert(
      audit.attempts[0]?.status === "failed" &&
        audit.attempts[0]?.independentVerification === undefined &&
        audit.attempts[1]?.independentVerification?.verdict === "accepted",
      "invalid audit-authored coverage must consume an audit-only retry before the corrected audit passes",
    );
  });

  for (const gatePassed of [true, false] as const) {
    for (const mutation of ["changed", "deleted", "symlinked"] as const) {
      harness.check(`session: ${mutation} design-audit output after a ${gatePassed ? "passing" : "failed"} pending gate retries only the audit`, () => {
        const catalog = designTasteAuditRetryCatalog(3);
        const handle = bootstrapWorkspace(harness, `design-audit-${gatePassed ? "pass" : "failed"}-pending-${mutation}`, catalog, {
          grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
        });
        seedPendingDesignAuditGate(handle, catalog, gatePassed);
        const before = readRunState(handle);
        const beforeProducer = before.nodes["run.design.design-room"]!;
        const beforeAudit = before.nodes["run.design.design-system-audit"]!;
        assert(
          beforeProducer.status === "succeeded" &&
            beforeProducer.attempts.length === 1 &&
            beforeAudit.status === "blocked" &&
            beforeAudit.blocker === VERIFICATION_REQUIRED_BLOCKER &&
            beforeAudit.attempts.length === 1 &&
            beforeAudit.attempts[0]?.deterministicVerification?.passed === gatePassed &&
            beforeAudit.attempts[0]?.independentVerification === undefined,
          "the fixture must begin with one exact audit output parked after its selected gate result",
        );

        const reviewPath = path.join(handle.dir, "design/reviews/DESIGN_SYSTEM_REVIEW.md");
        if (mutation === "changed") {
          writeFileSync(reviewPath, `${readFileSync(reviewPath, "utf8")}\nOut-of-band changed audit evidence.\n`, "utf8");
        } else if (mutation === "deleted") {
          rmSync(reviewPath);
        } else {
          const targetPath = path.join(handle.dir, "design/reviews/.fixture-symlinked-design-review.md");
          writeFileSync(targetPath, readFileSync(reviewPath, "utf8"), "utf8");
          rmSync(reviewPath);
          symlinkSync(path.basename(targetPath), reviewPath);
        }

        const bin = fakeDesignAuditRuntime(harness, handle.dir, "always-pass");
        const result = runSession(
          [
            "--workspace",
            handle.dir,
            "--brief",
            handle.briefPath,
            "--session",
            `fixture-design-audit-${gatePassed ? "pass" : "failed"}-pending-${mutation}`,
            "--executor",
            "codex",
            "--verifier",
            "fixture",
          ],
          { PATH: `${bin}:${process.env.PATH ?? ""}` },
        );
        assert(result.code === 0, `the ${mutation} pending-output session must report its bounded disposition: ${result.output}`);
        const after = readRunState(handle);
        const producer = after.nodes["run.design.design-room"]!;
        const audit = after.nodes["run.design.design-system-audit"]!;
        assert(
          producer.status === "succeeded" && producer.attempts.length === beforeProducer.attempts.length,
          `${mutation} audit evidence after a ${gatePassed ? "passing" : "failed"} gate must never reopen Design Room`,
        );
        if (mutation === "symlinked") {
          assert(
            audit.status === "blocked" &&
              audit.attempts.length === 3 &&
              audit.attempts.slice(1).every((attempt) => attempt.status === "failed" && attempt.error?.includes("pre-dispatch output is unsafe")),
            `a symlinked audit output must fail closed at the audit's own bounded cap (${audit.status}, ${audit.attempts.length})`,
          );
        } else {
          assertUnsignedDesignAuditReachedAuthorityBoundary(
            audit,
            2,
            `${mutation} audit evidence must receive one fresh bounded audit attempt after the stale pending output`,
          );
        }
      });
    }
  }

  harness.check("session: changed accepted design-audit output retries only the audit", () => {
    const catalog = designTasteAuditRetryCatalog(3);
    const handle = bootstrapWorkspace(harness, "design-audit-accepted-output-drift", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedAcceptedDesignAudit(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "always-pass");
    const runArgs = ["--workspace", handle.dir, "--brief", handle.briefPath, "--executor", "codex", "--verifier", "fixture"];
    const before = readRunState(handle);
    const beforeProducer = before.nodes["run.design.design-room"]!;
    const beforeAudit = before.nodes["run.design.design-system-audit"]!;
    const beforeBinding = before.artifactBindings.find((binding) => binding.artifactId === "artifact.design-review")!;
    assert(
      beforeProducer.status === "succeeded" &&
        beforeProducer.attempts.length === 1 &&
        beforeAudit.status === "succeeded" &&
        beforeAudit.attempts.length === 1 &&
        beforeAudit.attempts[0]?.independentVerification?.verdict === "accepted" &&
        beforeBinding.accepted,
      "the fixture must begin with one independently accepted current design audit",
    );

    const reviewPath = path.join(handle.dir, beforeBinding.path);
    writeFileSync(reviewPath, `${readFileSync(reviewPath, "utf8")}\nOut-of-band mutation after independent acceptance.\n`, "utf8");

    const second = runSession([...runArgs, "--session", "fixture-design-audit-accepted-output-retry"], {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    });
    assert(second.code === 0, `the stale accepted audit must receive a bounded audit-only retry: ${second.output}`);
    const after = readRunState(handle);
    const producer = after.nodes["run.design.design-room"]!;
    const audit = after.nodes["run.design.design-system-audit"]!;
    const binding = after.artifactBindings.find((candidate) => candidate.artifactId === "artifact.design-review")!;
    assert(
      producer.status === "succeeded" && producer.attempts.length === beforeProducer.attempts.length,
      "stale accepted audit evidence must preserve the reviewed Design Room producer and its attempt count",
    );
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 2, "stale accepted audit evidence must receive one fresh bounded audit attempt");
    assert(
      !binding.accepted && binding.attemptId === audit.attempts[1]?.id,
      "the refreshed audit binding must remain unaccepted until external founder authority is available",
    );
  });

  for (const scenario of [
    {
      label: "missing native evidence",
      slug: "native-evidence",
      mode: "craft-producer-evidence-fail-then-pass" as const,
      issueCode: "design_acceptance.evidence_artifact",
    },
    {
      label: "omitted required surface",
      slug: "surface-coverage",
      mode: "craft-surface-coverage-fail-then-pass" as const,
      issueCode: "design_acceptance.surface_coverage",
    },
  ]) {
    harness.check(`session: ${scenario.label} repairs the declared implementation producer`, () => {
      const catalog = implementationCraftAuditRetryCatalog(4);
      const handle = bootstrapWorkspace(harness, `implementation-craft-${scenario.slug}-repair`, catalog, {
        grants: {
          "domain.design": grant("domain.design", "run-with-guardrails"),
          "domain.engineering": grant("domain.engineering", "run-with-guardrails"),
        },
      });
      seedImplementationCraftAuditRetry(handle, catalog);
      const bin = fakeDesignAuditRuntime(harness, handle.dir, scenario.mode);
      const result = runSession(
        [
          "--workspace",
          handle.dir,
          "--brief",
          handle.briefPath,
          "--session",
          `fixture-implementation-craft-${scenario.slug}-repair-session`,
          "--executor",
          "codex",
          "--verifier",
          "fixture",
        ],
        { PATH: `${bin}:${process.env.PATH ?? ""}` },
      );
      assert(result.code === 0, `the ${scenario.label} repair session must complete: ${result.output}`);
      const run = readRunState(handle);
      const producer = run.nodes["run.engineering.engineering-orchestration-ce-production-readiness"]!;
      const audit = run.nodes["run.design.implementation-craft-audit"]!;
      assert(producer.status === "succeeded" && producer.attempts.length === 2, `${scenario.label} must reopen its declared producer exactly once`);
      assert(audit.status === "succeeded" && audit.attempts.length === 2, "changed producer evidence must receive one fresh implementation audit");
      assert(
        audit.attempts[0]?.deterministicVerification?.evidence.some((entry) => entry.includes(scenario.issueCode)),
        `the rejected audit must retain ${scenario.issueCode}`,
      );
      assert(
        audit.attempts[0]?.independentVerification?.verdict === "rejected" && audit.attempts[1]?.independentVerification?.verdict === "accepted",
        `${scenario.label} must stay rejected until its producer changes and a fresh audit passes`,
      );
    });
  }

  harness.check("session: a structured delegated Taste fail repairs Design Room and a changed candidate receives a fresh audit", () => {
    const catalog = designTasteAuditRetryCatalog(4);
    const handle = bootstrapWorkspace(harness, "design-audit-structured-fail", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedDesignTasteAuditRetry(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "fail-then-pass");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-structured-fail-session",
        "--executor",
        "codex",
        "--verifier",
        // The fixture verifier deliberately says accepted. Failed mechanical gates must still
        // convert that response into a rejection and route the declared Design Room producer.
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `the structured-fail repair session must complete: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(
      producer.status === "succeeded" && producer.attempts.length === 2,
      `a valid Taste fail must reopen only Design Room once (${producer.status}, ${producer.attempts.length})`,
    );
    assertUnsignedDesignAuditReachedAuthorityBoundary(audit, 2, "the changed candidate must receive a fresh audit after producer repair");
    assert(
      audit.attempts[0]?.deterministicVerification?.evidence.some((entry) => entry.includes("worthiness.taste_gate_rejected")),
      "the first audit attempt must retain the exact structured Taste rejection evidence",
    );
    assert(audit.attempts[0]?.independentVerification?.verdict === "rejected", "the failed candidate must retain its independent rejection");
  });

  harness.check("session: persistently malformed design-audit evidence blocks at its own cap without repairing Design Room", () => {
    const catalog = designTasteAuditRetryCatalog(2);
    const handle = bootstrapWorkspace(harness, "design-audit-evidence-exhausted", catalog, {
      grants: { "domain.design": grant("domain.design", "run-with-guardrails") },
    });
    seedDesignTasteAuditRetry(handle, catalog);
    const bin = fakeDesignAuditRuntime(harness, handle.dir, "always-malformed");
    const result = runSession(
      [
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "fixture-design-audit-exhausted-session",
        "--executor",
        "codex",
        "--verifier",
        "fixture",
      ],
      { PATH: `${bin}:${process.env.PATH ?? ""}` },
    );
    assert(result.code === 0, `audit evidence exhaustion must stop cleanly: ${result.output}`);
    const run = readRunState(handle);
    const producer = run.nodes["run.design.design-room"]!;
    const audit = run.nodes["run.design.design-system-audit"]!;
    assert(producer.status === "succeeded" && producer.attempts.length === 1, "audit evidence exhaustion must not consume a Design Room attempt");
    assert(
      audit.status === "blocked" && audit.attempts.length === 2 && audit.blocker?.includes("remained invalid after 2 attempts"),
      `the audit must block only at its authored cap (${audit.status}, ${audit.attempts.length}, ${audit.blocker ?? "no blocker"})`,
    );
    assert(
      audit.attempts.every((attempt) => attempt.status === "failed"),
      "every malformed audit attempt must remain explicitly failed",
    );
  });

  harness.check("session: rejected non-idempotent work waits for readback without replay", () => {
    const source = singleNodeCatalog();
    const catalog: CatalogInput = {
      ...source,
      version: "catalog.session-fixture.non-idempotent-review",
      workflows: source.workflows.map((node) => ({ ...node, idempotent: false })),
    };
    const handle = bootstrapWorkspace(harness, "non-idempotent-review", catalog, {
      grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
    });
    const result = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "non-idempotent-review",
      "--executor",
      "fixture",
      "--verifier",
      "fixture-reject",
    ]);
    assert(result.code === 0, `session failed to report required readback: ${result.output}`);
    const state = readRunState(handle).nodes["run.eng-change"]!;
    assert(state.status === "needs_readback" && state.attempts.length === 1, "quality repair must not repeat an external or non-idempotent action");
  });

  for (const verifierMode of ["fixture-repair-reviewed-once", "fixture", "off"] as const) {
    harness.check(`session: real craft audit missing report exhausts audit-only retries safely (${verifierMode})`, () => {
      const real = toCatalogInput(composeCatalog(skillRoot));
      const auditId = "workflow.design.implementation-craft-audit";
      const audit = real.workflows.find((node) => node.id === auditId)!;
      assert(
        audit.gateCommands.includes("check:design-acceptance") && audit.reviewOf?.length === 3,
        "test must use the authored craft audit gate and all three mobile, landing, and production-readiness producer targets",
      );
      const ids = new Set([auditId, ...audit.reviewOf]);
      const workflows = real.workflows
        .filter((node) => ids.has(node.id))
        .map((node) => ({
          ...node,
          // Isolate the real audit/producer seam from unrelated business preparation.
          // Keep the audit's actual gate, review targets, outputs, and repeatability.
          dependencies: node.dependencies.filter((id) => ids.has(id)),
          refreshDependencies: [],
          gateCommands: node.id === auditId ? node.gateCommands : [],
        }));
      const paths = new Set(workflows.flatMap((node) => node.outputPaths));
      const catalog: CatalogInput = {
        ...real,
        version: `catalog.session-fixture.real-craft-${verifierMode}`,
        profiles: [],
        workflows,
        artifacts: real.artifacts.filter((artifact) => paths.has(artifact.path)),
      };
      const handle = bootstrapWorkspace(harness, `real-craft-${verifierMode}`, catalog, {
        grants: {
          "domain.engineering": grant("domain.engineering", "run-with-guardrails"),
          "domain.design": grant("domain.design", "run-with-guardrails"),
          "domain.growth": grant("domain.growth", "run-with-guardrails"),
        },
      });
      writeAcceptedDesignInputsWithoutAuditReport(handle);
      const session = `real-craft-${verifierMode}`;
      const args = ["--workspace", handle.dir, "--brief", handle.briefPath, "--session", session, "--executor", "fixture", "--verifier", verifierMode];
      // The fixture executor writes no real report file. This is an audit-authoring defect,
      // so the real acceptance gate must keep product producers closed and spend only this
      // audit's bounded retry budget.
      let result = runSession(args);
      assert(result.code === 0, `real craft failure must report its disposition: ${result.output}`);
      if (verifierMode === "off") {
        // First accept only the prerequisite fixture producers, then let the audit consume its
        // own retries. Invalid audit-authored evidence does not need an independent rejection
        // before retry because no product defect has been established.
        for (const id of audit.reviewOf!) {
          if (readRunState(handle).nodes[`run.${id.slice("workflow.".length)}`]?.status !== "blocked") {
            result = runSession(args);
            assert(result.code === 0, `fixture prerequisite dispatch failed: ${result.output}`);
          }
          const accepted = runVerify([
            "--workspace",
            handle.dir,
            "--node",
            id,
            "--session",
            "independent-fixture-operator",
            "--evidence",
            "Synthetic prerequisite accepted for failed-gate routing fixture only.",
          ]);
          assert(accepted.code === 0, `fixture prerequisite acceptance failed: ${accepted.output}`);
        }
        result = runSession(args);
        assert(result.code === 0, `unreviewed malformed craft evidence must exhaust cleanly: ${result.output}`);
      }
      const run = readRunState(handle);
      const state = run.nodes["run.design.implementation-craft-audit"]!;
      assert(
        state.status === "blocked" &&
          state.attempts.length === audit.maxAttempts &&
          state.blocker?.includes(`remained invalid after ${audit.maxAttempts} attempts`),
        `missing craft reports must block only after the audit cap (${state.status}, ${state.attempts.length}, ${state.blocker ?? "no blocker"})`,
      );
      assert(
        state.attempts.every((attempt) => attempt.deterministicVerification?.passed === false),
        "every real acceptance-gate failure must remain recorded",
      );
      assert(
        state.attempts.every((attempt) => attempt.status === "failed" && attempt.independentVerification === undefined),
        "audit-authored report failures must remain failed without inventing an independent product rejection",
      );
      assert(
        run.artifactBindings
          .filter((binding) => audit.outputPaths.includes(binding.path) || binding.producedBy === state.nodeId)
          .every((binding) => !binding.accepted),
        "failed audit outputs must remain unavailable to downstream consumers",
      );
      for (const workflowId of audit.reviewOf!) {
        const producer = run.nodes[`run.${workflowId.slice("workflow.".length)}`]!;
        assert(
          producer.status === "succeeded" && producer.attempts.length === 1,
          `a missing audit report must not reopen a product producer (${workflowId}: ${producer.status}, ${producer.attempts.length} attempts)`,
        );
      }
      assert(
        state.attempts.every((attempt) => attempt.deterministicVerification?.evidence.some((entry) => entry.includes("design_acceptance.report"))),
        "every retry must retain the exact malformed-report gate evidence",
      );
      assertCheckpointMatches(handle, run, session);
    });
  }

  harness.check("session: real landing repair preserves the separate publication boundary", () => {
    const catalog = toCatalogInput(composeCatalog(skillRoot));
    const plan = compilePlan(catalog);
    const landing = plan.nodes.find((node) => node.workflowId === "workflow.growth.pre-launch-funnel-landing-waitlist")!;
    const publication = plan.nodes.find((node) => node.workflowId === "workflow.growth.landing-funnel-publication-and-live-proof")!;
    assert(landing.idempotent && landing.actionClass === "mutate" && !landing.protectedCategory, "the real local-only producer must permit bounded repair");
    assert(
      !publication.idempotent && publication.actionClass === "publish" && publication.protectedCategory === "public_actions",
      "publication must retain its authored external-action boundary",
    );
    const handle = bootstrapWorkspace(harness, "real-landing-repair-boundary", catalog);
    const state = JSON.parse(readFileSync(handle.statePath, "utf8")) as BusinessStateV2;
    const run = seedRunState(plan, state, { ownerSessionId: "fixture-producer", ttlSeconds: 300, wallClockCapSeconds: 300 });
    const now = new Date().toISOString();
    for (const node of [landing, publication]) {
      const attempt = beginAttempt(plan, run, node.id, "fixture-producer", now);
      reconcilePatch(
        plan,
        run,
        {
          nodeId: node.id,
          attemptId: attempt.id,
          outputs: node.outputs.map((artifactId) => ({
            artifactId,
            path: plan.artifactBindings.find((binding) => binding.artifactId === artifactId)!.path,
            fingerprint: "synthetic-fixture",
            evidence: ["Synthetic boundary fixture; no publication occurred."],
          })),
        },
        now,
      );
      const reopened = requestVerificationRepair(plan, run, node.id, ["Correct the reviewed defect before accepting this work."], now);
      assert(
        node.id === landing.id
          ? reopened.includes(node.id) && run.nodes[node.id]!.status === "stale"
          : reopened.length === 0 && run.nodes[node.id]!.status === "needs_readback",
        "only local landing work may automatically reopen after review",
      );
    }
  });

  harness.check("session: interrupted repair resumes across a catalog update without erasing attempts", () => {
    const catalog = slowSilentFreshContextCatalog();
    const handle = bootstrapWorkspace(harness, "interrupted-repair-upgrade", catalog, {
      grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
    });
    const first = driveCooperativeYield(harness, handle, {
      sessionId: "repair-before-yield",
      trigger: "attempt-running",
      runningNodeId: "run.research-scan",
      executor: "slow-silent",
      slowDelayMs: 1000,
      verifier: "fixture-reject",
    });
    assert(first.code === 0, `cooperative interruption failed: ${first.output}`);
    const interrupted = readRunState(handle);
    const firstAttempt = interrupted.nodes["run.research-scan"]!.attempts[0]!;
    assert(
      firstAttempt.independentVerification?.verdict === "rejected" && interrupted.nodes["run.research-scan"]!.repairInstructions?.length,
      "the interruption must preserve rejection and queued repair",
    );
    writeJson(handle.catalogPath, { ...catalog, version: `${catalog.version}.updated` });
    const resumed = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "repair-after-yield",
      "--executor",
      "fixture",
      "--verifier",
      "fixture",
    ]);
    assert(resumed.code === 0, `repair resume failed: ${resumed.output}`);
    const run = readRunState(handle);
    const state = run.nodes["run.research-scan"]!;
    assert(run.runId === interrupted.runId && state.attempts[0]!.id === firstAttempt.id, "catalog upgrade must preserve the original run and attempt");
    assert(state.status === "succeeded" && state.attempts.length === 2, "resume must finish the queued repair with one fresh producer attempt");
    assert(state.attempts[1]!.independentVerification?.verdict === "accepted", "repaired output needs a new independent verdict");
  });

  harness.check("session: unreadable prior run state never becomes a fresh accepted seed", () => {
    const handle = bootstrapWorkspace(harness, "unreadable-run-recovery", singleNodeCatalog(), {
      grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
    });
    const runPath = path.join(handle.dir, "run/run-state.json");
    mkdirSync(path.dirname(runPath), { recursive: true });
    writeFileSync(runPath, "{interrupted-write");
    const result = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "unreadable-recovery", "--executor", "fixture"]);
    assert(
      result.code === 1 && readFileSync(runPath, "utf8") === "{interrupted-write",
      "unreadable history must fail closed without replacing the original state",
    );
  });

  harness.check("session/verify: verifier-off output stays unaccepted until an independent operator supplies evidence", () => {
    // domain.research is a judgment domain: no gates, so verification is fresh_context and the
    // fixture executor's completion lands blocked pending acceptance, never settled.
    const researchCatalog: CatalogInput = {
      version: "catalog.session-fixture.unverified-research",
      artifacts: [{ id: "artifact.research-scan", path: "research/scan.md" }],
      workflows: [
        {
          id: "workflow.research-scan",
          title: "Research what people need",
          domainId: "domain.research",
          actionClass: "draft",
          dependencies: [],
          outputPaths: ["research/scan.md"],
          providerIds: [],
          laneIds: [],
          founderOnlyActions: [],
          gateCommands: [],
          idempotent: true,
        },
      ],
    };
    const handle = bootstrapWorkspace(harness, "unverified-results", researchCatalog, {
      grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
    });
    // --verifier off: this case pins the OPERATOR acceptance path (kernel/session/verify.ts), so
    // the session's own verification sweep is deliberately disabled so the durable pending
    // state can be checked before the operator judges it.
    const sessionResult = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "sess-unverified-1",
      "--executor",
      "fixture",
      "--verifier",
      "off",
    ]);
    assert(sessionResult.code === 0, `expected exit 0 for the session, got ${sessionResult.code}: ${sessionResult.output}`);

    const pending = readRunState(handle);
    const step = pending.nodes["run.research-scan"]!;
    const artifactState = pending.artifactBindings.find((entry) => entry.artifactId === "artifact.research-scan")!;
    assert(artifactState.accepted === false, "the unverified output must remain unaccepted");
    assert(step.status === "blocked" && step.blocker === "Verification required", "producer completion must remain blocked for verification");
    assert(
      step.acceptedOutputFingerprint === undefined && step.verifiedBySessionId === undefined,
      "producer completion cannot invent acceptance or verifier proof",
    );
    assertCheckpointMatches(handle, pending, "sess-unverified-1");
    const pendingBytes = readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8");
    const checkpointBytes = readFileSync(path.join(handle.dir, "run", "checkpoint.json"), "utf8");
    const auditBytes = readFileSync(handle.auditPath, "utf8");

    // The sanctioned way OUT of blocked-pending-verification: kernel/session/verify.ts. Refuses
    // the producer's own session and empty evidence; a different session with evidence promotes
    // the node and records the independent proof in durable state.
    const listed = runVerify(["--workspace", handle.dir, "--list"]);
    assert(listed.code === 0 && listed.output.includes("PENDING run.research-scan"), `expected the pending node listed, got: ${listed.output}`);
    const producerAttempt = runVerify([
      "--workspace",
      handle.dir,
      "--node",
      "workflow.research-scan",
      "--session",
      "sess-unverified-1",
      "--evidence",
      "looks right",
    ]);
    assert(
      producerAttempt.code === 1 && producerAttempt.output.includes("verify.producer_cannot_verify"),
      `the producing session must be refused, got: ${producerAttempt.output}`,
    );
    const noEvidence = runVerify(["--workspace", handle.dir, "--node", "workflow.research-scan", "--session", "sess-reviewer-1"]);
    assert(noEvidence.code === 1 && noEvidence.output.includes("verify.evidence_required"), `empty evidence must be refused, got: ${noEvidence.output}`);
    const liveDevice = runVerify([
      "--workspace",
      handle.dir,
      "--node",
      "workflow.research-scan",
      "--session",
      "sess-reviewer-1",
      "--evidence",
      "fresh-context review: brief matches the category evidence and names sources",
      "--runtime-observed",
      "live-device",
    ]);
    assert(
      liveDevice.code === 1 && liveDevice.output.includes("verify.runtime_observation_invalid"),
      `a live-device word cannot invent observation, got: ${liveDevice.output}`,
    );
    assert(readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8") === pendingBytes, "refused operator acceptance must preserve run-state bytes");
    assert(
      readFileSync(path.join(handle.dir, "run", "checkpoint.json"), "utf8") === checkpointBytes,
      "refused operator acceptance must preserve checkpoint bytes",
    );
    assert(readFileSync(handle.auditPath, "utf8") === auditBytes, "refused operator acceptance must not attest a verification");
    const accepted = runVerify([
      "--workspace",
      handle.dir,
      "--node",
      "workflow.research-scan",
      "--session",
      "sess-reviewer-1",
      "--evidence",
      "fresh-context review: brief matches the category evidence and names sources",
    ]);
    assert(accepted.code === 0 && accepted.output.includes("VERIFIED run.research-scan"), `expected acceptance, got: ${accepted.output}`);
    const afterVerify = readRunState(handle);
    const verified = afterVerify.nodes["run.research-scan"]!;
    assert(verified.status === "succeeded" && Boolean(verified.acceptedOutputFingerprint), "verified state must retain accepted proof");
    assert(
      verified.attempts.at(-1)?.ownerSessionId === "sess-unverified-1" && verified.verifiedBySessionId === "sess-reviewer-1",
      "accepted state must retain producer and verifier provenance",
    );
    const verifiedBinding = afterVerify.artifactBindings.find((entry) => entry.artifactId === "artifact.research-scan")!;
    assert(
      verifiedBinding.accepted && verifiedBinding.fingerprint === artifactState.fingerprint,
      "verification accepts the produced bytes without replacing them",
    );
    assert(
      readAuditEntries(handle).some((entry) => entry.action === "verification_accepted" && entry.sessionId === "sess-reviewer-1"),
      "the independent acceptance must be attested in the audit log",
    );
    const defaultProof = verified.attempts.at(-1)?.independentVerification?.evidence.find((line) => line.startsWith("Proof strength:"));
    assert(
      Boolean(defaultProof?.includes("runtime=unknown") && !defaultProof.includes("runtime=checked")),
      `operator verify without --runtime-observed cannot invent runtime proof, got ${defaultProof ?? "none"}`,
    );
  });

  harness.check("session/verify: operator --runtime-observed records workspace runtime proof", () => {
    const researchCatalog: CatalogInput = {
      version: "catalog.session-fixture.workspace-runtime-observed",
      artifacts: [{ id: "artifact.research-scan", path: "research/scan.md" }],
      workflows: [
        {
          id: "workflow.research-scan",
          title: "Research what people need",
          domainId: "domain.research",
          actionClass: "draft",
          dependencies: [],
          outputPaths: ["research/scan.md"],
          providerIds: [],
          laneIds: [],
          founderOnlyActions: [],
          gateCommands: [],
          idempotent: true,
        },
      ],
    };
    const tokens: ReadonlyArray<{ readonly label: string; readonly args: string[] }> = [
      { label: "boolean flag", args: ["--runtime-observed"] },
      { label: "workspace token", args: ["--runtime-observed", "workspace"] },
    ];
    for (const token of tokens) {
      const handle = bootstrapWorkspace(harness, `runtime-observed-${token.label.replace(" ", "-")}`, researchCatalog);
      mkdirSync(path.join(handle.dir, "research"), { recursive: true });
      writeFileSync(path.join(handle.dir, "research/scan.md"), "Workspace research scan.\n", "utf8");
      const plan = compilePlan(researchCatalog, "2026-09-11T16:00:00.000Z");
      const businessState = JSON.parse(readFileSync(handle.statePath, "utf8")) as BusinessStateV2;
      const run = seedRunState(plan, businessState, {
        ownerSessionId: "sess-workspace-producer",
        ttlSeconds: 600,
        wallClockCapSeconds: 3600,
        now: "2026-09-11T16:00:00.000Z",
      });
      const nodeId = "run.research-scan" as RunNodeId;
      const attempt = beginAttempt(plan, run, nodeId, "sess-workspace-producer", "2026-09-11T16:00:01.000Z");
      attempt.proofSource = "workspace";
      reconcilePatch(
        plan,
        run,
        {
          nodeId,
          attemptId: attempt.id,
          outputs: [
            {
              artifactId: "artifact.research-scan",
              path: "research/scan.md",
              fingerprint: workspaceArtifactFingerprint(handle.dir, "research/scan.md"),
              evidence: ["workspace bytes produced"],
            },
          ],
        },
        "2026-09-11T16:00:02.000Z",
      );
      mkdirSync(path.join(handle.dir, "run"), { recursive: true });
      writeRunState(path.join(handle.dir, "run/run-state.json"), run);
      const accepted = runVerify([
        "--workspace",
        handle.dir,
        "--node",
        "workflow.research-scan",
        "--session",
        "sess-workspace-reviewer",
        "--evidence",
        "fresh-context review: brief matches the category evidence and names sources",
        ...token.args,
      ]);
      assert(accepted.code === 0 && accepted.output.includes("VERIFIED run.research-scan"), `expected acceptance for ${token.label}, got: ${accepted.output}`);
      const verified = readRunState(handle).nodes["run.research-scan"]!;
      const proof = verified.attempts.at(-1)?.independentVerification?.evidence.find((line) => line.startsWith("Proof strength:"));
      assert(
        Boolean(proof?.includes("semantic=checked") && proof.includes("runtime=checked")),
        `operator verify ${token.label} must record workspace runtime proof, got ${proof ?? "none"}`,
      );
      assert(!proof?.includes("runtime=unknown"), `operator verify ${token.label} must not leave runtime unobserved`);
    }
  });

  harness.check("session: a lane-seeded success preserves continuation without inventing an attempt or independent proof", () => {
    const seededCatalog: CatalogInput = {
      version: "catalog.session-fixture.seeded-results",
      artifacts: [{ id: "artifact.eng-change", path: "engineering/change.log" }],
      workflows: [
        {
          id: "workflow.eng-change",
          title: "Update the onboarding copy",
          domainId: "domain.engineering",
          actionClass: "mutate",
          dependencies: [],
          outputPaths: ["engineering/change.log"],
          providerIds: [],
          laneIds: ["engineering"],
          founderOnlyActions: [],
          gateCommands: [],
          idempotent: true,
        },
      ],
    };
    const plan = compilePlan(seededCatalog, "2026-08-05T00:00:00.000Z");
    const lanes = minimalLanes() as Record<string, { status: string; evidence: string[]; blockers: string[] }>;
    lanes.engineering = { status: "succeeded", evidence: [], blockers: [] };
    const businessState = {
      schemaVersion: "2.0.0",
      updatedAt: "2026-08-05T00:00:00.000Z",
      narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
      project: {
        name: "Fixture App",
        slug: "seeded-results",
        owner: "Founder",
        phase: "phase_0_orient",
        launchScope: "essentials",
        kickoffDate: "",
        platforms: ["ios"],
        bundleIds: { ios: "com.example.app", android: "" },
        publicUrls: { landing: "", privacy: "", terms: "" },
      },
      lanes,
      founderGates: { pending: [] },
    } as unknown as BusinessStateV2;
    const run = seedRunState(plan, businessState, {
      ownerSessionId: "seeded-results-check",
      ttlSeconds: 300,
      wallClockCapSeconds: 0,
      now: "2026-08-05T00:00:00.000Z",
    });
    assert(run.nodes["run.eng-change"]!.status === "succeeded", "the lane-done node must seed succeeded");

    assert(run.nodes["run.eng-change"]!.attempts.length === 0, "seeding must not invent a producer attempt or evidence");
    assert(run.nodes["run.eng-change"]!.verifiedBySessionId === undefined, "seeding must not invent independent verification");
    const artifacts = run.artifactBindings;
    assert(artifacts.length === 1 && artifacts[0]!.accepted === true, "the seeded binding must remain accepted for compatible mid-launch continuation");
    assert(artifacts[0]!.attemptId === undefined && artifacts[0]!.producedBy === undefined, "the seeded binding must not claim in-run production");
    assert(
      computeFrontier(plan, structuredClone(run), businessState, allowAllAutonomyEvaluator).ready.length === 0,
      "seeded success must not rerun completed work",
    );
  });

  harness.check("session: auto-verify records workspace runtime proof from --runtime-observed", () => {
    const tokens: ReadonlyArray<{ readonly label: string; readonly args: string[] }> = [
      { label: "omitted", args: [] },
      { label: "boolean flag", args: ["--runtime-observed"] },
      { label: "workspace token", args: ["--runtime-observed", "workspace"] },
    ];
    for (const token of tokens) {
      const catalog = researchScanCatalog(`catalog.session-fixture.auto-verify-runtime-${token.label.replace(" ", "-")}`);
      const handle = bootstrapWorkspace(harness, `auto-verify-runtime-${token.label.replace(" ", "-")}`, catalog, {
        grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
      });
      seedWorkspacePendingResearch(handle, catalog, "sess-workspace-producer");
      const pendingBytes = readFileSync(path.join(handle.dir, "run/run-state.json"), "utf8");
      const result = runSession([
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "sess-auto-verify-runtime",
        "--executor",
        "fixture",
        "--verifier",
        "fixture",
        ...token.args,
      ]);
      assert(result.code === 0, `expected session auto-verify for ${token.label}, got ${result.code}: ${result.output}`);
      const verified = readRunState(handle).nodes["run.research-scan"]!;
      assert(verified.status === "succeeded", `${token.label} auto-verify must accept the pending workspace attempt`);
      assert(verified.verifiedBySessionId === "sess-auto-verify-runtime.verifier", "acceptance must identify the session verifier");
      const proof = proofStrengthLine(handle);
      if (token.args.length === 0) {
        assert(readFileSync(path.join(handle.dir, "run/run-state.json"), "utf8") !== pendingBytes, "omitted-token auto-verify still accepts review");
        assert(
          Boolean(proof?.includes("semantic=checked") && proof.includes("runtime=unknown") && !proof.includes("runtime=checked")),
          `session auto-verify without --runtime-observed cannot invent runtime proof, got ${proof ?? "none"}`,
        );
        continue;
      }
      assert(
        Boolean(proof?.includes("semantic=checked") && proof.includes("runtime=checked")),
        `session auto-verify ${token.label} must record workspace runtime proof, got ${proof ?? "none"}`,
      );
      assert(!proof?.includes("runtime=unknown"), `session auto-verify ${token.label} must not leave runtime unobserved`);
    }
  });

  harness.check("session: a live-device word cannot invent auto-verify runtime proof", () => {
    const catalog = researchScanCatalog("catalog.session-fixture.auto-verify-live-device");
    const handle = bootstrapWorkspace(harness, "auto-verify-live-device", catalog, {
      grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
    });
    seedWorkspacePendingResearch(handle, catalog, "sess-workspace-producer");
    const pendingBytes = readFileSync(path.join(handle.dir, "run/run-state.json"), "utf8");
    const result = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "sess-auto-verify-live-device",
      "--executor",
      "fixture",
      "--verifier",
      "fixture",
      "--runtime-observed",
      "live-device",
    ]);
    assert(
      result.code === 1 && result.output.includes("session.runtime_observation_invalid"),
      `a live-device word cannot invent observation, got: ${result.output}`,
    );
    assert(readFileSync(path.join(handle.dir, "run/run-state.json"), "utf8") === pendingBytes, "refused live-device auto-verify must preserve run-state bytes");
    assert(readRunState(handle).nodes["run.research-scan"]!.status !== "succeeded", "a live-device word cannot accept the pending attempt");
  });

  harness.check("session: fixture auto-verify cannot invent runtime=checked even with --runtime-observed", () => {
    const catalog = researchScanCatalog("catalog.session-fixture.auto-verify-fixture-runtime");
    const handle = bootstrapWorkspace(harness, "auto-verify-fixture-runtime", catalog, {
      grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
    });
    const result = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "sess-auto-verify-fixture",
      "--executor",
      "fixture",
      "--verifier",
      "fixture",
      "--runtime-observed",
    ]);
    assert(result.code === 0, `expected fixture auto-verify, got ${result.code}: ${result.output}`);
    const state = readRunState(handle).nodes["run.research-scan"]!;
    assert(state.status === "succeeded", "fixture auto-verify must still accept the synthetic attempt");
    assert(
      state.attempts.every((entry) => entry.proofSource === "synthetic"),
      "a fixture loop must remain explicitly synthetic",
    );
    const proof = proofStrengthLine(handle);
    assert(
      Boolean(proof?.includes("runtime=unknown") && !proof.includes("runtime=checked")),
      `fixture auto-verify cannot invent runtime proof, got ${proof ?? "none"}`,
    );
  });
}

// Shared execution fixtures reuse the same reducer-owned workspace setup and trust binding.
export {
  bootstrapWorkspace,
  slowSilentCatalog,
  grant,
  waiver,
  runSession,
  readRunState,
  cleanEnv,
  fixtureFounderTrustEnvironment,
  researchScanCatalog,
  seedWorkspacePendingResearch,
};
