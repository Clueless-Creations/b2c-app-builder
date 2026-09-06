import { spawnSync } from "node:child_process";

import {
  APP_REVIEW_CAPABILITY_IDS,
  APP_REVIEW_SCHEMA_IDS,
  APP_REVIEW_WEB_SESSION_CAPABILITY_IDS,
  APP_REVIEW_WEBHOOK_OPERATION_IDS,
  type AppReviewCapabilityId,
  type AppReviewCapabilityProbe,
  type AppReviewCapabilityReceipt,
  type AppReviewSchemaId,
  type AppReviewSchemaProbe,
  type AppReviewWebSessionCapabilityId,
  type AppReviewWebSessionCapabilityProbe,
  type AppReviewWebSessionReceipt,
  type AppReviewWebhookOperationId,
  type AppReviewWebhookOperationProbe,
  type AppReviewWebhookOperationsReceipt,
  type AppReviewWebhookIngress,
} from "./types.js";

export interface CapabilityProbeInput {
  readonly observedCliVersion: string;
  readonly capabilitiesText: string;
  readonly helpByCommand: Readonly<Record<string, string>>;
  readonly schemaIds: readonly string[];
  readonly probedAt: string;
}

const HELP_TOKENS: Readonly<Record<AppReviewCapabilityId, { command?: string; tokens: readonly string[] }>> = {
  "asc.version": { tokens: [] },
  "asc.capabilities": { tokens: ["capabilities"] },
  "asc.review.status": { command: "review", tokens: ["status"] },
  "asc.metadata.validate": { command: "metadata", tokens: ["validate"] },
  "asc.metadata.push.dry_run": { command: "metadata", tokens: ["push", "dry-run"] },
  "asc.web.agreements.status": { command: "web", tokens: ["agreements", "status"] },
};

const WEB_SESSION_HELP_TOKENS: Readonly<Record<AppReviewWebSessionCapabilityId, { command: string; tokens: readonly string[] }>> = {
  "asc.web.auth.status": { command: "web-auth", tokens: ["status"] },
  "asc.web.review.list": { command: "web-review", tokens: ["list"] },
  "asc.web.review.show": { command: "web-review", tokens: ["show"] },
};

const WEBHOOK_HELP_TOKENS: Readonly<Record<AppReviewWebhookOperationId, { tokens: readonly string[] }>> = {
  "asc.webhooks.list": { tokens: ["list"] },
  "asc.webhooks.view": { tokens: ["view"] },
  "asc.webhooks.ping": { tokens: ["ping"] },
  "asc.webhooks.deliveries": { tokens: ["deliveries"] },
};

function hasToken(text: string, token: string): boolean {
  const candidates = token.startsWith("--") || !token.includes("-") ? [token] : [token, `--${token}`];
  return candidates.some((candidate) => {
    if (candidate.startsWith("--") || candidate.includes("-")) {
      return new RegExp(`(?:^|[\\s,=])${escapeRegex(candidate)}(?=[\\s,=<]|$)`, "im").test(text);
    }
    return new RegExp(`(?:^|[\\s,])${escapeRegex(candidate)}(?=[\\s,:]|$)`, "im").test(text);
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstCommandToken(id: AppReviewCapabilityId): string | undefined {
  switch (id) {
    case "asc.version":
      return undefined;
    case "asc.capabilities":
      return "capabilities";
    case "asc.review.status":
      return "review";
    case "asc.metadata.validate":
    case "asc.metadata.push.dry_run":
      return "metadata";
    case "asc.web.agreements.status":
      return "web";
    default: {
      const exhaustive: never = id;
      throw new Error(`Unhandled App Review capability ${String(exhaustive)}`);
    }
  }
}

function probeOne(id: AppReviewCapabilityId, input: CapabilityProbeInput): AppReviewCapabilityProbe {
  if (id === "asc.version") {
    const available = /^\d+\.\d+\.\d+/.test(input.observedCliVersion.trim());
    return {
      id,
      available,
      shapeOk: available,
      evidence: input.observedCliVersion.trim() || "missing",
    };
  }

  const command = firstCommandToken(id);
  const listed = command ? hasToken(input.capabilitiesText, command) : false;
  const spec = HELP_TOKENS[id];
  const helpText = spec.command ? (input.helpByCommand[spec.command] ?? "") : input.capabilitiesText;
  const tokensOk = spec.tokens.every((token) => hasToken(helpText, token) || hasToken(input.capabilitiesText, token));
  const available = listed;
  const shapeOk = available && tokensOk;
  return {
    id,
    available,
    shapeOk,
    evidence: available ? (shapeOk ? "present" : "shape_changed") : "missing",
  };
}

function probeWebSessionOne(id: AppReviewWebSessionCapabilityId, input: CapabilityProbeInput): AppReviewWebSessionCapabilityProbe {
  const listed = hasToken(input.capabilitiesText, "web");
  const spec = WEB_SESSION_HELP_TOKENS[id];
  const helpText = input.helpByCommand[spec.command] ?? input.helpByCommand.web ?? "";
  const tokensOk = spec.tokens.every((token) => hasToken(helpText, token) || hasToken(input.capabilitiesText, token));
  const shapeOk = listed && tokensOk;
  return {
    id,
    available: listed,
    shapeOk,
    evidence: listed ? (shapeOk ? "present" : "shape_changed") : "missing",
  };
}

function probeSchemas(schemaIds: readonly string[]): AppReviewSchemaProbe[] {
  const present = new Set(schemaIds);
  return APP_REVIEW_SCHEMA_IDS.map((id: AppReviewSchemaId) => ({ id, available: present.has(id) }));
}

export function collectObservedSchemaIds(capabilitiesText: string, helpByCommand: Readonly<Record<string, string>> = {}): string[] {
  const haystack = [capabilitiesText, ...Object.values(helpByCommand)].join("\n");
  return APP_REVIEW_SCHEMA_IDS.filter((id) => haystack.includes(id));
}

function buildWebSessionReceipt(input: CapabilityProbeInput): AppReviewWebSessionReceipt {
  const capabilities = APP_REVIEW_WEB_SESSION_CAPABILITY_IDS.map((id) => probeWebSessionOne(id, input));
  return {
    capabilities,
    failClosed: capabilities.some((probe) => !probe.available || !probe.shapeOk),
  };
}

function probeWebhookOne(id: AppReviewWebhookOperationId, input: CapabilityProbeInput): AppReviewWebhookOperationProbe {
  const listed = hasToken(input.capabilitiesText, "webhooks");
  const spec = WEBHOOK_HELP_TOKENS[id];
  const helpText = input.helpByCommand.webhooks ?? "";
  const tokensOk = spec.tokens.every((token) => hasToken(helpText, token) || hasToken(input.capabilitiesText, token));
  const shapeOk = listed && tokensOk;
  return {
    id,
    available: listed,
    shapeOk,
    evidence: listed ? (shapeOk ? "present" : "shape_changed") : "missing",
  };
}

export function buildWebhookOperationsReceipt(input: CapabilityProbeInput): AppReviewWebhookOperationsReceipt {
  const capabilities = APP_REVIEW_WEBHOOK_OPERATION_IDS.map((id) => probeWebhookOne(id, input));
  return {
    capabilities,
    failClosed: capabilities.some((probe) => !probe.available || !probe.shapeOk),
  };
}

export function buildCapabilityReceipt(input: CapabilityProbeInput): AppReviewCapabilityReceipt {
  const capabilities = APP_REVIEW_CAPABILITY_IDS.map((id) => probeOne(id, input));
  const schemas = probeSchemas(input.schemaIds);
  const webSession = buildWebSessionReceipt(input);
  const failClosed = capabilities.some((probe) => !probe.available || !probe.shapeOk) || schemas.some((schema) => !schema.available);
  return {
    observedCliVersion: input.observedCliVersion.trim() || "unknown",
    probedAt: input.probedAt,
    capabilities,
    schemas,
    failClosed,
    webSession,
  };
}

function spawnText(args: readonly string[]): string | undefined {
  const result = spawnSync("asc", [...args], { encoding: "utf8" });
  if (result.error || result.status !== 0) return undefined;
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

export function probeInstalledAscCapabilities(probedAt: string): AppReviewCapabilityReceipt {
  const versionOut = spawnText(["--version"]);
  if (versionOut === undefined) {
    return buildCapabilityReceipt({
      observedCliVersion: "",
      capabilitiesText: "",
      helpByCommand: {},
      schemaIds: [],
      probedAt,
    });
  }
  const versionMatch = versionOut.match(/(\d+\.\d+\.\d+)/);
  const capabilitiesText = spawnText(["capabilities"]) ?? "";
  const helpByCommand: Record<string, string> = {
    review: spawnText(["review", "--help"]) ?? "",
    metadata: spawnText(["metadata", "--help"]) ?? "",
    web: spawnText(["web", "--help"]) ?? "",
    "web-auth": spawnText(["web", "auth", "--help"]) ?? "",
    "web-review": spawnText(["web", "review", "--help"]) ?? "",
    webhooks: spawnText(["webhooks", "--help"]) ?? "",
  };
  return buildCapabilityReceipt({
    observedCliVersion: versionMatch?.[1] ?? versionOut.trim().split(/\s+/)[0] ?? "",
    capabilitiesText,
    helpByCommand,
    schemaIds: collectObservedSchemaIds(capabilitiesText, helpByCommand),
    probedAt,
  });
}

export function requiredCapabilitiesMissing(receipt: AppReviewCapabilityReceipt): boolean {
  return receipt.failClosed;
}

export function unprobedWebhookOperations(): AppReviewWebhookOperationsReceipt {
  return {
    capabilities: APP_REVIEW_WEBHOOK_OPERATION_IDS.map((id) => ({
      id,
      available: false,
      shapeOk: false,
      evidence: "not_probed",
    })),
    failClosed: true,
  };
}

export function emptyWebhookIngress(operations?: AppReviewWebhookOperationsReceipt): AppReviewWebhookIngress {
  return {
    mode: "poll_only",
    health: "poll_only",
    operations: operations ?? unprobedWebhookOperations(),
    acceptedEventIds: [],
  };
}
