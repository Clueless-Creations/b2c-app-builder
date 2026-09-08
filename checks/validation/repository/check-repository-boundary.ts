#!/usr/bin/env node
/**
 * Keep hosted product source and hosted authority outside the B2C App Builder package boundary.
 *
 * This is a repository-only check. An installed skill does not contain the repository root or
 * source registry, so the runtime audit must not run this check.
 *
 * npm script: check:repository-boundary
 * Usage: tsx checks/validation/repository/check-repository-boundary.ts --repo-root /path/to/B2C App Builder
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { parse as parseYaml } from "yaml";
import { findGitRoot } from "../../../tooling/lib/git-root.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";

interface SourceEntry {
  id?: unknown;
  source_type?: unknown;
  status?: unknown;
  locations?: unknown;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "../../..");
const flags = parseFlags(process.argv.slice(2), [{ flags: ["--repo-root", "--root"], key: "repoRoot" }]);
const repoRoot = path.resolve(flagString(flags, "repoRoot") ?? defaultRepoRoot);
const issues: Issue[] = [];

const allowedTopLevelDirectories = new Set([
  ".claude",
  ".codex",
  ".cursor",
  ".git",
  ".github",
  ".superdesign",
  ".worktrees",
  "adapters",
  "agents",
  "catalog",
  "checks",
  "contracts",
  "docs",
  "entrypoints",
  "examples",
  "hosted",
  "kernel",
  "knowledge",
  "node_modules",
  "surfaces",
  "tooling",
]);
const allowedTopLevelFiles = new Set([
  ".DS_Store",
  ".git",
  ".gitignore",
  ".node-version",
  ".npmignore",
  ".nvmrc",
  ".prettierrc.json",
  ".prettierignore",
  // ADR-0005: credit and notice surfaces rendered from catalog/upstreams by tooling/render-credits.ts.
  "ACKNOWLEDGMENTS.md",
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SKILL.md",
  "THIRD_PARTY_NOTICES.md",
  "package-lock.json",
  "package.json",
  "skill-version.json",
  "tsconfig.json",
]);

function realPath(value: string): string {
  try {
    return realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function gitNulPaths(root: string, argv: string[]): string[] | undefined {
  const result = spawnSync("git", ["-C", root, ...argv], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  return (result.stdout ?? "").split("\0").filter(Boolean);
}

/**
 * When --repo-root is the git toplevel, the allowlist applies to tracked files and to
 * untracked files git would absorb (`git add -A`). Ignored local files, including
 * `.git/info/exclude`, are not repository contents. Fixture roots are not git
 * repositories, so they keep the working-tree walk.
 */
function topLevelEntries(root: string): { files: Set<string>; directories: Set<string> } {
  const gitRoot = findGitRoot(root);
  if (gitRoot && realPath(gitRoot) === realPath(root)) {
    const tracked = gitNulPaths(root, ["ls-files", "-z"]);
    const others = gitNulPaths(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
    if (tracked && others) {
      const files = new Set<string>();
      const directories = new Set<string>();
      for (const relative of [...tracked, ...others]) {
        const normalized = relative.replaceAll("\\", "/");
        const slash = normalized.indexOf("/");
        if (slash === -1) files.add(normalized);
        else directories.add(normalized.slice(0, slash));
      }
      return { files, directories };
    }
  }
  const files = new Set<string>();
  const directories = new Set<string>();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) directories.add(entry.name);
    else files.add(entry.name);
  }
  return { files, directories };
}

const topLevel = topLevelEntries(repoRoot);
for (const name of topLevel.files) {
  if (allowedTopLevelFiles.has(name)) continue;
  issues.push(
    issue(
      "error",
      "repository_boundary.cloud_ui_source",
      `The top-level ${name} file is not an approved B2C App Builder entry point. Add it to the repository boundary only with an architecture update.`,
      name,
    ),
  );
}
for (const name of topLevel.directories) {
  if (allowedTopLevelDirectories.has(name)) continue;
  issues.push(
    issue(
      "error",
      "repository_boundary.cloud_ui_source",
      `The top-level ${name}/ directory is not an approved B2C App Builder source layer. Add it to the repository boundary only with an architecture update.`,
      `${name}/`,
    ),
  );
}

/**
 * ADR-0002: the repository root is the package root, and the top-level allowlist above is the
 * complete set of source layers. Product source trees (apps, frontend, site, web) may exist only
 * under surfaces/starters/ and examples/; anywhere else they are a second product in this repo.
 */
const disallowedProductSourceDirectories = new Set(["apps", "frontend", "site", "web"]);
const inspectNestedDirectories = (directory: string, relative: string): void => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || ["dist", "node_modules", ".git"].includes(entry.name)) continue;
    const childRelative = `${relative}/${entry.name}`;
    if (disallowedProductSourceDirectories.has(entry.name)) {
      issues.push(
        issue(
          "error",
          "repository_boundary.cloud_ui_source",
          `The ${childRelative}/ directory is not an approved source layer. Put runnable consumer-app examples under surfaces/starters/ and reference businesses under examples/.`,
          `${childRelative}/`,
        ),
      );
      continue;
    }
    inspectNestedDirectories(path.join(directory, entry.name), childRelative);
  }
};
for (const layer of ["adapters", "catalog", "checks", "contracts", "entrypoints", "hosted", "kernel", "knowledge", "tooling"]) {
  const layerRoot = path.join(repoRoot, layer);
  if (existsSync(layerRoot)) inspectNestedDirectories(layerRoot, layer);
}

const registryPath = path.join(repoRoot, "checks/validation/repository/source-registry.yaml");
if (existsSync(registryPath)) {
  const parsed = parseYaml(readFileSync(registryPath, "utf8")) as { sources?: unknown } | null;
  const sources = Array.isArray(parsed?.sources) ? (parsed.sources as SourceEntry[]) : [];
  const productTypes = new Set(["human_facing_web", "marketing_site", "product_source", "product_ui"]);
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const status = typeof source.status === "string" ? source.status.toLowerCase() : "active";
    if (["historical", "retired", "superseded"].includes(status)) continue;
    const sourceType = typeof source.source_type === "string" ? source.source_type.toLowerCase() : "";
    const locations = Array.isArray(source.locations) ? source.locations.filter((item): item is string => typeof item === "string") : [];
    const hasCloudUiLocation = locations.some((location) => /^(?:site|web|platform)\//u.test(location));
    if (!productTypes.has(sourceType) && !hasCloudUiLocation) continue;
    const id = typeof source.id === "string" ? source.id : "unnamed source";
    issues.push(
      issue(
        "error",
        "repository_boundary.cloud_product_registry",
        `Source registry entry ${id} points at active hosted product source. Keep this registry focused on consumer-app expertise and B2C App Builder package sources.`,
        "checks/validation/repository/source-registry.yaml",
      ),
    );
  }
}

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (["generated", "node_modules", "test", "tests", "fixtures", ".wrangler", ".build", ".next", "dist", "build"].includes(entry.name)) continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(absolute));
    else if (/\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/u.test(entry.name)) {
      // Wrangler verifies these generated runtime declarations separately.
      const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
      if (["hosted/knowledge-mcp/worker-configuration.d.ts", "hosted/builder-console/worker-configuration.d.ts"].includes(relative)) continue;
      files.push(absolute);
    }
  }
  return files;
}

const cloudPublicationName = /(?:cloud_?publication|b2c_?cloud\w*publication)/iu;
const authorityOperationNames = new Set([
  "acceptVerification",
  "acquireLock",
  "abandonDependencyRefreshesForConsumer",
  "appendAuditEntry",
  "applyNextEffect",
  "applyAppReviewPlan",
  "applyConsumerPatches",
  "approve",
  "approveRun",
  "approveSession",
  "applyStandingApprovals",
  "beginAttempt",
  "claimCompletion",
  "commitGates",
  "commitPatch",
  "complete",
  "completeRun",
  "completeSession",
  "completeOccurrence",
  "deferDependencyRefreshAfterFailure",
  "detectOrphans",
  "computeFrontier",
  "exhaustOccurrence",
  "grant",
  "grantAccess",
  "grantAuthority",
  "grantPermission",
  "heartbeat",
  "instantiateWorkOrder",
  "invalidateDescendants",
  "linkAttempt",
  "persist",
  "persistRun",
  "persistSession",
  "persistState",
  "reconcilePatch",
  "reconcileEnvironmentalArtifacts",
  "reconcileWorkflowApplicability",
  "recordAppReviewVerification",
  "recordWorkOrderProof",
  "registerWorkspace",
  "refreshDependenciesBeforeFrontier",
  "refreshHeartbeat",
  "releaseLock",
  "reopenNodesForAuthorizedWorkOrders",
  "reopenRecurringNodes",
  "restoreOccurrenceAfterAttempt",
  "removeWorkspace",
  "requestInteractive",
  "reviewOutcome",
  "saveSession",
  "scheduleObservation",
  "seedRunState",
  "syncOccurrenceMandates",
  "writeAppReviewState",
  "writeAppReviewWatch",
  "takeAuthorizedOccurrence",
  "revokeOccurrenceMandate",
  "writeApproval",
  "writeCheckpoint",
  "writeRunState",
  "writeState",
]);
const functionTypes = new Set([
  "ArrowFunctionExpression",
  "ClassMethod",
  "ClassPrivateMethod",
  "FunctionDeclaration",
  "FunctionExpression",
  "ObjectMethod",
  "TSDeclareFunction",
]);
const synchronousCallbackInvokers = new Set([
  "every",
  "filter",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "flatMap",
  "forEach",
  "map",
  "reduce",
  "reduceRight",
  "some",
  "sort",
]);
const cloudValueCallbackInvokers = new Set(["then"]);

interface AstNode {
  type: string;
  start?: number | null;
  end?: number | null;
  [key: string]: unknown;
}

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value && typeof value === "object" && "type" in value && typeof (value as { type?: unknown }).type === "string");
}

function childNodes(node: AstNode): AstNode[] {
  const children: AstNode[] = [];
  for (const value of Object.values(node)) {
    if (isAstNode(value)) children.push(value);
    else if (Array.isArray(value)) children.push(...value.filter(isAstNode));
  }
  return children;
}

function walk(node: AstNode, visit: (current: AstNode) => void): void {
  visit(node);
  for (const child of childNodes(node)) walk(child, visit);
}

function identifierNames(node: AstNode | undefined): Set<string> {
  const names = new Set<string>();
  if (!node) return names;
  walk(node, (current) => {
    if (current.type === "Identifier" && typeof current.name === "string") names.add(current.name);
    else if (current.type === "ThisExpression") names.add("this");
  });
  return names;
}

function referenceNames(node: AstNode | undefined): Set<string> {
  const names = identifierNames(node);
  if (!node) return names;
  walk(node, (current) => {
    if (!["MemberExpression", "OptionalMemberExpression", "TSQualifiedName"].includes(current.type)) return;
    const qualified = calleeName(current);
    if (qualified) names.add(qualified);
  });
  return names;
}

function bindingIdentifierNames(node: AstNode | undefined): Set<string> {
  const names = new Set<string>();
  if (!node) return names;
  if (node.type === "Identifier" && typeof node.name === "string") {
    names.add(node.name);
    return names;
  }
  if (node.type === "ObjectProperty") return bindingIdentifierNames(isAstNode(node.value) ? node.value : undefined);
  if (["AssignmentPattern", "RestElement", "TSParameterProperty"].includes(node.type)) {
    return bindingIdentifierNames(
      isAstNode(node.left) ? node.left : isAstNode(node.argument) ? node.argument : isAstNode(node.parameter) ? node.parameter : undefined,
    );
  }
  if (!["ArrayPattern", "ObjectPattern"].includes(node.type)) return names;
  for (const child of childNodes(node)) {
    for (const name of bindingIdentifierNames(child)) names.add(name);
  }
  return names;
}

function rootIdentifier(node: AstNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "Identifier" && typeof node.name === "string") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (["MemberExpression", "OptionalMemberExpression", "TSAsExpression", "TSNonNullExpression"].includes(node.type)) {
    return rootIdentifier(isAstNode(node.object) ? node.object : isAstNode(node.expression) ? node.expression : undefined);
  }
  return undefined;
}

function calleeName(node: AstNode | undefined): string {
  if (!node) return "";
  if (node.type === "Identifier" && typeof node.name === "string") return node.name;
  if (node.type === "StringLiteral" && typeof node.value === "string") return node.value;
  if (node.type === "NewExpression") return calleeName(isAstNode(node.callee) ? node.callee : undefined);
  if (["MemberExpression", "OptionalMemberExpression", "TSQualifiedName"].includes(node.type)) {
    const object = calleeName(isAstNode(node.object) ? node.object : isAstNode(node.left) ? node.left : undefined);
    const property = calleeName(isAstNode(node.property) ? node.property : isAstNode(node.right) ? node.right : undefined);
    return [object, property].filter(Boolean).join(".");
  }
  return "";
}

function typeNames(node: AstNode | undefined): Set<string> {
  const names = identifierNames(node);
  if (!node) return names;
  walk(node, (current) => {
    if (current.type !== "TSQualifiedName") return;
    const qualified = calleeName(current);
    if (qualified) names.add(qualified);
  });
  return names;
}

function isAuthorityOperation(name: string): boolean {
  const terminalName = name.split(".").at(-1) ?? "";
  return authorityOperationNames.has(terminalName);
}

function isSynchronousCallbackInvoker(call: AstNode, arrayBindings: Set<string>, receiverHasCloudTaint = false): boolean {
  const callee = isAstNode(call.callee) ? call.callee : undefined;
  if (!callee || !["MemberExpression", "OptionalMemberExpression"].includes(callee.type)) return false;
  if (calleeName(callee) === "Array.from") return receiverHasCloudTaint;
  const terminalName = calleeName(isAstNode(callee.property) ? callee.property : undefined);
  if (!synchronousCallbackInvokers.has(terminalName) && !(receiverHasCloudTaint && cloudValueCallbackInvokers.has(terminalName))) return false;
  const receiver = isAstNode(callee.object) ? callee.object : undefined;
  if (receiver?.type === "ArrayExpression") return true;
  if (receiverHasCloudTaint) return true;
  const receiverRoot = rootIdentifier(receiver);
  return Boolean(receiverRoot && arrayBindings.has(receiverRoot));
}

function callableReturnTypesForName(name: string, returnTypes: Map<string, Set<string>>, instanceTypes: Map<string, string>): Set<string> {
  const direct = returnTypes.get(name);
  if (direct) return direct;
  const [receiver, ...rest] = name.split(".");
  const instanceType = receiver ? instanceTypes.get(receiver) : undefined;
  return instanceType && rest.length > 0 ? (returnTypes.get(`${instanceType}.${rest.join(".")}`) ?? new Set<string>()) : new Set<string>();
}

function callableReturnSourcesForName(name: string, returnSources: Map<string, Set<string>>, instanceTypes: Map<string, string>): Set<string> {
  const direct = returnSources.get(name);
  if (direct) return direct;
  const [receiver, ...rest] = name.split(".");
  const instanceType = receiver ? instanceTypes.get(receiver) : undefined;
  return instanceType && rest.length > 0 ? (returnSources.get(`${instanceType}.${rest.join(".")}`) ?? new Set<string>()) : new Set<string>();
}

function callableReturnsCloud(
  name: string,
  tainted: Set<string>,
  cloudTypes: Set<string>,
  returnTypes: Map<string, Set<string>>,
  returnSources: Map<string, Set<string>>,
  instanceTypes: Map<string, string>,
  visited = new Set<string>(),
): boolean {
  if (!name || visited.has(name)) return false;
  visited.add(name);
  if ([...callableReturnTypesForName(name, returnTypes, instanceTypes)].some((type) => cloudPublicationName.test(type) || cloudTypes.has(type))) return true;
  return [...callableReturnSourcesForName(name, returnSources, instanceTypes)].some(
    (source) =>
      tainted.has(source) ||
      cloudPublicationName.test(source) ||
      callableReturnsCloud(source, tainted, cloudTypes, returnTypes, returnSources, instanceTypes, visited),
  );
}

function objectCallableEntries(node: AstNode): Array<{ name: string; callable: AstNode }> {
  if (node.type !== "ObjectExpression" || !Array.isArray(node.properties)) return [];
  const result: Array<{ name: string; callable: AstNode }> = [];
  for (const property of node.properties.filter(isAstNode)) {
    const name = calleeName(isAstNode(property.key) ? property.key : undefined);
    if (!name) continue;
    if (functionTypes.has(property.type)) result.push({ name, callable: property });
    else {
      const value = isAstNode(property.value) ? property.value : undefined;
      if (value && functionTypes.has(value.type)) result.push({ name, callable: value });
    }
  }
  return result;
}

function classFieldInstanceTypes(node: AstNode): Map<string, string> {
  const result = new Map<string, string>();
  const members = isAstNode(node.body) && Array.isArray(node.body.body) ? node.body.body.filter(isAstNode) : [];
  const record = (fieldName: string, instanceType: string): void => {
    result.set(fieldName, instanceType);
    result.set(`this.${fieldName}`, instanceType);
  };
  for (const member of members) {
    if (member.static !== true && ["ClassProperty", "PropertyDefinition"].includes(member.type)) {
      const fieldName = calleeName(isAstNode(member.key) ? member.key : undefined);
      const value = isAstNode(member.value) ? member.value : undefined;
      if (fieldName && value?.type === "NewExpression") {
        const instanceType = calleeName(isAstNode(value.callee) ? value.callee : undefined);
        if (instanceType) record(fieldName, instanceType);
      }
    }
    if (!functionTypes.has(member.type) || calleeName(isAstNode(member.key) ? member.key : undefined) !== "constructor") continue;
    for (const parameter of Array.isArray(member.params) ? member.params.filter(isAstNode) : []) {
      const value = parameter.type === "TSParameterProperty" && isAstNode(parameter.parameter) ? parameter.parameter : parameter;
      const target = value.type === "AssignmentPattern" && isAstNode(value.left) ? value.left : value;
      const defaultValue = value.type === "AssignmentPattern" && isAstNode(value.right) ? value.right : undefined;
      const fieldName = [...bindingIdentifierNames(target)][0];
      const instanceType =
        defaultValue?.type === "NewExpression"
          ? calleeName(isAstNode(defaultValue.callee) ? defaultValue.callee : undefined)
          : [...typeNames(isAstNode(target.typeAnnotation) ? target.typeAnnotation : undefined)].at(-1);
      if (parameter.type === "TSParameterProperty" && fieldName && instanceType) record(fieldName, instanceType);
    }
    const constructorBody = isAstNode(member.body) ? member.body : undefined;
    if (constructorBody)
      walk(constructorBody, (current) => {
        if (current.type !== "AssignmentExpression") return;
        const left = isAstNode(current.left) ? current.left : undefined;
        const right = isAstNode(current.right) ? current.right : undefined;
        if (!left || right?.type !== "NewExpression" || rootIdentifier(left) !== "this") return;
        const fieldName = calleeName(left).split(".").at(-1) ?? "";
        const instanceType = calleeName(isAstNode(right.callee) ? right.callee : undefined);
        if (fieldName && instanceType) record(fieldName, instanceType);
      });
  }
  return result;
}

function functionReturnSourceNames(node: AstNode, inheritedInstanceTypes = new Map<string, string>()): Set<string> {
  const names = new Set<string>();
  const body = isAstNode(node.body) ? node.body : undefined;
  if (!body) return names;
  const localInstanceTypes = new Map(inheritedInstanceTypes);
  const collectLocalInstances = (current: AstNode): void => {
    if (current !== body && functionTypes.has(current.type)) return;
    if (current.type === "VariableDeclarator") {
      const init = isAstNode(current.init) ? current.init : undefined;
      const targets = bindingIdentifierNames(isAstNode(current.id) ? current.id : undefined);
      if (init?.type === "NewExpression") {
        const instanceType = calleeName(isAstNode(init.callee) ? init.callee : undefined);
        if (instanceType) for (const target of targets) localInstanceTypes.set(target, instanceType);
      }
    }
    for (const child of childNodes(current)) collectLocalInstances(child);
  };
  collectLocalInstances(body);
  const addName = (name: string): void => {
    const parts = name.split(".");
    for (let receiverLength = parts.length - 1; receiverLength > 0; receiverLength -= 1) {
      const receiver = parts.slice(0, receiverLength).join(".");
      const instanceType = localInstanceTypes.get(receiver);
      if (!instanceType) continue;
      names.add(`${instanceType}.${parts.slice(receiverLength).join(".")}`);
      return;
    }
    names.add(name);
  };
  const addReturnExpression = (argument: AstNode | undefined): void => {
    for (const name of identifierNames(argument)) addName(name);
    if (!argument) return;
    walk(argument, (nested) => {
      if (!["CallExpression", "OptionalCallExpression"].includes(nested.type)) return;
      const qualified = calleeName(isAstNode(nested.callee) ? nested.callee : undefined);
      if (qualified) addName(qualified);
    });
  };
  if (body.type !== "BlockStatement") {
    addReturnExpression(body);
    return names;
  }
  const visit = (current: AstNode): void => {
    if (current !== body && functionTypes.has(current.type)) return;
    if (current.type === "ReturnStatement") {
      const argument = isAstNode(current.argument) ? current.argument : undefined;
      addReturnExpression(argument);
      return;
    }
    for (const child of childNodes(current)) visit(child);
  };
  visit(body);
  return names;
}

function functionCallNames(node: AstNode): Set<string> {
  const names = new Set<string>();
  const body = isAstNode(node.body) ? node.body : undefined;
  if (!body) return names;
  const visit = (current: AstNode): void => {
    if (current !== body && functionTypes.has(current.type)) return;
    if (["CallExpression", "OptionalCallExpression"].includes(current.type)) {
      const name = calleeName(isAstNode(current.callee) ? current.callee : undefined);
      if (name) names.add(name);
    }
    for (const child of childNodes(current)) visit(child);
  };
  visit(body);
  return names;
}

function directAuthorityParameterPositions(node: AstNode): Set<number> {
  const positions = new Set<number>();
  const parameters = Array.isArray(node.params) ? node.params.filter(isAstNode) : [];
  const parameterNames = parameters.map((parameter) => bindingIdentifierNames(parameter));
  const body = isAstNode(node.body) ? node.body : undefined;
  if (!body) return positions;
  const visit = (current: AstNode): void => {
    if (current !== body && functionTypes.has(current.type)) return;
    if (["CallExpression", "OptionalCallExpression"].includes(current.type)) {
      const callee = calleeName(isAstNode(current.callee) ? current.callee : undefined);
      if (isAuthorityOperation(callee)) {
        const argumentNames = new Set<string>();
        for (const argument of Array.isArray(current.arguments) ? current.arguments.filter(isAstNode) : []) {
          for (const name of identifierNames(argument)) argumentNames.add(name);
        }
        for (const [index, names] of parameterNames.entries()) if ([...names].some((name) => argumentNames.has(name))) positions.add(index);
      }
    }
    for (const child of childNodes(current)) visit(child);
  };
  visit(body);
  return positions;
}

function callParameterMappings(node: AstNode): Map<string, Map<number, Set<number>>> {
  const mappings = new Map<string, Map<number, Set<number>>>();
  const parameters = Array.isArray(node.params) ? node.params.filter(isAstNode) : [];
  const parameterNames = parameters.map((parameter) => bindingIdentifierNames(parameter));
  const body = isAstNode(node.body) ? node.body : undefined;
  if (!body) return mappings;
  const visit = (current: AstNode): void => {
    if (current !== body && functionTypes.has(current.type)) return;
    if (["CallExpression", "OptionalCallExpression"].includes(current.type)) {
      const callee = calleeName(isAstNode(current.callee) ? current.callee : undefined);
      if (callee) {
        const argumentMappings = mappings.get(callee) ?? new Map<number, Set<number>>();
        const args = Array.isArray(current.arguments) ? current.arguments.filter(isAstNode) : [];
        for (const [argumentIndex, argument] of args.entries()) {
          const argumentNames = identifierNames(argument);
          const outerPositions = argumentMappings.get(argumentIndex) ?? new Set<number>();
          for (const [parameterIndex, names] of parameterNames.entries()) {
            if ([...names].some((name) => argumentNames.has(name))) outerPositions.add(parameterIndex);
          }
          argumentMappings.set(argumentIndex, outerPositions);
        }
        mappings.set(callee, argumentMappings);
      }
    }
    for (const child of childNodes(current)) visit(child);
  };
  visit(body);
  return mappings;
}

function expressionHasCloudTaint(
  expression: AstNode | undefined,
  tainted: Set<string>,
  cloudTypes: Set<string>,
  returnTypes: Map<string, Set<string>>,
  returnSources: Map<string, Set<string>>,
  instanceTypes: Map<string, string>,
): boolean {
  if (!expression) return false;
  if ([...referenceNames(expression)].some((name) => tainted.has(name) || cloudPublicationName.test(name))) return true;
  let found = false;
  walk(expression, (current) => {
    if (found) return;
    const isCall = ["CallExpression", "OptionalCallExpression"].includes(current.type);
    const isMemberRead = ["MemberExpression", "OptionalMemberExpression"].includes(current.type);
    if (!isCall && !isMemberRead) return;
    const name = isCall ? calleeName(isAstNode(current.callee) ? current.callee : undefined) : calleeName(current);
    if (callableReturnsCloud(name, tainted, cloudTypes, returnTypes, returnSources, instanceTypes)) found = true;
  });
  return found;
}

function taintedCallbackParameters(
  callback: AstNode,
  args: AstNode[],
  tainted: Set<string>,
  cloudTypes: Set<string>,
  returnTypes: Map<string, Set<string>>,
  returnSources: Map<string, Set<string>>,
  instanceTypes: Map<string, string>,
): Set<string> {
  const result = new Set<string>();
  const parameters = Array.isArray(callback.params) ? callback.params.filter(isAstNode) : [];
  for (const [index, parameter] of parameters.entries()) {
    const argument = args[index];
    if (!argument) continue;
    if (!expressionHasCloudTaint(argument, tainted, cloudTypes, returnTypes, returnSources, instanceTypes)) continue;
    for (const name of bindingIdentifierNames(parameter)) result.add(name);
  }
  return result;
}

const lexicalScopeTypes = new Set(["BlockStatement", "CatchClause", "ForInStatement", "ForOfStatement", "ForStatement", "SwitchStatement"]);

function scopedNodes(body: AstNode): {
  nodes: AstNode[];
  nestedFunctions: AstNode[];
  nestedFunctionInstanceTypes: Map<AstNode, Map<string, string>>;
  nestedLexicalScopes: AstNode[];
  conditionalNodes: Set<AstNode>;
  controlSourceNames: Map<AstNode, Set<string>>;
} {
  const nodes: AstNode[] = [];
  const nestedFunctions: AstNode[] = [];
  const nestedFunctionInstanceTypes = new Map<AstNode, Map<string, string>>();
  const nestedLexicalScopes: AstNode[] = [];
  const conditionalNodes = new Set<AstNode>();
  const controlSourceNames = new Map<AstNode, Set<string>>();
  const visit = (node: AstNode, inheritedInstanceTypes = new Map<string, string>(), conditional = false, controlSources = new Set<string>()): void => {
    nodes.push(node);
    if (conditional) conditionalNodes.add(node);
    if (controlSources.size > 0) controlSourceNames.set(node, new Set(controlSources));
    const childInstanceTypes = new Map(inheritedInstanceTypes);
    if (["ClassDeclaration", "ClassExpression"].includes(node.type)) {
      for (const [field, instanceType] of classFieldInstanceTypes(node)) childInstanceTypes.set(field, instanceType);
    }
    for (const child of childNodes(node)) {
      const childControlSources = new Set(controlSources);
      if (node.type === "IfStatement" && child !== node.test)
        for (const name of referenceNames(isAstNode(node.test) ? node.test : undefined)) childControlSources.add(name);
      if (node.type === "ConditionalExpression" && child !== node.test)
        for (const name of referenceNames(isAstNode(node.test) ? node.test : undefined)) childControlSources.add(name);
      if (node.type === "LogicalExpression" && child === node.right)
        for (const name of referenceNames(isAstNode(node.left) ? node.left : undefined)) childControlSources.add(name);
      if (node.type === "SwitchStatement" && child !== node.discriminant)
        for (const name of referenceNames(isAstNode(node.discriminant) ? node.discriminant : undefined)) childControlSources.add(name);
      if (["DoWhileStatement", "WhileStatement"].includes(node.type) && child !== node.test)
        for (const name of referenceNames(isAstNode(node.test) ? node.test : undefined)) childControlSources.add(name);
      if (node.type === "ForStatement" && child === node.body)
        for (const name of referenceNames(isAstNode(node.test) ? node.test : undefined)) childControlSources.add(name);
      if (child !== body && functionTypes.has(child.type)) {
        nestedFunctions.push(child);
        nestedFunctionInstanceTypes.set(child, childInstanceTypes);
        continue;
      }
      if (child !== body && lexicalScopeTypes.has(child.type)) {
        nestedLexicalScopes.push(child);
        if (childControlSources.size > 0) controlSourceNames.set(child, childControlSources);
        continue;
      }
      const conditionallyExecuted =
        conditional ||
        (node.type === "IfStatement" && child !== node.test) ||
        (node.type === "ConditionalExpression" && child !== node.test) ||
        (node.type === "LogicalExpression" && child === node.right);
      visit(child, childInstanceTypes, conditionallyExecuted, childControlSources);
    }
  };
  visit(body);
  return { nodes, nestedFunctions, nestedFunctionInstanceTypes, nestedLexicalScopes, conditionalNodes, controlSourceNames };
}

function scopeUsesCloudPublicationAsAuthority(
  node: AstNode,
  content: string,
  inheritedTaint = new Set<string>(),
  inheritedCloudTypes = new Set<string>(),
  inheritedAuthorityAliases = new Set<string>(),
  inheritedAuthorityArgumentPositions = new Map<string, Set<number>>(),
  inheritedVisibleBindings = new Set<string>(),
  inheritedCallableReturnTypes = new Map<string, Set<string>>(),
  inheritedCallableReturnSources = new Map<string, Set<string>>(),
  inheritedInstanceTypes = new Map<string, string>(),
  inheritedArrayBindings = new Set<string>(),
  propagatedTaint?: Set<string>,
  propagatedAuthorityAliases?: Set<string>,
  explicitParameterTaint = new Set<string>(),
  explicitCallbackDefinitions = new Map<string, AstNode>(),
  inheritedControlTaint = false,
): boolean {
  const tainted = new Set(inheritedTaint);
  const authorityAliases = new Set(inheritedAuthorityAliases);
  const authorityArgumentPositions = new Map(inheritedAuthorityArgumentPositions);
  const parameterCloudTypes = new Set(inheritedCloudTypes);
  const typeParameters = isAstNode(node.typeParameters) && Array.isArray(node.typeParameters.params) ? node.typeParameters.params.filter(isAstNode) : [];
  let genericTypesChanged = true;
  while (genericTypesChanged) {
    genericTypesChanged = false;
    for (const typeParameter of typeParameters) {
      // Babel 7 stored a type parameter's name as a string; Babel 8 stores an Identifier node.
      const name =
        typeof typeParameter.name === "string"
          ? typeParameter.name
          : isAstNode(typeParameter.name) && typeof typeParameter.name.name === "string"
            ? typeParameter.name.name
            : "";
      const constraintNames = typeNames(isAstNode(typeParameter.constraint) ? typeParameter.constraint : undefined);
      if (!name || parameterCloudTypes.has(name)) continue;
      if (![...constraintNames].some((constraint) => cloudPublicationName.test(constraint) || parameterCloudTypes.has(constraint))) continue;
      parameterCloudTypes.add(name);
      genericTypesChanged = true;
    }
  }
  const parameterBindings = new Set<string>();
  const parameters = Array.isArray(node.params) ? node.params.filter(isAstNode) : [];
  if (isAstNode(node.param)) parameters.push(node.param);
  for (const parameter of parameters) {
    const parameterNames = bindingIdentifierNames(parameter);
    for (const name of parameterNames) {
      parameterBindings.add(name);
      tainted.delete(name);
      authorityAliases.delete(name);
      if (explicitParameterTaint.has(name)) tainted.add(name);
    }
    const start = typeof parameter.start === "number" ? parameter.start : 0;
    const end = typeof parameter.end === "number" ? parameter.end : start;
    const parameterSource = content.slice(start, end);
    const parameterTypeNames = typeNames(isAstNode(parameter.typeAnnotation) ? parameter.typeAnnotation : undefined);
    if (!cloudPublicationName.test(parameterSource) && ![...parameterTypeNames].some((name) => parameterCloudTypes.has(name))) continue;
    for (const name of parameterNames) {
      if (!cloudPublicationName.test(name) && !/^\w+$/u.test(name)) continue;
      tainted.add(name);
    }
  }

  const body = lexicalScopeTypes.has(node.type) ? node : isAstNode(node.body) ? node.body : node;
  type AssignmentEvent = {
    kind: "assignment";
    start: number;
    targets: Set<string>;
    sourceNames: Set<string>;
    declaredTypes: Set<string>;
    authoritySourceNames: Set<string>;
    authorityTargets: Set<string>;
    canClear: boolean;
  };
  type CallEvent = { kind: "call"; start: number; call: AstNode };
  type LexicalScopeEvent = { kind: "scope"; start: number; scope: AstNode };
  const events: Array<AssignmentEvent | CallEvent | LexicalScopeEvent> = [];
  const typeAliases: Array<{ name: string; references: Set<string> }> = [];
  const localBindings = new Set<string>();
  const importedTaintedBindings = new Set<string>();
  const importedAuthorityAliases = new Set<string>();
  const importedCloudTypes = new Set<string>();
  const callbackDefinitions = new Map<string, AstNode>(explicitCallbackDefinitions);
  const mutationParameterMappings = new Map<string, Map<number, Set<number>>>();
  const callableReturnTypes = new Map(inheritedCallableReturnTypes);
  const callableReturnSources = new Map(inheritedCallableReturnSources);
  const instanceTypes = new Map(inheritedInstanceTypes);
  const arrayBindings = new Set(inheritedArrayBindings);
  const containerAliases = new Map<string, Set<string>>();
  const scope = scopedNodes(body);
  for (const current of scope.nodes) {
    if (current.type === "VariableDeclarator") {
      const id = isAstNode(current.id) ? current.id : undefined;
      const targets = bindingIdentifierNames(id);
      for (const target of targets) localBindings.add(target);
      const sourceNames = referenceNames(isAstNode(current.init) ? current.init : undefined);
      for (const name of referenceNames(id)) {
        if (!targets.has(name)) sourceNames.add(name);
      }
      const authoritySourceNames = new Set(sourceNames);
      for (const name of identifierNames(id)) {
        if (!targets.has(name)) authoritySourceNames.add(name);
      }
      const declaredTypes = identifierNames(isAstNode(id?.typeAnnotation) ? id.typeAnnotation : undefined);
      const init = isAstNode(current.init) ? current.init : undefined;
      const sourceRoot = rootIdentifier(init);
      if (sourceRoot) {
        for (const target of targets) {
          if (target === sourceRoot) continue;
          const aliases = containerAliases.get(target) ?? new Set<string>();
          aliases.add(sourceRoot);
          containerAliases.set(target, aliases);
        }
      }
      if (init?.type === "NewExpression") {
        const instanceType = calleeName(isAstNode(init.callee) ? init.callee : undefined);
        if (instanceType) for (const target of targets) instanceTypes.set(target, instanceType);
      }
      if (init?.type === "ArrayExpression") for (const target of targets) arrayBindings.add(target);
      if (init?.type === "ClassExpression" && targets.size === 1) {
        const className = [...targets][0]!;
        const fieldInstanceTypes = classFieldInstanceTypes(init);
        const methods = isAstNode(init.body) && Array.isArray(init.body.body) ? init.body.body.filter(isAstNode) : [];
        for (const method of methods) {
          const methodName = calleeName(isAstNode(method.key) ? method.key : undefined);
          if (!methodName || !functionTypes.has(method.type)) continue;
          callableReturnTypes.set(`${className}.${methodName}`, typeNames(isAstNode(method.returnType) ? method.returnType : undefined));
          callableReturnSources.set(`${className}.${methodName}`, functionReturnSourceNames(method, fieldInstanceTypes));
        }
      }
      if (init?.type === "ObjectExpression" && targets.size === 1) {
        const objectName = [...targets][0]!;
        for (const { name, callable } of objectCallableEntries(init)) {
          const qualifiedName = `${objectName}.${name}`;
          callableReturnTypes.set(qualifiedName, typeNames(isAstNode(callable.returnType) ? callable.returnType : undefined));
          callableReturnSources.set(qualifiedName, functionReturnSourceNames(callable));
          const authorityCalls = functionCallNames(callable);
          if ([...authorityCalls].some((callName) => isAuthorityOperation(callName) || authorityAliases.has(callName))) {
            authorityAliases.add(qualifiedName);
            authorityArgumentPositions.set(qualifiedName, directAuthorityParameterPositions(callable));
          }
        }
        if (Array.isArray(init.properties)) {
          for (const property of init.properties.filter(isAstNode)) {
            if (property.type !== "ObjectProperty") continue;
            const propertyName = calleeName(isAstNode(property.key) ? property.key : undefined);
            const valueNames = referenceNames(isAstNode(property.value) ? property.value : undefined);
            if (!propertyName || ![...valueNames].some((name) => isAuthorityOperation(name) || authorityAliases.has(name))) continue;
            authorityAliases.add(`${objectName}.${propertyName}`);
          }
        }
      }
      if (init && ["CallExpression", "OptionalCallExpression"].includes(init.type)) {
        const calledName = calleeName(isAstNode(init.callee) ? init.callee : undefined);
        if (calledName) sourceNames.add(calledName);
      }
      if (init && functionTypes.has(init.type) && targets.size === 1) {
        const target = [...targets][0]!;
        callbackDefinitions.set(target, init);
        callableReturnTypes.set(target, typeNames(isAstNode(init.returnType) ? init.returnType : undefined));
        callableReturnSources.set(target, functionReturnSourceNames(init));
      }
      events.push({
        kind: "assignment",
        start: typeof current.start === "number" ? current.start : 0,
        targets,
        sourceNames,
        declaredTypes,
        authoritySourceNames,
        authorityTargets: new Set(targets),
        canClear: Boolean(init),
      });
    } else if (["ForInStatement", "ForOfStatement"].includes(current.type)) {
      const left = isAstNode(current.left) ? current.left : undefined;
      const declarations = left?.type === "VariableDeclaration" && Array.isArray(left.declarations) ? left.declarations.filter(isAstNode) : [];
      const binding = declarations.length > 0 && isAstNode(declarations[0]?.id) ? declarations[0].id : left;
      const targets = bindingIdentifierNames(binding);
      const sourceNames = referenceNames(isAstNode(current.right) ? current.right : undefined);
      events.push({
        kind: "assignment",
        start: typeof current.start === "number" ? current.start : 0,
        targets,
        sourceNames,
        declaredTypes: new Set(),
        authoritySourceNames: sourceNames,
        authorityTargets: new Set(targets),
        canClear: false,
      });
    } else if (current.type === "AssignmentExpression") {
      const left = isAstNode(current.left) ? current.left : undefined;
      const targets = bindingIdentifierNames(left);
      const rootTarget = rootIdentifier(left);
      if (rootTarget && targets.size === 0) targets.add(rootTarget);
      const right = isAstNode(current.right) ? current.right : undefined;
      const sourceNames = referenceNames(right);
      if (right && ["CallExpression", "OptionalCallExpression"].includes(right.type)) {
        const calledName = calleeName(isAstNode(right.callee) ? right.callee : undefined);
        if (calledName) sourceNames.add(calledName);
      }
      if (targets.size > 0) {
        const authorityTargets = new Set(targets);
        if (left && ["MemberExpression", "OptionalMemberExpression"].includes(left.type)) {
          const memberName = calleeName(left);
          if (memberName) {
            authorityTargets.clear();
            authorityTargets.add(memberName);
          }
        }
        events.push({
          kind: "assignment",
          start: typeof current.start === "number" ? current.start : 0,
          targets,
          sourceNames,
          declaredTypes: new Set(),
          authoritySourceNames: sourceNames,
          authorityTargets,
          canClear: Boolean(
            left &&
            ["ArrayPattern", "Identifier", "ObjectPattern"].includes(left.type) &&
            !scope.conditionalNodes.has(current) &&
            !["&&=", "??=", "||="].includes(String(current.operator ?? "")),
          ),
        });
      }
    } else if (current.type === "TSTypeAliasDeclaration") {
      const name = isAstNode(current.id) && typeof current.id.name === "string" ? current.id.name : "";
      if (name) typeAliases.push({ name, references: identifierNames(isAstNode(current.typeAnnotation) ? current.typeAnnotation : undefined) });
    } else if (current.type === "ImportSpecifier") {
      const local = isAstNode(current.local) && typeof current.local.name === "string" ? current.local.name : "";
      const imported = isAstNode(current.imported) && typeof current.imported.name === "string" ? current.imported.name : "";
      if (local) localBindings.add(local);
      if (local && inheritedTaint.has(local)) importedTaintedBindings.add(local);
      if (local && (isAuthorityOperation(imported) || inheritedAuthorityAliases.has(local))) importedAuthorityAliases.add(local);
      if (local && cloudPublicationName.test(imported)) importedCloudTypes.add(local);
      if (local && inheritedCallableReturnTypes.has(imported)) callableReturnTypes.set(local, inheritedCallableReturnTypes.get(imported)!);
      if (local && inheritedCallableReturnSources.has(imported)) callableReturnSources.set(local, inheritedCallableReturnSources.get(imported)!);
    } else if (current.type === "TSInterfaceDeclaration") {
      const name = isAstNode(current.id) && typeof current.id.name === "string" ? current.id.name : "";
      const references = new Set<string>();
      if (Array.isArray(current.extends)) {
        for (const extension of current.extends.filter(isAstNode)) {
          for (const reference of identifierNames(extension)) references.add(reference);
        }
      }
      if (name) typeAliases.push({ name, references });
    } else if (["CallExpression", "NewExpression", "OptionalCallExpression"].includes(current.type)) {
      events.push({ kind: "call", start: typeof current.start === "number" ? current.start : 0, call: current });
    }
  }

  for (const binding of localBindings) {
    tainted.delete(binding);
    authorityAliases.delete(binding);
  }
  for (const alias of importedAuthorityAliases) authorityAliases.add(alias);
  for (const binding of importedTaintedBindings) tainted.add(binding);
  for (const nestedFunction of scope.nestedFunctions) {
    if (!["FunctionDeclaration", "TSDeclareFunction"].includes(nestedFunction.type)) continue;
    const name = isAstNode(nestedFunction.id) && typeof nestedFunction.id.name === "string" ? nestedFunction.id.name : "";
    if (name) {
      localBindings.add(name);
      callbackDefinitions.set(name, nestedFunction);
      callableReturnTypes.set(name, typeNames(isAstNode(nestedFunction.returnType) ? nestedFunction.returnType : undefined));
      callableReturnSources.set(name, functionReturnSourceNames(nestedFunction));
      const parameters = Array.isArray(nestedFunction.params) ? nestedFunction.params.filter(isAstNode) : [];
      const parameterIndexes = new Map<string, number>();
      for (const [index, parameter] of parameters.entries()) {
        for (const parameterName of bindingIdentifierNames(parameter)) parameterIndexes.set(parameterName, index);
      }
      const mappings = new Map<number, Set<number>>();
      walk(nestedFunction, (current) => {
        if (current.type !== "AssignmentExpression") return;
        const targetRoot = rootIdentifier(isAstNode(current.left) ? current.left : undefined);
        const targetIndex = targetRoot ? parameterIndexes.get(targetRoot) : undefined;
        if (targetIndex === undefined) return;
        const sourceIndexes = mappings.get(targetIndex) ?? new Set<number>();
        for (const sourceName of referenceNames(isAstNode(current.right) ? current.right : undefined)) {
          const sourceIndex = parameterIndexes.get(sourceName);
          if (sourceIndex !== undefined) sourceIndexes.add(sourceIndex);
        }
        if (sourceIndexes.size > 0) mappings.set(targetIndex, sourceIndexes);
      });
      if (mappings.size > 0) mutationParameterMappings.set(name, mappings);
    }
  }
  for (const current of scope.nodes) {
    if (!["ClassDeclaration", "ClassExpression"].includes(current.type)) continue;
    const className = isAstNode(current.id) && typeof current.id.name === "string" ? current.id.name : "";
    const fieldInstanceTypes = classFieldInstanceTypes(current);
    const classBody = isAstNode(current.body) && Array.isArray(current.body.body) ? current.body.body.filter(isAstNode) : [];
    for (const method of classBody) {
      if (!functionTypes.has(method.type)) continue;
      const methodName = calleeName(isAstNode(method.key) ? method.key : undefined);
      if (!className || !methodName) continue;
      callableReturnTypes.set(`${className}.${methodName}`, typeNames(isAstNode(method.returnType) ? method.returnType : undefined));
      callableReturnSources.set(`${className}.${methodName}`, functionReturnSourceNames(method, fieldInstanceTypes));
      const authorityCalls = functionCallNames(method);
      if ([...authorityCalls].some((name) => isAuthorityOperation(name) || authorityAliases.has(name))) {
        authorityAliases.add(`${className}.${methodName}`);
        authorityArgumentPositions.set(`${className}.${methodName}`, directAuthorityParameterPositions(method));
      }
    }
  }

  const visibleBindings = new Set(inheritedVisibleBindings);
  visibleBindings.add("this");
  for (const binding of parameterBindings) visibleBindings.add(binding);
  for (const binding of localBindings) visibleBindings.add(binding);

  const cloudTypes = new Set(parameterCloudTypes);
  for (const importedType of importedCloudTypes) cloudTypes.add(importedType);
  let typesChanged = true;
  while (typesChanged) {
    typesChanged = false;
    for (const alias of typeAliases) {
      if (cloudTypes.has(alias.name)) continue;
      if (!cloudPublicationName.test(alias.name) && ![...alias.references].some((name) => cloudPublicationName.test(name) || cloudTypes.has(name))) continue;
      cloudTypes.add(alias.name);
      typesChanged = true;
    }
  }
  for (const nestedScope of scope.nestedLexicalScopes) {
    events.push({ kind: "scope", start: typeof nestedScope.start === "number" ? nestedScope.start : 0, scope: nestedScope });
  }
  events.sort((left, right) => left.start - right.start);
  const invokedFunctions = new Set<AstNode>();

  for (const event of events) {
    if (event.kind === "scope") {
      const nestedTaint = new Set<string>();
      const nestedAliases = new Set<string>();
      const nestedControlTaint = [...(scope.controlSourceNames.get(event.scope) ?? [])].some((name) => cloudPublicationName.test(name) || tainted.has(name));
      if (
        scopeUsesCloudPublicationAsAuthority(
          event.scope,
          content,
          tainted,
          cloudTypes,
          authorityAliases,
          authorityArgumentPositions,
          visibleBindings,
          callableReturnTypes,
          callableReturnSources,
          instanceTypes,
          arrayBindings,
          nestedTaint,
          nestedAliases,
          new Set<string>(),
          callbackDefinitions,
          inheritedControlTaint || nestedControlTaint,
        )
      )
        return true;
      for (const name of nestedTaint) tainted.add(name);
      for (const name of nestedAliases) authorityAliases.add(name);
      continue;
    }
    if (event.kind === "assignment") {
      const hasCloudSource = [...event.sourceNames].some(
        (name) =>
          cloudPublicationName.test(name) ||
          tainted.has(name) ||
          callableReturnsCloud(name, tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes),
      );
      const hasCloudType = [...event.declaredTypes].some((name) => cloudPublicationName.test(name) || cloudTypes.has(name));
      const hasAuthoritySource = [...event.authoritySourceNames].some((name) => {
        const unboundName = name.endsWith(".bind") ? name.slice(0, -".bind".length) : name;
        if (isAuthorityOperation(unboundName) || authorityAliases.has(unboundName)) return true;
        const [receiver, ...memberParts] = unboundName.split(".");
        const instanceType = receiver ? instanceTypes.get(receiver) : undefined;
        if (!instanceType || memberParts.length === 0) return false;
        return authorityAliases.has(`${instanceType}.${memberParts.join(".")}`);
      });
      for (const target of event.targets) {
        if (hasCloudSource || hasCloudType) {
          tainted.add(target);
          if ((inheritedVisibleBindings.has(target) && !localBindings.has(target)) || parameterBindings.has(target)) propagatedTaint?.add(target);
        } else if (event.canClear) tainted.delete(target);
      }
      for (const target of event.authorityTargets) {
        if (hasAuthoritySource) {
          authorityAliases.add(target);
          const root = target.split(".")[0] ?? target;
          if (inheritedVisibleBindings.has(root) && !localBindings.has(root)) propagatedAuthorityAliases?.add(target);
        } else if (event.canClear) authorityAliases.delete(target);
      }
      continue;
    }
    const call = event.call;
    const rawCallee = calleeName(isAstNode(call.callee) ? call.callee : undefined);
    const callee = call.type === "NewExpression" ? `${rawCallee}.constructor` : rawCallee;
    const args = Array.isArray(call.arguments) ? call.arguments.filter(isAstNode) : [];
    const callbackReceiver = isAstNode(call.callee) && isAstNode(call.callee.object) ? call.callee.object : undefined;
    const callHasCloudArgument = args.some((argument) =>
      expressionHasCloudTaint(argument, tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes),
    );
    if (callHasCloudArgument) {
      for (const argument of args) {
        if (!functionTypes.has(argument.type)) continue;
        const callbackParameterTaint = new Set<string>();
        const callbackParameters = Array.isArray(argument.params) ? argument.params.filter(isAstNode) : [];
        for (const parameter of callbackParameters) {
          for (const name of bindingIdentifierNames(parameter)) callbackParameterTaint.add(name);
        }
        if (
          scopeUsesCloudPublicationAsAuthority(
            argument,
            content,
            tainted,
            cloudTypes,
            authorityAliases,
            authorityArgumentPositions,
            visibleBindings,
            callableReturnTypes,
            callableReturnSources,
            instanceTypes,
            arrayBindings,
            undefined,
            undefined,
            callbackParameterTaint,
          )
        )
          return true;
      }
    }
    const receiverRoot = rootIdentifier(callbackReceiver);
    const terminalCallee = callee.split(".").at(-1) ?? "";
    const taintContainerRoot = (root: string): void => {
      const pending = [root];
      const visited = new Set<string>();
      while (pending.length > 0) {
        const current = pending.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        tainted.add(current);
        for (const alias of containerAliases.get(current) ?? []) pending.push(alias);
      }
    };
    for (const [targetIndex, sourceIndexes] of mutationParameterMappings.get(callee) ?? []) {
      if (
        ![...sourceIndexes].some((sourceIndex) =>
          expressionHasCloudTaint(args[sourceIndex], tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes),
        )
      )
        continue;
      const destinationRoot = rootIdentifier(args[targetIndex]);
      if (destinationRoot) taintContainerRoot(destinationRoot);
    }
    const localHelper = scope.nestedFunctions.find(
      (candidate) =>
        ["FunctionDeclaration", "TSDeclareFunction"].includes(candidate.type) && calleeName(isAstNode(candidate.id) ? candidate.id : undefined) === callee,
    );
    if (localHelper) {
      const helperParameters = Array.isArray(localHelper.params) ? localHelper.params.filter(isAstNode) : [];
      const helperParameterIndexes = new Map<string, number>();
      for (const [index, parameter] of helperParameters.entries()) {
        for (const name of bindingIdentifierNames(parameter)) helperParameterIndexes.set(name, index);
      }
      walk(localHelper, (current) => {
        if (current.type !== "AssignmentExpression") return;
        const targetRoot = rootIdentifier(isAstNode(current.left) ? current.left : undefined);
        const targetIndex = targetRoot ? helperParameterIndexes.get(targetRoot) : undefined;
        if (targetIndex === undefined) return;
        const sourceIsCloud = [...referenceNames(isAstNode(current.right) ? current.right : undefined)].some((name) => {
          const sourceIndex = helperParameterIndexes.get(name);
          return (
            sourceIndex !== undefined &&
            expressionHasCloudTaint(args[sourceIndex], tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes)
          );
        });
        if (!sourceIsCloud) return;
        const destinationRoot = rootIdentifier(args[targetIndex]);
        if (destinationRoot) taintContainerRoot(destinationRoot);
      });
    }
    if (
      callee === "Object.assign" &&
      expressionHasCloudTaint(args[0], tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes) === false &&
      args.slice(1).some((argument) => expressionHasCloudTaint(argument, tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes))
    ) {
      const destinationRoot = rootIdentifier(args[0]);
      if (destinationRoot) taintContainerRoot(destinationRoot);
    }
    if (
      ["Object.defineProperties", "Object.defineProperty", "Reflect.set"].includes(callee) &&
      args
        .slice(callee === "Object.defineProperties" ? 1 : 2)
        .some((argument) => expressionHasCloudTaint(argument, tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes))
    ) {
      const destinationRoot = rootIdentifier(args[0]);
      if (destinationRoot) taintContainerRoot(destinationRoot);
    }
    if (
      receiverRoot &&
      !["Object.defineProperties", "Object.defineProperty", "Reflect.set"].includes(callee) &&
      ["add", "fill", "push", "set", "splice", "unshift"].includes(terminalCallee) &&
      args.some((argument) => expressionHasCloudTaint(argument, tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes))
    )
      taintContainerRoot(receiverRoot);
    const callbackReceiverHasCloudTaint = expressionHasCloudTaint(
      callbackReceiver,
      tainted,
      cloudTypes,
      callableReturnTypes,
      callableReturnSources,
      instanceTypes,
    );
    const callbackSourceHasCloudTaint =
      callbackReceiverHasCloudTaint ||
      (callee === "Array.from" && expressionHasCloudTaint(args[0], tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes));
    const callbackValuePosition = ["reduce", "reduceRight"].includes(callee.split(".").at(-1) ?? "") ? 1 : 0;
    if (isSynchronousCallbackInvoker(call, arrayBindings, callbackSourceHasCloudTaint))
      for (const argument of args) {
        const passedCallbacks: AstNode[] = [];
        if (functionTypes.has(argument.type)) passedCallbacks.push(argument);
        for (const name of identifierNames(argument)) {
          const passedCallback = callbackDefinitions.get(name);
          if (passedCallback) passedCallbacks.push(passedCallback);
        }
        for (const passedCallback of passedCallbacks) {
          const callbackTaint = new Set<string>();
          const callbackAliases = new Set<string>();
          const parameterTaint = new Set<string>();
          if (callbackSourceHasCloudTaint) {
            const callbackParameters = Array.isArray(passedCallback.params) ? passedCallback.params.filter(isAstNode) : [];
            for (const name of bindingIdentifierNames(callbackParameters[callbackValuePosition])) parameterTaint.add(name);
          }
          if (
            scopeUsesCloudPublicationAsAuthority(
              passedCallback,
              content,
              tainted,
              cloudTypes,
              authorityAliases,
              authorityArgumentPositions,
              visibleBindings,
              callableReturnTypes,
              callableReturnSources,
              instanceTypes,
              arrayBindings,
              callbackTaint,
              callbackAliases,
              parameterTaint,
            )
          )
            return true;
          invokedFunctions.add(passedCallback);
          for (const name of callbackTaint) tainted.add(name);
          for (const name of callbackAliases) authorityAliases.add(name);
        }
        if (
          callbackSourceHasCloudTaint &&
          [...referenceNames(argument)].some((name) => {
            if (isAuthorityOperation(name)) return true;
            const [receiver, ...memberParts] = name.split(".");
            const instanceType = receiver ? instanceTypes.get(receiver) : undefined;
            const normalized = instanceType && memberParts.length > 0 ? `${instanceType}.${memberParts.join(".")}` : name;
            if (!authorityAliases.has(name) && !authorityAliases.has(normalized)) return false;
            const positions = authorityArgumentPositions.get(name) ?? authorityArgumentPositions.get(normalized);
            return !positions || positions.has(callbackValuePosition);
          })
        )
          return true;
      }
    const callback = callbackDefinitions.get(callee);
    if (callback) {
      const callbackTaint = new Set<string>();
      const callbackAliases = new Set<string>();
      const parameterTaint = taintedCallbackParameters(callback, args, tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes);
      const callbackParameterList = Array.isArray(callback.params) ? callback.params.filter(isAstNode) : [];
      const callbackParameterIndexes = new Map<string, number>();
      for (const [index, parameter] of callbackParameterList.entries()) {
        for (const name of bindingIdentifierNames(parameter)) callbackParameterIndexes.set(name, index);
      }
      walk(callback, (current) => {
        if (current.type !== "AssignmentExpression") return;
        const targetRoot = rootIdentifier(isAstNode(current.left) ? current.left : undefined);
        const targetIndex = targetRoot ? callbackParameterIndexes.get(targetRoot) : undefined;
        if (targetIndex === undefined) return;
        if (
          !expressionHasCloudTaint(
            isAstNode(current.right) ? current.right : undefined,
            parameterTaint,
            cloudTypes,
            callableReturnTypes,
            callableReturnSources,
            instanceTypes,
          )
        )
          return;
        const argumentRoot = rootIdentifier(args[targetIndex]);
        if (argumentRoot) taintContainerRoot(argumentRoot);
      });
      const callbackBindings = new Map<string, AstNode>();
      for (const [index, parameter] of callbackParameterList.entries()) {
        const argument = args[index];
        if (!argument) continue;
        const passedCallback = functionTypes.has(argument.type)
          ? argument
          : [...identifierNames(argument)].map((name) => callbackDefinitions.get(name)).find((candidate): candidate is AstNode => Boolean(candidate));
        if (!passedCallback) continue;
        for (const name of bindingIdentifierNames(parameter)) callbackBindings.set(name, passedCallback);
      }
      const helperCallNames = functionCallNames(callback);
      const helperReceivesCloud = args.some((argument) =>
        expressionHasCloudTaint(argument, tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes),
      );
      if (helperReceivesCloud) {
        const passedCallbacks = new Set<AstNode>();
        for (const argument of args) {
          if (functionTypes.has(argument.type)) passedCallbacks.add(argument);
          for (const name of identifierNames(argument)) {
            const passedCallback = callbackDefinitions.get(name);
            if (passedCallback) passedCallbacks.add(passedCallback);
          }
        }
        for (const passedCallback of passedCallbacks) {
          const matchingBindings = [...callbackBindings].filter(([, candidate]) => candidate === passedCallback).map(([binding]) => binding);
          if (matchingBindings.length > 0 && !matchingBindings.some((binding) => helperCallNames.has(binding))) continue;
          const passedParameterTaint = new Set<string>();
          const passedParameters = Array.isArray(passedCallback.params) ? passedCallback.params.filter(isAstNode) : [];
          for (const parameter of passedParameters) {
            for (const name of bindingIdentifierNames(parameter)) passedParameterTaint.add(name);
          }
          if (
            scopeUsesCloudPublicationAsAuthority(
              passedCallback,
              content,
              tainted,
              cloudTypes,
              authorityAliases,
              authorityArgumentPositions,
              visibleBindings,
              callableReturnTypes,
              callableReturnSources,
              instanceTypes,
              arrayBindings,
              undefined,
              undefined,
              passedParameterTaint,
            )
          )
            return true;
        }
      }
      if (
        scopeUsesCloudPublicationAsAuthority(
          callback,
          content,
          tainted,
          cloudTypes,
          authorityAliases,
          authorityArgumentPositions,
          visibleBindings,
          callableReturnTypes,
          callableReturnSources,
          instanceTypes,
          arrayBindings,
          callbackTaint,
          callbackAliases,
          parameterTaint,
          callbackBindings,
        )
      )
        return true;
      invokedFunctions.add(callback);
      const callbackParametersAfterRun = Array.isArray(callback.params) ? callback.params.filter(isAstNode) : [];
      for (const [index, parameter] of callbackParametersAfterRun.entries()) {
        if (![...bindingIdentifierNames(parameter)].some((name) => callbackTaint.has(name))) continue;
        const argumentRoot = rootIdentifier(args[index]);
        if (argumentRoot) taintContainerRoot(argumentRoot);
      }
      for (const name of callbackTaint) tainted.add(name);
      for (const name of callbackAliases) authorityAliases.add(name);
      continue;
    }
    const rawCalleeParts = callee.split(".");
    const [rawReceiver, ...rawMemberParts] = rawCalleeParts;
    const rawInstanceType = rawReceiver ? instanceTypes.get(rawReceiver) : undefined;
    const rawInstanceCallee = rawInstanceType && rawMemberParts.length > 0 ? `${rawInstanceType}.${rawMemberParts.join(".")}` : callee;
    const rawCalleeIsAuthority = isAuthorityOperation(callee) || authorityAliases.has(callee) || authorityAliases.has(rawInstanceCallee);
    const calleeParts = [...rawCalleeParts];
    const invocationHelper =
      !rawCalleeIsAuthority && calleeParts.length > 1 && ["apply", "call"].includes(calleeParts.at(-1) ?? "") ? calleeParts.pop() : undefined;
    const invokedCallee = invocationHelper ? calleeParts.join(".") : callee;
    const [receiver, ...memberParts] = invokedCallee.split(".");
    const instanceType = receiver ? instanceTypes.get(receiver) : undefined;
    const instanceCallee = instanceType && memberParts.length > 0 ? `${instanceType}.${memberParts.join(".")}` : invokedCallee;
    if (!isAuthorityOperation(invokedCallee) && !authorityAliases.has(invokedCallee) && !authorityAliases.has(instanceCallee)) continue;
    const authorityPositions = isAuthorityOperation(invokedCallee)
      ? undefined
      : (authorityArgumentPositions.get(invokedCallee) ?? authorityArgumentPositions.get(instanceCallee));
    const invokedArgs = invocationHelper ? args.slice(1) : args;
    const callControlTaint = [...(scope.controlSourceNames.get(call) ?? [])].some((name) => cloudPublicationName.test(name) || tainted.has(name));
    if (inheritedControlTaint || callControlTaint) return true;
    if (tainted.has(invokedCallee) || tainted.has(instanceCallee)) return true;
    const authorityArgs = authorityPositions && !invocationHelper ? invokedArgs.filter((_, index) => authorityPositions.has(index)) : invokedArgs;
    if (authorityArgs.some((argument) => expressionHasCloudTaint(argument, tainted, cloudTypes, callableReturnTypes, callableReturnSources, instanceTypes)))
      return true;
  }
  for (const nestedFunction of scope.nestedFunctions) {
    if (invokedFunctions.has(nestedFunction)) continue;
    if (
      scopeUsesCloudPublicationAsAuthority(
        nestedFunction,
        content,
        tainted,
        cloudTypes,
        authorityAliases,
        authorityArgumentPositions,
        visibleBindings,
        callableReturnTypes,
        callableReturnSources,
        new Map([...instanceTypes, ...(scope.nestedFunctionInstanceTypes.get(nestedFunction) ?? new Map<string, string>())]),
        arrayBindings,
        undefined,
        undefined,
        new Set<string>(),
        callbackDefinitions,
      )
    )
      return true;
  }
  return false;
}

interface ModuleContracts {
  file: string;
  program: AstNode;
  returnTypes: Map<string, Set<string>>;
  returnSources: Map<string, Set<string>>;
  authoritySources: Map<string, Set<string>>;
  authorityParameterPositions: Map<string, Set<number>>;
  authorityCallParameterMappings: Map<string, Map<string, Map<number, Set<number>>>>;
  classBases: Map<string, string>;
  valueTypes: Map<string, Set<string>>;
  valueSources: Map<string, Set<string>>;
  typeReferences: Map<string, Set<string>>;
  instanceTypes: Map<string, string>;
  cloudTypes: Set<string>;
  localExports: Map<string, string>;
  typeExports: Map<string, string>;
  reexports: Map<string, { source: string; imported: string }>;
  namespaceReexports: Map<string, string>;
  exportAll: string[];
}

function moduleSpecifier(node: AstNode): string {
  return isAstNode(node.source) && typeof node.source.value === "string" ? node.source.value : "";
}

function resolveSourceModule(fromFile: string, specifier: string, files: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const raw = path.resolve(path.dirname(fromFile), specifier);
  const withoutJsExtension = raw.replace(/\.(?:cjs|js|jsx|mjs)$/u, "");
  const candidates = [raw, ...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].map((extension) => `${withoutJsExtension}${extension}`)];
  for (const extension of [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]) candidates.push(path.join(raw, `index${extension}`));
  return candidates.find((candidate) => files.has(candidate));
}

/**
 * Babel 8 reads `<T>(value: T) => value` as an unclosed JSX element whenever the jsx plugin is on,
 * so the plugin set has to follow the file extension the way tsc does: `.ts`, `.mts`, and `.cts`
 * never carry JSX; `.tsx` and every JavaScript extension may.
 */
function parserPluginsFor(file: string): Array<"typescript" | "jsx"> {
  return /\.(?:ts|mts|cts)$/u.test(file) ? ["typescript"] : ["typescript", "jsx"];
}

function collectModuleContracts(file: string, content: string): ModuleContracts {
  const parsed = parse(content, { sourceType: "unambiguous", plugins: parserPluginsFor(file), allowUndeclaredExports: true }) as unknown as AstNode;
  const program = isAstNode(parsed.program) ? parsed.program : parsed;
  const body = Array.isArray(program.body) ? program.body.filter(isAstNode) : [];
  const contracts: ModuleContracts = {
    file,
    program,
    returnTypes: new Map(),
    returnSources: new Map(),
    authoritySources: new Map(),
    authorityParameterPositions: new Map(),
    authorityCallParameterMappings: new Map(),
    classBases: new Map(),
    valueTypes: new Map(),
    valueSources: new Map(),
    typeReferences: new Map(),
    instanceTypes: new Map(),
    cloudTypes: new Set(),
    localExports: new Map(),
    typeExports: new Map(),
    reexports: new Map(),
    namespaceReexports: new Map(),
    exportAll: [],
  };
  const recordDeclaration = (declaration: AstNode, exported = false, defaultExport = false): void => {
    if (defaultExport && functionTypes.has(declaration.type) && declaration.type !== "FunctionDeclaration") {
      contracts.returnTypes.set("default", typeNames(isAstNode(declaration.returnType) ? declaration.returnType : undefined));
      contracts.returnSources.set("default", functionReturnSourceNames(declaration));
      contracts.authoritySources.set("default", functionCallNames(declaration));
      contracts.authorityParameterPositions.set("default", directAuthorityParameterPositions(declaration));
      contracts.authorityCallParameterMappings.set("default", callParameterMappings(declaration));
      contracts.localExports.set("default", "default");
    } else if (["FunctionDeclaration", "TSDeclareFunction"].includes(declaration.type)) {
      const name = isAstNode(declaration.id) && typeof declaration.id.name === "string" ? declaration.id.name : defaultExport ? "default" : "";
      if (!name) return;
      contracts.returnTypes.set(name, typeNames(isAstNode(declaration.returnType) ? declaration.returnType : undefined));
      contracts.returnSources.set(name, functionReturnSourceNames(declaration));
      contracts.authoritySources.set(name, functionCallNames(declaration));
      contracts.authorityParameterPositions.set(name, directAuthorityParameterPositions(declaration));
      contracts.authorityCallParameterMappings.set(name, callParameterMappings(declaration));
      if (exported || defaultExport) contracts.localExports.set(defaultExport ? "default" : name, name);
    } else if (declaration.type === "VariableDeclaration" && Array.isArray(declaration.declarations)) {
      for (const variable of declaration.declarations.filter(isAstNode)) {
        const init = isAstNode(variable.init) ? variable.init : undefined;
        const name = isAstNode(variable.id) && typeof variable.id.name === "string" ? variable.id.name : "";
        if (!name || !init) continue;
        const variableId = isAstNode(variable.id) ? variable.id : undefined;
        contracts.valueTypes.set(name, typeNames(isAstNode(variableId?.typeAnnotation) ? variableId.typeAnnotation : undefined));
        const valueSources = identifierNames(init);
        if (["CallExpression", "OptionalCallExpression"].includes(init.type)) {
          const called = calleeName(isAstNode(init.callee) ? init.callee : undefined);
          if (called) valueSources.add(called);
        }
        contracts.valueSources.set(name, valueSources);
        contracts.authoritySources.set(name, identifierNames(init));
        if (exported) contracts.localExports.set(name, name);
        if (init.type === "NewExpression") {
          const instanceType = calleeName(isAstNode(init.callee) ? init.callee : undefined);
          if (instanceType) contracts.instanceTypes.set(name, instanceType);
        }
        if (init.type === "ClassExpression") {
          const base = calleeName(isAstNode(init.superClass) ? init.superClass : undefined);
          if (base) contracts.classBases.set(name, base);
          const fieldInstanceTypes = classFieldInstanceTypes(init);
          const methods = isAstNode(init.body) && Array.isArray(init.body.body) ? init.body.body.filter(isAstNode) : [];
          for (const method of methods) {
            const methodName = calleeName(isAstNode(method.key) ? method.key : undefined);
            if (!methodName || !functionTypes.has(method.type)) continue;
            contracts.returnTypes.set(`${name}.${methodName}`, typeNames(isAstNode(method.returnType) ? method.returnType : undefined));
            contracts.returnSources.set(`${name}.${methodName}`, functionReturnSourceNames(method, fieldInstanceTypes));
            contracts.authoritySources.set(`${name}.${methodName}`, functionCallNames(method));
            contracts.authorityParameterPositions.set(`${name}.${methodName}`, directAuthorityParameterPositions(method));
            contracts.authorityCallParameterMappings.set(`${name}.${methodName}`, callParameterMappings(method));
          }
          if (exported) contracts.localExports.set(name, name);
          continue;
        }
        if (init.type === "ObjectExpression") {
          for (const { name: methodName, callable } of objectCallableEntries(init)) {
            contracts.returnTypes.set(`${name}.${methodName}`, typeNames(isAstNode(callable.returnType) ? callable.returnType : undefined));
            contracts.returnSources.set(`${name}.${methodName}`, functionReturnSourceNames(callable));
            contracts.authoritySources.set(`${name}.${methodName}`, functionCallNames(callable));
            contracts.authorityParameterPositions.set(`${name}.${methodName}`, directAuthorityParameterPositions(callable));
            contracts.authorityCallParameterMappings.set(`${name}.${methodName}`, callParameterMappings(callable));
          }
          if (exported) contracts.localExports.set(name, name);
          continue;
        }
        if (!functionTypes.has(init.type)) continue;
        contracts.returnTypes.set(name, typeNames(isAstNode(init.returnType) ? init.returnType : undefined));
        contracts.returnSources.set(name, functionReturnSourceNames(init));
        contracts.authorityParameterPositions.set(name, directAuthorityParameterPositions(init));
        contracts.authorityCallParameterMappings.set(name, callParameterMappings(init));
        if (exported) contracts.localExports.set(name, name);
      }
    } else if (["ClassDeclaration", "ClassExpression"].includes(declaration.type)) {
      const className = isAstNode(declaration.id) && typeof declaration.id.name === "string" ? declaration.id.name : defaultExport ? "default" : "";
      const base = calleeName(isAstNode(declaration.superClass) ? declaration.superClass : undefined);
      if (className && base) contracts.classBases.set(className, base);
      const fieldInstanceTypes = classFieldInstanceTypes(declaration);
      const methods = isAstNode(declaration.body) && Array.isArray(declaration.body.body) ? declaration.body.body.filter(isAstNode) : [];
      for (const method of methods) {
        const methodName = calleeName(isAstNode(method.key) ? method.key : undefined);
        if (!className || !methodName || !functionTypes.has(method.type)) continue;
        contracts.returnTypes.set(`${className}.${methodName}`, typeNames(isAstNode(method.returnType) ? method.returnType : undefined));
        contracts.returnSources.set(`${className}.${methodName}`, functionReturnSourceNames(method, fieldInstanceTypes));
        contracts.authoritySources.set(`${className}.${methodName}`, functionCallNames(method));
        contracts.authorityParameterPositions.set(`${className}.${methodName}`, directAuthorityParameterPositions(method));
        contracts.authorityCallParameterMappings.set(`${className}.${methodName}`, callParameterMappings(method));
      }
      if ((exported || defaultExport) && className) contracts.localExports.set(defaultExport ? "default" : className, className);
    }
  };
  for (const statement of body) {
    if (["FunctionDeclaration", "VariableDeclaration", "ClassDeclaration"].includes(statement.type)) recordDeclaration(statement);
    if (statement.type === "TSTypeAliasDeclaration" || statement.type === "TSInterfaceDeclaration") {
      const name = isAstNode(statement.id) && typeof statement.id.name === "string" ? statement.id.name : "";
      const source = content.slice(typeof statement.start === "number" ? statement.start : 0, typeof statement.end === "number" ? statement.end : 0);
      if (name && cloudPublicationName.test(source)) contracts.cloudTypes.add(name);
      if (name) contracts.typeReferences.set(name, identifierNames(statement));
    }
    if (statement.type === "ImportDeclaration") {
      for (const specifier of Array.isArray(statement.specifiers) ? statement.specifiers.filter(isAstNode) : []) {
        if (specifier.type !== "ImportSpecifier") continue;
        const imported = calleeName(isAstNode(specifier.imported) ? specifier.imported : undefined);
        const local = isAstNode(specifier.local) && typeof specifier.local.name === "string" ? specifier.local.name : "";
        if (local && cloudPublicationName.test(imported)) contracts.cloudTypes.add(local);
      }
    }
    if (statement.type === "ExportNamedDeclaration") {
      if (isAstNode(statement.declaration)) {
        recordDeclaration(statement.declaration, true);
        if (["TSTypeAliasDeclaration", "TSInterfaceDeclaration"].includes(statement.declaration.type)) {
          const typeName = isAstNode(statement.declaration.id) && typeof statement.declaration.id.name === "string" ? statement.declaration.id.name : "";
          const sourceText = content.slice(
            typeof statement.declaration.start === "number" ? statement.declaration.start : 0,
            typeof statement.declaration.end === "number" ? statement.declaration.end : 0,
          );
          if (typeName) {
            contracts.typeExports.set(typeName, typeName);
            contracts.typeReferences.set(typeName, identifierNames(statement.declaration));
            if (cloudPublicationName.test(sourceText)) contracts.cloudTypes.add(typeName);
          }
        }
      }
      const source = moduleSpecifier(statement);
      for (const specifier of Array.isArray(statement.specifiers) ? statement.specifiers.filter(isAstNode) : []) {
        const local = calleeName(isAstNode(specifier.local) ? specifier.local : undefined);
        const exported = calleeName(isAstNode(specifier.exported) ? specifier.exported : undefined);
        if (!exported) continue;
        if (source && specifier.type === "ExportNamespaceSpecifier") contracts.namespaceReexports.set(exported, source);
        else if (source) contracts.reexports.set(exported, { source, imported: local || exported });
        else if (local && (specifier.exportKind === "type" || statement.exportKind === "type" || contracts.cloudTypes.has(local)))
          contracts.typeExports.set(exported, local);
        else if (local) contracts.localExports.set(exported, local);
      }
    } else if (statement.type === "ExportDefaultDeclaration" && isAstNode(statement.declaration)) {
      const declaration = statement.declaration;
      if (["TSTypeAliasDeclaration", "TSInterfaceDeclaration"].includes(declaration.type)) {
        const name = isAstNode(declaration.id) && typeof declaration.id.name === "string" ? declaration.id.name : "default";
        contracts.typeExports.set("default", name);
        contracts.typeReferences.set(name, identifierNames(declaration));
        const sourceText = content.slice(
          typeof declaration.start === "number" ? declaration.start : 0,
          typeof declaration.end === "number" ? declaration.end : 0,
        );
        if (cloudPublicationName.test(sourceText)) contracts.cloudTypes.add(name);
      } else if (declaration.type === "Identifier" && typeof declaration.name === "string") contracts.localExports.set("default", declaration.name);
      else recordDeclaration(declaration, false, true);
    } else if (statement.type === "ExportAllDeclaration") {
      const source = moduleSpecifier(statement);
      if (source) contracts.exportAll.push(source);
    }
  }
  let cloudTypesChanged = true;
  while (cloudTypesChanged) {
    cloudTypesChanged = false;
    for (const [name, references] of contracts.typeReferences) {
      if (contracts.cloudTypes.has(name) || ![...references].some((reference) => contracts.cloudTypes.has(reference) || cloudPublicationName.test(reference)))
        continue;
      contracts.cloudTypes.add(name);
      cloudTypesChanged = true;
    }
  }
  return contracts;
}

interface ImportedContracts {
  returnTypes: Map<string, Set<string>>;
  cloudTypes: Set<string>;
  authorityAliases: Set<string>;
  authorityArgumentPositions: Map<string, Set<number>>;
  taintedValues: Set<string>;
}

type SummaryValue = boolean | ReadonlySet<string | number> | undefined;
interface ExportSummary {
  value: SummaryValue;
  evaluate: () => SummaryValue;
  dependents: Set<ExportSummary>;
}
/** Monotone summaries over an immutable module graph. A cycle starts without facts;
 * newly discovered return, type, value, authority and argument facts requeue dependents.
 * This avoids both exponential import diamonds and cached path-truncated false results.
 */
function createExportSummaryResolver() {
  const summaries = new Map<string, ExportSummary>();
  const pending = new Set<ExportSummary>();
  let evaluating: ExportSummary | undefined;
  let draining = false;
  return <T extends SummaryValue>(key: string, initial: T, evaluate: () => T): T => {
    let summary = summaries.get(key);
    if (!summary) {
      summary = { value: initial, evaluate, dependents: new Set() };
      summaries.set(key, summary);
      pending.add(summary);
    }
    if (evaluating) summary.dependents.add(evaluating);
    if (!draining) {
      draining = true;
      try {
        while (pending.size) {
          const current = pending.values().next().value!;
          pending.delete(current);
          evaluating = current;
          const next = current.evaluate();
          let changed = false;
          if (typeof next === "boolean") {
            if (next && !current.value) {
              current.value = true;
              changed = true;
            }
          } else if (next !== undefined) {
            const union = new Set(typeof current.value === "object" ? current.value : []);
            for (const fact of next) union.add(fact);
            if (current.value === undefined || typeof current.value !== "object" || union.size !== current.value.size) {
              current.value = union;
              changed = true;
            }
          }
          if (changed) for (const dependent of current.dependents) pending.add(dependent);
        }
      } finally {
        evaluating = undefined;
        draining = false;
      }
    }
    return (typeof summary.value === "object" ? new Set(summary.value) : summary.value) as T;
  };
}
const exportSummaryResolvers = new WeakMap<Map<string, ModuleContracts>, ReturnType<typeof createExportSummaryResolver>>();

function importedContractsForFile(file: string, modules: Map<string, ModuleContracts>): ImportedContracts {
  const result: ImportedContracts = {
    returnTypes: new Map(),
    cloudTypes: new Set(),
    authorityAliases: new Set(),
    authorityArgumentPositions: new Map(),
    taintedValues: new Set(),
  };
  const files = new Set(modules.keys());
  let summarizeExport = exportSummaryResolvers.get(modules);
  if (!summarizeExport) {
    summarizeExport = createExportSummaryResolver();
    exportSummaryResolvers.set(modules, summarizeExport);
  }
  const resolveExport = (moduleFile: string, exportName: string, _visited = new Set<string>()): boolean =>
    summarizeExport!(JSON.stringify([moduleFile, "return", exportName]), false as boolean, () => resolveExportDefinition(moduleFile, exportName));
  const resolveExportDefinition = (moduleFile: string, exportName: string): boolean => {
    const visited = new Set<string>();
    const key = `${moduleFile}#${exportName}`;
    if (visited.has(key)) return false;
    visited.add(key);
    const module = modules.get(moduleFile);
    if (!module) return false;
    const [namespace, ...memberParts] = exportName.split(".");
    const namespaceSource = namespace ? module.namespaceReexports.get(namespace) : undefined;
    if (namespaceSource && memberParts.length > 0) {
      const target = resolveSourceModule(moduleFile, namespaceSource, files);
      return Boolean(target && resolveExport(target, memberParts.join("."), new Set(visited)));
    }
    const [exportRoot, ...exportMemberParts] = exportName.split(".");
    const rootLocal = exportRoot ? module.localExports.get(exportRoot) : undefined;
    const local = rootLocal && exportMemberParts.length > 0 ? `${rootLocal}.${exportMemberParts.join(".")}` : rootLocal;
    if (local) {
      const resolvedTypes = new Map(module.returnTypes);
      const resolvedCloudTypes = new Set(module.cloudTypes);
      const statements = Array.isArray(module.program.body) ? module.program.body.filter(isAstNode) : [];
      for (const statement of statements) {
        if (statement.type !== "ImportDeclaration") continue;
        const target = resolveSourceModule(moduleFile, moduleSpecifier(statement), files);
        if (!target) continue;
        for (const specifier of Array.isArray(statement.specifiers) ? statement.specifiers.filter(isAstNode) : []) {
          const importedLocal = isAstNode(specifier.local) && typeof specifier.local.name === "string" ? specifier.local.name : "";
          if (!importedLocal) continue;
          if (specifier.type === "ImportNamespaceSpecifier") {
            for (const importedName of exportNames(target, new Set())) {
              if (resolveExport(target, importedName, new Set(visited))) resolvedTypes.set(`${importedLocal}.${importedName}`, new Set(["CloudPublication"]));
            }
          } else {
            const importedName =
              specifier.type === "ImportDefaultSpecifier" ? "default" : calleeName(isAstNode(specifier.imported) ? specifier.imported : undefined);
            if (importedName && resolveCloudType(target, importedName, new Set(visited))) resolvedCloudTypes.add(importedLocal);
            if (importedName && resolveExport(target, importedName, new Set(visited))) resolvedTypes.set(importedLocal, new Set(["CloudPublication"]));
          }
        }
      }
      if (callableReturnsCloud(local, new Set(), resolvedCloudTypes, resolvedTypes, module.returnSources, module.instanceTypes)) return true;
    }
    const reexport = module.reexports.get(exportName);
    if (reexport) {
      const target = resolveSourceModule(moduleFile, reexport.source, files);
      if (target && resolveExport(target, reexport.imported, new Set(visited))) return true;
    }
    for (const source of module.exportAll) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (target && resolveExport(target, exportName, new Set(visited))) return true;
    }
    return false;
  };
  const exportNames = (moduleFile: string, visited: Set<string>): Set<string> => {
    if (visited.has(moduleFile)) return new Set();
    visited.add(moduleFile);
    const module = modules.get(moduleFile);
    if (!module) return new Set();
    const names = new Set([...module.localExports.keys(), ...module.reexports.keys()]);
    for (const [namespace, source] of module.namespaceReexports) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (!target) continue;
      for (const name of exportNames(target, new Set(visited))) names.add(`${namespace}.${name}`);
    }
    for (const source of module.exportAll) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (!target) continue;
      for (const name of exportNames(target, new Set(visited))) names.add(name);
    }
    return names;
  };
  const resolveCloudType = (moduleFile: string, exportName: string, _visited = new Set<string>()): boolean =>
    summarizeExport!(JSON.stringify([moduleFile, "type", exportName]), false as boolean, () => resolveCloudTypeDefinition(moduleFile, exportName));
  const resolveCloudTypeDefinition = (moduleFile: string, exportName: string): boolean => {
    const visited = new Set<string>();
    const key = JSON.stringify([moduleFile, "type", exportName]);
    if (visited.has(key)) return false;
    visited.add(key);
    const module = modules.get(moduleFile);
    if (!module) return false;
    const [namespace, ...memberParts] = exportName.split(".");
    const namespaceSource = namespace ? module.namespaceReexports.get(namespace) : undefined;
    if (namespaceSource && memberParts.length > 0) {
      const target = resolveSourceModule(moduleFile, namespaceSource, files);
      return Boolean(target && resolveCloudType(target, memberParts.join("."), new Set(visited)));
    }
    const local = module.typeExports.get(exportName);
    if (local && module.cloudTypes.has(local)) return true;
    const reexport = module.reexports.get(exportName);
    if (reexport) {
      const target = resolveSourceModule(moduleFile, reexport.source, files);
      if (target && resolveCloudType(target, reexport.imported, new Set(visited))) return true;
    }
    for (const source of module.exportAll) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (target && resolveCloudType(target, exportName, new Set(visited))) return true;
    }
    return false;
  };
  const exportedTypeNames = (moduleFile: string, visited = new Set<string>()): Set<string> => {
    if (visited.has(moduleFile)) return new Set();
    visited.add(moduleFile);
    const module = modules.get(moduleFile);
    if (!module) return new Set();
    const names = new Set(module.typeExports.keys());
    for (const [namespace, source] of module.namespaceReexports) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (!target) continue;
      for (const name of exportedTypeNames(target, new Set(visited))) names.add(`${namespace}.${name}`);
    }
    for (const [name] of module.reexports) if (resolveCloudType(moduleFile, name)) names.add(name);
    for (const source of module.exportAll) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (!target) continue;
      for (const name of exportedTypeNames(target, new Set(visited))) names.add(name);
    }
    return names;
  };
  const resolveCloudValue = (moduleFile: string, exportName: string, _visited = new Set<string>()): boolean =>
    summarizeExport!(JSON.stringify([moduleFile, "value", exportName]), false as boolean, () => resolveCloudValueDefinition(moduleFile, exportName));
  const resolveCloudValueDefinition = (moduleFile: string, exportName: string): boolean => {
    const visited = new Set<string>();
    const key = JSON.stringify([moduleFile, "value", exportName]);
    if (visited.has(key)) return false;
    visited.add(key);
    const module = modules.get(moduleFile);
    if (!module) return false;
    const [namespace, ...memberParts] = exportName.split(".");
    const namespaceSource = namespace ? module.namespaceReexports.get(namespace) : undefined;
    if (namespaceSource && memberParts.length > 0) {
      const target = resolveSourceModule(moduleFile, namespaceSource, files);
      return Boolean(target && resolveCloudValue(target, memberParts.join("."), new Set(visited)));
    }
    const local = module.localExports.get(exportName);
    if (local && [...(module.valueTypes.get(local) ?? [])].some((type) => cloudPublicationName.test(type) || module.cloudTypes.has(type))) return true;
    const sourceReturnsCloud = (source: string): boolean => {
      if (
        cloudPublicationName.test(source) ||
        callableReturnsCloud(source, new Set(), module.cloudTypes, module.returnTypes, module.returnSources, module.instanceTypes)
      )
        return true;
      const statements = Array.isArray(module.program.body) ? module.program.body.filter(isAstNode) : [];
      for (const statement of statements) {
        if (statement.type !== "ImportDeclaration") continue;
        const target = resolveSourceModule(moduleFile, moduleSpecifier(statement), files);
        if (!target) continue;
        for (const specifier of Array.isArray(statement.specifiers) ? statement.specifiers.filter(isAstNode) : []) {
          const importedLocal = isAstNode(specifier.local) && typeof specifier.local.name === "string" ? specifier.local.name : "";
          if (specifier.type === "ImportNamespaceSpecifier" && source.startsWith(`${importedLocal}.`)) {
            if (resolveExport(target, source.slice(importedLocal.length + 1), new Set(visited))) return true;
          } else if (importedLocal === source) {
            const imported =
              specifier.type === "ImportDefaultSpecifier" ? "default" : calleeName(isAstNode(specifier.imported) ? specifier.imported : undefined);
            if (imported && resolveExport(target, imported, new Set(visited))) return true;
          }
        }
      }
      return false;
    };
    if (local && [...(module.valueSources.get(local) ?? [])].some((source) => sourceReturnsCloud(source))) return true;
    const reexport = module.reexports.get(exportName);
    if (reexport) {
      const target = resolveSourceModule(moduleFile, reexport.source, files);
      if (target && resolveCloudValue(target, reexport.imported, new Set(visited))) return true;
    }
    for (const source of module.exportAll) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (target && resolveCloudValue(target, exportName, new Set(visited))) return true;
    }
    return false;
  };
  const resolveAuthority = (moduleFile: string, exportName: string, _visited = new Set<string>()): boolean =>
    summarizeExport!(JSON.stringify([moduleFile, "authority", exportName]), false as boolean, () => resolveAuthorityDefinition(moduleFile, exportName));
  const resolveAuthorityDefinition = (moduleFile: string, exportName: string): boolean => {
    const visited = new Set<string>();
    const key = JSON.stringify([moduleFile, "authority", exportName]);
    if (visited.has(key)) return false;
    visited.add(key);
    const module = modules.get(moduleFile);
    if (!module) return false;
    const [namespace, ...memberParts] = exportName.split(".");
    const namespaceSource = namespace ? module.namespaceReexports.get(namespace) : undefined;
    if (namespaceSource && memberParts.length > 0) {
      const target = resolveSourceModule(moduleFile, namespaceSource, files);
      return Boolean(target && resolveAuthority(target, memberParts.join("."), new Set(visited)));
    }
    const [exportRoot, ...exportMemberParts] = exportName.split(".");
    const rootLocal = exportRoot ? module.localExports.get(exportRoot) : undefined;
    const local = rootLocal && exportMemberParts.length > 0 ? `${rootLocal}.${exportMemberParts.join(".")}` : rootLocal;
    if (local) {
      const statements = Array.isArray(module.program.body) ? module.program.body.filter(isAstNode) : [];
      const resolveLocal = (localName: string, localVisited = new Set<string>()): boolean => {
        if (!localName || localVisited.has(localName)) return false;
        localVisited.add(localName);
        if (isAuthorityOperation(localName)) return true;
        for (const source of module.authoritySources.get(localName) ?? []) {
          if (isAuthorityOperation(source) || resolveLocal(source, new Set(localVisited))) return true;
        }
        for (const statement of statements) {
          if (statement.type !== "ImportDeclaration") continue;
          const target = resolveSourceModule(moduleFile, moduleSpecifier(statement), files);
          if (!target) continue;
          for (const specifier of Array.isArray(statement.specifiers) ? statement.specifiers.filter(isAstNode) : []) {
            const importedLocal = isAstNode(specifier.local) && typeof specifier.local.name === "string" ? specifier.local.name : "";
            if (specifier.type === "ImportNamespaceSpecifier" && localName.startsWith(`${importedLocal}.`)) {
              if (resolveAuthority(target, localName.slice(importedLocal.length + 1), new Set(visited))) return true;
              continue;
            }
            if (importedLocal !== localName) continue;
            const imported =
              specifier.type === "ImportDefaultSpecifier" ? "default" : calleeName(isAstNode(specifier.imported) ? specifier.imported : undefined);
            if (imported && resolveAuthority(target, imported, new Set(visited))) return true;
          }
        }
        return false;
      };
      if (resolveLocal(local)) return true;
    }
    const reexport = module.reexports.get(exportName);
    if (reexport) {
      const target = resolveSourceModule(moduleFile, reexport.source, files);
      if (target && resolveAuthority(target, reexport.imported, new Set(visited))) return true;
    }
    for (const source of module.exportAll) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (target && resolveAuthority(target, exportName, new Set(visited))) return true;
    }
    return false;
  };
  const resolveAuthorityPositions = (moduleFile: string, exportName: string, _visited = new Set<string>()): Set<number> | undefined =>
    summarizeExport!(JSON.stringify([moduleFile, "positions", exportName]), undefined as Set<number> | undefined, () =>
      resolveAuthorityPositionsDefinition(moduleFile, exportName),
    );
  const resolveAuthorityPositionsDefinition = (moduleFile: string, exportName: string): Set<number> | undefined => {
    const visited = new Set<string>();
    const key = `${moduleFile}#authority-positions#${exportName}`;
    if (visited.has(key)) return undefined;
    visited.add(key);
    const module = modules.get(moduleFile);
    if (!module) return undefined;
    const [namespace, ...memberParts] = exportName.split(".");
    const namespaceSource = namespace ? module.namespaceReexports.get(namespace) : undefined;
    if (namespaceSource && memberParts.length > 0) {
      const target = resolveSourceModule(moduleFile, namespaceSource, files);
      return target ? resolveAuthorityPositions(target, memberParts.join("."), new Set(visited)) : undefined;
    }
    const [exportRoot, ...exportMemberParts] = exportName.split(".");
    const rootLocal = exportRoot ? module.localExports.get(exportRoot) : undefined;
    const local = rootLocal && exportMemberParts.length > 0 ? `${rootLocal}.${exportMemberParts.join(".")}` : rootLocal;
    if (local && !isAuthorityOperation(local)) {
      const statements = Array.isArray(module.program.body) ? module.program.body.filter(isAstNode) : [];
      const resolveImportedPositions = (localName: string): Set<number> | undefined => {
        for (const statement of statements) {
          if (statement.type !== "ImportDeclaration") continue;
          const target = resolveSourceModule(moduleFile, moduleSpecifier(statement), files);
          if (!target) continue;
          for (const specifier of Array.isArray(statement.specifiers) ? statement.specifiers.filter(isAstNode) : []) {
            const importedLocal = isAstNode(specifier.local) && typeof specifier.local.name === "string" ? specifier.local.name : "";
            if (specifier.type === "ImportNamespaceSpecifier" && localName.startsWith(`${importedLocal}.`)) {
              return resolveAuthorityPositions(target, localName.slice(importedLocal.length + 1), new Set(visited));
            }
            if (importedLocal !== localName) continue;
            const imported =
              specifier.type === "ImportDefaultSpecifier" ? "default" : calleeName(isAstNode(specifier.imported) ? specifier.imported : undefined);
            if (imported) return resolveAuthorityPositions(target, imported, new Set(visited));
          }
        }
        return undefined;
      };
      const resolveLocalPositions = (localName: string, localVisited = new Set<string>()): Set<number> | undefined => {
        if (!localName || localVisited.has(localName)) return undefined;
        localVisited.add(localName);
        const sources = module.authoritySources.get(localName);
        if (!sources) return resolveImportedPositions(localName);
        const positions = new Set(module.authorityParameterPositions.get(localName) ?? []);
        const callMappings = module.authorityCallParameterMappings.get(localName) ?? new Map<string, Map<number, Set<number>>>();
        let isAuthority = positions.size > 0;
        for (const source of sources) {
          const mapping = callMappings.get(source);
          if (!mapping) continue;
          let sourcePositions: Set<number> | undefined;
          if (isAuthorityOperation(source)) {
            isAuthority = true;
            sourcePositions = new Set(mapping.keys());
          } else {
            sourcePositions = module.authoritySources.has(source) ? resolveLocalPositions(source, new Set(localVisited)) : resolveImportedPositions(source);
            if (sourcePositions !== undefined) isAuthority = true;
          }
          if (!sourcePositions) continue;
          for (const sourcePosition of sourcePositions) {
            for (const parameterPosition of mapping.get(sourcePosition) ?? []) positions.add(parameterPosition);
          }
        }
        return isAuthority ? positions : undefined;
      };
      const positions = resolveLocalPositions(local);
      if (positions !== undefined) return positions;
    }
    const reexport = module.reexports.get(exportName);
    if (reexport) {
      const target = resolveSourceModule(moduleFile, reexport.source, files);
      if (target) return resolveAuthorityPositions(target, reexport.imported, new Set(visited));
    }
    for (const source of module.exportAll) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (!target || !resolveAuthority(target, exportName, new Set(visited))) continue;
      return resolveAuthorityPositions(target, exportName, new Set(visited));
    }
    return undefined;
  };
  const exportedAuthorityMethodNames = (moduleFile: string, exportName: string, _visited = new Set<string>()): Set<string> =>
    summarizeExport!(JSON.stringify([moduleFile, "authority-methods", exportName]), new Set<string>(), () =>
      exportedAuthorityMethodNamesDefinition(moduleFile, exportName),
    );
  const exportedAuthorityMethodNamesDefinition = (moduleFile: string, exportName: string): Set<string> => {
    const visited = new Set<string>();
    const key = JSON.stringify([moduleFile, "authority-methods", exportName]);
    if (visited.has(key)) return new Set();
    visited.add(key);
    const module = modules.get(moduleFile);
    if (!module) return new Set();
    const [namespace, ...memberParts] = exportName.split(".");
    const namespaceSource = namespace ? module.namespaceReexports.get(namespace) : undefined;
    if (namespaceSource && memberParts.length > 0) {
      const target = resolveSourceModule(moduleFile, namespaceSource, files);
      return target ? exportedAuthorityMethodNames(target, memberParts.join("."), new Set(visited)) : new Set();
    }
    const local = module.localExports.get(exportName);
    if (local) {
      const methods = new Set<string>();
      for (const name of module.authoritySources.keys()) {
        if (!name.startsWith(`${local}.`)) continue;
        const method = name.slice(local.length + 1);
        if (resolveAuthority(moduleFile, `${exportName}.${method}`, new Set(visited))) methods.add(method);
      }
      const base = module.classBases.get(local);
      if (base) {
        const localMethodIsAuthority = (name: string, seen = new Set<string>()): boolean => {
          if (seen.has(name)) return false;
          seen.add(name);
          return [...(module.authoritySources.get(name) ?? [])].some((source) => isAuthorityOperation(source) || localMethodIsAuthority(source, new Set(seen)));
        };
        for (const name of module.authoritySources.keys()) {
          if (!name.startsWith(`${base}.`) || !localMethodIsAuthority(name)) continue;
          methods.add(name.slice(base.length + 1));
        }
        const statements = Array.isArray(module.program.body) ? module.program.body.filter(isAstNode) : [];
        for (const statement of statements) {
          if (statement.type !== "ImportDeclaration") continue;
          const target = resolveSourceModule(moduleFile, moduleSpecifier(statement), files);
          if (!target) continue;
          for (const specifier of Array.isArray(statement.specifiers) ? statement.specifiers.filter(isAstNode) : []) {
            const importedLocal = isAstNode(specifier.local) && typeof specifier.local.name === "string" ? specifier.local.name : "";
            if (specifier.type === "ImportNamespaceSpecifier" && base.startsWith(`${importedLocal}.`)) {
              for (const method of exportedAuthorityMethodNames(target, base.slice(importedLocal.length + 1), new Set(visited))) methods.add(method);
            } else if (importedLocal === base) {
              const imported =
                specifier.type === "ImportDefaultSpecifier" ? "default" : calleeName(isAstNode(specifier.imported) ? specifier.imported : undefined);
              if (imported) for (const method of exportedAuthorityMethodNames(target, imported, new Set(visited))) methods.add(method);
            }
          }
        }
      }
      return methods;
    }
    const reexport = module.reexports.get(exportName);
    if (reexport) {
      const target = resolveSourceModule(moduleFile, reexport.source, files);
      if (target) return exportedAuthorityMethodNames(target, reexport.imported, visited);
    }
    const methods = new Set<string>();
    for (const source of module.exportAll) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (!target) continue;
      for (const method of exportedAuthorityMethodNames(target, exportName, new Set(visited))) methods.add(method);
    }
    return methods;
  };
  // Namespace member paths are not a finite lattice (cyclic namespace exports can keep
  // prepending names). Retain path-local cycle detection for that path enumeration.
  const exportedMethodNames = (moduleFile: string, exportName: string, visited = new Set<string>()): Set<string> => {
    const key = JSON.stringify([moduleFile, "methods", exportName]);
    if (visited.has(key)) return new Set();
    visited.add(key);
    const module = modules.get(moduleFile);
    if (!module) return new Set();
    const namespaceSource = module.namespaceReexports.get(exportName);
    if (namespaceSource) {
      const target = resolveSourceModule(moduleFile, namespaceSource, files);
      const methods = new Set<string>();
      if (!target) return methods;
      for (const member of exportNames(target, new Set())) {
        for (const method of exportedMethodNames(target, member, new Set(visited))) methods.add(`${member}.${method}`);
      }
      return methods;
    }
    const local = module.localExports.get(exportName);
    if (local) {
      // Plain exported functions cannot acquire class methods through their unrelated imports.
      // Avoid walking every import diamond before discovering that this export has no methods.
      if (!module.classBases.has(local) && ![...module.returnTypes.keys()].some((name) => name.startsWith(`${local}.`))) return new Set();
      const methods = new Set<string>();
      const resolvedCloudTypes = new Set(module.cloudTypes);
      const resolvedTypes = new Map(module.returnTypes);
      const statements = Array.isArray(module.program.body) ? module.program.body.filter(isAstNode) : [];
      for (const statement of statements) {
        if (statement.type !== "ImportDeclaration") continue;
        const target = resolveSourceModule(moduleFile, moduleSpecifier(statement), files);
        if (!target) continue;
        for (const specifier of Array.isArray(statement.specifiers) ? statement.specifiers.filter(isAstNode) : []) {
          const importedLocal = isAstNode(specifier.local) && typeof specifier.local.name === "string" ? specifier.local.name : "";
          if (specifier.type === "ImportNamespaceSpecifier") {
            for (const typeName of exportedTypeNames(target)) {
              if (resolveCloudType(target, typeName, new Set(visited))) resolvedCloudTypes.add(`${importedLocal}.${typeName}`);
            }
            for (const importedName of exportNames(target, new Set())) {
              if (resolveExport(target, importedName, new Set(visited))) resolvedTypes.set(`${importedLocal}.${importedName}`, new Set(["CloudPublication"]));
              for (const method of exportedMethodNames(target, importedName, new Set(visited))) {
                resolvedTypes.set(`${importedLocal}.${importedName}.${method}`, new Set(["CloudPublication"]));
              }
            }
          } else if (specifier.type === "ImportSpecifier") {
            const imported = calleeName(isAstNode(specifier.imported) ? specifier.imported : undefined);
            if (imported && importedLocal && resolveCloudType(target, imported, new Set(visited))) resolvedCloudTypes.add(importedLocal);
            if (imported && importedLocal && resolveExport(target, imported, new Set(visited))) resolvedTypes.set(importedLocal, new Set(["CloudPublication"]));
            if (imported && importedLocal) {
              for (const method of exportedMethodNames(target, imported, new Set(visited))) {
                resolvedTypes.set(`${importedLocal}.${method}`, new Set(["CloudPublication"]));
              }
            }
          } else if (specifier.type === "ImportDefaultSpecifier") {
            if (importedLocal && resolveExport(target, "default", new Set(visited))) resolvedTypes.set(importedLocal, new Set(["CloudPublication"]));
            if (importedLocal) {
              for (const method of exportedMethodNames(target, "default", new Set(visited))) {
                resolvedTypes.set(`${importedLocal}.${method}`, new Set(["CloudPublication"]));
              }
            }
          }
        }
      }
      for (const name of module.returnTypes.keys()) {
        if (!name.startsWith(`${local}.`)) continue;
        if (callableReturnsCloud(name, new Set(), resolvedCloudTypes, resolvedTypes, module.returnSources, module.instanceTypes))
          methods.add(name.slice(local.length + 1));
      }
      const base = module.classBases.get(local);
      if (base) {
        for (const name of module.returnTypes.keys()) {
          if (!name.startsWith(`${base}.`)) continue;
          if (callableReturnsCloud(name, new Set(), resolvedCloudTypes, resolvedTypes, module.returnSources, module.instanceTypes))
            methods.add(name.slice(base.length + 1));
        }
        for (const statement of statements) {
          if (statement.type !== "ImportDeclaration") continue;
          const target = resolveSourceModule(moduleFile, moduleSpecifier(statement), files);
          if (!target) continue;
          for (const specifier of Array.isArray(statement.specifiers) ? statement.specifiers.filter(isAstNode) : []) {
            const importedLocal = isAstNode(specifier.local) && typeof specifier.local.name === "string" ? specifier.local.name : "";
            if (specifier.type === "ImportNamespaceSpecifier" && base.startsWith(`${importedLocal}.`)) {
              for (const method of exportedMethodNames(target, base.slice(importedLocal.length + 1), new Set(visited))) methods.add(method);
            } else if (importedLocal === base) {
              const imported =
                specifier.type === "ImportDefaultSpecifier" ? "default" : calleeName(isAstNode(specifier.imported) ? specifier.imported : undefined);
              if (imported) for (const method of exportedMethodNames(target, imported, new Set(visited))) methods.add(method);
            }
          }
        }
      }
      return methods;
    }
    const reexport = module.reexports.get(exportName);
    if (reexport) {
      const target = resolveSourceModule(moduleFile, reexport.source, files);
      if (target) return exportedMethodNames(target, reexport.imported, visited);
    }
    const methods = new Set<string>();
    for (const source of module.exportAll) {
      const target = resolveSourceModule(moduleFile, source, files);
      if (!target) continue;
      for (const method of exportedMethodNames(target, exportName, new Set(visited))) methods.add(method);
    }
    return methods;
  };
  const module = modules.get(file);
  const recordAuthorityAlias = (alias: string, target: string, exportName: string): void => {
    if (!resolveAuthority(target, exportName)) return;
    result.authorityAliases.add(alias);
    const positions = resolveAuthorityPositions(target, exportName);
    if (positions) result.authorityArgumentPositions.set(alias, positions);
  };
  const statements = module && Array.isArray(module.program.body) ? module.program.body.filter(isAstNode) : [];
  for (const statement of statements) {
    if (statement.type !== "ImportDeclaration") continue;
    const target = resolveSourceModule(file, moduleSpecifier(statement), files);
    if (!target) continue;
    for (const specifier of Array.isArray(statement.specifiers) ? statement.specifiers.filter(isAstNode) : []) {
      const local = isAstNode(specifier.local) && typeof specifier.local.name === "string" ? specifier.local.name : "";
      if (!local) continue;
      if (specifier.type === "ImportNamespaceSpecifier") {
        for (const exportName of exportNames(target, new Set())) {
          if (resolveExport(target, exportName)) result.returnTypes.set(`${local}.${exportName}`, new Set(["CloudPublication"]));
          if (resolveCloudType(target, exportName)) result.cloudTypes.add(`${local}.${exportName}`);
          if (resolveCloudValue(target, exportName)) result.taintedValues.add(`${local}.${exportName}`);
          recordAuthorityAlias(`${local}.${exportName}`, target, exportName);
          for (const method of exportedAuthorityMethodNames(target, exportName)) result.authorityAliases.add(`${local}.${exportName}.${method}`);
          for (const method of exportedAuthorityMethodNames(target, exportName))
            recordAuthorityAlias(`${local}.${exportName}.${method}`, target, `${exportName}.${method}`);
          for (const method of exportedMethodNames(target, exportName))
            result.returnTypes.set(`${local}.${exportName}.${method}`, new Set(["CloudPublication"]));
        }
      } else {
        const imported = specifier.type === "ImportDefaultSpecifier" ? "default" : calleeName(isAstNode(specifier.imported) ? specifier.imported : undefined);
        if (imported && resolveExport(target, imported)) result.returnTypes.set(local, new Set(["CloudPublication"]));
        if (imported && resolveCloudType(target, imported)) result.cloudTypes.add(local);
        if (imported && resolveCloudValue(target, imported)) result.taintedValues.add(local);
        if (imported) recordAuthorityAlias(local, target, imported);
        if (imported) for (const method of exportedAuthorityMethodNames(target, imported)) result.authorityAliases.add(`${local}.${method}`);
        if (imported)
          for (const method of exportedAuthorityMethodNames(target, imported)) recordAuthorityAlias(`${local}.${method}`, target, `${imported}.${method}`);
        if (imported) {
          const targetModule = modules.get(target);
          const namespaceSource = targetModule?.namespaceReexports.get(imported);
          if (namespaceSource) {
            const namespaceTarget = resolveSourceModule(target, namespaceSource, files);
            if (namespaceTarget) {
              for (const member of exportNames(namespaceTarget, new Set())) {
                if (resolveExport(namespaceTarget, member)) result.returnTypes.set(`${local}.${member}`, new Set(["CloudPublication"]));
                if (resolveCloudType(namespaceTarget, member)) result.cloudTypes.add(`${local}.${member}`);
                if (resolveCloudValue(namespaceTarget, member)) result.taintedValues.add(`${local}.${member}`);
                recordAuthorityAlias(`${local}.${member}`, namespaceTarget, member);
                for (const method of exportedAuthorityMethodNames(namespaceTarget, member)) {
                  recordAuthorityAlias(`${local}.${member}.${method}`, namespaceTarget, `${member}.${method}`);
                }
                for (const method of exportedMethodNames(namespaceTarget, member)) {
                  result.returnTypes.set(`${local}.${member}.${method}`, new Set(["CloudPublication"]));
                }
              }
            }
          }
          for (const method of exportedMethodNames(target, imported)) result.returnTypes.set(`${local}.${method}`, new Set(["CloudPublication"]));
        }
      }
    }
  }
  return result;
}

function hasCloudPublicationAuthority(
  file: string,
  content: string,
  inheritedContracts: ImportedContracts = {
    returnTypes: new Map(),
    cloudTypes: new Set(),
    authorityAliases: new Set(),
    authorityArgumentPositions: new Map(),
    taintedValues: new Set(),
  },
  inheritedReturnSources = new Map<string, Set<string>>(),
): boolean {
  const program = parse(content, {
    sourceType: "unambiguous",
    plugins: parserPluginsFor(file),
    allowUndeclaredExports: true,
  });
  return scopeUsesCloudPublicationAsAuthority(
    program as unknown as AstNode,
    content,
    inheritedContracts.taintedValues,
    inheritedContracts.cloudTypes,
    inheritedContracts.authorityAliases,
    inheritedContracts.authorityArgumentPositions,
    new Set(),
    inheritedContracts.returnTypes,
    inheritedReturnSources,
  );
}

// ADR-0002: the shipped package is the repository root. Scan every source layer that shipped
// inside the former skill directory; docs/ and the client entrypoint directories carry no source.
const SHIPPED_SOURCE_LAYERS = ["adapters", "catalog", "checks", "contracts", "entrypoints", "examples", "hosted", "kernel", "knowledge", "surfaces", "tooling"];
const shippedSourceFiles = SHIPPED_SOURCE_LAYERS.flatMap((layer) => sourceFiles(path.join(repoRoot, layer)));
const shippedSources = shippedSourceFiles.map((file) => ({ file, content: readFileSync(file, "utf8") }));
const moduleContracts = new Map(shippedSources.map(({ file, content }) => [file, collectModuleContracts(file, content)]));
for (const { file, content } of shippedSources) {
  const importedContracts = importedContractsForFile(file, moduleContracts);
  if (hasCloudPublicationAuthority(file, content, importedContracts, new Map())) {
    issues.push(
      issue(
        "error",
        "repository_boundary.cloud_publication_authority",
        "Engine source treats a Cloud publication as local authority or completion evidence. Publications are inert guidance and must pass normal local authorization and verification.",
        path.relative(repoRoot, file),
      ),
    );
  }
}

reportAndExit("B2C App Builder repository boundary check", issues);
