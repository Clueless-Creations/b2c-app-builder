import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { firstpartyRecipes } from "../../../catalog/firstparty-declarations.js";
import { loadOnboardingApplicability, PRESENT_PAYWALL_OPERATION, REVENUECAT_PROVIDER_ID } from "../../../catalog/ontology/onboarding-applicability.js";
import type { Extension } from "../../../contracts/extensions/contract.js";
import { compilePlan, type CatalogInput } from "../../../kernel/engine/compile.js";
import { composeNodeBrief, renderNodeBrief } from "../../../kernel/engine/node-brief.js";
import { buildVerifierPrompt, buildWorkerPrompt } from "../../../kernel/session/worker-prompt.js";
import { loadVerifiedOnboardingApplicability } from "../../../kernel/composition/onboarding-selection.js";
import { applyCompositionActivation, previewCompositionActivation } from "../../../kernel/composition/activation.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { author } from "./binding-resolution.fixtures.js";
import { catalog, options, runtime, setup } from "./composition-activation.fixtures.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

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

function assertPromptFollowsVerifiedPin(prompt: string, label: string): void {
  assert(prompt.includes("stale-candidate") && prompt.includes("not execution truth"), `${label} must name the stale candidate:\n${prompt}`);
  assert(
    prompt.includes("Declared present-paywall selected") && prompt.includes("verified present-paywall unresolved"),
    `${label} must contrast draft vs pin:\n${prompt}`,
  );
  assert(prompt.includes("signup job=conversion interaction=static-document"), `${label} must keep purpose independent of technique:\n${prompt}`);
  assert(!prompt.includes("scroll-linked"), `${label} must not invent scroll-linked technique`);
  assert(prompt.includes("semantic review or device observation"), `${label} must not overclaim proof strength`);
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
    assert(
      declared.presentPaywall.status === "selected" && declared.presentPaywall.providerId === REVENUECAT_PROVIDER_ID,
      "declaration still names the first-party presenter",
    );
    assert(verified.bindingLifecycle === "pending-activation", `expected pending-activation, got ${verified.bindingLifecycle}`);
    assert(verified.presentPaywall.status === "unresolved", "pending activation must not select a presenter");
  });

  harness.check("onboarding-selection: a stale candidate cannot inherit today's first-party presenter", () => {
    const workspace = setup(harness);
    writeFileSync(path.join(workspace, "b2c.yaml"), firstPartyComposition, "utf8");
    const declared = loadOnboardingApplicability(workspace);
    const verified = loadVerifiedOnboardingApplicability(workspace);
    assert(
      declared.presentPaywall.status === "selected" && declared.presentPaywall.providerId === REVENUECAT_PROVIDER_ID,
      "declaration still names the first-party presenter",
    );
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
    assert(
      verified.presentPaywall.status === "selected" && verified.presentPaywall.providerId === "b2c/imported-paywall",
      "imported recipe must bind the package presenter",
    );
  });

  harness.check("onboarding-selection: activate-then-edit keeps brief, producer prompt, and gate on the verified pin", () => {
    const workspace = setup(harness);
    writeFileSync(path.join(workspace, "b2c.yaml"), firstPartyComposition, "utf8");
    cpSync(path.join(skillRoot, "examples/workspace/business/product.yaml"), path.join(workspace, "product.yaml"));
    writeFileSync(
      path.join(workspace, "product.yaml"),
      readFileSync(path.join(workspace, "product.yaml"), "utf8").replace(
        /(- id: feature\.paywall-goal-headline\n    class_id: class.feature\n    slots:\n      slot.feature.scope: )\S+/,
        "$1required",
      ),
      "utf8",
    );
    mkdirSync(path.join(workspace, "studio/seed"), { recursive: true });
    writeFileSync(
      path.join(workspace, "studio/seed/business.json"),
      `${JSON.stringify({ surfaces: { landingPages: [{ id: "signup", job: "conversion", interaction: "static-document" }] } }, null, 2)}\n`,
      "utf8",
    );
    mkdirSync(path.join(workspace, "product/onboarding/graph"), { recursive: true });
    writeFileSync(
      path.join(workspace, "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md"),
      `## Findings

Finding: Quiz writes paywall_headline_key into offering metadata.
Source: fixture observation 2026-09-10.
Classification: observation.
Decision: bind customVariables and keep the fallback.
Uncertainty: synthetic fixture evidence.
paywall_headline_key
fallback
offering metadata
customVariables
`,
      "utf8",
    );
    const declared = loadOnboardingApplicability(workspace);
    const verified = loadVerifiedOnboardingApplicability(workspace);
    assert(declared.presentPaywall.status === "selected" && declared.presentPaywall.providerId === REVENUECAT_PROVIDER_ID, "draft still names RevenueCat");
    assert(declared.headlineBind === "selected", "draft would treat the headline bind as selected");
    assert(verified.bindingLifecycle === "stale-candidate", `expected stale-candidate, got ${verified.bindingLifecycle}`);
    assert(verified.presentPaywall.status === "unresolved" && verified.headlineBind === "unresolved", "verified pin must not adopt the draft presenter");
    const pinned = JSON.parse(readFileSync(path.join(workspace, "catalog.json"), "utf8")) as CatalogInput;
    const plan = compilePlan(pinned);
    const brief = composeNodeBrief(plan.nodes[0]!, plan, undefined, workspace);
    const rendered = renderNodeBrief(brief);
    assert(brief.bindingTruth?.lifecycle === "stale-candidate", "brief must carry the verified lifecycle");
    assert(brief.bindingTruth?.candidateIsExecutionTruth === false, "candidate YAML must not be execution truth");
    assert(rendered.includes("stale-candidate") && rendered.includes("not execution truth"), `brief must name the stale candidate:\n${rendered}`);
    assert(
      rendered.includes("Declared present-paywall selected") && rendered.includes("verified present-paywall unresolved"),
      `brief must contrast draft vs pin:\n${rendered}`,
    );
    assert(rendered.includes("signup job=conversion interaction=static-document"), `brief must keep purpose independent of technique:\n${rendered}`);
    assert(!rendered.includes("scroll-linked"), "conversion purpose must not invent scroll-linked technique");
    assert(rendered.includes("semantic review or device observation"), "brief must not overclaim proof strength");
    const producerPrompt = buildWorkerPrompt(brief, workspace, skillRoot);
    const verifierPrompt = buildVerifierPrompt(brief, workspace, skillRoot, [
      {
        artifactId: "artifact.onboarding-screen-control-paywall-contract",
        path: "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md",
        evidence: ["draft contract phrases"],
      },
    ]);
    assertPromptFollowsVerifiedPin(producerPrompt, "producer prompt");
    assertPromptFollowsVerifiedPin(verifierPrompt, "verifier prompt");
    const omittedWorkspace = buildWorkerPrompt(composeNodeBrief(plan.nodes[0]!, plan), workspace, skillRoot);
    assert(!omittedWorkspace.includes("Binding lifecycle"), "omitting the workspace must not invent a verified pin");
    const gate = spawnSync(
      resolveTsxBin(skillRoot),
      [
        path.join(skillRoot, "checks/validation/business/experience/check-onboarding-evidence-packet.ts"),
        "--root",
        workspace,
        "--node",
        "ONB-17",
        "--path",
        "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md",
      ],
      { cwd: skillRoot, encoding: "utf8" },
    );
    assert(gate.status === 1, `ONB-17 gate must hold on the verified pin, got ${String(gate.status)}\n${gate.stdout}\n${gate.stderr}`);
    assert(
      gate.stdout.includes("onboarding_evidence.onb17_paywall_goal_headline_unresolved"),
      `gate must follow verified unresolved, not the draft selected bind:\n${gate.stdout}`,
    );
    assert(!gate.stdout.includes("onboarding_evidence.onb17_paywall_goal_headline\n"), "complete draft contract phrases must not satisfy a stale candidate");
    assert(gate.stdout.includes("semantic=unknown") && gate.stdout.includes("runtime=unknown"), `gate must report structural-only strength:\n${gate.stdout}`);
  });
}
