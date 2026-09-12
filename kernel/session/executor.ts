import type { WorkerArtifactRoute, OperationRouteRegistry } from "./operation-routes.js";
import { readPackageResourceFile } from "../composition/resources.js";
import { verifySelectedOperation } from "../composition/compile-bindings.js";
import { outputFingerprintPath } from "../engine/artifact-fingerprint.js";
export { outputFingerprintPath } from "../engine/artifact-fingerprint.js";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CompiledRunNode } from "../engine/compile.js";
import { FOUNDER_ED25519_PUBLIC_KEY_ENV } from "../engine/founder-decision-receipt.js";
import { FOUNDER_TRUST_FILE_ENV } from "../engine/founder-trust-store.js";
import { composeNodeBrief, mutableTaskArtifactPaths, type NodeBrief } from "../engine/node-brief.js";
import {
  snapshotWorkspaceChanges,
  verifyWorkspaceChanges,
  type WorkspaceChangeSnapshot,
  snapshotTaskInputs,
  verifyTaskInputs,
  snapshotSourceAccess,
  verifySourceAccess,
  type SourceAccessSnapshot,
  type TaskInputSnapshot,
} from "./input-inventory.js";
import { inspectRenderedH2Section } from "../lib/required-table-section.js";
import {
  buildVerifierPrompt,
  buildWorkerPrompt,
  parseVerifierVerdict,
  validateKnowledgeReceipt,
  type VerifierOutputRef,
  type WorkerAuthorization,
} from "./worker-prompt.js";

/**
 * The seam real runtime execution (U6) plugs into. A session (U5) never knows HOW a node's work
 * gets done — it only knows the shape of the answer: which declared outputs landed where, with
 * what fingerprint, and what evidence backs the claim. Async by design: a real executor invokes
 * a runtime CLI (Claude Code / Codex / Cursor) as a subprocess and must be able to await it,
 * unlike the rest of this repo's synchronous CLI tooling (see autonomy/evaluator.ts's comment on
 * why *that* surface stays sync — execution is the one place this run genuinely waits on I/O).
 */
export interface NodeExecutionOutput {
  readonly artifactId: string;
  readonly path: string;
  readonly fingerprint: string;
  readonly evidence: readonly string[];
}

export type NodeExecutionStatus = "succeeded" | "failed";

const REGENERATED_DESIGN_AUDIT_WORKFLOWS = new Set(["workflow.design.design-system-audit", "workflow.design.implementation-craft-audit"]);

interface SubstantiveDesignAuditFingerprint {
  readonly fingerprint?: string;
  readonly problem?: string;
}

function fingerprintCanonicalEvidence(kind: string, value: string): string {
  return createHash("sha256").update(`${kind}\n${value}`).digest("hex");
}

/** Inline presentation cannot turn an old judgment into new review work. */
function canonicalInlineEvidence(value: string): string {
  let canonical = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const prior = canonical;
    canonical = canonical
      .replace(/\[([^\]\n]+)\]\((?:<[^>\n]+>|[^)\n]+)\)/gu, "$1")
      .replace(/(`+)([^`\n]+?)\1/gu, "$2")
      .replace(/\*\*([^*\n]+)\*\*/gu, "$1")
      .replace(/__([^_\n]+)__/gu, "$1")
      .replace(/~~([^~\n]+)~~/gu, "$1")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/gu, "$1")
      .replace(/(?<!_)_([^_\n]+)_(?!_)/gu, "$1");
    if (canonical === prior) break;
  }
  return canonical;
}

function unsupportedInlinePresentation(lines: readonly string[]): string | undefined {
  for (const [index, line] of lines.entries()) {
    if (/&(?:#[0-9]{1,7}|#[xX][0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/iu.test(line)) {
      return `line ${index + 1} uses an HTML character reference; write its literal rendered text`;
    }
    if (/\\[^\p{L}\p{N}\s]/u.test(line)) {
      return `line ${index + 1} uses a Markdown backslash escape; write its literal rendered punctuation`;
    }
  }
  return undefined;
}

function canonicalRenderedEvidenceLine(line: string): string {
  const trimmed = line.trim();
  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  if (cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return `| ${cells.map((cell) => `${cell.startsWith(":") ? ":" : ""}---${cell.endsWith(":") ? ":" : ""}`).join(" | ")} |`;
  }
  if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
    return `| ${cells.map((cell) => canonicalInlineEvidence(cell).replace(/\s+/g, " ")).join(" | ")} |`;
  }
  return canonicalInlineEvidence(trimmed).replace(/\s+/g, " ");
}

function canonicalImplementationAcceptanceEvidence(value: unknown, pathParts: readonly string[] = []): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalImplementationAcceptanceEvidence(entry, pathParts));
  if (value !== null && typeof value === "object") {
    const volatileKeys = new Set(["reviewedAt", "producedAt", "capturedAt", "executedAt", "candidateSha256", "sourceFingerprint"]);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => {
          if (volatileKeys.has(key)) return false;
          if (pathParts.length === 0 && ["sources", "candidate", "reviewer"].includes(key)) return false;
          if (key === "rubric" && pathParts[0] === "surfaces") return false;
          return true;
        })
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalImplementationAcceptanceEvidence(entry, [...pathParts, key])]),
    );
  }
  return value;
}

function canonicalImplementationReviewLine(line: string): string {
  return canonicalRenderedEvidenceLine(line).replace(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?\b/gu, "<review-time>");
}

function isImplementationAcceptanceBindingLine(line: string): boolean {
  return /^\s*Acceptance report SHA-256:\s*`?[a-f0-9]{64}`?\s*$/iu.test(line);
}

function implementationCraftAuditFingerprint(relativePath: string, absolutePath: string): SubstantiveDesignAuditFingerprint {
  if (relativePath === "design/proofs/design-acceptance.json") {
    try {
      const parsed: unknown = JSON.parse(readFileSync(absolutePath, "utf8"));
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { problem: "design/proofs/design-acceptance.json must contain one JSON object" };
      }
      return {
        fingerprint: fingerprintCanonicalEvidence("implementation-design-acceptance", JSON.stringify(canonicalImplementationAcceptanceEvidence(parsed))),
      };
    } catch (error) {
      return {
        problem: `design/proofs/design-acceptance.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  if (relativePath === "design/reviews/IMPLEMENTATION_REVIEW.md") {
    const source = readFileSync(absolutePath, "utf8");
    const withoutComments = source.replace(/<!--[\s\S]*?-->/gu, "");
    if (withoutComments.includes("<!--") || withoutComments.includes("-->")) {
      return { problem: "design/reviews/IMPLEMENTATION_REVIEW.md contains an unclosed HTML comment" };
    }
    const renderedLines = withoutComments.split(/\r?\n/);
    const unsupported = unsupportedInlinePresentation(renderedLines);
    if (unsupported) return { problem: `design/reviews/IMPLEMENTATION_REVIEW.md ${unsupported}` };
    const canonical = renderedLines
      .filter((line) => !/^\s*#(?!#)\s+/.test(line) && !isImplementationAcceptanceBindingLine(line))
      .map(canonicalImplementationReviewLine)
      .filter(Boolean)
      .join("\n");
    if (!canonical) return { problem: "design/reviews/IMPLEMENTATION_REVIEW.md has no substantive rendered evidence" };
    return { fingerprint: fingerprintCanonicalEvidence("implementation-review", canonical) };
  }
  return { problem: `implementation craft audit declared an unsupported replay-guard output: ${relativePath}` };
}

/**
 * Compare only rendered findings plus the delegated decision when one is present. Retained
 * founder mode intentionally has no delegated decision section. The H1, preamble, HTML comments
 * outside those sections, and the engine-issued candidate marker are framing or binding data,
 * not new review work. The strict evidence scanner keeps hidden, duplicated, or malformed
 * sections from becoming an alternate representation that evades this comparison.
 */
function substantiveDesignAuditFingerprint(workflowId: string, relativePath: string, absolutePath: string): SubstantiveDesignAuditFingerprint | undefined {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  if (workflowId === "workflow.design.implementation-craft-audit") {
    return implementationCraftAuditFingerprint(normalizedPath, absolutePath);
  }
  if (workflowId !== "workflow.design.design-system-audit") {
    return undefined;
  }
  if (normalizedPath !== "design/reviews/DESIGN_SYSTEM_REVIEW.md") {
    return { problem: `design-system audit declared an unsupported replay-guard output: ${normalizedPath}` };
  }
  const markdown = readFileSync(absolutePath, "utf8");
  const sections = ["Delegated Taste Decision", "Findings"] as const;
  let canonicalFindings: string | undefined;
  for (const heading of sections) {
    const view = inspectRenderedH2Section(markdown, heading);
    if (!view.ok) {
      if (heading === "Delegated Taste Decision" && view.errors.length === 1 && view.errors[0]?.kind === "section-missing") {
        continue;
      }
      return { problem: view.errors.map((entry) => entry.message).join("; ") };
    }
    if (view.section.unsupported.length > 0) {
      return {
        problem: view.section.unsupported.map((entry) => `${heading} line ${entry.sourceLine} uses ${entry.description}`).join("; "),
      };
    }
    const lines = view.section.renderedBody.split(/\r?\n/);
    const unsupportedInline = unsupportedInlinePresentation(lines);
    if (unsupportedInline) return { problem: `${heading} ${unsupportedInline}` };
    const markerIndexes = lines.flatMap((line, index) => (/^\s*Candidate input fingerprint:\s*`?[a-f0-9]{64}`?\s*$/i.test(line) ? [index] : []));
    const rubricIndexes = lines.flatMap((line, index) =>
      /^\s*Frozen rubric(?: path)?:\s*design\/reviews\/rubrics\/[a-z0-9._/-]+\s+version\s+[a-z0-9](?:[a-z0-9._-]*[a-z0-9])\.?\s*$/i.test(line) ? [index] : [],
    );
    if (heading === "Findings" && markerIndexes.length !== 1) {
      return { problem: `Findings must contain exactly one valid Candidate input fingerprint marker; found ${markerIndexes.length}` };
    }
    if (heading === "Findings" && rubricIndexes.length !== 1) {
      return { problem: `Findings must contain exactly one valid Frozen rubric marker; found ${rubricIndexes.length}` };
    }
    if (heading !== "Findings" && markerIndexes.length > 0) {
      return { problem: "Candidate input fingerprint belongs in Findings, not Delegated Taste Decision" };
    }
    if (heading !== "Findings" && rubricIndexes.length > 0) {
      return { problem: "Frozen rubric binding belongs in Findings, not Delegated Taste Decision" };
    }
    const rendered = lines
      .filter((_, index) => !markerIndexes.includes(index) && !rubricIndexes.includes(index))
      .map(canonicalRenderedEvidenceLine)
      .filter(Boolean)
      .join("\n");
    if (!rendered) return { problem: `${heading} has no rendered substantive evidence` };
    // Delegation metadata is still parsed above so hidden, duplicate, or malformed authority
    // evidence fails closed. It cannot prove a fresh review: a changed date, authority label, or
    // verdict wrapped around unchanged Findings must not rebind an old candidate judgment.
    if (heading === "Findings") canonicalFindings = rendered;
  }
  if (!canonicalFindings) return { problem: "Findings has no rendered substantive evidence" };
  return { fingerprint: fingerprintCanonicalEvidence("design-system-findings", canonicalFindings) };
}

export interface NodeExecutionResult {
  readonly status: NodeExecutionStatus;
  readonly outputs: readonly NodeExecutionOutput[];
  readonly evidence: readonly string[];
  readonly error?: string;
}

export interface NodeExecutionContext {
  /** Exact trusted runtime writes during this callback; never supplied by a worker. */
  readonly runtimeWrites?: () => WorkspaceChangeSnapshot;
  readonly runId: string;
  readonly attemptId: string;
  readonly workspaceDir: string;
  readonly now: string;
  readonly skillRootDir: string;
  readonly artifactPaths: Readonly<Record<string, string>>;
  /** Exact dispatch-time authority, hashed into the prompt/receipt so a worker cannot widen it. */
  readonly authorization?: WorkerAuthorization;
  /** Scoped reason supplied by a downstream node that reopened this dependency. */
  readonly refreshInstructions?: readonly string[];
  /** Exact context selectors committed with a work-order occurrence, when one is dispatching. */
  readonly contextSelectors?: readonly string[];
  /**
   * Refreshes this attempt's own heartbeat (and the session lock's) mid-execution. The fixture/
   * no-op executors resolve instantly and never need it, but a real executor (U6) awaiting a
   * long-running runtime CLI subprocess should call this periodically — otherwise a slow-but-alive
   * attempt's heartbeatAt goes stale under R12's TTL and a *later* session's detectOrphans wrongly
   * treats still-in-progress work as a dead attempt.
   */
  readonly heartbeat: () => void;
}

export type WorkerRuntime = "auto" | "claude" | "codex" | "cursor";

export interface WorkerCommand {
  readonly runtime: Exclude<WorkerRuntime, "auto">;
  readonly command: string;
  readonly args: readonly string[];
  readonly prompt: string;
}

const runtimeCommands: Record<Exclude<WorkerRuntime, "auto">, string> = { claude: "claude", codex: "codex", cursor: "cursor-agent" };

function available(command: string): boolean {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

export function resolveWorkerRuntime(requested: WorkerRuntime): Exclude<WorkerRuntime, "auto"> | undefined {
  if (requested !== "auto") return available(runtimeCommands[requested]) ? requested : undefined;
  return (["codex", "claude", "cursor"] as const).find((runtime) => available(runtimeCommands[runtime]));
}

/** Every worker runtime the engine can dispatch, with availability probed on THIS machine — doctor's one source of truth for R12. */
export function detectWorkerRuntimes(): Array<{ runtime: Exclude<WorkerRuntime, "auto">; command: string; available: boolean }> {
  return (["codex", "claude", "cursor"] as const).map((runtime) => ({
    runtime,
    command: runtimeCommands[runtime],
    available: available(runtimeCommands[runtime]),
  }));
}

function workerRuntimeCandidates(requested: WorkerRuntime): Array<Exclude<WorkerRuntime, "auto">> {
  if (requested !== "auto") return available(runtimeCommands[requested]) ? [requested] : [];
  return (["codex", "claude", "cursor"] as const).filter((runtime) => available(runtimeCommands[runtime]));
}

export function buildWorkerCommand(runtime: Exclude<WorkerRuntime, "auto">, prompt: string): WorkerCommand {
  if (runtime === "codex")
    return {
      runtime,
      command: "codex",
      args: ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--json", prompt],
      prompt,
    };
  if (runtime === "claude") return { runtime, command: "claude", args: ["-p", "--bare", "--output-format", "json", "--max-turns", "30", prompt], prompt };
  return { runtime, command: "cursor-agent", args: ["agent", "-p", prompt, "--sandbox", "enabled"], prompt };
}

/** Standard SHA-256 of file bytes, reproducible with `sha256sum` or `shasum -a 256`. */
export function receiptFileDigest(target: string): string {
  const stat = lstatSync(target);
  if (!stat.isFile()) throw new Error(`receipt digest target must be a regular file: ${target}`);
  return createHash("sha256").update(readFileSync(target)).digest("hex");
}

async function runWorker(
  command: WorkerCommand,
  cwd: string,
  timeoutMs: number,
): Promise<{ status: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return await new Promise((resolve) => {
    const child = spawn(command.command, [...command.args], { cwd, env: workerEnvironment(command.runtime), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const cap = (value: string, chunk: Buffer): string => `${value}${chunk.toString("utf8")}`.slice(-2_000_000);
    child.stdout.on("data", (chunk: Buffer) => (stdout = cap(stdout, chunk)));
    child.stderr.on("data", (chunk: Buffer) => (stderr = cap(stderr, chunk)));
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
      },
      Math.max(1_000, timeoutMs),
    );
    timer.unref();
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: null, stdout, stderr: `${stderr}\n${error.message}`, timedOut });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, timedOut });
    });
  });
}

/** Do not leak arbitrary session/provider secrets into a specialist subprocess. */
export function workerEnvironment(runtime: Exclude<WorkerRuntime, "auto">): NodeJS.ProcessEnv {
  // Claude Code's macOS OAuth refresh resolves the signed-in keychain identity from USER and
  // LOGNAME. These are non-secret process identity fields; omitting them makes a valid headless
  // login fail as "OAuth session expired" inside B2C App Builder's otherwise sanitized environment.
  const allowed = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "TERM",
    "COLORTERM",
    "CI",
    "XDG_CONFIG_HOME",
    "CODEX_HOME",
  ];
  if (runtime === "codex") allowed.push("OPENAI_API_KEY");
  if (runtime === "claude") allowed.push("ANTHROPIC_API_KEY");
  // Doppler is the skill's approved secret-injection boundary. Forward its service token, not
  // arbitrary provider-specific variables; operators may add narrowly reviewed names explicitly.
  allowed.push("DOPPLER_TOKEN");
  for (const key of (process.env.B2C_WORKER_ENV_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean))
    allowed.push(key);
  const env: NodeJS.ProcessEnv = {};
  for (const key of allowed) {
    if (key !== FOUNDER_ED25519_PUBLIC_KEY_ENV && key !== FOUNDER_TRUST_FILE_ENV && process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.B2C_WORKER_SANDBOX = "workspace-write";
  return env;
}

function resolvedInside(root: string, relativePath: string): string | undefined {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : undefined;
}

export function refreshWorkspaceFileDigests(fileDigests: Record<string, string>, workspaceDir: string, relativePaths: readonly string[]): string | undefined {
  for (const relativePath of relativePaths) {
    const absolute = resolvedInside(workspaceDir, relativePath);
    if (!absolute || !existsSync(absolute)) continue;
    try {
      fileDigests[relativePath] = `sha256:${receiptFileDigest(absolute)}`;
    } catch (error) {
      return `refreshed worker artifact is not a regular file: ${relativePath} (${error instanceof Error ? error.message : String(error)})`;
    }
  }
  return undefined;
}

/**
 * Contract files and read-only inputs keep their dispatch-time hashes. Only a declared
 * output that was also opened as a task artifact may change after the worker writes.
 */
export function postWorkerWorkspaceDigestRefreshPaths(brief: Pick<NodeBrief, "open" | "produce">): readonly string[] {
  return mutableTaskArtifactPaths(brief);
}

/**
 * A receipt-only continuation is deliberately narrower than a worker retry. The producer has
 * already returned declared output bytes; this prompt lets one fresh context inspect those bytes
 * and repair only the transport receipt. The caller still fingerprints every output before and
 * after this continuation, so a worker that edits or redoes the task cannot turn the continuation
 * into accepted work.
 */
export function buildReceiptRepairPrompt(
  originalPrompt: string,
  outputs: readonly Pick<NodeExecutionOutput, "artifactId" | "path" | "fingerprint">[],
): string {
  const manifest = outputs.map((output) => `- ${output.artifactId}: ${output.path} fingerprint=${output.fingerprint}`).join("\n");
  return [
    originalPrompt,
    "",
    "RECEIPT-ONLY REPAIR — the previous worker already completed the requested task.",
    "Do not edit, delete, regenerate, overwrite, or otherwise mutate any file.",
    "Do not rerun the business task, call a provider, spend, publish, deploy, or perform any external effect.",
    "Read only the existing declared outputs and the exact required inputs needed to explain the work.",
    "Return exactly one corrected knowledge receipt between the existing receipt markers, with no new task output.",
    "The engine will reject this continuation if any declared output fingerprint changes.",
    "Existing unaccepted candidate outputs:",
    manifest || "- none; receipt-only repair is unavailable when no complete candidate exists.",
  ].join("\n");
}

/** Real bounded worker executor used by scheduled sessions. */
export function verifyPackageRolePrompts(node: Pick<CompiledRunNode, "role">, workspaceDir: string): void {
  for (const [relative, expected] of Object.entries(node.role?.promptResources ?? {})) {
    const actual = `sha256:${createHash("sha256").update(readPackageResourceFile(workspaceDir, relative)).digest("hex")}`;
    if (actual !== expected) throw new Error(`worker role differs from pinned package: ${relative}`);
  }
}

/** Resolve logical knowledge to pinned package bytes before any worker invocation. */
export function prepareKnowledgeReferences(brief: Pick<NodeBrief, "load" | "route">, workspaceDir: string, skillRootDir: string): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const reference of [...brief.load, ...brief.route]) {
    const root = reference.resource?.origin === "workspace" ? workspaceDir : skillRootDir;
    const relative = reference.resource?.path ?? reference.path;
    const bytes = readPackageResourceFile(root, relative);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (reference.resource && digest !== reference.resource.sha256) throw new Error(`worker knowledge differs from pinned package: ${reference.path}`);
    reference.path = relative;
    digests[relative] = digest;
  }
  return digests;
}

export function createCliExecutor(requestedRuntime: WorkerRuntime = "auto", operationRoutes?: OperationRouteRegistry): NodeExecutor {
  const worker = createCliWorkerExecutor(requestedRuntime);
  return {
    async execute(node, context) {
      if (node.selectedOperation) {
        if (operationRoutes) return operationRoutes.execute(node, context);
        try {
          verifySelectedOperation(node.selectedOperation);
        } catch (error) {
          return {
            status: "failed",
            outputs: [],
            evidence: [],
            error: `selected operation invalid: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
        return {
          status: "failed",
          outputs: [],
          evidence: [],
          error: "binding.execution_route_unavailable: selected extension operations require a registered execution route",
        };
      }
      return worker.execute(node, context);
    },
  };
}

function createCliWorkerExecutor(requestedRuntime: WorkerRuntime): NodeExecutor {
  return {
    async execute(node, context) {
      const runtimes = workerRuntimeCandidates(requestedRuntime);
      if (runtimes.length === 0)
        return { status: "failed", outputs: [], evidence: [], error: `no worker CLI is installed for requested runtime ${requestedRuntime}` };
      const artifactBindings = Object.entries(context.artifactPaths).map(([artifactId, artifactPath]) => ({ artifactId, path: artifactPath, accepted: false }));
      const preDispatchAuditOutputs = new Map<string, { fingerprint: string; substantive?: SubstantiveDesignAuditFingerprint }>();
      if (REGENERATED_DESIGN_AUDIT_WORKFLOWS.has(node.workflowId)) {
        for (const artifactId of node.outputs) {
          const relativePath = context.artifactPaths[artifactId];
          if (!relativePath) continue;
          const absolutePath = resolvedInside(context.workspaceDir, relativePath);
          if (!absolutePath || !existsSync(absolutePath)) continue;
          try {
            const substantive = substantiveDesignAuditFingerprint(node.workflowId, relativePath, absolutePath);
            preDispatchAuditOutputs.set(artifactId, {
              fingerprint: outputFingerprintPath(absolutePath),
              ...(substantive ? { substantive } : {}),
            });
          } catch (error) {
            return {
              status: "failed",
              outputs: [],
              evidence: [],
              error: `design audit pre-dispatch output is unsafe: ${relativePath} (${error instanceof Error ? error.message : String(error)})`,
            };
          }
        }
      }
      const brief = composeNodeBrief(
        node,
        {
          planId: context.runId,
          planRevision: 0,
          catalogVersion: "runtime",
          compiledAt: context.now,
          nodes: [node],
          artifactBindings,
        },
        context.contextSelectors !== undefined ? { sourceIds: [...context.contextSelectors] } : undefined,
        context.workspaceDir,
      );
      if (context.refreshInstructions?.length) {
        brief.instructions = `${brief.instructions}\n\nRefresh scope for this dispatch:\n${context.refreshInstructions.map((entry) => `- ${entry}`).join("\n")}`;
      }
      const fileDigests: Record<string, string> = {};
      for (const contractPath of brief.contractFiles) {
        const absolute = resolvedInside(context.workspaceDir, contractPath);
        if (!absolute || !existsSync(absolute))
          return { status: "failed", outputs: [], evidence: [], error: `worker contract file is missing: ${contractPath}` };
        fileDigests[contractPath] = `sha256:${receiptFileDigest(absolute)}`;
      }
      let taskInputs: TaskInputSnapshot;
      let sourceSnapshot: SourceAccessSnapshot;
      let workspaceSnapshot: WorkspaceChangeSnapshot | undefined;
      try {
        sourceSnapshot = snapshotSourceAccess(context.workspaceDir, node.sourceAccess ?? [], context.skillRootDir);
        taskInputs = snapshotTaskInputs(context.workspaceDir, brief.open);
        if (node.sourceAccess?.length) workspaceSnapshot = snapshotWorkspaceChanges(context.workspaceDir);
        brief.open = taskInputs.files.map((file) => file.path);
        for (const file of taskInputs.files) fileDigests[file.path] = file.sha256;
      } catch (error) {
        return {
          status: "failed",
          outputs: [],
          evidence: [],
          error: `required worker task artifact is missing or unsafe: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      try {
        verifyPackageRolePrompts(node, context.workspaceDir);
        Object.assign(fileDigests, prepareKnowledgeReferences(brief, context.workspaceDir, context.skillRootDir));
      } catch (error) {
        return { status: "failed", outputs: [], evidence: [], error: error instanceof Error ? error.message : String(error) };
      }
      const expectations = { fileDigests, authorization: context.authorization };
      const prompt = buildWorkerPrompt(brief, context.workspaceDir, context.skillRootDir, expectations);
      let runtime = runtimes[0]!;
      let result: Awaited<ReturnType<typeof runWorker>> | undefined;
      const authFailures: string[] = [];
      for (const candidate of runtimes) {
        runtime = candidate;
        result = await runWorker(buildWorkerCommand(candidate, prompt), context.workspaceDir, node.ttlSeconds * 1000);
        const scopeErrors = [
          ...verifyTaskInputs(context.workspaceDir, taskInputs, postWorkerWorkspaceDigestRefreshPaths(brief), node.sourceAccess),
          ...verifySourceAccess(context.workspaceDir, sourceSnapshot),
          ...(workspaceSnapshot
            ? verifyWorkspaceChanges(context.workspaceDir, workspaceSnapshot, node.sourceAccess ?? [], brief.produce, context.runtimeWrites)
            : []),
        ];
        if (scopeErrors.length) return { status: "failed", outputs: [], evidence: [], error: scopeErrors.join("; ") };
        const failureText = `${result.stdout}\n${result.stderr}`;
        if (result.status === 0 || requestedRuntime !== "auto" || !/(auth|log[ -]?in|api[_ -]?key|unauthori[sz]ed|credential)/i.test(failureText)) break;
        authFailures.push(`${candidate}: authentication unavailable`);
      }
      if (!result) return { status: "failed", outputs: [], evidence: [], error: "worker runtime selection produced no invocation" };
      if (result.timedOut) return { status: "failed", outputs: [], evidence: [], error: `${runtime} worker exceeded ${node.ttlSeconds}s TTL` };
      if (result.status !== 0) {
        const tried = authFailures.length > 0 ? `; fallbacks tried: ${authFailures.join(", ")}` : "";
        return {
          status: "failed",
          outputs: [],
          evidence: [],
          error: `${runtime} worker exited ${String(result.status)}: ${result.stderr.trim().slice(-800)}${tried}`,
        };
      }
      const refreshError = refreshWorkspaceFileDigests(fileDigests, context.workspaceDir, postWorkerWorkspaceDigestRefreshPaths(brief));
      if (refreshError) return { status: "failed", outputs: [], evidence: [], error: refreshError };
      const changedInputs = [
        ...verifyTaskInputs(context.workspaceDir, taskInputs, postWorkerWorkspaceDigestRefreshPaths(brief), node.sourceAccess),
        ...verifySourceAccess(context.workspaceDir, sourceSnapshot),
      ];
      if (changedInputs.length) return { status: "failed", outputs: [], evidence: [], error: changedInputs.join("; ") };
      const candidateOutputs: NodeExecutionOutput[] = [];
      for (const artifactId of node.outputs) {
        const relativePath = context.artifactPaths[artifactId];
        if (!relativePath) continue;
        const absolutePath = resolvedInside(context.workspaceDir, relativePath);
        if (!absolutePath || !existsSync(absolutePath)) continue;
        candidateOutputs.push({
          artifactId,
          path: relativePath,
          fingerprint: outputFingerprintPath(absolutePath),
          evidence: [`${runtime} worker produced ${relativePath}`, "candidate retained after knowledge-receipt failure"],
        });
      }
      let receiptText = `${result.stdout}\n${result.stderr}`;
      let receiptIssues = validateKnowledgeReceipt(receiptText, brief, expectations);
      let receiptRepairUsed = false;
      if (receiptIssues.length > 0 && candidateOutputs.length === node.outputs.length) {
        // One bounded same-dispatch continuation repairs only the receipt transport. A missing
        // output cannot be repaired here: it must remain a real failed attempt and take the
        // normal producer recovery path.
        const repairResult = await runWorker(
          buildWorkerCommand(runtime, buildReceiptRepairPrompt(prompt, candidateOutputs)),
          context.workspaceDir,
          node.ttlSeconds * 1000,
        );
        const repairScopeErrors = [
          ...verifyTaskInputs(context.workspaceDir, taskInputs, postWorkerWorkspaceDigestRefreshPaths(brief), node.sourceAccess),
          ...verifySourceAccess(context.workspaceDir, sourceSnapshot),
          ...(workspaceSnapshot
            ? verifyWorkspaceChanges(context.workspaceDir, workspaceSnapshot, node.sourceAccess ?? [], brief.produce, context.runtimeWrites)
            : []),
        ];
        if (repairScopeErrors.length) return { status: "failed", outputs: candidateOutputs, evidence: [], error: repairScopeErrors.join("; ") };
        if (repairResult.timedOut || repairResult.status !== 0) {
          return {
            status: "failed",
            outputs: candidateOutputs,
            evidence: [],
            error: `receipt-only repair did not complete: ${repairResult.timedOut ? "worker timed out" : `worker exited ${String(repairResult.status)}`}`,
          };
        }
        const changedCandidate = candidateOutputs.find((candidate) => {
          const absolute = resolvedInside(context.workspaceDir, candidate.path);
          return !absolute || !existsSync(absolute) || outputFingerprintPath(absolute) !== candidate.fingerprint;
        });
        if (changedCandidate) {
          return {
            status: "failed",
            outputs: [],
            evidence: [],
            error: `receipt-only repair changed candidate output ${changedCandidate.path}; real rework is required`,
          };
        }
        receiptText = `${repairResult.stdout}\n${repairResult.stderr}`;
        receiptIssues = validateKnowledgeReceipt(receiptText, brief, expectations);
        receiptRepairUsed = receiptIssues.length === 0;
      }
      if (receiptIssues.length > 0)
        return { status: "failed", outputs: candidateOutputs, evidence: [], error: `worker knowledge receipt rejected: ${receiptIssues.join("; ")}` };
      const outputs: NodeExecutionOutput[] = [];
      for (const artifactId of node.outputs) {
        const relativePath = context.artifactPaths[artifactId];
        if (!relativePath) return { status: "failed", outputs: [], evidence: [], error: `no path binding for declared output ${artifactId}` };
        const absolutePath = resolvedInside(context.workspaceDir, relativePath);
        if (!absolutePath || !existsSync(absolutePath))
          return { status: "failed", outputs: [], evidence: [], error: `worker exited successfully but declared output is missing: ${relativePath}` };
        const fingerprint = outputFingerprintPath(absolutePath);
        const before = preDispatchAuditOutputs.get(artifactId);
        const substantive = substantiveDesignAuditFingerprint(node.workflowId, relativePath, absolutePath);
        if (substantive?.problem) {
          return {
            status: "failed",
            outputs: [],
            evidence: [],
            error: `worker knowledge receipt rejected: design audit output has malformed or unsupported substantive evidence: ${substantive.problem}`,
          };
        }
        if (
          before?.fingerprint === fingerprint ||
          (before?.substantive?.fingerprint !== undefined && before.substantive.fingerprint === substantive?.fingerprint)
        ) {
          return {
            status: "failed",
            outputs: [],
            evidence: [],
            error: `worker exited successfully but design audit output is unchanged from before dispatch: ${relativePath}`,
          };
        }
        outputs.push({
          artifactId,
          path: relativePath,
          fingerprint,
          evidence: [
            `${runtime} worker produced ${relativePath}`,
            ...(receiptRepairUsed ? ["knowledge receipt repaired without rerunning the task"] : []),
            `knowledge receipt accepted for ${node.workflowId}`,
          ],
        });
      }
      return {
        status: "succeeded",
        outputs,
        evidence: [
          `${runtime} worker completed ${node.workflowId}`,
          ...(receiptRepairUsed ? ["knowledge receipt repaired without rerunning the task"] : []),
          "knowledge receipt accepted",
        ],
      };
    },
  };
}

export interface NodeExecutor {
  execute(node: CompiledRunNode, context: NodeExecutionContext): Promise<NodeExecutionResult>;
}

/**
 * Deterministic stand-in for fixtures and rehearsal dry-runs (KTD1's `inline` adapter shape):
 * every declared output "succeeds" with a fingerprint derived from the node id and output path —
 * same inputs, same fingerprint, so fixture assertions stay stable across runs. The attempt id is
 * deliberately NOT part of the fingerprint: a real deterministic producer re-emitting unchanged
 * content yields an unchanged content hash, and modeling it otherwise made every fixture re-run
 * of a stale node "change" its outputs, re-invalidating the entire downstream graph each session
 * (found 2026-08-19 by check:engine-e2e — session 2 finished with FEWER succeeded nodes than
 * session 1, and the staleness churn never converged).
 */
export function createFixtureExecutor(): NodeExecutor {
  return {
    async execute(node, context): Promise<NodeExecutionResult> {
      const outputs: NodeExecutionOutput[] = node.outputs.map((artifactId) => ({
        artifactId,
        path: `fixture://${node.id}/${artifactId}`,
        fingerprint: `fixture-fp:${node.id}:${artifactId}`,
        evidence: [`fixture executor: synthetic completion of ${node.id} for attempt ${context.attemptId}`],
      }));
      return { status: "succeeded", outputs, evidence: [`fixture executor: ${node.id} completed synthetically`] };
    },
  };
}

/**
 * Explicit diagnostic fallback. Production sessions now default to createCliExecutor("auto"); a
 * no-op executor never claims false
 * success — every attempt fails cleanly with a named reason, so a session run against a real
 * business without a real executor wired makes zero progress rather than fabricating outputs.
 */
export const noOpExecutor: NodeExecutor = {
  async execute(node): Promise<NodeExecutionResult> {
    return { status: "failed", outputs: [], evidence: [], error: `no-op executor: real execution for "${node.id}" is not wired yet (arrives in U6)` };
  },
};

// --- fresh-context verification seam --------------------------------------------------------------

/**
 * "unavailable" is deliberately distinct from "rejected": a verifier that could not run (no CLI
 * installed, timeout, malformed verdict) has judged nothing, and treating silence as a rejection
 * would be as dishonest as treating it as acceptance. The caller reports it as an unrun check.
 */
export interface VerificationOutcome {
  readonly status: "accepted" | "rejected" | "unavailable";
  readonly repairWorkflowIds?: readonly string[];
  readonly evidence: string;
  readonly error?: string;
}

export interface NodeVerificationContext {
  readonly runtimeWrites?: () => WorkspaceChangeSnapshot;
  readonly runId?: string;
  readonly inputFingerprint?: string;
  readonly workspaceDir: string;
  readonly skillRootDir: string;
  readonly outputs: readonly VerifierOutputRef[];
  readonly now: string;
}

export interface NodeVerifier {
  verify(node: CompiledRunNode, context: NodeVerificationContext): Promise<VerificationOutcome>;
}

/**
 * Read-only where the runtime can enforce it: the verifier judges, never repairs, and a sandbox
 * that cannot write makes that rule mechanical rather than a prompt request. Claude's CLI has no
 * read-only sandbox flag, so its verifier invocation relies on the prompt contract alone — the
 * same trust position as a human reviewer with a writable checkout.
 */
export function buildVerifierCommand(runtime: Exclude<WorkerRuntime, "auto">, prompt: string): WorkerCommand {
  if (runtime === "codex") return { runtime, command: "codex", args: ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--json", prompt], prompt };
  if (runtime === "claude") return { runtime, command: "claude", args: ["-p", "--bare", "--output-format", "json", "--max-turns", "15", prompt], prompt };
  return { runtime, command: "cursor-agent", args: ["agent", "-p", prompt, "--sandbox", "enabled"], prompt };
}

/** Real fresh-context verifier: a separate worker-CLI subprocess judges the produced outputs against the same brief the producer worked from. */
export function createCliVerifier(requestedRuntime: WorkerRuntime = "auto", operationRoutes?: OperationRouteRegistry): NodeVerifier {
  const worker = createCliWorkerVerifier(requestedRuntime);
  return {
    async verify(node, context) {
      if (node.selectedOperation) {
        if (operationRoutes) return operationRoutes.verify(node, context);
        try {
          verifySelectedOperation(node.selectedOperation);
        } catch (error) {
          return { status: "unavailable", evidence: "", error: `selected operation invalid: ${error instanceof Error ? error.message : String(error)}` };
        }
        return {
          status: "unavailable",
          evidence: "",
          error: "binding.execution_route_unavailable: selected extension operations require a registered execution route",
        };
      }
      return worker.verify(node, context);
    },
  };
}

function createCliWorkerVerifier(requestedRuntime: WorkerRuntime): NodeVerifier {
  return {
    async verify(node, context) {
      const runtimes = workerRuntimeCandidates(requestedRuntime);
      if (runtimes.length === 0) {
        return { status: "unavailable", evidence: "", error: `no worker CLI is installed for requested runtime ${requestedRuntime}` };
      }
      const brief = composeNodeBrief(
        node,
        {
          planId: `verify:${context.now}`,
          planRevision: 0,
          catalogVersion: "runtime",
          compiledAt: context.now,
          nodes: [node],
          artifactBindings: context.outputs.map((output) => ({ artifactId: output.artifactId, path: output.path, accepted: false })),
        },
        undefined,
        context.workspaceDir,
      );
      try {
        verifyPackageRolePrompts(node, context.workspaceDir);
        prepareKnowledgeReferences(brief, context.workspaceDir, context.skillRootDir);
      } catch (error) {
        return { status: "unavailable", evidence: "", error: error instanceof Error ? error.message : String(error) };
      }
      const prompt = buildVerifierPrompt(brief, context.workspaceDir, context.skillRootDir, context.outputs);
      let runtime = runtimes[0]!;
      let result: Awaited<ReturnType<typeof runWorker>> | undefined;
      for (const candidate of runtimes) {
        runtime = candidate;
        result = await runWorker(buildVerifierCommand(candidate, prompt), context.workspaceDir, node.ttlSeconds * 1000);
        const failureText = `${result.stdout}\n${result.stderr}`;
        if (result.status === 0 || requestedRuntime !== "auto" || !/(auth|log[ -]?in|api[_ -]?key|unauthori[sz]ed|credential)/i.test(failureText)) break;
      }
      if (!result) return { status: "unavailable", evidence: "", error: "verifier runtime selection produced no invocation" };
      if (result.timedOut) return { status: "unavailable", evidence: "", error: `${runtime} verifier exceeded ${node.ttlSeconds}s TTL` };
      if (result.status !== 0) {
        return { status: "unavailable", evidence: "", error: `${runtime} verifier exited ${String(result.status)}: ${result.stderr.trim().slice(-800)}` };
      }
      const parsed = parseVerifierVerdict(`${result.stdout}\n${result.stderr}`, brief);
      if (!parsed.verdict) {
        // A malformed verdict is not a judgment. Refusing to guess here is what keeps "accepted"
        // meaning a fresh context actually said so.
        return { status: "unavailable", evidence: "", error: `verifier verdict rejected: ${parsed.issues.join("; ")}` };
      }
      return {
        status: parsed.verdict.verdict,
        evidence: `${runtime} verifier: ${parsed.verdict.evidence}`,
        ...(parsed.verdict.repairWorkflowIds ? { repairWorkflowIds: parsed.verdict.repairWorkflowIds } : {}),
      };
    },
  };
}

/** Deterministic stand-in for fixtures and the e2e gate — accepts (or rejects) every node with synthetic evidence. */
export function createFixtureVerifier(verdict: "accepted" | "rejected" = "accepted"): NodeVerifier {
  return {
    async verify(node): Promise<VerificationOutcome> {
      return verdict === "accepted"
        ? { status: "accepted", evidence: `fixture verifier: independently reviewed ${node.id} and accepted it (synthetic)` }
        : { status: "rejected", evidence: `fixture verifier: independently reviewed ${node.id} and rejected it (synthetic)` };
    },
  };
}

/**
 * Test-only stand-in for a slow-but-alive real executor (U6's shape): waits `delayMs` and never
 * calls `context.heartbeat()`, so a caller can prove that liveness — kernel/session/run.ts's own
 * lock/attempt heartbeat refresh — no longer depends on the executor voluntarily cooperating.
 * Exists for the run.ts fixture suite; not selected by any founder-facing runtime profile.
 */
export function createSlowSilentExecutor(delayMs: number): NodeExecutor {
  return {
    async execute(node): Promise<NodeExecutionResult> {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      const outputs: NodeExecutionOutput[] = node.outputs.map((artifactId) => ({
        artifactId,
        path: `slow-silent://${node.id}/${artifactId}`,
        fingerprint: `slow-silent-fp:${node.id}:${artifactId}`,
        evidence: [`slow-silent executor: synthetic completion of ${node.id} after ${delayMs}ms without calling heartbeat`],
      }));
      return { status: "succeeded", outputs, evidence: [`slow-silent executor: ${node.id} completed after ${delayMs}ms without calling heartbeat`] };
    },
  };
}

/** Trusted host registration for one exact pinned worker implementation. Packages cannot invoke this factory. */
export function createCliWorkerArtifactRoute(
  binding: Pick<WorkerArtifactRoute, "operation" | "implementationId" | "packageDigest">,
  runtime: Exclude<WorkerRuntime, "auto">,
): WorkerArtifactRoute {
  return { ...binding, kind: "worker-artifacts", executor: createCliWorkerExecutor(runtime), verifier: createCliWorkerVerifier(runtime) };
}
