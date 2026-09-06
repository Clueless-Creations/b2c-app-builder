import { digest, stableJson } from "../../../tooling/lib/canonical-json.js";

/**
 * Layers transport contract for the `layers-growth` contribution package.
 *
 * Layers (layers.com) is a hosted, credit-metered growth service for TikTok. Its MCP endpoint is
 * reached through the `layers` CLI stdio proxy after a business signs in. This module carries the
 * typed transport shape, a deterministic fake for fixtures, the recorded tool inventory read from
 * the public documentation on 2026-09-05, and a descriptor for the live transport. It contains no
 * live client: nothing here opens a socket, spawns the CLI, or reads a credential store.
 */
export const LAYERS_PROVIDER_ID = "layers-growth/layers" as const;
/** Registered in checks/validation/repository/source-registry.yaml as mcp-layers-com-mcp. */
export const LAYERS_MCP_ENDPOINT = "https://mcp.layers.com/mcp" as const;
export const LAYERS_RENDER_TOOL = "render_content" as const;
/** The publication tool. The adapter never calls it; the name is recorded so fixtures can assert that. */
export const LAYERS_DELIVER_TOOL = "deliver_content_experiment" as const;

export type LayersJobState = "accepted" | "running" | "completed" | "failed" | "uncertain";
export type LayersTransportKind = "fake" | "live";
/** Billing status as read from the documentation. "unknown" stays unknown; it never becomes "free". */
export type LayersBilling = "free" | "charged" | "unknown";

export interface LayersArtifact {
  readonly artifactId: string;
  readonly sha256: string;
  readonly mimeType: string;
}
export interface LayersQuote {
  readonly maxCredits: number;
  readonly unit: "credits";
  readonly forArgumentsSha256: string;
  readonly quotedAt: string;
}
export interface LayersCallResult {
  readonly jobRef: string;
  readonly state: LayersJobState;
  readonly artifact?: LayersArtifact;
  readonly creditsCharged?: number;
}
export interface LayersJobRead {
  readonly state: LayersJobState;
  readonly artifact?: LayersArtifact;
  readonly creditsCharged?: number;
}
export interface LayersToolListing {
  readonly name: string;
  /** `true` and `false` come from documented billing; a live tools/list carries no billing, so unrecorded tools stay "unknown". */
  readonly charged: boolean | "unknown";
}

export interface LayersTransport {
  readonly providerId: typeof LAYERS_PROVIDER_ID;
  readonly transport: LayersTransportKind;
  listTools(): Promise<LayersToolListing[]>;
  /** Free. Returns the exact maximum credits the call may consume for these arguments. */
  quote(tool: string, args: unknown): Promise<LayersQuote>;
  /** Charged when the tool is charged. The idempotency key is forwarded; the provider's handling of it is unverified. */
  call(tool: string, args: unknown, options: { idempotencyKey?: string }): Promise<LayersCallResult>;
  /** Free read of one job by reference. `undefined` means the provider reports no such job. */
  readJob(jobRef: string): Promise<LayersJobRead | undefined>;
}

/** Exact sha256 of the canonical JSON of the arguments a quote was issued for. */
export function quoteArgumentsDigest(args: unknown): string {
  return digest(stableJson(args));
}

/**
 * Tool and resource names read from layers.com/docs/mcp and the layers/mcp README on 2026-09-05.
 * Billing follows the documented rules: resource reads, stored results, persona creation, tracking
 * links, measurement installation, paid-campaign planning, and halt are free; renders are charged.
 * Every other tool keeps "unknown". No tools/list call was made; a live listing is compared with
 * this inventory by `detectToolDrift`, never trusted over it.
 */
export const LAYERS_RECORDED_TOOLS: readonly LayersToolListing[] = Object.freeze([
  { name: "onboard_product", charged: "unknown" },
  { name: "manage_growth_landscape", charged: "unknown" },
  { name: "find_growth_opportunities", charged: "unknown" },
  { name: "plan_content_experiment", charged: "unknown" },
  { name: "generate_influencer", charged: false },
  { name: "add_brand_asset", charged: "unknown" },
  { name: "render_content", charged: true },
  { name: "deliver_content_experiment", charged: "unknown" },
  { name: "track_growth_experiment", charged: "unknown" },
  { name: "review_growth_results", charged: false },
  { name: "install_growth_measurement", charged: false },
  { name: "generate_tracking_link", charged: false },
  { name: "manage_bio_page", charged: "unknown" },
  { name: "research_tiktok_creator", charged: "unknown" },
  { name: "research_tiktok_posts", charged: "unknown" },
  { name: "research_tiktok_search", charged: "unknown" },
  { name: "research_tiktok_hashtag", charged: "unknown" },
  { name: "research_tiktok_trending_sounds", charged: "unknown" },
  { name: "halt", charged: false },
  { name: "cancel_trial_auto_renewal", charged: "unknown" },
  { name: "send_feedback", charged: "unknown" },
]);

/** Resource URIs read from the same documentation. Reads are free per the docs. */
export const LAYERS_RECORDED_RESOURCES: readonly string[] = Object.freeze([
  "layers://next",
  "layers://account",
  "layers://workspace",
  "layers://opportunities",
  "layers://experiments",
  "layers://tracking-links",
  "layers://revenue",
  "layers://jobs",
]);

export interface LayersToolDrift {
  /** Recorded tools the live listing no longer exposes. */
  readonly missing: string[];
  /** Live tools the recorded inventory does not know. Never adopted automatically. */
  readonly added: string[];
  /** Tools whose live billing contradicts a recorded free or charged status. */
  readonly billingChanged: string[];
}

/** Compare a live tools/list with the recorded inventory. Drift is reported; it changes no support claim. */
export function detectToolDrift(live: readonly LayersToolListing[], recorded: readonly LayersToolListing[] = LAYERS_RECORDED_TOOLS): LayersToolDrift {
  const liveByName = new Map(live.map((tool) => [tool.name, tool]));
  const recordedByName = new Map(recorded.map((tool) => [tool.name, tool]));
  const missing = recorded.filter((tool) => !liveByName.has(tool.name)).map((tool) => tool.name);
  const added = live.filter((tool) => !recordedByName.has(tool.name)).map((tool) => tool.name);
  const billingChanged = recorded
    .filter((tool) => {
      const observed = liveByName.get(tool.name);
      return observed !== undefined && tool.charged !== "unknown" && observed.charged !== "unknown" && observed.charged !== tool.charged;
    })
    .map((tool) => tool.name);
  return { missing: missing.sort(), added: added.sort(), billingChanged: billingChanged.sort() };
}

/* ------------------------------------------------------------------------------------------ */
/* Fake transport for fixtures                                                                  */
/* ------------------------------------------------------------------------------------------ */

export interface FakeLayersCall {
  readonly tool: string;
  readonly args: unknown;
  readonly idempotencyKey?: string;
}
/** One scripted response. `jobRef` defaults to `job-<call number>`; `creditsCharged` defaults to none. */
export interface FakeLayersResponse {
  readonly state: LayersJobState;
  readonly jobRef?: string;
  readonly artifact?: LayersArtifact;
  readonly creditsCharged?: number;
  /** When set, the fake stores this job read for the response's jobRef so a later readJob returns it. */
  readonly job?: LayersJobRead | null;
}
export interface FakeLayersScript {
  readonly tools?: readonly LayersToolListing[];
  /** Credits quoted for a charged tool. Free tools quote 0. */
  readonly quoteCredits?: number | ((tool: string, args: unknown) => number);
  /** Responses in call order. The last one repeats. Empty means every call is accepted. */
  readonly responses?: readonly FakeLayersResponse[];
  /** Job reads keyed by jobRef. `undefined` values model "no such job". */
  readonly jobs?: Readonly<Record<string, LayersJobRead | undefined>>;
  readonly now?: () => string;
}
export interface FakeLayersTransport extends LayersTransport {
  readonly transport: "fake";
  readonly calls: readonly FakeLayersCall[];
  readonly quotes: readonly { tool: string; args: unknown }[];
  readonly reads: readonly string[];
  readonly calledTools: readonly string[];
  setJob(jobRef: string, job: LayersJobRead | undefined): void;
}

const isCharged = (tools: readonly LayersToolListing[], tool: string): boolean => tools.find((entry) => entry.name === tool)?.charged === true;

/** Deterministic, in-memory, records every interaction. Never touches the network. */
export function createFakeLayersTransport(script: FakeLayersScript = {}): FakeLayersTransport {
  const tools = script.tools ?? LAYERS_RECORDED_TOOLS;
  const now = script.now ?? (() => "2026-09-05T00:00:00.000Z");
  const responses = script.responses ?? [];
  const jobs = new Map<string, LayersJobRead | undefined>(Object.entries(script.jobs ?? {}));
  const calls: FakeLayersCall[] = [];
  const quotes: { tool: string; args: unknown }[] = [];
  const reads: string[] = [];
  const quoteFor = (tool: string, args: unknown): number => {
    if (!isCharged(tools, tool)) return 0;
    return typeof script.quoteCredits === "function" ? script.quoteCredits(tool, args) : (script.quoteCredits ?? 100);
  };
  return {
    providerId: LAYERS_PROVIDER_ID,
    transport: "fake",
    calls,
    quotes,
    reads,
    get calledTools() {
      return calls.map((call) => call.tool);
    },
    setJob(jobRef, job) {
      jobs.set(jobRef, job);
    },
    async listTools() {
      return tools.map((tool) => ({ ...tool }));
    },
    async quote(tool, args) {
      quotes.push({ tool, args: structuredClone(args) });
      return { maxCredits: quoteFor(tool, args), unit: "credits", forArgumentsSha256: quoteArgumentsDigest(args), quotedAt: now() };
    },
    async call(tool, args, options) {
      calls.push({ tool, args: structuredClone(args), idempotencyKey: options.idempotencyKey });
      const index = Math.min(calls.length - 1, Math.max(responses.length - 1, 0));
      const scripted: FakeLayersResponse = responses[index] ?? { state: "accepted" };
      const jobRef = scripted.jobRef ?? `job-${calls.length}`;
      if (scripted.job !== undefined) jobs.set(jobRef, scripted.job ?? undefined);
      else if (!jobs.has(jobRef) && scripted.state !== "uncertain") {
        jobs.set(jobRef, {
          state: scripted.state,
          ...(scripted.artifact ? { artifact: scripted.artifact } : {}),
          ...(scripted.creditsCharged !== undefined ? { creditsCharged: scripted.creditsCharged } : {}),
        });
      }
      return {
        jobRef,
        state: scripted.state,
        ...(scripted.artifact ? { artifact: scripted.artifact } : {}),
        ...(scripted.creditsCharged !== undefined ? { creditsCharged: scripted.creditsCharged } : {}),
      };
    },
    async readJob(jobRef) {
      reads.push(jobRef);
      const job = jobs.get(jobRef);
      return job ? structuredClone(job) : undefined;
    },
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Live transport descriptor                                                                   */
/* ------------------------------------------------------------------------------------------ */

export interface LiveLayersTransportDescriptor {
  readonly endpoint: typeof LAYERS_MCP_ENDPOINT;
  readonly transport: "layers mcp stdio proxy";
  readonly implemented: false;
}

/**
 * Describes how a live transport would be reached. It is a description only: no client exists in
 * this repository, and creating one is a separate, authorized business adoption step.
 */
export function createLiveLayersTransportDescriptor(): LiveLayersTransportDescriptor {
  return { endpoint: LAYERS_MCP_ENDPOINT, transport: "layers mcp stdio proxy", implemented: false };
}
