import { readFileSync } from "node:fs";
import path from "node:path";
import { auditExcludedScripts, buildAuditPlan } from "../tooling/lib/audit-plan.js";
import { catalogId } from "./ids.js";
import type { CatalogDomain, CatalogGate } from "./types.js";

/**
 * Gates are npm scripts, not hand-authored data — duplicating them as a static array would
 * be exactly the kind of drift-prone copy R20 is retiring elsewhere. Ported from
 * runtime/graph/catalog.ts's discoverGates(), adapted to the v2 CatalogDomain shape.
 * Still dynamic: the source of truth is package.json + tooling/lib/audit-plan.ts, read at
 * catalog-build time.
 */
/**
 * Gate ownership normally follows the validator's own directory 1:1 — the same
 * checks/validation/business/<slug>/ mirroring check-gates-layout.ts already enforces, so moving a
 * script to the domain folder that actually owns it (check-gates-layout.ts's mirror rule)
 * is the same act as correcting its declared owner. A handful of validators are genuinely
 * cross-cutting (their subject spans concerns no single domain folder captures) and pin a
 * declared owner here instead of inheriting whatever folder they happen to sit in.
 *
 * Empty today: the 2026-08 graph-consolidation audit's original suspects for this list
 * (check:provider-proof, check:asc-command-contract, check:secrets) were each re-verified by
 * full read, and every one's directory placement already IS its correct, intentional owner
 * (docs/architecture.md routes cross-cutting checks to checks/validation/business/process/ by
 * design, and store/trust are the right home for the other two despite touching several
 * domains operationally). The map exists so a genuine future exception is a reviewed,
 * documented decision instead of a silent directory move quietly changing a gate's declared
 * owner — see the completeness checks in catalog/validate.ts (an override that no longer
 * differs from the directory-derived domain, or whose command no longer resolves to a
 * discovered gate, is flagged rather than rotting silently).
 */
export const GATE_OWNER_OVERRIDES: Partial<Record<string, { domainId: CatalogDomain["id"]; reason: string }>> = {};

/**
 * The live `check:*` name registry for `b2c check` (D1, #32) — recomputed from package.json on
 * every call, never from `catalog/generated/catalog.json`, so it cannot go stale between a
 * script rename and the next catalog render. Deliberately narrower than discoverGates: only the
 * ~100 `check:*` scripts (the initiating brief's own scope), not the wider gate registry that
 * also carries validate:, render:, and catalog: scripts, plus a few named others.
 */
export function checkNames(skillRoot: string): string[] {
  const packageJson = JSON.parse(readFileSync(path.join(skillRoot, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};
  return Object.keys(scripts)
    .filter((name) => name.startsWith("check:"))
    .map((name) => name.slice("check:".length))
    .sort();
}

export function discoverGates(skillRoot: string, domains: readonly CatalogDomain[]): CatalogGate[] {
  const packageJson = JSON.parse(readFileSync(path.join(skillRoot, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};
  // ADR-0002: the repository root is the package root, so the one manifest carries the repo-only
  // gates too. Register them against the repo plan instead of the installed-copy subset.
  const planIds = new Set(buildAuditPlan("repo").map((step) => step.id));

  return Object.entries(scripts)
    .filter(
      ([name]) =>
        name.startsWith("check:") ||
        name.startsWith("validate:") ||
        name.startsWith("render:") ||
        name.startsWith("catalog:") ||
        ["audit:links", "launchbench", "launchbench:lint", "test:validators", "evals:behavioral"].includes(name),
    )
    .map(([command, script]) => {
      const scriptPath = script.match(/(?:^|\s)(?:tsx\s+)([^\s]+\.ts)/)?.[1];
      const ownerDomainId = GATE_OWNER_OVERRIDES[command]?.domainId ?? inferGateDomain(scriptPath, command, domains);
      const audit = planIds.has(command) ? "required" : command in auditExcludedScripts ? "excluded" : "manual";
      return {
        id: catalogId("gate", command),
        command,
        commandManifestPath: "package.json",
        scriptPath,
        ownerDomainId,
        audit,
      } satisfies CatalogGate;
    })
    .sort((a, b) => a.command.localeCompare(b.command));
}

/**
 * Directory-derived domain for a gate's script. Exported so catalog/validate.ts can
 * independently recompute this and cross-check it against GATE_OWNER_OVERRIDES, catching a
 * stale override without duplicating the derivation logic.
 */
export function inferGateDomain(scriptPath: string | undefined, command: string, domains: readonly CatalogDomain[]): CatalogDomain["id"] {
  if (scriptPath?.startsWith("checks/validation/business/")) {
    // scriptPath looks like "checks/validation/business/<slug>/<file>.ts" — index 2 is the domain
    // slug (index 0 is "validation", index 1 is always the literal "business").
    const slugValue = scriptPath.split("/")[2];
    const domain = domains.find((candidate) => candidate.slug === slugValue);
    if (domain) return domain.id;
  }
  if (scriptPath?.startsWith("checks/validation/repository/")) return "domain.machine";
  if (command.includes("design")) return "domain.design";
  return "domain.process";
}
