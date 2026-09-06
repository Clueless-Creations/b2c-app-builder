import { quoteArgumentsDigest, type LayersQuote } from "./transport.js";

/**
 * Effect vectors and the quote-before-charge checks for the Layers operations.
 *
 * One effect label is not enough for a hosted, credit-metered provider. Each operation carries an
 * explicit vector: credits, remote state, disclosure, publication, configuration change, and
 * recurring delegation. `requiredActionClass` folds the vector into the action class the existing
 * grant and waiver evaluator understands. There is no Layers-only permission path.
 */
export interface LayersEffectVector {
  readonly credits: { readonly estimate: number; readonly unit: "credits" } | null;
  readonly remoteState: boolean;
  /** What leaves the workspace when the operation runs. */
  readonly disclosure: readonly string[];
  readonly publication: boolean;
  readonly configurationChange: boolean;
  readonly recurringDelegation: boolean;
}

export const LAYERS_OPERATION_IDS = {
  draftCreative: "layers-growth/creative.draft-creative",
  getJob: "layers-growth/creative.get-job",
  getResult: "layers-growth/creative.get-result",
} as const;
export type LayersOperationId = (typeof LAYERS_OPERATION_IDS)[keyof typeof LAYERS_OPERATION_IDS];

/** Documented render cost range read on 2026-09-05. The ceiling is the pre-quote estimate; a quote replaces it. */
export const LAYERS_DOCUMENTED_RENDER_CREDITS = Object.freeze({ min: 25, max: 400 });

const observeOnly: LayersEffectVector = Object.freeze({
  credits: null,
  remoteState: false,
  disclosure: [],
  publication: false,
  configurationChange: false,
  recurringDelegation: false,
});

const draftCreative: LayersEffectVector = Object.freeze({
  credits: { estimate: LAYERS_DOCUMENTED_RENDER_CREDITS.max, unit: "credits" as const },
  remoteState: true,
  disclosure: ["product brief", "persona", "brand assets"],
  publication: false,
  configurationChange: false,
  recurringDelegation: false,
});

export const LAYERS_OPERATION_EFFECTS: Readonly<Record<LayersOperationId, LayersEffectVector>> = Object.freeze({
  [LAYERS_OPERATION_IDS.draftCreative]: draftCreative,
  [LAYERS_OPERATION_IDS.getJob]: observeOnly,
  [LAYERS_OPERATION_IDS.getResult]: observeOnly,
});

/** The vector for an operation, with the credit estimate replaced by an exact quote when one exists. */
export function effectVectorFor(operationId: LayersOperationId, quote?: Pick<LayersQuote, "maxCredits">): LayersEffectVector {
  const base = LAYERS_OPERATION_EFFECTS[operationId];
  if (!base.credits || !quote) return base;
  return { ...base, credits: { estimate: quote.maxCredits, unit: "credits" } };
}

/** Credits are spend before anything else; publication and configuration change are next; the rest is observation. */
export function requiredActionClass(vector: LayersEffectVector): "spend" | "observe" | "publish" | "mutate" {
  if (vector.credits) return "spend";
  if (vector.publication) return "publish";
  if (vector.configurationChange) return "mutate";
  return "observe";
}

export interface QuoteVerificationOptions {
  readonly now: string;
  readonly maxAgeMs: number;
}

/**
 * A quote is usable only for the exact arguments it was issued for, in credits, and while fresh.
 * A changed input or an old quote needs a new quote before any charged call.
 */
export function verifyQuote(quote: LayersQuote, args: unknown, options: QuoteVerificationOptions): void {
  if (!Number.isFinite(quote.maxCredits) || quote.maxCredits < 0 || !Number.isInteger(quote.maxCredits)) throw new Error("layers.quote_invalid_amount");
  if (quote.unit !== "credits") throw new Error("layers.quote_unit_invalid");
  if (typeof quote.forArgumentsSha256 !== "string" || quote.forArgumentsSha256 !== quoteArgumentsDigest(args)) throw new Error("layers.quote_mismatch");
  const quotedAt = Date.parse(quote.quotedAt);
  const now = Date.parse(options.now);
  if (!Number.isFinite(quotedAt) || !Number.isFinite(now) || !Number.isFinite(options.maxAgeMs) || options.maxAgeMs <= 0) throw new Error("layers.quote_stale");
  const age = now - quotedAt;
  if (age < 0 || age > options.maxAgeMs) throw new Error("layers.quote_stale");
}

/** The quoted maximum must fit inside the credits the founder approved for this call. */
export function assertWithinApprovedCredits(quote: Pick<LayersQuote, "maxCredits">, approvedMaxCredits: number): void {
  if (!Number.isFinite(approvedMaxCredits) || approvedMaxCredits < 0) throw new Error("layers.quote_exceeds_approval");
  if (!Number.isFinite(quote.maxCredits) || quote.maxCredits > approvedMaxCredits) throw new Error("layers.quote_exceeds_approval");
}
