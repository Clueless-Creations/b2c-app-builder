#!/usr/bin/env node
import { resolveRuntimeNodeArgs } from "../../tooling/lib/tsx-launcher.mjs";
/**
 * b2c-app-builder-mcp — the engine as a Model Context Protocol server (stdio).
 *
 * Workspace tools exec the exact same CLI the packaged `b2c` bin dispatches to and the audit
 * proves (kernel/session/*.ts, adapters/install-schedule.ts): this server adds a typed,
 * discoverable address for MCP-speaking agents, never a second implementation. Exit codes map to
 * isError; stdout/stderr come back verbatim as the tool result, because those CLIs already speak
 * in complete, founder-plain sentences.
 *
 * Hardening (layering plan A2):
 * - Workspace references resolve ONLY through the registry (adapters/registry.ts): a tool
 *   call names a registered id or the exact registered path; anything else is refused with the
 *   registration command in the message. Traversal is impossible by construction — resolution
 *   never returns a path the registry does not already contain.
 * - Founder-authority actions (deciding an approval, touching the OS schedule) require an
 *   explicit `asFounder: true`: the caller asserts founder authority in the call itself, and the
 *   honest limit stays documented — real enforcement is control-directory ownership at the OS
 *   level, exactly as it is for a human at the same keyboard.
 * - The default server registers only the read tools (plan, status, operate preview/replay).
 *   B2C_APP_BUILDER_MCP_READONLY=1 forces that mode. B2C_APP_BUILDER_MCP_WRITE=1 enables the
 *   gated write tools for an explicitly approved session.
 * - B2C_APP_BUILDER_MCP_CONTRIBUTOR=1 adds the read-only contributor tools (entrypoints/mcp/contribute.ts);
 *   they never fetch, write, or run executables, and read local sources only inside
 *   B2C_APP_BUILDER_CONTRIBUTION_ROOTS.
 *
 * The trust boundary is otherwise unchanged: state moves only through the reducer, approvals
 * only through approve.ts, verification only under producer-never-verifies rules. The server
 * holds no state and grants no authority — it is a calling convention.
 *
 * Run: b2c-app-builder-mcp (stdio transport; register it as an MCP server pointing at this bin).
 */
import { registerPublicTools } from "./business.js";
import { contributorToolsEnabled, registerContributorTools } from "./contribute.js";
import { runProcess } from "./run-process.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveSkillRoot } from "../../tooling/lib/skill-root.js";
import {
  anyWorkerRuntimeFound,
  connectionReceipt,
  interpretConfiguredConnection,
  LOCAL_CLIENT_NAME,
  localMcpInstructions,
  observedLocalWorkspaceHealth,
} from "../../contracts/public-api/connection-receipt.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolveRegisteredWorkspace } from "../../adapters/registry.js";
import { DESIGN_TASTE_DELEGATION_APPROVAL_ID } from "../../kernel/engine/founder-decision-receipt.js";
import { createKnowledgeService, workflowInputSchema } from "../../kernel/knowledge-service/service.js";
import { KNOWLEDGE_TOOL_DEFINITIONS, registerKnowledgeTools, toCallToolResult } from "../../kernel/knowledge-service/tools.js";
import type { HostedKnowledgeBundle, KnowledgeService } from "../../kernel/knowledge-service/types.js";
import { routeUtterance } from "../../kernel/session/route-utterance.js";
import { withOnboardingStepper } from "../../kernel/session/stepper.js";
import { appendDoctorHostBlock } from "../../kernel/session/doctor-host.js";
import { detectWorkerRuntimes } from "../../kernel/session/executor.js";
import { readWorkspaceStatus, renderWorkspaceStatus, resolveCwdWorkspaceState } from "../../kernel/session/status.js";

const skillRoot = resolveSkillRoot(import.meta.url);

function skillVersion(): string {
  try {
    return (JSON.parse(readFileSync(path.join(skillRoot, "skill-version.json"), "utf8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function refusal(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

async function runCli(script: string, args: string[]): Promise<ToolResult> {
  let nodeArgs: string[];
  try {
    nodeArgs = resolveRuntimeNodeArgs(skillRoot, [path.join(skillRoot, script), ...args]);
  } catch (error) {
    return refusal(error instanceof Error ? error.message : String(error));
  }
  const result = await runProcess(process.execPath, nodeArgs, {
    cwd: skillRoot,
    timeoutMs: 3_600_000,
  });
  if (result.timedOut)
    return refusal(
      JSON.stringify({
        actionStatus: "refused",
        reasonCode: "mcp.cli_timeout",
        reason: "The CLI request exceeded its timeout and its process group was terminated.",
      }),
    );
  if (result.error) return refusal(result.error);
  const text = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim() || `(exit ${String(result.status)})`;
  return { content: [{ type: "text", text }], ...(result.status === 0 ? {} : { isError: true }) };
}

/** Registry-only resolution: the allowlist rule every tool shares. */
function workspaceOr(reference: string): { ok: true; path: string } | { ok: false; result: ToolResult } {
  const resolved = resolveRegisteredWorkspace(reference);
  if ("refused" in resolved) return { ok: false, result: refusal(resolved.message) };
  return { ok: true, path: resolved.path };
}

const flag = (name: string, value: string | boolean | number | undefined): string[] =>
  value === undefined || value === false ? [] : value === true ? [`--${name}`] : [`--${name}`, String(value)];

const WORKSPACE_ARG = z
  .string()
  .describe(
    "A REGISTERED workspace id (or its exact registered path). For a new business, use CLI business-create with --workspace, --directory, --name and --hypothesis; it creates and registers an absent or empty target. Use workspaces register only for an existing scaffold.",
  );

const readOnly = process.env.B2C_APP_BUILDER_MCP_WRITE !== "1" || process.env.B2C_APP_BUILDER_MCP_READONLY === "1";
// Knowledge tools use the same immutable service as the hosted MCP and HTTP API.
// A missing or invalid knowledge bundle must not disable local workspace tools.
let knowledgeService: KnowledgeService | undefined;
try {
  const knowledgeBundle = JSON.parse(readFileSync(path.join(skillRoot, "catalog/generated/hosted-knowledge.json"), "utf8")) as HostedKnowledgeBundle;
  knowledgeService = createKnowledgeService(knowledgeBundle);
} catch {
  // Do not expose bundle content, paths, or parser diagnostics in the warning.
  console.error(
    "b2c-app-builder-mcp: Knowledge tools are unavailable. The local knowledge bundle could not be loaded or validated. Workspace tools remain available.",
  );
}

const localWorkspaceHealth = observedLocalWorkspaceHealth({
  workerRuntimeFound: anyWorkerRuntimeFound(detectWorkerRuntimes()),
});

function localRuntimeConnection() {
  return interpretConfiguredConnection({
    clientName: LOCAL_CLIENT_NAME,
    receipt: connectionReceipt({
      mode: "local_execution",
      engineVersion: skillVersion(),
      observed: {
        knowledge: knowledgeService ? "available" : "unavailable",
        writes: readOnly ? "mcp_readonly" : "mcp_write_enabled",
        ...localWorkspaceHealth,
      },
    }),
  });
}

const server = new McpServer(
  { name: "b2c-local", version: skillVersion() },
  {
    instructions: localMcpInstructions({
      knowledge: knowledgeService ? "available" : "unavailable",
      engineVersion: skillVersion(),
      writes: readOnly ? "mcp_readonly" : "mcp_write_enabled",
      workspaceExecution: localWorkspaceHealth.workspaceExecution,
    }),
  },
);
registerPublicTools(server);
if (knowledgeService) {
  // b2c_workflow gets a local-only extended registration below (workspace/workspaceState) — every
  // other knowledge tool name still comes straight from the shared loop.
  registerKnowledgeTools(server, knowledgeService, { exclude: ["b2c_workflow"] });
  const sharedWorkflowDefinition = KNOWLEDGE_TOOL_DEFINITIONS.find((definition) => definition.name === "b2c_workflow")!;
  const localWorkflowInputSchema = workflowInputSchema.extend({
    workspace: z
      .object({ cwd: z.string() })
      .optional()
      .describe(
        "An absolute folder path, local to this stdio server only (never available over the hosted MCP/HTTP surface). Merges workspaceState into the result: " +
          "the exact registration-state classification b2c_status's cwd mode returns for the same folder (registered/inside-registered/missing/unregistered), read through the same " +
          "shared inspector, so the two tools never disagree. REQUIRES brief: true — a workspace fact belongs on a dispatch packet, never bolted onto a bare workflow read.",
      ),
  });
  server.registerTool(
    "b2c_workflow",
    {
      title: sharedWorkflowDefinition.title,
      description:
        `${sharedWorkflowDefinition.description} Local-only extension: pass workspace: { cwd } (with brief: true) to add workspaceState — ` +
        "the same cwd classification b2c_status returns, merged into this result instead of a second round trip.",
      inputSchema: localWorkflowInputSchema,
      annotations: sharedWorkflowDefinition.annotations,
    },
    async ({ workspace, ...rest }) => {
      if (workspace !== undefined && rest.brief !== true) {
        return refusal(
          JSON.stringify({
            actionStatus: "refused",
            reasonCode: "workflow.workspace_requires_brief",
            reason: "workspace requires brief: true.",
            fields: ["workspace", "brief"],
          }),
        );
      }
      const result = toCallToolResult(() => knowledgeService!.workflow(rest));
      if (result.isError) return result;
      let workspaceState: unknown = null;
      if (workspace !== undefined) {
        const resolution = resolveCwdWorkspaceState(workspace.cwd);
        if (!resolution.ok) return refusal(resolution.refusalMessage);
        workspaceState = resolution.state.content;
      }
      const structured = { ...(result.structuredContent as Record<string, unknown>), workspaceState };
      // Explicit body requests may need a larger client ceiling. Route discovery does not.
      return {
        content: [{ type: "text", text: JSON.stringify(structured) }],
        structuredContent: structured,
        ...(["summaries", "full"].includes(rest.include ?? "route") ? { _meta: { "anthropic/maxResultSizeChars": 500_000 } } : {}),
      };
    },
  );
}

server.registerTool(
  "b2c_plan",
  {
    description:
      "Two mutually exclusive request shapes. Provide exactly one of workspace, or {utterance, cwd} — supplying both, or neither, is a typed error. " +
      "workspace: a REGISTERED workspace id (or its exact registered path). Returns the read-only frontier report: what would run next, what is parked, and why — the same computation a real session performs, with no writes. " +
      "utterance + cwd: routes a founder's free-text request to a workflow before any registration exists. cwd is REQUIRED together with utterance (an absolute folder path) — it is checked through the same shared inspector b2c_status's cwd mode uses for a productKind mismatch before any scoring happens. Returns structuredContent with kind:\"route\" and the routing outcome nested under outcome: a single confident primary workflow, a low-confidence candidates[] list, a productKind mismatch, or insufficient_signal — every branch carries a founder-facing nextAgentAction, so routing never dead-ends. When the primary workflow is one of the 23 onboarding-graph nodes, outcome also carries a stepper (totalCount/completedCount/activeNodeIds/blockedNodeIds/anomalies/done) read against cwd — the same projection b2c_status's registered cwd mode returns, so the two tools never disagree about onboarding position. " +
      "Routing reads files only. Registered-workspace planning may execute read-only provider prerequisite probes; it does not write workspace state.",
    inputSchema: {
      workspace: WORKSPACE_ARG.optional(),
      utterance: z.string().optional().describe("A founder's free-text request to route to a workflow. Requires cwd. Mutually exclusive with workspace."),
      mandateScope: z.enum(["focused", "complete_business"]).optional().describe("Explicit intent for pre-registration routing; never grants authority."),
      cwd: z
        .string()
        .optional()
        .describe("An absolute folder path, REQUIRED together with utterance. Checked for a productKind mismatch through the shared inspector before scoring."),
    },
  },
  async ({ workspace, utterance, cwd, mandateScope }) => {
    if (workspace !== undefined && mandateScope !== undefined) return refusal("mandateScope applies only to utterance routing.");
    if (workspace !== undefined && utterance !== undefined) {
      return refusal(
        JSON.stringify({
          actionStatus: "refused",
          reasonCode: "plan.request_conflict",
          reason: "Provide either workspace or {utterance, cwd}, not both.",
          fields: ["workspace", "utterance"],
        }),
      );
    }
    if (workspace === undefined && utterance === undefined) {
      return refusal(
        JSON.stringify({
          actionStatus: "refused",
          reasonCode: "plan.request_required",
          reason: "Provide exactly one of workspace, or utterance with cwd.",
          fields: ["workspace", "utterance"],
        }),
      );
    }
    if (utterance !== undefined) {
      if (cwd === undefined) {
        return refusal(
          JSON.stringify({
            actionStatus: "refused",
            reasonCode: "plan.cwd_required",
            reason: "utterance requires cwd.",
            fields: ["utterance", "cwd"],
          }),
        );
      }
      const outcome = withOnboardingStepper(routeUtterance({ utterance, cwd, mandateScope }), cwd);
      const connection = localRuntimeConnection();
      return { content: [{ type: "text", text: JSON.stringify({ ...outcome, connection }) }], structuredContent: { kind: "route", outcome, connection } };
    }
    const resolved = workspaceOr(workspace!);
    if (!resolved.ok) return resolved.result;
    return runCli("kernel/session/plan.ts", ["--workspace", resolved.path]);
  },
);

server.registerTool(
  "b2c_operate",
  {
    description:
      "Preview or commit the next operating-loop decision through the same typed service the CLI, schedule, and adapters use. Read-only MCP may preview only. Commit rechecks registry, agreement, lease, and expected revision and never accepts a raw reducer patch. Supply the request either as a file path (request) or inline (requestJson) — exactly one, never both.",
    inputSchema: {
      workspace: WORKSPACE_ARG,
      mode: z
        .enum(["preview", "commit", "replay"])
        .describe("preview returns a receipt; commit writes an idempotent work order; replay recomputes a stored receipt"),
      request: z
        .string()
        .optional()
        .describe(
          "Path to the typed operate request JSON (world, transport, gates). Must not include patches, selectors, or authority assertions. Mutually exclusive with requestJson.",
        ),
      requestJson: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "The typed operate request (world, transport, gates) given inline instead of a file path. Same shape and same rules as request; no temp file is written. Mutually exclusive with request.",
        ),
      expectedRevision: z.string().optional().describe("Expected business revision; commit refuses when it does not match"),
      session: z.string().optional().describe("Principal / session id bound on the operation envelope"),
    },
  },
  async ({ workspace, mode, request, requestJson, expectedRevision, session }) => {
    // R18: the read-only + commit refusal fires before any parsing of request/requestJson or any
    // filesystem work (workspace registry lookup, CLI spawn) — keep this the first statement.
    if (readOnly && mode === "commit") {
      return refusal(
        JSON.stringify({
          actionStatus: "refused",
          reasonCode: "operate.readonly_forbids_commit",
          reason: "Read-only MCP may call b2c_operate in preview or replay only.",
          fields: ["mode"],
        }),
      );
    }
    // R16: request (file path) and requestJson (inline) are mutually exclusive; exactly one is
    // required. Reported as structured JSON naming both fields, before any workspace lookup.
    if (request !== undefined && requestJson !== undefined) {
      return refusal(
        JSON.stringify({
          actionStatus: "refused",
          reasonCode: "operate.request_conflict",
          reason: "Provide either request or requestJson, not both.",
          fields: ["request", "requestJson"],
        }),
      );
    }
    if (request === undefined && requestJson === undefined) {
      return refusal(
        JSON.stringify({
          actionStatus: "refused",
          reasonCode: "operate.request_required",
          reason: "Provide exactly one of request or requestJson.",
          fields: ["request", "requestJson"],
        }),
      );
    }
    const resolved = workspaceOr(workspace);
    if (!resolved.ok) return resolved.result;
    return runCli("kernel/session/operate.ts", [
      "--mode",
      mode,
      "--source",
      "mcp",
      "--workspace",
      resolved.path,
      ...(request !== undefined ? ["--request", request] : ["--request-json", JSON.stringify(requestJson)]),
      ...flag("expected-revision", expectedRevision),
      ...flag("session", session),
      ...(readOnly ? ["--read-only"] : []),
      "--json",
    ]);
  },
);

server.registerTool(
  "b2c_status",
  {
    description:
      "Read-only workspace status. Provide exactly one of workspace or cwd — supplying both, or neither, is a typed error. " +
      "workspace: a REGISTERED workspace id (or its exact registered path). Returns the durable run's node-status counts and the latest founder digest. An unregistered reference is refused; use cwd mode to inspect its start path. " +
      "cwd: an absolute folder path not yet resolved through the registry. Classified by the shared workspace inspector (the same one b2c_plan's routing mode uses, so the two tools cannot disagree) into a degraded first-session answer: unregistered carries an inferred phase and nextAgentAction: create a new business with CLI business-create in an absent or empty target, or register an existing scaffold with `b2c workspaces register <id> <path>`. Inspect and preserve occupied app folders. A productKind mismatch is surfaced instead of recommending creation or registration, inside-registered names the containing workspace and returns its normal status, and registry-stale reuses the normal missing-path status. Never errors on an empty folder. registered and inside-registered additionally carry a stepper (onboarding-graph position: totalCount/completedCount/activeNodeIds/blockedNodeIds/anomalies/done) when the workspace's catalog compiles, both in structuredContent and as a trailing text block. " +
      'check: run one named gate (a check:* npm script from the skill package, e.g. "product-md") against workspace instead of returning run status — requires workspace, refused together with cwd. Same verdict as `b2c check <name> --workspace <dir> --json`: structuredContent carries kind:"check" plus {check, command, pass, failures[{severity, rule, message, path?, location?, fixHint?}]}. isError mirrors the gate\'s own exit code, same as every other CLI-backed tool here — a failing check is real structured content, not a broken call, so read structuredContent.pass for the verdict, not isError. ' +
      "Reads files; runs nothing.",
    inputSchema: {
      workspace: WORKSPACE_ARG.optional(),
      cwd: z
        .string()
        .optional()
        .describe(
          "An absolute folder path not yet registered. Mutually exclusive with workspace; classified through the shared inspector, never a second classifier.",
        ),
      check: z
        .string()
        .optional()
        .describe(
          'A check:* name (e.g. "product-md"; see `b2c check --list`) to run against workspace instead of reading run status. Requires workspace; mutually exclusive with cwd.',
        ),
    },
  },
  async ({ workspace, cwd, check }) => {
    if (check !== undefined) {
      if (cwd !== undefined) {
        return refusal(
          JSON.stringify({
            actionStatus: "refused",
            reasonCode: "status.reference_conflict",
            reason: "Provide either workspace or cwd, not both.",
            fields: ["workspace", "cwd"],
          }),
        );
      }
      if (workspace === undefined) {
        return refusal(
          JSON.stringify({
            actionStatus: "refused",
            reasonCode: "status.check_requires_workspace",
            reason: "check requires workspace.",
            fields: ["check", "workspace"],
          }),
        );
      }
      const resolved = workspaceOr(workspace);
      if (!resolved.ok) return resolved.result;
      const result = await runCli("kernel/session/check.ts", ["--workspace", resolved.path, "--name", check, "--json"]);
      try {
        const parsed = JSON.parse(result.content[0]?.text ?? "") as Record<string, unknown>;
        return { ...result, structuredContent: { kind: "check", ...parsed } };
      } catch {
        return result;
      }
    }
    if (workspace !== undefined && cwd !== undefined) {
      return refusal(
        JSON.stringify({
          actionStatus: "refused",
          reasonCode: "status.reference_conflict",
          reason: "Provide either workspace or cwd, not both.",
          fields: ["workspace", "cwd"],
        }),
      );
    }
    if (workspace !== undefined) {
      const resolved = workspaceOr(workspace);
      if (!resolved.ok) return resolved.result;
      return { content: [{ type: "text", text: appendDoctorHostBlock(renderWorkspaceStatus(readWorkspaceStatus(resolved.path))) }] };
    }
    if (cwd === undefined) {
      return refusal(
        JSON.stringify({
          actionStatus: "refused",
          reasonCode: "status.reference_required",
          reason: "Provide exactly one of workspace or cwd.",
          fields: ["workspace", "cwd"],
        }),
      );
    }
    // Behaviour-identical refactor: this used to be inline here; it now lives in
    // kernel/session/status.ts's resolveCwdWorkspaceState so b2c_workflow's local-only brief-mode
    // workspace field can read the same classification (R8 — the two tools cannot disagree).
    const resolution = resolveCwdWorkspaceState(cwd);
    if (!resolution.ok) return refusal(resolution.refusalMessage);
    return { content: [{ type: "text", text: resolution.state.text }], structuredContent: { ...resolution.state.content } };
  },
);

if (!readOnly) {
  server.registerTool(
    "b2c_bootstrap",
    {
      description:
        "Make a registered workspace runnable by the engine: install the executable catalog, migrate v1 state, record the reducer baseline, and apply onboarding answers. Dry-run by default; pass apply: true to write. Idempotent.",
      inputSchema: {
        workspace: WORKSPACE_ARG,
        apply: z.boolean().optional().describe("Perform the steps (default: dry-run report only)"),
        answers: z.string().optional().describe("Path to an onboarding answers JSON (grants/waivers/budgets)"),
      },
    },
    async ({ workspace, apply, answers }) => {
      const resolved = workspaceOr(workspace);
      if (!resolved.ok) return resolved.result;
      return runCli("kernel/session/bootstrap.ts", ["--workspace", resolved.path, ...flag("apply", apply), ...flag("answers", answers)]);
    },
  );

  server.registerTool(
    "b2c_run",
    {
      description:
        "Two modes, one tool name. " +
        "mode session (default): run one bounded headless session against a registered workspace — resume durable state, dispatch ready work within the founder's autonomy grants, verify, and write a founder-plain digest. Exits when done; never runs indefinitely. brief and session are required. " +
        "mode proof: deterministic device-adapter proof only — auto-selects a Route Ladder rung from workspace state (rung 2: xcodebuild/xcrun simctl for iOS on a local macOS session; rung 4: the MobAI CLI for Android or an explicit MobAI provider selection). Rungs 0/1 (Claude Desktop's in-app simulator pane, CLI computer-use) are interactive-agent-only and are never selected here — they stay owned by an interactive worker's own tool use during a normal session run; when neither reachable rung is available the result says so plainly (verdict blocked) rather than narrating a run that did not happen. Each call proves one exact platform target. It returns a bounded adapter-action artifact with top-level platform, target, and verificationScope fields under proof/ios-simulator/, proof/ios-device/, proof/android-emulator/, or proof/android-device/; unresolved Android device identity goes to proof/android-incomplete/. verificationScope is adapter-actions-only. Android CLI success does not establish the strict candidate/package/versionCode/APK-or-AAB/install-APK identity receipt required by design acceptance. brief/session/executor/verifier/wallClockSeconds are not used in this mode; platform selects one branch and is required by the proof CLI for a mixed-platform business; flow and device select the exact proof target, project/scheme/bundleId configure iOS, and packageName plus an exact installable APK configure Android.",
      inputSchema: {
        workspace: WORKSPACE_ARG,
        mode: z
          .enum(["session", "proof"])
          .optional()
          .describe(
            "session (default): the full bounded dispatch above, brief and session required. proof: device proof only; brief/session/executor/verifier/wallClockSeconds unused, flow optional.",
          ),
        brief: z.string().optional().describe("Path to the session brief JSON (businessSlug, founderContact). Required when mode is session (the default)."),
        session: z.string().optional().describe("Unique session id for this run. Required when mode is session (the default)."),
        flow: z.string().optional().describe("Named flow/screen to prove (mode proof only); omit for the workspace's default smoke flow."),
        platform: z.enum(["ios", "android"]).optional().describe("Platform branch to prove (mode proof only); required for a mixed iOS/Android workspace."),
        device: z.string().optional().describe("Exact simulator, emulator, or physical-device name/id (mode proof only)."),
        project: z.string().optional().describe("Exact .xcodeproj or .xcworkspace path (iOS Xcode proof only)."),
        scheme: z.string().optional().describe("Exact Xcode scheme (iOS Xcode proof only)."),
        bundleId: z.string().optional().describe("Expected iOS bundle identifier (iOS proof only)."),
        packageName: z.string().optional().describe("Expected Android application id (Android proof only)."),
        appPath: z
          .string()
          .optional()
          .describe("Exact prebuilt IPA for an explicit MobAI iOS route or exact installable APK for Android; unused by the Xcode simulator build route."),
        executor: z.enum(["auto", "fixture", "noop"]).optional().describe("Worker executor (default auto: real worker CLIs; mode session only)"),
        verifier: z.enum(["cli", "fixture", "off"]).optional().describe("Fresh-context verifier (default follows executor; mode session only)"),
        wallClockSeconds: z.number().optional().describe("Session wall-clock cap (default 1800; mode session only)"),
      },
    },
    async ({
      workspace,
      mode,
      brief,
      session,
      flow,
      platform,
      device,
      project,
      scheme,
      bundleId,
      packageName,
      appPath,
      executor,
      verifier,
      wallClockSeconds,
    }) => {
      const resolved = workspaceOr(workspace);
      if (!resolved.ok) return resolved.result;
      if (mode === "proof") {
        if (bundleId && packageName && bundleId !== packageName) {
          return refusal(
            JSON.stringify({
              actionStatus: "refused",
              reasonCode: "run.proof_identifier_conflict",
              reason: "Pass bundleId for iOS or packageName for Android. They cannot name different identifiers in one proof action.",
              fields: ["bundleId", "packageName"],
            }),
          );
        }
        if ((platform === "android" && (project || scheme || bundleId)) || (platform === "ios" && packageName)) {
          return refusal(
            JSON.stringify({
              actionStatus: "refused",
              reasonCode: "run.proof_platform_fields",
              reason:
                platform === "android"
                  ? "Android proof accepts device, packageName, and an installable APK; project, scheme, and bundleId are iOS-only."
                  : "iOS proof accepts bundleId; packageName is Android-only.",
              fields: platform === "android" ? ["project", "scheme", "bundleId"] : ["packageName"],
            }),
          );
        }
        return runCli("kernel/session/proof.ts", [
          "--workspace",
          resolved.path,
          ...flag("flow", flow),
          ...flag("platform", platform),
          ...flag("device", device),
          ...flag("project", project),
          ...flag("scheme", scheme),
          ...flag("bundle-id", packageName ?? bundleId),
          ...flag("app-path", appPath),
          "--json",
        ]);
      }
      if (brief === undefined || session === undefined) {
        return refusal(
          JSON.stringify({
            actionStatus: "refused",
            reasonCode: "run.session_fields_required",
            reason: "mode session (the default) requires both brief and session.",
            fields: ["brief", "session"],
          }),
        );
      }
      return runCli("kernel/session/run.ts", [
        "--workspace",
        resolved.path,
        "--brief",
        brief,
        "--session",
        session,
        ...flag("executor", executor),
        ...flag("verifier", verifier),
        ...flag("wall-clock-seconds", wallClockSeconds),
      ]);
    },
  );

  server.registerTool(
    "b2c_approvals",
    {
      description:
        "List pending founder approvals, record a workflow approval, bind a direct design Taste Gate decision to the current DESIGN.md candidate, or delegate local design taste to fresh-context audits. Design-taste decisions require an Ed25519 receipt from the authenticated founder signer; asFounder and session are attribution, not authentication.",
      inputSchema: {
        workspace: WORKSPACE_ARG,
        approval: z.string().optional().describe("Approval id to decide (omit to list pending)"),
        decision: z.enum(["approved", "rejected"]).optional().describe("Required with approval"),
        designTaste: z.enum(["pass", "fail"]).optional().describe("Bind a direct founder/owner Taste Gate decision to the exact current DESIGN.md bytes"),
        designTasteDelegation: z
          .enum(["approved", "rejected"])
          .optional()
          .describe("Delegate or retain reversible local design taste decisions for fresh-context audits in the current run"),
        founderReceipt: z.string().optional().describe("Canonical signed founder-decision receipt JSON; required for designTaste or designTasteDelegation"),
        session: z.string().optional().describe("Deciding session id (required with approval)"),
        reason: z.string().optional().describe("Founder-stated reason (recorded on rejection)"),
        asFounder: z.boolean().optional().describe("REQUIRED true to decide: the caller asserts founder authority"),
      },
    },
    async ({ workspace, approval, decision, designTaste, designTasteDelegation, founderReceipt, session, reason, asFounder }) => {
      const resolved = workspaceOr(workspace);
      if (!resolved.ok) return resolved.result;
      if (!approval && !designTaste && !designTasteDelegation) return runCli("kernel/session/approve.ts", ["--workspace", resolved.path, "--list"]);
      if ([approval, designTaste, designTasteDelegation].filter(Boolean).length !== 1) {
        return refusal(
          JSON.stringify({
            actionStatus: "refused",
            reasonCode: "approvals.one_decision_required",
            reason: "Choose exactly one workflow approval, direct design Taste Gate decision, or design-taste delegation decision.",
          }),
        );
      }
      if (asFounder !== true) {
        return refusal(
          JSON.stringify({
            actionStatus: "refused",
            reasonCode: "approvals.founder_authority_required",
            reason:
              "Deciding an approval is a founder-authority action. Pass asFounder: true only when the founder (or their standing authorization) is behind this call — the decision is attested in the audit log under the session id you supply.",
            fields: ["asFounder"],
          }),
        );
      }
      if ((designTaste || designTasteDelegation) && !founderReceipt?.trim()) {
        return refusal(
          JSON.stringify({
            actionStatus: "refused",
            reasonCode: "approvals.signed_founder_receipt_required",
            reason:
              "A direct design-taste or delegation decision requires a current Ed25519 receipt from the authenticated founder signer. The asFounder flag and session label do not grant authority.",
            fields: ["founderReceipt"],
          }),
        );
      }
      if (designTaste) {
        return runCli("kernel/session/approve.ts", [
          "--workspace",
          resolved.path,
          "--design-taste",
          designTaste,
          "--founder-receipt",
          founderReceipt!,
          ...flag("session", session),
        ]);
      }
      if (designTasteDelegation) {
        return runCli("kernel/session/approve.ts", [
          "--workspace",
          resolved.path,
          "--design-taste-delegation",
          designTasteDelegation,
          "--founder-receipt",
          founderReceipt!,
          ...flag("session", session),
        ]);
      }
      if (approval === DESIGN_TASTE_DELEGATION_APPROVAL_ID) {
        return refusal(
          JSON.stringify({
            actionStatus: "refused",
            reasonCode: "approvals.reserved_design_taste_delegation",
            reason: `${DESIGN_TASTE_DELEGATION_APPROVAL_ID} can be changed only through designTasteDelegation so the typed founder decision is recorded.`,
          }),
        );
      }
      return runCli("kernel/session/approve.ts", [
        "--workspace",
        resolved.path,
        "--approval",
        approval!,
        ...flag("decision", decision),
        ...flag("session", session),
        ...flag("reason", reason),
      ]);
    },
  );

  server.registerTool(
    "b2c_verify",
    {
      description:
        "List work parked pending fresh-context verification on a registered workspace, or accept one node with evidence. Producer never verifies its own work — a session that produced the attempt is refused mechanically.",
      inputSchema: {
        workspace: WORKSPACE_ARG,
        node: z.string().optional().describe("Workflow or run-node id to accept (omit to list pending)"),
        session: z.string().optional().describe("Verifying session id (must not have produced the work)"),
        evidence: z.string().optional().describe("What was checked and why it holds (required to accept)"),
      },
    },
    async ({ workspace, node, session, evidence }) => {
      const resolved = workspaceOr(workspace);
      if (!resolved.ok) return resolved.result;
      return node
        ? runCli("kernel/session/verify.ts", ["--workspace", resolved.path, "--node", node, ...flag("session", session), ...flag("evidence", evidence)])
        : runCli("kernel/session/verify.ts", ["--workspace", resolved.path, "--list"]);
    },
  );

  server.registerTool(
    "b2c_schedule",
    {
      description:
        "Install or remove the OS-level trigger (crontab/launchd) that starts recurring headless sessions for a registered workspace. Dry-run needs no authority; applying or uninstalling is a standing change to this machine and requires asFounder: true.",
      inputSchema: {
        workspace: WORKSPACE_ARG,
        runtime: z.enum(["claude", "codex", "cursor"]).describe("Worker CLI the scheduled session uses"),
        schedule: z.string().describe('5-field cron expression, e.g. "0 9 * * 1"'),
        brief: z.string().optional().describe("Path to the session brief JSON (default <workspace>/brief.json)"),
        apply: z.boolean().optional().describe("Touch the real crontab/launchd (default: dry-run)"),
        uninstall: z.boolean().optional().describe("Remove this workspace+runtime's schedule instead"),
        asFounder: z.boolean().optional().describe("REQUIRED true with apply or uninstall: a standing schedule on this machine is the founder's call"),
      },
    },
    async ({ workspace, runtime, schedule, brief, apply, uninstall, asFounder }) => {
      const resolved = workspaceOr(workspace);
      if (!resolved.ok) return resolved.result;
      if ((apply === true || uninstall === true) && asFounder !== true) {
        return refusal(
          JSON.stringify({
            actionStatus: "refused",
            reasonCode: "schedule.founder_authority_required",
            reason:
              "Installing, changing, or removing the recurring schedule is a standing change to this machine — a founder-authority action. Run the dry-run freely; pass asFounder: true with apply/uninstall only when the founder is behind this call.",
            fields: ["asFounder"],
          }),
        );
      }
      return runCli("adapters/install-schedule.ts", [
        "--workspace",
        resolved.path,
        "--runtime",
        runtime,
        "--schedule",
        schedule,
        ...flag("brief", brief),
        ...flag("apply", apply),
        ...flag("uninstall", uninstall),
      ]);
    },
  );
}

// Opt-in contributor surface (ADR-0005): read-only discovery, source inspection inside configured
// roots, plan, check, preview, upstream inventory, recorded upstream checks, and upgrade plans.
// Never registered by default, so business sessions do not see maintenance inventories.
if (contributorToolsEnabled()) registerContributorTools(server, { skillRoot });

await server.connect(new StdioServerTransport());
