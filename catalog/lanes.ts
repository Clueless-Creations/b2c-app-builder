import type { CatalogLane } from "./types.js";

/**
 * Ported unchanged from runtime/graph/lanes.ts (U8). `key` is typed against
 * kernel/schema/types.ts's LaneKey (the 22 business-state lane keys) rather than a bare
 * string — single source, no duplicated enum.
 */
export const lanes: readonly CatalogLane[] = [
  { id: "lane.paid-tool-routing", key: "paid_tool_routing", label: "Paid-tool routing", ownerDomainId: "domain.operations", dependencyIds: [] },
  { id: "lane.secrets", key: "secrets", label: "Secrets", ownerDomainId: "domain.operations", dependencyIds: [] },
  { id: "lane.security", key: "security", label: "Security", ownerDomainId: "domain.trust", dependencyIds: [] },
  { id: "lane.research", key: "research", label: "Research", ownerDomainId: "domain.research", dependencyIds: ["lane.paid-tool-routing"] },
  { id: "lane.traceability", key: "traceability", label: "Traceability", ownerDomainId: "domain.process", dependencyIds: ["lane.product"] },
  { id: "lane.experience", key: "experience", label: "Experience", ownerDomainId: "domain.experience", dependencyIds: ["lane.research"] },
  { id: "lane.product", key: "product", label: "Product", ownerDomainId: "domain.product", dependencyIds: ["lane.experience"] },
  { id: "lane.design", key: "design", label: "Design", ownerDomainId: "domain.design", dependencyIds: ["lane.product"] },
  {
    id: "lane.emotional-design",
    key: "emotional_design",
    label: "Emotional design",
    ownerDomainId: "domain.experience",
    dependencyIds: ["lane.experience", "lane.analytics-attribution"],
  },
  { id: "lane.content-assets", key: "content_assets", label: "Content assets", ownerDomainId: "domain.design", dependencyIds: ["lane.design"] },
  {
    id: "lane.analytics-attribution",
    key: "analytics_attribution",
    label: "Analytics and attribution",
    ownerDomainId: "domain.data",
    dependencyIds: ["lane.product"],
  },
  {
    id: "lane.paid-user-acquisition",
    key: "paid_user_acquisition",
    label: "Paid user acquisition",
    ownerDomainId: "domain.growth",
    dependencyIds: ["lane.analytics-attribution"],
  },
  { id: "lane.onboarding", key: "onboarding", label: "Onboarding", ownerDomainId: "domain.experience", dependencyIds: ["lane.analytics-attribution"] },
  { id: "lane.revenue", key: "revenue", label: "Revenue", ownerDomainId: "domain.money", dependencyIds: ["lane.product"] },
  { id: "lane.store-console", key: "store_console", label: "Store console", ownerDomainId: "domain.store", dependencyIds: ["lane.design"] },
  { id: "lane.apple-signing", key: "apple_signing", label: "Apple signing", ownerDomainId: "domain.store", dependencyIds: [] },
  { id: "lane.privacy-legal", key: "privacy_legal", label: "Privacy and legal", ownerDomainId: "domain.trust", dependencyIds: ["lane.product"] },
  { id: "lane.email", key: "email", label: "Email", ownerDomainId: "domain.operations", dependencyIds: ["lane.design"] },
  { id: "lane.orchestration", key: "orchestration", label: "Orchestration", ownerDomainId: "domain.orchestration", dependencyIds: [] },
  {
    id: "lane.engineering",
    key: "engineering",
    label: "Engineering",
    ownerDomainId: "domain.engineering",
    dependencyIds: ["lane.design", "lane.traceability"],
  },
  { id: "lane.growth", key: "growth", label: "Growth", ownerDomainId: "domain.growth", dependencyIds: ["lane.analytics-attribution"] },
  {
    id: "lane.post-launch-ops",
    key: "post_launch_ops",
    label: "Post-launch operations",
    ownerDomainId: "domain.operations",
    dependencyIds: ["lane.engineering"],
  },
] as const;
