import type { CatalogContextPack } from "./types.js";

/**
 * Executable role-level routing packs. A pack is deliberately a shallow list of catalog
 * references, not another prose index: the bridge resolves every id to path + loadWhen and the
 * worker prompt exposes those conditions beside the task's mandatory references. This keeps the
 * nesting useful without preloading an entire domain into every specialist context.
 */
export const contextPacks: readonly Omit<CatalogContextPack, "referenceIds">[] = [
  {
    id: "context.founder-language",
    title: "Always-on founder language",
  },
  {
    id: "context.process",
    title: "Launch process",
  },
  {
    id: "context.orchestration",
    title: "Orchestration",
  },
  {
    id: "context.operations",
    title: "Founder-zero operations",
  },
  {
    id: "context.research",
    title: "Research",
  },
  { id: "context.product", title: "Product" },
  {
    id: "context.archetypes",
    title: "Matched product archetype",
  },
  {
    id: "context.experience",
    title: "Experience",
  },
  {
    id: "context.design",
    title: "Design",
  },
  {
    id: "context.experience-cards",
    title: "Implemented emotional experience cards",
  },
  { id: "context.words", title: "Words" },
  {
    id: "context.engineering",
    title: "Engineering",
  },
  {
    id: "context.device",
    title: "Device and accessibility proof",
  },
  {
    id: "context.store",
    title: "Stores",
  },
  {
    id: "context.growth",
    title: "Growth",
  },
  {
    id: "context.launch-surfaces",
    title: "Cross-surface launch production",
  },
  { id: "context.data", title: "Analytics" },
  {
    id: "context.money",
    title: "Revenue",
  },
  { id: "context.trust", title: "Trust" },
  {
    id: "context.machine",
    title: "Skill maintenance",
  },
];
