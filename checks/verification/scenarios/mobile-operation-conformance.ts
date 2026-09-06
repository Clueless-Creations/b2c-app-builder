import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { stringify } from "yaml";
import {
  MOBILE_OPERATION_IDS,
  mobileRequestSchema,
  mobileResultSchema,
  mobileObservationSchema,
  requireMobileSupport,
  normalizeMobileObservation,
  type MobileObservation,
  type MobileRequest,
  type MobileSupport,
  type MobileTarget,
} from "../../../contracts/mobile-operation.js";
import { createMobileOperationRoute, type MobileOperationTransport } from "../../../adapters/mobile-operation.js";
import type { Extension } from "../../../contracts/extensions/contract.js";
import { snapshotPackage } from "../../../kernel/composition/resources.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { bindCatalogOperations } from "../../../kernel/composition/compile-bindings.js";
import { compilePlan, type CatalogInput } from "../../../kernel/engine/compile.js";
import { OperationRouteRegistry } from "../../../kernel/session/operation-routes.js";
import { createCliExecutor, createCliVerifier, type NodeExecutionContext } from "../../../kernel/session/executor.js";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Harness } from "../fixtures/_harness.js";

export function register(harness: Harness): void {
  harness.check("mobile operations share selected routes and separate raw provenance from acceptance", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url)], { encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS mobile operation conformance/);
  });
}
async function proveMobileOperations(): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), "b2c-mobile-conformance-"));
  try {
    const now = new Date();
    const time = now.toISOString();
    const target: MobileTarget = {
      platform: "ios",
      deviceKind: "simulator",
      deviceId: "fixture-device",
      osVersion: "fixture-os",
      locale: "en-US",
      appId: "fixture.app",
      buildId: "fixture-build",
      artifactSha256: "a".repeat(64),
    };
    const source = path.join(root, "package");
    mkdirSync(source);
    for (const [id, schema] of [
      ["input", mobileRequestSchema],
      ["output", mobileResultSchema],
      ["evidence", mobileObservationSchema],
    ] as const)
      writeFileSync(path.join(source, `${id}.json`), JSON.stringify(z.toJSONSchema(schema)));
    const slug = (op: string) => op.split(".").at(-1)!;
    const impl = (provider: string, op: string) => `b2c/${provider}-${slug(op)}`;
    const definition: Extension = {
      apiVersion: "b2c.extension/v1",
      id: "b2c/mobile-conformance",
      version: "1.0.0",
      hostApiVersion: "b2c/v1",
      title: "Synthetic mobile transport conformance",
      dependencies: [],
      imports: [],
      resources: ["input", "output", "evidence"].map((id) => ({ id: `b2c/mobile-${id}`, path: `${id}.json`, kind: "schema", mediaType: "application/json" })),
      capabilities: [
        {
          id: "b2c/mobile-app-operation",
          version: "1.0.0",
          title: "Mobile app operation",
          knowledge: [],
          operations: MOBILE_OPERATION_IDS.map((id) => ({
            id,
            title: slug(id),
            inputSchema: "b2c/mobile-input",
            outputSchema: "b2c/mobile-output",
            evidenceSchema: "b2c/mobile-evidence",
            effect: "draft",
            acceptance: ["Current matching operation observation; capture is raw source only."],
          })),
        },
      ],
      implementations: ["native", "alternate"].flatMap((provider) =>
        MOBILE_OPERATION_IDS.map((operation) => ({
          id: impl(provider, operation),
          version: "1.0.0",
          operation,
          targets: [{ platform: "ios", runtime: "swiftui" }],
          mode: "manual",
          sdkRange: "*",
          limitations: ["Injected synthetic transport only"],
          knowledge: [],
          connectionRequired: false,
          maturity: "experimental",
        })),
      ),
      recipes: [
        {
          id: "b2c/mobile-conformance-recipe",
          version: "1.0.0",
          title: "Same mobile workflow through two providers",
          workflows: MOBILE_OPERATION_IDS.map((op) => `workflow.mobile-${slug(op)}`),
          operations: MOBILE_OPERATION_IDS.map((operation) => ({
            operation,
            implementation: impl("native", operation),
            required: true,
            workflowIds: [`workflow.mobile-${slug(operation)}`],
            workflowContexts: [
              {
                workflowId: `workflow.mobile-${slug(operation)}`,
                instructions: "neutral",
                roleInstructions: "neutral",
                neutralReferenceIds: [],
                providerReferenceIds: [],
                neutralContextPackIds: [],
                providerContextPackIds: [],
              },
            ],
          })),
          policy: { maxRepairAttempts: 1, independentReview: true },
        },
      ],
    };
    writeFileSync(path.join(source, "extension.yaml"), stringify(definition));
    const snapshot = snapshotPackage(source, path.join(root, "store"));
    const directory = path.join(root, "store", snapshot.digest.slice(7));
    const capture = (op: string) => op.endsWith(".capture-screenshot") || op.endsWith(".record-video");
    const catalog: CatalogInput = {
      version: "mobile-conformance",
      artifacts: MOBILE_OPERATION_IDS.flatMap((op) =>
        ["result", "receipt", ...(capture(op) ? ["raw"] : [])].map((kind) => ({
          id: `artifact.${slug(op)}-${kind}`,
          path: `mobile/${slug(op)}-${kind}.${kind === "raw" ? (op.endsWith(".record-video") ? "mp4" : "png") : "json"}`,
        })),
      ),
      workflows: MOBILE_OPERATION_IDS.map((op) => ({
        id: `workflow.mobile-${slug(op)}`,
        title: slug(op),
        domainId: "domain.code",
        actionClass: "draft",
        dependencies: [],
        outputPaths: ["result", "receipt", ...(capture(op) ? ["raw"] : [])].map(
          (kind) => `mobile/${slug(op)}-${kind}.${kind === "raw" ? (op.endsWith(".record-video") ? "mp4" : "png") : "json"}`,
        ),
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
        instructions: "Observe the declared target using the selected transport.",
      })),
    };
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    // Synthetic MP4 container bytes test transport/provenance handling; not a playable device recording claim.
    const mp4 = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115, 111, 109]);
    let nativeCalls = 0;
    let alternateCalls = 0;
    const allSupport = (providerId: string): MobileSupport => ({
      providerId,
      availability: "available",
      checkedAt: time,
      source: "fixture",
      tuples: [{ platform: "ios", deviceKind: "simulator", operations: [...MOBILE_OPERATION_IDS] }],
      limitations: ["Synthetic injected transport; no current real target proof"],
    });
    const saved = new Map<string, MobileObservation>();
    function transport(providerId: string): MobileOperationTransport {
      return {
        providerId,
        support: async () => allSupport(providerId),
        execute: async (request, key) => {
          if (providerId === "b2c/host-native-mobile") nativeCalls++;
          else alternateCalls++;
          const binary = request.operation.endsWith(".record-video") ? mp4 : png;
          const observation = mobileObservationSchema.parse({
            providerId,
            operation: request.operation,
            target: request.target,
            executionId: key,
            observedAt: time,
            source: "fixture",
            completion: "completed",
            observations: ["Synthetic transport observed the declared fixture state."],
            actionsCompleted: request.actions?.length ?? 0,
            ...(capture(request.operation)
              ? {
                  capture: {
                    artifactId: `artifact.${slug(request.operation)}-raw`,
                    sha256: createHash("sha256").update(binary).digest("hex"),
                    mimeType: request.operation.endsWith(".record-video") ? "video/mp4" : "image/png",
                    width: 1,
                    height: 1,
                    ...(request.durationSeconds ? { durationSeconds: request.durationSeconds } : {}),
                    stateId: request.stateId,
                    source: "app-pixels",
                  },
                }
              : {}),
          });
          saved.set(key, observation);
          return { observation, ...(capture(request.operation) ? { captureBytes: binary } : {}) };
        },
        observe: async (_request, key) => saved.get(key),
      };
    }
    const request = (providerId: string, operation: (typeof MOBILE_OPERATION_IDS)[number]): MobileRequest => ({
      providerId,
      operation,
      target,
      requestedAt: time,
      purpose: "marketing-source",
      stateId: "fixture-home",
      ...(operation.endsWith(".interact") ? { actions: [{ kind: "tap", x: 1, y: 1 }] } : {}),
      ...(operation.endsWith(".record-video") ? { durationSeconds: 2 } : {}),
    });
    for (const provider of ["native", "alternate"]) {
      const providerId = provider === "native" ? "b2c/host-native-mobile" : "b2c/mobai";
      const bindings = resolveRecipeBindings({
        packages: [{ directory, snapshot }],
        recipe: { packageId: definition.id, packageVersion: "1.0.0", recipeId: definition.recipes[0]!.id },
        target: { platform: "ios", runtime: "swiftui" },
        overrides: MOBILE_OPERATION_IDS.map((operation) => ({ operation, implementation: impl(provider, operation) })),
      });
      const plan = compilePlan(bindCatalogOperations(catalog, bindings));
      const mobileTransport = transport(providerId);
      const routes = new OperationRouteRegistry(
        MOBILE_OPERATION_IDS.map((operation) =>
          createMobileOperationRoute({
            transport: mobileTransport,
            operation,
            implementationId: impl(provider, operation),
            packageDigest: snapshot.digest,
            resultArtifactId: `artifact.${slug(operation)}-result`,
            receiptArtifactId: `artifact.${slug(operation)}-receipt`,
            ...(capture(operation) ? { captureArtifactId: `artifact.${slug(operation)}-raw` } : {}),
            input: () => request(providerId, operation),
            now: () => now,
          }),
        ),
      );
      const workspaceDir = path.join(root, provider);
      mkdirSync(workspaceDir);
      for (const node of plan.nodes) {
        const context: NodeExecutionContext = {
          runId: `run.${provider}`,
          attemptId: "attempt.1",
          workspaceDir,
          now: time,
          skillRootDir: root,
          artifactPaths: Object.fromEntries(plan.artifactBindings.map((entry) => [entry.artifactId, entry.path])),
          heartbeat: () => {},
          authorization: {
            workflowId: node.workflowId,
            runId: `run.${provider}`,
            attemptId: "attempt.1",
            executionIdentity: `worker.${provider}`,
            inputFingerprint: "mobile-input",
            evaluatedAt: time,
            actionClass: "draft",
            approvalRequirements: [],
            autonomy: { reasonCode: "conformance", evidenceRefs: [] },
          },
        };
        if (provider === "native" && node.selectedOperation!.operation.endsWith(".interact")) {
          const interruptedWorkspace = path.join(root, "interrupted");
          mkdirSync(interruptedWorkspace);
          let effects = 0;
          const interruptedTransport: MobileOperationTransport = {
            ...mobileTransport,
            execute: async (input, key) => {
              effects++;
              const response = await mobileTransport.execute(input, key);
              return { observation: { ...response.observation, completion: "interrupted" } };
            },
          };
          const interruptedRoutes = new OperationRouteRegistry([
            createMobileOperationRoute({
              transport: interruptedTransport,
              operation: node.selectedOperation!.operation as (typeof MOBILE_OPERATION_IDS)[number],
              implementationId: impl(provider, node.selectedOperation!.operation),
              packageDigest: snapshot.digest,
              resultArtifactId: `artifact.${slug(node.selectedOperation!.operation)}-result`,
              receiptArtifactId: `artifact.${slug(node.selectedOperation!.operation)}-receipt`,
              input: () => request(providerId, node.selectedOperation!.operation as (typeof MOBILE_OPERATION_IDS)[number]),
              now: () => now,
            }),
          ]);
          const interruptedContext = { ...context, workspaceDir: interruptedWorkspace };
          const failed = await createCliExecutor("auto", interruptedRoutes).execute(node, interruptedContext);
          assert.equal(failed.status, "failed");
          assert.match(failed.error!, /uncertain/);
          const retry = await createCliExecutor("auto", interruptedRoutes).execute(node, interruptedContext);
          assert.equal(retry.status, "failed");
          assert.match(retry.error!, /partial_prior_result/);
          assert.equal(effects, 1, "interrupted interaction repeated effects");
        }
        const result = await createCliExecutor("auto", routes).execute(node, context);
        assert.equal(result.status, "succeeded", result.error ?? "failed");
        const verdict = await createCliVerifier("auto", routes).verify(node, {
          runId: context.runId,
          inputFingerprint: "mobile-input",
          workspaceDir,
          skillRootDir: root,
          outputs: result.outputs,
          now: time,
        });
        assert.equal(verdict.status, "accepted", verdict.error ?? "failed");
        const output = JSON.parse(readFileSync(path.join(workspaceDir, `mobile/${slug(node.selectedOperation!.operation)}-result.json`), "utf8"));
        assert(
          Object.values(output.acceptance).every((value) => value === false),
          "raw operation claimed product acceptance",
        );
        assert.equal(output.observation.source, "fixture");
        assert.equal((await createCliExecutor("auto", routes).execute(node, context)).status, "succeeded", "replay failed");
        if (output.observation.capture) {
          const rawPath = path.join(workspaceDir, context.artifactPaths[output.observation.capture.artifactId]!);
          const original = readFileSync(rawPath);
          writeFileSync(rawPath, Buffer.from("tampered capture"));
          const tampered = await createCliVerifier("auto", routes).verify(node, {
            runId: context.runId,
            inputFingerprint: "mobile-input",
            workspaceDir,
            skillRootDir: root,
            outputs: result.outputs,
            now: time,
          });
          assert.equal(tampered.status, "rejected");
          assert.match(tampered.error!, /binary_artifact_mismatch/);
          writeFileSync(rawPath, original);
        }
      }
    }
    assert.equal(nativeCalls, 6);
    assert.equal(alternateCalls, 5);
    const req = request("b2c/mobai", MOBILE_OPERATION_IDS[3]);
    assert.throws(() => requireMobileSupport(req, allSupport("b2c/host-native-mobile"), now), /provider_mismatch/);
    assert.throws(() => requireMobileSupport(req, { ...allSupport("b2c/mobai"), availability: "unavailable" }, now), /unavailable/);
    assert.throws(
      () => requireMobileSupport({ ...req, target: { ...target, platform: "android", deviceKind: "physical" } }, allSupport("b2c/mobai"), now),
      /unsupported/,
    );
    assert.throws(
      () =>
        requireMobileSupport(
          req,
          { ...allSupport("b2c/mobai"), tuples: [{ platform: "ios", deviceKind: "simulator", operations: [MOBILE_OPERATION_IDS[0]] }] },
          now,
        ),
      /unsupported/,
    );
    const observed = [...saved.values()].find((entry) => entry.providerId === "b2c/mobai" && entry.operation === req.operation)!;
    assert.throws(() => normalizeMobileObservation(req, { ...observed, completion: "interrupted" }, now), /uncertain/);
    assert.throws(() => normalizeMobileObservation(req, observed, new Date(now.getTime() + 60_001)), /stale/);
    assert.throws(() => normalizeMobileObservation(req, { ...observed, target: { ...target, buildId: "other-build" } }, now), /identity/);
    console.log(
      "PASS mobile operation conformance: five operations through selected native and alternate synthetic transports; real declared raw byte artifacts; current target/provenance; no fallback; unavailable/partial/Android/physical refusal; interrupted/stale/misbound rejection; no product or marketing acceptance.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await proveMobileOperations();
