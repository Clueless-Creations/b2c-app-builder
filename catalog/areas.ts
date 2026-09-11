import type { CatalogArea } from "./types.js";

/** Ported unchanged from runtime/graph/business-areas.ts (U8; stable grouping data, no v2 shape change needed). */
export const areas: readonly CatalogArea[] = [
  {
    id: "area.operating-system",
    name: "Operating System",
    description: "Sequences the launch and dispatches the work without confusing durable business structure with runtime execution.",
    domainIds: ["domain.process", "domain.orchestration"],
  },
  {
    id: "area.business-operations-trust",
    name: "Business Operations And Trust",
    description: "Runs founder access, account operations, security, privacy, and legal obligations.",
    domainIds: ["domain.operations", "domain.trust"],
  },
  {
    id: "area.product-experience",
    name: "Product And Experience",
    description: "Turns evidence into product scope, experience, design, and words.",
    domainIds: ["domain.research", "domain.product", "domain.experience", "domain.design", "domain.words"],
  },
  {
    id: "area.build-release",
    name: "Build And Release",
    description: "Builds, proves, signs, packages, and submits the application.",
    domainIds: ["domain.engineering", "domain.store"],
  },
  {
    id: "area.growth-revenue",
    name: "Growth And Revenue",
    description: "Prices, measures, distributes, and operates the growth system.",
    domainIds: ["domain.money", "domain.growth", "domain.data"],
  },
  {
    id: "area.skill-maintenance",
    name: "Skill Maintenance",
    description: "Keeps the installed skill, sources, graph, evals, and release contract healthy.",
    domainIds: ["domain.machine"],
  },
] as const;

/** Public browsing vocabulary. Existing area/domain IDs above remain authority contracts. */
export interface PublicBusinessArea {
  slug: string;
  name: string;
  station: string;
  description: string;
  domainIds: readonly string[];
}

export const publicBusinessAreas: readonly PublicBusinessArea[] = [
  {
    slug: "opportunity",
    name: "Opportunity",
    station: "Prep & design, menu planning",
    description: "Research users, competitors, demand, and a defensible product hypothesis.",
    domainIds: ["domain.research"],
  },
  {
    slug: "product",
    name: "Product",
    station: "Prep & design",
    description: "Define the promise, first value, core loop, complete scope, and success measures.",
    domainIds: ["domain.product"],
  },
  {
    slug: "experience",
    name: "Experience",
    station: "Prep & design",
    description: "Develop a distinct identity, onboarding, interaction, motion, accessible states, and user-facing words.",
    domainIds: ["domain.experience", "domain.design", "domain.words"],
  },
  {
    slug: "engineering",
    name: "Engineering",
    station: "The hot line",
    description: "Build and release native and web surfaces with explicit contracts, runtime verification, privacy, and security.",
    domainIds: ["domain.engineering", "domain.store", "domain.trust"],
  },
  {
    slug: "revenue-and-growth",
    name: "Revenue and growth",
    station: "Front of house",
    description: "Establish subscriptions, acquisition, funnels, attribution, and lifecycle work.",
    domainIds: ["domain.money", "domain.growth", "domain.data"],
  },
  {
    slug: "learning-and-operations",
    name: "Learning and operations",
    station: "The pass and the office",
    description: "Inspect evidence, plan improvements, support users, coordinate work, and maintain the business.",
    domainIds: ["domain.data", "domain.operations", "domain.process", "domain.orchestration"],
  },
];
