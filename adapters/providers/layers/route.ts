import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NodeExecutionContext } from "../../../kernel/session/executor.js";
import type { OperationRoute, OperationRouteRequest } from "../../../kernel/session/operation-routes.js";
import { LAYERS_OPERATION_IDS, assertWithinApprovedCredits, verifyQuote, type LayersOperationId } from "./effects.js";
import { LayersJobLedger, isCompletedArtifact, type LayersJobEntry } from "./jobs.js";
import { checkBinding, type LayersProviderProject, type LayersSelectedConnection } from "./onboarding.js";
import {
  LAYERS_PROVIDER_ID,
  LAYERS_RENDER_TOOL,
  type LayersArtifact,
  type LayersJobRead,
  type LayersJobState,
  type LayersQuote,
  type LayersTransport,
} from "./transport.js";

/**
 * Host routes for the Layers operations. The host registers these explicitly in the existing
 * OperationRouteRegistry with the package digest; the package manifest cannot register them.
 *
 * draft-creative: binding check -> quote -> quote verification against the approved credits ->
 * ledger reconciliation -> one charged call under the host's idempotency key -> ledger record.
 * get-job and get-result: free reads. No route calls a delivery, publication, paid-media,
 * managed-account, or measurement tool, and no route accepts a publish argument.
 */
export const LAYERS_CREATIVE_FORMATS = ["reaction_reel", "slideshow", "still_ad", "remix"] as const;
export type LayersCreativeFormat = (typeof LAYERS_CREATIVE_FORMATS)[number];

export interface LayersCreativeBrief {
  readonly productBriefId: string;
  readonly format: LayersCreativeFormat;
  readonly personaId?: string;
}
export interface LayersDraftCreativeInput {
  readonly brief: LayersCreativeBrief;
  /** The quote the spend authority was evaluated against. Execution re-quotes and refuses a higher price. */
  readonly quote: LayersQuote;
}
export interface LayersReadInput {
  readonly jobRef: string;
}
export interface LayersJobOutput {
  readonly jobRef: string;
  readonly state: LayersJobState;
  readonly artifact?: LayersArtifact;
  readonly creditsCharged?: number;
}
export interface LayersEvidence {
  readonly providerId: typeof LAYERS_PROVIDER_ID;
  readonly jobRef: string;
  readonly observedState: LayersJobState;
  readonly quoteMaxCredits: number;
  readonly creditsCharged: number | null;
  readonly transport: "fake" | "live";
  readonly observedAt: string;
}

export const LAYERS_DRAFT_REQUEST_PATH = "growth/layers/draft-request.json";
export const LAYERS_READ_REQUEST_PATH = "growth/layers/job-request.json";
export const LAYERS_ROUTE_ARTIFACTS = Object.freeze({
  draftResult: "artifact.growth-layers-draft-creative-json",
  draftReceipt: "artifact.growth-layers-draft-creative-receipt-json",
  jobResult: "artifact.growth-layers-job-status-json",
  jobReceipt: "artifact.growth-layers-job-status-receipt-json",
  resultResult: "artifact.growth-layers-job-result-json",
  resultReceipt: "artifact.growth-layers-job-result-receipt-json",
});
export const LAYERS_IMPLEMENTATION_IDS = Object.freeze({
  draftCreative: "layers-growth/draft-creative",
  getJob: "layers-growth/get-job",
  getResult: "layers-growth/get-result",
});

export interface LayersRouteOptions {
  readonly transport: LayersTransport;
  readonly ledger: LayersJobLedger;
  readonly packageDigest: string;
  /** Credits the founder approved for one render. The quote must fit inside it. */
  readonly approvedMaxCredits: number;
  readonly binding: { readonly providerProject: LayersProviderProject | undefined; readonly selectedConnection: LayersSelectedConnection | undefined };
  readonly now: () => string;
  /** A quote older than this needs a new quote. Default 15 minutes. */
  readonly quoteMaxAgeMs?: number;
  /** Default 15 minutes; render jobs are asynchronous. */
  readonly maxReceiptAgeMs?: number;
  /** Workspace-relative request files read by `input()`. Defaults above. */
  readonly draftRequestPath?: string;
  readonly readRequestPath?: string;
}

const DEFAULT_QUOTE_MAX_AGE_MS = 15 * 60 * 1000;
const DEFAULT_RECEIPT_MAX_AGE_MS = 15 * 60 * 1000;
const PUBLICATION_KEYS = new Set(["publish", "deliver", "delivery", "schedule", "post"]);
const JOB_STATES: readonly LayersJobState[] = ["accepted", "running", "completed", "failed", "uncertain"];

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** A publish or delivery argument anywhere in the input is refused. Publication is a separate, bounded recipe. */
export function assertNoPublicationArguments(value: unknown, trail = "input"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPublicationArguments(entry, `${trail}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (PUBLICATION_KEYS.has(key.toLowerCase())) throw new Error(`layers.publish_not_supported:${trail}.${key}`);
    assertNoPublicationArguments(entry, `${trail}.${key}`);
  }
}

export function parseDraftCreativeInput(value: unknown): LayersDraftCreativeInput {
  assertNoPublicationArguments(value);
  if (!isRecord(value) || !isRecord(value.brief) || !isRecord(value.quote)) throw new Error("layers.input_invalid");
  const brief = value.brief;
  const quote = value.quote;
  if (!nonEmpty(brief.productBriefId) || !LAYERS_CREATIVE_FORMATS.includes(brief.format as LayersCreativeFormat)) throw new Error("layers.input_invalid");
  if (brief.personaId !== undefined && !nonEmpty(brief.personaId)) throw new Error("layers.input_invalid");
  if (typeof quote.maxCredits !== "number" || typeof quote.forArgumentsSha256 !== "string" || typeof quote.quotedAt !== "string")
    throw new Error("layers.input_invalid");
  return {
    brief: {
      productBriefId: brief.productBriefId,
      format: brief.format as LayersCreativeFormat,
      ...(brief.personaId !== undefined ? { personaId: brief.personaId } : {}),
    },
    quote: { maxCredits: quote.maxCredits, unit: quote.unit as "credits", forArgumentsSha256: quote.forArgumentsSha256, quotedAt: quote.quotedAt },
  };
}

export function parseReadInput(value: unknown): LayersReadInput {
  assertNoPublicationArguments(value);
  if (!isRecord(value) || !nonEmpty(value.jobRef)) throw new Error("layers.input_invalid");
  return { jobRef: value.jobRef };
}

/** The exact tool arguments a quote and a call are made for. Canonical shape, no host state. */
export function renderArguments(brief: LayersCreativeBrief): Record<string, unknown> {
  return {
    productBriefId: brief.productBriefId,
    format: brief.format,
    ...(brief.personaId !== undefined ? { personaId: brief.personaId } : {}),
    mode: "draft",
  };
}

function readWorkspaceRequest(context: NodeExecutionContext, relative: string): unknown {
  const file = path.resolve(context.workspaceDir, relative);
  if (!existsSync(file)) throw new Error(`layers.request_missing:${relative}`);
  if (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()) throw new Error(`layers.request_not_regular:${relative}`);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function outputFor(entry: Pick<LayersJobEntry, "jobRef" | "state" | "artifact" | "creditsCharged">): LayersJobOutput {
  if (!entry.jobRef) throw new Error("layers.job_ref_missing");
  return {
    jobRef: entry.jobRef,
    state: JOB_STATES.includes(entry.state as LayersJobState) ? (entry.state as LayersJobState) : "completed",
    ...(entry.artifact ? { artifact: entry.artifact } : {}),
    ...(entry.creditsCharged !== undefined ? { creditsCharged: entry.creditsCharged } : {}),
  };
}

function evidenceFor(options: LayersRouteOptions, output: LayersJobOutput, quoteMaxCredits: number): LayersEvidence {
  return {
    providerId: LAYERS_PROVIDER_ID,
    jobRef: output.jobRef,
    observedState: output.state,
    quoteMaxCredits,
    creditsCharged: output.creditsCharged ?? null,
    transport: options.transport.transport,
    observedAt: options.now(),
  };
}

/**
 * A recorded output stays consistent with a later readback when the job still exists, nothing the
 * output asserted is contradicted, and progress is monotonic: accepted may become running or
 * completed; completed must stay completed with the same artifact; failed and uncertain never
 * confirm a success claim.
 */
export function jobConsistentWithOutput(output: LayersJobOutput, job: LayersJobRead | undefined): boolean {
  if (!job) return false;
  if (output.artifact && (!job.artifact || job.artifact.sha256 !== output.artifact.sha256)) return false;
  if (output.creditsCharged !== undefined && job.creditsCharged !== undefined && job.creditsCharged !== output.creditsCharged) return false;
  switch (output.state) {
    case "completed":
      return job.state === "completed" && !!job.artifact && !!output.artifact;
    case "accepted":
      return job.state === "accepted" || job.state === "running" || job.state === "completed";
    case "running":
      return job.state === "running" || job.state === "completed";
    case "failed":
      return job.state === "failed";
    case "uncertain":
      return false;
  }
}

function assertBinding(options: LayersRouteOptions): void {
  const binding = checkBinding(options.binding.providerProject, options.binding.selectedConnection);
  if (!binding.ok) throw new Error(binding.reason);
}

function routeBase(options: LayersRouteOptions, operation: LayersOperationId, implementationId: string, resultArtifactId: string, receiptArtifactId: string) {
  return {
    kind: "structured-result" as const,
    operation,
    implementationId,
    packageDigest: options.packageDigest,
    resultArtifactId,
    receiptArtifactId,
    maxReceiptAgeMs: options.maxReceiptAgeMs ?? DEFAULT_RECEIPT_MAX_AGE_MS,
  };
}

export function createLayersDraftCreativeRoute(options: LayersRouteOptions): OperationRoute {
  const quoteOptions = () => ({ now: options.now(), maxAgeMs: options.quoteMaxAgeMs ?? DEFAULT_QUOTE_MAX_AGE_MS });
  return {
    ...routeBase(
      options,
      LAYERS_OPERATION_IDS.draftCreative,
      LAYERS_IMPLEMENTATION_IDS.draftCreative,
      LAYERS_ROUTE_ARTIFACTS.draftResult,
      LAYERS_ROUTE_ARTIFACTS.draftReceipt,
    ),
    input(context) {
      return parseDraftCreativeInput(readWorkspaceRequest(context, options.draftRequestPath ?? LAYERS_DRAFT_REQUEST_PATH));
    },
    async execute(request: OperationRouteRequest) {
      assertBinding(options);
      const input = parseDraftCreativeInput(request.input);
      const args = renderArguments(input.brief);
      verifyQuote(input.quote, args, quoteOptions());
      assertWithinApprovedCredits(input.quote, options.approvedMaxCredits);
      const liveQuote = await options.transport.quote(LAYERS_RENDER_TOOL, args);
      verifyQuote(liveQuote, args, quoteOptions());
      assertWithinApprovedCredits(liveQuote, Math.min(options.approvedMaxCredits, input.quote.maxCredits));
      const reconciliation = await options.ledger.reconcile(options.transport, request.idempotencyKey);
      let entry: LayersJobEntry;
      if (reconciliation.action === "proceed" || reconciliation.action === "replay") {
        const response = await options.transport.call(LAYERS_RENDER_TOOL, args, { idempotencyKey: request.idempotencyKey });
        entry = options.ledger.record(
          request.idempotencyKey,
          { operation: LAYERS_OPERATION_IDS.draftCreative, tool: LAYERS_RENDER_TOOL, args },
          liveQuote,
          response,
        );
      } else {
        entry = reconciliation.entry;
      }
      if (entry.state === "uncertain") throw new Error("layers.job_uncertain_requires_readback");
      if (entry.state === "failed") throw new Error("layers.job_failed");
      const output = outputFor(entry);
      return { output, evidence: evidenceFor(options, output, liveQuote.maxCredits) };
    },
    async observe({ output }) {
      const recorded = output as LayersJobOutput;
      if (!isRecord(output) || !nonEmpty(recorded.jobRef)) return false;
      const job = await options.transport.readJob(recorded.jobRef);
      if (job) options.ledger.observe(recorded.jobRef, job, options.now());
      return jobConsistentWithOutput(recorded, job);
    },
  };
}

function createReadRoute(options: LayersRouteOptions, kind: "get-job" | "get-result"): OperationRoute {
  const operation = kind === "get-job" ? LAYERS_OPERATION_IDS.getJob : LAYERS_OPERATION_IDS.getResult;
  const implementationId = kind === "get-job" ? LAYERS_IMPLEMENTATION_IDS.getJob : LAYERS_IMPLEMENTATION_IDS.getResult;
  const [resultId, receiptId] =
    kind === "get-job"
      ? [LAYERS_ROUTE_ARTIFACTS.jobResult, LAYERS_ROUTE_ARTIFACTS.jobReceipt]
      : [LAYERS_ROUTE_ARTIFACTS.resultResult, LAYERS_ROUTE_ARTIFACTS.resultReceipt];
  return {
    ...routeBase(options, operation, implementationId, resultId, receiptId),
    input(context) {
      return parseReadInput(readWorkspaceRequest(context, options.readRequestPath ?? LAYERS_READ_REQUEST_PATH));
    },
    async execute(request: OperationRouteRequest) {
      assertBinding(options);
      const input = parseReadInput(request.input);
      const job = await options.transport.readJob(input.jobRef);
      if (!job) throw new Error("layers.job_not_found");
      options.ledger.observe(input.jobRef, job, options.now());
      const view = { jobRef: input.jobRef, state: job.state, artifact: job.artifact, creditsCharged: job.creditsCharged };
      if (kind === "get-result" && !isCompletedArtifact(view)) throw new Error("layers.result_not_ready");
      const output = outputFor(view);
      // Reads are free per the documentation read on 2026-09-05; the quoted maximum is zero.
      return { output, evidence: evidenceFor(options, output, 0) };
    },
    async observe({ output }) {
      const recorded = output as LayersJobOutput;
      if (!isRecord(output) || !nonEmpty(recorded.jobRef)) return false;
      const job = await options.transport.readJob(recorded.jobRef);
      return jobConsistentWithOutput(recorded, job);
    },
  };
}

export function createLayersReadRoutes(options: LayersRouteOptions): [OperationRoute, OperationRoute] {
  return [createReadRoute(options, "get-job"), createReadRoute(options, "get-result")];
}

/** All three host routes for one package digest: draft-creative, get-job, get-result. */
export function createLayersRoutes(options: LayersRouteOptions): OperationRoute[] {
  return [createLayersDraftCreativeRoute(options), ...createLayersReadRoutes(options)];
}
