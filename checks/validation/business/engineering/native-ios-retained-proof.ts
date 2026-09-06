import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { loadDesignSystem } from "../../../../tooling/lib/design-md.js";
import { isRecord, issue, type Issue } from "../../../../tooling/lib/launch-state.js";
import { designAcceptanceScopeSchema, type DesignAcceptanceScope } from "../design/design-acceptance.js";
import { validateStrictIosSimulatorReceipt } from "./strict-ios-receipt.js";

const PROOF_ROOT = "proof/ios-simulator";

function rawAcceptedIosScope(value: unknown): boolean {
  if (!isRecord(value) || value.status !== "accepted" || !Array.isArray(value.surfaces)) return false;
  return value.surfaces.some((surface) => isRecord(surface) && surface.kind === "native" && surface.platform === "ios");
}

function selectedIosPlatform(root: string): boolean | undefined {
  const statePath = path.join(root, "state", "business-state.json");
  if (!existsSync(statePath)) return undefined;
  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.project) || !Array.isArray(parsed.project.platforms)) {
    throw new Error("state.project.platforms is missing");
  }
  return parsed.project.platforms.includes("ios") || parsed.project.platforms.includes("ipados");
}

function iosImplementationRoots(scope: DesignAcceptanceScope): string[] {
  return [
    ...new Set(scope.surfaces.filter((surface) => surface.kind === "native" && surface.platform === "ios").flatMap((surface) => surface.implementationPaths)),
  ].sort();
}

function collectReceiptPaths(root: string, issues: Issue[]): string[] {
  const absoluteRoot = path.join(root, PROOF_ROOT);
  if (!existsSync(absoluteRoot)) return [];
  const receipts: string[] = [];
  const visit = (absolute: string, relative: string): void => {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      issues.push(issue("error", "ios.receipt_path", `iOS proof cannot use a symlink: ${relative}`, relative));
      return;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) visit(path.join(absolute, name), path.posix.join(relative, name));
      return;
    }
    if (stat.isFile() && path.posix.basename(relative) === "receipt.json") receipts.push(relative);
  };
  visit(absoluteRoot, PROOF_ROOT);
  return receipts;
}

/** Strict retained evidence layer. Readiness prose is validated separately. */
export function validateNativeIosRetainedProof(root: string): Issue[] {
  const issues: Issue[] = [];
  let stateSelectsIos: boolean | undefined;
  try {
    stateSelectsIos = selectedIosPlatform(root);
  } catch (error) {
    return [
      issue(
        "error",
        "ios.state_invalid",
        `iOS platform selection cannot be read: ${error instanceof Error ? error.message : String(error)}`,
        "state/business-state.json",
      ),
    ];
  }
  let design: ReturnType<typeof loadDesignSystem>;
  try {
    design = loadDesignSystem(root);
  } catch {
    return issues;
  }
  const rawScope = design.frontmatter?.acceptance;
  const designSelectsIos = rawAcceptedIosScope(rawScope);
  if (stateSelectsIos === false && designSelectsIos) {
    return [
      issue(
        "error",
        "ios.scope_platform_mismatch",
        "Accepted DESIGN.md scope selects iOS, but reducer-owned project platforms exclude iOS.",
        "state/business-state.json",
      ),
    ];
  }
  if (!designSelectsIos) return issues;
  const parsedScope = designAcceptanceScopeSchema.safeParse(rawScope);
  if (!parsedScope.success) {
    const first = parsedScope.error.issues[0];
    return [
      issue(
        "error",
        "ios.scope_invalid",
        `Accepted iOS scope in DESIGN.md is malformed at ${first?.path.join(".") || "acceptance"}: ${first?.message ?? "invalid scope"}`,
        "DESIGN.md",
      ),
    ];
  }
  const implementationRoots = iosImplementationRoots(parsedScope.data);
  if (implementationRoots.length === 0) return issues;
  let workspaceRoot: string;
  try {
    workspaceRoot = realpathSync(path.resolve(root));
  } catch (error) {
    return [issue("error", "ios.workspace", `iOS workspace cannot be resolved: ${error instanceof Error ? error.message : String(error)}`, root)];
  }
  const candidates = collectReceiptPaths(workspaceRoot, issues);
  if (candidates.length === 0) {
    issues.push(
      issue(
        "error",
        "ios.strict_receipt_required",
        "Accepted iOS scope requires a machine-produced compact receipt backed by retained built and installed .app bundles plus raw command transcripts.",
        PROOF_ROOT,
        { fixHint: "Run b2c proof against the current iOS simulator and keep its run/retained-evidence session." },
      ),
    );
    return issues;
  }
  let valid = 0;
  const candidateIssues: Issue[] = [];
  for (const candidate of candidates) {
    const result = validateStrictIosSimulatorReceipt(workspaceRoot, candidate, implementationRoots);
    if (result.receipt && result.issues.length === 0) valid += 1;
    else candidateIssues.push(...result.issues);
  }
  if (valid === 0) issues.push(...candidateIssues);
  return issues;
}
