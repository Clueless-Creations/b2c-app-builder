import type { BusinessUnit } from "../kernel/schema/types.js";
import type { CatalogDomain } from "./types.js";

const SYSTEM = { grantable: false as const, system: true as const };
const MACHINE = { grantable: false as const, machine: true as const };

function grantable(operatorGroup: BusinessUnit): { grantable: true; operatorGroup: BusinessUnit } {
  return { grantable: true, operatorGroup };
}

/**
 * Ported from runtime/graph/domains.ts (U8). Field shape is unchanged, but at cutover (U11)
 * the 14 `knowledge/<slug>/README.md` routing tables named in the port ledger
 * (docs/plans/attachments/2026-08-port-ledger.md) were deleted — their sole job, the
 * per-domain routing table, is superseded by `catalog/generated/routing.md`, generated from
 * this file plus the knowledge manifests' authored `loadWhen` data (R20). `indexPath` is
 * removed for every domain whose README is gone rather than left dangling; `domain.machine`
 * keeps its `indexPath` because `checks/validation/repository/README.md` (a "merge" disposition in
 * the ledger, not "drop") still exists.
 *
 * Grantability, system/machine flags, and operator groups are catalog-owned (KTD4).
 */
export const domains: readonly CatalogDomain[] = [
  {
    id: "domain.process",
    slug: "process",
    name: "Running The Launch",
    areaIds: ["area.operating-system"],
    routeLabel: "Running the launch",
    routeWhen: "starting or auditing a launch: phases, coverage, artifact contracts, traceability, provider proof, or propagating a change across surfaces",
    order: 10,
    ...SYSTEM,
  },
  {
    id: "domain.orchestration",
    slug: "orchestration",
    name: "Driving The Work",
    areaIds: ["area.operating-system"],
    routeLabel: "Driving the work",
    routeWhen: "resuming a session, durable state, how much to decide alone, subagents, dynamic workflows, engineering routing",
    order: 20,
    ...SYSTEM,
  },
  {
    id: "domain.operations",
    slug: "operations",
    name: "Running The Business",
    areaIds: ["area.business-operations-trust"],
    routeLabel: "Running the business",
    routeWhen: "founder access and accounts, credentials and secrets, paid-tool decisions, authenticated actions, lifecycle email, and life after launch",
    order: 30,
    ...grantable("Operations"),
  },
  {
    id: "domain.research",
    slug: "research",
    name: "Market Research",
    areaIds: ["area.product-experience"],
    routeLabel: "Market research",
    routeWhen: "before the spec hardens: category economics, competitors, review mining, social language, and which storefronts and locales are worth shipping",
    order: 40,
    ...grantable("Product"),
  },
  {
    id: "domain.product",
    slug: "product",
    name: "What You're Building",
    areaIds: ["area.product-experience"],
    routeLabel: "What you're building",
    routeWhen: "scope, the core loop, V1 versus later, the copy-proof test, and shipped app archetypes",
    order: 50,
    ...grantable("Product"),
  },
  {
    id: "domain.experience",
    slug: "experience",
    name: "How The App Feels",
    areaIds: ["area.product-experience"],
    routeLabel: "How the app feels",
    routeWhen:
      "the standout moment, onboarding and activation, welcome/splash screens, engagement mechanics and their ethics limits, push lifecycle, and work targeting better-than-expected",
    order: 60,
    ...grantable("Product"),
  },
  {
    id: "domain.design",
    slug: "design",
    name: "Look And Feel",
    areaIds: ["area.product-experience", "area.build-release"],
    routeLabel: "Look and feel",
    routeWhen:
      "brand, visual system, design tokens, motion, premium in-app craft, UX patterns, screen specs, rendered design state, and generated visual assets",
    order: 70,
    ...grantable("Design"),
  },
  {
    id: "domain.words",
    slug: "words",
    name: "Every Word A User Reads",
    areaIds: ["area.product-experience", "area.growth-revenue"],
    routeLabel: "Every word a user reads",
    routeWhen: "conversion copy, every in-app string, brand voice, and the writing-quality bar for anything a human reads",
    order: 80,
    ...grantable("Product"),
  },
  {
    id: "domain.engineering",
    slug: "engineering",
    name: "Building The App",
    areaIds: ["area.build-release"],
    routeLabel: "Building the app",
    routeWhen: "architecture, backend and data contract, engineering orchestration, device and simulator proof, and agent roles handed to future sessions",
    order: 90,
    ...grantable("Engineering"),
  },
  {
    id: "domain.store",
    slug: "store",
    name: "App Store And Google Play",
    areaIds: ["area.build-release", "area.growth-revenue"],
    routeLabel: "App Store and Google Play",
    routeWhen:
      "metadata, ASO, keywords, screenshots, listing packets, privacy answers, locale choices, console walkthroughs, signing, uploads, release and rejection handling",
    order: 100,
    ...grantable("Store"),
  },
  {
    id: "domain.money",
    slug: "money",
    name: "Pricing And Getting Paid",
    areaIds: ["area.growth-revenue"],
    routeLabel: "Pricing and getting paid",
    routeWhen: "RevenueCat, Stripe, store products, paywalls, subscriptions, entitlements, webhooks, taxes, restore purchases, and purchase proof",
    order: 110,
    ...grantable("Revenue"),
  },
  {
    id: "domain.growth",
    slug: "growth",
    name: "Marketing And Growth",
    areaIds: ["area.growth-revenue"],
    routeLabel: "Marketing and growth",
    routeWhen: "paid acquisition, viral and referral loops, launch narrative, creators, scheduled social, landing and funnel pages, and search visibility",
    order: 120,
    ...grantable("Growth"),
  },
  {
    id: "domain.data",
    slug: "data",
    name: "Analytics And Tracking",
    areaIds: ["area.growth-revenue", "area.product-experience"],
    routeLabel: "Analytics and tracking",
    routeWhen: "before anything names an event: the event catalog, attribution, dashboards, funnels, flags, experiments, and replay",
    order: 130,
    ...grantable("Analytics"),
  },
  {
    id: "domain.trust",
    slug: "trust",
    name: "Privacy, Security, And Legal",
    areaIds: ["area.business-operations-trust", "area.build-release"],
    routeLabel: "Privacy, security, and legal",
    routeWhen: "threat modeling, platform hardening, scans, privacy policy and terms, account and data deletion, and store privacy disclosures",
    order: 140,
    ...grantable("Trust"),
  },
  {
    id: "domain.machine",
    slug: "machine",
    name: "The Skill's Own Upkeep",
    areaIds: ["area.skill-maintenance"],
    indexPath: "checks/validation/repository/README.md",
    routeLabel: "Maintaining the skill",
    routeWhen: "versioning, graph integrity, evals, source freshness, package parity, and runtime synchronization",
    order: 150,
    ...MACHINE,
  },
] as const;
