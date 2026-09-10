import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { firstpartyRecipes } from "../../../catalog/firstparty-declarations.js";
import {
  loadOnboardingApplicability,
  PRESENT_PAYWALL_OPERATION,
  REVENUECAT_PROVIDER_ID,
} from "../../../catalog/ontology/onboarding-applicability.js";
import type { Extension } from "../../../contracts/extensions/contract.js";
import { loadVerifiedOnboardingApplicability } from "../../../kernel/composition/onboarding-selection.js";
import { applyCompositionActivation, previewCompositionActivation } from "../../../kernel/composition/activation.js";
import { author } from "./binding-resolution.fixtures.js";
import { catalog, options, runtime, setup } from "./composition-activation.fixtures.js";
import { assert, type Harness } from "./_harness.js";

const firstPartyComposition = `apiVersion: b2c/v1
recipe: { id: b2c/subscription-app, version: 1.0.0 }
target: { platform: ios, runtime: swiftui }
bindings: {}
`;

function importedSupport(): Extension {
  return {
    apiVersion: "b2c.extension/v1",
    id: "b2c/imported-support",
    version: "1.0.0",
    hostApiVersion: "b2c/v1",
    title: "Imported support",
    dependencies: [],
    imports: [],
    resources: [{ id: "b2c/imported-schema", path: "schema.json", kind: "schema", mediaType: "application/json" }],
    providers: [{ id: "b2c/imported-paywall", version: "1.0.0", title: "Imported paywall", description: "Package-owned presenter" }],
    capabilities: [
      {
        id: "b2c/imported-monetization",
        version: "1.0.0",
        title: "Imported monetization",
        knowledge: [],
        operations: [
          {
            id: PRESENT_PAYWALL_OPERATION,
            title: "Present paywall",
            inputSchema: "b2c/imported-schema",
            outputSchema: "b2c/imported-schema",
            evidenceSchema: "b2c/imported-schema",
            effect: "draft",
            acceptance: ["Present paywall"],
          },
        ],
      },
    ],
    implementations: [
      {
        id: "b2c/imported-present-paywall",
        version: "1.0.0",
        operation: PRESENT_PAYWALL_OPERATION,
        provider: "b2c/imported-paywall",
        targets: [{ platform: "ios", runtime: "swiftui" }],
        mode: "manual",
        sdkRange: "^1.0.0",
        limitations: [],
        knowledge: [],
        connectionRequired: false,
        maturity: "implemented",
      },
    ],
    recipes: [],
  };
}

function pinPackages(workspace: string, packages: ReadonlyArray<{ directory: string; digest: string }>): void {
  const root = path.join(workspace, ".b2c-launch/packages");
  mkdirSync(root, { recursive: true });
  for (const entry of packages) {
    cpSync(entry.directory, path.join(root, entry.digest.slice(7)), { recursive: true });
  }
}

export function register(harness: Harness): void {
  harness.check("onboarding-selection: a pending activation journal cannot inherit today's first-party presenter", () => {
    const workspace = setup(harness);
    const preview = previewCompositionActivation({ workspace, catalog: catalog("Changed"), runtime });
    try {
      applyCompositionActivation(workspace, preview, {
        ...options,
        afterWrite: (step) => {
          if (step === "journal") throw new Error("interrupt");
        },
      });
    } catch (error) {
      assert(String(error).includes("interrupt"), `expected journal interrupt, got ${String(error)}`);
    }
    writeFileSync(path.join(workspace, "b2c.yaml"), firstPartyComposition, "utf8");
    const declared = loadOnboardingApplicability(workspace);
    const verified = loadVerifiedOnboardingApplicability(workspace);
    assert(declared.presentPaywall.status === "selected" && declared.presentPaywall.providerId === REVENUECAT_PROVIDER_ID, "declaration still names the first-party presenter");
    assert(verified.bindingLifecycle === "pending-activation", `expected pending-activation, got ${verified.bindingLifecycle}`);
    assert(verified.presentPaywall.status === "unresolved", "pending activation must not select a presenter");
  });

  harness.check("onboarding-selection: a stale candidate cannot inherit today's first-party presenter", () => {
    const workspace = setup(harness);
    writeFileSync(path.join(workspace, "b2c.yaml"), firstPartyComposition, "utf8");
    const declared = loadOnboardingApplicability(workspace);
    const verified = loadVerifiedOnboardingApplicability(workspace);
    assert(declared.presentPaywall.status === "selected" && declared.presentPaywall.providerId === REVENUECAT_PROVIDER_ID, "declaration still names the first-party presenter");
    assert(verified.bindingLifecycle === "stale-candidate", `expected stale-candidate, got ${verified.bindingLifecycle}`);
    assert(verified.presentPaywall.status === "unresolved", "stale candidate must not select a presenter");
  });

  harness.check("onboarding-selection: imported recipes resolve present-paywall from the package closure", () => {
    const support = author(harness, importedSupport());
    const consumer: Extension = {
      apiVersion: "b2c.extension/v1",
      id: "consumer/package",
      version: "1.0.0",
      hostApiVersion: "b2c/v1",
      title: "Consumer",
      dependencies: [{ id: "b2c/imported-support", version: "1.0.0" }],
      imports: [
        {
          package: { id: "b2c/imported-support", version: "1.0.0" },
          exports: [PRESENT_PAYWALL_OPERATION, "b2c/imported-present-paywall", "b2c/imported-paywall"],
        },
      ],
      resources: [],
      capabilities: [],
      implementations: [],
      recipes: [
        {
          id: "consumer/business",
          version: "1.0.0",
          title: "Business",
          workflows: ["workflow.build"],
          operations: [
            {
              operation: PRESENT_PAYWALL_OPERATION,
              implementation: "b2c/imported-present-paywall",
              required: true,
              workflowIds: ["workflow.build"],
            },
          ],
          policy: { maxRepairAttempts: 2, independentReview: true },
        },
      ],
    };
    const imported = author(harness, consumer, [support]);
    assert(!firstpartyRecipes.some((recipe) => recipe.id === "consumer/business"), "imported recipe must stay off the first-party id list");
    const workspace = harness.makeTempDir("onboarding-imported-recipe");
    writeFileSync(
      path.join(workspace, "b2c.yaml"),
      "apiVersion: b2c/v1\nrecipe: { id: consumer/business, version: 1.0.0 }\ntarget: { platform: ios, runtime: swiftui }\nbindings: {}\n",
      "utf8",
    );
    pinPackages(workspace, [
      { directory: support.directory, digest: support.snapshot.digest },
      { directory: imported.directory, digest: imported.snapshot.digest },
    ]);
    const declared = loadOnboardingApplicability(workspace);
    const verified = loadVerifiedOnboardingApplicability(workspace);
    assert(declared.presentPaywall.status === "unresolved", "declaration must not invent a first-party owner for an imported recipe");
    assert(verified.bindingLifecycle === "proposal", `expected proposal, got ${verified.bindingLifecycle}`);
    assert(verified.presentPaywall.status === "selected" && verified.presentPaywall.providerId === "b2c/imported-paywall", "imported recipe must bind the package presenter");
  });
}
