import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import type { Extension } from "../../../contracts/extensions/contract.js";
import { snapshotPackage, type PackageDependency } from "../../../kernel/composition/resources.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { assert, type Harness } from "./_harness.js";

export function definition(): Extension {
  return {
    apiVersion: "b2c.extension/v1",
    id: "binding/package",
    version: "1.0.0",
    hostApiVersion: "b2c/v1",
    title: "Bindings",
    dependencies: [],
    imports: [],
    resources: [{ id: "binding/schema", path: "schema.json", kind: "schema", mediaType: "application/json" }],
    capabilities: [
      {
        id: "binding/capability",
        version: "1.0.0",
        title: "Build",
        knowledge: [],
        operations: [
          {
            id: "binding/build",
            title: "Build",
            inputSchema: "binding/schema",
            outputSchema: "binding/schema",
            evidenceSchema: "binding/schema",
            effect: "draft",
            acceptance: ["Complete business"],
          },
          {
            id: "binding/publish",
            title: "Publish",
            inputSchema: "binding/schema",
            outputSchema: "binding/schema",
            evidenceSchema: "binding/schema",
            effect: "publish",
            acceptance: ["Provider readback"],
          },
        ],
      },
    ],
    implementations: [
      {
        id: "binding/native",
        version: "1.0.0",
        operation: "binding/build",
        targets: [{ platform: "ios", runtime: "swiftui" }],
        mode: "manual",
        sdkRange: "^1.0.0",
        limitations: [],
        knowledge: [],
        connectionRequired: false,
        maturity: "implemented",
      },
      {
        id: "binding/web",
        version: "1.0.0",
        operation: "binding/build",
        targets: [{ platform: "web", runtime: "nextjs" }],
        mode: "manual",
        sdkRange: "^1.0.0",
        limitations: [],
        knowledge: [],
        connectionRequired: false,
        maturity: "experimental",
      },
      {
        id: "binding/store",
        version: "1.0.0",
        operation: "binding/publish",
        targets: [{ platform: "ios", runtime: "swiftui" }],
        mode: "manual",
        sdkRange: "^1.0.0",
        limitations: ["Store authorization required"],
        knowledge: [],
        connectionRequired: true,
        maturity: "implemented",
      },
    ],
    recipes: [
      {
        id: "binding/business",
        version: "1.0.0",
        title: "Business",
        workflows: ["workflow.build", "workflow.publish"],
        operations: [
          { operation: "binding/build", implementation: "binding/native", required: true, workflowIds: ["workflow.build"] },
          { operation: "binding/publish", implementation: "binding/store", required: false, workflowIds: ["workflow.publish"] },
        ],
        policy: { maxRepairAttempts: 2, independentReview: true },
      },
    ],
  };
}
export function author(harness: Harness, extension: Extension, dependencies: readonly PackageDependency[] = []): PackageDependency {
  const source = harness.makeTempDir("binding-source");
  const store = harness.makeTempDir("binding-store");
  mkdirSync(source, { recursive: true });
  writeFileSync(path.join(source, "extension.yaml"), stringify(extension));
  writeFileSync(path.join(source, "schema.json"), '{"type":"object"}');
  for (const resource of extension.resources.filter((entry) => entry.path !== "schema.json"))
    writeFileSync(path.join(source, resource.path), `Expertise for ${resource.id}`);
  const snapshot = snapshotPackage(source, store, dependencies);
  return { snapshot, directory: path.join(store, snapshot.digest.slice(7)) };
}
const recipe = { packageId: "binding/package", packageVersion: "1.0.0", recipeId: "binding/business" };
export function register(harness: Harness): void {
  harness.check("bindings: exact declared target resolves resources while authority, configuration, route and proof stay unknown", () => {
    const dependency = author(harness, definition());
    const result = resolveRecipeBindings({ packages: [dependency], recipe, target: { platform: "ios", runtime: "swiftui" }, hostSdkVersion: "1.2.0" });
    assert(result.status === "resolved" && result.bindings.every((binding) => binding.status === "bound"), "declared binding failed");
    const first = result.bindings[0]!;
    assert(first.resources[0]?.id === "binding/schema" && first.implementation?.packageDigest === dependency.snapshot.digest, "resources not pinned");
    assert(first.sdkCompatibility === "declared-range-match", "supplied SDK version not matched");
    assert(
      first.readiness.workspaceConfiguration === "unknown" &&
        first.readiness.executionRoute === "unknown" &&
        first.readiness.grantedAuthority === "unknown" &&
        first.readiness.observedProof === "unknown",
      "declarations fabricated readiness",
    );
  });
  harness.check("bindings: missing, ambiguous and mismatched required bindings refuse without provider fallback", () => {
    const dependency = author(harness, definition());
    assert(resolveRecipeBindings({ packages: [], recipe, target: { platform: "ios", runtime: "swiftui" } }).status === "refused", "missing package passed");
    assert(
      resolveRecipeBindings({ packages: [dependency, dependency], recipe, target: { platform: "ios", runtime: "swiftui" } }).status === "refused",
      "ambiguous package passed",
    );
    const unmatched = resolveRecipeBindings({ packages: [dependency], recipe, target: { platform: "web", runtime: "nextjs" } });
    assert(
      unmatched.status === "refused" && unmatched.bindings[0]?.reasonCodes.includes("binding.target_mismatch"),
      "silently fell back to a compatible provider",
    );
    const wrongOperation = resolveRecipeBindings({
      packages: [dependency],
      recipe,
      target: { platform: "ios", runtime: "swiftui" },
      overrides: [{ operation: "binding/build", implementation: "binding/store" }],
    });
    assert(wrongOperation.bindings[0]?.reasonCodes.includes("binding.operation_mismatch"), "operation mismatch passed");
    const missing = resolveRecipeBindings({
      packages: [dependency],
      recipe,
      target: { platform: "ios", runtime: "swiftui" },
      overrides: [{ operation: "binding/build", implementation: "binding/missing" }],
    });
    assert(missing.status === "refused", "missing required implementation passed");
  });
  harness.check("bindings: explicit overrides select a target and optional incompatible work is excluded", () => {
    const dependency = author(harness, definition());
    const result = resolveRecipeBindings({
      packages: [dependency],
      recipe,
      target: { platform: "web", runtime: "nextjs" },
      overrides: [{ operation: "binding/build", implementation: "binding/web" }],
    });
    assert(result.status === "resolved" && result.bindings[0]?.implementation?.id === "binding/web", "explicit override ignored");
    assert(result.bindings[1]?.status === "excluded" && result.bindings[1].reasonCodes.includes("binding.target_mismatch"), "optional exclusion missing");
    assert(result.bindings[0]?.sdkCompatibility === "unknown", "SDK compatibility fabricated without version input");
  });
  harness.check("bindings: imported operation and implementation resolve only inside the verified declared closure", () => {
    const dependency = author(harness, definition());
    const extension: Extension = {
      apiVersion: "b2c.extension/v1",
      id: "consumer/package",
      version: "1.0.0",
      hostApiVersion: "b2c/v1",
      title: "Consumer",
      dependencies: [{ id: "binding/package", version: "1.0.0" }],
      imports: [{ package: { id: "binding/package", version: "1.0.0" }, exports: ["binding/build", "binding/native", "binding/store"] }],
      resources: [],
      capabilities: [],
      implementations: [],
      recipes: [
        {
          id: "consumer/business",
          version: "1.0.0",
          title: "Business",
          workflows: ["workflow.build", "workflow.publish"],
          operations: [{ operation: "binding/build", implementation: "binding/native", required: true, workflowIds: ["workflow.build"] }],
          policy: { maxRepairAttempts: 2, independentReview: true },
        },
      ],
    };
    const consumer = author(harness, extension, [dependency]);
    const request = {
      packages: [consumer, dependency],
      recipe: { packageId: "consumer/package", packageVersion: "1.0.0", recipeId: "consumer/business" },
      target: { platform: "ios" as const, runtime: "swiftui" },
    };
    const result = resolveRecipeBindings(request);
    assert(result.status === "resolved" && result.bindings[0]?.implementation?.packageId === "binding/package", "imported implementation did not bind");
    assert(resolveRecipeBindings({ ...request, packages: [consumer] }).status === "refused", "missing explicit closure accepted");
    const wrong = resolveRecipeBindings({ ...request, overrides: [{ operation: "binding/build", implementation: "binding/store" }] });
    assert(wrong.bindings[0]?.reasonCodes.includes("binding.operation_mismatch"), "imported override operation mismatch accepted");
  });

  harness.check("bindings: SDK mismatches, unknown overrides and duplicate overrides refuse explicitly", () => {
    const dependency = author(harness, definition());
    const base = { packages: [dependency], recipe, target: { platform: "ios" as const, runtime: "swiftui" } };
    const mismatch = resolveRecipeBindings({ ...base, hostSdkVersion: "2.0.0" });
    assert(mismatch.status === "refused" && mismatch.bindings[0]?.sdkCompatibility === "mismatch", "incompatible SDK accepted");
    assert(
      resolveRecipeBindings({ ...base, overrides: [{ operation: "binding/unknown", implementation: "binding/native" }] }).status === "refused",
      "unknown override ignored",
    );
    const override = { operation: "binding/build", implementation: "binding/native" };
    assert(resolveRecipeBindings({ ...base, overrides: [override, override] }).status === "refused", "duplicate override ignored");
  });
}
