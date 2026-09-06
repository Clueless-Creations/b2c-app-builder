import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  APP_REVIEW_PROVIDER_FIXTURE_ENV,
  APP_REVIEW_SCHEMA_IDS,
  APP_REVIEW_SCHEMA_VERSION,
  APP_REVIEW_WAKE_EVENT_TYPE,
  APP_REVIEW_WEBHOOK_ACKED_DIR,
  APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
  applyAppReviewObservation,
  applyAppReviewPlan,
  applyConsumerPatches,
  authorizeAppReviewResubmit,
  envelopeFingerprint,
  markAppReviewResubmitAccepted,
  AscProviderReadError,
  classifyAppReviewCase,
  collectObservedSchemaIds,
  normalizeAgreement,
  commandIsForbiddenForAppReview,
  commandIsStoreSubmission,
  containsSecretMaterial,
  consumeAcceptedWebhookQueue,
  consumeWorkspaceWebhookQueue,
  createAscAppReviewProvider,
  createFileWebhookQueue,
  createFixtureProvider,
  createMemoryWebhookQueue,
  deriveBlocker,
  digestWebhookUrl,
  handleSignedWebhookRequest,
  ingestSignedWebhookEnvelope,
  inspectAppReviewArchive,
  intakeRejectionPacket,
  interpretAppReviewState,
  isProtectedAppReviewKind,
  loadAppReviewState,
  normalizeAppVersionState,
  normalizeLayerValue,
  observeWebhookRegistration,
  parseInfoPlistScalarsFromBytes,
  planAppReviewRemediation,
  pollAppReview,
  projectAppReviewForFounder,
  readAppReviewState,
  recordAppReviewVerification,
  remediationReady,
  renderAppReviewMarkdown,
  routeForClassification,
  sanitizeEvidenceFileName,
  signAppleWebhookBody,
  startObserveMandate,
  submitAppReview,
  webhookServeIsFixtureOnly,
  writeAppReviewState,
  writeAppReviewWatch,
  type AppReviewProvider,
  type AppReviewSnapshot,
  type AppReviewState,
  type AscCommandResult,
  type AscCommandRunner,
  type FixtureProviderPack,
  type SignedWebhookEnvelope,
} from "../../../adapters/app-review/index.js";
import { renderDigest } from "../../../kernel/session/digest.js";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { currentPin } from "./run-persistence.fixtures.js";

const now = "2026-08-24T12:00:00.000Z";
const later = "2026-08-24T12:30:00.000Z";
const earlier = "2026-08-24T11:00:00.000Z";

const threeLayersPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "three-layers.json");

function loadPack(): FixtureProviderPack {
  return JSON.parse(readFileSync(threeLayersPath, "utf8")) as FixtureProviderPack;
}

function seedCompatibleCatalog(workspace: string): void {
  mkdirSync(workspace, { recursive: true });
  writeFileSync(path.join(workspace, "catalog.json"), `${JSON.stringify(currentPin.catalog, null, 2)}\n`, "utf8");
}

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const filePath = path.join(dir, entry.name);
      const relative = path.relative(root, filePath);
      if (entry.isDirectory()) {
        files[`${relative}/`] = "directory";
        walk(filePath);
      } else files[relative] = readFileSync(filePath).toString("base64");
    }
  };
  walk(root);
  return files;
}

function mandateInput() {
  return {
    mandateId: "ocho-1.0.0",
    appleTeamId: "TEAMID",
    appId: "123456789",
    bundleId: "com.example.app",
    platform: "IOS" as const,
    marketingVersion: "1.0.0",
    startedAt: now,
    expiresAt: "2026-09-24T12:00:00.000Z",
  };
}

function withPack(
  pack: FixtureProviderPack,
  patch: {
    capabilitiesText?: string;
    helpByCommand?: Record<string, string>;
    schemaIds?: readonly string[];
    snapshot?: AppReviewSnapshot;
    webAuth?: FixtureProviderPack["webAuth"];
    rejectionPacket?: FixtureProviderPack["rejectionPacket"];
    webhookListings?: FixtureProviderPack["webhookListings"];
    webhookDeliveries?: FixtureProviderPack["webhookDeliveries"];
    desiredWebhook?: FixtureProviderPack["desiredWebhook"];
  },
): FixtureProviderPack {
  return {
    capabilities: {
      observedCliVersion: pack.capabilities.observedCliVersion,
      capabilitiesText: patch.capabilitiesText ?? pack.capabilities.capabilitiesText,
      helpByCommand: patch.helpByCommand ?? pack.capabilities.helpByCommand,
      schemaIds: patch.schemaIds ?? pack.capabilities.schemaIds,
    },
    snapshot: patch.snapshot ?? pack.snapshot,
    webAuth: patch.webAuth ?? pack.webAuth,
    rejectionPacket: patch.rejectionPacket ?? pack.rejectionPacket,
    webhookListings: patch.webhookListings ?? pack.webhookListings,
    webhookDeliveries: patch.webhookDeliveries ?? pack.webhookDeliveries,
    desiredWebhook: patch.desiredWebhook ?? pack.desiredWebhook,
  };
}

function countingProvider(pack: FixtureProviderPack): { provider: AppReviewProvider; snapshotReads: () => number } {
  let reads = 0;
  const inner = createFixtureProvider(pack);
  return {
    provider: {
      ...inner,
      readSnapshot() {
        reads += 1;
        return inner.readSnapshot();
      },
    },
    snapshotReads: () => reads,
  };
}

function cliOk(stdout: string): AscCommandResult {
  return { status: 0, stdout, stderr: "" };
}

function cliFail(stderr: string): AscCommandResult {
  return { status: 1, stdout: "", stderr };
}

function liveReviewStatusJson(): Record<string, unknown> {
  return {
    appId: "123456789",
    version: {
      id: "asv-live-1",
      version: "1.0.0",
      platform: "IOS",
      state: "WAITING_FOR_REVIEW",
      createdDate: later,
    },
    latestSubmission: {
      id: "rs-live-1",
      state: "WAITING_FOR_REVIEW",
      platform: "IOS",
      submittedDate: later,
    },
    reviewState: "WAITING_FOR_REVIEW",
  };
}

function cannedAscRunner(options?: {
  status?: unknown;
  agreements?: unknown;
  failAgreements?: boolean;
  webhooks?: unknown;
  calls?: string[][];
}): AscCommandRunner {
  return (args) => {
    options?.calls?.push([...args]);
    const key = args.join(" ");
    if (args[0] === "--version") return cliOk("4.9.0\n");
    if (key === "capabilities") return cliOk("version capabilities review metadata web webhooks\n");
    if (key === "review --help") return cliOk("status history doctor submit\n");
    if (key === "metadata --help") return cliOk("pull plan apply validate push --dry-run\n");
    if (key === "web --help") return cliOk("agreements status review auth\n");
    if (key === "web auth --help") return cliOk("login status capabilities logout\n");
    if (key === "web review --help") return cliOk("list show subscriptions iaps\n");
    if (key === "webhooks --help") return cliOk("list view ping deliveries serve\n");
    if (args[0] === "review" && args[1] === "status") return cliOk(`${JSON.stringify(options?.status ?? liveReviewStatusJson())}\n`);
    if (args[0] === "web" && args[1] === "agreements" && args[2] === "status") {
      if (options?.failAgreements) return cliFail("no cached Apple web session");
      return cliOk(`${JSON.stringify(options?.agreements ?? { status: "NONE", pending: false })}\n`);
    }
    if (args[0] === "web" && args[1] === "auth" && args[2] === "status") {
      return cliOk(`${JSON.stringify({ authenticated: false, expired: false })}\n`);
    }
    if (args[0] === "webhooks" && args[1] === "list") {
      return cliOk(`${JSON.stringify(options?.webhooks ?? { data: [] })}\n`);
    }
    return cliFail(`unexpected ${key}`);
  };
}

function queuedEnvelope(providerEventId: string, receivedAt: string): SignedWebhookEnvelope {
  return {
    schemaVersion: "1.0.0",
    provider: "app-store-connect",
    providerEventId,
    eventType: APP_REVIEW_WAKE_EVENT_TYPE,
    providerTimestamp: receivedAt,
    receivedAt,
    rawBodySha256: "a".repeat(64),
    rawBodyByteLength: 32,
    signatureAlgorithm: "hmacsha256",
    secretId: "current",
    unknownPayload: false,
  };
}

function writeFakeAsc(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  const script = `#!/usr/bin/env node
const args = process.argv.slice(2);
const key = args.join(" ");
function ok(text) { process.stdout.write(text); process.exit(0); }
if (args[0] === "--version") ok("4.9.0\\n");
if (key === "capabilities") ok("version capabilities review metadata web webhooks\\n");
if (key === "review --help") ok("status history doctor submit\\n");
if (key === "metadata --help") ok("pull plan apply validate push --dry-run\\n");
if (key === "web --help") ok("agreements status review auth\\n");
if (key === "web auth --help") ok("login status capabilities logout\\n");
if (key === "web review --help") ok("list show subscriptions iaps\\n");
if (key === "webhooks --help") ok("list view ping deliveries serve\\n");
if (args[0] === "review" && args[1] === "status") {
  ok(JSON.stringify({
    appId: "123456789",
    version: { id: "asv-live-1", version: "1.0.0", platform: "IOS", state: "WAITING_FOR_REVIEW", createdDate: "2026-08-24T12:30:00.000Z" },
    latestSubmission: { id: "rs-live-1", state: "WAITING_FOR_REVIEW", platform: "IOS", submittedDate: "2026-08-24T12:30:00.000Z" },
    reviewState: "WAITING_FOR_REVIEW"
  }) + "\\n");
}
if (args[0] === "web" && args[1] === "agreements") ok(JSON.stringify({ status: "NONE", pending: false }) + "\\n");
if (args[0] === "web" && args[1] === "auth") ok(JSON.stringify({ authenticated: false }) + "\\n");
if (args[0] === "webhooks" && args[1] === "list") ok(JSON.stringify({ data: [] }) + "\\n");
process.stderr.write("unexpected " + key + "\\n");
process.exit(1);
`;
  const target = path.join(binDir, "asc");
  writeFileSync(target, script, { encoding: "utf8", mode: 0o755 });
  chmodSync(target, 0o755);
}

export function register(harness: Harness): void {
  harness.check("normalize: known app-version states map; unknown stays unknown_provider_state", () => {
    assert(normalizeAppVersionState("WAITING_FOR_REVIEW") === "waiting_for_review", "waiting maps");
    assert(normalizeAppVersionState("PROCESSING_FOR_APP_STORE") === "processing", "Apple processing state maps");
    assert(normalizeAppVersionState("PROCESSING_FOR_DISTRIBUTION") === "processing", "current processing maps");
    assert(normalizeAppVersionState("SOME_NEW_APPLE_STATE") === "unknown_provider_state", "unknown fails closed");
    assert(normalizeLayerValue("review_submission", "UNRESOLVED_ISSUES") === "unresolved_issues", "submission maps");
    assert(normalizeLayerValue("submission_item", "BRAND_NEW") === "unknown_provider_state", "item unknown fails closed");
    assert(normalizeAgreement({ rawStatus: "UNOBSERVED", pending: false }).normalized === "none", "unobserved agreement is not unknown");
  });

  harness.check("capability receipt: 4.9 probes fail closed when validate is missing", () => {
    const base = loadPack();
    const pack = withPack(base, {
      helpByCommand: { ...base.capabilities.helpByCommand, metadata: "pull plan apply push" },
    });
    const provider = createFixtureProvider(pack);
    const receipt = provider.probeCapabilities(now);
    assert(receipt.observedCliVersion === "4.9.0", "records observed CLI version");
    const validate = receipt.capabilities.find((probe) => probe.id === "asc.metadata.validate");
    assert(validate?.available === true, "metadata command is listed");
    assert(validate?.shapeOk === false, "missing validate token is a shape change");
    assert(receipt.failClosed === true, "missing 4.9 shape fails closed");
    const dryRunOk = createFixtureProvider(loadPack()).probeCapabilities(now);
    const dryRun = dryRunOk.capabilities.find((probe) => probe.id === "asc.metadata.push.dry_run");
    assert(dryRun?.shapeOk === true, "--dry-run in help satisfies the 4.9 dry-run probe");
  });

  harness.check("poll fixture: one snapshot records one observation; restart is stable", () => {
    const pack = loadPack();
    const provider = createFixtureProvider(pack);
    const first = startObserveMandate(mandateInput(), provider, now);
    assert(first.events.filter((event) => event.kind === "observation").length === 1, "one observation");
    assert(first.currentCase.blocker === "none", "known waiting state is not a blocker");
    assert(first.currentCase.appVersion.rawValue === "WAITING_FOR_REVIEW", "raw value persists");
    assert(first.currentCase.appVersion.normalized === "waiting_for_review", "normalized separately");
    const second = pollAppReview(first, provider, later);
    assert(second.events.length === first.events.length, "duplicate snapshot is a no-op");
    assert(second.currentCase.lastEventId === first.currentCase.lastEventId, "case stays stable");

    const dir = mkdtempSync(path.join(tmpdir(), "app-review-persist-"));
    const filePath = path.join(dir, "app-review.json");
    try {
      writeAppReviewState(filePath, second);
      const loaded = loadAppReviewState(filePath);
      assert(loaded !== undefined, "reload succeeds");
      assert(loaded!.events.length === second.events.length, "restart keeps the same events");
      assert(loaded!.currentCase.caseId === second.currentCase.caseId, "restart keeps the same case");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("out-of-order snapshot cannot roll truth backward", () => {
    const pack = loadPack();
    const provider = createFixtureProvider(pack);
    const watching = startObserveMandate(mandateInput(), provider, now);
    const older = withPack(pack, {
      snapshot: {
        ...pack.snapshot,
        providerTimestamp: earlier,
        layers: pack.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "REJECTED" } : layer)),
      },
    });
    const result = applyAppReviewObservation(watching, older.snapshot, later);
    assert(result.reason === "out_of_order_ignored", "older snapshot is ignored");
    assert(result.state.currentCase.appVersion.rawValue === "WAITING_FOR_REVIEW", "case does not roll back");
    assert(
      result.state.events.some((event) => event.kind === "out_of_order_ignored"),
      "ignored event stays in the audit",
    );
  });

  harness.check("unknown Apple state and pending agreement classify as fail-closed blockers", () => {
    const pack = loadPack();
    const unknownPack = withPack(pack, {
      snapshot: {
        ...pack.snapshot,
        layers: pack.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "FUTURE_APPLE_STATE" } : layer)),
      },
    });
    const unknownState = startObserveMandate(mandateInput(), createFixtureProvider(unknownPack), now);
    assert(unknownState.currentCase.appVersion.normalized === "unknown_provider_state", "raw unknown persists as unknown");
    assert(unknownState.currentCase.blocker === "unknown_provider_state", "unknown fails closed");
    assert(unknownState.currentCase.status === "blocked", "case is blocked");

    const pendingPack = withPack(pack, {
      snapshot: {
        ...pack.snapshot,
        agreement: { rawStatus: "PENDING", pending: true },
      },
    });
    const pendingState = startObserveMandate(mandateInput(), createFixtureProvider(pendingPack), now);
    assert(pendingState.currentCase.blocker === "founder_action_required", "pending agreement is founder action");
    assert(commandIsForbiddenForAppReview("asc web agreements accept --id 1") === true, "accept is forbidden");
  });

  harness.check("local App Review projection and digest stay vocabulary-free", () => {
    const state = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
    const founder = projectAppReviewForFounder(state);
    assert(founder.summary.includes("Apple review"), "founder summary names Apple review");
    assert(!founder.summary.includes("WAITING_FOR_REVIEW"), "founder summary has no Apple enum");
    assert(!founder.summary.includes("unknown_provider_state"), "founder summary has no engine token");
    assert(founder.blockerKind === "none", "local blocker kind is founder-safe");
    const digest = renderDigest({
      sessionId: "s1",
      businessSlug: "ocho",
      startedAt: now,
      endedAt: later,
      outcome: "completed",
      advanced: [],
      parked: [],
      spend: [],
      anomalies: [],
      appReview: { summary: founder.summary },
    });
    assert(digest.markdown.includes("## Apple review"), "digest always has the Apple review section");
    assert(digest.markdown.includes(founder.summary), "digest carries the founder summary");
    assert(!digest.markdown.includes("AppReviewMandate"), "digest has no mandate type name");
  });

  harness.check("deriveBlocker: missing 4.9 capability outranks review state", () => {
    const pack = withPack(loadPack(), { capabilitiesText: "version capabilities review" });
    const state = startObserveMandate(mandateInput(), createFixtureProvider(pack), now);
    assert(state.capabilityReceipt.failClosed === true, "receipt fails closed");
    assert(state.currentCase.blocker === "capability_missing", "capability missing wins");
    assert(deriveBlocker(state.capabilityReceipt, [state.currentCase.appVersion], state.events.at(-1)!.agreement) === "capability_missing", "helper agrees");
  });

  harness.check("capability receipt: schemas come from observed evidence, not required constants", () => {
    const versionOnly = "version capabilities review metadata web";
    const observed = collectObservedSchemaIds(versionOnly, { metadata: "pull plan apply validate push --dry-run" });
    assert(observed.length === 0, "version and help text without schema names yields no schema evidence");
    const pack = withPack(loadPack(), { schemaIds: observed });
    const receipt = createFixtureProvider(pack).probeCapabilities(now);
    assert(
      receipt.schemas.every((probe) => probe.available === false),
      "missing schema evidence marks each schema unavailable",
    );
    assert(receipt.failClosed === true, "missing schema evidence fails closed");
    assert(receipt.schemas.map((probe) => probe.id).join(",") === APP_REVIEW_SCHEMA_IDS.join(","), "receipt still names every required schema");

    const fromCapabilities = collectObservedSchemaIds("AppStoreVersion ReviewSubmission ReviewSubmissionItem APP_STORE_VERSION_APP_VERSION_STATE_UPDATED");
    assert(fromCapabilities.length === APP_REVIEW_SCHEMA_IDS.length, "schema names in capabilities text count as evidence");
  });

  harness.check("invalid existing App Review state fails closed instead of looking absent", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-invalid-"));
    const missingPath = path.join(dir, "missing.json");
    const invalidPath = path.join(dir, "invalid.json");
    try {
      assert(loadAppReviewState(missingPath) === undefined, "absent file stays undefined");
      assert(readAppReviewState(missingPath).status === "missing", "absent file is missing");
      writeFileSync(invalidPath, "{not-json\n", "utf8");
      const loaded = readAppReviewState(invalidPath);
      assert(loaded.status === "invalid", "invalid JSON is invalid, not missing");
      let threw = false;
      try {
        loadAppReviewState(invalidPath);
      } catch {
        threw = true;
      }
      assert(threw, "loadAppReviewState throws on an existing invalid file");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("pending developer release is founder action; dead mandates do not poll", () => {
    const pack = loadPack();
    const pendingPack = withPack(pack, {
      snapshot: {
        ...pack.snapshot,
        layers: pack.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "PENDING_DEVELOPER_RELEASE" } : layer)),
      },
    });
    const pendingState = startObserveMandate(mandateInput(), createFixtureProvider(pendingPack), now);
    const pendingFounder = projectAppReviewForFounder(pendingState);
    assert(pendingState.currentCase.blocker === "pending_developer_release", "pending developer release is the case blocker");
    assert(pendingFounder.needsFounderAction === true, "release still needs the founder");
    assert(pendingFounder.blockerKind === "review", "the blocker kind stays review");

    const counted = countingProvider(pack);
    const watching = startObserveMandate(mandateInput(), counted.provider, now);
    const afterStartReads = counted.snapshotReads();
    const expiredNow = "2026-09-25T12:00:00.000Z";
    const expired = pollAppReview(watching, counted.provider, expiredNow);
    assert(expired.mandate.status === "expired", "an active mandate past expiresAt becomes expired");
    assert(expired.events.length === watching.events.length, "expiry does not record a new observation");
    assert(counted.snapshotReads() === afterStartReads, "expiry does not read a snapshot");

    const revoked: AppReviewState = {
      ...watching,
      mandate: { ...watching.mandate, status: "revoked" },
    };
    const afterRevoke = pollAppReview(revoked, counted.provider, later);
    assert(afterRevoke.events.length === revoked.events.length, "a revoked mandate does not record a new observation");
    assert(counted.snapshotReads() === afterStartReads, "a revoked mandate does not read a snapshot");
  });

  harness.check("synthetic UNRESOLVED_ISSUES packet correlates, classifies, and resumes", () => {
    const pack = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const provider = createFixtureProvider(pack);
    const first = startObserveMandate(mandateInput(), provider, "2026-08-24T13:00:00.000Z");
    assert(first.currentCase.reviewSubmission?.normalized === "unresolved_issues", "submission is unresolved");
    assert(first.currentCase.rejectionPacket?.submissionId === "rs-synthetic-001", "packet cites exact submission");
    assert(first.currentCase.rejectionPacket?.selection === "explicit", "synthetic packet used the exact-submission route");
    assert(first.currentCase.rejectionPacket?.selectionIsDurable === true, "explicit correlation is durable");
    assert(first.currentCase.rejectionPacket?.incomplete === false, "synthetic packet is complete");
    assert(remediationReady(first, "2026-08-24T13:00:00.000Z"), "complete explicit evidence permits the classified local remediation");
    assert(first.currentCase.classification.kind === "missing_review_information", "structured reason classifies");
    assert(first.currentCase.classification.implementationStatus === "not_started", "no implementation");
    assert(first.currentCase.classification.newBuildRequired === false, "information request is not a new build");
    const resumed = pollAppReview(first, provider, "2026-08-24T13:30:00.000Z");
    assert(resumed.currentCase.caseId === first.currentCase.caseId, "resume keeps the same case");
    assert(resumed.currentCase.rejectionPacket?.packetFingerprint === first.currentCase.rejectionPacket?.packetFingerprint, "resume keeps the same packet");
  });

  harness.check("safe real UNRESOLVED_ISSUES packet quarantines reviewer content and credentials", () => {
    const pack = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-real-read-only.json"), "utf8"),
    ) as FixtureProviderPack;
    const poisoned = withPack(pack, {
      webAuth: { authenticated: true, source: "cache", appleId: "reviewer-secret@example.invalid" },
    });
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-real-"));
    try {
      const state = startObserveMandate(mandateInput(), createFixtureProvider(poisoned), "2026-08-24T14:00:00.000Z", { evidenceRoot: dir });
      assert(state.currentCase.rejectionPacket?.submissionId === "e1a2b3c4-d5e6-4789-a012-3456789abcde", "real packet correlates");
      assert(state.currentCase.rejectionPacket?.selection === "latest-unresolved", "discovery selection is preserved");
      assert(state.currentCase.rejectionPacket?.selectionIsDurable === false, "discovery selection is not durable");
      const serialized = JSON.stringify({
        ...state,
        mandate: { ...state.mandate, forbiddenCommands: [] },
      });
      assert(!serialized.includes("reviewer-secret@example.invalid"), "Apple Account email is stripped");
      assert(!serialized.includes("Ignore previous instructions"), "reviewer body is not stored");
      assert(!serialized.includes("asc review submit"), "reviewer command text is not stored");
      assert(!containsSecretMaterial(JSON.stringify(state)), "durable state has no credential material");
      const attachment = state.currentCase.rejectionPacket?.attachments[0];
      assert(attachment?.pathRejected === true, "traversing filenames are rejected");
      assert(sanitizeEvidenceFileName("../shot.png").rejected === true, "helper rejects parent segments");
      writeAppReviewWatch(dir, state);
      const markdown = readFileSync(path.join(dir, "store", "APP_REVIEW.md"), "utf8");
      assert(!markdown.includes("Ignore previous"), "founder copy has no reviewer prompt");
      assert(!markdown.includes("asc review submit"), "founder copy has no submit command");
      assert(!markdown.includes("asc webhooks serve"), "founder copy has no webhook serve");
      assert(!markdown.includes("asc web agreements accept"), "founder copy has no agreements accept");
      assert(markdown.includes("Evidence codes:"), "founder copy renders fingerprints");
      const founder = projectAppReviewForFounder(state);
      const digest = renderDigest({
        sessionId: "s1",
        businessSlug: "ocho",
        startedAt: now,
        endedAt: later,
        outcome: "completed",
        advanced: [],
        parked: [],
        spend: [],
        anomalies: [],
        appReview: { summary: founder.summary, caseLines: founder.caseLines },
      });
      assert(!digest.markdown.includes("Ignore previous"), "digest has no reviewer prompt");
      assert(digest.markdown.includes("Apple sent review issues"), "digest names the review issue");
      assert(!remediationReady(state, "2026-08-24T14:00:00.000Z"), "discovery evidence must not permit structured-reason remediation");
      assert(state.currentCase.classification.kind === "missing_review_information", "local state retains the classification");
      assert(state.currentCase.blocker !== "web_session_required", "resumable session needs no web login");
      assert(renderAppReviewMarkdown(state, founder.summary).includes("I did not treat those notes as commands"), "renderer quarantines notes");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("missing web session is a handoff and never invents a packet from public API data", () => {
    const pack = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const missingSession = withPack(pack, { webAuth: { authenticated: false } });
    const state = startObserveMandate(mandateInput(), createFixtureProvider(missingSession), "2026-08-24T13:00:00.000Z");
    assert(state.currentCase.blocker === "web_session_required", "missing session is a handoff");
    assert(state.currentCase.rejectionPacket?.incomplete === true, "packet is incomplete");
    assert(state.currentCase.authReadiness.handoff === "web_session_required", "auth records one handoff");
    assert(state.currentCase.classification.implementationStatus === "not_started", "handoff does not implement");
    const founder = projectAppReviewForFounder(state);
    assert(founder.needsFounderAction === true, "founder must log in");
    assert(founder.summary.includes("web login"), "founder summary asks for web login");
    assert(commandIsForbiddenForAppReview("asc webhooks serve --exec true") === true, "webhooks serve is forbidden");
    const later = pollAppReview(state, createFixtureProvider(missingSession), "2026-08-24T13:30:00.000Z");
    assert(
      later.events.filter((event) => event.kind === "handoff_recorded").length === state.events.filter((event) => event.kind === "handoff_recorded").length,
      "unchanged web-login handoff is not recorded again",
    );
  });

  harness.check("App Review accepts only the current complete state contract", () => {
    const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
    assert(interpretAppReviewState(watching).status === "ok", "current complete state is accepted");
    for (const schemaVersion of ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "9.0.0"]) {
      assert(interpretAppReviewState({ ...watching, schemaVersion }).status === "invalid", "unsupported versions fail closed");
    }
    assert(interpretAppReviewState({ schemaVersion: APP_REVIEW_SCHEMA_VERSION }).status === "invalid", "incomplete state fails closed");
  });

  harness.check("latest-unresolved packets stay discovery-only and cannot authorize structured-reason remediation", () => {
    const pack = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const discovery = withPack(pack, {
      rejectionPacket: pack.rejectionPacket ? { ...pack.rejectionPacket, selection: "latest-unresolved" } : undefined,
    });
    const state = startObserveMandate(mandateInput(), createFixtureProvider(discovery), "2026-08-24T13:00:00.000Z");
    assert(state.currentCase.rejectionPacket?.selection === "latest-unresolved", "reported selection is preserved");
    assert(state.currentCase.rejectionPacket?.selectionIsDurable === false, "discovery selection is not durable");
    assert(!remediationReady(state, "2026-08-24T13:00:00.000Z"), "discovery packets cannot authorize structured-reason remediation");
    const founder = projectAppReviewForFounder(state);
    assert(!founder.caseLines.some((line) => line.includes("exact Apple submission")), "founder copy does not treat discovery as exact");
  });

  harness.check("every structured rejection reason is persisted and conflicting codes stay unclear", () => {
    const pack = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const conflicting = withPack(pack, {
      rejectionPacket: pack.rejectionPacket
        ? {
            ...pack.rejectionPacket,
            threads: [
              {
                thread: { id: "thread-conflict", reviewSubmissionId: "rs-synthetic-001" },
                messages: [],
                rejections: [
                  {
                    id: "rej-conflict",
                    reasons: [
                      { reasonSection: "Guideline 3.1 - Payments", reasonCode: "3.1.1" },
                      { reasonSection: "Guideline 5.1 - Privacy", reasonCode: "5.1.1" },
                    ],
                  },
                ],
              },
            ],
          }
        : undefined,
    });
    const state = startObserveMandate(mandateInput(), createFixtureProvider(conflicting), "2026-08-24T13:00:00.000Z");
    assert((state.currentCase.rejectionPacket?.reasons.length ?? 0) === 2, "both structured reasons persist");
    assert(state.currentCase.classification.kind === "unclear_conflicting", "payment plus privacy is conflicting");
    const intake = intakeRejectionPacket(conflicting.rejectionPacket!, {
      appId: "123456789",
      submissionId: "rs-synthetic-001",
      cliVersion: "4.9.0",
      retrievedAt: "2026-08-24T13:00:00.000Z",
    });
    const classified = classifyAppReviewCase({
      appVersion: state.currentCase.appVersion,
      packet: intake.packet,
    });
    assert(classified.kind === "unclear_conflicting", "classifier sees both codes");
  });

  harness.check("attachment evidence paths include the attachment id and reject duplicates", () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const pack = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const duplicated = withPack(pack, {
      rejectionPacket: pack.rejectionPacket
        ? {
            ...pack.rejectionPacket,
            attachments: [
              { attachmentId: "att-a", fileName: "shot.png", sourceType: "reviewRejection" },
              { attachmentId: "att-b", fileName: "shot.png", sourceType: "reviewRejection" },
              { attachmentId: "att-a", fileName: "shot.png", sourceType: "reviewRejection" },
              { attachmentId: "att-c", fileName: "../shot.png", sourceType: "reviewRejection" },
              { attachmentId: "att-d", fileName: "../other.png", sourceType: "reviewRejection" },
            ],
            fixtureAttachmentBodies: {
              "att-a": png,
              "att-b": png,
              "att-c": png,
              "att-d": png,
            },
          }
        : undefined,
    });
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-paths-"));
    try {
      const state = startObserveMandate(mandateInput(), createFixtureProvider(duplicated), "2026-08-24T13:00:00.000Z", {
        evidenceRoot: dir,
      });
      const stored = state.currentCase.rejectionPacket?.attachments.map((item) => item.storedRelativePath) ?? [];
      assert(new Set(stored).size === stored.length, "stored paths are unique");
      assert(
        stored.some((item) => item.startsWith("att-a-")),
        "attachment id is in the stored name",
      );
      assert(stored.filter((item) => item.includes("rejected-name.bin")).length === 2, "traversal names stay unique per id");
      const duplicate = state.currentCase.rejectionPacket?.attachments[2];
      assert(duplicate?.pathRejected === true, "a colliding path is rejected");
      const evidenceDir = path.join(dir, "run", "app-review-evidence", "rs-synthetic-001");
      const files = readdirSync(evidenceDir);
      assert(files.includes("att-a-shot.png"), "first attachment is written");
      assert(files.includes("att-b-shot.png"), "second same-name attachment is written under its id");
      assert(!files.includes("shot.png"), "bare original names are not used as evidence paths");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("discovery selection is not promoted to durable even when app and submission IDs match", () => {
    const pack = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    for (const selection of ["latest-unresolved", "latest"] as const) {
      const discovery = withPack(pack, {
        rejectionPacket: pack.rejectionPacket ? { ...pack.rejectionPacket, selection } : undefined,
      });
      const state = startObserveMandate(mandateInput(), createFixtureProvider(discovery), "2026-08-24T13:00:00.000Z");
      const packet = state.currentCase.rejectionPacket;
      assert(packet?.appId === "123456789", `${selection}: app id matches`);
      assert(packet?.submissionId === "rs-synthetic-001", `${selection}: submission id matches`);
      assert(packet?.selection === selection, `${selection}: reported selection is preserved`);
      assert(packet?.selectionIsDurable === false, `${selection}: discovery selection is not durable`);
      assert(packet?.incomplete === false, `${selection}: matching ids still correlate`);
      assert(!remediationReady(state, "2026-08-24T13:00:00.000Z"), `${selection}: discovery evidence cannot authorize structured-reason remediation`);
    }

    const omitted = startObserveMandate(
      mandateInput(),
      createFixtureProvider(withPack(pack, { rejectionPacket: { ...pack.rejectionPacket!, selection: undefined } })),
      "2026-08-24T13:00:00.000Z",
    );
    assert(omitted.currentCase.rejectionPacket?.selection === "unknown", "omitted selection is not invented as explicit");
    assert(omitted.currentCase.rejectionPacket?.selectionIsDurable === false, "omitted selection is not durable");
    assert(!remediationReady(omitted, "2026-08-24T13:00:00.000Z"), "omitted selection cannot authorize structured-reason remediation");

    const explicit = startObserveMandate(mandateInput(), createFixtureProvider(pack), "2026-08-24T13:00:00.000Z");
    assert(explicit.currentCase.rejectionPacket?.selection === "explicit", "explicit selection is preserved");
    assert(explicit.currentCase.rejectionPacket?.selectionIsDurable === true, "only explicit selection is durable");
    assert(remediationReady(explicit, "2026-08-24T13:00:00.000Z"), "explicit complete packet permits the classified local remediation");
  });

  harness.check("local remediation readiness preserves mandate, capability, classification, and evidence checks", () => {
    const pack = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const at = "2026-08-24T13:00:00.000Z";
    const state = startObserveMandate(mandateInput(), createFixtureProvider(pack), at);
    assert(remediationReady(state, at), "a live, capable watch with a complete explicit packet must be ready");
    assert(!remediationReady(state, "2026-09-25T12:00:00.000Z"), "expired mandates must refuse remediation");
    assert(!remediationReady({ ...state, mandate: { ...state.mandate, status: "revoked" } }, at), "revoked mandates must refuse remediation");
    assert(
      !remediationReady({ ...state, capabilityReceipt: { ...state.capabilityReceipt, failClosed: true } }, at),
      "failed capabilities must refuse remediation",
    );
    const withoutPacket = { ...state, currentCase: { ...state.currentCase, rejectionPacket: undefined } };
    assert(!remediationReady(withoutPacket, at), "structured reasons need a correlated packet");
    const incomplete = {
      ...state,
      currentCase: { ...state.currentCase, rejectionPacket: { ...state.currentCase.rejectionPacket!, incomplete: true } },
    };
    assert(!remediationReady(incomplete, at), "incomplete structured evidence must remain blocked");
    const unclassified: AppReviewState = {
      ...withoutPacket,
      currentCase: { ...withoutPacket.currentCase, classification: { ...state.currentCase.classification, kind: "none" } },
    };
    assert(!remediationReady(unclassified, at), "no classification must never authorize remediation");
    const layerClassified: AppReviewState = {
      ...withoutPacket,
      currentCase: {
        ...withoutPacket.currentCase,
        classification: { ...state.currentCase.classification, kind: "metadata_rejected", rationaleKind: "layer_state" },
      },
    };
    assert(remediationReady(layerClassified, at), "a provider layer-state classification must not require an unrelated rejection packet");
    const protectedCase: AppReviewState = {
      ...withoutPacket,
      currentCase: { ...withoutPacket.currentCase, classification: { ...state.currentCase.classification, kind: "legal_policy" } },
    };
    assert(remediationReady(protectedCase, at), "protected classifications must remain eligible to park for the founder");
    assert(planAppReviewRemediation(protectedCase, at).reason === "parked", "readiness for a protected classification must park, never implement");
  });

  harness.check("intakeRejectionPacket: missing or discovery selection is never rewritten to explicit", () => {
    const rawBase = { appId: "123456789", submission: { id: "rs-synthetic-001" }, threads: [] };
    const options = {
      appId: "123456789",
      submissionId: "rs-synthetic-001",
      cliVersion: "4.9.0",
      retrievedAt: now,
    };
    for (const selection of ["latest-unresolved", "latest"] as const) {
      const result = intakeRejectionPacket({ ...rawBase, selection }, options);
      assert(result.packet.selection === selection, `${selection}: intake preserves discovery selection`);
      assert(result.packet.selectionIsDurable === false, `${selection}: intake does not mark discovery durable`);
    }
    const missing = intakeRejectionPacket(rawBase, options);
    assert(missing.packet.selection === "unknown", "omitted selection stays unknown");
    assert(missing.packet.selectionIsDurable === false, "omitted selection is not durable");
    const explicit = intakeRejectionPacket({ ...rawBase, selection: "explicit" }, options);
    assert(explicit.packet.selection === "explicit", "explicit stays explicit");
    assert(explicit.packet.selectionIsDurable === true, "explicit matching ids are durable");
  });

  const appleHmacSecret = "This is my secret";
  const appleHmacBody = "Hello, World!";
  const appleHmacHex = "7f062172b01cb00b53ca068614674a3d982a34062a0f5d37687d5e3377e54657";
  const webhookFixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "webhook-state-updated.json");
  const webhookFixtureBody = readFileSync(webhookFixturePath);

  function signedRequest(
    rawBody: Uint8Array | string,
    options?: {
      secret?: string;
      previousSecret?: string;
      signature?: string;
      method?: string;
      route?: string;
      receivedAt?: string;
      queue?: ReturnType<typeof createMemoryWebhookQueue>;
    },
  ) {
    const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
    const secrets = [{ id: "current", secret: appleHmacSecret }];
    if (options?.previousSecret) secrets.push({ id: "previous", secret: options.previousSecret });
    const queue = options?.queue ?? createMemoryWebhookQueue();
    const signature = options?.signature ?? `hmacsha256=${signAppleWebhookBody(options?.secret ?? appleHmacSecret, body)}`;
    const result = handleSignedWebhookRequest({
      request: {
        method: options?.method ?? "POST",
        route: options?.route ?? APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
        headers: { "x-apple-signature": signature, "content-type": "application/json" },
        rawBody: body,
      },
      configuredRoute: APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
      secrets,
      queue,
      receivedAt: options?.receivedAt ?? "2026-08-25T12:00:01.000Z",
    });
    return { result, queue };
  }

  harness.check("signed webhook: Apple HMAC-SHA256 vector matches Node crypto", () => {
    assert(signAppleWebhookBody(appleHmacSecret, appleHmacBody) === appleHmacHex, "matches Apple configuring-webhook-notifications vector");
  });

  harness.check("signed webhook: missing, malformed, and invalid HMAC do not persist an envelope", () => {
    const malformed = signedRequest(webhookFixtureBody, { signature: "not-hmac" });
    const invalid = signedRequest(webhookFixtureBody, { secret: "wrong-secret" });
    const missingAgainstSecret = handleSignedWebhookRequest({
      request: {
        method: "POST",
        route: APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
        headers: { "content-type": "application/json" },
        rawBody: webhookFixtureBody,
      },
      configuredRoute: APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
      secrets: [{ id: "current", secret: appleHmacSecret }],
      queue: createMemoryWebhookQueue(),
      receivedAt: later,
    });
    assert(missingAgainstSecret.status === 401, "missing signature is 401");
    assert(missingAgainstSecret.stored === false, "missing signature is not stored");
    assert(malformed.result.status === 400, "malformed signature is 400");
    assert(malformed.result.stored === false, "malformed signature is not stored");
    assert(malformed.queue.list().length === 0, "malformed signature leaves the queue empty");
    assert(invalid.result.status === 401, "wrong secret is 401");
    assert(invalid.result.stored === false, "wrong secret is not stored");
    assert(invalid.queue.list().length === 0, "wrong secret leaves the queue empty");
  });

  harness.check("signed webhook: valid event is accepted once; Apple redelivery does not poll again", () => {
    const pack = loadPack();
    const counted = countingProvider(pack);
    const watching = startObserveMandate(mandateInput(), counted.provider, now);
    const afterStartReads = counted.snapshotReads();
    const first = signedRequest(webhookFixtureBody);
    assert(first.result.status === 204, "valid HMAC returns 204");
    assert(first.result.stored === true, "valid HMAC persists once");
    assert(first.result.envelope?.unknownPayload === false, "known wake event is not unknown");
    const accepted = ingestSignedWebhookEnvelope(watching, first.result.envelope!, counted.provider, later);
    assert(accepted.webhookIngress.acceptedEventIds.length === 1, "one Apple event id is remembered");
    assert(accepted.webhookIngress.lastEnvelope?.providerEventId === "evt-signed-1", "last envelope cites Apple id");
    assert(
      accepted.events.some((event) => event.kind === "webhook_accepted"),
      "accepted event is audited",
    );
    assert(counted.snapshotReads() === afterStartReads + 1, "first accepted event polls once");

    const second = signedRequest(webhookFixtureBody, { queue: first.queue });
    assert(second.result.duplicate === true, "queue deduplicates the same Apple event id");
    const duplicate = ingestSignedWebhookEnvelope(accepted, second.result.envelope!, counted.provider, "2026-08-24T13:00:00.000Z");
    assert(duplicate.webhookIngress.acceptedEventIds.length === 1, "redelivery does not add a second id");
    assert(duplicate.currentCase.caseId === accepted.currentCase.caseId, "redelivery does not open a second case");
    assert(duplicate.events.filter((event) => event.kind === "webhook_duplicate_ignored").length === 1, "redelivery is audited once");
    assert(counted.snapshotReads() === afterStartReads + 1, "redelivery does not poll again");
  });

  harness.check("signed webhook: payload newValue is not layer truth; poll snapshot stays truth", () => {
    const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
    const first = signedRequest(webhookFixtureBody);
    const state = ingestSignedWebhookEnvelope(watching, first.result.envelope!, createFixtureProvider(loadPack()), later);
    assert(state.currentCase.appVersion.rawValue === "WAITING_FOR_REVIEW", "poll snapshot stays waiting");
    assert(state.webhookIngress.lastEnvelope?.eventType === "APP_STORE_VERSION_APP_VERSION_STATE_UPDATED", "envelope records the wake type");
    assert(first.result.envelope?.reportedNewValue === "REJECTED", "reported newValue stays on the envelope only");
  });

  harness.check("signed webhook: out-of-order envelope cannot roll a newer provider snapshot backward", () => {
    const pack = loadPack();
    const readyPack = withPack(pack, {
      snapshot: {
        ...pack.snapshot,
        providerTimestamp: "2026-08-24T14:00:01.000Z",
        layers: pack.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "READY_FOR_SALE" } : layer)),
      },
    });
    const watching = startObserveMandate(mandateInput(), createFixtureProvider(readyPack), "2026-08-24T14:00:01.000Z");
    assert(watching.currentCase.appVersion.rawValue === "READY_FOR_SALE", "later poll is ready for sale");
    const earlierBody = JSON.stringify({
      data: {
        type: "webhookEvents",
        id: "evt-earlier",
        attributes: {
          timestamp: "2026-08-24T10:00:00.000Z",
          eventType: "APP_STORE_VERSION_APP_VERSION_STATE_UPDATED",
          payload: { oldValue: "WAITING_FOR_REVIEW", newValue: "PREPARE_FOR_SUBMISSION" },
        },
      },
    });
    const earlier = signedRequest(earlierBody, { receivedAt: "2026-08-24T14:00:02.000Z" });
    const afterEarlier = ingestSignedWebhookEnvelope(watching, earlier.result.envelope!, createFixtureProvider(readyPack), "2026-08-24T14:00:02.000Z");
    assert(afterEarlier.currentCase.appVersion.rawValue === "READY_FOR_SALE", "older webhook cannot roll provider truth backward");
    assert(afterEarlier.webhookIngress.acceptedEventIds.includes("evt-earlier"), "older event id is still recorded");
  });

  harness.check("signed webhook: missed wake-up still converges on poll snapshot without a second case", () => {
    const pack = loadPack();
    const laterPack = withPack(pack, {
      snapshot: {
        ...pack.snapshot,
        providerTimestamp: later,
        providerEventId: "apple-event-2",
        layers: pack.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "IN_REVIEW" } : layer)),
      },
    });
    const watching = startObserveMandate(mandateInput(), createFixtureProvider(pack), now);
    const missed = pollAppReview(watching, createFixtureProvider(laterPack), later);
    const wake = signedRequest(webhookFixtureBody);
    const ingested = ingestSignedWebhookEnvelope(watching, wake.result.envelope!, createFixtureProvider(laterPack), later);
    assert(missed.currentCase.caseId === watching.currentCase.caseId, "missed path keeps the same case");
    assert(ingested.currentCase.caseId === watching.currentCase.caseId, "wake path keeps the same case");
    assert(missed.currentCase.appVersion.rawValue === "IN_REVIEW", "missed path reads IN_REVIEW from poll");
    assert(ingested.currentCase.appVersion.rawValue === "IN_REVIEW", "wake path reads IN_REVIEW from poll");
    assert(missed.currentCase.appVersion.rawValue === ingested.currentCase.appVersion.rawValue, "both paths share provider truth");
    assert(ingested.webhookIngress.acceptedEventIds.includes("evt-signed-1"), "wake path records the Apple event id");
    assert(missed.webhookIngress.acceptedEventIds.length === 0, "missed path has no ingested event id");
  });

  harness.check("signed webhook: previous secret rotates in; unknown secret stays closed", () => {
    const currentAndPrevious = handleSignedWebhookRequest({
      request: {
        method: "POST",
        route: APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
        headers: {
          "x-apple-signature": `hmacsha256=${signAppleWebhookBody("previous-secret", webhookFixtureBody)}`,
        },
        rawBody: webhookFixtureBody,
      },
      configuredRoute: APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
      secrets: [
        { id: "current", secret: "current-secret" },
        { id: "previous", secret: "previous-secret" },
      ],
      queue: createMemoryWebhookQueue(),
      receivedAt: later,
    });
    const unknown = handleSignedWebhookRequest({
      request: {
        method: "POST",
        route: APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
        headers: {
          "x-apple-signature": `hmacsha256=${signAppleWebhookBody("other-secret", webhookFixtureBody)}`,
        },
        rawBody: webhookFixtureBody,
      },
      configuredRoute: APP_REVIEW_WEBHOOK_DEFAULT_ROUTE,
      secrets: [
        { id: "current", secret: "current-secret" },
        { id: "previous", secret: "previous-secret" },
      ],
      queue: createMemoryWebhookQueue(),
      receivedAt: later,
    });
    assert(currentAndPrevious.status === 204, "previous secret verifies during rotation");
    assert(currentAndPrevious.envelope?.secretId === "previous", "matched secret id is previous");
    assert(unknown.status === 401, "unknown secret is rejected");
    assert(unknown.stored === false, "unknown secret is not stored");
  });

  harness.check("signed webhook: oversized body is 413 before HMAC; ping does not poll; serve stays fixture-only", () => {
    const huge = Buffer.alloc(65_537, 0x78);
    const oversized = signedRequest(huge);
    assert(oversized.result.status === 413, "oversize is 413");
    assert(oversized.result.stored === false, "oversize is not stored");
    assert(webhookServeIsFixtureOnly("asc webhooks serve --allow-remote") === true, "serve is fixture-only");
    assert(commandIsForbiddenForAppReview("asc webhooks serve --exec true") === true, "serve stays forbidden");

    const pack = loadPack();
    const counted = countingProvider(pack);
    const watching = startObserveMandate(mandateInput(), counted.provider, now);
    const afterStartReads = counted.snapshotReads();
    const pingBody = JSON.stringify({
      data: {
        type: "webhookPingCreated",
        id: "ping-1",
        attributes: { eventType: "WEBHOOK_PING", createdDate: "2026-08-25T12:00:00.000Z" },
      },
    });
    const ping = signedRequest(pingBody);
    const afterPing = ingestSignedWebhookEnvelope(watching, ping.result.envelope!, counted.provider, later);
    assert(afterPing.webhookIngress.acceptedEventIds.includes("ping-1"), "ping event id is recorded");
    assert(counted.snapshotReads() === afterStartReads, "ping does not poll Apple");
  });

  harness.check("signed webhook: registration health and silent deliveries remain in local watch state", () => {
    const url = "https://example.com/app-store-connect/webhooks";
    const eventTypes = ["APP_STORE_VERSION_APP_VERSION_STATE_UPDATED", "WEBHOOK_PING"];
    const pack = withPack(loadPack(), {
      webhookListings: [{ resourceId: "wh-1", eventTypes, enabled: true, url }],
      desiredWebhook: { eventTypes, urlDigest: digestWebhookUrl(url) },
    });
    const registered = startObserveMandate(mandateInput(), createFixtureProvider(pack), now);
    assert(registered.webhookIngress.health === "healthy", "matching listing is healthy");

    const silentPack = withPack(pack, {
      webhookDeliveries: [{ providerEventId: "evt-missed", deliveredAt: now, success: true }],
    });
    const silent = startObserveMandate(mandateInput(), createFixtureProvider(silentPack), now);
    assert(silent.webhookIngress.health === "silent", "undelivered-to-us success is silent");
    const founderMarkdown = renderAppReviewMarkdown(silent, projectAppReviewForFounder(silent).summary);
    assert(founderMarkdown.includes("Apple sent notices I did not receive"), "silent health has founder copy");

    const historicalPack = withPack(pack, {
      webhookDeliveries: [{ providerEventId: "evt-before-watch", deliveredAt: "2026-01-01T00:00:00.000Z", success: true }],
    });
    const historical = startObserveMandate(mandateInput(), createFixtureProvider(historicalPack), now);
    assert(historical.webhookIngress.health === "healthy", "deliveries before the watch start are not silent");
    assert(historical.webhookIngress.acceptedEventIds.length === 0, "historical Apple ids are not recorded as accepted");

    const duplicatePack = withPack(pack, {
      webhookListings: [
        { resourceId: "wh-1", eventTypes, enabled: true, url },
        { resourceId: "wh-2", eventTypes, enabled: true, url },
      ],
    });
    const duplicated = startObserveMandate(mandateInput(), createFixtureProvider(duplicatePack), now);
    assert(duplicated.webhookIngress.registration?.resourceId === "wh-1", "duplicate config still records the first match");
    assert(duplicated.webhookIngress.health === "healthy", "duplicate config stays observe-only healthy");
  });

  harness.check("signed webhook: unmatched reconciliation clears stale registration", () => {
    const url = "https://example.com/app-store-connect/webhooks";
    const eventTypes = ["APP_STORE_VERSION_APP_VERSION_STATE_UPDATED", "WEBHOOK_PING"];
    const pack = withPack(loadPack(), {
      webhookListings: [{ resourceId: "wh-1", eventTypes, enabled: true, url }],
      desiredWebhook: { eventTypes, urlDigest: digestWebhookUrl(url) },
    });
    const registered = startObserveMandate(mandateInput(), createFixtureProvider(pack), now);
    assert(registered.webhookIngress.registration?.resourceId === "wh-1", "matching listing stores registration");
    const cleared = observeWebhookRegistration(registered, [], later, pack.desiredWebhook, []);
    assert(cleared.webhookIngress.registration === undefined, "missing listing removes registration");
    assert(cleared.webhookIngress.health === "unregistered", "missing listing is unregistered");
    const pingBody = JSON.stringify({
      data: {
        type: "webhookPingCreated",
        id: "ping-stale-reg",
        attributes: { eventType: "WEBHOOK_PING", createdDate: later },
      },
    });
    const ping = signedRequest(pingBody);
    const afterEnvelope = ingestSignedWebhookEnvelope(cleared, ping.result.envelope!, createFixtureProvider(pack), later);
    assert(afterEnvelope.webhookIngress.registration === undefined, "envelope does not restore a deleted registration");
    assert(afterEnvelope.webhookIngress.health === "unregistered", "envelope does not flip unregistered to healthy");
  });

  harness.check("signed webhook: consume drains the accepted queue into run/app-review.json", () => {
    const pack = loadPack();
    const counted = countingProvider(pack);
    const watching = startObserveMandate(mandateInput(), counted.provider, now);
    const afterStartReads = counted.snapshotReads();
    const accepted = signedRequest(webhookFixtureBody);
    assert(accepted.result.stored === true, "accept persists the envelope");
    assert(watching.webhookIngress.acceptedEventIds.length === 0, "accept does not mutate the watch by itself");
    const consumed = consumeAcceptedWebhookQueue(watching, accepted.queue, counted.provider, later);
    assert(consumed.consumedEventIds.includes("evt-signed-1"), "consume names the Apple event id");
    assert(consumed.skippedEventIds.length === 0, "first consume skips nothing");
    assert(consumed.state.webhookIngress.acceptedEventIds.includes("evt-signed-1"), "consume records the Apple event id");
    assert(consumed.state.webhookIngress.mode === "signed_receiver", "consume switches ingress to signed receiver");
    assert(counted.snapshotReads() === afterStartReads + 1, "consume wakes poll once");
    const again = consumeAcceptedWebhookQueue(consumed.state, accepted.queue, counted.provider, later);
    assert(again.consumedEventIds.length === 0, "second consume is idempotent");
    assert(again.skippedEventIds.includes("evt-signed-1"), "already accepted ids are skipped");
    assert(counted.snapshotReads() === afterStartReads + 1, "second consume does not poll again");
  });

  harness.check("signed webhook: b2c app-review-ingress accept then consume writes the watch", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-consume-"));
    try {
      const workspace = path.join(dir, "workspace");
      const queueDir = path.join(dir, "queue");
      mkdirSync(path.join(workspace, "run"), { recursive: true });
      mkdirSync(path.join(workspace, "store"), { recursive: true });
      seedCompatibleCatalog(workspace);
      const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
      writeAppReviewWatch(workspace, watching);
      const bodyPath = path.join(dir, "body.json");
      writeFileSync(bodyPath, webhookFixtureBody);
      const fixturePath = path.join(dir, "provider.json");
      writeFileSync(fixturePath, JSON.stringify(loadPack()));
      const signature = `hmacsha256=${signAppleWebhookBody(appleHmacSecret, webhookFixtureBody)}`;
      const binPath = path.join(skillRoot, "entrypoints", "cli", "b2c.mjs");
      const accepted = spawnSync(
        process.execPath,
        [binPath, "app-review-ingress", "accept", "--body-file", bodyPath, "--signature", signature, "--queue-dir", queueDir],
        {
          cwd: dir,
          encoding: "utf8",
          env: { ...process.env, B2C_APP_BUILDER_ASC_WEBHOOK_SECRET: appleHmacSecret },
        },
      );
      assert(accepted.status === 0, `accept must exit 0, got ${accepted.status}: ${accepted.stdout}\n${accepted.stderr}`);
      assert(accepted.stdout.includes("ACCEPTED"), "accept reports ACCEPTED");
      const afterAccept = readAppReviewState(path.join(workspace, "run", "app-review.json"));
      assert(afterAccept.status === "ok", "watch still exists after accept");
      if (afterAccept.status === "ok") {
        assert(afterAccept.state.webhookIngress.acceptedEventIds.length === 0, "accept does not write webhookIngress");
      }
      const consumed = spawnSync(
        process.execPath,
        [binPath, "app-review-ingress", "consume", "--workspace", workspace, "--queue-dir", queueDir, "--provider-fixture", fixturePath],
        {
          cwd: dir,
          encoding: "utf8",
          env: { ...process.env, [APP_REVIEW_PROVIDER_FIXTURE_ENV]: "1" },
        },
      );
      assert(consumed.status === 0, `consume must exit 0, got ${consumed.status}: ${consumed.stdout}\n${consumed.stderr}`);
      assert(consumed.stdout.includes("CONSUMED 1"), "consume reports one envelope");
      const afterConsume = readAppReviewState(path.join(workspace, "run", "app-review.json"));
      assert(afterConsume.status === "ok", "consume writes a valid watch");
      if (afterConsume.status !== "ok") return;
      assert(afterConsume.state.webhookIngress.acceptedEventIds.includes("evt-signed-1"), "consume records the Apple event id");
      assert(afterConsume.state.webhookIngress.mode === "signed_receiver", "consume updates ingress mode");
      const markdown = readFileSync(path.join(workspace, "store", "APP_REVIEW.md"), "utf8");
      assert(markdown.length > 0, "consume refreshes founder copy");
      const pending = createFileWebhookQueue(queueDir).list();
      assert(pending.length === 0, "consume archives the envelope after the watch write");
      const acked = readdirSync(path.join(queueDir, APP_REVIEW_WEBHOOK_ACKED_DIR)).filter((name) => name.endsWith(".json"));
      assert(acked.length === 1, "acked directory keeps the drained envelope");

      const helper = consumeWorkspaceWebhookQueue({
        workspaceRoot: workspace,
        queue: createFileWebhookQueue(queueDir),
        provider: createFixtureProvider(loadPack()),
        now: later,
      });
      assert(helper.status === "ok", "workspace helper is idempotent");
      if (helper.status === "ok") {
        assert(helper.result.consumedEventIds.length === 0, "second workspace consume finds no pending envelopes");
        assert(helper.result.skippedEventIds.length === 0, "acked envelopes are gone from the queue");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("signed webhook: direct and CLI consume refuse a malformed catalog before provider polling, queue acknowledgement, or writes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-malformed-catalog-"));
    try {
      const invalidPin = structuredClone(currentPin.catalog);
      invalidPin.workflows[0]!.dependencies = ["workflow.fixture.missing"];
      const workspace = path.join(dir, "direct-workspace");
      mkdirSync(path.join(workspace, "run"), { recursive: true });
      mkdirSync(path.join(workspace, "store"), { recursive: true });
      writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(invalidPin));
      writeAppReviewWatch(workspace, startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now));
      const backingQueue = createMemoryWebhookQueue();
      backingQueue.persist(queuedEnvelope("evt-malformed-catalog-direct", later));
      let listCalls = 0;
      let acknowledgeCalls = 0;
      const countedQueue = {
        persist: (envelope: SignedWebhookEnvelope) => backingQueue.persist(envelope),
        get: (providerEventId: string) => backingQueue.get(providerEventId),
        list: () => {
          listCalls += 1;
          return backingQueue.list();
        },
        acknowledge: (providerEventId: string) => {
          acknowledgeCalls += 1;
          return backingQueue.acknowledge(providerEventId);
        },
      };
      const counted = countingProvider(loadPack());
      const directBefore = JSON.stringify(snapshot(workspace));
      const direct = consumeWorkspaceWebhookQueue({
        workspaceRoot: workspace,
        queue: countedQueue,
        provider: counted.provider,
        now: later,
      });
      assert(direct.status === "incompatible", `expected direct catalog refusal, got ${JSON.stringify(direct)}`);
      if (direct.status === "incompatible") assert(direct.message.includes("invalid_catalog"), `expected invalid_catalog, got ${direct.message}`);
      assert(counted.snapshotReads() === 0, "malformed-catalog direct consume must not poll the provider");
      assert(listCalls === 0, "malformed-catalog direct consume must not inspect the queue");
      assert(acknowledgeCalls === 0, "malformed-catalog direct consume must not acknowledge the queue");
      assert(backingQueue.list().length === 1, "malformed-catalog direct consume must leave the accepted envelope queued");
      assert(JSON.stringify(snapshot(workspace)) === directBefore, "malformed-catalog direct consume must preserve every workspace byte");

      const cliWorkspace = path.join(dir, "cli-workspace");
      const queueDir = path.join(dir, "cli-queue");
      const binDir = path.join(dir, "bin");
      const providerMarker = path.join(dir, "provider-polled");
      mkdirSync(path.join(cliWorkspace, "run"), { recursive: true });
      mkdirSync(path.join(cliWorkspace, "store"), { recursive: true });
      writeFileSync(path.join(cliWorkspace, "catalog.json"), JSON.stringify(invalidPin));
      writeAppReviewWatch(cliWorkspace, startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now));
      createFileWebhookQueue(queueDir).persist(queuedEnvelope("evt-malformed-catalog-cli", later));
      mkdirSync(binDir, { recursive: true });
      writeFileSync(path.join(binDir, "asc"), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(providerMarker)}, 'polled');\n`, {
        mode: 0o755,
      });
      const cliBefore = JSON.stringify(snapshot(cliWorkspace));
      const queueBefore = JSON.stringify(snapshot(queueDir));
      const binPath = path.join(skillRoot, "entrypoints", "cli", "b2c.mjs");
      const cliResult = spawnSync(process.execPath, [binPath, "app-review-ingress", "consume", "--workspace", cliWorkspace, "--queue-dir", queueDir], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
      });
      assert(cliResult.status === 1, `expected CLI exit 1, got ${cliResult.status}: ${cliResult.stdout}\n${cliResult.stderr}`);
      assert(cliResult.stderr.includes("invalid_catalog"), `expected CLI catalog refusal, got:\n${cliResult.stderr}`);
      assert(!existsSync(providerMarker), "malformed-catalog CLI consume must not invoke the provider executable");
      assert(JSON.stringify(snapshot(cliWorkspace)) === cliBefore, "malformed-catalog CLI consume must preserve every workspace byte");
      assert(JSON.stringify(snapshot(queueDir)) === queueBefore, "malformed-catalog CLI consume must not acknowledge or move queue entries");
      assert(!existsSync(path.join(queueDir, APP_REVIEW_WEBHOOK_ACKED_DIR)), "malformed-catalog CLI consume must not create an acknowledgement directory");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("signed webhook: direct consume refuses shape-valid non-executable catalogs before provider or queue access", () => {
    const invalidPins = [
      {
        name: "unknown-dependency",
        create: () => {
          const pin = structuredClone(currentPin.catalog);
          pin.workflows[0]!.dependencies = ["workflow.fixture.missing"];
          return pin;
        },
      },
      {
        name: "unknown-refresh-dependency",
        create: () => {
          const pin = structuredClone(currentPin.catalog);
          pin.workflows[0]!.refreshDependencies = [{ workflowId: "workflow.fixture.missing", instructions: "Refresh from the missing workflow." }];
          return pin;
        },
      },
      {
        name: "duplicate-output-writer",
        create: () => {
          const pin = structuredClone(currentPin.catalog);
          pin.workflows.push({
            ...structuredClone(pin.workflows[0]!),
            id: "workflow.fixture.duplicate-writer",
            title: "Duplicate writer fixture",
            dependencies: [],
            refreshDependencies: [],
          });
          return pin;
        },
      },
    ];
    for (const invalidPin of invalidPins) {
      const dir = mkdtempSync(path.join(tmpdir(), `app-review-${invalidPin.name}-`));
      try {
        const workspace = path.join(dir, "workspace");
        mkdirSync(path.join(workspace, "run"), { recursive: true });
        mkdirSync(path.join(workspace, "store"), { recursive: true });
        writeFileSync(path.join(workspace, "catalog.json"), `${JSON.stringify(invalidPin.create(), null, 2)}\n`);
        writeAppReviewWatch(workspace, startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now));
        const backingQueue = createMemoryWebhookQueue();
        backingQueue.persist(queuedEnvelope(`evt-${invalidPin.name}`, later));
        let listCalls = 0;
        let acknowledgeCalls = 0;
        const countedQueue = {
          persist: (envelope: SignedWebhookEnvelope) => backingQueue.persist(envelope),
          get: (providerEventId: string) => backingQueue.get(providerEventId),
          list: () => {
            listCalls += 1;
            return backingQueue.list();
          },
          acknowledge: (providerEventId: string) => {
            acknowledgeCalls += 1;
            return backingQueue.acknowledge(providerEventId);
          },
        };
        const counted = countingProvider(loadPack());
        const before = JSON.stringify(snapshot(workspace));
        const result = consumeWorkspaceWebhookQueue({
          workspaceRoot: workspace,
          queue: countedQueue,
          provider: counted.provider,
          now: later,
        });
        assert(result.status === "incompatible", `expected ${invalidPin.name} compatibility refusal, got ${JSON.stringify(result)}`);
        assert(counted.snapshotReads() === 0, `${invalidPin.name} consume must not poll the provider`);
        assert(listCalls === 0, `${invalidPin.name} consume must not inspect the queue`);
        assert(acknowledgeCalls === 0, `${invalidPin.name} consume must not acknowledge the queue`);
        assert(backingQueue.list().length === 1, `${invalidPin.name} consume must leave the envelope queued`);
        assert(JSON.stringify(snapshot(workspace)) === before, `${invalidPin.name} consume must preserve every workspace byte`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  harness.check("signed webhook: b2c app-review-ingress verify uses env secrets only", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-ingress-"));
    try {
      const bodyPath = path.join(dir, "body.json");
      writeFileSync(bodyPath, webhookFixtureBody);
      const signature = `hmacsha256=${signAppleWebhookBody(appleHmacSecret, webhookFixtureBody)}`;
      const binPath = path.join(skillRoot, "entrypoints", "cli", "b2c.mjs");
      const verified = spawnSync(process.execPath, [binPath, "app-review-ingress", "verify", "--body-file", bodyPath, "--signature", signature], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, B2C_APP_BUILDER_ASC_WEBHOOK_SECRET: appleHmacSecret },
      });
      assert(verified.status === 0, `verify must exit 0, got ${verified.status}: ${verified.stdout}\n${verified.stderr}`);
      assert(verified.stdout.includes("evt-signed-1"), "verify names the Apple event id");
      const refused = spawnSync(process.execPath, [binPath, "app-review-ingress", "verify", "--body-file", bodyPath, "--signature", signature], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, B2C_APP_BUILDER_ASC_WEBHOOK_SECRET: "" },
      });
      assert(refused.status === 1, "verify without the env secret fails closed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("live provider: consume polls App Store Connect instead of a fixture pack", () => {
    const calls: string[][] = [];
    const provider = createAscAppReviewProvider({
      appId: "123456789",
      platform: "IOS",
      marketingVersion: "1.0.0",
      runner: cannedAscRunner({ calls }),
      now: () => later,
    });
    const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
    assert(watching.currentCase.appVersion.providerObjectId === "asv-1", "fixture start uses canned layer ids");
    const polled = pollAppReview(watching, provider, later);
    assert(polled.currentCase.appVersion.providerObjectId === "asv-live-1", "live poll writes the provider object id");
    assert(polled.currentCase.reviewSubmission?.providerObjectId === "rs-live-1", "live poll writes the submission id");
    assert(
      calls.some((args) => args[0] === "review" && args[1] === "status" && args.includes("--output") && args.includes("json")),
      "live poll runs asc review status",
    );
    assert(
      calls.every((args) => !commandIsForbiddenForAppReview(`asc ${args.join(" ")}`) && !args.includes("--confirm") && !args.includes("serve")),
      "live poll stays observe-only",
    );
  });

  harness.check("live provider: a failed snapshot read does not write the watch", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-live-fail-"));
    try {
      const workspace = path.join(dir, "workspace");
      mkdirSync(path.join(workspace, "run"), { recursive: true });
      mkdirSync(path.join(workspace, "store"), { recursive: true });
      seedCompatibleCatalog(workspace);
      const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
      writeAppReviewWatch(workspace, watching);
      const queue = createMemoryWebhookQueue();
      queue.persist(queuedEnvelope("evt-live-fail", later));
      const failed = consumeWorkspaceWebhookQueue({
        workspaceRoot: workspace,
        queue,
        provider: createAscAppReviewProvider({
          appId: "123456789",
          runner: () => cliFail("asc missing"),
          now: () => later,
        }),
        now: later,
      });
      assert(failed.status === "provider_failed", "live read failure is provider_failed");
      const after = readAppReviewState(path.join(workspace, "run", "app-review.json"));
      assert(after.status === "ok", "watch still exists after a failed live read");
      if (after.status === "ok") {
        assert(after.state.currentCase.appVersion.providerObjectId === "asv-1", "failed live read does not overwrite layers");
      }
      assert(
        queue.list().some((item) => item.providerEventId === "evt-live-fail"),
        "failed live read leaves the envelope queued",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("signed webhook: consume archives envelopes so forgotten ids cannot replay", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-ack-"));
    try {
      const workspace = path.join(dir, "workspace");
      const queueDir = path.join(dir, "queue");
      mkdirSync(path.join(workspace, "run"), { recursive: true });
      mkdirSync(path.join(workspace, "store"), { recursive: true });
      seedCompatibleCatalog(workspace);
      const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
      writeAppReviewWatch(workspace, watching);
      const queue = createFileWebhookQueue(queueDir);
      const memory = createMemoryWebhookQueue();
      for (let index = 1; index <= 70; index += 1) {
        const receivedAt = new Date(Date.parse("2026-08-24T12:00:00.000Z") + index * 1000).toISOString();
        const envelope = queuedEnvelope(`evt-overflow-${index}`, receivedAt);
        queue.persist(envelope);
        memory.persist(envelope);
      }
      const unbounded = consumeAcceptedWebhookQueue(watching, memory, createFixtureProvider(loadPack()), later);
      assert(unbounded.state.webhookIngress.acceptedEventIds.length === 64, "display history stays bounded at 64");
      const replay = consumeAcceptedWebhookQueue(unbounded.state, memory, createFixtureProvider(loadPack()), later);
      assert(replay.consumedEventIds.length === 70, "without ack, forgotten ids evict the window and replay the whole queue");
      assert(replay.skippedEventIds.length === 0, "the sliding window never reaches a skip");

      const drained = consumeWorkspaceWebhookQueue({
        workspaceRoot: workspace,
        queue,
        provider: createFixtureProvider(loadPack()),
        now: later,
      });
      assert(drained.status === "ok", "workspace consume writes the watch");
      assert(createFileWebhookQueue(queueDir).list().length === 0, "pending queue is empty after ack");
      assert(existsSync(path.join(queueDir, APP_REVIEW_WEBHOOK_ACKED_DIR)), "acked directory exists after consume");
      const acked = readdirSync(path.join(queueDir, APP_REVIEW_WEBHOOK_ACKED_DIR)).filter((name) => name.endsWith(".json"));
      assert(acked.length === 70, "every envelope is archived after the watch write");
      const again = consumeWorkspaceWebhookQueue({
        workspaceRoot: workspace,
        queue: createFileWebhookQueue(queueDir),
        provider: createFixtureProvider(loadPack()),
        now: later,
      });
      assert(again.status === "ok", "second consume still loads the watch");
      if (again.status === "ok") {
        assert(again.result.consumedEventIds.length === 0, "acked envelopes are not consumed again");
        assert(again.result.skippedEventIds.length === 0, "acked envelopes are not skipped from a pending list");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("signed webhook: consume without a fixture polls a live asc on PATH", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-live-cli-"));
    try {
      const workspace = path.join(dir, "workspace");
      const queueDir = path.join(dir, "queue");
      const binDir = path.join(dir, "bin");
      mkdirSync(path.join(workspace, "run"), { recursive: true });
      mkdirSync(path.join(workspace, "store"), { recursive: true });
      seedCompatibleCatalog(workspace);
      writeFakeAsc(binDir);
      const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
      writeAppReviewWatch(workspace, watching);
      const accepted = signedRequest(webhookFixtureBody, { queue: createFileWebhookQueue(queueDir) });
      assert(accepted.result.stored === true, "accept persists the envelope");
      const binPath = path.join(skillRoot, "entrypoints", "cli", "b2c.mjs");
      const consumed = spawnSync(process.execPath, [binPath, "app-review-ingress", "consume", "--workspace", workspace, "--queue-dir", queueDir], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
      });
      assert(consumed.status === 0, `live consume must exit 0, got ${consumed.status}: ${consumed.stdout}\n${consumed.stderr}`);
      assert(consumed.stdout.includes("CONSUMED 1"), "live consume reports one envelope");
      const after = readAppReviewState(path.join(workspace, "run", "app-review.json"));
      assert(after.status === "ok", "live consume writes a valid watch");
      if (after.status !== "ok") return;
      assert(after.state.currentCase.appVersion.providerObjectId === "asv-live-1", "live consume writes provider truth, not fixture ids");
      assert(createFileWebhookQueue(queueDir).list().length === 0, "live consume archives the envelope");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("signed webhook: --provider-fixture is refused without the test-only env", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-fixture-refused-"));
    try {
      const workspace = path.join(dir, "workspace");
      mkdirSync(path.join(workspace, "run"), { recursive: true });
      seedCompatibleCatalog(workspace);
      const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
      writeAppReviewWatch(workspace, watching);
      const fixturePath = path.join(dir, "provider.json");
      writeFileSync(fixturePath, JSON.stringify(loadPack()));
      const binPath = path.join(skillRoot, "entrypoints", "cli", "b2c.mjs");
      const refused = spawnSync(process.execPath, [binPath, "app-review-ingress", "consume", "--workspace", workspace, "--provider-fixture", fixturePath], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, [APP_REVIEW_PROVIDER_FIXTURE_ENV]: "" },
      });
      assert(refused.status === 1, "fixture consume without the test env fails closed");
      assert(refused.stderr.includes("provider_fixture_refused"), "refusal names the test-only fixture gate");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("live provider: missing review status throws AscProviderReadError", () => {
    const provider = createAscAppReviewProvider({
      appId: "123456789",
      runner: cannedAscRunner({ status: "not-json" }),
    });
    let thrown: unknown;
    try {
      provider.readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "invalid review JSON fails closed");
  });

  harness.check("live provider: review status without an app-version layer fails closed", () => {
    const provider = createAscAppReviewProvider({
      appId: "123456789",
      runner: cannedAscRunner({ status: { wrapped: true, data: { reviewState: "WAITING_FOR_REVIEW" } } }),
      now: () => later,
    });
    let thrown: unknown;
    try {
      provider.readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "missing app-version layer fails closed");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "error names the missing layer");

    const dir = mkdtempSync(path.join(tmpdir(), "app-review-unobserved-shape-"));
    try {
      const workspace = path.join(dir, "workspace");
      mkdirSync(path.join(workspace, "run"), { recursive: true });
      mkdirSync(path.join(workspace, "store"), { recursive: true });
      seedCompatibleCatalog(workspace);
      const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
      writeAppReviewWatch(workspace, watching);
      const queue = createMemoryWebhookQueue();
      queue.persist(queuedEnvelope("evt-unobserved-shape", later));
      const failed = consumeWorkspaceWebhookQueue({
        workspaceRoot: workspace,
        queue,
        provider,
        now: later,
      });
      assert(failed.status === "provider_failed", "changed review-status shape is provider_failed");
      const after = readAppReviewState(path.join(workspace, "run", "app-review.json"));
      assert(after.status === "ok", "watch still exists after a fail-closed live read");
      if (after.status === "ok") {
        assert(after.state.currentCase.appVersion.rawValue !== "UNOBSERVED", "consume does not write a manufactured UNOBSERVED layer");
        assert(after.state.currentCase.appVersion.providerObjectId === "asv-1", "fail-closed live read does not overwrite layers");
      }
      assert(
        queue.list().some((item) => item.providerEventId === "evt-unobserved-shape"),
        "fail-closed live read leaves the envelope queued",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("live provider: poll time orders a snapshot whose createdDate predates the watch", () => {
    const staleDates = {
      ...liveReviewStatusJson(),
      version: { ...(liveReviewStatusJson().version as Record<string, unknown>), createdDate: earlier, id: "asv-live-stale" },
      latestSubmission: {
        ...(liveReviewStatusJson().latestSubmission as Record<string, unknown>),
        submittedDate: earlier,
        id: "rs-live-stale",
      },
    };
    const provider = createAscAppReviewProvider({
      appId: "123456789",
      runner: cannedAscRunner({ status: staleDates }),
      now: () => later,
    });
    const snapshot = provider.readSnapshot();
    assert(snapshot.providerTimestamp === later, "live snapshot uses poll time, not createdDate");
    const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
    const polled = pollAppReview(watching, provider, later);
    assert(polled.currentCase.appVersion.providerObjectId === "asv-live-stale", "stale createdDate does not mark the live poll out of order");
    assert(polled.currentCase.lastProviderTimestamp === later, "case lastProviderTimestamp follows poll time");
    assert(!polled.events.some((event) => event.kind === "out_of_order_ignored"), "live poll with older createdDate is not out_of_order_ignored");
  });

  harness.check("live provider: agreements status failure does not block public review persist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-agreements-optional-"));
    try {
      const workspace = path.join(dir, "workspace");
      mkdirSync(path.join(workspace, "run"), { recursive: true });
      mkdirSync(path.join(workspace, "store"), { recursive: true });
      seedCompatibleCatalog(workspace);
      const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
      writeAppReviewWatch(workspace, watching);
      const queue = createMemoryWebhookQueue();
      queue.persist(queuedEnvelope("evt-agreements-fail", later));
      const consumed = consumeWorkspaceWebhookQueue({
        workspaceRoot: workspace,
        queue,
        provider: createAscAppReviewProvider({
          appId: "123456789",
          runner: cannedAscRunner({ failAgreements: true }),
          now: () => later,
        }),
        now: later,
      });
      assert(consumed.status === "ok", "missing web agreements status does not fail consume");
      if (consumed.status === "ok") {
        assert(consumed.result.state.currentCase.appVersion.providerObjectId === "asv-live-1", "public review layers persist");
        assert(consumed.result.state.currentCase.appVersion.rawValue === "WAITING_FOR_REVIEW", "public review state persists");
        assert(consumed.result.state.currentCase.blocker !== "unknown_provider_state", "unobserved agreement is not unknown provider state");
      }
      assert(queue.list().length === 0, "successful public poll archives the envelope");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("live provider: missing web session is a handoff after public review persist", () => {
    const unresolvedStatus = {
      appId: "123456789",
      version: { id: "asv-live-unresolved", version: "1.0.0", platform: "IOS", state: "IN_REVIEW", createdDate: earlier },
      latestSubmission: { id: "rs-live-unresolved", state: "UNRESOLVED_ISSUES", platform: "IOS", submittedDate: earlier },
      items: [{ id: "rsi-live-unresolved", state: "REJECTED" }],
    };
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-agreements-handoff-"));
    try {
      const workspace = path.join(dir, "workspace");
      mkdirSync(path.join(workspace, "run"), { recursive: true });
      mkdirSync(path.join(workspace, "store"), { recursive: true });
      seedCompatibleCatalog(workspace);
      const watching = startObserveMandate(mandateInput(), createFixtureProvider(loadPack()), now);
      writeAppReviewWatch(workspace, watching);
      const queue = createMemoryWebhookQueue();
      queue.persist(queuedEnvelope("evt-session-handoff", later));
      const consumed = consumeWorkspaceWebhookQueue({
        workspaceRoot: workspace,
        queue,
        provider: createAscAppReviewProvider({
          appId: "123456789",
          runner: cannedAscRunner({ status: unresolvedStatus, failAgreements: true }),
          now: () => later,
        }),
        now: later,
      });
      assert(consumed.status === "ok", "missing web session does not fail the whole consume");
      if (consumed.status === "ok") {
        assert(consumed.result.state.currentCase.appVersion.providerObjectId === "asv-live-unresolved", "public unresolved layers persist");
        assert(consumed.result.state.currentCase.authReadiness.handoff === "web_session_required", "missing session is a founder handoff");
        assert(consumed.result.state.currentCase.blocker === "web_session_required", "case blocker is the web-session handoff");
      }
      assert(queue.list().length === 0, "handoff after public persist still archives the envelope");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("signed webhook: persist treats an archived Apple event id as a duplicate", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-acked-dedup-"));
    try {
      const queueDir = path.join(dir, "queue");
      const envelope = queuedEnvelope("evt-acked-replay", later);
      const queue = createFileWebhookQueue(queueDir);
      assert(queue.persist(envelope).stored === true, "first persist stores the envelope");
      assert(queue.acknowledge("evt-acked-replay").removed === true, "acknowledge archives the envelope");
      assert(queue.list().length === 0, "pending queue is empty after ack");
      const replay = queue.persist(envelope);
      assert(replay.stored === false, "acked id is not stored again");
      assert(replay.duplicate === true, "acked id is a duplicate");
      assert(queue.list().length === 0, "acked redelivery does not enqueue a pending file");
      const memory = createMemoryWebhookQueue();
      assert(memory.persist(envelope).stored === true, "memory persist stores once");
      assert(memory.acknowledge("evt-acked-replay").removed === true, "memory acknowledge removes pending");
      const memoryReplay = memory.persist(envelope);
      assert(memoryReplay.duplicate === true, "memory persist also dedups archived ids");
      assert(memory.list().length === 0, "memory redelivery does not enqueue again");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("Phase 3: metadata, binary, missing-information, and protected-policy route to bounded plans", () => {
    const synthetic = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const notes = startObserveMandate(mandateInput(), createFixtureProvider(synthetic), "2026-08-24T13:00:00.000Z");
    const notesPlan = planAppReviewRemediation(notes, "2026-08-24T13:05:00.000Z");
    assert(notesPlan.applied === true, "missing information plans");
    assert(notesPlan.state.currentCase.remediation?.plan.route === "review_notes", "2.1 routes to review notes");
    assert(notesPlan.state.currentCase.remediation?.plan.newBinaryRequired === false, "review notes do not rebuild");
    assert(notesPlan.state.currentCase.classification.implementationStatus === "planned", "classification tracks planned");

    const metadataPack = withPack(synthetic, {
      snapshot: {
        ...synthetic.snapshot,
        layers: synthetic.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "METADATA_REJECTED" } : layer)),
      },
    });
    const metadata = startObserveMandate(mandateInput(), createFixtureProvider(metadataPack), "2026-08-24T13:00:00.000Z");
    assert(metadata.currentCase.classification.kind === "metadata_rejected", "layer state classifies metadata");
    const metadataPlan = planAppReviewRemediation(metadata, "2026-08-24T13:05:00.000Z");
    assert(metadataPlan.state.currentCase.remediation?.plan.route === "same_build_metadata", "metadata reuses the build");
    assert(metadataPlan.state.currentCase.remediation?.plan.newBinaryRequired === false, "metadata is not a new binary");

    const binaryPack = withPack(synthetic, {
      snapshot: {
        ...synthetic.snapshot,
        layers: synthetic.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "INVALID_BINARY" } : layer)),
      },
    });
    const binary = startObserveMandate(mandateInput(), createFixtureProvider(binaryPack), "2026-08-24T13:00:00.000Z");
    assert(binary.currentCase.classification.kind === "invalid_binary", "layer state classifies binary");
    const binaryPlan = planAppReviewRemediation(binary, "2026-08-24T13:05:00.000Z");
    assert(binaryPlan.state.currentCase.remediation?.plan.route === "new_binary", "binary requires a new archive");
    assert(binaryPlan.state.currentCase.remediation?.plan.newBinaryRequired === true, "binary plan requires a new build");

    const legalPacket = synthetic.rejectionPacket;
    const legalThread = legalPacket?.threads?.[0];
    const legalPack = withPack(synthetic, {
      rejectionPacket:
        legalPacket && legalThread
          ? {
              ...legalPacket,
              threads: [
                {
                  ...legalThread,
                  rejections: [
                    {
                      id: "rej-legal",
                      reasons: [{ reasonSection: "Guideline 5.2", reasonCode: "5.2", reasonDescription: "IP dispute." }],
                    },
                  ],
                },
              ],
            }
          : undefined,
    });
    const legal = startObserveMandate(mandateInput(), createFixtureProvider(legalPack), "2026-08-24T13:00:00.000Z");
    assert(legal.currentCase.classification.kind === "legal_policy", "5.2 classifies as legal");
    assert(isProtectedAppReviewKind(legal.currentCase.classification.kind) === true, "legal is protected");
    const legalPlan = planAppReviewRemediation(legal, "2026-08-24T13:05:00.000Z");
    assert(legalPlan.reason === "parked", "protected policy parks");
    assert(legalPlan.state.currentCase.remediation?.status === "parked", "parked status");
    assert(legalPlan.state.currentCase.remediation?.consumer === undefined, "park does not mutate the consumer repo");
    assert(projectAppReviewForFounder(legalPlan.state).needsFounderAction === true, "park needs the founder");
    assert(routeForClassification("privacy_data_disclosure").disposition === "park", "privacy parks");
  });

  harness.check("Phase 3: binary case inspects a new archive; reused hash is refused", () => {
    const synthetic = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const binaryPack = withPack(synthetic, {
      snapshot: {
        ...synthetic.snapshot,
        layers: synthetic.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "INVALID_BINARY" } : layer)),
      },
    });
    const planned = planAppReviewRemediation(
      startObserveMandate(mandateInput(), createFixtureProvider(binaryPack), "2026-08-24T13:00:00.000Z"),
      "2026-08-24T13:05:00.000Z",
    ).state;
    const plannedIdentity = plannedBinaryIdentity(planned);
    assert(plannedIdentity.bundleId === "com.example.app", "empty workspace still uses the mandate bundle id");
    assert(plannedIdentity.marketingVersion === "1.0.0", "empty workspace still uses the mandate version");
    assert(plannedIdentity.buildNumber === "1", "empty workspace starts at build 1");
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-binary-"));
    try {
      const applied = applyAppReviewPlan(planned, "2026-08-24T13:06:00.000Z", {
        workspaceRoot: dir,
        producerSessionId: "session-producer",
      });
      assert(applied.applied === true, "binary source patch applies");
      assert(applied.state.currentCase.remediation?.consumer?.producerSessionId === "session-producer", "apply records the producer");
      writeFixtureArchive(dir, "build/ReviewFix.xcarchive", plannedIdentity);
      const inspected = inspectAppReviewArchive(applied.state, "2026-08-24T13:07:00.000Z", {
        workspaceRoot: dir,
        archiveRelativePath: "build/ReviewFix.xcarchive",
      });
      assert(inspected.applied === true, "new archive inspects");
      assert(inspected.state.currentCase.remediation?.archive?.buildNumber === plannedIdentity.buildNumber, "inspected build number");
      assert(inspected.state.currentCase.remediation?.archive?.bundleId === plannedIdentity.bundleId, "inspected bundle id");
      const reused = inspectAppReviewArchive(inspected.state, "2026-08-24T13:08:00.000Z", {
        workspaceRoot: dir,
        archiveRelativePath: "build/ReviewFix.xcarchive",
      });
      assert(reused.applied === false, "same archive hash is refused");
      writeFixtureArchive(dir, "build/ReviewFix2.xcarchive", { ...plannedIdentity, buildNumber: "2" });
      const newer = inspectAppReviewArchive(inspected.state, "2026-08-24T13:09:00.000Z", {
        workspaceRoot: dir,
        archiveRelativePath: "build/ReviewFix2.xcarchive",
      });
      assert(newer.applied === true, "a different archive inspects");
      const selfVerify = recordAppReviewVerification(newer.state, "2026-08-24T13:10:00.000Z", {
        producerSessionId: "session-producer",
        verifierSessionId: "session-producer",
        accepted: true,
      });
      assert(selfVerify.applied === false, "producer cannot accept its own work");
      const whitespaceSelf = recordAppReviewVerification(newer.state, "2026-08-24T13:10:00.000Z", {
        producerSessionId: "session-producer",
        verifierSessionId: "session-producer ",
        accepted: true,
      });
      assert(whitespaceSelf.applied === false, "trimmed producer and verifier stay the same session");
      const claimedOtherProducer = recordAppReviewVerification(newer.state, "2026-08-24T13:10:00.000Z", {
        producerSessionId: "session-other",
        verifierSessionId: "session-verifier",
        accepted: true,
      });
      assert(claimedOtherProducer.applied === false, "verification cannot rename the stored producer");
      const verified = recordAppReviewVerification(newer.state, "2026-08-24T13:10:00.000Z", {
        producerSessionId: " session-producer ",
        verifierSessionId: "session-verifier",
        accepted: true,
      });
      assert(verified.applied === true, "independent verifier accepts");
      assert(verified.state.currentCase.remediation?.verification?.producerSessionId === "session-producer", "record stores the trimmed producer");
      assert(verified.state.currentCase.remediation?.status === "verified", "binary case is verified");
      assert(projectAppReviewForFounder(verified.state).summary.includes("passed independent review"), "the local projection reports independent verification");
      assert(commandIsStoreSubmission("asc review submit") === true, "submit stays forbidden");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("Phase 3: metadata preflight and verifier rejection open a new attempt", () => {
    const synthetic = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const metadataPack = withPack(synthetic, {
      snapshot: {
        ...synthetic.snapshot,
        layers: synthetic.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "METADATA_REJECTED" } : layer)),
      },
    });
    const watching = startObserveMandate(mandateInput(), createFixtureProvider(metadataPack), "2026-08-24T13:00:00.000Z");
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-meta-"));
    try {
      const listingPath = path.join(dir, "store/app-store-listing/APP_STORE_LISTING.md");
      mkdirSync(path.dirname(listingPath), { recursive: true });
      writeFileSync(listingPath, "# Canonical listing\n\nKeep this packet.\n", "utf8");
      const planned = planAppReviewRemediation(watching, "2026-08-24T13:05:00.000Z", { workspaceRoot: dir }).state;
      const skipped = applyAppReviewPlan(planned, "2026-08-24T13:06:00.000Z", {
        workspaceRoot: dir,
        producerSessionId: "session-producer",
      });
      assert(skipped.applied === false, "metadata apply without preflight is refused");
      const applied = applyAppReviewPlan(planned, "2026-08-24T13:06:00.000Z", {
        workspaceRoot: dir,
        producerSessionId: "session-producer",
        metadataPreflight: { validatePassed: true, dryRunPassed: true, evidenceFingerprint: "a".repeat(64) },
      });
      assert(applied.applied === true, "metadata apply with preflight");
      assert(readFileSync(listingPath, "utf8").includes("Keep this packet."), "create must not truncate the canonical listing");
      assert(
        applied.state.currentCase.remediation?.consumer?.appliedPaths.includes("store/app-store-listing/APP_REVIEW_METADATA_REPAIR.md") === true,
        "metadata writes a sidecar repair",
      );
      const rejected = recordAppReviewVerification(applied.state, "2026-08-24T13:07:00.000Z", {
        producerSessionId: "session-producer",
        verifierSessionId: "session-verifier",
        accepted: false,
      });
      assert(rejected.state.currentCase.remediation?.status === "verification_rejected", "verifier rejection is recorded");
      assert(rejected.state.currentCase.remediation?.occurrence.attemptNumber === 2, "a new attempt opens");
      const replanned = planAppReviewRemediation(rejected.state, "2026-08-24T13:07:30.000Z", { workspaceRoot: dir });
      assert(replanned.applied === true, "replan after rejection is allowed");
      assert(replanned.state.currentCase.remediation?.occurrence.attemptNumber === 2, "replan reuses the opened retry");
      assert(replanned.state.currentCase.remediation?.occurrence.attemptIds.length === 2, "replan does not append a third attempt");
      const retried = applyAppReviewPlan(replanned.state, "2026-08-24T13:08:00.000Z", {
        workspaceRoot: dir,
        producerSessionId: "session-producer",
        metadataPreflight: { validatePassed: true, dryRunPassed: true, evidenceFingerprint: "b".repeat(64) },
      });
      assert(retried.applied === true, "rejected attempt can apply again");
      const accepted = recordAppReviewVerification(retried.state, "2026-08-24T13:09:00.000Z", {
        producerSessionId: "session-producer",
        verifierSessionId: "session-verifier",
        accepted: true,
      });
      assert(accepted.state.currentCase.remediation?.status === "verified", "second attempt verifies");
      writeAppReviewWatch(dir, accepted.state);
      const markdown = readFileSync(path.join(dir, "store", "APP_REVIEW.md"), "utf8");
      assert(!markdown.includes("asc review submit"), "founder copy never submits");
      assert(markdown.includes("I have not submitted"), "founder copy names the bound");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("Phase 3: create patches refuse existing files; binary identity follows the mandate", () => {
    const synthetic = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-identity-"));
    try {
      const listingPath = path.join(dir, "store/app-store-listing/APP_STORE_LISTING.md");
      mkdirSync(path.dirname(listingPath), { recursive: true });
      writeFileSync(listingPath, "# Keep me\n", "utf8");
      let refused = false;
      try {
        applyConsumerPatches(
          dir,
          [
            {
              relativePath: "store/app-store-listing/APP_STORE_LISTING.md",
              kind: "create",
              contents: "# App Store listing\n\nBounded metadata repair for this Apple review case.\n",
            },
          ],
          "2026-08-24T13:06:00.000Z",
          "session-producer",
        );
      } catch (error) {
        refused = error instanceof Error && error.message.includes("existing consumer file");
      }
      assert(refused, "create over an existing listing is refused");
      assert(readFileSync(listingPath, "utf8") === "# Keep me\n", "refused create leaves the listing intact");

      const sourcePlist = path.join(dir, "ios/Ocho/Info.plist");
      mkdirSync(path.dirname(sourcePlist), { recursive: true });
      writeFileSync(
        sourcePlist,
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<plist version="1.0"><dict>',
          "<key>CFBundleIdentifier</key><string>com.ocho.old</string>",
          "<key>CFBundleShortVersionString</key><string>0.9.0</string>",
          "<key>CFBundleVersion</key><string>9</string>",
          "<key>CFBundleDisplayName</key><string>Ocho</string>",
          "</dict></plist>",
          "",
        ].join("\n"),
        "utf8",
      );
      const binaryPack = withPack(synthetic, {
        snapshot: {
          ...synthetic.snapshot,
          layers: synthetic.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "INVALID_BINARY" } : layer)),
        },
      });
      const planned = planAppReviewRemediation(
        startObserveMandate(
          { ...mandateInput(), bundleId: "com.ocho.live", marketingVersion: "2.3.4" },
          createFixtureProvider(binaryPack),
          "2026-08-24T13:00:00.000Z",
        ),
        "2026-08-24T13:05:00.000Z",
        { workspaceRoot: dir },
      ).state;
      const identity = plannedBinaryIdentity(planned);
      assert(identity.bundleId === "com.ocho.live", "binary plan uses the mandate bundle id");
      assert(identity.marketingVersion === "2.3.4", "binary plan uses the mandate version");
      assert(identity.buildNumber === "10", "binary plan increments the consumer build");
      assert(planned.currentCase.remediation?.plan.patches[0]?.relativePath === "ios/Ocho/Info.plist", "binary plan targets the consumer Info.plist");
      assert(planned.currentCase.remediation?.plan.patches[0]?.kind === "replace", "existing Info.plist is a replace");
      const applied = applyAppReviewPlan(planned, "2026-08-24T13:06:00.000Z", {
        workspaceRoot: dir,
        producerSessionId: "session-producer",
      });
      assert(applied.applied === true, "derived binary patch applies");
      const updated = readFileSync(sourcePlist, "utf8");
      assert(updated.includes("com.ocho.live"), "replace writes the mandate bundle id");
      assert(updated.includes("2.3.4"), "replace writes the mandate version");
      assert(updated.includes("<string>10</string>"), "replace writes the incremented build");
      assert(updated.includes("Ocho"), "replace keeps other Info.plist keys");

      writeFixtureArchive(dir, "build/BinaryPlist.xcarchive", identity, { binary: true });
      const inspected = inspectAppReviewArchive(applied.state, "2026-08-24T13:07:00.000Z", {
        workspaceRoot: dir,
        archiveRelativePath: "build/BinaryPlist.xcarchive",
      });
      assert(inspected.applied === true, "binary compiled Info.plist inspects");
      assert(inspected.state.currentCase.remediation?.archive?.bundleId === "com.ocho.live", "binary plist bundle id");
      assert(inspected.state.currentCase.remediation?.archive?.marketingVersion === "2.3.4", "binary plist version");
      assert(inspected.state.currentCase.remediation?.archive?.buildNumber === "10", "binary plist build");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("Phase 4: observe mandate cannot submit; same-build uses review submit without re-upload", () => {
    const synthetic = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const metadataPack = withPack(synthetic, {
      snapshot: {
        ...synthetic.snapshot,
        layers: synthetic.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "METADATA_REJECTED" } : layer)),
      },
    });
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-resubmit-"));
    try {
      const listingPath = path.join(dir, "store/app-store-listing/APP_STORE_LISTING.md");
      mkdirSync(path.dirname(listingPath), { recursive: true });
      writeFileSync(listingPath, "# Canonical listing\n", "utf8");
      const watching = startObserveMandate(mandateInput(), createFixtureProvider(metadataPack), "2026-08-24T13:00:00.000Z");
      const unauthorized = submitAppReview(watching, "2026-08-24T13:20:00.000Z");
      assert(unauthorized.applied === false, "observe mandate cannot submit");
      const planned = planAppReviewRemediation(watching, "2026-08-24T13:05:00.000Z", { workspaceRoot: dir }).state;
      const applied = applyAppReviewPlan(planned, "2026-08-24T13:06:00.000Z", {
        workspaceRoot: dir,
        producerSessionId: "session-producer",
        metadataPreflight: { validatePassed: true, dryRunPassed: true, evidenceFingerprint: "a".repeat(64) },
      }).state;
      const verified = recordAppReviewVerification(applied, "2026-08-24T13:07:00.000Z", {
        producerSessionId: "session-producer",
        verifierSessionId: "session-verifier",
        accepted: true,
      }).state;
      const secretIdentity = authorizeAppReviewResubmit(verified, {
        alreadyUploaded: true,
        authorizedAt: "2026-08-24T13:08:00.000Z",
        authorizedBy: "founder@example.com",
      });
      assert(secretIdentity.applied === false, "envelope refuses email founder identity");
      const notUploaded = authorizeAppReviewResubmit(verified, {
        alreadyUploaded: false,
        authorizedAt: "2026-08-24T13:08:00.000Z",
        authorizedBy: "Founder",
      });
      assert(notUploaded.applied === true, "envelope can authorize without upload proof yet");
      const blocked = submitAppReview(notUploaded.state, "2026-08-24T13:09:00.000Z");
      assert(blocked.applied === false, "submit without already-uploaded proof is refused");
      const authorized = authorizeAppReviewResubmit(verified, {
        alreadyUploaded: true,
        authorizedAt: "2026-08-24T13:08:00.000Z",
        authorizedBy: "Founder",
      });
      assert(authorized.applied === true, "founder envelope authorizes resubmit");
      assert(authorized.state.mandate.mode === "resubmit", "mandate mode upgrades to resubmit");
      assert(authorized.state.currentCase.resubmission?.envelope.alreadyUploaded === true, "envelope records uploaded build");
      const submitted = submitAppReview(authorized.state, "2026-08-24T13:10:00.000Z");
      assert(submitted.applied === true, "same-build submit records");
      assert(submitted.reason === "resubmit_recorded", "reason is resubmit_recorded");
      assert(submitted.state.currentCase.resubmission?.status === "awaiting_readback", "status awaits readback");
      assert(submitted.state.currentCase.resubmission?.command?.includes("asc review submit") === true, "command is review submit");
      assert(submitted.state.currentCase.resubmission?.command?.includes("--confirm") === true, "command has confirm");
      assert(submitted.state.currentCase.resubmission?.command?.includes("publish") !== true, "command is not publish");
      writeAppReviewWatch(dir, submitted.state);
      const markdown = readFileSync(path.join(dir, "store", "APP_REVIEW.md"), "utf8");
      assert(!markdown.includes("asc review submit"), "founder copy never names the CLI command");
      assert(markdown.includes("standing envelope") || markdown.includes("submitted this version"), "founder copy names the submit bound");
      const duplicate = submitAppReview(submitted.state, "2026-08-24T13:11:00.000Z");
      assert(duplicate.applied === false, "duplicate submit before timeout is refused");
      const waitingLayers = submitted.state.currentCase.appVersion;
      const confirmed = applyAppReviewObservation(
        submitted.state,
        {
          providerTimestamp: "2026-08-24T13:12:00.000Z",
          layers: [
            {
              ...waitingLayers,
              layer: "app_version",
              rawValue: "WAITING_FOR_REVIEW",
              providerObjectId: waitingLayers.providerObjectId,
              schemaId: "AppStoreVersion",
            },
            ...(submitted.state.currentCase.reviewSubmission
              ? [
                  {
                    layer: "review_submission" as const,
                    rawValue: "WAITING_FOR_REVIEW",
                    providerObjectId: submitted.state.currentCase.reviewSubmission.providerObjectId,
                    schemaId: "ReviewSubmission" as const,
                  },
                ]
              : []),
          ],
          agreement: { rawStatus: "NONE", pending: false },
        },
        "2026-08-24T13:12:00.000Z",
      );
      assert(confirmed.applied === true, "waiting-for-review readback applies");
      assert(confirmed.state.currentCase.resubmission?.status === "submitted", "provider confirms the submit");
      assert(confirmed.state.currentCase.cycleNumber === submitted.state.currentCase.cycleNumber, "confirmed submit does not open a new cycle");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("Phase 4: timed-out submit reads back; second rejection opens a linked cycle; cap exhausts", () => {
    const synthetic = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const metadataPack = withPack(synthetic, {
      snapshot: {
        ...synthetic.snapshot,
        layers: synthetic.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "METADATA_REJECTED" } : layer)),
      },
    });
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-resubmit-cap-"));
    try {
      const listingPath = path.join(dir, "store/app-store-listing/APP_STORE_LISTING.md");
      mkdirSync(path.dirname(listingPath), { recursive: true });
      writeFileSync(listingPath, "# Canonical listing\n", "utf8");
      const verified = recordAppReviewVerification(
        applyAppReviewPlan(
          planAppReviewRemediation(
            startObserveMandate(mandateInput(), createFixtureProvider(metadataPack), "2026-08-24T13:00:00.000Z"),
            "2026-08-24T13:05:00.000Z",
            { workspaceRoot: dir },
          ).state,
          "2026-08-24T13:06:00.000Z",
          {
            workspaceRoot: dir,
            producerSessionId: "session-producer",
            metadataPreflight: { validatePassed: true, dryRunPassed: true, evidenceFingerprint: "c".repeat(64) },
          },
        ).state,
        "2026-08-24T13:07:00.000Z",
        { producerSessionId: "session-producer", verifierSessionId: "session-verifier", accepted: true },
      ).state;
      const authorized = authorizeAppReviewResubmit(verified, {
        alreadyUploaded: true,
        authorizedAt: "2026-08-24T13:08:00.000Z",
        authorizedBy: "Founder",
        maxCycles: 1,
      }).state;
      const submitted = submitAppReview(authorized, "2026-08-24T13:10:00.000Z", { timeoutMs: 60_000 }).state;
      const timedOut = submitAppReview(submitted, "2026-08-24T13:12:00.000Z");
      assert(timedOut.applied === true, "timeout records readback");
      assert(timedOut.reason === "resubmit_timeout_readback", "timeout reason");
      assert(timedOut.state.currentCase.resubmission?.status === "timed_out", "status is timed_out");
      const secondSubmit = submitAppReview(timedOut.state, "2026-08-24T13:13:00.000Z");
      assert(secondSubmit.applied === false, "timeout does not emit another submit");
      const rejected = applyAppReviewObservation(
        timedOut.state,
        {
          providerTimestamp: "2026-08-24T13:14:00.000Z",
          layers: timedOut.state.currentCase.reviewSubmission
            ? [
                {
                  layer: "app_version",
                  rawValue: "METADATA_REJECTED",
                  providerObjectId: timedOut.state.currentCase.appVersion.providerObjectId,
                  schemaId: "AppStoreVersion",
                },
                {
                  layer: "review_submission",
                  rawValue: "UNRESOLVED_ISSUES",
                  providerObjectId: timedOut.state.currentCase.reviewSubmission.providerObjectId,
                  schemaId: "ReviewSubmission",
                },
              ]
            : [
                {
                  layer: "app_version",
                  rawValue: "METADATA_REJECTED",
                  providerObjectId: timedOut.state.currentCase.appVersion.providerObjectId,
                  schemaId: "AppStoreVersion",
                },
              ],
          agreement: { rawStatus: "NONE", pending: false },
        },
        "2026-08-24T13:14:00.000Z",
      );
      assert(rejected.reason === "cycle_exhausted", "maxCycles 1 exhausts on the next rejection");
      assert(rejected.state.currentCase.resubmission?.status === "exhausted", "resubmission is exhausted");
      assert(projectAppReviewForFounder(rejected.state).needsFounderAction === true, "cap needs the founder");
      assert(projectAppReviewForFounder(rejected.state).summary.includes("retry limit"), "the local projection names the exhausted retry cap");
      const noMore = submitAppReview(rejected.state, "2026-08-24T13:15:00.000Z");
      assert(noMore.applied === false, "exhausted cap emits no more submits");

      const twoCycle = authorizeAppReviewResubmit(verified, {
        alreadyUploaded: true,
        authorizedAt: "2026-08-24T13:08:00.000Z",
        authorizedBy: "Founder",
        maxCycles: 2,
      }).state;
      const firstSubmit = submitAppReview(twoCycle, "2026-08-24T13:10:00.000Z").state;
      const secondRejection = applyAppReviewObservation(
        firstSubmit,
        {
          providerTimestamp: "2026-08-24T13:16:00.000Z",
          layers: [
            {
              layer: "app_version",
              rawValue: "REJECTED",
              providerObjectId: firstSubmit.currentCase.appVersion.providerObjectId,
              schemaId: "AppStoreVersion",
            },
            ...(firstSubmit.currentCase.reviewSubmission
              ? [
                  {
                    layer: "review_submission" as const,
                    rawValue: "UNRESOLVED_ISSUES",
                    providerObjectId: "rs-cycle-2",
                    schemaId: "ReviewSubmission" as const,
                  },
                ]
              : []),
          ],
          agreement: { rawStatus: "NONE", pending: false },
        },
        "2026-08-24T13:16:00.000Z",
      );
      assert(secondRejection.reason === "cycle_opened", "second rejection opens the next cycle");
      assert(secondRejection.state.currentCase.cycleNumber === 2, "cycle number increments");
      assert(secondRejection.state.currentCase.parentCaseId === firstSubmit.currentCase.caseId, "new case links the parent");
      assert(secondRejection.state.currentCase.resubmission?.status === "rejected_again", "prior submit is rejected_again");
      assert(secondRejection.state.currentCase.remediation === undefined, "new cycle does not keep the old plan");

      const accepted = applyAppReviewObservation(
        firstSubmit,
        {
          providerTimestamp: "2026-08-24T13:17:00.000Z",
          layers: [
            {
              layer: "app_version",
              rawValue: "READY_FOR_DISTRIBUTION",
              providerObjectId: firstSubmit.currentCase.appVersion.providerObjectId,
              schemaId: "AppStoreVersion",
            },
          ],
          agreement: { rawStatus: "NONE", pending: false },
        },
        "2026-08-24T13:17:00.000Z",
      );
      assert(accepted.reason === "review_accepted", "distribution state accepts the loop");
      assert(accepted.state.currentCase.resubmission?.status === "accepted", "resubmission is accepted");
      assert(accepted.state.currentCase.status === "closed", "accepted case closes");
      const pendingRelease = applyAppReviewObservation(
        firstSubmit,
        {
          providerTimestamp: "2026-08-24T13:18:00.000Z",
          layers: [
            {
              layer: "app_version",
              rawValue: "PENDING_DEVELOPER_RELEASE",
              providerObjectId: firstSubmit.currentCase.appVersion.providerObjectId,
              schemaId: "AppStoreVersion",
            },
          ],
          agreement: { rawStatus: "NONE", pending: false },
        },
        "2026-08-24T13:18:00.000Z",
      );
      assert(pendingRelease.state.currentCase.resubmission?.status === "accepted", "pending release still counts as accepted");
      assert(pendingRelease.state.currentCase.blocker === "pending_developer_release", "release still needs the founder");
      assert(pendingRelease.state.currentCase.status !== "closed", "pending developer release does not close the mandate");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  harness.check("Phase 4: in-flight reauthorize, tampered envelope, poll, and timestamp accept are refused", () => {
    const synthetic = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "app-review", "unresolved-synthetic.json"), "utf8"),
    ) as FixtureProviderPack;
    const metadataPack = withPack(synthetic, {
      snapshot: {
        ...synthetic.snapshot,
        layers: synthetic.snapshot.layers.map((layer) => (layer.layer === "app_version" ? { ...layer, rawValue: "METADATA_REJECTED" } : layer)),
      },
    });
    const dir = mkdtempSync(path.join(tmpdir(), "app-review-resubmit-guard-"));
    try {
      const listingPath = path.join(dir, "store/app-store-listing/APP_STORE_LISTING.md");
      mkdirSync(path.dirname(listingPath), { recursive: true });
      writeFileSync(listingPath, "# Canonical listing\n", "utf8");
      const verified = recordAppReviewVerification(
        applyAppReviewPlan(
          planAppReviewRemediation(
            startObserveMandate(mandateInput(), createFixtureProvider(metadataPack), "2026-08-24T13:00:00.000Z"),
            "2026-08-24T13:05:00.000Z",
            { workspaceRoot: dir },
          ).state,
          "2026-08-24T13:06:00.000Z",
          {
            workspaceRoot: dir,
            producerSessionId: "session-producer",
            metadataPreflight: { validatePassed: true, dryRunPassed: true, evidenceFingerprint: "d".repeat(64) },
          },
        ).state,
        "2026-08-24T13:07:00.000Z",
        { producerSessionId: "session-producer", verifierSessionId: "session-verifier", accepted: true },
      ).state;
      const authorized = authorizeAppReviewResubmit(verified, {
        alreadyUploaded: true,
        authorizedAt: "2026-08-24T13:08:00.000Z",
        authorizedBy: "Founder",
        maxCycles: 2,
      }).state;
      const submitted = submitAppReview(authorized, "2026-08-24T13:10:00.000Z").state;
      const reauthorized = authorizeAppReviewResubmit(submitted, {
        alreadyUploaded: true,
        authorizedAt: "2026-08-24T13:11:00.000Z",
        authorizedBy: "Founder",
      });
      assert(reauthorized.applied === false, "in-flight resubmit cannot be reauthorized");
      const timestampAccept = markAppReviewResubmitAccepted(submitted, "2026-08-24T13:11:00.000Z");
      assert(timestampAccept.applied === false, "accept without an accepted Apple layer is refused");

      const stored = submitted.currentCase.resubmission;
      assert(stored !== undefined, "submitted state has a resubmission");
      const tamperedCase = {
        ...submitted,
        currentCase: {
          ...submitted.currentCase,
          resubmission: {
            ...stored,
            envelope: { ...stored.envelope, maxCycles: 99 },
          },
        },
      };
      const tamperedSubmit = submitAppReview(tamperedCase, "2026-08-24T13:11:30.000Z");
      assert(tamperedSubmit.applied === false, "case envelope fingerprint drift refuses submit");
      const mandateEnvelope = submitted.mandate.resubmitEnvelope;
      assert(mandateEnvelope !== undefined, "resubmit mandate has an envelope");
      const driftedMandate = {
        ...authorized,
        mandate: {
          ...authorized.mandate,
          resubmitEnvelope: { ...mandateEnvelope, maxCycles: 99 },
        },
      };
      const driftedSubmit = submitAppReview(driftedMandate, "2026-08-24T13:11:45.000Z");
      assert(driftedSubmit.applied === false, "mandate envelope drift refuses submit");
      assert(envelopeFingerprint(stored.envelope) === stored.envelopeFingerprint, "stored fingerprint matches the envelope");
      const laterStamp = "2099-01-01T00:00:00.000Z";
      assert(envelopeFingerprint({ ...stored.envelope, authorizedAt: laterStamp }) !== stored.envelopeFingerprint, "authorizedAt is part of the fingerprint");
      const authorizedRecord = authorized.currentCase.resubmission;
      assert(authorizedRecord !== undefined, "authorized state has a resubmission");
      const timestampTampered = {
        ...authorized,
        currentCase: {
          ...authorized.currentCase,
          resubmission: {
            ...authorizedRecord,
            envelope: { ...authorizedRecord.envelope, authorizedAt: laterStamp },
          },
        },
      };
      const timestampSubmit = submitAppReview(timestampTampered, "2026-08-24T13:11:50.000Z");
      assert(timestampSubmit.applied === false, "case authorizedAt drift refuses submit");
      const mandateTimeDrift = {
        ...authorized,
        mandate: {
          ...authorized.mandate,
          resubmitEnvelope: { ...mandateEnvelope, authorizedAt: laterStamp },
        },
      };
      const mandateTimeSubmit = submitAppReview(mandateTimeDrift, "2026-08-24T13:11:55.000Z");
      assert(mandateTimeSubmit.applied === false, "mandate authorizedAt drift refuses submit");

      const rejectedPack = withPack(metadataPack, {
        snapshot: {
          providerTimestamp: "2026-08-24T13:16:00.000Z",
          layers: [
            {
              layer: "app_version",
              rawValue: "REJECTED",
              providerObjectId: submitted.currentCase.appVersion.providerObjectId,
              schemaId: "AppStoreVersion",
            },
            ...(submitted.currentCase.reviewSubmission
              ? [
                  {
                    layer: "review_submission" as const,
                    rawValue: "UNRESOLVED_ISSUES",
                    providerObjectId: "rs-cycle-2",
                    schemaId: "ReviewSubmission" as const,
                  },
                ]
              : []),
          ],
          agreement: { rawStatus: "NONE", pending: false },
        },
      });
      const polled = pollAppReview(submitted, createFixtureProvider(rejectedPack), "2026-08-24T13:16:00.000Z");
      assert(polled.currentCase.resubmission?.status === "rejected_again", "poll preserves the linked-cycle resubmission");
      assert(polled.currentCase.parentCaseId === submitted.currentCase.caseId, "poll keeps the parent case on the linked cycle");
      assert(polled.mandate.mode === "resubmit", "poll keeps resubmit mode");
      assert(polled.mandate.resubmitEnvelope !== undefined, "poll keeps the standing envelope");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

function plannedBinaryIdentity(state: AppReviewState): { bundleId: string; marketingVersion: string; buildNumber: string } {
  const patch = state.currentCase.remediation?.plan.patches.find((item) => item.relativePath.endsWith("Info.plist"));
  assert(patch !== undefined, "binary plan includes an Info.plist patch");
  const values = parseInfoPlistScalarsFromBytes(Buffer.from(patch!.contents, "utf8"));
  assert(Boolean(values.CFBundleIdentifier && values.CFBundleShortVersionString && values.CFBundleVersion), "planned plist has identity");
  return {
    bundleId: values.CFBundleIdentifier ?? "",
    marketingVersion: values.CFBundleShortVersionString ?? "",
    buildNumber: values.CFBundleVersion ?? "",
  };
}

function encodeBinaryPlist(values: Record<string, string>): Buffer {
  const keys = Object.keys(values);
  const objects: Buffer[] = [];
  const addAscii = (text: string): number => {
    const payload = Buffer.from(text, "ascii");
    if (payload.length > 255) throw new Error("fixture plist string is too long");
    const header = payload.length < 15 ? Buffer.from([0x50 | payload.length]) : Buffer.from([0x5f, 0x10, payload.length]);
    const index = objects.length;
    objects.push(Buffer.concat([header, payload]));
    return index;
  };
  const keyRefs = keys.map((key) => addAscii(key));
  const valueRefs = keys.map((key) => addAscii(values[key] ?? ""));
  if (keys.length >= 15) throw new Error("fixture plist has too many keys");
  const refs = Buffer.alloc(keys.length * 2);
  keyRefs.forEach((ref, index) => {
    refs[index] = ref;
  });
  valueRefs.forEach((ref, index) => {
    refs[keys.length + index] = ref;
  });
  const dictIndex = objects.length;
  objects.push(Buffer.concat([Buffer.from([0xd0 | keys.length]), refs]));
  const header = Buffer.from("bplist00", "ascii");
  const packed: Buffer[] = [header];
  const offsets: number[] = [];
  let cursor = 8;
  for (const object of objects) {
    offsets.push(cursor);
    packed.push(object);
    cursor += object.length;
  }
  const offsetTableOffset = cursor;
  const offsetIntSize = cursor < 256 ? 1 : 2;
  const offsetTable = Buffer.alloc(offsets.length * offsetIntSize);
  offsets.forEach((offset, index) => {
    if (offsetIntSize === 1) offsetTable[index] = offset;
    else offsetTable.writeUInt16BE(offset, index * 2);
  });
  packed.push(offsetTable);
  const trailer = Buffer.alloc(32);
  trailer[6] = offsetIntSize;
  trailer[7] = 1;
  trailer.writeBigUInt64BE(BigInt(objects.length), 8);
  trailer.writeBigUInt64BE(BigInt(dictIndex), 16);
  trailer.writeBigUInt64BE(BigInt(offsetTableOffset), 24);
  packed.push(trailer);
  return Buffer.concat(packed);
}

function writeFixtureArchive(
  root: string,
  relativeArchive: string,
  identity: { readonly bundleId: string; readonly marketingVersion: string; readonly buildNumber: string },
  options?: { readonly binary?: boolean },
): void {
  const infoPlistPath = path.join(root, relativeArchive, "Products/Applications/Fixture.app/Info.plist");
  mkdirSync(path.dirname(infoPlistPath), { recursive: true });
  const values = {
    CFBundleIdentifier: identity.bundleId,
    CFBundleShortVersionString: identity.marketingVersion,
    CFBundleVersion: identity.buildNumber,
  };
  if (options?.binary) {
    writeFileSync(infoPlistPath, encodeBinaryPlist(values));
    return;
  }
  writeFileSync(
    infoPlistPath,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<plist version="1.0"><dict>',
      `<key>CFBundleIdentifier</key><string>${identity.bundleId}</string>`,
      `<key>CFBundleShortVersionString</key><string>${identity.marketingVersion}</string>`,
      `<key>CFBundleVersion</key><string>${identity.buildNumber}</string>`,
      "</dict></plist>",
      "",
    ].join("\n"),
    "utf8",
  );
}
