#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { isMainModule, parseArgs } from "../../kernel/lib/cli.js";
import { resolveWorkspacePaths } from "../../kernel/session/run.js";
import { validateControl } from "../../kernel/schema/index.js";
import type { ControlFile } from "../../kernel/schema/types.js";
import type { CatalogInput } from "../../kernel/engine/compile.js";
import { PROVISIONING_MANIFEST, type RequirementKind } from "./requirements.js";
import {
  lookupDopplerSecretNames,
  lookupEnvFileKeys,
  resolveManifest,
  type ProviderResolution,
  type RequirementResolution,
  type ResolveSources,
} from "./resolve.js";

/**
 * The founder-facing provisioning CLI (KTD-provisioning): turns the static manifest
 * (requirements.ts) plus live presence checks (resolve.ts) into two things a founder or an
 * onboarding session actually uses —
 *
 *   plan   renders the PROVISIONING CHECKLIST: everything a founder should set up once, upfront,
 *          grouped by what it unlocks, in plain language (no internal vocabulary — the digest
 *          blocklist convention applies here too).
 *   check  verifies what's set up right now and exits non-zero when something required for the
 *          currently-granted units is missing, naming exactly what and how to fix it.
 *
 * Usage:
 *   tsx adapters/provisioning/cli.ts plan  --workspace <dir> [--env-file <path>] [--doppler-project X --doppler-config Y]
 *   tsx adapters/provisioning/cli.ts check --workspace <dir> [--env-file <path>] [--doppler-project X --doppler-config Y] [--brief <path>]
 *
 * Exit codes: 0 = ran (plan always; check when nothing required is missing), 1 = bad invocation
 * or (check only) something required is missing, 2 = unknown subcommand.
 */

const HUMAN_NAMES: Record<string, string> = {
  "provider.doppler": "Doppler (secret storage)",
  "provider.resend": "Resend (email)",
  "provider.posthog": "PostHog (product analytics)",
  "provider.revenuecat": "RevenueCat (subscriptions)",
  "provider.stripe": "Stripe (web billing)",
  "provider.sentry": "Sentry (crash & error monitoring)",
  "provider.app-store-connect": "App Store Connect (iOS distribution)",
  "provider.google-play": "Google Play Console (Android distribution)",
  "provider.paid-ad-channels": "Paid ad channels (Meta / TikTok / Google / Apple Search Ads)",
  "provider.refero": "Refero (UX pattern research)",
  "provider.higgsfield": "Higgsfield (AI-generated marketing visuals)",
  "provider.mobai": "MobAI (device automation & demo capture)",
  "provider.security-review": "Security review scanner",
  "provider.app-store-screenshots": "App Store screenshot composer",
  "provider.aso-skills": "ASO specialist skill pack",
  "provider.in-app-ios-simulator": "iOS Simulator (local Mac)",
};

function humanName(providerId: string): string {
  return HUMAN_NAMES[providerId] ?? providerId;
}

function whereText(kind: RequirementKind, providerId: string): string {
  if (kind === "secret") return "Set this in Doppler (preferred) or this business's .env file — never paste it into chat.";
  if (kind === "config") return "Record this as workspace config, alongside your Doppler/.env values.";
  return `This isn't a key or a file value — confirm it directly with ${humanName(providerId)}'s own dashboard or setup flow, then tell your agent it's done.`;
}

function statusTag(status: RequirementResolution["status"]): string {
  if (status === "satisfied") return "already set";
  if (status === "missing") return "still needed";
  return "can't check automatically";
}

function loadControl(controlPath: string): ControlFile | undefined {
  if (!existsSync(controlPath)) return undefined;
  try {
    const raw: unknown = JSON.parse(readFileSync(controlPath, "utf8"));
    const result = validateControl(raw);
    return result.valid ? result.value : undefined;
  } catch {
    return undefined;
  }
}

function loadCatalog(catalogPath: string): CatalogInput | undefined {
  if (!existsSync(catalogPath)) return undefined;
  try {
    return JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogInput;
  } catch {
    return undefined;
  }
}

function loadFounderContactEmail(briefPath: string | undefined): string | undefined {
  if (!briefPath || !existsSync(briefPath)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(briefPath, "utf8")) as { founderContact?: { email?: string } };
    return raw.founderContact?.email;
  } catch {
    return undefined;
  }
}

function buildSources(args: Record<string, string>, workspace: string, control: ControlFile | undefined): ResolveSources {
  const dopplerProject = args["doppler-project"] ?? control?.provisioning?.dopplerProject;
  const dopplerConfig = args["doppler-config"] ?? control?.provisioning?.dopplerConfig;
  const doppler = lookupDopplerSecretNames({ workspaceDir: workspace, project: dopplerProject, config: dopplerConfig });

  // Two-tier composition (knowledge/operations/doppler-organization.md): a shared `platform`
  // project plus this business's own project. Cross-project inheritance is a paid Doppler
  // feature, so the tiers are composed here — a second, independent lookup scoped to the
  // platform project — rather than relied on from Doppler itself. Only attempted when a
  // platform project is actually configured; there is no directory-scoped fallback for it the
  // way the business tier has (the platform project is always named explicitly).
  const dopplerPlatformProject = args["doppler-platform-project"] ?? control?.provisioning?.dopplerPlatformProject;
  const dopplerPlatformConfig = args["doppler-platform-config"] ?? control?.provisioning?.dopplerPlatformConfig;
  const dopplerPlatform = dopplerPlatformProject
    ? lookupDopplerSecretNames({ workspaceDir: workspace, project: dopplerPlatformProject, config: dopplerPlatformConfig })
    : undefined;

  const envFile = args["env-file"] ? lookupEnvFileKeys(path.resolve(args["env-file"])) : { found: false, keys: new Set<string>() };
  return {
    dopplerNames: doppler.names,
    dopplerReachable: doppler.reachable,
    dopplerDetail: doppler.detail,
    dopplerPlatformNames: dopplerPlatform?.names,
    dopplerPlatformReachable: dopplerPlatform?.reachable,
    dopplerPlatformDetail: dopplerPlatform?.detail,
    envKeys: envFile.keys,
    envFileFound: envFile.found,
    envFileRequested: Boolean(args["env-file"]),
    provisioningConfig: control?.provisioning,
    founderContactEmail: loadFounderContactEmail(args.brief),
  };
}

/** providerId -> the set of granted domains' catalog workflows actually reference it. Data-driven off the workspace's own catalog.json rather than a hand-maintained second copy of the provider/domain pairing catalog/workflows/*.ts already declares. */
function inScopeProviderIds(control: ControlFile | undefined, catalog: CatalogInput | undefined): ReadonlySet<string> {
  const manifestIds = new Set(PROVISIONING_MANIFEST.map((provider) => provider.providerId));
  if (!control || !catalog) return manifestIds; // can't determine scope yet — fail safe by checking everything

  const grantedDomains = new Set(Object.keys(control.grants));
  const scoped = new Set<string>();
  // provider.doppler underlies every autonomous session regardless of which domain is granted
  // (kernel/session/run.ts wires doppler_auth as a global prerequisite, not a per-domain one).
  if (manifestIds.has("provider.doppler")) scoped.add("provider.doppler");
  // provider.resend gets the identical carve-out: kernel/session/run.ts's finish() calls
  // pushDigest(...) on EVERY exit path of EVERY scheduled session (nothing_to_do,
  // workspace_not_ready, crashed, parked...), independent of which domains are granted — it is
  // not gated behind domain.operations the way workflow.operations.resend-email-ops is. Without
  // this, a business that granted only e.g. Product/Design would pass `provisioning check` and
  // then silently fail to email its digest, exactly the plan-time-vs-runtime gap this feature
  // exists to close.
  if (manifestIds.has("provider.resend")) scoped.add("provider.resend");
  for (const workflow of catalog.workflows) {
    if (!grantedDomains.has(workflow.domainId)) continue;
    for (const providerId of workflow.providerIds) {
      if (manifestIds.has(providerId)) scoped.add(providerId);
    }
  }
  return scoped;
}

function renderPlan(resolutions: readonly ProviderResolution[]): string {
  const lines: string[] = [];
  lines.push("PROVISIONING CHECKLIST");
  lines.push("=======================");
  lines.push(
    "Set these up once, before autonomous work in the matching area can run for real. Nothing here blocks exploring or planning — only doing the real thing.",
  );
  lines.push("");
  for (const provider of resolutions) {
    lines.push(`## ${humanName(provider.providerId)}`);
    const manifestEntry = PROVISIONING_MANIFEST.find((entry) => entry.providerId === provider.providerId);
    if (manifestEntry) lines.push(`What this turns on: ${manifestEntry.unlocks}`);
    lines.push("");
    for (const requirement of provider.requirements) {
      lines.push(`- [${requirement.status === "satisfied" ? "x" : " "}] ${requirement.name} (${statusTag(requirement.status)})`);
      lines.push(`    Where it goes: ${whereText(requirement.kind, provider.providerId)}`);
      lines.push(`    Why: ${findWhy(provider.providerId, requirement.name)}`);
      // Always shown, not just when missing: for a satisfied Doppler-backed item this is the
      // only place a founder sees which tier actually supplied it (their business's own project
      // vs. the shared platform project) — useful information the two-tier composition (KTD-
      // provisioning) makes possible, not just a debugging aid for the unsatisfied case.
      lines.push(`    Current check: ${requirement.reason}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function findWhy(providerId: string, requirementName: string): string {
  const provider = PROVISIONING_MANIFEST.find((entry) => entry.providerId === providerId);
  const requirement = provider?.requirements.find((entry) => entry.name === requirementName);
  return requirement?.why ?? "";
}

function renderCheck(resolutions: readonly ProviderResolution[], inScope: ReadonlySet<string>): { output: string; missingCount: number } {
  const lines: string[] = [];
  lines.push("PROVISIONING CHECK");
  lines.push("===================");
  let satisfied = 0;
  let missingCount = 0;
  let unverifiable = 0;
  const missingLines: string[] = [];

  for (const provider of resolutions) {
    if (!inScope.has(provider.providerId)) continue;
    for (const requirement of provider.requirements) {
      if (requirement.status === "satisfied") satisfied += 1;
      else if (requirement.status === "missing") missingCount += 1;
      else unverifiable += 1;
      if (requirement.status === "missing") {
        missingLines.push(`- [${humanName(provider.providerId)}] ${requirement.name}`);
        missingLines.push(`    ${whereText(requirement.kind, provider.providerId)}`);
        missingLines.push(`    ${requirement.reason}`);
      }
    }
  }

  lines.push(`${satisfied} already set, ${missingCount} still needed, ${unverifiable} can't be checked automatically.`);
  lines.push("");
  if (missingCount > 0) {
    lines.push("Still needed before autonomous work in this area can run for real:");
    lines.push(...missingLines);
  } else {
    lines.push("Nothing required is missing right now.");
  }
  return { output: lines.join("\n"), missingCount };
}

function main(): number {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command !== "plan" && command !== "check") {
    console.error('provisioning.unknown_command: expected "plan" or "check" as the first argument');
    return 2;
  }
  const args = parseArgs(argv.slice(1));
  if (Object.hasOwn(args, "catalog")) {
    console.error("provisioning.unsupported_argument: --catalog is not supported. Use composition activation to change the workspace pin.");
    return 1;
  }
  if (!args.workspace) {
    console.error("provisioning.missing_argument: --workspace is required");
    return 1;
  }
  const workspace = path.resolve(args.workspace);
  const paths = resolveWorkspacePaths(workspace);
  const control = loadControl(paths.control);
  const catalog = loadCatalog(paths.catalog);

  const sources = buildSources(args, workspace, control);
  const resolutions = resolveManifest(sources);

  if (command === "plan") {
    console.log(renderPlan(resolutions));
    return 0;
  }

  const inScope = inScopeProviderIds(control, catalog);
  const { output, missingCount } = renderCheck(resolutions, inScope);
  console.log(output);
  return missingCount > 0 ? 1 : 0;
}

// Named exports so fixtures can drive plan/check output shape without spawning a subprocess for
// every scenario; the spawned-subprocess path (via isMainModule below) is exercised too, for the
// real exit-code contract.
export { buildSources, inScopeProviderIds, renderCheck, renderPlan };

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
