/**
 * Live App Review provider over the installed `asc` CLI.
 *
 * Observe-only. This adapter reads App Store Connect. It does not submit,
 * upload, accept agreements, create webhooks, or run `asc webhooks serve`.
 * Fixture providers stay in tests. Consume uses this adapter in production.
 */
import { spawnSync } from "node:child_process";

import type { RawWebAuthStatus } from "./auth.js";
import {
  buildCapabilityReceipt,
  buildWebhookOperationsReceipt,
  collectObservedSchemaIds,
} from "./capability.js";
import { APP_REVIEW_WAKE_EVENT_TYPE, APP_REVIEW_WEBHOOK_PING_EVENT_TYPE } from "./envelope.js";
import { assertNoForbiddenAppReviewCommand } from "./mandate.js";
import type { RawWebReviewShowOutput } from "./packet.js";
import type { AppReviewProvider } from "./poll.js";
import { digestWebhookUrl, type WebhookDeliveryRow, type WebhookRegistrationRow } from "./registration.js";
import type { AppReviewLayerInput, AppReviewPlatform, AppReviewSnapshot } from "./types.js";

export interface AscCommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type AscCommandRunner = (args: readonly string[]) => AscCommandResult;

export interface AscAppReviewProviderInput {
  readonly appId: string;
  readonly platform?: AppReviewPlatform;
  readonly marketingVersion?: string;
  readonly webhookUrl?: string;
  readonly webhookEventTypes?: readonly string[];
  readonly deliveriesNotBefore?: string;
  readonly runner?: AscCommandRunner;
  readonly now?: () => string;
}

export class AscProviderReadError extends Error {
  readonly command: string;

  constructor(command: string, detail: string) {
    super(`App Review live provider failed on ${command}: ${detail}`);
    this.name = "AscProviderReadError";
    this.command = command;
  }
}

const ASC_TIMEOUT_MS = 30_000;
const DEFAULT_WEBHOOK_EVENT_TYPES = [APP_REVIEW_WAKE_EVENT_TYPE, APP_REVIEW_WEBHOOK_PING_EVENT_TYPE] as const;

export function spawnAscCommand(args: readonly string[]): AscCommandResult {
  const command = `asc ${args.join(" ")}`;
  assertNoForbiddenAppReviewCommand(command);
  const result = spawnSync("asc", [...args], { encoding: "utf8", timeout: ASC_TIMEOUT_MS });
  if (result.error) {
    const code = "code" in result.error ? String(result.error.code ?? "") : "";
    const status = code === "ETIMEDOUT" ? 124 : 127;
    return {
      status,
      stdout: result.stdout ?? "",
      stderr: `${result.stderr ?? ""}${result.stderr ? "\n" : ""}${result.error.message}`.trim(),
    };
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseJsonFromCli(text: string): unknown {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const startCandidates = [objectStart, arrayStart].filter((index) => index >= 0);
  if (startCandidates.length === 0) {
    throw new Error("CLI output did not contain JSON");
  }
  const start = Math.min(...startCandidates);
  const closer = text[start] === "[" ? "]" : "}";
  const end = text.lastIndexOf(closer);
  if (end < start) {
    throw new Error("CLI output JSON was truncated");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function runOrThrow(runner: AscCommandRunner, args: readonly string[]): string {
  const command = `asc ${args.join(" ")}`;
  assertNoForbiddenAppReviewCommand(command);
  const result = runner(args);
  if (result.status !== 0) {
    const detail = `${result.stderr}\n${result.stdout}`.trim() || `exit ${result.status}`;
    throw new AscProviderReadError(command, detail);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function runOptional(runner: AscCommandRunner, args: readonly string[]): string | undefined {
  const command = `asc ${args.join(" ")}`;
  assertNoForbiddenAppReviewCommand(command);
  const result = runner(args);
  if (result.status !== 0) return undefined;
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function jsonApiRecords(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.filter(isRecord);
  }
  if (!isRecord(parsed)) return [];
  if (Array.isArray(parsed.data)) {
    return parsed.data.filter(isRecord);
  }
  if (isRecord(parsed.data)) {
    return [parsed.data];
  }
  if (Array.isArray(parsed.webhooks)) {
    return parsed.webhooks.filter(isRecord);
  }
  if (Array.isArray(parsed.deliveries)) {
    return parsed.deliveries.filter(isRecord);
  }
  return [];
}

function recordAttributes(record: Record<string, unknown>): Record<string, unknown> {
  return isRecord(record.attributes) ? record.attributes : record;
}

function layerFromVersion(version: Record<string, unknown> | undefined): AppReviewLayerInput | undefined {
  if (!version) return undefined;
  const attributes = recordAttributes(version);
  const id = asString(version.id) ?? asString(version.versionId) ?? asString(attributes.id);
  const state =
    asString(attributes.state) ?? asString(attributes.appStoreState) ?? asString(version.state) ?? asString(version.appStoreState);
  if (!id || !state) return undefined;
  return {
    layer: "app_version",
    rawValue: state,
    providerObjectId: id,
    schemaId: "AppStoreVersion",
  };
}

function layerFromSubmission(submission: Record<string, unknown> | undefined): AppReviewLayerInput | undefined {
  if (!submission) return undefined;
  const attributes = recordAttributes(submission);
  const id = asString(submission.id) ?? asString(submission.submissionId) ?? asString(attributes.id);
  const state =
    asString(attributes.state) ??
    asString(attributes.submissionState) ??
    asString(submission.state) ??
    asString(submission.submissionState);
  if (!id || !state) return undefined;
  return {
    layer: "review_submission",
    rawValue: state,
    providerObjectId: id,
    schemaId: "ReviewSubmission",
  };
}

function layersFromItems(items: unknown): AppReviewLayerInput[] {
  if (!Array.isArray(items)) return [];
  const layers: AppReviewLayerInput[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const attributes = isRecord(item.attributes) ? item.attributes : item;
    const id = asString(item.id) ?? asString(attributes.id);
    const state = asString(attributes.state) ?? asString(item.state);
    if (!id || !state) continue;
    layers.push({
      layer: "submission_item",
      rawValue: state,
      providerObjectId: id,
      schemaId: "ReviewSubmissionItem",
    });
  }
  return layers;
}

function liveObservationTimestamp(parsed: Record<string, unknown>, now: string): string {
  const stamped = asString(parsed.providerTimestamp);
  if (stamped !== undefined && Number.isFinite(Date.parse(stamped))) {
    return stamped;
  }
  return now;
}

function snapshotFromReviewStatus(parsed: unknown, now: string): AppReviewSnapshot {
  if (!isRecord(parsed)) {
    throw new Error("review status JSON was not an object");
  }
  const version = isRecord(parsed.version) ? parsed.version : undefined;
  const submission = isRecord(parsed.latestSubmission) ? parsed.latestSubmission : isRecord(parsed.submission) ? parsed.submission : undefined;
  const versionLayer = layerFromVersion(version);
  if (!versionLayer) {
    throw new Error("review status JSON had no valid app-version layer");
  }
  const layers: AppReviewLayerInput[] = [versionLayer];
  const submissionLayer = layerFromSubmission(submission);
  if (submissionLayer) layers.push(submissionLayer);
  layers.push(...layersFromItems(parsed.items ?? parsed.submissionItems));
  return {
    providerTimestamp: liveObservationTimestamp(parsed, now),
    layers,
    agreement: { rawStatus: "UNOBSERVED", pending: false },
  };
}

function agreementFromJson(parsed: unknown): { rawStatus: string; pending: boolean } {
  if (!isRecord(parsed)) {
    return { rawStatus: "UNKNOWN", pending: false };
  }
  if (parsed.pending === true) {
    return { rawStatus: asString(parsed.status) ?? asString(parsed.rawStatus) ?? "PENDING", pending: true };
  }
  const status = asString(parsed.status) ?? asString(parsed.rawStatus) ?? asString(parsed.agreementStatus);
  if (status) {
    return { rawStatus: status, pending: /pending/i.test(status) };
  }
  const rows = Array.isArray(parsed.agreements) ? parsed.agreements : jsonApiRecords(parsed);
  for (const row of rows) {
    const attributes = isRecord(row.attributes) ? row.attributes : row;
    const rowStatus = asString(attributes.status) ?? asString(row.status);
    if (attributes.pending === true || (rowStatus !== undefined && /pending/i.test(rowStatus))) {
      return { rawStatus: rowStatus ?? "PENDING", pending: true };
    }
  }
  return { rawStatus: "NONE", pending: false };
}

function webAuthFromJson(parsed: unknown): RawWebAuthStatus | undefined {
  if (!isRecord(parsed)) return undefined;
  const attributes = isRecord(parsed.attributes) ? parsed.attributes : parsed;
  return {
    authenticated: asBoolean(attributes.authenticated) === true,
    expired: asBoolean(attributes.expired) === true,
    ...(asString(attributes.source) ? { source: asString(attributes.source) } : {}),
  };
}

function webhookRowFromRecord(row: Record<string, unknown>): WebhookRegistrationRow | undefined {
  const attributes = isRecord(row.attributes) ? row.attributes : row;
  const resourceId = asString(row.id) ?? asString(attributes.id);
  const url = asString(attributes.url) ?? asString(attributes.payloadUrl) ?? asString(row.url);
  if (!resourceId || !url) return undefined;
  const eventTypesRaw = attributes.eventTypes ?? row.eventTypes;
  const eventTypes = Array.isArray(eventTypesRaw)
    ? eventTypesRaw.map((item) => asString(item)).filter((item): item is string => item !== undefined)
    : typeof eventTypesRaw === "string"
      ? eventTypesRaw
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];
  return {
    resourceId,
    eventTypes,
    enabled: asBoolean(attributes.enabled) ?? asBoolean(row.enabled) ?? true,
    url,
  };
}

function includedById(parsed: unknown): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  if (!isRecord(parsed) || !Array.isArray(parsed.included)) return index;
  for (const item of parsed.included) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    if (id) index.set(id, item);
  }
  return index;
}

function relationshipId(row: Record<string, unknown>, name: string): string | undefined {
  if (!isRecord(row.relationships) || !isRecord(row.relationships[name])) return undefined;
  const rel = row.relationships[name];
  if (isRecord(rel.data)) return asString(rel.data.id);
  return undefined;
}

function deliveryRowFromRecord(row: Record<string, unknown>, included: Map<string, Record<string, unknown>>): WebhookDeliveryRow | undefined {
  const attributes = isRecord(row.attributes) ? row.attributes : row;
  const eventRelId = relationshipId(row, "event") ?? relationshipId(row, "webhookEvent");
  const includedEvent = eventRelId ? included.get(eventRelId) : undefined;
  const providerEventId =
    asString(attributes.eventId) ??
    asString(row.eventId) ??
    asString(attributes.providerEventId) ??
    eventRelId ??
    (includedEvent ? asString(includedEvent.id) : undefined) ??
    asString(row.id);
  const deliveredAt =
    asString(attributes.createdDate) ??
    asString(attributes.deliveredAt) ??
    asString(row.createdDate) ??
    asString(row.deliveredAt);
  if (!providerEventId || !deliveredAt) return undefined;
  const state = (asString(attributes.deliveryState) ?? asString(attributes.state) ?? asString(row.deliveryState) ?? "").toUpperCase();
  const success = asBoolean(attributes.success) ?? asBoolean(row.success) ?? (state.length === 0 || state === "SUCCEEDED" || state === "SUCCESS");
  return { providerEventId, deliveredAt, success };
}

function probeFromRunner(runner: AscCommandRunner, probedAt: string) {
  const versionOut = runOptional(runner, ["--version"]);
  if (versionOut === undefined) {
    const empty = {
      observedCliVersion: "",
      capabilitiesText: "",
      helpByCommand: {},
      schemaIds: [],
      probedAt,
    };
    return {
      receipt: buildCapabilityReceipt(empty),
      operations: buildWebhookOperationsReceipt(empty),
    };
  }
  const versionMatch = versionOut.match(/(\d+\.\d+\.\d+)/);
  const capabilitiesText = runOptional(runner, ["capabilities"]) ?? "";
  const helpByCommand: Record<string, string> = {
    review: runOptional(runner, ["review", "--help"]) ?? "",
    metadata: runOptional(runner, ["metadata", "--help"]) ?? "",
    web: runOptional(runner, ["web", "--help"]) ?? "",
    "web-auth": runOptional(runner, ["web", "auth", "--help"]) ?? "",
    "web-review": runOptional(runner, ["web", "review", "--help"]) ?? "",
    webhooks: runOptional(runner, ["webhooks", "--help"]) ?? "",
  };
  const input = {
    observedCliVersion: versionMatch?.[1] ?? versionOut.trim().split(/\s+/)[0] ?? "",
    capabilitiesText,
    helpByCommand,
    schemaIds: collectObservedSchemaIds(capabilitiesText, helpByCommand),
    probedAt,
  };
  return {
    receipt: buildCapabilityReceipt(input),
    operations: buildWebhookOperationsReceipt(input),
  };
}

export function createAscAppReviewProvider(input: AscAppReviewProviderInput): AppReviewProvider {
  const runner = input.runner ?? spawnAscCommand;
  const clock = input.now ?? (() => new Date().toISOString());
  const eventTypes = input.webhookEventTypes ?? DEFAULT_WEBHOOK_EVENT_TYPES;
  const desired =
    input.webhookUrl && input.webhookUrl.trim().length > 0
      ? { eventTypes, urlDigest: digestWebhookUrl(input.webhookUrl) }
      : undefined;

  const listWebhooks = (): readonly WebhookRegistrationRow[] => {
    if (!desired) return [];
    const text = runOrThrow(runner, ["webhooks", "list", "--app", input.appId, "--output", "json"]);
    let parsed: unknown;
    try {
      parsed = parseJsonFromCli(text);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new AscProviderReadError(`asc webhooks list --app ${input.appId} --output json`, detail);
    }
    return jsonApiRecords(parsed)
      .map(webhookRowFromRecord)
      .filter((row): row is WebhookRegistrationRow => row !== undefined);
  };

  return {
    probeCapabilities(probedAt: string) {
      return probeFromRunner(runner, probedAt).receipt;
    },
    probeWebhookOperations(probedAt: string) {
      return probeFromRunner(runner, probedAt).operations;
    },
    readSnapshot() {
      const now = clock();
      const statusArgs = ["review", "status", "--app", input.appId, "--output", "json"];
      if (input.marketingVersion) {
        statusArgs.push("--version", input.marketingVersion);
      }
      if (input.platform) {
        statusArgs.push("--platform", input.platform);
      }
      const statusText = runOrThrow(runner, statusArgs);
      let parsed: unknown;
      try {
        parsed = parseJsonFromCli(statusText);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new AscProviderReadError(`asc ${statusArgs.join(" ")}`, detail);
      }
      let snapshot: AppReviewSnapshot;
      try {
        snapshot = snapshotFromReviewStatus(parsed, now);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new AscProviderReadError(`asc ${statusArgs.join(" ")}`, detail);
      }
      const agreementText = runOptional(runner, ["web", "agreements", "status", "--output", "json"]);
      if (agreementText === undefined) {
        return snapshot;
      }
      try {
        return {
          ...snapshot,
          agreement: agreementFromJson(parseJsonFromCli(agreementText)),
        };
      } catch {
        return snapshot;
      }
    },
    probeWebAuth() {
      const text = runOptional(runner, ["web", "auth", "status", "--output", "json"]);
      if (text === undefined) return undefined;
      try {
        return webAuthFromJson(parseJsonFromCli(text));
      } catch {
        return undefined;
      }
    },
    readRejectionPacket(query) {
      const text = runOptional(runner, [
        "web",
        "review",
        "show",
        "--app",
        query.appId,
        "--submission",
        query.submissionId,
        "--output",
        "json",
      ]);
      if (text === undefined) return undefined;
      try {
        const parsed = parseJsonFromCli(text);
        return isRecord(parsed) ? (parsed as RawWebReviewShowOutput) : undefined;
      } catch {
        return undefined;
      }
    },
    listWebhooks,
    listDeliveries() {
      if (!desired) return [];
      let listings: readonly WebhookRegistrationRow[];
      try {
        listings = listWebhooks();
      } catch {
        return [];
      }
      const notBefore = input.deliveriesNotBefore ?? "1970-01-01T00:00:00.000Z";
      const deliveries: WebhookDeliveryRow[] = [];
      for (const listing of listings) {
        const text = runOptional(runner, [
          "webhooks",
          "deliveries",
          "--webhook-id",
          listing.resourceId,
          "--created-after",
          notBefore,
          "--output",
          "json",
        ]);
        if (text === undefined) continue;
        try {
          const parsed = parseJsonFromCli(text);
          const included = includedById(parsed);
          for (const row of jsonApiRecords(parsed)) {
            const delivery = deliveryRowFromRecord(row, included);
            if (delivery) deliveries.push(delivery);
          }
        } catch {
          continue;
        }
      }
      return deliveries;
    },
    desiredWebhook() {
      return desired;
    },
  };
}
