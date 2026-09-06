/**
 * Layers Growth contribution package and adapter proofs (mandate proofs 7 and 8).
 *
 * Everything runs against a fake transport. `globalThis.fetch` throws for the whole suite, so a
 * live call would fail loudly instead of passing quietly. The asynchronous route proofs run in a
 * child process (the harness `check` callback is synchronous); the parent reads one PASS marker per
 * proof and turns each into its own row, so a missing marker fails the row that owns it.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { validateExtension } from "../../../contracts/extensions/contract.js";
import { catalogId } from "../../../catalog/ids.js";
import { loadSnapshotPacks } from "../../../catalog/packs/snapshots.js";
import { readSnapshotResource, snapshotPackage, type PackageSnapshot } from "../../../kernel/composition/resources.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { findUpstream } from "../../../kernel/contribution/upstreams-load.js";
import { OperationRouteRegistry } from "../../../kernel/session/operation-routes.js";
import type { NodeExecutionContext } from "../../../kernel/session/executor.js";
import {
  LAYERS_DELIVER_TOOL,
  LAYERS_IMPLEMENTATION_IDS,
  LAYERS_MCP_ENDPOINT,
  LAYERS_OPERATION_EFFECTS,
  LAYERS_OPERATION_IDS,
  LAYERS_ONBOARDING_CONTRACT,
  LAYERS_RECORDED_TOOLS,
  LAYERS_RENDER_TOOL,
  LAYERS_ROUTE_ARTIFACTS,
  LayersJobLedger,
  assertBriefMatchesIntent,
  assertWithinApprovedCredits,
  checkBinding,
  createFakeLayersTransport,
  createLayersRoutes,
  createLiveLayersTransportDescriptor,
  detectToolDrift,
  effectVectorFor,
  inspectRepositoryForOnboarding,
  isCompletedArtifact,
  isReviewed,
  quoteArgumentsDigest,
  renderArguments,
  requiredActionClass,
  verifyQuote,
  type FakeLayersScript,
  type LayersDraftCreativeInput,
  type LayersEvidence,
  type LayersJobOutput,
  type LayersQuote,
  type LayersRouteOptions,
} from "../../../adapters/providers/layers/index.js";
import { assert, repoRoot, skillRoot, type Harness } from "./_harness.js";

const PACKAGE_SOURCE = path.join(repoRoot, "examples/extensions/layers-growth");
const NOW = "2026-09-05T12:00:00.000Z";
const PROJECT = { projectId: "proj_public_123", environment: "production" };
const CONNECTION = { connection: "connection:layers", ...PROJECT };
const ARTIFACT_SHA = "9f2c1e4b7a6d5c3b2a1908f7e6d5c4b3a291807f6e5d4c3b2a1908f7e6d5c4b3";
const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");

/** A fake transport on the suite clock, so a quote it issues is fresh for the route that verifies it. */
const fake = (script: FakeLayersScript = {}) => createFakeLayersTransport({ now: () => NOW, ...script });

/** The executor compiles package schemas with strict Ajv (kernel/session/operation-routes.ts). Mirror that here. */
function strictValidator(directory: string, snapshot: PackageSnapshot, resourceId: string): (value: unknown) => boolean {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat("date-time", { type: "string", validate: (value: string) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) });
  const schema = JSON.parse(readSnapshotResource(directory, snapshot, resourceId).toString("utf8")) as AnySchema;
  const validate = ajv.compile(schema);
  return (value) => Boolean(validate(value));
}

function disableNetwork(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("layers.fixture_network_disabled");
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function installPackage(root: string): { directory: string; snapshot: PackageSnapshot; workspace: string } {
  const source = path.join(root, "source");
  cpSync(PACKAGE_SOURCE, source, { recursive: true });
  const workspace = path.join(root, "workspace");
  const store = path.join(workspace, ".b2c-launch/packages");
  const snapshot = snapshotPackage(source, store);
  return { directory: path.join(store, snapshot.digest.slice(7)), snapshot, workspace };
}

function walk(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    found.push(path.relative(root, full));
    if (entry.isDirectory()) found.push(...walk(full).map((child) => path.join(entry.name, child)));
  }
  return found;
}

function routeOptions(overrides: Partial<LayersRouteOptions> & Pick<LayersRouteOptions, "transport" | "ledger" | "packageDigest">): LayersRouteOptions {
  return {
    approvedMaxCredits: 200,
    binding: { providerProject: PROJECT, selectedConnection: CONNECTION },
    now: () => NOW,
    ...overrides,
  };
}

async function draftInput(transport: ReturnType<typeof createFakeLayersTransport>, personaId = "persona-1"): Promise<LayersDraftCreativeInput> {
  const brief = { productBriefId: "brief-1", format: "reaction_reel" as const, personaId };
  const quote = await transport.quote(LAYERS_RENDER_TOOL, renderArguments(brief));
  return { brief, quote };
}

async function rejects(action: () => Promise<unknown>, code: string, description: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.startsWith(code), `${description}: expected ${code}, got ${message}`);
    return;
  }
  throw new Error(`${description}: expected ${code}, but the call succeeded`);
}

function rejectsSync(action: () => unknown, code: string, description: string): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.startsWith(code), `${description}: expected ${code}, got ${message}`);
    return;
  }
  throw new Error(`${description}: expected ${code}, but the call succeeded`);
}

/* ------------------------------------------------------------------------------------------ */
/* Asynchronous route proofs (child process)                                                    */
/* ------------------------------------------------------------------------------------------ */

const PROOF_MARKERS = {
  lifecycle: "PASS layers lifecycle: running is not an artifact; a later completed read is; review precedes publication",
  reconcile: "PASS layers reconcile: an uncertain response is read back by jobRef and never replayed while the job exists",
  replayLimit: "PASS layers replay: one replay under the same key when no job exists, a second is refused",
  binding: "PASS layers binding: a mismatch blocks execute before any quote or call",
  wiring: "PASS layers wiring: routes register with the package digest, never call the delivery tool, refuse publish arguments",
  quoteGate: "PASS layers quote gate: changed arguments, a higher live price, and over-approval block the charged call",
  inputRead: "PASS layers input: the request file is read from the workspace and a symlink is refused",
} as const;

async function prove(): Promise<void> {
  const restore = disableNetwork();
  const root = path.join(process.env.LAYERS_PROOF_ROOT ?? path.join(process.cwd(), ".layers-proof"), "child");
  mkdirSync(root, { recursive: true });
  try {
    const installed = installPackage(root);
    const extension = installed.snapshot.extension;
    const artifact = { artifactId: "render-1", sha256: ARTIFACT_SHA, mimeType: "video/mp4" };

    // Lifecycle: running -> completed with artifact -> reviewed; publication needs a receipt and no route calls it.
    {
      const transport = fake({ quoteCredits: 120, responses: [{ state: "running" }] });
      const ledger = new LayersJobLedger({ now: () => NOW });
      const [draft, getJob, getResult] = createLayersRoutes(routeOptions({ transport, ledger, packageDigest: installed.snapshot.digest }));
      const input = await draftInput(transport);
      const first = await draft!.execute({ input, idempotencyKey: "key-lifecycle", knowledge: [] });
      const output = first.output as LayersJobOutput;
      const evidence = first.evidence as LayersEvidence;
      assert(output.state === "running" && output.jobRef === "job-1", `expected a running job-1, got ${JSON.stringify(output)}`);
      assert(
        evidence.observedState === "running" && evidence.transport === "fake" && evidence.quoteMaxCredits === 120 && evidence.creditsCharged === null,
        "evidence must record the running state and the fake transport",
      );
      const validOutput = strictValidator(installed.directory, installed.snapshot, "layers-growth/output");
      const validEvidence = strictValidator(installed.directory, installed.snapshot, "layers-growth/evidence");
      assert(validOutput(output) && validEvidence(evidence), "the route's real output and evidence must satisfy the package schemas under strict Ajv");
      assert(!isCompletedArtifact(ledger.get("key-lifecycle")), "a running job must not count as a completed artifact");
      assert(await draft!.observe({ input, output, evidence, idempotencyKey: "key-lifecycle" }), "observe must confirm a running job that still exists");
      await rejects(
        () => getResult!.execute({ input: { jobRef: "job-1" }, idempotencyKey: "key-result-early", knowledge: [] }),
        "layers.result_not_ready",
        "get-result on a running job",
      );
      transport.setJob("job-1", { state: "completed", artifact, creditsCharged: 110 });
      const status = (await getJob!.execute({ input: { jobRef: "job-1" }, idempotencyKey: "key-status", knowledge: [] })).output as LayersJobOutput;
      assert(
        status.state === "completed" && status.artifact?.sha256 === ARTIFACT_SHA && status.creditsCharged === 110,
        "get-job must report the completed artifact",
      );
      assert(isCompletedArtifact(ledger.get("key-lifecycle")), "the ledger entry must become a completed artifact after the readback");
      const result = (await getResult!.execute({ input: { jobRef: "job-1" }, idempotencyKey: "key-result", knowledge: [] })).output as LayersJobOutput;
      assert(result.artifact?.sha256 === ARTIFACT_SHA, "get-result must return the artifact");
      assert(
        await draft!.observe({ input, output, evidence, idempotencyKey: "key-lifecycle" }),
        "progress from running to completed is consistent with the recorded output",
      );
      const tampered = { ...output, state: "completed" as const, artifact: { ...artifact, sha256: "0".repeat(64) } };
      assert(
        !(await draft!.observe({ input, output: tampered, evidence, idempotencyKey: "key-lifecycle" })),
        "a claimed artifact that differs from the readback must not verify",
      );
      assert(
        (await draft!.execute({ input, idempotencyKey: "key-lifecycle", knowledge: [] })).output !== undefined && transport.calls.length === 1,
        "a repeated key reuses the ledger entry instead of charging again",
      );
      assert(!isReviewed(ledger.get("key-lifecycle")), "a completed artifact is not reviewed until an independent reviewer marks it");
      ledger.markReviewed("key-lifecycle", { reviewer: "reviewer-session", reviewedAt: NOW });
      assert(isReviewed(ledger.get("key-lifecycle")), "markReviewed must move the entry to reviewed");
      rejectsSync(
        () => ledger.markPublished("key-lifecycle", { channel: "", receiptId: "", publishedAt: NOW, authorizedBy: "" }),
        "layers.publication_receipt_required",
        "publication without a complete receipt",
      );
      assert(ledger.get("key-lifecycle")?.state === "reviewed", "a refused publication leaves the entry reviewed");
      assert(!transport.calledTools.includes(LAYERS_DELIVER_TOOL), "the routes must never call the delivery tool");
      console.log(PROOF_MARKERS.lifecycle);
    }

    // Reconcile: uncertain with an existing job -> readJob, no second call.
    {
      const transport = fake({ quoteCredits: 90, responses: [{ state: "uncertain", job: { state: "running" } }] });
      const ledger = new LayersJobLedger({ now: () => NOW });
      const [draft] = createLayersRoutes(routeOptions({ transport, ledger, packageDigest: installed.snapshot.digest }));
      const input = await draftInput(transport);
      await rejects(
        () => draft!.execute({ input, idempotencyKey: "key-uncertain", knowledge: [] }),
        "layers.job_uncertain_requires_readback",
        "the first uncertain response",
      );
      assert(transport.calls.length === 1 && ledger.get("key-uncertain")?.state === "uncertain", "the uncertain response must be recorded once");
      const second = await draft!.execute({ input, idempotencyKey: "key-uncertain", knowledge: [] });
      assert((second.output as LayersJobOutput).state === "running", "reconciliation must return the state the readback found");
      assert(transport.calls.length === 1, `reconciliation must not call again while the job exists (calls: ${transport.calls.length})`);
      assert(transport.reads.includes("job-1"), "reconciliation must read the job by its reference");
      assert(
        ledger.get("key-uncertain")?.history.some((event) => event.event === "reconciled"),
        "the ledger must record the reconciliation",
      );
      console.log(PROOF_MARKERS.reconcile);
    }

    // Replay limit: uncertain with no job -> one replay under the same key, then refusal.
    {
      const transport = fake({ quoteCredits: 90, responses: [{ state: "uncertain", job: null }] });
      const ledger = new LayersJobLedger({ now: () => NOW });
      const [draft] = createLayersRoutes(routeOptions({ transport, ledger, packageDigest: installed.snapshot.digest }));
      const input = await draftInput(transport);
      await rejects(() => draft!.execute({ input, idempotencyKey: "key-replay", knowledge: [] }), "layers.job_uncertain_requires_readback", "first uncertain");
      await rejects(
        () => draft!.execute({ input, idempotencyKey: "key-replay", knowledge: [] }),
        "layers.job_uncertain_requires_readback",
        "replayed uncertain",
      );
      assert(transport.calls.length === 2, `exactly one replay is allowed (calls: ${transport.calls.length})`);
      assert(
        transport.calls.every((call) => call.idempotencyKey === "key-replay"),
        "the replay must reuse the same idempotency key",
      );
      await rejects(() => draft!.execute({ input, idempotencyKey: "key-replay", knowledge: [] }), "layers.replay_limit", "a second replay");
      assert(transport.calls.length === 2, "the refused replay must not reach the transport");
      assert(ledger.get("key-replay")?.replays === 1 && ledger.get("key-replay")?.calls === 2, "the ledger must count one replay and two calls");
      console.log(PROOF_MARKERS.replayLimit);
    }

    // Binding: a mismatch blocks before any quote or call.
    {
      const cases: Array<[string, LayersRouteOptions["binding"]]> = [
        ["layers.binding_mismatch", { providerProject: { ...PROJECT, projectId: "proj_other" }, selectedConnection: CONNECTION }],
        ["layers.environment_mismatch", { providerProject: { ...PROJECT, environment: "staging" }, selectedConnection: CONNECTION }],
        ["layers.binding_missing", { providerProject: undefined, selectedConnection: CONNECTION }],
        ["layers.binding_missing", { providerProject: PROJECT, selectedConnection: undefined }],
      ];
      for (const [code, binding] of cases) {
        const transport = fake({ quoteCredits: 50 });
        const ledger = new LayersJobLedger({ now: () => NOW });
        const [draft, getJob] = createLayersRoutes(routeOptions({ transport, ledger, packageDigest: installed.snapshot.digest, binding }));
        const input = await draftInput(fake({ quoteCredits: 50 }));
        await rejects(() => draft!.execute({ input, idempotencyKey: "key-binding", knowledge: [] }), code, `draft with ${code}`);
        await rejects(() => getJob!.execute({ input: { jobRef: "job-1" }, idempotencyKey: "key-binding-read", knowledge: [] }), code, `read with ${code}`);
        assert(
          transport.quotes.length === 0 && transport.calls.length === 0 && transport.reads.length === 0,
          `${code} must block before any transport interaction`,
        );
        assert(ledger.entries().length === 0, `${code} must leave the ledger empty`);
      }
      console.log(PROOF_MARKERS.binding);
    }

    // Wiring: registry accepts the routes with the package digest; publish arguments are refused; delivery never called.
    {
      const transport = fake({ quoteCredits: 100 });
      const ledger = new LayersJobLedger({ now: () => NOW });
      const routes = createLayersRoutes(routeOptions({ transport, ledger, packageDigest: installed.snapshot.digest }));
      new OperationRouteRegistry(routes);
      const declaredOperations = new Set(extension.capabilities.flatMap((capability) => capability.operations.map((operation) => operation.id)));
      const declaredImplementations = new Map(extension.implementations.map((implementation) => [implementation.id, implementation.operation]));
      for (const route of routes) {
        assert(route.packageDigest === installed.snapshot.digest, "each route must carry the package digest");
        assert(declaredOperations.has(route.operation), `route operation ${route.operation} is not declared by the package`);
        assert(
          declaredImplementations.get(route.implementationId) === route.operation,
          `route implementation ${route.implementationId} does not cover ${route.operation}`,
        );
      }
      const input = await draftInput(transport);
      await rejects(
        () => routes[0]!.execute({ input: { ...input, publish: true }, idempotencyKey: "key-publish", knowledge: [] }),
        "layers.publish_not_supported",
        "top-level publish argument",
      );
      await rejects(
        () => routes[0]!.execute({ input: { ...input, brief: { ...input.brief, deliver: "inbox" } }, idempotencyKey: "key-deliver", knowledge: [] }),
        "layers.publish_not_supported",
        "nested deliver argument",
      );
      await rejects(
        () => routes[1]!.execute({ input: { jobRef: "job-1", publish: true }, idempotencyKey: "key-publish-read", knowledge: [] }),
        "layers.publish_not_supported",
        "publish on a read",
      );
      assert(transport.calls.length === 0, "a refused publish argument must not reach the transport");
      const accepted = await routes[0]!.execute({ input, idempotencyKey: "key-wiring", knowledge: [] });
      assert((accepted.output as LayersJobOutput).state === "accepted", "a plain draft request is accepted");
      assert(
        transport.calledTools.length === 1 && transport.calledTools[0] === LAYERS_RENDER_TOOL,
        `only render_content may be called, got ${transport.calledTools.join(",")}`,
      );
      assert(!transport.calledTools.includes(LAYERS_DELIVER_TOOL), "the delivery tool must never be called");
      console.log(PROOF_MARKERS.wiring);
    }

    // Quote gate inside the route: mismatch, higher live price, over-approval.
    {
      const transport = fake({ quoteCredits: 100 });
      const ledger = new LayersJobLedger({ now: () => NOW });
      const [draft] = createLayersRoutes(routeOptions({ transport, ledger, packageDigest: installed.snapshot.digest, approvedMaxCredits: 150 }));
      const input = await draftInput(transport);
      const changed = { ...input, brief: { ...input.brief, format: "slideshow" as const } };
      await rejects(
        () => draft!.execute({ input: changed, idempotencyKey: "key-quote-1", knowledge: [] }),
        "layers.quote_mismatch",
        "a quote for other arguments",
      );
      assert(transport.calls.length === 0, "a mismatched quote must block before the call");
      const pricier = fake({ quoteCredits: 140 });
      const [draftPricier] = createLayersRoutes(
        routeOptions({ transport: pricier, ledger, packageDigest: installed.snapshot.digest, approvedMaxCredits: 150 }),
      );
      await rejects(
        () => draftPricier!.execute({ input, idempotencyKey: "key-quote-2", knowledge: [] }),
        "layers.quote_exceeds_approval",
        "a live quote above the authorized quote",
      );
      assert(pricier.quotes.length === 1 && pricier.calls.length === 0, "the live quote is taken, the call is not");
      const [draftTight] = createLayersRoutes(routeOptions({ transport, ledger, packageDigest: installed.snapshot.digest, approvedMaxCredits: 80 }));
      await rejects(
        () => draftTight!.execute({ input, idempotencyKey: "key-quote-3", knowledge: [] }),
        "layers.quote_exceeds_approval",
        "a quote above the approved credits",
      );
      assert(transport.calls.length === 0 && ledger.entries().length === 0, "no charged call and no ledger entry after refused quotes");
      console.log(PROOF_MARKERS.quoteGate);
    }

    // input(): the request file is read from the workspace; a symlink is refused.
    {
      const transport = fake({ quoteCredits: 100 });
      const ledger = new LayersJobLedger({ now: () => NOW });
      const [draft] = createLayersRoutes(routeOptions({ transport, ledger, packageDigest: installed.snapshot.digest }));
      const workspaceDir = path.join(root, "input-workspace");
      mkdirSync(path.join(workspaceDir, "growth/layers"), { recursive: true });
      const context = { workspaceDir } as NodeExecutionContext;
      rejectsSync(() => draft!.input(context), "layers.request_missing", "a missing request file");
      const input = await draftInput(transport);
      writeFileSync(path.join(workspaceDir, "growth/layers/draft-request.json"), JSON.stringify(input));
      const read = draft!.input(context) as LayersDraftCreativeInput;
      assert(
        read.brief.productBriefId === "brief-1" && read.quote.forArgumentsSha256 === input.quote.forArgumentsSha256,
        "input() must return the workspace request",
      );
      const linked = path.join(root, "linked-workspace");
      mkdirSync(path.join(linked, "growth/layers"), { recursive: true });
      symlinkSync(path.join(workspaceDir, "growth/layers/draft-request.json"), path.join(linked, "growth/layers/draft-request.json"));
      rejectsSync(() => draft!.input({ workspaceDir: linked } as NodeExecutionContext), "layers.request_not_regular", "a symlinked request file");
      console.log(PROOF_MARKERS.inputRead);
    }
  } finally {
    restore();
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Suite                                                                                        */
/* ------------------------------------------------------------------------------------------ */

export function register(harness: Harness): void {
  const restore = disableNetwork();
  try {
    harness.check("layers: package validates, snapshots, resolves its recipe, and its notice equals the verified upstream license", () => {
      const parsed = parseYaml(readFileSync(path.join(PACKAGE_SOURCE, "extension.yaml"), "utf8")) as unknown;
      const extension = validateExtension(parsed);
      assert(extension.id === "layers-growth/package" && extension.providers?.[0]?.id === "layers-growth/layers", "package and provider ids");
      const installed = installPackage(harness.makeTempDir("layers-package"));
      const resolved = resolveRecipeBindings({
        packages: [{ directory: installed.directory, snapshot: installed.snapshot }],
        recipe: { packageId: "layers-growth/package", packageVersion: "1.0.0", recipeId: "layers-growth/draft-loop" },
        target: { platform: "host", runtime: "node22" },
      });
      assert(resolved.status === "resolved", `recipe did not resolve: ${resolved.reasonCodes.join(",")}`);
      const bound = resolved.bindings
        .filter((binding) => binding.status === "bound")
        .map((binding) => binding.operation)
        .sort();
      assert(bound.join(",") === Object.values(LAYERS_OPERATION_IDS).sort().join(","), `bound operations: ${bound.join(",")}`);
      for (const binding of resolved.bindings) {
        assert(binding.implementation?.mode === "host-tool", `${binding.operation} must bind a host-tool implementation`);
        assert(
          binding.resources.some((resource) => resource.kind === "knowledge" && resource.id === "layers-growth/integration"),
          `${binding.operation} must carry the integration knowledge`,
        );
        assert(binding.readiness.observedProof === "unknown" && binding.readiness.executionRoute === "unknown", "resolution must not claim proof or a route");
      }
      const draftContract = resolved.bindings.find((binding) => binding.operation === LAYERS_OPERATION_IDS.draftCreative)?.operationContract;
      assert(draftContract?.effect === "spend", "draft-creative must declare the spend effect");
      const declaredImplementations = extension.implementations.map((implementation) => implementation.id).sort();
      assert(
        declaredImplementations.join(",") === Object.values(LAYERS_IMPLEMENTATION_IDS).sort().join(","),
        `adapter implementation ids ${Object.values(LAYERS_IMPLEMENTATION_IDS).join(",")} must equal the package's ${declaredImplementations.join(",")}`,
      );
      const notice = extension.thirdParty?.[0];
      assert(
        notice?.notice === "layers-growth/notice-layers-mcp" && notice.covers.includes("layers-growth/integration"),
        "the third-party notice must cover the integration notes",
      );
      const noticeBytes = readSnapshotResource(installed.directory, installed.snapshot, notice.notice);
      const upstream = findUpstream(skillRoot, "layers-growth-mcp");
      assert(upstream?.manifest.license.evidenceSha256 !== undefined, "the layers-growth-mcp upstream manifest must record the license evidence digest");
      assert(sha256(noticeBytes) === upstream.manifest.license.evidenceSha256, "the package notice must be byte-identical to the verified upstream license");
      assert(
        upstream.notice !== undefined && upstream.notice.text === noticeBytes.toString("utf8"),
        "the package notice must equal the retained catalog notice",
      );
      assert(noticeBytes.toString("utf8").includes("Copyright (c) 2026 Layers"), "the notice keeps the original author's copyright line");
    });

    harness.check("layers: the pack declares the spend and observe contracts the routes implement", () => {
      const installed = installPackage(harness.makeTempDir("layers-pack"));
      const packs = loadSnapshotPacks([{ directory: installed.directory, snapshot: installed.snapshot }]);
      const pack = packs.find((entry) => entry.id === "business-pack.layers-growth");
      assert(pack !== undefined && pack.createsProviderSpend, "the pack must declare provider spend");
      const byId = new Map(pack.workflows.map((workflow) => [workflow.id, workflow]));
      const draft = byId.get("workflow.layers-growth-draft-creative");
      assert(
        draft?.actionClass === "spend" && draft.protectedCategory === "spend" && draft.idempotent === false,
        "the draft workflow is protected spend and not idempotent",
      );
      assert(
        draft.costEstimate?.currency === "credits" &&
          draft.costEstimate.amount === LAYERS_OPERATION_EFFECTS[LAYERS_OPERATION_IDS.draftCreative].credits?.estimate,
        "the static estimate equals the documented ceiling",
      );
      assert(draft.domainId === "domain.growth", "draft creative belongs to the growth domain");
      for (const id of ["workflow.layers-growth-get-job", "workflow.layers-growth-get-result"]) {
        const workflow = byId.get(id as `workflow.${string}`);
        assert(
          workflow?.actionClass === "observe" && workflow.protectedCategory === undefined && workflow.costEstimate === undefined,
          `${id} must be a free observe`,
        );
      }
      const artifactIds = new Set(pack.workflows.flatMap((workflow) => workflow.outputPaths.map((outputPath) => catalogId("artifact", outputPath))));
      for (const id of Object.values(LAYERS_ROUTE_ARTIFACTS)) assert(artifactIds.has(id), `route artifact ${id} is not produced by a pack workflow`);
      for (const workflow of pack.workflows)
        assert(workflow.roleId === "role.layers-growth" && !/publish|deliver/u.test(workflow.actionClass), `${workflow.id} role and class`);
    });

    harness.check(
      "layers: the package schemas compile under the executor's strict Ajv and reject a publish argument, a foreign unit, and a pending artifact claim",
      () => {
        const installed = installPackage(harness.makeTempDir("layers-schemas"));
        const validInput = strictValidator(installed.directory, installed.snapshot, "layers-growth/draft-input");
        const validRead = strictValidator(installed.directory, installed.snapshot, "layers-growth/read-input");
        const validOutput = strictValidator(installed.directory, installed.snapshot, "layers-growth/output");
        const validEvidence = strictValidator(installed.directory, installed.snapshot, "layers-growth/evidence");
        const args = renderArguments({ productBriefId: "brief-1", format: "reaction_reel" });
        const quote: LayersQuote = { maxCredits: 100, unit: "credits", forArgumentsSha256: quoteArgumentsDigest(args), quotedAt: NOW };
        const input = { brief: { productBriefId: "brief-1", format: "reaction_reel" }, quote };
        assert(validInput(input), "a brief plus a credit quote is a valid draft input");
        assert(!validInput({ ...input, publish: true }), "the input schema must reject a publish argument");
        assert(!validInput({ ...input, quote: { ...quote, unit: "usd" } }), "the input schema must reject a non-credit unit");
        assert(!validInput({ ...input, brief: { ...input.brief, format: "livestream" } }), "the input schema must reject an unknown format");
        assert(validRead({ jobRef: "job-1" }) && !validRead({ jobRef: "job-1", deliver: true }), "the read schema accepts a job reference only");
        assert(validOutput({ jobRef: "job-1", state: "running" }), "a running job without an artifact is a valid output");
        assert(!validOutput({ jobRef: "job-1", state: "published" }), "published is not a provider job state");
        assert(
          !validOutput({ jobRef: "job-1", state: "completed", artifact: { artifactId: "a", sha256: "not-a-hash", mimeType: "video/mp4" } }),
          "an artifact needs a sha256",
        );
        const evidence = {
          providerId: "layers-growth/layers",
          jobRef: "job-1",
          observedState: "running",
          quoteMaxCredits: 100,
          creditsCharged: null,
          transport: "fake",
          observedAt: NOW,
        };
        assert(validEvidence(evidence), "route evidence with an unknown charge validates");
        assert(
          !validEvidence({ ...evidence, transport: "recorded" }) && !validEvidence({ ...evidence, providerId: "other/provider" }),
          "evidence names the transport and the provider exactly",
        );
      },
    );

    harness.check("layers: contribution inspection touches no onboarding surface and the builder repository is not onboarded", () => {
      const repository = inspectRepositoryForOnboarding(repoRoot);
      assert(!repository.present && repository.files.length === 0, `builder repository reports onboarding files: ${repository.files.join(",")}`);
      assert(
        !existsSync(path.join(PACKAGE_SOURCE, ".layers")) && !existsSync(path.join(PACKAGE_SOURCE, ".mcp.json")),
        "the package source carries no onboarding files",
      );
      const root = harness.makeTempDir("layers-inspection");
      const installed = installPackage(root);
      resolveRecipeBindings({
        packages: [{ directory: installed.directory, snapshot: installed.snapshot }],
        recipe: { packageId: "layers-growth/package", packageVersion: "1.0.0", recipeId: "layers-growth/draft-loop" },
        target: { platform: "host", runtime: "node22" },
      });
      loadSnapshotPacks([{ directory: installed.directory, snapshot: installed.snapshot }]);
      const created = walk(root);
      assert(
        !created.some(
          (entry) =>
            entry.split(path.sep).includes(".layers") || path.basename(entry) === ".mcp.json" || entry.endsWith(path.join("skills", "layers", "SKILL.md")),
        ),
        `inspection created onboarding files: ${created.join(",")}`,
      );
      assert(
        !inspectRepositoryForOnboarding(installed.workspace).present && !inspectRepositoryForOnboarding(path.join(root, "source")).present,
        "neither the workspace nor the copied source is onboarded",
      );
      const onboarded = harness.makeTempDir("layers-onboarded");
      mkdirSync(path.join(onboarded, ".layers"));
      writeFileSync(path.join(onboarded, ".layers/project.json"), JSON.stringify({ projectId: "proj_public_123", environment: "production" }));
      assert(inspectRepositoryForOnboarding(onboarded).files.join(",") === ".layers/project.json", "the detector must see a project file");
      const configured = harness.makeTempDir("layers-mcp-config");
      writeFileSync(path.join(configured, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "other-tool" } } }));
      assert(!inspectRepositoryForOnboarding(configured).present, "an .mcp.json without a layers server is not onboarding");
      writeFileSync(path.join(configured, ".mcp.json"), JSON.stringify({ mcpServers: { growth: { command: "/usr/local/bin/layers", args: ["mcp"] } } }));
      assert(inspectRepositoryForOnboarding(configured).present, "an .mcp.json that runs the layers proxy is onboarding");
      assert(
        LAYERS_ONBOARDING_CONTRACT.runsWhen === "separately authorized business adoption only" &&
          LAYERS_ONBOARDING_CONTRACT.neverRunsDuring.includes("contribution inspection"),
        "the contract names when setup runs",
      );
    });

    harness.check("layers: quotes are verified for exact arguments, unit, freshness, and approved credits", () => {
      const args = renderArguments({ productBriefId: "brief-1", format: "still_ad" });
      const quote: LayersQuote = { maxCredits: 100, unit: "credits", forArgumentsSha256: quoteArgumentsDigest(args), quotedAt: NOW };
      const options = { now: "2026-09-05T12:05:00.000Z", maxAgeMs: 15 * 60 * 1000 };
      verifyQuote(quote, args, options);
      verifyQuote(quote, { mode: "draft", format: "still_ad", productBriefId: "brief-1" }, options);
      rejectsSync(
        () => verifyQuote(quote, renderArguments({ productBriefId: "brief-2", format: "still_ad" }), options),
        "layers.quote_mismatch",
        "different arguments",
      );
      rejectsSync(() => verifyQuote(quote, args, { ...options, now: "2026-09-05T12:16:00.000Z" }), "layers.quote_stale", "an old quote");
      rejectsSync(() => verifyQuote(quote, args, { ...options, now: "2026-09-05T11:59:00.000Z" }), "layers.quote_stale", "a quote from the future");
      rejectsSync(() => verifyQuote({ ...quote, unit: "usd" as "credits" }, args, options), "layers.quote_unit_invalid", "a non-credit unit");
      rejectsSync(() => verifyQuote({ ...quote, maxCredits: 12.5 }, args, options), "layers.quote_invalid_amount", "a fractional credit amount");
      assertWithinApprovedCredits({ maxCredits: 100 }, 100);
      rejectsSync(() => assertWithinApprovedCredits({ maxCredits: 400 }, 100), "layers.quote_exceeds_approval", "400 credits against a 100 credit approval");
      rejectsSync(() => assertWithinApprovedCredits({ maxCredits: 1 }, Number.NaN), "layers.quote_exceeds_approval", "an unparseable approval");
    });

    harness.check("layers: effect vectors fold into the existing action classes", () => {
      const draft = LAYERS_OPERATION_EFFECTS[LAYERS_OPERATION_IDS.draftCreative];
      assert(
        requiredActionClass(draft) === "spend" && draft.remoteState && !draft.publication && draft.disclosure.includes("product brief"),
        "draft-creative is spend with remote state and disclosure",
      );
      assert(effectVectorFor(LAYERS_OPERATION_IDS.draftCreative, { maxCredits: 75 }).credits?.estimate === 75, "a quote replaces the documented ceiling");
      for (const id of [LAYERS_OPERATION_IDS.getJob, LAYERS_OPERATION_IDS.getResult]) {
        const vector = LAYERS_OPERATION_EFFECTS[id];
        assert(requiredActionClass(vector) === "observe" && vector.credits === null && !vector.remoteState, `${id} is a free observe`);
        assert(effectVectorFor(id, { maxCredits: 75 }).credits === null, `${id} never gains a credit estimate from a quote`);
      }
      assert(requiredActionClass({ ...draft, credits: null, publication: true }) === "publish", "publication without credits is publish");
      assert(requiredActionClass({ ...draft, credits: null, configurationChange: true }) === "mutate", "a configuration change is mutate");
      assert(requiredActionClass({ ...draft, publication: true }) === "spend", "credits win over publication");
    });

    harness.check("layers: binding reconciliation and brief-intent checks", () => {
      assert(checkBinding(PROJECT, CONNECTION).ok, "matching project and environment bind");
      const mismatch = checkBinding({ ...PROJECT, projectId: "proj_other" }, CONNECTION);
      assert(!mismatch.ok && mismatch.reason === "layers.binding_mismatch", "a different project id is a mismatch");
      const environment = checkBinding({ ...PROJECT, environment: "staging" }, CONNECTION);
      assert(!environment.ok && environment.reason === "layers.environment_mismatch", "a different environment is an environment mismatch");
      const missing = checkBinding(undefined, CONNECTION);
      assert(!missing.ok && missing.reason === "layers.binding_missing", "no provider project is missing");
      const blank = checkBinding(PROJECT, { ...CONNECTION, connection: " " });
      assert(!blank.ok && blank.reason === "layers.binding_missing", "a blank connection id is missing");
      assertBriefMatchesIntent("Tuck helps busy parents plan calm bedtimes. It is an iOS app.", { promise: "helps busy parents plan calm bedtimes" });
      assertBriefMatchesIntent("Tuck: helps busy parents plan calm bedtimes!", { promise: "Helps busy parents plan calm bedtimes.", audience: "busy parents" });
      rejectsSync(
        () => assertBriefMatchesIntent("A generic growth app for everyone.", { promise: "helps busy parents plan calm bedtimes" }),
        "layers.brief_intent_mismatch",
        "a drifted brief",
      );
      rejectsSync(
        () => assertBriefMatchesIntent("Helps busy parents plan calm bedtimes.", { promise: "helps busy parents plan calm bedtimes", audience: "teachers" }),
        "layers.brief_intent_mismatch",
        "a brief that lost the audience",
      );
    });

    harness.check("layers: tool drift is reported against the recorded inventory and unknown billing stays unknown", () => {
      const render = LAYERS_RECORDED_TOOLS.find((tool) => tool.name === LAYERS_RENDER_TOOL);
      assert(render?.charged === true, "render_content is recorded as charged");
      assert(
        LAYERS_RECORDED_TOOLS.some((tool) => tool.charged === "unknown"),
        "tools without documented billing stay unknown",
      );
      const live = [...LAYERS_RECORDED_TOOLS.filter((tool) => tool.name !== "halt"), { name: "publish_everywhere", charged: "unknown" as const }].map((tool) =>
        tool.name === "generate_tracking_link" ? { ...tool, charged: true } : tool,
      );
      const drift = detectToolDrift(live);
      assert(
        drift.missing.join(",") === "halt" && drift.added.join(",") === "publish_everywhere" && drift.billingChanged.join(",") === "generate_tracking_link",
        `drift: ${JSON.stringify(drift)}`,
      );
      const unchanged = detectToolDrift(LAYERS_RECORDED_TOOLS.map((tool) => ({ name: tool.name, charged: "unknown" as const })));
      assert(
        unchanged.billingChanged.length === 0 && unchanged.missing.length === 0 && unchanged.added.length === 0,
        "unknown live billing never counts as a change",
      );
      const descriptor = createLiveLayersTransportDescriptor();
      assert(
        descriptor.endpoint === LAYERS_MCP_ENDPOINT && descriptor.implemented === false && !("call" in descriptor),
        "the live transport is a descriptor, not a client",
      );
    });

    harness.check("layers: the ledger round-trips through a file and refuses a symlinked destination", () => {
      const dir = harness.makeTempDir("layers-ledger");
      const ledger = new LayersJobLedger({ now: () => NOW });
      const args = renderArguments({ productBriefId: "brief-1", format: "remix" });
      const quote: LayersQuote = { maxCredits: 60, unit: "credits", forArgumentsSha256: quoteArgumentsDigest(args), quotedAt: NOW };
      ledger.record("key-file", { operation: LAYERS_OPERATION_IDS.draftCreative, tool: LAYERS_RENDER_TOOL, args }, quote, {
        jobRef: "job-9",
        state: "accepted",
      });
      const file = path.join(dir, "ledger/jobs.json");
      ledger.save(file);
      const loaded = LayersJobLedger.load(file, { now: () => NOW });
      assert(loaded.get("key-file")?.jobRef === "job-9" && loaded.get("key-file")?.calls === 1, "the saved entry loads back");
      assert(loaded.byJobRef("job-9")?.idempotencyKey === "key-file", "lookup by job reference works after load");
      const link = path.join(dir, "linked.json");
      symlinkSync(file, link);
      rejectsSync(() => ledger.save(link), "layers.ledger_symlink_refused", "saving through a symlink");
      rejectsSync(
        () => ledger.markReviewed("key-file", { reviewer: "r", reviewedAt: NOW }),
        "layers.review_requires_completed_artifact",
        "reviewing an accepted job",
      );
      rejectsSync(
        () => ledger.markPublished("key-file", { channel: "tiktok", receiptId: "r-1", publishedAt: NOW, authorizedBy: "founder" }),
        "layers.publish_requires_review",
        "publishing an unreviewed job",
      );
    });

    harness.check("layers: every fixture path refuses network access", () => {
      rejectsSync(() => globalThis.fetch("https://mcp.layers.invalid/mcp"), "layers.fixture_network_disabled", "fetch inside the suite");
    });
  } finally {
    restore();
  }

  const proofRoot = harness.makeTempDir("layers-proof");
  const proof = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--prove"], {
    cwd: skillRoot,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, LAYERS_PROOF_ROOT: proofRoot },
  });
  const proofOutput = `${proof.stdout}\n${proof.stderr}`;
  for (const [key, marker] of Object.entries(PROOF_MARKERS)) {
    harness.check(`layers proof ${key}: ${marker.slice("PASS ".length)}`, () => {
      assert(proof.stdout.includes(marker), `marker missing (exit ${proof.status})\n${proofOutput.trim().slice(-2000)}`);
    });
  }
  harness.check("layers proof process: the child exits cleanly after every proof", () => {
    assert(proof.status === 0, `exit ${proof.status}\n${proofOutput.trim().slice(-2000)}`);
  });
}

if (process.argv.includes("--prove") && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prove();
