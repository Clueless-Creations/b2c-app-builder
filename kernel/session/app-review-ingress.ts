#!/usr/bin/env node
/**
 * b2c app-review-ingress — HMAC-verifying App Store Connect webhook intake.
 *
 * Verify or accept a signed Apple webhook without `asc webhooks serve`.
 * Secrets come from the environment. Do not pass secret values on the command line.
 * Consume drains the accepted queue into run/app-review.json on the skill session path.
 * Production consume polls App Store Connect through the live provider.
 *
 *   b2c app-review-ingress verify --body-file <file> --signature hmacsha256=<hex>
 *   b2c app-review-ingress accept --body-file <file> --signature hmacsha256=<hex> --queue-dir <dir>
 *   b2c app-review-ingress consume --workspace <dir> [--queue-dir <dir>]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { isMainModule, parseArgs, resolveCallerPath } from "../lib/cli.js";
import {
  APP_REVIEW_PROVIDER_FIXTURE_ENV,
  APP_REVIEW_WAKE_EVENT_TYPE,
  APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
  APP_REVIEW_WEBHOOK_PING_EVENT_TYPE,
  APP_REVIEW_WEBHOOK_QUEUE_RELATIVE,
  consumeWorkspaceWebhookQueue,
  createAscAppReviewProvider,
  createFileWebhookQueue,
  createFixtureProvider,
  createMemoryWebhookQueue,
  handleSignedWebhookRequest,
  readAppReviewState,
  webhookServeIsFixtureOnly,
  type AppReviewProvider,
  type FixtureProviderPack,
} from "../../adapters/app-review/index.js";
import { loadWorkspaceCatalog, renderCatalogRefusal } from "./catalog-contract.js";

const SECRET_ENV = "B2C_APP_BUILDER_ASC_WEBHOOK_SECRET";
const SECRET_PREVIOUS_ENV = "B2C_APP_BUILDER_ASC_WEBHOOK_SECRET_PREVIOUS";
const WEBHOOK_URL_ENV = "B2C_APP_BUILDER_ASC_WEBHOOK_URL";
const WEBHOOK_EVENTS_ENV = "B2C_APP_BUILDER_ASC_WEBHOOK_EVENTS";

type IngressAction = "verify" | "accept" | "consume";

function isIngressAction(value: string | undefined): value is IngressAction {
  return value === "verify" || value === "accept" || value === "consume";
}

function usage(): string {
  return [
    "Usage: b2c app-review-ingress <verify|accept|consume> [options]",
    "  verify  --body-file <file> --signature hmacsha256=<hex>",
    "  accept  --body-file <file> --signature hmacsha256=<hex> --queue-dir <dir>",
    "  consume --workspace <dir> [--queue-dir <dir>]",
    `Secrets: ${SECRET_ENV} (required for verify/accept), ${SECRET_PREVIOUS_ENV} (optional rotation).`,
    "Consume polls App Store Connect. --provider-fixture is test-only.",
    "Do not run asc webhooks serve as production ingress.",
  ].join("\n");
}

function loadSecrets(): { id: string; secret: string }[] {
  const current = process.env[SECRET_ENV]?.trim() ?? "";
  const previous = process.env[SECRET_PREVIOUS_ENV]?.trim() ?? "";
  const secrets = [];
  if (current.length > 0) secrets.push({ id: "current", secret: current });
  if (previous.length > 0) secrets.push({ id: "previous", secret: previous });
  return secrets;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFixtureProviderPack(value: unknown): value is FixtureProviderPack {
  return isRecord(value) && isRecord(value.snapshot) && isRecord(value.capabilities);
}

function loadFixtureProvider(filePath: string): ReturnType<typeof createFixtureProvider> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
  if (!isFixtureProviderPack(parsed)) return undefined;
  return createFixtureProvider(parsed);
}

function webhookEventTypes(): readonly string[] {
  const raw = process.env[WEBHOOK_EVENTS_ENV]?.trim() ?? "";
  if (raw.length === 0) return [APP_REVIEW_WAKE_EVENT_TYPE, APP_REVIEW_WEBHOOK_PING_EVENT_TYPE];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function fixtureOverrideAllowed(): boolean {
  return process.env[APP_REVIEW_PROVIDER_FIXTURE_ENV]?.trim() === "1";
}

function runVerifyOrAccept(action: "verify" | "accept", args: Record<string, string>): number {
  if (!args["body-file"] || !args.signature) {
    console.error(usage());
    return 1;
  }
  const secrets = loadSecrets();
  if (secrets.length === 0) {
    console.error(`ISSUE app_review_ingress.no_secret: set ${SECRET_ENV}`);
    return 1;
  }
  const bodyPath = resolveCallerPath(args["body-file"]);
  let rawBody: Uint8Array;
  try {
    rawBody = readFileSync(bodyPath);
  } catch {
    console.error(`ISSUE app_review_ingress.body_unreadable: ${bodyPath}`);
    return 1;
  }
  const queueDir = args["queue-dir"] ? resolveCallerPath(args["queue-dir"]) : undefined;
  if (action === "accept" && !queueDir) {
    console.error("ISSUE app_review_ingress.queue_required: accept needs --queue-dir");
    return 1;
  }
  const result = handleSignedWebhookRequest({
    request: {
      method: "POST",
      route: args.route ?? APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
      headers: { "x-apple-signature": args.signature },
      rawBody,
    },
    configuredRoute: args.route ?? APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
    secrets,
    queue: action === "accept" && queueDir ? createFileWebhookQueue(queueDir) : createMemoryWebhookQueue(),
    receivedAt: new Date().toISOString(),
  });
  if (result.status !== 204) {
    console.error(`ISSUE app_review_ingress.rejected: ${result.reason ?? "untrusted"} (${result.status})`);
    return 1;
  }
  if (action === "verify") {
    console.log(`VERIFIED ${result.envelope?.providerEventId ?? "unknown"}`);
    return 0;
  }
  console.log(`${result.duplicate ? "DUPLICATE" : "ACCEPTED"} ${result.envelope?.providerEventId ?? "unknown"}`);
  return 0;
}

function resolveConsumeProvider(args: Record<string, string>, workspaceRoot: string): AppReviewProvider | number {
  if (args["provider-fixture"]) {
    if (!fixtureOverrideAllowed()) {
      console.error(`ISSUE app_review_ingress.provider_fixture_refused: --provider-fixture is test-only; set ${APP_REVIEW_PROVIDER_FIXTURE_ENV}=1`);
      return 1;
    }
    const fixturePath = resolveCallerPath(args["provider-fixture"]);
    const provider = loadFixtureProvider(fixturePath);
    if (!provider) {
      console.error(`ISSUE app_review_ingress.provider_invalid: ${fixturePath}`);
      return 1;
    }
    return provider;
  }
  const loaded = readAppReviewState(path.join(workspaceRoot, "run", "app-review.json"));
  switch (loaded.status) {
    case "missing":
      console.error("ISSUE app_review_ingress.watch_missing: consume needs run/app-review.json");
      return 1;
    case "invalid":
      console.error(`ISSUE app_review_ingress.watch_invalid: ${loaded.message}`);
      return 1;
    case "ok": {
      const webhookUrl = process.env[WEBHOOK_URL_ENV]?.trim() ?? "";
      return createAscAppReviewProvider({
        appId: loaded.state.mandate.appId,
        platform: loaded.state.mandate.platform,
        marketingVersion: loaded.state.mandate.marketingVersion,
        ...(webhookUrl.length > 0 ? { webhookUrl, webhookEventTypes: webhookEventTypes() } : {}),
        deliveriesNotBefore: loaded.state.mandate.startedAt,
      });
    }
    default: {
      const exhaustive: never = loaded;
      throw new Error(`Unhandled App Review load status ${String(exhaustive)}`);
    }
  }
}

function runConsume(args: Record<string, string>): number {
  if (!args.workspace) {
    console.error("ISSUE app_review_ingress.workspace_required: consume needs --workspace");
    return 1;
  }
  const workspaceRoot = resolveCallerPath(args.workspace);
  const compatible = loadWorkspaceCatalog(workspaceRoot);
  if (!compatible.ok) {
    console.error(`ISSUE app_review_ingress.compatibility: ${renderCatalogRefusal(compatible.refusal)}`);
    return 1;
  }
  const queueDir = args["queue-dir"] ? resolveCallerPath(args["queue-dir"]) : path.join(workspaceRoot, APP_REVIEW_WEBHOOK_QUEUE_RELATIVE);
  const provider = resolveConsumeProvider(args, workspaceRoot);
  if (typeof provider === "number") return provider;
  const consumed = consumeWorkspaceWebhookQueue({
    workspaceRoot,
    queue: createFileWebhookQueue(queueDir),
    provider,
    now: new Date().toISOString(),
  });
  switch (consumed.status) {
    case "missing":
      console.error("ISSUE app_review_ingress.watch_missing: consume needs run/app-review.json");
      return 1;
    case "invalid":
      console.error(`ISSUE app_review_ingress.watch_invalid: ${consumed.message}`);
      return 1;
    case "incompatible":
      console.error(`ISSUE app_review_ingress.compatibility: ${consumed.message}`);
      return 1;
    case "provider_failed":
      console.error(`ISSUE app_review_ingress.provider_failed: ${consumed.message}`);
      return 1;
    case "ok":
      console.log(`CONSUMED ${consumed.result.consumedEventIds.length} SKIPPED ${consumed.result.skippedEventIds.length}`);
      return 0;
    default: {
      const exhaustive: never = consumed;
      throw new Error(`Unhandled consume status ${String(exhaustive)}`);
    }
  }
}

function main(): number {
  const argv = process.argv.slice(2);
  const action = argv[0];
  const args = parseArgs(argv.slice(1));
  if (action === "--help" || action === "-h" || !isIngressAction(action)) {
    console.error(usage());
    return action === "--help" || action === "-h" ? 0 : 1;
  }
  if (webhookServeIsFixtureOnly(argv.join(" "))) {
    console.error("ISSUE app_review_ingress.webhooks_serve_refused: asc webhooks serve is fixture-only");
    return 1;
  }
  switch (action) {
    case "verify":
    case "accept":
      return runVerifyOrAccept(action, args);
    case "consume":
      return runConsume(args);
    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled app-review-ingress action ${String(exhaustive)}`);
    }
  }
}

if (isMainModule(import.meta.url)) process.exitCode = main();
