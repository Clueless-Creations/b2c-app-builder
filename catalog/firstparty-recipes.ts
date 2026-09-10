import type { Catalog, CatalogWorkflowDef } from "./types.js";

/** Authored business responsibilities. Runtime consumes their verified package projection. */
export const FIRSTPARTY_WORKER_TARGET = { platform: "host", runtime: "agent-cli" } as const;
export const FIRSTPARTY_WORKER_PROVIDER = "b2c/consumer-business-worker";
export const FIRSTPARTY_BUSINESS_RECIPE = {
  id: "b2c/complete-consumer-business",
  version: "1.0.0",
  title: "Complete consumer business",
  description:
    "Create, verify, and operate the accepted consumer business through bounded host-agent work. Product platforms remain authored in product.yaml; external effects retain their authority and evidence requirements.",
  policy: { maxRepairAttempts: 2, independentReview: true as const },
} as const;

// This inventory is deliberately explicit. A new workflow needs a reviewed responsibility
// assignment; the generator cannot silently call its instructions provider-neutral.
export const FIRSTPARTY_RESPONSIBILITY_GROUPS = [
  {
    domainId: "domain.orchestration",
    capabilityId: "b2c/business-coordination",
    title: "Business coordination",
    description: "Sequence and reconcile the work of creating and operating a consumer business.",
    workflows: [
      "workflow.orchestration.session-continuity-resume",
      "workflow.orchestration.orient-scaffold-and-state-cockpit-upkeep",
      "workflow.orchestration.full-launch-program",
      "workflow.orchestration.full-launch-closeout",
    ],
  },
  {
    domainId: "domain.process",
    capabilityId: "b2c/business-readiness",
    title: "Business readiness",
    description: "Keep contracts, evidence, and change propagation aligned.",
    workflows: [
      "workflow.process.provider-proof-verification",
      "workflow.process.change-cascade",
      "workflow.process.launch-trace-and-build-contracts",
      "workflow.process.launchbench-failure-cards-coverage-audit",
      "workflow.process.repository-profile-contract",
    ],
  },
  {
    domainId: "domain.operations",
    capabilityId: "b2c/business-operations",
    title: "Business operations",
    description: "Operate support, retention, financial review, and bounded automation.",
    workflows: [
      "workflow.operations.paid-tool-routing-and-fallback",
      "workflow.operations.live-app-store-portfolio",
      "workflow.operations.secrets-baseline-and-routing",
      "workflow.operations.resend-email-ops",
      "workflow.operations.post-launch-operations",
      "workflow.operations.support-queue-operations",
      "workflow.operations.retention-intervention",
      "workflow.operations.financial-health-review",
      "workflow.operations.scheduled-autonomy-installation",
      "workflow.operations.founder-zero-operator-bootstrap",
      "workflow.operations.agent-operations-ledger",
    ],
  },
  {
    domainId: "domain.trust",
    capabilityId: "b2c/consumer-trust",
    title: "Consumer trust",
    description: "Define and verify privacy, safety, and security obligations.",
    workflows: [
      "workflow.trust.security-architecture-and-release-gate",
      "workflow.trust.privacy-and-terms",
      "workflow.trust.community-and-user-safety",
      "workflow.trust.generative-ai-safety",
    ],
  },
  {
    domainId: "domain.product",
    capabilityId: "b2c/product-definition",
    title: "Product definition",
    description: "Translate the accepted consumer problem into purposeful product scope.",
    workflows: ["workflow.product.app-archetype-detection-and-starter"],
  },
  {
    domainId: "domain.research",
    capabilityId: "b2c/market-research",
    title: "Market research",
    description: "Test the consumer opportunity, evidence, and market assumptions.",
    workflows: ["workflow.research.research-backed-spec", "workflow.research.spec-red-team-audit", "workflow.research.localization-market-research"],
  },
  {
    domainId: "domain.experience",
    capabilityId: "b2c/product-experience",
    title: "Product experience",
    description: "Design and verify first value, onboarding, recovery, and return use.",
    workflows: [
      "workflow.experience.11-star-experience",
      "workflow.experience.emotional-experience-design-producer",
      "workflow.experience.emotional-design-audit-auditor",
      "workflow.experience.onboarding-system.onb-00-resume-scope",
      "workflow.experience.onboarding-system.onb-01-current-state-trace",
      "workflow.experience.onboarding-system.onb-02-evidence-plan",
      "workflow.experience.onboarding-system.onb-03-current-guidance",
      "workflow.experience.onboarding-system.onb-04-competitor-reviews",
      "workflow.experience.onboarding-system.onb-05-onbo-hub-atlas",
      "workflow.experience.onboarding-system.onb-06-internal-guidance-audit",
      "workflow.experience.onboarding-system.onb-07-provider-policy-landscape",
      "workflow.experience.onboarding-system.onb-08-motion-research",
      "workflow.experience.onboarding-system.onb-09-evidence-join",
      "workflow.experience.onboarding-system.onb-10-first-value-activation",
      "workflow.experience.onboarding-system.onb-11-effort-question-audit",
      "workflow.experience.onboarding-system.onb-12-state-identity-contract",
      "workflow.experience.onboarding-system.onb-13-analytics-experiments",
      "workflow.experience.onboarding-system.onb-14-trust-lifecycle-policy",
      "workflow.experience.onboarding-system.onb-15-architecture-decision",
      "workflow.experience.onboarding-system.onb-16-journey-graph",
      "workflow.experience.onboarding-system.onb-17-screen-control-paywall-contract",
      "workflow.experience.onboarding-system.onb-18-visual-design-prototype",
      "workflow.experience.onboarding-system.onb-19-implementation-cutover-contract",
      "workflow.experience.onboarding-system.onb-20-adversarial-qa",
      "workflow.experience.onboarding-system.onb-21-compound-engineering-plan",
      "workflow.experience.onboarding-conversion",
    ],
  },
  {
    domainId: "domain.design",
    capabilityId: "b2c/product-design",
    title: "Product design",
    description: "Produce original, accessible product surfaces and independent craft review.",
    workflows: [
      "workflow.design.brand-definition",
      "workflow.design.reference-pack-librarian",
      "workflow.design.design-room",
      "workflow.design.design-system-audit",
      "workflow.design.implementation-craft-audit",
      "workflow.design.token-promotion",
      "workflow.design.ux-patterns-refero",
      "workflow.design.premium-mobile-craft",
      "workflow.design.content-assets-remotion-generated-visuals",
    ],
  },
  {
    domainId: "domain.words",
    capabilityId: "b2c/consumer-writing",
    title: "Consumer writing",
    description: "Write and independently review clear, truthful consumer language.",
    workflows: ["workflow.words.writing-quality-no-slop", "workflow.words.copy-review-audit"],
  },
  {
    domainId: "domain.store",
    capabilityId: "b2c/store-distribution",
    title: "Store distribution",
    description: "Prepare and verify store assets, submissions, and release operations under authority.",
    workflows: [
      "workflow.store.aso-and-store-ops",
      "workflow.store.app-store-listing-prep-packet",
      "workflow.store.apple-signing-and-release-readiness",
      "workflow.store.apple-app-store-requirements-privacy-manifest",
      "workflow.store.store-console-workflow",
      "workflow.store.asc-cli-automation",
      "workflow.store.app-review-observe",
      "workflow.store.app-review-remediate",
      "workflow.store.app-review-resubmit",
      "workflow.store.store-screenshots-production",
      "workflow.store.google-play-release",
      "workflow.store.google-play-metadata-standing-envelope",
      "workflow.store.google-play-media-standing-envelope",
      "workflow.store.apple-store-media-standing-envelope",
      "workflow.store.google-play-testing-track-standing-envelope",
      "workflow.store.marketplace-regional-compliance",
    ],
  },
  {
    domainId: "domain.engineering",
    capabilityId: "b2c/app-engineering",
    title: "App engineering",
    description: "Build and verify app source, data, device behavior, and runtime quality.",
    workflows: [
      "workflow.engineering.source-change-manifest",
      "workflow.engineering.engineering-orchestration-ce-production-readiness",
      "workflow.engineering.backend-data-contract",
      "workflow.engineering.app-agent-roster-and-repo-entrypoints",
      "workflow.engineering.mobai-device-automation-and-demo-videos",
      "workflow.engineering.native-ios-proof-route-ladder",
      "workflow.engineering.accessibility-common-task-proof",
      "workflow.engineering.app-quality-and-vitals",
    ],
  },
  {
    domainId: "domain.data",
    capabilityId: "b2c/business-measurement",
    title: "Business measurement",
    description: "Define measurement and attribution without inventing observations.",
    workflows: ["workflow.data.analytics-and-attribution-blueprint"],
  },
  {
    domainId: "domain.growth",
    capabilityId: "b2c/customer-acquisition",
    title: "Customer acquisition",
    description: "Build and operate acquisition paths, creative, and experiments.",
    workflows: [
      "workflow.growth.paid-user-acquisition-system",
      "workflow.growth.viral-growth-loop",
      "workflow.growth.launch-narrative-and-cadence",
      "workflow.growth.geo-seo-public-visibility",
      "workflow.growth.pre-launch-funnel-landing-waitlist",
      "workflow.growth.landing-funnel-audit",
      "workflow.growth.landing-funnel-publication-and-live-proof",
      "workflow.growth.ugc-creator-engine",
      "workflow.growth.fastlane-growth-ops",
    ],
  },
  {
    domainId: "domain.money",
    capabilityId: "b2c/business-monetization",
    title: "Business monetization",
    description: "Prepare and verify offers, billing, and revenue operations under explicit authority.",
    workflows: ["workflow.money.revenue-monetization", "workflow.money.experimentation"],
  },
] as const;

/** Maintainer mechanisms stay outside a business recipe and its grantable work. */
export const FIRSTPARTY_MAINTAINER_WORKFLOWS = [
  "workflow.machine.runtime-freshness-gate-consumer-side",
  "workflow.machine.source-freshness-maintenance-maintainer",
  "workflow.machine.skill-runtime-sync-and-version-discipline-maintainer",
  "workflow.machine.founder-language-translation-maintainer",
  "workflow.machine.skill-triggering-contract-maintainer",
  "workflow.machine.asc-command-contract-maintainer",
  "workflow.machine.definition-graph-maintenance",
  "workflow.machine.eval-suite-execution-maintainer",
  "workflow.machine.learning-capture-maintainer",
  "workflow.machine.learning-corpus-refresh-maintainer",
  // ADR-0005: source adoption and upstream support maintenance are maintainer mechanisms.
  "workflow.machine.source-adoption-contributor",
  "workflow.machine.upstream-support-maintainer",
] as const;

export interface FirstpartyWorkerResponsibility {
  capabilityId: string;
  capabilityTitle: string;
  capabilityDescription: string;
  operationId: string;
  implementationId: string;
  workflow: CatalogWorkflowDef;
  validationContract?: { id: "revenuecat"; version: "1.0.0"; kind: "billing" };
}
export function firstpartyWorkerResponsibilities(catalog: Catalog): FirstpartyWorkerResponsibility[] {
  const assigned = new Set<string>();
  const result: FirstpartyWorkerResponsibility[] = [];
  for (const group of FIRSTPARTY_RESPONSIBILITY_GROUPS) {
    for (const id of group.workflows) {
      if (assigned.has(id)) throw new Error(`firstparty.duplicate_responsibility:${id}`);
      const workflow = catalog.workflows.find((entry) => entry.id === id);
      if (!workflow || workflow.domainId !== group.domainId) throw new Error(`firstparty.responsibility_changed:${id}`);
      assigned.add(id);
      const suffix = id.slice("workflow.".length);
      result.push({
        capabilityId: group.capabilityId,
        capabilityTitle: group.title,
        capabilityDescription: group.description,
        operationId: `b2c/work.${suffix}`,
        implementationId: `b2c/worker.${suffix}`,
        workflow,
        ...(["workflow.money.revenue-monetization", "workflow.money.experimentation"].includes(id)
          ? { validationContract: { id: "revenuecat" as const, version: "1.0.0" as const, kind: "billing" as const } }
          : {}),
      });
    }
  }
  const excluded = new Set<string>(FIRSTPARTY_MAINTAINER_WORKFLOWS);
  for (const id of excluded) {
    const workflow = catalog.workflows.find((entry) => entry.id === id);
    if (!workflow || workflow.domainId !== "domain.machine") throw new Error(`firstparty.maintainer_scope_changed:${id}`);
  }
  for (const workflow of catalog.workflows) {
    if (!assigned.has(workflow.id) && !excluded.has(workflow.id)) throw new Error(`firstparty.unclassified_workflow:${workflow.id}`);
  }
  for (const { workflow } of result)
    for (const dependency of workflow.dependencies) {
      if (!assigned.has(dependency)) throw new Error(`firstparty.business_dependency_outside_recipe:${workflow.id}:${dependency}`);
    }
  return result;
}
