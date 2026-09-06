/**
 * Durable queue contract for verified App Review webhook envelopes.
 *
 * The receiver persists an envelope before it returns 2xx. consumeAcceptedWebhookQueue
 * later drains the queue, polls App Store Connect, writes run/app-review.json,
 * then archives each envelope. The queue never stores App Store Connect
 * credentials or the webhook secret value.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { validateAppReviewWebhookEnvelope } from "../../kernel/schema/index.js";
import type { SignedWebhookEnvelope } from "./envelope.js";

export interface WebhookQueuePersistResult {
  readonly stored: boolean;
  readonly duplicate: boolean;
  readonly envelope: SignedWebhookEnvelope;
}

export interface WebhookQueueAcknowledgeResult {
  readonly removed: boolean;
}

export interface AppReviewWebhookQueue {
  persist(envelope: SignedWebhookEnvelope): WebhookQueuePersistResult;
  get(providerEventId: string): SignedWebhookEnvelope | undefined;
  list(): readonly SignedWebhookEnvelope[];
  acknowledge(providerEventId: string): WebhookQueueAcknowledgeResult;
}

export const APP_REVIEW_WEBHOOK_ACKED_DIR = "acked";

function envelopeFileName(providerEventId: string): string {
  return `${providerEventId.replace(/[^A-Za-z0-9._-]+/g, "_")}.json`;
}

function assertSafeEnvelope(envelope: SignedWebhookEnvelope): SignedWebhookEnvelope {
  const check = validateAppReviewWebhookEnvelope<SignedWebhookEnvelope>(envelope);
  if (!check.valid || !check.value) {
    throw new Error(`Refusing to queue an invalid webhook envelope: ${check.issues.map((issue) => issue.message).join("; ")}`);
  }
  const serialized = JSON.stringify(check.value);
  if (serialized.includes("webhookSecret") || serialized.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Refusing to queue a webhook envelope that contains credential material");
  }
  return check.value;
}

export function createMemoryWebhookQueue(): AppReviewWebhookQueue {
  const items = new Map<string, SignedWebhookEnvelope>();
  const acked = new Map<string, SignedWebhookEnvelope>();
  return {
    persist(envelope) {
      const safe = assertSafeEnvelope(envelope);
      const existing = items.get(safe.providerEventId) ?? acked.get(safe.providerEventId);
      if (existing) {
        return { stored: false, duplicate: true, envelope: existing };
      }
      items.set(safe.providerEventId, safe);
      return { stored: true, duplicate: false, envelope: safe };
    },
    get(providerEventId) {
      return items.get(providerEventId);
    },
    list() {
      return [...items.values()];
    },
    acknowledge(providerEventId) {
      const existing = items.get(providerEventId);
      if (!existing) {
        return { removed: false };
      }
      items.delete(providerEventId);
      acked.set(providerEventId, existing);
      return { removed: true };
    },
  };
}

export function createFileWebhookQueue(directory: string): AppReviewWebhookQueue {
  mkdirSync(directory, { recursive: true });
  const readOne = (filePath: string): SignedWebhookEnvelope | undefined => {
    try {
      const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
      const check = validateAppReviewWebhookEnvelope<SignedWebhookEnvelope>(parsed);
      return check.valid ? check.value : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    persist(envelope) {
      const safe = assertSafeEnvelope(envelope);
      const fileName = envelopeFileName(safe.providerEventId);
      const target = path.join(directory, fileName);
      if (existsSync(target)) {
        const existing = readOne(target);
        if (existing) {
          return { stored: false, duplicate: true, envelope: existing };
        }
      }
      const archived = path.join(directory, APP_REVIEW_WEBHOOK_ACKED_DIR, fileName);
      if (existsSync(archived)) {
        const existing = readOne(archived);
        return { stored: false, duplicate: true, envelope: existing ?? safe };
      }
      const tmp = `${target}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(safe, null, 2)}\n`, "utf8");
      renameSync(tmp, target);
      return { stored: true, duplicate: false, envelope: safe };
    },
    get(providerEventId) {
      return readOne(path.join(directory, envelopeFileName(providerEventId)));
    },
    list() {
      return readdirSync(directory)
        .filter((name) => name.endsWith(".json"))
        .map((name) => readOne(path.join(directory, name)))
        .filter((item): item is SignedWebhookEnvelope => item !== undefined);
    },
    acknowledge(providerEventId) {
      const target = path.join(directory, envelopeFileName(providerEventId));
      if (!existsSync(target)) {
        return { removed: false };
      }
      const archivedDir = path.join(directory, APP_REVIEW_WEBHOOK_ACKED_DIR);
      mkdirSync(archivedDir, { recursive: true });
      const archived = path.join(archivedDir, envelopeFileName(providerEventId));
      if (existsSync(archived)) {
        unlinkSync(target);
        return { removed: true };
      }
      renameSync(target, archived);
      return { removed: true };
    },
  };
}
