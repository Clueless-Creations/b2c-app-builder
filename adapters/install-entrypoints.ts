#!/usr/bin/env node
/**
 * Install the B2C App Builder agent entrypoints in a target app repository.
 *
 * The installer writes AGENTS.md, a thin CLAUDE.md, the Cursor rule, APP_AGENTS.md,
 * the role roster, the runtime binding, and the catalog. It removes hooks managed by
 * this package. It preserves founder-owned settings and files, including PRODUCT.md and DESIGN.md.
 * It merges the managed secret and reducer-owned deny entries into .claude/settings.json.
 * It never overwrites an existing settings.json wholesale; it unions permissions.deny and keeps
 * every other key untouched.
 *
 * The default mode is --dry-run. Use --apply to write the files.
 *
 * Usage:
 *   tsx adapters/install-entrypoints.ts --target /path/to/business-repo \
 *       [--skill-root /path/to/skill] [--apply] [--var APP_NAME=Ocho --var BUSINESS_NAME="Ocho Inc"]
 */
import { isInitializationOwner } from "../kernel/session/initialization-guard.js";
import { boundedFileBytes } from "../kernel/lib/bounded-file.js";
import { atomicFile } from "../kernel/lib/atomic-file.js";
import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { toCatalogInput } from "../catalog/bridge.js";
import { composeCatalog } from "../catalog/index.js";
import { type RuntimeCompositionPin } from "../catalog/packs/isolation.js";
import { loadDesignSystem, validateDesignMd } from "../tooling/lib/design-md.js";
import { expandHome, flagBoolean, flagString, parseFlags } from "../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../tooling/lib/skill-root.js";
import { isMainModule } from "../kernel/lib/cli.js";
import { loadWorkspaceCatalogIfPresent, renderCatalogRefusal } from "../kernel/session/catalog-contract.js";

const defaultSkillRoot = resolveSkillRoot(import.meta.url);

const MANAGED_MARKERS = ["b2c-app-builder"] as const;
const MANAGED_COMMAND_PATHS = [".codex/skills/b2c-app-builder/"] as const;
const RUNTIME_DIR = ".b2c-launch";
const BUSINESS_CONTEXT_PATH = path.join(RUNTIME_DIR, "BUSINESS_CONTEXT.md");
const RUNTIME_MANIFEST_PATH = path.join(RUNTIME_DIR, "runtime.json");
const RUNTIME_CATALOG_PATH = "catalog.json";

export interface HookCommand {
  type?: string;
  command?: string;
  timeout?: number;
  statusMessage?: string;
}

export interface HookEntry {
  _managed?: string;
  _comment?: string;
  matcher?: string;
  hooks?: HookCommand[];
}

export interface HookSettings {
  env?: Record<string, string>;
  hooks?: { PostToolUse?: HookEntry[]; [key: string]: unknown };
  [key: string]: unknown;
}

function isManagedEntry(entry: HookEntry): boolean {
  if (MANAGED_MARKERS.some((marker) => entry?._managed === marker)) {
    return true;
  }
  return (entry?.hooks ?? []).some(
    (hook) => typeof hook?.command === "string" && MANAGED_COMMAND_PATHS.some((managedPath) => hook.command!.includes(managedPath)),
  );
}

export const ENTRYPOINT_TEMPLATE_RELATIVE = path.join("surfaces/workspace-template", "repo-agent-entrypoints");

export interface EntrypointFile {
  /** Destination path relative to the target repo root. */
  readonly relativePath: string;
  /** Authored source path relative to the skill root. */
  readonly sourceRelativePath: string;
}

const entrypointTemplate = (relativePath: string): EntrypointFile => ({
  relativePath,
  sourceRelativePath: path.join(ENTRYPOINT_TEMPLATE_RELATIVE, relativePath),
});

const rosterTemplate = (relativePath: string): EntrypointFile => ({
  relativePath,
  sourceRelativePath: path.join("examples", "workspace", "business", "engineering", "app-agent-roster", relativePath),
});

const ROSTER_PROMPTS = [
  "accessibility-device-qa.md",
  "backend-infrastructure-engineer.md",
  "copy-specialist.md",
  "customer-success.md",
  "design-guru.md",
  "engineering-leader.md",
  "launch-surface-producer.md",
  "marketing-guru.md",
  "mobile-engineer.md",
  "operator-readiness.md",
  "orchestrator.md",
  "product-leader.md",
  "research-strategist.md",
  "security-architect.md",
] as const;

/** Relative path of the managed `.claude/settings.json` template. Written by merge, not by plain overwrite — see mergeTemplateDenyList. */
export const CLAUDE_SETTINGS_RELATIVE_PATH = path.join(".claude", "settings.json");

export const ENTRYPOINT_FILES: readonly EntrypointFile[] = [
  entrypointTemplate("AGENTS.md"),
  entrypointTemplate("CLAUDE.md"),
  entrypointTemplate(path.join(".cursor", "rules", "agents.mdc")),
  entrypointTemplate(CLAUDE_SETTINGS_RELATIVE_PATH),
  rosterTemplate("APP_AGENTS.md"),
  ...ROSTER_PROMPTS.map((name) => rosterTemplate(path.join("agents", name))),
];

/** `{{KEY}}` -> value. A placeholder with no supplied value is left intact, never silently blanked — matches the v1 template convention (check-agent-entrypoints.ts asserts the shipped template keeps its own {{...}} tokens). */
export function applyTemplateVars(content: string, vars: Readonly<Record<string, string>>): string {
  return content.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : match));
}

export function readEntrypointTemplates(skillRoot: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const file of ENTRYPOINT_FILES) {
    const source = path.join(skillRoot, file.sourceRelativePath);
    if (!existsSync(source)) throw new Error(`entrypoint template is missing at ${source}.`);
    files.set(file.relativePath, readFileSync(source, "utf8"));
  }
  return files;
}

export interface InstalledRuntimeManifest {
  schemaVersion: "1.0.0";
  skill: "b2c-app-builder";
  skillVersion: string;
  skillRoot: string;
  skillRootEnv: "B2C_APP_BUILDER_SKILL_ROOT";
  installedSkillName: "b2c-app-builder";
  catalogVersion: string;
  catalogPath: string;
  knowledgeRoot: string;
  /** Present only after an explicit pack re-pin. Older manifests omit this field. */
  composition?: RuntimeCompositionPin;
}

/** Durable binding from a generated business repo to the exact skill knowledge and catalog used. */
export function buildInstalledRuntimeManifest(skillRoot: string): InstalledRuntimeManifest {
  const catalog = composeCatalog(skillRoot);
  return {
    schemaVersion: "1.0.0",
    skill: "b2c-app-builder",
    skillVersion: catalog.skillVersion,
    skillRoot: path.resolve(skillRoot),
    skillRootEnv: "B2C_APP_BUILDER_SKILL_ROOT",
    installedSkillName: "b2c-app-builder",
    catalogVersion: toCatalogInput(catalog).version,
    catalogPath: RUNTIME_CATALOG_PATH,
    knowledgeRoot: path.join(path.resolve(skillRoot), "knowledge"),
  };
}

function managedPath(target: string, relative: string): string {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).some((segment) => segment === "..")) throw new Error("install-entrypoints: unsafe managed path");
  if (!lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink()) throw new Error("install-entrypoints: unsafe target");
  let current = target;
  const segments = relative.split(/[\\/]/);
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]!);
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || (index < segments.length - 1 ? !stat.isDirectory() : !stat.isFile()))
        throw new Error("install-entrypoints: unsafe managed path");
    }
  }
  if (existsSync(current)) boundedFileBytes(current, 32 * 1024 * 1024);
  return current;
}
function preserveBeforeManagedRewrite(target: string, relativePath: string, nextContent: string): string | undefined {
  const destination = managedPath(target, relativePath);
  if (!existsSync(destination)) return undefined;
  const current = boundedFileBytes(destination, 32 * 1024 * 1024).toString("utf8");
  if (current === nextContent) return undefined;
  const preservedPath = managedPath(target, path.join(RUNTIME_DIR, "preserved-entrypoints", relativePath));
  mkdirSync(path.dirname(preservedPath), { recursive: true });
  atomicFile(preservedPath, current);
  return path.relative(target, preservedPath).split(path.sep).join("/");
}

function ensureBusinessContext(target: string, vars: Readonly<Record<string, string>>): void {
  const destination = managedPath(target, BUSINESS_CONTEXT_PATH);
  if (existsSync(destination)) return;
  mkdirSync(path.dirname(destination), { recursive: true });
  const appName = vars.APP_NAME ?? "this app";
  atomicFile(
    destination,
    `# ${appName} Business Context\n\nThis founder-owned file survives entrypoint refreshes. Record business-specific stack, providers, locales, approved pricing, deploy targets, store teams, voice constraints, and role-specific exceptions here. Do not put secrets in this file.\n`,
  );
}

export interface HookStripResult {
  readonly settings: HookSettings;
  readonly removedCount: number;
  readonly preservedForeignCount: number;
  readonly changed: boolean;
}

/** Remove package-managed PostToolUse entries. Preserve foreign entries and settings. */
export function stripManagedHookEntries(settings: HookSettings): HookStripResult {
  const existing = settings.hooks?.PostToolUse;
  if (!Array.isArray(existing) || existing.length === 0) {
    return { settings, removedCount: 0, preservedForeignCount: 0, changed: false };
  }
  const foreign = existing.filter((entry: HookEntry) => !isManagedEntry(entry));
  const removedCount = existing.length - foreign.length;
  if (removedCount === 0) return { settings, removedCount: 0, preservedForeignCount: foreign.length, changed: false };

  const nextHooks = { ...settings.hooks };
  if (foreign.length > 0) nextHooks.PostToolUse = foreign;
  else delete nextHooks.PostToolUse;
  const nextSettings: HookSettings = { ...settings, hooks: nextHooks };
  return { settings: nextSettings, removedCount, preservedForeignCount: foreign.length, changed: true };
}

export interface DenyMergeResult {
  readonly settings: HookSettings;
  readonly addedDenyCount: number;
  readonly changed: boolean;
}

/** Reads `permissions.deny` out of the managed `.claude/settings.json` template's raw text. Any other shape in the template is ignored — the template today carries only this one field. */
export function parseTemplateDenyList(templateContent: string): string[] {
  const parsed = JSON.parse(templateContent) as { permissions?: { deny?: unknown } };
  const deny = parsed.permissions?.deny;
  return Array.isArray(deny) ? deny.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * Unions the managed template's `permissions.deny` entries into the target's existing settings,
 * deduped, preserving every other key (including any other `permissions` subkey, and any deny
 * entries the founder already had) untouched. When the target has no settings.json yet, this
 * merges the template list into an empty object, which reproduces the template verbatim.
 */
export function mergeTemplateDenyList(settings: HookSettings, templateDeny: readonly string[]): DenyMergeResult {
  const permissions = (settings.permissions as { deny?: unknown; [key: string]: unknown } | undefined) ?? {};
  const existingDeny = Array.isArray(permissions.deny) ? (permissions.deny as string[]) : [];
  const merged = Array.from(new Set([...existingDeny, ...templateDeny]));
  const addedDenyCount = merged.length - existingDeny.length;
  if (addedDenyCount === 0 && Array.isArray(permissions.deny)) {
    return { settings, addedDenyCount: 0, changed: false };
  }
  const nextSettings: HookSettings = { ...settings, permissions: { ...permissions, deny: merged } };
  return { settings: nextSettings, addedDenyCount, changed: true };
}

function loadSettings(settingsPath: string): HookSettings {
  if (!existsSync(settingsPath)) return {};
  const parsed: unknown = JSON.parse(boundedFileBytes(settingsPath, 1024 * 1024).toString("utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${settingsPath} is not a JSON object. Fix or move it before installing app entrypoints.`);
  }
  return parsed as HookSettings;
}

// --- CLI ---------------------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`install-entrypoints: ${message}`);
}

function parseVars(argv: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--var") continue;
    const raw = argv[index + 1];
    if (!raw) continue;
    const eq = raw.indexOf("=");
    if (eq <= 0) continue;
    vars[raw.slice(0, eq)] = raw.slice(eq + 1);
  }
  return vars;
}

function runMain(): void {
  const argv = process.argv.slice(2);
  const flags = parseFlags(argv, [
    { flags: ["--target", "--root"], key: "target" },
    { flags: ["--skill-root"], key: "skillRoot" },
    { flags: ["--apply"], key: "apply", kind: "boolean" },
    { flags: ["--packs"], key: "packs", kind: "string" },
  ]);
  const target = flagString(flags, "target") ? path.resolve(expandHome(flagString(flags, "target")!)) : undefined;
  if (!target) fail("--target <business-repo> is required. Point it at the repo that should receive the v2 entrypoints.");
  if (!existsSync(target)) fail(`--target ${target} does not exist.`);
  const skillRoot = path.resolve(expandHome(flagString(flags, "skillRoot") ?? defaultSkillRoot));
  const apply = flagBoolean(flags, "apply");
  const vars = parseVars(argv);

  installEntrypoints({ target, skillRoot, apply, vars, packs: flagString(flags, "packs") }, console.log);
}
export function installEntrypoints(
  input: { target: string; skillRoot?: string; apply: boolean; vars?: Readonly<Record<string, string>>; packs?: string },
  report: (message: string) => void = () => {},
): void {
  const target = path.resolve(input.target),
    skillRoot = path.resolve(input.skillRoot ?? defaultSkillRoot),
    apply = input.apply,
    vars = input.vars ?? {};
  for (const relative of [
    ...ENTRYPOINT_FILES.map((entry) => entry.relativePath),
    BUSINESS_CONTEXT_PATH,
    RUNTIME_CATALOG_PATH,
    RUNTIME_MANIFEST_PATH,
    "DESIGN.md",
    "PRODUCT.md",
    ...ENTRYPOINT_FILES.map((entry) => path.join(RUNTIME_DIR, "preserved-entrypoints", entry.relativePath)),
  ])
    managedPath(target, relative);
  const compatible = loadWorkspaceCatalogIfPresent(target);
  if (!compatible.ok) fail(renderCatalogRefusal(compatible.refusal));
  const existingRuntime = existsSync(path.join(target, RUNTIME_CATALOG_PATH)) || existsSync(path.join(target, RUNTIME_MANIFEST_PATH));
  if (input.packs?.trim()) fail("composition.activation_required: use the composition transaction to select packages");
  if (apply && !existingRuntime && !isInitializationOwner(target))
    fail("business.initialization_required: initialize the accepted business before installing runtime entrypoints");
  let templates: Map<string, string>;
  try {
    templates = readEntrypointTemplates(skillRoot);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const settingsPath = path.join(target, ".claude", "settings.json");
  let settings: HookSettings;
  try {
    settings = loadSettings(settingsPath);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const stripped = stripManagedHookEntries(settings);
  const templateDenyList = parseTemplateDenyList(templates.get(CLAUDE_SETTINGS_RELATIVE_PATH) ?? "{}");
  const merged = mergeTemplateDenyList(stripped.settings, templateDenyList);
  const canValidateDesign = existsSync(path.join(target, "DESIGN.md"));
  const hasProduct = existsSync(path.join(target, "PRODUCT.md"));
  const design = canValidateDesign ? loadDesignSystem(target) : undefined;
  const designIssues = design ? [...design.issues, ...validateDesignMd(design.markdown)] : [];
  if (designIssues.some((item) => item.severity === "error")) {
    fail(`cannot preserve invalid DESIGN.md: ${designIssues.map((item) => `${item.code}: ${item.message}`).join("; ")}`);
  }

  if (!apply) {
    report(
      `install-entrypoints: DRY RUN — would write ${templates.size} managed entrypoint file(s), a versioned catalog, and a runtime binding under ${target}:`,
    );
    for (const relativePath of templates.keys()) {
      if (relativePath === CLAUDE_SETTINGS_RELATIVE_PATH) continue; // reported separately below — merged, not overwritten
      report(`  ${path.join(target, relativePath)}`);
    }
    if (design) report(`  ${design.sources.designPath} (preserved authored design authority)`);
    if (hasProduct) report(`  ${path.join(target, "PRODUCT.md")} (preserved authored product authority)`);
    report(
      stripped.changed
        ? `  would remove ${stripped.removedCount} managed hook entr${stripped.removedCount === 1 ? "y" : "ies"} from ${settingsPath} (${stripped.preservedForeignCount} foreign entr${stripped.preservedForeignCount === 1 ? "y" : "ies"} preserved)`
        : `  ${settingsPath}: no managed hook entries to remove (${stripped.preservedForeignCount} foreign entr${stripped.preservedForeignCount === 1 ? "y" : "ies"} untouched)`,
    );
    report(
      merged.changed
        ? `  would add ${merged.addedDenyCount} permission-deny entr${merged.addedDenyCount === 1 ? "y" : "ies"} to ${settingsPath} from the managed template (existing entries and every other key preserved)`
        : `  ${settingsPath}: permissions.deny already covers every managed template entry`,
    );
    return;
  }

  const preserved: string[] = [];
  for (const [relativePath, content] of templates) {
    if (relativePath === CLAUDE_SETTINGS_RELATIVE_PATH) continue; // merged into settingsPath below — never plain-overwritten, so a founder's existing settings.json is never clobbered
    const destination = managedPath(target, relativePath);
    const rendered = applyTemplateVars(content, vars);
    const preservedPath = preserveBeforeManagedRewrite(target, relativePath, rendered);
    if (preservedPath) preserved.push(preservedPath);
    mkdirSync(path.dirname(destination), { recursive: true });
    atomicFile(destination, rendered);
  }
  ensureBusinessContext(target, vars);
  if (!existingRuntime) {
    const catalog = composeCatalog(skillRoot),
      manifest = buildInstalledRuntimeManifest(skillRoot);
    atomicFile(managedPath(target, RUNTIME_CATALOG_PATH), `${JSON.stringify(toCatalogInput(catalog), null, 2)}\n`);
    atomicFile(managedPath(target, RUNTIME_MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  if (stripped.changed || merged.changed) {
    mkdirSync(path.dirname(settingsPath), { recursive: true });
    atomicFile(settingsPath, `${JSON.stringify(merged.settings, null, 2)}\n`);
  }
  report(`install-entrypoints: wrote ${templates.size - 1} entrypoint file(s) plus the managed settings.json merge under ${target}.`);
  if (design) report("install-entrypoints: preserved and validated the authored DESIGN.md.");
  if (hasProduct) report("install-entrypoints: preserved the authored PRODUCT.md.");
  report(
    existingRuntime
      ? "install-entrypoints: preserved the installed catalog and runtime pins."
      : "install-entrypoints: wrote the initial catalog and runtime pins within initialization.",
  );
  if (preserved.length > 0) report(`install-entrypoints: preserved ${preserved.length} replaced file(s) under ${RUNTIME_DIR}/preserved-entrypoints/.`);
  report(
    stripped.changed
      ? `install-entrypoints: removed ${stripped.removedCount} managed hook entr${stripped.removedCount === 1 ? "y" : "ies"} from ${settingsPath} (${stripped.preservedForeignCount} foreign entr${stripped.preservedForeignCount === 1 ? "y" : "ies"} preserved).`
      : `install-entrypoints: ${settingsPath} had no managed hook entries to remove.`,
  );
  report(
    merged.changed
      ? `install-entrypoints: added ${merged.addedDenyCount} permission-deny entr${merged.addedDenyCount === 1 ? "y" : "ies"} to ${settingsPath} from the managed template.`
      : `install-entrypoints: ${settingsPath} already had every managed permission-deny entry.`,
  );
}

if (isMainModule(import.meta.url)) {
  try {
    runMain();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
