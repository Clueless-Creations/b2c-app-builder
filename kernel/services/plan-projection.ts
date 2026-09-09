import type { NodeBrief } from "../engine/node-brief.js";
import {
  PUBLIC_PLAN_BOUNDS,
  publicAttemptFailureCodeSchema,
  publicFounderQuestionClassSchema,
  type BusinessPlan,
  type PublicFounderQuestion,
  type PublicHoldKind,
  type PublicReadyBrief,
} from "../../contracts/public-api/contract.js";
import { validateFounderQuestion, type FounderQuestion } from "../session/founder-gate.js";
import { redactSensitiveText } from "../session/attempt-failure.js";
import type { HeldNode, HeldReason, PlanReport } from "../session/plan.js";

/** Historical `reason` text. New clients must read `holdKind` and `detail`. */
export const PUBLIC_HELD_REASON =
  "This workflow requires current prerequisites, evidence or an authorized decision before dispatch.";
const DETAIL_UNAVAILABLE = "Safe detail is unavailable for this hold; the hold category is still valid.";

function boundText(value: string, max: number): { text: string; truncated: boolean } {
  const sanitized = redactSensitiveText(value).replace(/\s+/g, " ").trim();
  if (sanitized.length <= max) return { text: sanitized, truncated: false };
  return { text: `${sanitized.slice(0, Math.max(0, max - 1))}…`, truncated: true };
}

function isSafeWorkspacePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > PUBLIC_PLAN_BOUNDS.path) return false;
  if (trimmed.startsWith("/") || trimmed.startsWith("~") || /^[A-Za-z]:[\\/]/.test(trimmed)) return false;
  if (trimmed.includes("..") || trimmed.includes("\\") || trimmed.includes("\0")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  return true;
}

function projectPaths(paths: readonly string[]): { paths: string[]; truncated: boolean } {
  const safe = paths.filter(isSafeWorkspacePath);
  const sliced = safe.slice(0, PUBLIC_PLAN_BOUNDS.pathList);
  return { paths: sliced.map((entry) => boundText(entry, PUBLIC_PLAN_BOUNDS.path).text), truncated: safe.length !== paths.length || sliced.length < safe.length };
}

function projectHoldKind(reason: HeldReason): PublicHoldKind {
  switch (reason) {
    case "founder_approval":
    case "autonomy":
    case "blocked":
    case "upstream":
      return reason;
    default: {
      const exhaustive: never = reason;
      throw new Error(`plan.hold_kind_unmapped:${exhaustive}`);
    }
  }
}

export function projectHeldWork(node: HeldNode): BusinessPlan["held"][number] {
  const holdKind = projectHoldKind(node.reason);
  const rawDetail = node.detail.trim();
  const bounded = rawDetail ? boundText(rawDetail, PUBLIC_PLAN_BOUNDS.detail) : { text: "", truncated: false };
  const detail = bounded.text || DETAIL_UNAVAILABLE;
  const lastFailure = projectLastFailure(node);
  return {
    workflowId: node.workflowId,
    title: node.title,
    status: "held",
    reason: PUBLIC_HELD_REASON,
    holdKind,
    detail,
    ...(bounded.truncated ? { detailTruncated: true } : {}),
    ...(node.reasonCode ? { reasonCode: node.reasonCode } : {}),
    ...(lastFailure ? { lastFailure } : {}),
  };
}

function projectLastFailure(node: HeldNode): BusinessPlan["held"][number]["lastFailure"] {
  if (!node.lastFailure && !node.lastFailureCode) return undefined;
  const original = node.lastFailure ?? "";
  const bounded = boundText(original || "The attempt failed without a recorded error.", PUBLIC_PLAN_BOUNDS.failureSummary);
  const parsed = node.lastFailureCode ? publicAttemptFailureCodeSchema.safeParse(node.lastFailureCode) : undefined;
  const withheld = redactSensitiveText(original) !== original.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return {
    summary: bounded.text || "The attempt failed. The recorded error was withheld.",
    withheld: withheld || !bounded.text,
    truncated: bounded.truncated,
    ...(parsed?.success ? { code: parsed.data } : {}),
  };
}

export function projectReadyBrief(brief: NodeBrief): PublicReadyBrief {
  const instructions = boundText(brief.instructions, PUBLIC_PLAN_BOUNDS.instructions);
  const open = projectPaths(brief.open);
  const consult = projectPaths(brief.consult);
  const produce = projectPaths(brief.produce);
  const loadSource = brief.load.slice(0, PUBLIC_PLAN_BOUNDS.loadEntries);
  const load = loadSource.flatMap((entry) => {
    if (!isSafeWorkspacePath(entry.path)) return [];
    const path = boundText(entry.path, PUBLIC_PLAN_BOUNDS.path);
    const loadWhen = boundText(entry.loadWhen, PUBLIC_PLAN_BOUNDS.loadWhen);
    return [
      {
        path: path.text,
        title: boundText(entry.title, PUBLIC_PLAN_BOUNDS.detail).text || "Untitled",
        loadWhen: loadWhen.text,
        ...(entry.sectionId ? { sectionId: boundText(entry.sectionId, 160).text } : {}),
        ...(entry.revision ? { revision: boundText(entry.revision, 160).text } : {}),
      },
    ];
  });
  const approvalsSource = brief.approvals.slice(0, PUBLIC_PLAN_BOUNDS.approvals);
  const gateCommands = brief.verify.gateCommands.filter((command) => isSafeWorkspacePath(command) || !command.includes("/")).slice(0, PUBLIC_PLAN_BOUNDS.gateCommands);
  const truncated =
    instructions.truncated ||
    open.truncated ||
    consult.truncated ||
    produce.truncated ||
    brief.load.length !== load.length ||
    brief.approvals.length !== approvalsSource.length ||
    brief.verify.gateCommands.length !== gateCommands.length;
  return {
    workflowId: brief.workflowId,
    title: brief.title,
    instructions: instructions.text,
    open: open.paths,
    consult: consult.paths,
    load,
    produce: produce.paths,
    verify: {
      kind: brief.verify.kind,
      gateCommands: gateCommands.map((command) => boundText(command, 240).text),
      failClosed: brief.verify.failClosed,
      ...(brief.verify.requiresIndependentReview ? { requiresIndependentReview: true } : {}),
    },
    approvals: approvalsSource.map((approval) => boundText(approval, 400).text),
    truncated,
  };
}

export function projectFounderQuestion(question: FounderQuestion, revision: string): PublicFounderQuestion | null {
  if (validateFounderQuestion(question).length > 0) return null;
  const parsedClass = publicFounderQuestionClassSchema.safeParse(question.class);
  if (!parsedClass.success) return null;
  const prompt = boundText(question.prompt, PUBLIC_PLAN_BOUNDS.prompt);
  if (!prompt.text) return null;
  const choices = question.choices.map((choice) => ({
    label: boundText(choice.label, PUBLIC_PLAN_BOUNDS.choiceLabel).text,
    consequence: boundText(choice.consequence, PUBLIC_PLAN_BOUNDS.choiceConsequence).text,
    recommended: choice.recommended,
  }));
  if (choices.some((choice) => !choice.label || !choice.consequence)) return null;
  return {
    phase: boundText(question.phase, 160).text,
    class: parsedClass.data,
    prompt: prompt.text,
    choices,
    skippable: question.skippable,
    deferrable: question.deferrable,
    appliesToRevision: revision,
  };
}

export function projectInitializedBusinessPlan(input: {
  workspaceId: string;
  revision: string;
  report: PlanReport;
  completion: BusinessPlan["completion"];
}): BusinessPlan {
  const readyNodes = input.report.batches.flat();
  const ready = input.report.readyBriefs.map((brief, index) => {
    const node = readyNodes[index];
    return {
      workflowId: brief.workflowId,
      title: node?.title ?? brief.title,
      status: "ready" as const,
      brief: projectReadyBrief(brief),
    };
  });
  const held = input.report.held.map(projectHeldWork);
  return {
    workspaceId: input.workspaceId,
    revision: input.revision,
    planId: input.report.planId,
    completion: input.completion,
    status: ready.length ? ("ready" as const) : ("held" as const),
    ready,
    held,
    completed: input.report.done,
    providerObservation: "not_requested",
    authorityGranted: false,
    founderQuestion: input.report.founderQuestion ? projectFounderQuestion(input.report.founderQuestion, input.revision) : null,
    nextAction: ready.length
      ? "Run the bounded session against this exact revision using existing authority."
      : "Resolve the reported holds; this passive plan did not observe provider prerequisites.",
  };
}
