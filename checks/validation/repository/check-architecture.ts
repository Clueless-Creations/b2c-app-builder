#!/usr/bin/env node
/**
 * Mechanical ARCH-02 dependency-direction check.
 *
 * Kernel, catalog, adapters, contracts, entrypoints, and hosted modules must
 * not import checks implementation modules. Validator code may import shared
 * runtime contracts from kernel/schema or contracts/. Tooling may consume
 * checks/validation/business helpers; that pattern is an explicit
 * classification, not a silent skip.
 *
 * This is a repository-only check. An installed skill does not contain the
 * repository root, so the runtime audit must not run this check.
 *
 * npm script: check:architecture
 * Usage: tsx checks/validation/repository/check-architecture.ts --repo-root /path/to/repo
 *
 * Default (no allowlist): every confirmed runtime→checks edge is an error.
 * --accept-recorded-debt accepts only explicitly recorded ARCH-02 edges.
 * --allow-edge <path>:<line> accepts one more exact edge. A scoped exception
 * never covers a different file, line, or specifier.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { isMainModule } from "../../../tooling/lib/cli-entrypoint.js";
import { flagBoolean, flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";

export const ARCH02_RULE = "architecture.arch02.runtime_imports_validation";
export const ARCH02_RECORDED_DEBT_ABSENT = "architecture.arch02.recorded_debt_absent";
export const ARCH02_PARSE_FAILED = "architecture.parse_failed";

export type ArchitectureLayer =
  "runtime-kernel" | "runtime-contract" | "runtime-surface" | "catalog" | "adapters" | "validation-implementation" | "validation" | "tooling" | "other";

export interface RecordedArch02Edge {
  readonly from: string;
  readonly line: number;
  readonly specifier: string;
}

/** Exact current ARCH-02 debt. Not a file-wide or directory allowlist. */
export const RECORDED_ARCH02_EDGES: readonly RecordedArch02Edge[] = [];

export interface ImportEdge {
  readonly from: string;
  readonly line: number;
  readonly specifier: string;
  readonly resolved: string;
  readonly fromLayer: ArchitectureLayer;
  readonly toLayer: ArchitectureLayer;
}

export interface ArchitectureCheckOptions {
  readonly repoRoot: string;
  readonly acceptRecordedDebt?: boolean;
  readonly allowEdges?: ReadonlySet<string>;
}

interface AstNode {
  type?: unknown;
  source?: unknown;
  callee?: unknown;
  arguments?: unknown;
  loc?: { start?: { line?: unknown } };
  name?: unknown;
  value?: unknown;
  body?: unknown;
}

const SOURCE_LAYERS = ["adapters", "catalog", "checks", "contracts", "entrypoints", "hosted", "kernel", "tooling"] as const;
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "fixtures", "test", "tests"]);
const SOURCE_FILE = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/u;
const JS_EXTENSION = /\.(?:cjs|js|jsx|mjs)$/u;

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value && typeof value === "object" && "type" in value && typeof (value as { type?: unknown }).type === "string");
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function edgeKey(from: string, line: number): string {
  return `${from}:${line}`;
}

export function recordedEdgeKey(edge: Pick<RecordedArch02Edge, "from" | "line">): string {
  return edgeKey(edge.from, edge.line);
}

export function classifyLayer(posixRelative: string): ArchitectureLayer {
  const first = posixRelative.split("/")[0] ?? "";
  switch (first) {
    case "contracts":
      return "runtime-contract";
    case "kernel":
      if (posixRelative === "kernel/schema" || posixRelative.startsWith("kernel/schema/")) return "runtime-contract";
      return "runtime-kernel";
    case "catalog":
      return "catalog";
    case "adapters":
      return "adapters";
    case "entrypoints":
    case "hosted":
      return "runtime-surface";
    case "checks":
      if (posixRelative === "checks/validation/business" || posixRelative.startsWith("checks/validation/business/")) {
        return "validation-implementation";
      }
      return "validation";
    case "tooling":
      return "tooling";
    default:
      return "other";
  }
}

function isRuntimeImporter(layer: ArchitectureLayer): boolean {
  switch (layer) {
    case "runtime-kernel":
    case "runtime-contract":
    case "runtime-surface":
    case "catalog":
    case "adapters":
      return true;
    case "validation-implementation":
    case "validation":
    case "tooling":
    case "other":
      return false;
    default: {
      const exhaustive: never = layer;
      return exhaustive;
    }
  }
}

function isValidationTarget(layer: ArchitectureLayer): boolean {
  switch (layer) {
    case "validation-implementation":
    case "validation":
      return true;
    case "runtime-kernel":
    case "runtime-contract":
    case "runtime-surface":
    case "catalog":
    case "adapters":
    case "tooling":
    case "other":
      return false;
    default: {
      const exhaustive: never = layer;
      return exhaustive;
    }
  }
}

/**
 * Architecture-steward default: tooling may consume checks/validation/business helpers.
 * A future unit must file an ADR before this becomes a public contract or owner change.
 */
export function classifyToolingValidationImport(from: string, to: string): { readonly kind: "allowed-consumer"; readonly reason: string } | undefined {
  const fromLayer = classifyLayer(from);
  const toLayer = classifyLayer(to);
  if (fromLayer !== "tooling" || !isValidationTarget(toLayer)) return undefined;
  return {
    kind: "allowed-consumer",
    reason: "Tooling is a legitimate consumer of checks/validation/business helpers unless a later unit changes tooling's public contract or ownership.",
  };
}

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(absolute));
    else if (SOURCE_FILE.test(entry.name)) files.push(absolute);
  }
  return files;
}

function moduleSpecifier(node: AstNode): string {
  return isAstNode(node.source) && typeof node.source.value === "string" ? node.source.value : "";
}

function lineOf(node: AstNode): number {
  return typeof node.loc?.start?.line === "number" ? node.loc.start.line : 0;
}

/**
 * Babel 8 reads `<T>(value: T) => value` as an unclosed JSX element whenever the jsx plugin is on,
 * so the plugin set has to follow the file extension the way tsc does: `.ts`, `.mts`, and `.cts`
 * never carry JSX; `.tsx` and every JavaScript extension may.
 */
function parserPluginsFor(file: string): Array<"typescript" | "jsx"> {
  return /\.(?:ts|mts|cts)$/u.test(file) ? ["typescript"] : ["typescript", "jsx"];
}

function collectSpecifierEdges(file: string, content: string): Array<{ specifier: string; line: number }> {
  const parsed = parse(content, {
    sourceType: "unambiguous",
    plugins: parserPluginsFor(file),
    allowUndeclaredExports: true,
    errorRecovery: false,
  }) as unknown as AstNode;
  const program = isAstNode(parsed.body) ? parsed : isAstNode((parsed as { program?: unknown }).program) ? (parsed as { program: AstNode }).program : parsed;
  const edges: Array<{ specifier: string; line: number }> = [];

  const visit = (node: unknown): void => {
    if (!isAstNode(node)) return;
    if (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration") {
      const specifier = moduleSpecifier(node);
      if (specifier) edges.push({ specifier, line: lineOf(node) });
    } else if (node.type === "ExportNamedDeclaration" && moduleSpecifier(node)) {
      edges.push({ specifier: moduleSpecifier(node), line: lineOf(node) });
    } else if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
      const callee = isAstNode(node.callee) ? node.callee : undefined;
      const isImport = callee?.type === "Import";
      const isRequire = callee?.type === "Identifier" && callee.name === "require";
      if (isImport || isRequire) {
        const arg = Array.isArray(node.arguments) ? node.arguments[0] : undefined;
        if (isAstNode(arg) && arg.type === "StringLiteral" && typeof arg.value === "string") {
          edges.push({ specifier: arg.value, line: lineOf(arg) || lineOf(node) });
        }
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
      } else if (isAstNode(value)) {
        visit(value);
      }
    }
  };

  visit(program);
  return edges;
}

function resolveRelativeImport(fromFile: string, specifier: string, repoRoot: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const raw = path.resolve(path.dirname(fromFile), specifier);
  const normalized = raw.replace(JS_EXTENSION, ".ts");
  return toPosix(path.relative(repoRoot, normalized));
}

function matchesRecordedDebt(edge: ImportEdge): boolean {
  return RECORDED_ARCH02_EDGES.some((recorded) => recorded.from === edge.from && recorded.line === edge.line && recorded.specifier === edge.specifier);
}

export function collectImportGraph(repoRoot: string): { readonly edges: ImportEdge[]; readonly parseIssues: Issue[] } {
  const files = SOURCE_LAYERS.flatMap((layer) => sourceFiles(path.join(repoRoot, layer)));
  const edges: ImportEdge[] = [];
  const parseIssues: Issue[] = [];

  for (const absolute of files) {
    const from = toPosix(path.relative(repoRoot, absolute));
    const fromLayer = classifyLayer(from);
    const content = readFileSync(absolute, "utf8");
    let specifiers: Array<{ specifier: string; line: number }>;
    try {
      specifiers = collectSpecifierEdges(absolute, content);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      parseIssues.push(issue("error", ARCH02_PARSE_FAILED, `Failed to parse ${from} for the ARCH-02 import graph: ${detail}`, from));
      continue;
    }
    for (const { specifier, line } of specifiers) {
      const resolved = resolveRelativeImport(absolute, specifier, repoRoot);
      if (!resolved) continue;
      edges.push({
        from,
        line,
        specifier,
        resolved,
        fromLayer,
        toLayer: classifyLayer(resolved),
      });
    }
  }

  return { edges, parseIssues };
}

export function collectArchitectureIssues(options: ArchitectureCheckOptions): Issue[] {
  const issues: Issue[] = [];
  const { edges, parseIssues } = collectImportGraph(options.repoRoot);
  issues.push(...parseIssues);

  const allowEdges = options.allowEdges ?? new Set<string>();
  const seenRecorded = new Set<string>();

  for (const edge of edges) {
    const toolingClassification = classifyToolingValidationImport(edge.from, edge.resolved);
    if (toolingClassification) continue;
    if (!isRuntimeImporter(edge.fromLayer) || !isValidationTarget(edge.toLayer)) continue;

    const location = edgeKey(edge.from, edge.line);
    const recorded = matchesRecordedDebt(edge);
    if (recorded) seenRecorded.add(recordedEdgeKey(edge));
    if (allowEdges.has(location) || (options.acceptRecordedDebt && recorded)) continue;

    issues.push(
      issue(
        "error",
        ARCH02_RULE,
        `ARCH-02 forbids ${edge.fromLayer} from importing a checks implementation module (${edge.specifier} → ${edge.resolved}).`,
        location,
        { line: edge.line, fixHint: "Keep checks out of the runtime kernel, catalog, and adapters. Extract a shared contract or invert the dependency." },
      ),
    );
  }

  if (options.acceptRecordedDebt) {
    for (const recorded of RECORDED_ARCH02_EDGES) {
      const key = recordedEdgeKey(recorded);
      if (seenRecorded.has(key)) continue;
      issues.push(
        issue(
          "error",
          ARCH02_RECORDED_DEBT_ABSENT,
          `Recorded ARCH-02 debt ${key} (${recorded.specifier}) is absent. Update the recorded-debt ledger in the same change that removes the import.`,
          key,
          { line: recorded.line },
        ),
      );
    }
  }

  return issues;
}

function collectAllowEdges(argv: string[]): Set<string> {
  const edges = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--allow-edge") continue;
    const value = argv[index + 1];
    if (!value) continue;
    edges.add(value);
    index += 1;
  }
  return edges;
}

export function runArchitectureCheck(argv: string[] = process.argv.slice(2)): Issue[] {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultRepoRoot = path.resolve(scriptDir, "../../..");
  const flags = parseFlags(argv, [
    { flags: ["--repo-root", "--root"], key: "repoRoot" },
    { flags: ["--accept-recorded-debt"], key: "acceptRecordedDebt", kind: "boolean" },
  ]);
  return collectArchitectureIssues({
    repoRoot: path.resolve(flagString(flags, "repoRoot") ?? defaultRepoRoot),
    acceptRecordedDebt: flagBoolean(flags, "acceptRecordedDebt"),
    allowEdges: collectAllowEdges(argv),
  });
}

if (isMainModule(import.meta.url)) {
  reportAndExit("Architecture check", runArchitectureCheck());
}
