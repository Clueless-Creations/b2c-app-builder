import { seedRunState, buildCheckpoint } from "../../../kernel/engine/runstate.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { validateRunState } from "../../../kernel/schema/index.js";
import { spawnSync } from "node:child_process";
import { loadWorkspaceCatalog, loadWorkspaceCatalogIfPresent } from "../../../kernel/session/catalog-contract.js";
import { readWorkspaceStatus } from "../../../kernel/session/status.js";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  applyCompositionActivation,
  assertCompositionActivationComplete,
  previewCompositionActivation,
  recoverCompositionActivation,
  type ActivationBoundary,
} from "../../../kernel/composition/activation.js";
import { definition, author } from "./binding-resolution.fixtures.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { bindCatalogOperations } from "../../../kernel/composition/compile-bindings.js";
import type { CatalogInput } from "../../../kernel/engine/compile.js";
import { acquireLock, releaseLock } from "../../../kernel/reducer/lock.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

export const config = "apiVersion: b2c/v1\nrecipe: { id: binding/business, version: 1.0.0 }\ntarget: { platform: ios, runtime: swiftui }\nbindings: {}\n";
export const runtime = { schemaVersion: "1.0.0", skill: "b2c-app-builder", skillVersion: "1.0.0", skillRoot: "/fixture/runtime", catalogPath: "catalog.json" };
export const options = { ownerSessionId: "activation-fixture" };
let selectedBinding: CatalogInput["workflows"][number]["selectedOperation"];
export function catalog(instructions = "Create the app"): CatalogInput {
  return {
    version: "fixture",
    artifacts: [],
    workflows: [
      {
        selectedOperation: selectedBinding,
        maxAttempts: 3,
        requiresIndependentReview: true,
        id: "workflow.build",
        title: "Build",
        domainId: "domain.code",
        actionClass: "draft",
        dependencies: [],
        outputPaths: ["APP.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
        instructions,
      },
    ],
  };
}
export function setup(h: Harness): string {
  selectedBinding = undefined;
  const extension = definition();
  extension.recipes[0]!.workflows = ["workflow.build"];
  extension.recipes[0]!.operations = [extension.recipes[0]!.operations[0]!];
  extension.recipes[0]!.operations[0]!.workflowContexts = [
    {
      workflowId: "workflow.build",
      instructions: "neutral",
      roleInstructions: "neutral",
      neutralReferenceIds: [],
      providerReferenceIds: [],
      neutralContextPackIds: [],
      providerContextPackIds: [],
    },
  ];
  const dependency = author({ ...h, makeTempDir: (name: string) => h.makeTempDir(`${name}-${randomUUID()}`) }, extension);
  const resolved = resolveRecipeBindings({
    packages: [dependency],
    recipe: { packageId: "binding/package", packageVersion: "1.0.0", recipeId: "binding/business" },
    target: { platform: "ios", runtime: "swiftui" },
  });
  selectedBinding = bindCatalogOperations(catalog(), resolved).workflows[0]!.selectedOperation;
  const workspace = h.makeTempDir(`composition-activation-${randomUUID()}`);
  writeFileSync(path.join(workspace, "b2c.yaml"), config);
  applyCompositionActivation(workspace, previewCompositionActivation({ workspace, catalog: catalog(), runtime }), options);
  return workspace;
}
function refuses(action: () => unknown, code: string): void {
  let message = "";
  try {
    action();
  } catch (error) {
    message = String(error);
  }
  assert(message.includes(code), `Expected ${code}; got ${message || "success"}`);
}
function pin(workspace: string): string {
  return readFileSync(path.join(workspace, "catalog.json"), "utf8") + readFileSync(path.join(workspace, ".b2c-launch/runtime.json"), "utf8");
}
export function register(h: Harness): void {
  h.check("composition preview is read-only; explicit activation increments revision and repeat is idempotent", () => {
    const workspace = setup(h),
      before = pin(workspace);
    const preview = previewCompositionActivation({ workspace, catalog: catalog("Build and measure"), runtime });
    assert(
      pin(workspace) === before && preview.configurationRevision === 2 && preview.reopened.includes("workflow.build"),
      "preview changed the pin or missed changed obligation",
    );
    const first = applyCompositionActivation(workspace, preview, options),
      second = applyCompositionActivation(workspace, preview, options);
    assert(first.status === "activated" && !first.idempotent && second.status === "activated" && second.idempotent, "activation did not converge");
    assert(
      !existsSync(path.join(workspace, "control/grants.json")) && !existsSync(path.join(workspace, "state/business-state.json")),
      "activation wrote authority or reducer state",
    );
  });
  h.check("config, workspace revision and active pin changes refuse stale activation without effects", () => {
    for (const field of ["config", "revision", "pin"] as const) {
      const workspace = setup(h);
      const preview = previewCompositionActivation({ workspace, catalog: catalog("Changed"), runtime });
      if (field === "config") writeFileSync(path.join(workspace, "b2c.yaml"), config + "# concurrent edit\n");
      if (field === "revision") {
        mkdirSync(path.join(workspace, "state"), { recursive: true });
        writeFileSync(path.join(workspace, "state/business-state.json"), "{}");
      }
      if (field === "pin") writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(catalog("Concurrent contract")));
      const before = pin(workspace);
      refuses(() => applyCompositionActivation(workspace, preview, options), "composition.stale_preview");
      assert(pin(workspace) === before && !existsSync(path.join(workspace, ".b2c-launch/composition-activation.json")), "stale apply wrote active metadata");
    }
  });
  h.check("failed staging and incomplete compiled configuration leave active metadata untouched", () => {
    const workspace = setup(h),
      before = pin(workspace);
    const invalid = catalog();
    invalid.workflows[0]!.dependencies = ["workflow.absent"];
    refuses(() => previewCompositionActivation({ workspace, catalog: invalid, runtime }), "depends on unknown workflow");
    writeFileSync(
      path.join(workspace, "b2c.yaml"),
      config.replace("bindings: {}", "bindings: { core/build: { provider: { id: custom/engine, version: 1.0.0 } } }"),
    );
    refuses(() => previewCompositionActivation({ workspace, catalog: catalog(), runtime }), "composition.configuration_binding_uncompiled");
    assert(pin(workspace) === before, "invalid stage changed active pin");
  });
  h.check("authored recipe, target, default and override bindings must match the compiled selection", () => {
    const workspace = setup(h),
      before = pin(workspace);
    for (const proposed of [
      config.replace("binding/business", "other/business"),
      config.replace("runtime: swiftui", "runtime: flutter"),
      config.replace("version: 1.0.0", "version: 2.0.0"),
      config.replace("bindings: {}", "bindings: { binding/build: { provider: { id: other/implementation, version: 1.0.0 } } }"),
      config.replace("bindings: {}", "bindings: { binding/build: { provider: { id: binding/native, version: 1.0.0 }, connection: 'connection:uncompiled' } }"),
    ]) {
      writeFileSync(path.join(workspace, "b2c.yaml"), proposed);
      let refused = false;
      try {
        previewCompositionActivation({ workspace, catalog: catalog(), runtime });
      } catch {
        refused = true;
      }
      assert(refused && pin(workspace) === before, "unrelated config accepted or active bytes changed");
    }
    writeFileSync(path.join(workspace, "b2c.yaml"), config);
    const unselected = catalog();
    delete unselected.workflows[0]!.selectedOperation;
    refuses(() => previewCompositionActivation({ workspace, catalog: unselected, runtime }), "composition.unresolved_configuration");
  });
  h.check("configuration edits after interruption refuse resume while exact local restore remains available", () => {
    const workspace = setup(h),
      before = pin(workspace);
    const preview = previewCompositionActivation({ workspace, catalog: catalog("Changed"), runtime });
    refuses(
      () =>
        applyCompositionActivation(workspace, preview, {
          ...options,
          afterWrite: (step) => {
            if (step === "catalog") throw new Error("crash");
          },
        }),
      "crash",
    );
    writeFileSync(path.join(workspace, "b2c.yaml"), config + "# newer proposal\n");
    refuses(() => recoverCompositionActivation(workspace, "resume", options), "composition.stale_preview");
    recoverCompositionActivation(workspace, "restore", options);
    assert(pin(workspace) === before, "restore ignored prior exact pin");
  });
  h.check("interruption after every activation boundary leaves old or named incomplete state and converges on recovery", () => {
    for (const boundary of ["journal", "catalog", "runtime", "complete"] as ActivationBoundary[]) {
      const workspace = setup(h);
      const preview = previewCompositionActivation({ workspace, catalog: catalog(`Changed ${boundary}`), runtime });
      refuses(
        () =>
          applyCompositionActivation(workspace, preview, {
            ...options,
            afterWrite: (step) => {
              if (step === boundary) throw Object.assign(new Error("simulated persistence interruption"), { code: "EIO" });
            },
          }),
        "simulated persistence interruption",
      );
      if (boundary !== "complete") {
        refuses(() => assertCompositionActivationComplete(workspace), "composition.activation_incomplete");
        refuses(() => previewCompositionActivation({ workspace, catalog: catalog(), runtime }), "composition.activation_incomplete");
        recoverCompositionActivation(workspace, "resume", options);
      }
      assertCompositionActivationComplete(workspace);
      const again = applyCompositionActivation(workspace, preview, options);
      assert(again.status === "activated" && again.idempotent, "recovery repinned or duplicated activation");
    }
  });
  h.check("interrupted activation refuses catalog overrides and CLI planning while status names recovery", () => {
    const workspace = setup(h);
    const preview = previewCompositionActivation({ workspace, catalog: catalog("Changed"), runtime });
    refuses(
      () =>
        applyCompositionActivation(workspace, preview, {
          ...options,
          afterWrite: (step) => {
            if (step === "catalog") throw new Error("crash");
          },
        }),
      "crash",
    );
    for (const result of [loadWorkspaceCatalog(workspace), loadWorkspaceCatalogIfPresent(workspace)])
      assert(!result.ok && result.refusal.reason.includes("composition.activation_incomplete"), "reader exposed an incomplete pin");
    assert(readWorkspaceStatus(workspace).state === "composition_incomplete", "status hid recovery");
    const cli = spawnSync(process.execPath, [path.join(skillRoot, "entrypoints/cli/b2c.mjs"), "plan", "--workspace", workspace], {
      encoding: "utf8",
      timeout: 30000,
    });
    assert(
      cli.status !== 0 && `${cli.stdout}${cli.stderr}`.includes("composition.activation_incomplete"),
      `CLI did not refuse incomplete activation: ${cli.stdout}${cli.stderr}`,
    );
    recoverCompositionActivation(workspace, "restore", options);
  });
  h.check("restore survives its own interruption and never overwrites a concurrent pin edit", () => {
    const workspace = setup(h),
      before = pin(workspace);
    const preview = previewCompositionActivation({ workspace, catalog: catalog("Changed"), runtime });
    refuses(
      () =>
        applyCompositionActivation(workspace, preview, {
          ...options,
          afterWrite: (step) => {
            if (step === "runtime") throw new Error("crash");
          },
        }),
      "crash",
    );
    refuses(
      () =>
        recoverCompositionActivation(workspace, "restore", {
          ...options,
          afterWrite: (step) => {
            if (step === "catalog") throw new Error("crash");
          },
        }),
      "crash",
    );
    recoverCompositionActivation(workspace, "restore", options);
    assert(pin(workspace) === before, "restore lost previous pin bytes");
    refuses(
      () =>
        applyCompositionActivation(workspace, preview, {
          ...options,
          afterWrite: (step) => {
            if (step === "catalog") throw new Error("crash");
          },
        }),
      "crash",
    );
    writeFileSync(path.join(workspace, "catalog.json"), "concurrent edit");
    refuses(() => recoverCompositionActivation(workspace, "restore", options), "composition.concurrent_pin_edit");
    assert(readFileSync(path.join(workspace, "catalog.json"), "utf8") === "concurrent edit", "recovery overwrote concurrent edit");
  });
  h.check("active and uncertain attempts refuse changed contracts; malformed history refuses reconciliation", () => {
    for (const status of ["running", "verifying", "needs_readback", "orphaned", "succeeded"]) {
      const workspace = setup(h);
      mkdirSync(path.join(workspace, "run"));
      const history = JSON.stringify({ nodes: { build: { status, attempts: [{ receipt: "preserve-me" }] } } });
      writeFileSync(path.join(workspace, "run/run-state.json"), history);
      refuses(
        () => previewCompositionActivation({ workspace, catalog: catalog("Changed"), runtime }),
        status === "succeeded" ? "composition.reconciliation_state_invalid" : "composition.active_or_uncertain_attempt",
      );
      assert(readFileSync(path.join(workspace, "run/run-state.json"), "utf8") === history, "activation rewrote history");
    }
  });
  h.check("pending public request blocks changed composition without losing its original run identity", () => {
    const workspace = setup(h);
    const business = JSON.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/state/business-state.json"), "utf8"));
    mkdirSync(path.join(workspace, "state"), { recursive: true });
    mkdirSync(path.join(workspace, "run"), { recursive: true });
    writeFileSync(path.join(workspace, "state/business-state.json"), JSON.stringify(business));
    const run = seedRunState(compilePlan(catalog()), business, {
      ownerSessionId: "public-request",
      ttlSeconds: 300,
      wallClockCapSeconds: 1800,
      now: "2026-09-05T00:00:00.000Z",
    });
    run.publicRequests = { request: { requestDigest: "sha256:" + "a".repeat(64), sessionId: "public-request", status: "running" } };
    const before = JSON.stringify(run),
      beforePin = pin(workspace);
    const runFile = path.join(workspace, "run/run-state.json");
    writeFileSync(runFile, before);
    refuses(() => previewCompositionActivation({ workspace, catalog: catalog("Changed"), runtime }), "business.request_recovery_required");
    assert(readFileSync(runFile, "utf8") === before && pin(workspace) === beforePin, "pending request or composition was overwritten");
  });
  h.check("settled plan reconciliation preserves independent proof, archives removed history and recovers all staged surfaces", () => {
    for (const mode of ["resume", "restore"] as const)
      for (const boundary of ["journal", "catalog", "runtime", "run", "checkpoint"] as ActivationBoundary[]) {
        const workspace = setup(h);
        const priorCatalog = catalog();
        for (const name of ["downstream", "independent", "removed"])
          priorCatalog.workflows.push({
            ...priorCatalog.workflows[0]!,
            selectedOperation: undefined,
            requiresIndependentReview: false,
            id: `workflow.${name}`,
            title: name,
            dependencies: name === "downstream" ? ["workflow.build"] : [],
            outputPaths: [`${name}.md`],
            gateCommands: ["true"],
          });
        priorCatalog.artifacts = priorCatalog.workflows.map((workflow, index) => ({ id: `artifact.test${index}`, path: workflow.outputPaths[0]! }));
        applyCompositionActivation(workspace, previewCompositionActivation({ workspace, catalog: priorCatalog, runtime }), options);
        const business = JSON.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/state/business-state.json"), "utf8"));
        mkdirSync(path.join(workspace, "state"), { recursive: true });
        mkdirSync(path.join(workspace, "run"), { recursive: true });
        const businessBytes = JSON.stringify(business);
        writeFileSync(path.join(workspace, "state/business-state.json"), businessBytes);
        const plan = compilePlan(priorCatalog);
        const run = seedRunState(plan, business, { ownerSessionId: "producer", ttlSeconds: 300, wallClockCapSeconds: 1800, now: "2026-09-05T00:00:00.000Z" });
        for (const node of plan.nodes) {
          const state = run.nodes[node.id]!;
          state.status = "succeeded";
          state.acceptedOutputFingerprint = "a".repeat(64);
          state.verifiedBySessionId = "reviewer";
          state.attempts = [
            {
              id: `attempt-${node.id}`,
              nodeId: node.id,
              number: 1,
              status: "succeeded",
              ownerSessionId: "producer",
              heartbeatAt: run.updatedAt,
              ttlSeconds: 300,
              inputFingerprint: "input",
              evidence: ["synthetic fixture"],
              readbackRequired: false,
              independentVerification: {
                mode: "synthetic",
                workflowId: node.workflowId,
                attemptId: `attempt-${node.id}`,
                producerSessionId: "producer",
                verifierSessionId: "reviewer",
                verdict: "accepted",
                checkedAt: run.updatedAt,
                policyFingerprint: state.contractFingerprint!,
                outputFingerprint: state.acceptedOutputFingerprint,
                subjects: [],
                criteria: [],
                evidence: ["synthetic fixture"],
              },
            },
          ];
        }
        for (const binding of run.artifactBindings) {
          binding.accepted = true;
          binding.fingerprint = "accepted-artifact";
        }
        assert(validateRunState(run).valid, JSON.stringify(validateRunState(run).issues));
        const beforeRun = JSON.stringify(run, null, 2) + "\n";
        writeFileSync(path.join(workspace, "run/run-state.json"), beforeRun);
        writeFileSync(path.join(workspace, "run/checkpoint.json"), JSON.stringify(buildCheckpoint(run, "producer", "prior", run.updatedAt), null, 2) + "\n");
        const nextCatalog = structuredClone(priorCatalog);
        nextCatalog.workflows = nextCatalog.workflows.filter((node) => node.id !== "workflow.removed");
        nextCatalog.artifacts = nextCatalog.artifacts.filter((artifact) => artifact.path !== "removed.md");
        nextCatalog.workflows[0]!.instructions = "Revised product obligation";
        const priorPins = pin(workspace);
        const preview = previewCompositionActivation({ workspace, catalog: nextCatalog, runtime });
        assert(readFileSync(path.join(workspace, "run/run-state.json"), "utf8") === beforeRun, "preview mutated history");
        refuses(
          () =>
            applyCompositionActivation(workspace, preview, {
              ...options,
              afterWrite(step) {
                if (step === boundary) throw new Error("crash");
              },
            }),
          "crash",
        );
        recoverCompositionActivation(workspace, mode, options);
        if (mode === "restore") {
          assert(
            readFileSync(path.join(workspace, "run/run-state.json"), "utf8") === beforeRun && pin(workspace) === priorPins,
            "restore lost prior history or pin",
          );
          continue;
        }
        const current = JSON.parse(readFileSync(path.join(workspace, "run/run-state.json"), "utf8"));
        assert(current.planId === preview.planId && validateRunState(current).valid, "reconciled state not current");
        assert(current.nodes["run.build"].status === "stale" && current.nodes["run.downstream"].status === "stale", "changed/downstream proof stayed accepted");
        assert(JSON.stringify(current.nodes["run.independent"]) === JSON.stringify(run.nodes["run.independent"]), "unaffected proof changed");
        assert(
          !current.nodes["run.removed"] && current.archivedPlans.at(-1).nodes["run.removed"].attempts[0].id === run.nodes["run.removed"]!.attempts[0]!.id,
          "removed history lost or remained active",
        );
        assert(
          current.nodes["run.build"].attempts.length === 1 && !current.nodes["run.build"].acceptedOutputFingerprint,
          "attempt history lost or accepted stale proof",
        );
        const checkpoint = JSON.parse(readFileSync(path.join(workspace, "run/checkpoint.json"), "utf8"));
        assert(JSON.stringify(checkpoint.runState) === JSON.stringify(current), "checkpoint disagrees");
        assert(readFileSync(path.join(workspace, "state/business-state.json"), "utf8") === businessBytes, "reducer-owned state changed");
      }
  });
  h.check("restore refuses unrelated workspace state edits after interruption", () => {
    const workspace = setup(h),
      preview = previewCompositionActivation({ workspace, catalog: catalog("Changed"), runtime });
    refuses(
      () =>
        applyCompositionActivation(workspace, preview, {
          ...options,
          afterWrite(step) {
            if (step === "catalog") throw new Error("crash");
          },
        }),
      "crash",
    );
    const partialPin = pin(workspace);
    mkdirSync(path.join(workspace, "state"), { recursive: true });
    writeFileSync(path.join(workspace, "state/current-truth.json"), '{"changed":true}');
    refuses(() => recoverCompositionActivation(workspace, "restore", options), "composition.stale_restore");
    assert(pin(workspace) === partialPin, "stale restore rewrote active metadata");
  });
  h.check("changed pinned package bytes refuse activation before a journal or active effect", () => {
    const workspace = setup(h),
      before = pin(workspace);
    const extension = definition();
    extension.recipes[0]!.workflows = ["workflow.build"];
    extension.recipes[0]!.operations = [extension.recipes[0]!.operations[0]!];
    extension.recipes[0]!.operations[0]!.workflowContexts = [
      {
        workflowId: "workflow.build",
        instructions: "neutral",
        roleInstructions: "neutral",
        neutralReferenceIds: [],
        providerReferenceIds: [],
        neutralContextPackIds: [],
        providerContextPackIds: [],
      },
    ];
    const dependency = author(h, extension);
    const resolved = resolveRecipeBindings({
      packages: [dependency],
      recipe: { packageId: "binding/package", packageVersion: "1.0.0", recipeId: "binding/business" },
      target: { platform: "ios", runtime: "swiftui" },
    });
    const selected = bindCatalogOperations(catalog(), resolved);
    writeFileSync(path.join(workspace, "b2c.yaml"), config);
    const preview = previewCompositionActivation({ workspace, catalog: selected, runtime });
    chmodSync(path.join(dependency.directory, "schema.json"), 0o644);
    writeFileSync(path.join(dependency.directory, "schema.json"), '{"type":"string"}');
    let refused = false;
    try {
      applyCompositionActivation(workspace, preview, options);
    } catch {
      refused = true;
    }
    assert(
      refused && pin(workspace) === before && !existsSync(path.join(workspace, ".b2c-launch/composition-activation.json")),
      "package edit silently repinned or wrote active metadata",
    );
  });
  h.check("workspace session and reducer leases each fence activation without breaking a holder", () => {
    for (const relative of ["control/session.lock", "state/business-state.json.lock"]) {
      const workspace = setup(h),
        before = pin(workspace),
        preview = previewCompositionActivation({ workspace, catalog: catalog("Changed"), runtime });
      const lock = path.join(workspace, relative);
      assert(acquireLock(lock, { ownerSessionId: "other", retries: 0 }).ok, "fixture lease failed");
      refuses(() => applyCompositionActivation(workspace, preview, options), "composition.workspace_held");
      assert(pin(workspace) === before, "locked activation wrote metadata");
      releaseLock(lock, "other");
    }
  });
}
