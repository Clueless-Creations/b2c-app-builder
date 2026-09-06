import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Catalog, CatalogComposition } from "../types.js";
import type { PackManifest } from "./types.js";

export const WEB_PRESENCE_SLOTS = ["offer", "channel", "conversion", "legal", "measurement", "distribution"] as const;

/** Tokens that belong only to the food-product contrast pack. */
export const FOOD_ONLY_TOKENS = ["SKU", "retailer", "manufacturing", "food-regulatory"] as const;

/** Tokens that belong only to the consumer-app pack. */
export const APP_ONLY_TOKENS = ["app-store signing", "store-console", "subscription policy"] as const;

export interface RuntimeCompositionPin {
  fingerprint: string;
  packs: CatalogComposition["packs"];
  previousFingerprint?: string;
}

export function packProjectionText(pack: PackManifest, skillRoot?: string): string {
  const bodies =
    skillRoot === undefined
      ? []
      : pack.references.map((reference) => {
          const file = path.isAbsolute(reference.path) ? reference.path : path.join(skillRoot, reference.path);
          return existsSync(file) ? readFileSync(file, "utf8") : "";
        });
  return `${JSON.stringify({
    id: pack.id,
    workflows: pack.workflows.map((workflow) => ({
      id: workflow.id,
      title: workflow.title,
      trigger: workflow.trigger,
      instructions: workflow.instructions,
    })),
    references: pack.references.map((reference) => ({
      id: reference.id,
      title: reference.title,
      path: reference.path,
      sectionId: reference.sectionId,
    })),
    domains: pack.domains.map((domain) => ({ id: domain.id, name: domain.name, routeWhen: domain.routeWhen })),
  })}\n${bodies.join("\n")}`;
}

export function forbiddenHits(text: string, tokens: readonly string[]): string[] {
  return tokens.filter((token) => text.includes(token));
}

export function pinComposition<T extends { composition?: RuntimeCompositionPin; catalogVersion?: string }>(
  manifest: T,
  composition: CatalogComposition,
  previous: { composition?: RuntimeCompositionPin; catalogVersion?: string } = manifest,
): T & { composition: RuntimeCompositionPin } {
  const previousFingerprint = previous.composition?.fingerprint ?? (previous.catalogVersion ? `catalog:${previous.catalogVersion}` : undefined);
  return {
    ...manifest,
    composition: {
      fingerprint: composition.fingerprint,
      packs: composition.packs,
      ...(previousFingerprint ? { previousFingerprint } : {}),
    },
  };
}

export function baseWorkflowsPreserved(base: Catalog, composed: Catalog): string[] {
  const composedIds = new Set(composed.workflows.map((workflow) => workflow.id));
  return base.workflows.map((workflow) => workflow.id).filter((id) => !composedIds.has(id));
}

export interface KernelIdentityHit {
  file: string;
  excerpt: string;
}

/** Kernel code must not switch on a business-pack identity. */
export function scanKernelBusinessIdentity(root: string): KernelIdentityHit[] {
  const hits: KernelIdentityHit[] = [];
  const pattern = /business-pack\.[a-z][a-z0-9-]*|["'`]business-pack\./;
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      const lines = readFileSync(full, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (!pattern.test(line)) return;
        hits.push({ file: `${path.relative(root, full)}:${index + 1}`, excerpt: line.trim() });
      });
    }
  };
  walk(root);
  return hits;
}
