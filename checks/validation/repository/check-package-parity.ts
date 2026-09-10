#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { flagString, isRecord, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { auditExcludedScripts, buildAuditPlan, type AuditLayout } from "../../../tooling/lib/audit-plan.js";
import { SCRIPT_ROOTS, findScriptPath, scriptBasenameFromCommand } from "../../../tooling/lib/script-paths.js";

interface PackageJson {
  name?: string;
  version?: string;
  files?: string[];
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
}

interface Args {
  repoRoot: string;
  skillRoot: string;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../..");
const defaultRepoRoot = defaultSkillRoot;

/** Workspace-template entrypoints the installer copies. Must be tracked, not merely on disk. */
const TRACKED_TEMPLATE_ENTRYPOINTS = [
  "surfaces/workspace-template/repo-agent-entrypoints/.cursor/rules/agents.mdc",
  "surfaces/workspace-template/repo-agent-entrypoints/AGENTS.md",
  "surfaces/workspace-template/repo-agent-entrypoints/CLAUDE.md",
  // A global `.claude/` ignore dropped this at the public cutover. git ls-files, not the
  // filesystem, is the authority — a local-only restore still fails.
  "surfaces/workspace-template/repo-agent-entrypoints/.claude/settings.json",
] as const;
const args = parseArgs(process.argv.slice(2));
const issues: Issue[] = [];

// ADR-0002: the repository root is the package root, so one manifest serves both the source
// checkout and the packed runtime. The two labels below name the two audit layouts, not two files.
const rootPackage = readJson<PackageJson>(path.join(args.repoRoot, "package.json"), "root_package");
const runtimePackage = rootPackage;
const rootLock = readJson<Record<string, unknown>>(path.join(args.repoRoot, "package-lock.json"), "root_package_lock");
const skillVersion = readJson<{ version?: string }>(path.join(args.skillRoot, "skill-version.json"), "skill_version");

if (rootPackage.value && runtimePackage.value && skillVersion.value) {
  const expectedVersion = skillVersion.value.version;
  for (const [label, pkg] of [["package.json", rootPackage.value]] as const) {
    if (pkg.version !== expectedVersion) {
      issues.push(
        issue(
          "error",
          `package_parity.${code(label)}.version_mismatch`,
          `${label} version ${pkg.version ?? "(missing)"} must match skill-version.json ${expectedVersion}.`,
          "package.json",
        ),
      );
    }
  }
  checkNodePin(args.repoRoot, rootPackage.value, runtimePackage.value);
}

checkLockVersion("root", rootPackage.value, rootLock.value, path.join(args.repoRoot, "package-lock.json"));

if (rootPackage.value && runtimePackage.value) {
  const rootScripts = rootPackage.value.scripts ?? {};
  const runtimeScripts = runtimePackage.value.scripts ?? {};
  // The audit pipeline is defined once in lib/audit-plan.ts; both audit
  // entrypoints must route through the orchestrator, and every gate-shaped
  // script must be a plan step or an explicitly excluded script.
  for (const [label, scriptName, script] of [
    ["root audit", "audit", rootScripts.audit],
    ["root audit:ci", "audit:ci", rootScripts["audit:ci"]],
    ["runtime audit", "audit", runtimeScripts.audit],
  ] as const) {
    if (!script?.includes("run-audit.ts")) {
      issues.push(
        issue(
          "error",
          `package_parity.${code(label)}.not_orchestrated`,
          `${label} (${scriptName}) must invoke tooling/run-audit.ts so the audit pipeline stays defined in one place.`,
          "package.json",
        ),
      );
    }
  }
  if (rootScripts["audit:ci"] && !rootScripts["audit:ci"].includes("--ci")) {
    issues.push(issue("error", "package_parity.root_audit_ci.missing_ci_flag", "Root audit:ci must pass --ci to run-audit.ts.", "package.json"));
  }
  if (rootScripts.audit?.includes("--ci")) {
    issues.push(
      issue(
        "error",
        "package_parity.root_audit.unexpected_ci_flag",
        "Root audit must not pass --ci; the full audit includes maintainer-only steps.",
        "package.json",
      ),
    );
  }

  // ADR-0002: the repository root is the package root, so the root manifest is the runtime
  // manifest and the repo plan is the one every gate-shaped script must register against.
  checkAuditPlanCoverage("root", "repo", rootScripts);
  checkLaunchbenchValidatorParity(runtimeScripts);
  checkSharedParserVersions(rootPackage.value, args.skillRoot);
}

if (runtimePackage.value) checkPackStandalone(runtimePackage.value);
checkTrackedTemplateEntrypoints(args.repoRoot);

issues.push(...rootPackage.issues, ...rootLock.issues, ...skillVersion.issues);
reportAndExit("Package parity check", issues);

/**
 * The npm-pack smoke test (layering plan R3): the skill package must be installable standalone,
 * so the tarball npm would build has to carry everything the runtime needs — and nothing
 * development-only. `npm pack --dry-run --json` is purely local (no network, no tarball on disk),
 * so this runs on every audit. Three failure modes, each watched failing before first green:
 * a missing `files` manifest (npm would ship the entire tree, node_modules excepted), a runtime
 * import left in devDependencies (standalone install crashes at first use), and a dev-only
 * directory leaking into the artifact.
 */
function checkPackStandalone(runtimePkg: PackageJson): void {
  // Synthetic parity fixtures and manifest-only copies have no package tree to pack, so the pack
  // smoke only runs where the packaged bin exists on disk. This cannot rot into a silent skip on
  // the real package: the cli fixture suite pins entrypoints/cli/b2c.mjs's existence there, so the file
  // vanishing fails the audit through that gate instead.
  if (!existsSync(path.join(args.skillRoot, "entrypoints", "cli", "b2c.mjs"))) return;
  if (!Array.isArray(runtimePkg.files) || runtimePkg.files.length === 0) {
    issues.push(
      issue(
        "error",
        "package_parity.pack_files_manifest_missing",
        "Runtime package.json has no files manifest — npm pack would ship the whole tree (fixtures, studio, businesses) or nothing deliberate. Declare files explicitly.",
        "package.json",
      ),
    );
    return;
  }

  // Every package the shipped runtime imports must survive a production install.
  const runtimeDeps = runtimePkg.dependencies ?? {};
  for (const dep of ["@google/design.md", "@mdx-js/mdx", "yaml", "@modelcontextprotocol/sdk", "zod"]) {
    if (!runtimeDeps[dep]) {
      issues.push(
        issue(
          "error",
          "package_parity.pack_runtime_dep_misfiled",
          `${dep} is imported (or execed) by shipped runtime code but is not in dependencies — a standalone install would not receive it.`,
          "package.json",
        ),
      );
    }
  }
  const buildDeps = runtimePkg.devDependencies ?? {};
  for (const dep of ["tsx", "typescript"]) {
    if (!buildDeps[dep]) {
      issues.push(
        issue(
          "error",
          "package_parity.pack_build_dep_misfiled",
          `${dep} is a checkout/build tool and must live in devDependencies — packed production installs launch compiled dist/ without it.`,
          "package.json",
        ),
      );
    }
    if (runtimeDeps[dep]) {
      issues.push(
        issue(
          "error",
          "package_parity.pack_runtime_dep_misfiled",
          `${dep} must not stay in dependencies after the compiled runtime — a standalone install would carry an unused compiler.`,
          "package.json",
        ),
      );
    }
  }
  const bins = runtimePkg.bin ?? {};
  if (bins["b2c-app-builder"] !== "entrypoints/mcp/b2c-app-builder-mcp.mjs") {
    issues.push(
      issue(
        "error",
        "package_parity.mcp_package_bin_missing",
        'package.json bin["b2c-app-builder"] must alias entrypoints/mcp/b2c-app-builder-mcp.mjs so `npx -y b2c-app-builder` starts the MCP server.',
        "package.json",
      ),
    );
  }
  if (bins["b2c-app-builder-mcp"] !== "entrypoints/mcp/b2c-app-builder-mcp.mjs") {
    issues.push(
      issue(
        "error",
        "package_parity.mcp_bin_missing",
        'package.json bin["b2c-app-builder-mcp"] must point at entrypoints/mcp/b2c-app-builder-mcp.mjs.',
        "package.json",
      ),
    );
  }

  const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: args.skillRoot, encoding: "utf8", timeout: 180_000 });
  if (pack.status !== 0) {
    issues.push(
      issue(
        "error",
        "package_parity.pack_dry_run_failed",
        `npm pack --dry-run exited ${pack.status ?? "signal"}: ${(pack.stderr ?? "").trim().slice(-300)}`,
        "package.json",
      ),
    );
    return;
  }
  let packed: string[] = [];
  try {
    const parsed = JSON.parse(pack.stdout) as Array<{ files?: Array<{ path: string }> }>;
    packed = (parsed[0]?.files ?? []).map((file) => file.path);
  } catch {
    issues.push(issue("error", "package_parity.pack_output_unparseable", "npm pack --dry-run --json did not print parseable JSON.", "package.json"));
    return;
  }

  // The artifact's load-bearing files: one representative per shipped layer, plus every address.
  const required = [
    "entrypoints/cli/b2c.mjs",
    "entrypoints/cli/help.mjs",
    "entrypoints/mcp/b2c-app-builder-mcp.mjs",
    "dist/entrypoints/mcp/server.js",
    "dist/entrypoints/cli/business.js",
    "dist/kernel/session/doctor.js",
    "dist/kernel/session/setup.js",
    "dist/kernel/session/run.js",
    "dist/kernel/session/onboard.js",
    "SKILL.md",
    "skill-version.json",
    "tsconfig.json",
    "catalog/generated/catalog.json",
    "entrypoints/mcp/server.ts",
    "kernel/session/run.ts",
    "surfaces/studio/seed/schema/business.empty.json",
    "surfaces/studio/seed/schema/business.schema.json",
    "tooling/lib/design-md.ts",
    "tooling/lib/audit-plan.ts",
    "tooling/render-design-room.ts",
    "surfaces/ui-library/component-index.json",
    "surfaces/ui-library/adapters/swiftui.json",
    "surfaces/ui-library/adapters/expo.json",
    "checks/validation/business/design/check-design-md.ts",
    "examples/extensions/support-case/extension.yaml",
    "examples/extensions/support-case/pack.yaml",
    "examples/workspace/business/DESIGN.md",
    "examples/workspace/business/state/business-state.json",
    "surfaces/workspace-template/new-business/product.yaml",
    "surfaces/workspace-template/new-business/PRODUCT.md",
    "surfaces/workspace-template/new-business/DESIGN.md",
    "surfaces/workspace-template/new-business/strategy/RESEARCH.md",
    ...TRACKED_TEMPLATE_ENTRYPOINTS,
  ];
  const packedSet = new Set(packed);
  for (const file of required) {
    if (!packedSet.has(file)) {
      issues.push(
        issue("error", "package_parity.pack_missing_file", `npm pack would not include ${file} — the standalone artifact is incomplete.`, "package.json"),
      );
    }
  }
  for (const prefix of ["knowledge/", "checks/validation/", "surfaces/starters/", "dist/"]) {
    if (!packed.some((file) => file.startsWith(prefix))) {
      issues.push(
        issue(
          "error",
          "package_parity.pack_missing_layer",
          `npm pack includes nothing under ${prefix} — a shipped layer is absent from the artifact.`,
          "package.json",
        ),
      );
    }
  }

  // Development-only surfaces must never ride along.
  for (const prefix of ["checks/verification/", "content/", "business/", "agents/", "node_modules/"]) {
    const leaked = packed.find((file) => file.startsWith(prefix));
    if (leaked) {
      issues.push(
        issue("error", "package_parity.pack_dev_leak", `npm pack would ship development-only ${leaked} — tighten the files manifest.`, "package.json"),
      );
    }
  }
  const leakedStudioFile = packed.find((file) => file.startsWith("surfaces/studio/") && !file.startsWith("surfaces/studio/seed/schema/"));
  if (leakedStudioFile) {
    issues.push(
      issue(
        "error",
        "package_parity.pack_dev_leak",
        `npm pack would ship development-only ${leakedStudioFile} — only the Design Room schema belongs in the runtime package.`,
        "package.json",
      ),
    );
  }
  if (packedSet.has("design-room.html")) {
    issues.push(issue("error", "package_parity.pack_dev_leak", "npm pack would ship design-room.html — tighten the files manifest.", "package.json"));
  }
}

function checkTrackedTemplateEntrypoints(repoRoot: string): void {
  if (!existsSync(path.join(repoRoot, ".git"))) return;
  const listed = spawnSync("git", ["-C", repoRoot, "ls-files", "-z", "--", ...TRACKED_TEMPLATE_ENTRYPOINTS], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (listed.status !== 0) {
    issues.push(
      issue(
        "error",
        "package_parity.template_track_failed",
        `git ls-files could not read the tracked workspace-template entrypoints: ${listed.stderr.trim() || "unknown error"}.`,
        "surfaces/workspace-template/repo-agent-entrypoints",
      ),
    );
    return;
  }
  const tracked = new Set(listed.stdout.split("\0").filter(Boolean));
  for (const file of TRACKED_TEMPLATE_ENTRYPOINTS) {
    if (!tracked.has(file)) {
      issues.push(
        issue(
          "error",
          "package_parity.template_untracked",
          `${file} is not in the tracked tree. A global ignore can drop it from a fresh git add; git ls-files must list every workspace-template entrypoint the installer expects.`,
          file,
        ),
      );
    }
  }
}

function parseArgs(argv: string[]): Args {
  const flags = parseFlags(argv, [
    { flags: ["--repo-root"], key: "repoRoot" },
    { flags: ["--skill-root", "--root"], key: "skillRoot" },
  ]);
  return {
    repoRoot: flagString(flags, "repoRoot") ?? defaultRepoRoot,
    skillRoot: flagString(flags, "skillRoot") ?? defaultSkillRoot,
  };
}

/**
 * Every gate-shaped script (check:*, validate:*, launchbench, launchbench:lint, audit:links,
 * test:validators) must be an audit-plan step or an explicitly excluded
 * script with a recorded reason; and every plan step must resolve to a real
 * script in this package.
 */
function checkAuditPlanCoverage(label: string, layout: AuditLayout, scripts: Record<string, string>): void {
  const plan = buildAuditPlan(layout);
  const planIds = new Set(plan.map((step) => step.id));

  const gateScripts = Object.keys(scripts).filter(
    (name) => name.startsWith("check:") || name.startsWith("validate:") || ["launchbench", "launchbench:lint", "audit:links", "test:validators"].includes(name),
  );
  for (const name of gateScripts) {
    if (!planIds.has(name) && !(name in auditExcludedScripts)) {
      issues.push(
        issue(
          "error",
          `package_parity.${label}_audit_plan_gap`,
          `${label} package.json script ${name} is neither an audit-plan step nor listed in auditExcludedScripts with a reason. Add it to lib/audit-plan.ts or exclude it explicitly.`,
          "package.json",
        ),
      );
    }
  }

  for (const step of plan) {
    if (step.kind !== "tsc" && !scripts[step.id]) {
      issues.push(
        issue(
          "error",
          `package_parity.${label}_audit_step_unresolved`,
          `Audit-plan step ${step.id} has no matching script in the ${label} package.json.`,
          "package.json",
        ),
      );
    }
  }

  for (const [name, reason] of Object.entries(auditExcludedScripts)) {
    if (!reason.trim() || reason.trim().length < 20) {
      issues.push(
        issue(
          "error",
          "package_parity.audit_exclusion_reason_thin",
          `auditExcludedScripts entry ${name} needs a concrete reason (>= 20 chars).`,
          "tooling/lib/audit-plan.ts",
        ),
      );
    }
  }
}

/**
 * run-launchbench.ts rejects any scenario citing a validator outside its
 * knownValidators literal — which means a validator missing from that literal
 * can never gain scenario coverage, silently. This cross-check keeps the
 * literal in lockstep with reality in both directions: every wired check/validate
 * script must be listed, and every listed name must have a backing file under
 * one of the three script roots. Skipped quietly when run-launchbench.ts is
 * absent (synthetic fixture roots); the real skill always ships it, and the
 * launchbench audit step itself fails if it goes missing there.
 *
 * Both lookups below deliberately go through lib/script-paths.ts rather than
 * hardcoding a directory. The previous `tooling/(...)` regex did not merely
 * break when checks/validation/business/ and checks/validation/repository/ appeared — it stopped MATCHING, so `basename`
 * went undefined and the loop skipped every validator while still exiting 0.
 * A gate that silently grades nothing is the failure mode this whole file
 * exists to prevent, so it must not be reintroduced by a path assumption.
 */
function checkLaunchbenchValidatorParity(runtimeScripts: Record<string, string>): void {
  // Resolved, not assumed. This lookup used to hardcode tooling/, and when
  // run-launchbench.ts moved to checks/validation/repository/ the existsSync went false and this
  // whole function returned early — silently skipping the entire allowlist
  // cross-check while still exiting 0. That is the same trap the comment above
  // describes, one directory move later, at the file-locate step instead of
  // inside the loop.
  const launchbenchRel = findScriptPath(args.skillRoot, "run-launchbench");
  if (!launchbenchRel) return;
  const launchbenchPath = path.join(args.skillRoot, launchbenchRel);
  if (!existsSync(launchbenchPath)) return;

  const source = readFileSync(launchbenchPath, "utf8");
  const literal = source.match(/const knownValidators = new Set\(\[([\s\S]*?)\]\);/);
  if (!literal) {
    issues.push(
      issue(
        "error",
        "package_parity.launchbench_allowlist_unparseable",
        "run-launchbench.ts no longer contains a parseable `const knownValidators = new Set([...])` literal; this parity check needs it to keep scenario coverage honest.",
        "tooling/run-launchbench.ts",
      ),
    );
    return;
  }
  const known = new Set([...(literal[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? ""));

  for (const [name, script] of Object.entries(runtimeScripts)) {
    if (!name.startsWith("check:") && !name.startsWith("validate:")) continue;
    const basename = scriptBasenameFromCommand(script);
    if (!basename) {
      // Two very different cases hide behind "no basename", and the old blanket
      // `continue` treated them the same — which is how a directory move could
      // turn this whole cross-check into a no-op that still exits 0.
      //
      // Legitimate: the script never invokes a .ts validator at all. validate:skill
      // is a shell step that runs a python linter, so there is nothing to cross-check.
      if (!/[\w./-]+\.ts\b/.test(script)) continue;
      // Dangerous: the command DOES name a .ts file, but not under any known
      // script root — so it is a validator we failed to place, not a shell step.
      issues.push(
        issue(
          "error",
          "package_parity.launchbench_validator_unparseable",
          `Wired validator script ${name} ("${script}") does not name a .ts file under ${SCRIPT_ROOTS.map((root) => `${root}/`).join(", ")}, so its LaunchBench coverage cannot be checked. Point it at a real script path.`,
          "package.json",
        ),
      );
      continue;
    }
    if (known.has(basename)) continue;
    issues.push(
      issue(
        "error",
        "package_parity.launchbench_validator_missing",
        `${basename} (${name}) is a wired validator but is absent from knownValidators in run-launchbench.ts — no LaunchBench scenario can cite it until it is added.`,
        "tooling/run-launchbench.ts",
      ),
    );
  }

  for (const name of known) {
    if (findScriptPath(args.skillRoot, name)) continue;
    issues.push(
      issue(
        "error",
        "package_parity.launchbench_validator_dead",
        `knownValidators entry ${name} has no backing ${name}.ts under ${SCRIPT_ROOTS.map((root) => `${root}/`).join(", ")} — scenarios citing it would pass lint while pointing at nothing.`,
        "tooling/run-launchbench.ts",
      ),
    );
  }
}

/**
 * ADR-0002 makes the repository root the package root, so the real audit (package.json's
 * `check:package-parity` passes `--repo-root . --skill-root .`) reads the same manifest twice
 * here and this can never fire against the shipped skill. The two flags stay independently
 * overridable on purpose: a packed or vendored runtime tree that resolves its own node_modules
 * separately from the source manifest (a stale `npm pack` output, a synthetic runtime copy) can
 * still drift from it, and these parsers — @google/design.md, @mdx-js/mdx, typescript — execute
 * from wherever that runtime actually installs, so a version split between the source-of-truth
 * manifest and the runtime tree is a real, silent failure mode worth keeping covered.
 */
function checkSharedParserVersions(rootPkg: PackageJson, skillRoot: string): void {
  const skillManifestPath = path.join(skillRoot, "package.json");
  if (!existsSync(skillManifestPath)) return;
  let skillPkg: PackageJson;
  try {
    skillPkg = JSON.parse(readFileSync(skillManifestPath, "utf8")) as PackageJson;
  } catch {
    return;
  }
  for (const dep of ["@google/design.md", "@mdx-js/mdx", "typescript"]) {
    const rootVersion = rootPkg.dependencies?.[dep];
    const runtimeVersion = skillPkg.dependencies?.[dep];
    if (rootVersion === undefined && runtimeVersion === undefined) continue;
    if (rootVersion === undefined || runtimeVersion === undefined) {
      issues.push(
        issue(
          "error",
          "package_parity.shared_runtime_dependency_missing",
          `${dep} must be declared in dependencies by both the root and runtime packages.`,
          "package.json",
        ),
      );
    } else if (rootVersion !== runtimeVersion) {
      issues.push(
        issue(
          "error",
          "package_parity.shared_runtime_dependency_version_drift",
          `${dep} must use one production version in both packages (root ${rootVersion}, runtime ${runtimeVersion}).`,
          "package.json",
        ),
      );
    }
  }
}

function readJson<T>(filePath: string, label: string): { value?: T; issues: Issue[] } {
  if (!existsSync(filePath)) {
    return { issues: [issue("error", `package_parity.${label}.missing`, `${label} is missing at ${filePath}.`, filePath)] };
  }
  try {
    return { value: JSON.parse(readFileSync(filePath, "utf8")) as T, issues: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { issues: [issue("error", `package_parity.${label}.invalid_json`, `${label} is not valid JSON: ${message}`, filePath)] };
  }
}

function checkLockVersion(label: string, pkg?: PackageJson, lock?: Record<string, unknown>, filePath?: string): void {
  const packages = lock?.packages;
  const rootPackage = isRecord(packages) ? packages[""] : undefined;
  const lockVersion = isRecord(rootPackage) && typeof rootPackage.version === "string" ? rootPackage.version : undefined;
  if (pkg?.version && lockVersion !== pkg.version) {
    issues.push(
      issue(
        "error",
        `package_parity.${label}_lock_version_mismatch`,
        `${label} package-lock root version ${lockVersion ?? "(missing)"} must match package.json ${pkg.version}.`,
        filePath,
      ),
    );
  }
}

function checkNodePin(repoRoot: string, rootPkg: PackageJson, runtimePkg: PackageJson): void {
  const rootEngines = rootPkg.engines?.node;
  const runtimeEngines = runtimePkg.engines?.node;
  if (!rootEngines) {
    issues.push(issue("error", "package_parity.root_engines_missing", "Root package.json must declare engines.node (the Node floor).", "package.json"));
  }
  if (!runtimeEngines) {
    issues.push(issue("error", "package_parity.runtime_engines_missing", "Runtime package.json must declare engines.node (the Node floor).", "package.json"));
  }
  if (rootEngines && runtimeEngines && rootEngines !== runtimeEngines) {
    issues.push(
      issue(
        "error",
        "package_parity.engines_mismatch",
        `Root engines.node (${rootEngines}) must match runtime engines.node (${runtimeEngines}).`,
        "package.json",
      ),
    );
  }
  const requiredMajor = nodeMajorFromEngines(rootEngines ?? runtimeEngines);
  checkPinFile(repoRoot, ".nvmrc", requiredMajor);
  checkPinFile(repoRoot, ".node-version", requiredMajor);
}

function nodeMajorFromEngines(spec: string | undefined): string | undefined {
  const match = spec?.trim().match(/>=(\d+)/);
  return match?.[1];
}

function checkPinFile(repoRoot: string, name: string, requiredMajor: string | undefined): void {
  const filePath = path.join(repoRoot, name);
  if (!existsSync(filePath)) {
    issues.push(issue("error", `package_parity.${code(name)}_missing`, `${name} must pin the same Node major as engines.node.`, name));
    return;
  }
  const pin = readFileSync(filePath, "utf8").trim().replace(/^v/i, "").split(".")[0] ?? "";
  if (!requiredMajor || pin !== requiredMajor) {
    issues.push(
      issue(
        "error",
        `package_parity.${code(name)}_mismatch`,
        `${name} pins ${pin || "(empty)"}; engines.node requires major ${requiredMajor ?? "(missing)"}.`,
        name,
      ),
    );
  }
}

function code(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
