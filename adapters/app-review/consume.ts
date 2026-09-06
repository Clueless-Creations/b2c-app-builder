/**
 * Drain accepted webhook envelopes into App Review durable state.
 *
 * The HMAC receiver only persists envelopes. This consumer is the skill-side
 * poll adapter: it loads the watch, calls ingestSignedWebhookEnvelope for each
 * new Apple event id, writes run/app-review.json, then archives each envelope.
 * Production consume uses the live App Store Connect provider. Fixture packs
 * stay in tests.
 */
import path from "node:path";

import { AscProviderReadError } from "./asc-provider.js";
import { ingestSignedWebhookEnvelope, type AppReviewProvider, type PollAppReviewOptions } from "./poll.js";
import { readAppReviewState, writeAppReviewWatch } from "./persist.js";
import type { AppReviewWebhookQueue } from "./queue.js";
import type { SignedWebhookEnvelope } from "./envelope.js";
import type { AppReviewState } from "./types.js";
import { loadWorkspaceCatalog, renderCatalogRefusal } from "../../kernel/session/catalog-contract.js";

export const APP_REVIEW_WEBHOOK_QUEUE_RELATIVE = "run/app-review-webhooks";
export const APP_REVIEW_PROVIDER_FIXTURE_ENV = "B2C_APP_BUILDER_APP_REVIEW_ALLOW_PROVIDER_FIXTURE";

export interface ConsumeAcceptedWebhookQueueResult {
  readonly state: AppReviewState;
  readonly consumedEventIds: readonly string[];
  readonly skippedEventIds: readonly string[];
}

export type ConsumeWorkspaceWebhookQueueResult =
  | { readonly status: "ok"; readonly result: ConsumeAcceptedWebhookQueueResult }
  | { readonly status: "missing" }
  | { readonly status: "invalid"; readonly message: string }
  | { readonly status: "incompatible"; readonly message: string }
  | { readonly status: "provider_failed"; readonly message: string };

function acknowledgeQueue(queue: AppReviewWebhookQueue, ids: readonly string[]): void {
  const unique = [...new Set(ids)];
  for (const id of unique) {
    queue.acknowledge(id);
  }
}

function envelopeOrder(left: SignedWebhookEnvelope, right: SignedWebhookEnvelope): number {
  const byReceived = left.receivedAt.localeCompare(right.receivedAt);
  if (byReceived !== 0) return byReceived;
  const byProvider = left.providerTimestamp.localeCompare(right.providerTimestamp);
  if (byProvider !== 0) return byProvider;
  return left.providerEventId.localeCompare(right.providerEventId);
}

export function consumeAcceptedWebhookQueue(
  state: AppReviewState,
  queue: AppReviewWebhookQueue,
  provider: AppReviewProvider,
  now: string,
  options?: PollAppReviewOptions,
): ConsumeAcceptedWebhookQueueResult {
  const consumedEventIds: string[] = [];
  const skippedEventIds: string[] = [];
  let next = state;
  const envelopes = [...queue.list()].sort(envelopeOrder);
  for (const envelope of envelopes) {
    if (next.webhookIngress.acceptedEventIds.includes(envelope.providerEventId)) {
      skippedEventIds.push(envelope.providerEventId);
      continue;
    }
    next = ingestSignedWebhookEnvelope(next, envelope, provider, now, options);
    consumedEventIds.push(envelope.providerEventId);
  }
  return { state: next, consumedEventIds, skippedEventIds };
}

export function consumeWorkspaceWebhookQueue(input: {
  readonly workspaceRoot: string;
  readonly queue: AppReviewWebhookQueue;
  readonly provider: AppReviewProvider;
  readonly now: string;
  readonly options?: PollAppReviewOptions;
}): ConsumeWorkspaceWebhookQueueResult {
  const compatible = loadWorkspaceCatalog(input.workspaceRoot);
  if (!compatible.ok) {
    return { status: "incompatible", message: renderCatalogRefusal(compatible.refusal) };
  }
  const loaded = readAppReviewState(path.join(input.workspaceRoot, "run", "app-review.json"));
  switch (loaded.status) {
    case "missing":
      return { status: "missing" };
    case "invalid":
      return { status: "invalid", message: loaded.message };
    case "ok": {
      try {
        const result = consumeAcceptedWebhookQueue(loaded.state, input.queue, input.provider, input.now, input.options);
        writeAppReviewWatch(input.workspaceRoot, result.state);
        acknowledgeQueue(input.queue, [...result.consumedEventIds, ...result.skippedEventIds]);
        return { status: "ok", result };
      } catch (error) {
        if (error instanceof AscProviderReadError) {
          return { status: "provider_failed", message: error.message };
        }
        throw error;
      }
    }
    default: {
      const exhaustive: never = loaded;
      throw new Error(`Unhandled App Review load status ${String(exhaustive)}`);
    }
  }
}
