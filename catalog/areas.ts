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
