import { workerArtifactInputSchema, workerArtifactOutputSchema, workerArtifactEvidenceSchema } from "../contracts/worker-artifact.js";
import { workerContextFingerprint } from "../kernel/composition/worker-context.js";
import { toCatalogInput } from "./bridge.js";
import type { Catalog } from "./types.js";
import { FIRSTPARTY_WORKER_TARGET, FIRSTPARTY_WORKER_PROVIDER, FIRSTPARTY_BUSINESS_RECIPE, firstpartyWorkerResponsibilities } from "./firstparty-recipes.js";
import { z } from "zod";
import { mobileRequestSchema, mobileResultSchema, mobileObservationSchema } from "../contracts/mobile-operation.js";
import type { Extension } from "../contracts/extensions/contract.js";

/** Authored firstparty extension declarations. Public discovery is a projection of the verified package. */
export const firstpartyProviders: NonNullable<Extension["providers"]> = [
  {
    id: "b2c/revenuecat",
    version: "1.0.0",
    title: "RevenueCat",
    description:
      "Declared paywall, purchase, and entitlement responsibilities. Existing guidance and integrations do not yet implement the public composition execution contract.",
  },
  {
    id: "b2c/superwall",
    version: "1.0.0",
    title: "Superwall",
    description:
      "Declared paywall presentation responsibility alongside a purchase and entitlement owner. Public execution support is planned; experiment assignment is a separate future operation.",
  },
  {
    id: "b2c/host-native-mobile",
    version: "1.0.0",
    title: "Host-native mobile tools",
    description:
      "Preferred default when the current agent host already exposes native tools covering the requested target and operations. Actual availability must be checked at execution; this declaration does not probe the host or provide an execution adapter.",
  },
  {
    id: "b2c/mobai",
    version: "1.0.0",
    title: "MobAI",
    description:
      "Alternative mobile operation provider for an explicit binding or requirements the available native route cannot cover. Per-operation support and evidence must be verified; public execution adapter is not implemented.",
  },
];
export const firstpartyCapabilities: Extension["capabilities"] = [
  {
    id: "b2c/monetization",
    version: "1.0.0",
    title: "Monetization",
    description:
      "Present an offer, complete a purchase, and read authoritative entitlement state. Operation execution schemas remain experimental until provider conformance is proven.",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    knowledge: [],
    operations: [
      {
        id: "b2c/monetization.present-paywall",
        title: "Present paywall",
        inputSchema: "b2c/monetization-unavailable",
        outputSchema: "b2c/monetization-unavailable",
        evidenceSchema: "b2c/monetization-unavailable",
        effect: "mutate",
        acceptance: ["Current independent provider or device readback matches the exact operation and target."],
      },
      {
        id: "b2c/monetization.purchase",
        title: "Purchase",
        inputSchema: "b2c/monetization-unavailable",
        outputSchema: "b2c/monetization-unavailable",
        evidenceSchema: "b2c/monetization-unavailable",
        effect: "mutate",
        acceptance: ["Current independent provider or device readback matches the exact operation and target."],
      },
      {
        id: "b2c/monetization.read-entitlement",
        title: "Read entitlement",
        inputSchema: "b2c/monetization-unavailable",
        outputSchema: "b2c/monetization-unavailable",
        evidenceSchema: "b2c/monetization-unavailable",
        effect: "observe",
        acceptance: ["Current independent provider or device readback matches the exact operation and target."],
      },
    ],
  },
  {
    id: "b2c/mobile-app-operation",
    version: "1.0.0",
    title: "Mobile app operation",
    description:
      "Launch, inspect, interact with, and capture an app for exploration, functional and accessibility checks, design review, screenshots, and demo source footage. Capture is not acceptance or finished creative.",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    knowledge: [],
    operations: [
      {
        id: "b2c/mobile-app-operation.launch",
        title: "Launch",
        inputSchema: "b2c/mobile-input",
        outputSchema: "b2c/mobile-output",
        evidenceSchema: "b2c/mobile-evidence",
        effect: "mutate",
        acceptance: ["Current independent provider or device readback matches the exact operation and target."],
      },
      {
        id: "b2c/mobile-app-operation.inspect",
        title: "Inspect",
        inputSchema: "b2c/mobile-input",
        outputSchema: "b2c/mobile-output",
        evidenceSchema: "b2c/mobile-evidence",
        effect: "observe",
        acceptance: ["Current independent provider or device readback matches the exact operation and target."],
      },
      {
        id: "b2c/mobile-app-operation.interact",
        title: "Interact",
        inputSchema: "b2c/mobile-input",
        outputSchema: "b2c/mobile-output",
        evidenceSchema: "b2c/mobile-evidence",
        effect: "mutate",
        acceptance: ["Current independent provider or device readback matches the exact operation and target."],
      },
      {
        id: "b2c/mobile-app-operation.capture-screenshot",
        title: "Capture screenshot",
        inputSchema: "b2c/mobile-input",
        outputSchema: "b2c/mobile-output",
        evidenceSchema: "b2c/mobile-evidence",
        effect: "observe",
        acceptance: ["Current independent provider or device readback matches the exact operation and target."],
      },
      {
        id: "b2c/mobile-app-operation.record-video",
        title: "Record video",
        inputSchema: "b2c/mobile-input",
        outputSchema: "b2c/mobile-output",
        evidenceSchema: "b2c/mobile-evidence",
        effect: "observe",
        acceptance: ["Current independent provider or device readback matches the exact operation and target."],
      },
    ],
  },
];
export const firstpartyImplementations: Extension["implementations"] = [
  {
    id: "b2c/revenuecat.present-paywall",
    version: "1.0.0",
    provider: "b2c/revenuecat",
    description:
      "Declared paywall, purchase, and entitlement responsibilities. Existing guidance and integrations do not yet implement the public composition execution contract.",
    operation: "b2c/monetization.present-paywall",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/revenuecat.purchase",
    version: "1.0.0",
    provider: "b2c/revenuecat",
    description:
      "Declared paywall, purchase, and entitlement responsibilities. Existing guidance and integrations do not yet implement the public composition execution contract.",
    operation: "b2c/monetization.purchase",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/revenuecat.read-entitlement",
    version: "1.0.0",
    provider: "b2c/revenuecat",
    description:
      "Declared paywall, purchase, and entitlement responsibilities. Existing guidance and integrations do not yet implement the public composition execution contract.",
    operation: "b2c/monetization.read-entitlement",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/superwall.present-paywall",
    version: "1.0.0",
    provider: "b2c/superwall",
    description:
      "Declared paywall presentation responsibility alongside a purchase and entitlement owner. Public execution support is planned; experiment assignment is a separate future operation.",
    operation: "b2c/monetization.present-paywall",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/host-native-mobile.launch",
    version: "1.0.0",
    provider: "b2c/host-native-mobile",
    description:
      "Preferred default when the current agent host already exposes native tools covering the requested target and operations. Actual availability must be checked at execution; this declaration does not probe the host or provide an execution adapter.",
    operation: "b2c/mobile-app-operation.launch",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/host-native-mobile.inspect",
    version: "1.0.0",
    provider: "b2c/host-native-mobile",
    description:
      "Preferred default when the current agent host already exposes native tools covering the requested target and operations. Actual availability must be checked at execution; this declaration does not probe the host or provide an execution adapter.",
    operation: "b2c/mobile-app-operation.inspect",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/host-native-mobile.interact",
    version: "1.0.0",
    provider: "b2c/host-native-mobile",
    description:
      "Preferred default when the current agent host already exposes native tools covering the requested target and operations. Actual availability must be checked at execution; this declaration does not probe the host or provide an execution adapter.",
    operation: "b2c/mobile-app-operation.interact",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/host-native-mobile.capture-screenshot",
    version: "1.0.0",
    provider: "b2c/host-native-mobile",
    description:
      "Preferred default when the current agent host already exposes native tools covering the requested target and operations. Actual availability must be checked at execution; this declaration does not probe the host or provide an execution adapter.",
    operation: "b2c/mobile-app-operation.capture-screenshot",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/host-native-mobile.record-video",
    version: "1.0.0",
    provider: "b2c/host-native-mobile",
    description:
      "Preferred default when the current agent host already exposes native tools covering the requested target and operations. Actual availability must be checked at execution; this declaration does not probe the host or provide an execution adapter.",
    operation: "b2c/mobile-app-operation.record-video",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/mobai.launch",
    version: "1.0.0",
    provider: "b2c/mobai",
    description:
      "Alternative mobile operation provider for an explicit binding or requirements the available native route cannot cover. Per-operation support and evidence must be verified; public execution adapter is not implemented.",
    operation: "b2c/mobile-app-operation.launch",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/mobai.inspect",
    version: "1.0.0",
    provider: "b2c/mobai",
    description:
      "Alternative mobile operation provider for an explicit binding or requirements the available native route cannot cover. Per-operation support and evidence must be verified; public execution adapter is not implemented.",
    operation: "b2c/mobile-app-operation.inspect",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/mobai.interact",
    version: "1.0.0",
    provider: "b2c/mobai",
    description:
      "Alternative mobile operation provider for an explicit binding or requirements the available native route cannot cover. Per-operation support and evidence must be verified; public execution adapter is not implemented.",
    operation: "b2c/mobile-app-operation.interact",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/mobai.capture-screenshot",
    version: "1.0.0",
    provider: "b2c/mobai",
    description:
      "Alternative mobile operation provider for an explicit binding or requirements the available native route cannot cover. Per-operation support and evidence must be verified; public execution adapter is not implemented.",
    operation: "b2c/mobile-app-operation.capture-screenshot",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
  {
    id: "b2c/mobai.record-video",
    version: "1.0.0",
    provider: "b2c/mobai",
    description:
      "Alternative mobile operation provider for an explicit binding or requirements the available native route cannot cover. Per-operation support and evidence must be verified; public execution adapter is not implemented.",
    operation: "b2c/mobile-app-operation.record-video",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    mode: "manual",
    sdkRange: "^1.0.0",
    limitations: ["Declared provider responsibility; no trusted execution route is installed by this declaration."],
    knowledge: [],
    connectionRequired: true,
    maturity: "experimental",
  },
];
export const firstpartyRecipes: Extension["recipes"] = [
  {
    id: "b2c/subscription-app",
    version: "1.0.0",
    title: "Subscription app",
    description:
      "Initial monetization composition for a consumer subscription app. This declaration does not yet arrange the full research, design, build, launch, and operating loop.",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    maturity: "experimental",
    workflows: [],
    operations: [
      {
        operation: "b2c/monetization.present-paywall",
        implementation: "b2c/revenuecat.present-paywall",
        required: true,
        workflowIds: [],
      },
      {
        operation: "b2c/monetization.purchase",
        implementation: "b2c/revenuecat.purchase",
        required: true,
        workflowIds: [],
      },
      {
        operation: "b2c/monetization.read-entitlement",
        implementation: "b2c/revenuecat.read-entitlement",
        required: true,
        workflowIds: [],
      },
    ],
    policy: {
      maxRepairAttempts: 2,
      independentReview: true,
    },
  },
  {
    id: "b2c/mobile-app-capture",
    version: "1.0.0",
    title: "Mobile app capture",
    description:
      "Initial iOS/SwiftUI declaration for app interaction and raw screenshot or video capture. Defaults to host-native tools; preview checks neither host availability nor app state. Finished marketing creative and acceptance are downstream responsibilities.",
    targets: [
      {
        platform: "ios",
        runtime: "swiftui",
      },
    ],
    maturity: "experimental",
    workflows: [],
    operations: [
      {
        operation: "b2c/mobile-app-operation.launch",
        implementation: "b2c/host-native-mobile.launch",
        required: true,
        workflowIds: [],
      },
      {
        operation: "b2c/mobile-app-operation.inspect",
        implementation: "b2c/host-native-mobile.inspect",
        required: true,
        workflowIds: [],
      },
      {
        operation: "b2c/mobile-app-operation.interact",
        implementation: "b2c/host-native-mobile.interact",
        required: true,
        workflowIds: [],
      },
      {
        operation: "b2c/mobile-app-operation.capture-screenshot",
        implementation: "b2c/host-native-mobile.capture-screenshot",
        required: true,
        workflowIds: [],
      },
      {
        operation: "b2c/mobile-app-operation.record-video",
        implementation: "b2c/host-native-mobile.record-video",
        required: true,
        workflowIds: [],
      },
    ],
    policy: {
      maxRepairAttempts: 2,
      independentReview: true,
    },
  },
];

export const firstpartySchemas: ReadonlyArray<{ id: string; path: string; schema: unknown }> = [
  { id: "b2c/mobile-input", path: "schemas/mobile-input.json", schema: z.toJSONSchema(mobileRequestSchema) },
  { id: "b2c/mobile-output", path: "schemas/mobile-output.json", schema: z.toJSONSchema(mobileResultSchema) },
  { id: "b2c/mobile-evidence", path: "schemas/mobile-evidence.json", schema: z.toJSONSchema(mobileObservationSchema) },
  {
    id: "b2c/monetization-unavailable",
    path: "schemas/monetization-unavailable.json",
    schema: { $comment: "Execution contract is not implemented; no operation input or evidence is accepted.", not: {} },
  },
];

export const firstpartyWorkerSchemas = [
  { id: "b2c/worker-input", path: "schemas/worker-input.json", schema: z.toJSONSchema(workerArtifactInputSchema) },
  { id: "b2c/worker-output", path: "schemas/worker-output.json", schema: z.toJSONSchema(workerArtifactOutputSchema) },
  { id: "b2c/worker-evidence", path: "schemas/worker-evidence.json", schema: z.toJSONSchema(workerArtifactEvidenceSchema) },
];
/** Materialize explicit authored responsibilities; never infer assignments from workflow names. */
export function firstpartyWorkerDeclarations(catalog: Catalog, knowledge: ReadonlyMap<string, { id: string; sha256: string }>) {
  const responsibilities = firstpartyWorkerResponsibilities(catalog);
  const pinned = structuredClone(catalog);
  for (const reference of pinned.references) {
    const source = knowledge.get(reference.path);
    if (!source) throw new Error(`firstparty.knowledge_missing:${reference.path}`);
    reference.resource = { path: reference.path, sha256: source.sha256, origin: "skill" };
  }
  const input = toCatalogInput(pinned);
  const capabilities: Extension["capabilities"] = [];
  const implementations: Extension["implementations"] = [];
  const recipe: Extension["recipes"][number] = {
    ...FIRSTPARTY_BUSINESS_RECIPE,
    maturity: "implemented",
    targets: [FIRSTPARTY_WORKER_TARGET],
    workflows: responsibilities.map((entry) => entry.workflow.id),
    operations: [],
  };
  for (const entry of responsibilities) {
    const workflow = input.workflows.find((workflow) => workflow.id === entry.workflow.id);
    const role = catalog.roles.find((role) => role.id === entry.workflow.roleId);
    if (!workflow || !role) throw new Error(`firstparty.worker_contract_missing:${entry.workflow.id}`);
    let capability = capabilities.find((capability) => capability.id === entry.capabilityId);
    if (!capability) {
      capability = {
        id: entry.capabilityId,
        version: "1.0.0",
        title: entry.capabilityTitle,
        description: entry.capabilityDescription,
        targets: [FIRSTPARTY_WORKER_TARGET],
        knowledge: [],
        operations: [],
      };
      capabilities.push(capability);
    }
    capability.operations.push({
      id: entry.operationId,
      title: entry.workflow.title,
      inputSchema: "b2c/worker-input",
      outputSchema: "b2c/worker-output",
      evidenceSchema: "b2c/worker-evidence",
      effect: entry.workflow.actionClass,
      acceptance: ["Declared workspace outputs pass deterministic checks and independent verification for the current input fingerprint."],
    });
    const references = [...(workflow.references ?? []), ...(workflow.role?.contextPacks.flatMap((pack) => pack.references) ?? [])];
    const knowledgeIds = [
      ...new Set(
        references.map((reference) => {
          const source = knowledge.get(reference.path);
          if (!source) throw new Error(`firstparty.knowledge_missing:${reference.path}`);
          return source.id;
        }),
      ),
    ];
    implementations.push({
      id: entry.implementationId,
      version: "1.0.0",
      provider: FIRSTPARTY_WORKER_PROVIDER,
      description: entry.workflow.trigger,
      operation: entry.operationId,
      targets: [FIRSTPARTY_WORKER_TARGET],
      mode: "worker-artifact",
      sdkRange: "^1.0.0",
      limitations: ["Requires a trusted host worker and independent verifier. External effects still require current authority and provider evidence."],
      knowledge: knowledgeIds,
      connectionRequired: false,
      maturity: "implemented",
      workerContext: {
        workflowId: workflow.id,
        instructions: workflow.instructions ?? "",
        providerIds: workflow.providerIds,
        contextFingerprint: workerContextFingerprint(workflow),
      },
      ...("validationContract" in entry && entry.validationContract
        ? { validationContract: entry.validationContract as NonNullable<Extension["implementations"][number]["validationContract"]> }
        : {}),
    });
    recipe.operations.push({
      operation: entry.operationId,
      implementation: entry.implementationId,
      required: true,
      workflowIds: [entry.workflow.id],
      workflowContexts: [
        {
          workflowId: entry.workflow.id,
          instructions: "implementation",
          roleInstructions: "implementation",
          neutralReferenceIds: [],
          providerReferenceIds: [...entry.workflow.referenceIds],
          neutralContextPackIds: [],
          providerContextPackIds: [...role.contextPackIds],
          neutralSkillRouteIds: [],
          providerSkillRouteIds: role.skillRoutes.map((route) => route.id),
          neutralToolRouteIds: [],
          providerToolRouteIds: role.toolRoutes.map((route) => route.id),
        },
      ],
    });
  }
  return {
    providers: [
      {
        id: FIRSTPARTY_WORKER_PROVIDER,
        version: "1.0.0",
        title: "Consumer business worker",
        description:
          "Create and independently verify existing business artifacts through a selected trusted host agent. External authority and live evidence remain separate requirements.",
      },
    ],
    capabilities,
    implementations,
    recipes: [recipe],
  };
}
