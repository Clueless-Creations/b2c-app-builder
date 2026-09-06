import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The Layers onboarding contract as data, plus the read-only checks around it.
 *
 * Onboarding (`layers setup`) signs a human into Layers in a browser, stores a session in the OS
 * credential store, writes files into the repository, sends the product brief to the service, and
 * starts background jobs. None of that runs here. This module records what onboarding does so a
 * business can decide, checks that a repository is or is not onboarded by reading three paths, and
 * reconciles the provider's project binding with the workspace's selected connection.
 */
export const LAYERS_PROJECT_FILE = ".layers/project.json";
export const LAYERS_MCP_CONFIG_FILE = ".mcp.json";
export const LAYERS_SKILL_FILE = ".agents/skills/layers/SKILL.md";
export const LAYERS_ONBOARDING_FILES: readonly string[] = Object.freeze([LAYERS_PROJECT_FILE, LAYERS_MCP_CONFIG_FILE, LAYERS_SKILL_FILE]);

export interface LayersOnboardingContract {
  readonly provider: "layers-growth/layers";
  readonly documentationReadOn: "2026-09-05";
  readonly prerequisites: readonly string[];
  readonly targetSelection: string;
  readonly machineChanges: readonly string[];
  readonly repositoryChanges: readonly string[];
  readonly informationSent: readonly string[];
  readonly connectionIdentifiers: readonly string[];
  readonly humanSteps: readonly string[];
  readonly sideEffects: readonly string[];
  readonly runsWhen: "separately authorized business adoption only";
  readonly neverRunsDuring: readonly string[];
  readonly bindingReconciliation: string;
}

export const LAYERS_ONBOARDING_CONTRACT: LayersOnboardingContract = Object.freeze({
  provider: "layers-growth/layers",
  documentationReadOn: "2026-09-05",
  prerequisites: ["Node.js", "@layers/cli installed globally (npm install -g @layers/cli)", "a browser for the one-time sign-in"],
  targetSelection: "The workspace's selected connection:layers binding names the business, its Layers project id, and its environment.",
  machineChanges: ["Layers session stored in the OS credential store by `layers login`"],
  repositoryChanges: [
    `${LAYERS_PROJECT_FILE} (public ids and environment)`,
    `${LAYERS_MCP_CONFIG_FILE} (MCP client entry for the layers stdio proxy)`,
    `${LAYERS_SKILL_FILE} (provider skill text; subordinate reference material)`,
  ],
  informationSent: ["The product brief: the README's first sentence, per the documentation. The documentation does not describe sending source files."],
  connectionIdentifiers: [`Public project ids and environment recorded in ${LAYERS_PROJECT_FILE}`],
  humanSteps: ["Browser OAuth sign-in during setup", "Spend approval for each charged call at the effect boundary", "Trial cancellation decision"],
  sideEffects: [
    "Six background onboarding jobs start after setup",
    "A three-day trial auto-converts to a paid plan unless cancelled (cancel_trial_auto_renewal)",
    "Renders consume credits (25 to 400 per render as documented)",
  ],
  runsWhen: "separately authorized business adoption only",
  neverRunsDuring: ["contribution inspection", "package snapshot or activation", "fixture runs", "any work on the builder repository itself"],
  bindingReconciliation:
    "The provider project id must equal the selected connection's recorded project id and environment. A mismatch blocks execution before any transport call.",
});

export interface LayersProviderProject {
  readonly projectId: string;
  readonly environment: string;
}
export interface LayersSelectedConnection {
  readonly connection: string;
  readonly projectId: string;
  readonly environment: string;
}
export type LayersBindingCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: "layers.binding_missing" | "layers.binding_mismatch" | "layers.environment_mismatch" };

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** The provider's native binding must match the workspace's selected connection. Missing or mismatched blocks. */
export function checkBinding(providerProject: LayersProviderProject | undefined, selectedConnection: LayersSelectedConnection | undefined): LayersBindingCheck {
  if (!providerProject || !selectedConnection) return { ok: false, reason: "layers.binding_missing" };
  if (!nonEmpty(providerProject.projectId) || !nonEmpty(providerProject.environment)) return { ok: false, reason: "layers.binding_missing" };
  if (!nonEmpty(selectedConnection.connection) || !nonEmpty(selectedConnection.projectId) || !nonEmpty(selectedConnection.environment))
    return { ok: false, reason: "layers.binding_missing" };
  if (providerProject.projectId !== selectedConnection.projectId) return { ok: false, reason: "layers.binding_mismatch" };
  if (providerProject.environment !== selectedConnection.environment) return { ok: false, reason: "layers.environment_mismatch" };
  return { ok: true };
}

export interface LayersOnboardingInspection {
  readonly present: boolean;
  /** Repository-relative onboarding files that exist. `.mcp.json` counts only when it names a layers server. */
  readonly files: string[];
}

function mcpConfigNamesLayers(file: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return false;
    const servers = (parsed as { mcpServers?: unknown }).mcpServers;
    if (!servers || typeof servers !== "object") return false;
    return Object.entries(servers as Record<string, unknown>).some(([name, server]) => {
      if (name.toLowerCase() === "layers") return true;
      const command = server && typeof server === "object" ? (server as { command?: unknown }).command : undefined;
      return typeof command === "string" && path.basename(command) === "layers";
    });
  } catch {
    return false;
  }
}

/** Read-only. Looks at the three onboarding paths and never creates, writes, or follows a symlink. */
export function inspectRepositoryForOnboarding(root: string): LayersOnboardingInspection {
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error("layers.inspection_root_missing");
  const files: string[] = [];
  for (const relative of LAYERS_ONBOARDING_FILES) {
    const file = path.join(root, relative);
    if (!existsSync(file)) continue;
    const stats = lstatSync(file);
    if (stats.isSymbolicLink() || !stats.isFile()) continue;
    if (relative === LAYERS_MCP_CONFIG_FILE) {
      if (mcpConfigNamesLayers(file)) files.push(relative);
      continue;
    }
    files.push(relative);
  }
  return { present: files.length > 0, files };
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

/**
 * The brief the provider holds must carry the promise the business accepted. The README's first
 * sentence is what setup sends; if it drifted from `product.yaml`, the provider is working from
 * a different product than the one the founder approved.
 */
export function assertBriefMatchesIntent(providerBrief: string, acceptedIntent: { promise: string; audience?: string }): void {
  const brief = normalize(providerBrief);
  const promise = normalize(acceptedIntent.promise);
  if (!promise || !brief.includes(promise)) throw new Error("layers.brief_intent_mismatch");
  if (acceptedIntent.audience !== undefined) {
    const audience = normalize(acceptedIntent.audience);
    if (!audience || !brief.includes(audience)) throw new Error("layers.brief_intent_mismatch");
  }
}
