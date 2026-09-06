import type { RepositoryProfileId } from "../../kernel/schema/types.js";
import type { CatalogRepositoryProfile } from "../types.js";
import type { FrontDoorPolicy } from "./types.js";

const SHARED_GENERATED = [
  "state/generated/requirement-inventory.json",
  "state/generated/requirement-inventory.md",
  "catalog/generated/routing.md",
  "catalog/generated/spine.md",
  "catalog/generated/contracts.md",
  "catalog/generated/catalog.json",
  "catalog/generated/packs.json",
  "catalog/generated/repository-profiles.md",
] as const;

export const repositoryProfiles: readonly CatalogRepositoryProfile[] = [
  {
    id: "app-source",
    title: "App source repository",
    description: "Consumer app source. Canonical product evidence lives here.",
    responsibility: "Own PRODUCT.md, app source, and the safety artifacts for capabilities this app uses.",
    alwaysCanonical: ["PRODUCT.md"],
    alwaysGenerated: [...SHARED_GENERATED],
    requireReadme: true,
    requireCommunityHealth: false,
  },
  {
    id: "founder-operating",
    title: "Founder operating repository",
    description: "Private founder operating workspace. Public community files are not a front door.",
    responsibility: "Own reducer state, operating evidence, and safety artifacts. Do not require public OSS community files.",
    alwaysCanonical: ["state/business-state.json"],
    alwaysGenerated: [...SHARED_GENERATED],
    requireReadme: false,
    requireCommunityHealth: false,
  },
  {
    id: "public-package",
    title: "Public package repository",
    description: "Public engine or package. Community front-door files are required.",
    responsibility: "Own the public README and community health files plus the safety artifacts for capabilities this package uses.",
    alwaysCanonical: ["README.md"],
    alwaysGenerated: [...SHARED_GENERATED],
    requireReadme: true,
    requireCommunityHealth: true,
  },
  {
    id: "marketing-site",
    title: "Marketing site repository",
    description: "Public marketing site. Landing copy is canonical. Community health files are not required.",
    responsibility: "Own the landing surface contract and the safety artifacts for capabilities this site uses.",
    alwaysCanonical: ["growth/landing/README.md"],
    alwaysGenerated: [...SHARED_GENERATED],
    requireReadme: true,
    requireCommunityHealth: false,
  },
];

export function findRepositoryProfile(id: string | undefined): CatalogRepositoryProfile | undefined {
  return repositoryProfiles.find((profile) => profile.id === id);
}

export function frontDoorPolicyFor(id: RepositoryProfileId): FrontDoorPolicy {
  const profile = findRepositoryProfile(id);
  if (!profile) {
    return { requireReadme: true, requireCommunityHealth: true };
  }
  switch (id) {
    case "app-source":
    case "founder-operating":
    case "public-package":
    case "marketing-site":
      return { requireReadme: profile.requireReadme, requireCommunityHealth: profile.requireCommunityHealth };
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}

export function communityHealthPaths(): readonly string[] {
  return ["CONTRIBUTING.md", ".github/SECURITY.md", ".github/CODE_OF_CONDUCT.md"];
}
