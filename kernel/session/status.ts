#!/usr/bin/env node
import { isPlanningWorkspace, readPlanningResume } from "./planning-context.js";
import { assertNoPendingInitialization } from "./initialization-guard.js";
/**
 * Read-only workspace status shared by the CLI, MCP, and workspace registry list.
 *
 * Usage:
 *   b2c status --workspace <id-or-path> [--json]
 *
 * A CLI path is operator-selected scope. A registered id resolves through the local registry.
 * MCP performs its stricter registry-only resolution before it calls the reader exported here.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { resolveRegisteredWorkspace } from "../../adapters/registry.js";
import { isMainModule, parseArgs, resolveCallerPath } from "../lib/cli.js";
import { buildSoftQuestion, type FounderAction } from "./founder-gate.js";
import { inspectWorkspace, type InspectorPhase, type ProductKind } from "./inspect.js";
import { readWorkspaceStepper, type StepperProjection } from "./stepper.js";
import { assertNoPendingErasure } from "../reducer/erasure-guard.js";
import { assertCompositionActivationComplete } from "../composition/activation.js";

export type WorkspaceStatusState =
  "missing" | "not_bootstrapped" | "no_run" | "run_state_unreadable" | "composition_incomplete" | "erasure_incomplete" | "initialization_incomplete" | "run";

export interface WorkspaceStatusCount {
  readonly status: string;
  readonly count: number;
}

export interface WorkspaceDigest {
  readonly file: string;
  readonly content: string;
}

export interface WorkspaceStatus {
  readonly workspacePath: string;
  readonly state: WorkspaceStatusState;
  readonly run?: {
    readonly runId?: string;
    readonly updatedAt?: string;
    readonly counts: readonly WorkspaceStatusCount[];
  };
  readonly latestDigest?: WorkspaceDigest;
  readonly resume?: ReturnType<typeof readPlanningResume>;
}

function latestDigest(workspacePath: string): WorkspaceDigest | undefined {
  const digestsDir = path.join(workspacePath, "digests");
  if (!existsSync(digestsDir)) return undefined;
  try {
    const file = readdirSync(digestsDir)
      .filter((name) => name.endsWith(".md"))
      .sort()
      .at(-1);
    return file ? { file, content: readFileSync(path.join(digestsDir, file), "utf8").trim() } : undefined;
  } catch {
    return undefined;
  }
}

/** Read status from workspace-owned files. This function never writes or executes work. */
export function readWorkspaceStatus(workspacePath: string): WorkspaceStatus {
  const absolute = path.resolve(workspacePath);
  if (!existsSync(absolute)) return { workspacePath: absolute, state: "missing" };
  try {
    assertNoPendingInitialization(absolute);
  } catch {
    return { workspacePath: absolute, state: "initialization_incomplete" };
  }
  try {
    assertNoPendingErasure(absolute);
  } catch {
    return { workspacePath: absolute, state: "erasure_incomplete" };
  }
  try {
    assertCompositionActivationComplete(absolute);
  } catch {
    return { workspacePath: absolute, state: "composition_incomplete" };
  }

  const digest = latestDigest(absolute);
  const withDigest = (status: Omit<WorkspaceStatus, "latestDigest">): WorkspaceStatus => (digest ? { ...status, latestDigest: digest } : status);
  const runStatePath = path.join(absolute, "run", "run-state.json");
  if (!existsSync(runStatePath)) {
    return withDigest({
      workspacePath: absolute,
      state: existsSync(path.join(absolute, "catalog.json")) ? "no_run" : "not_bootstrapped",
      ...(() => {
        try {
          return isPlanningWorkspace(absolute) ? { resume: readPlanningResume(absolute) } : {};
        } catch {
          return {};
        }
      })(),
    });
  }

  try {
    const run = JSON.parse(readFileSync(runStatePath, "utf8")) as unknown;
    if (typeof run !== "object" || run === null || Array.isArray(run)) throw new Error("invalid run state");
    const record = run as { runId?: unknown; updatedAt?: unknown; nodes?: unknown };
    const nodes = record.nodes ?? {};
    if (typeof nodes !== "object" || nodes === null || Array.isArray(nodes)) throw new Error("invalid run nodes");

    const counts = new Map<string, number>();
    for (const node of Object.values(nodes)) {
      const status =
        typeof node === "object" && node !== null && !Array.isArray(node) && typeof (node as { status?: unknown }).status === "string"
          ? (node as { status: string }).status
          : "unknown";
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }

    return withDigest({
      workspacePath: absolute,
      state: "run",
      run: {
        ...(typeof record.runId === "string" ? { runId: record.runId } : {}),
        ...(typeof record.updatedAt === "string" ? { updatedAt: record.updatedAt } : {}),
        counts: [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([status, count]) => ({ status, count })),
      },
    });
  } catch {
    return withDigest({ workspacePath: absolute, state: "run_state_unreadable" });
  }
}

/** Full human-readable status. Keep this text stable because MCP clients consume it. */
export function renderWorkspaceStatus(status: WorkspaceStatus): string {
  const lines: string[] = [];
  if (status.state === "missing") {
    lines.push("Workspace path is missing — update or remove its registry entry.");
  } else if (status.state === "erasure_incomplete") {
    lines.push("Evidence erasure is incomplete. Resume the signed local erasure before continuing.");
  } else if (status.state === "composition_incomplete") {
    lines.push("Composition activation is incomplete. Recover the pending local activation before continuing.");
  } else if (status.state === "run_state_unreadable") {
    lines.push("Run state unreadable — inspect run/run-state.json before continuing.");
  } else if (status.state === "run") {
    lines.push(`Run ${status.run?.runId ?? "(unknown)"} — updated ${status.run?.updatedAt ?? "(unknown)"}`);
    lines.push(status.run?.counts.map((entry) => `${entry.status}: ${entry.count}`).join(", ") ?? "");
  } else {
    lines.push("No durable run yet — bootstrap the workspace and run a session first.");
  }

  if (status.resume) {
    lines.push(
      "",
      status.resume.nextAction,
      ...status.resume.artifacts.map((entry) => `${entry.path}: ${entry.present ? "saved, not yet accepted" : "missing"}`),
    );
  }
  if (status.latestDigest) {
    lines.push("", `Latest digest (${status.latestDigest.file}):`, status.latestDigest.content);
  }
  return lines.join("\n");
}

/** One-line status for `b2c list`. It is a projection of the same structured read. */
export function renderWorkspaceStatusSummary(status: WorkspaceStatus): string {
  if (status.state === "missing") return "MISSING — path no longer exists";
  if (status.state === "erasure_incomplete") return "evidence recovery required";
  if (status.state === "composition_incomplete") return "composition recovery required";
  if (status.state === "not_bootstrapped") return "not bootstrapped";
  if (status.state === "no_run") return "bootstrapped, no session yet";
  if (status.state === "run_state_unreadable") return "run state unreadable";
  return status.run?.counts.map((entry) => `${entry.count} ${entry.status}`).join(", ") || "run state empty";
}

// --- U4: degraded (pre-registration) status --------------------------------------------------
//
// Additive only — everything above this line, including renderWorkspaceStatus's stable text (see
// its comment above), is unchanged. This section shapes the pre-registration cockpit answer (R6)
// for a folder the shared inspector (kernel/session/inspect.ts) classified as unregistered, inside
// a registered workspace, or registry-stale. b2c_plan's routing mode and b2c_status's degraded
// mode both read from that one inspector (R8, KTD4) — nothing here re-derives registration or
// productKind; it only renders what the inspector already decided.

export interface DegradedStatusBlocker {
  readonly code: string;
  readonly message: string;
}

export interface DegradedWorkspaceStatus {
  readonly kind: "unregistered";
  readonly cwd: string;
  readonly phase: InspectorPhase;
  readonly productKind: ProductKind;
  readonly nextAgentAction: string;
  readonly founderAction: FounderAction;
  readonly blockers: readonly DegradedStatusBlocker[];
}

/**
 * Builds the degraded status payload for an unregistered folder (R6). Pure data, no I/O — every
 * input is already the shared inspector's own classification.
 *
 * `nextAgentAction` reuses `suggestedFix` (the inspector's own "b2c workspaces register <id>
 * <path>" text) verbatim rather than reformatting it, EXCEPT when `productKind` is "mismatch"
 * (R9): the register suggestion is suppressed — registering the wrong kind of project is worse
 * than asking first — and replaced with a founder-language prompt to confirm the folder, which is
 * also when `founderAction` (a soft `FounderQuestion` — see founder-gate.ts) is populated instead
 * of null. It is built via `buildSoftQuestion`, never `buildGoNoGoQuestion`: confirming the folder
 * is advisory, not a Go/spend/release confirmation, so it stays skippable and deferrable.
 */
export function buildDegradedWorkspaceStatus(input: {
  readonly cwd: string;
  readonly phase: InspectorPhase;
  readonly productKind: ProductKind;
  readonly suggestedFix: string;
}): DegradedWorkspaceStatus {
  const mismatch = input.productKind === "mismatch";
  const blockers: DegradedStatusBlocker[] = [{ code: "not_registered", message: "This folder is not registered as a b2c-app-builder workspace." }];
  if (mismatch) {
    blockers.push({ code: "product_kind_mismatch", message: "This folder's evidence does not read as a consumer app project." });
  }
  return {
    kind: "unregistered",
    cwd: input.cwd,
    phase: input.phase,
    productKind: input.productKind,
    nextAgentAction: mismatch
      ? "Confirm with the founder that this folder is meant to become a consumer app before registering it — the evidence here reads as a different kind of product."
      : input.suggestedFix,
    founderAction: mismatch
      ? buildSoftQuestion({
          phase: "orientation",
          class: "confirm-product-kind",
          prompt: "This folder doesn't look like a consumer app yet — is this the right place to build one?",
          choices: [
            { label: "Yes, build the app here", consequence: "I'll register this folder and start setting up the business here.", recommended: true },
            { label: "No, this is something else", consequence: "I'll leave this folder alone and look for the right one.", recommended: false },
          ],
        })
      : null,
    blockers,
  };
}

/** Human-readable text for the degraded status (R6). A companion to renderWorkspaceStatus above — that function's text is untouched; this one covers only the unregistered branch. */
export function renderDegradedWorkspaceStatus(status: DegradedWorkspaceStatus): string {
  const lines: string[] = [
    status.productKind === "mismatch" ? `"${status.cwd}" does not look like a consumer app project.` : `"${status.cwd}" is not registered yet.`,
    `Next: ${status.nextAgentAction}`,
  ];
  if (status.founderAction) lines.push("", `Founder action needed: ${status.founderAction.prompt}`);
  if (status.blockers.length > 0) lines.push("", "Blockers:", ...status.blockers.map((blocker) => `- ${blocker.message}`));
  return lines.join("\n");
}

/** Prefix naming the containing registered workspace, then that workspace's own stable status text (renderWorkspaceStatus, untouched) — for a cwd found inside a registered workspace (R6). */
export function renderInsideRegisteredStatus(workspaceId: string, status: WorkspaceStatus): string {
  return `This folder is inside registered workspace "${workspaceId}".\n\n${renderWorkspaceStatus(status)}`;
}

/**
 * U6: an additive trailing text block naming the onboarding stepper's position (R11) — appended
 * ONLY by entrypoints/mcp/server.ts's `cwd` registered/inside-registered branches, after
 * renderWorkspaceStatus's (or renderInsideRegisteredStatus's) own untouched text. The `workspace`
 * parameter branch never calls this (R7: it stays byte-identical, full stop).
 *
 * Prints each node's human title (via `stepper.titlesById`), never its raw dotted engine
 * `workflowId` — `activeNodeIds`/`blockedNodeIds` stay id-based on the projection itself (R13
 * addressability), but that "workflow.…" vocabulary must never reach this founder/agent-facing
 * text (kernel/session/digest.ts's internalVocabularyBlocklist). Falls back to the id itself only if
 * a title is somehow missing from the map, so a lookup gap degrades to a stray id, not a crash.
 */
export function renderStepperBlock(stepper: StepperProjection): string {
  const titleOf = (nodeId: string): string => stepper.titlesById[nodeId] ?? nodeId;
  const lines: string[] = [
    "",
    stepper.source === "planned"
      ? `Onboarding: not started. ${stepper.totalCount} planned step(s); no accepted completion evidence.`
      : `Onboarding: ${stepper.completedCount}/${stepper.totalCount} step(s) complete${stepper.done ? " — done" : ""}.`,
  ];
  if (stepper.activeNodeIds.length > 0)
    lines.push(`${stepper.source === "planned" ? "Next planned" : "Active now"}: ${stepper.activeNodeIds.map(titleOf).join(", ")}`);
  if (stepper.blockedNodeIds.length > 0) {
    lines.push("Blocked on work outside onboarding:");
    for (const blocked of stepper.blockedNodeIds) lines.push(`  - ${titleOf(blocked.nodeId)} (needs: ${blocked.blockedBy.map(titleOf).join(", ")})`);
  }
  return lines.join("\n");
}

// --- E1/#34: the one cwd-classification reader b2c_status's cwd mode and b2c_workflow's local
// workspaceState facet both call -------------------------------------------------------------
//
// Extracted verbatim from entrypoints/mcp/server.ts's original inline b2c_status cwd-mode body (a
// behaviour-identical refactor — the status-degraded fixture suite pins its output byte-for-byte)
// so a second caller (b2c_workflow's brief-mode workspace field) reads the same registration
// state through the same four branches, rather than growing its own classifier (R8: the two tools
// must never disagree about the same folder).

export type CwdWorkspaceStateContent =
  | { readonly kind: "registered"; readonly workspaceId: string; readonly status: WorkspaceStatus; readonly stepper?: StepperProjection }
  | { readonly kind: "inside-registered"; readonly workspaceId: string; readonly status: WorkspaceStatus; readonly stepper?: StepperProjection }
  | { readonly kind: "missing"; readonly workspaceId: string; readonly status: WorkspaceStatus }
  | DegradedWorkspaceStatus;

export interface CwdWorkspaceState {
  /** Founder-plain rendering — identical to what b2c_status's cwd mode has always returned as its text content block. */
  readonly text: string;
  /** Identical to what b2c_status's cwd mode has always returned as structuredContent. */
  readonly content: CwdWorkspaceStateContent;
}

export type ResolveCwdWorkspaceStateResult =
  | { readonly ok: true; readonly state: CwdWorkspaceState }
  // Already the exact refusal text b2c_status returns for the same failure today — some paths
  // carry a "status.<code>: " prefix and some do not, matching the pre-refactor behaviour exactly.
  | { readonly ok: false; readonly refusalMessage: string };

export function resolveCwdWorkspaceState(cwd: string): ResolveCwdWorkspaceStateResult {
  const inspection = inspectWorkspace(cwd);
  if (!inspection.ok) return { ok: false, refusalMessage: `status.${inspection.code}: ${inspection.message}` };

  const registration = inspection.registration;
  if (registration.kind === "registered") {
    const status = readWorkspaceStatus(inspection.cwd);
    const stepperResult = readWorkspaceStepper(inspection.cwd);
    const text = renderWorkspaceStatus(status) + (stepperResult.ok ? `\n${renderStepperBlock(stepperResult.stepper)}` : "");
    return {
      ok: true,
      state: { text, content: { kind: "registered", workspaceId: registration.id, status, ...(stepperResult.ok ? { stepper: stepperResult.stepper } : {}) } },
    };
  }
  if (registration.kind === "inside-registered") {
    const containing = resolveRegisteredWorkspace(registration.id);
    if ("refused" in containing) return { ok: false, refusalMessage: containing.message };
    const status = readWorkspaceStatus(containing.path);
    const stepperResult = readWorkspaceStepper(containing.path);
    const text = renderInsideRegisteredStatus(registration.id, status) + (stepperResult.ok ? `\n${renderStepperBlock(stepperResult.stepper)}` : "");
    return {
      ok: true,
      state: {
        text,
        content: { kind: "inside-registered", workspaceId: registration.id, status, ...(stepperResult.ok ? { stepper: stepperResult.stepper } : {}) },
      },
    };
  }
  if (registration.kind === "registry-stale") {
    const status = readWorkspaceStatus(registration.registeredPath);
    return { ok: true, state: { text: renderWorkspaceStatus(status), content: { kind: "missing", workspaceId: registration.id, status } } };
  }
  const degraded = buildDegradedWorkspaceStatus({
    cwd: inspection.cwd,
    phase: inspection.phase,
    productKind: inspection.productKind,
    suggestedFix: registration.suggestedFix,
  });
  return { ok: true, state: { text: renderDegradedWorkspaceStatus(degraded), content: degraded } };
}

export function resolveCliWorkspace(reference: string): { ok: true; path: string } | { ok: false; message: string } {
  const direct = resolveCallerPath(reference);
  try {
    const registered = resolveRegisteredWorkspace(reference);
    return "refused" in registered ? { ok: true, path: direct } : { ok: true, path: registered.path };
  } catch {
    return existsSync(direct)
      ? { ok: true, path: direct }
      : {
          ok: false,
          message: "status.registry_invalid: the workspace registry is unreadable. Run `b2c doctor`, then repair or recreate the registry before using an ID.",
        };
  }
}

export function main(argv = process.argv.slice(2)): number {
  const args = parseArgs(argv);
  if (!args.workspace) {
    console.error("status.missing_argument: --workspace is required\nUsage: b2c status --workspace <id-or-path> [--json]");
    return 1;
  }
  const resolved = resolveCliWorkspace(args.workspace);
  if (!resolved.ok) {
    console.error(resolved.message);
    return 1;
  }
  const status = readWorkspaceStatus(resolved.path);
  console.log(args.json === "true" ? JSON.stringify(status, null, 2) : renderWorkspaceStatus(status));
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
