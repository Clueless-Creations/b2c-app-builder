import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Ajv2020, type AnySchema, type ErrorObject } from "ajv/dist/2020.js";
import { loadDesignSystem } from "./design-md.js";
import { asArray, asString, isRecord, issue, type Issue } from "./launch-state.js";
import { resolveSkillRoot } from "./skill-root.js";

export interface DesignCliArgs {
  root: string;
  statePath: string;
  schemaPath: string;
  outputPath?: string;
  positionals: string[];
}

export interface LoadedDesignState {
  state?: unknown;
  tokens?: unknown;
  schema?: unknown;
  stateRaw?: string;
  tokensRaw?: string;
  issues: Issue[];
  stateHash?: string;
}

export interface SurfaceSummary {
  label: string;
  count: number;
  ready: number;
  blocked: number;
  notStarted: number;
}

export const skillRoot = resolveSkillRoot(import.meta.url);

export function parseDesignCliArgs(argv: string[]): DesignCliArgs {
  let root = process.cwd();
  let statePath = "studio/seed/business.json";
  let schemaPath = path.join(skillRoot, "surfaces/studio/seed/schema/business.schema.json");
  let outputPath: string | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--root" && value) {
      root = path.resolve(value);
      index += 1;
    } else if (token === "--state" && value) {
      statePath = value;
      index += 1;
    } else if (token === "--schema" && value) {
      schemaPath = value;
      index += 1;
    } else if ((token === "--out" || token === "--output") && value) {
      outputPath = value;
      index += 1;
    } else if (token) {
      positionals.push(token);
    }
  }

  const resolvedRoot = path.resolve(root);
  return {
    root: resolvedRoot,
    statePath: resolveFromRoot(resolvedRoot, statePath),
    schemaPath: resolveFromRoot(resolvedRoot, schemaPath),
    outputPath: outputPath ? resolveFromRoot(resolvedRoot, outputPath) : undefined,
    positionals,
  };
}

export function resolveFromRoot(root: string, targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(root, targetPath);
}

export function readJsonFile(filePath: string): { value?: unknown; raw?: string; issue?: Issue } {
  if (!existsSync(filePath)) {
    return { issue: issue("error", "design_state.file_missing", `Missing JSON file: ${filePath}`, filePath) };
  }

  const raw = readFileSync(filePath, "utf8");
  try {
    return { value: JSON.parse(raw), raw };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    return { raw, issue: issue("error", "design_state.invalid_json", `Invalid JSON: ${messageText}`, filePath) };
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function loadDesignState(args: DesignCliArgs): LoadedDesignState {
  const issues: Issue[] = [];
  const stateResult = readJsonFile(args.statePath);
  const schemaResult = readJsonFile(args.schemaPath);
  const design = loadDesignSystem(args.root);

  for (const result of [stateResult, schemaResult]) {
    if (result.issue) {
      issues.push(result.issue);
    }
  }
  issues.push(...design.issues);

  if (stateResult.value && schemaResult.value) {
    issues.push(...validateStateAgainstSchema(stateResult.value, schemaResult.value, args.statePath));
  }
  if (design.tokens) {
    issues.push(...validateThemeTokens(design.tokens, design.sources.designPath));
  }
  if (stateResult.value && design.tokens) {
    issues.push(...validateCrossSurfaceState(stateResult.value, design.tokens, args.statePath));
  }

  const stateHash = stateResult.value && design.tokens ? hashDesignState(stateResult.value, design.markdown) : undefined;

  return {
    state: stateResult.value,
    tokens: design.tokens,
    schema: schemaResult.value,
    stateRaw: stateResult.raw,
    tokensRaw: design.markdown,
    issues,
    stateHash,
  };
}

function validateStateAgainstSchema(state: unknown, schema: unknown, filePath: string): Issue[] {
  if (!isRecord(schema) && typeof schema !== "boolean") {
    return [issue("error", "design_state.schema_invalid", "business.schema.json must be a JSON Schema object or boolean.", filePath)];
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema as AnySchema);
  if (validate(state)) {
    return [];
  }

  return (validate.errors ?? []).map((errorObject: ErrorObject) => {
    const location = errorObject.instancePath || "/";
    const messageText = errorObject.message ?? "schema validation failed";
    return issue("error", "design_state.schema", `${location} ${messageText}`, filePath);
  });
}

function validateThemeTokens(tokens: unknown, filePath: string): Issue[] {
  const issues: Issue[] = [];
  if (!isRecord(tokens)) {
    return [issue("error", "design_tokens.invalid", "DESIGN.md must define a structured token map.", filePath)];
  }
  if (asString(tokens.schemaVersion) !== "1.0.0") {
    issues.push(issue("error", "design_tokens.schema_version", "Normalized DESIGN.md tokens must use schemaVersion 1.0.0.", filePath));
  }
  const tokenRoot = isRecord(tokens.tokens) ? tokens.tokens : undefined;
  if (!tokenRoot) {
    issues.push(issue("error", "design_tokens.tokens_missing", "DESIGN.md must contain design tokens.", filePath));
    return issues;
  }

  for (const tokenPath of [
    "color.background",
    "color.surface",
    "color.primary",
    "color.accent",
    "color.text",
    "color.muted",
    "color.border",
    "font.display.family",
    "font.body.family",
    "radius.md",
    "space.md",
    "motion.durationBase",
  ]) {
    if (!getToken(tokens, tokenPath)) {
      issues.push(issue("error", "design_tokens.required_missing", `Required token missing: ${tokenPath}`, filePath));
    }
  }

  return issues;
}

function validateCrossSurfaceState(state: unknown, tokens: unknown, filePath: string): Issue[] {
  const issues: Issue[] = [];
  if (!isRecord(state)) {
    return [issue("error", "design_state.invalid", "business.json must be an object.", filePath)];
  }

  const designRoom = isRecord(state.designRoom) ? state.designRoom : {};
  const contractPath = asString(designRoom.contractPath);
  if (contractPath !== "DESIGN.md") {
    issues.push(issue("error", "design_state.contract_path", "designRoom.contractPath must be DESIGN.md.", filePath));
  }

  const appStore = getRecordPath(state, ["surfaces", "appStore"]);
  const customProductPages = asArray(appStore?.customProductPages);
  if (customProductPages.length > 70) {
    issues.push(issue("error", "design_state.cpp.limit", "App Store custom product pages must not exceed Apple's 70-page limit.", filePath));
  }

  const ppoTests = asArray(appStore?.productPageOptimizationTests);
  const runningPpoTests = ppoTests.filter((test) => isRecord(test) && test.status === "running");
  if (runningPpoTests.length > 1) {
    issues.push(issue("error", "design_state.ppo.running_limit", "Only one Product Page Optimization test can be running at a time.", filePath));
  }
  for (const test of ppoTests) {
    if (!isRecord(test)) {
      continue;
    }
    const treatments = asArray(test.treatments);
    if (treatments.length > 3) {
      issues.push(issue("error", "design_state.ppo.treatment_limit", "PPO tests must not exceed three treatments.", filePath));
    }
  }

  const inAppEvents = asArray(appStore?.inAppEvents);
  const publishedEvents = inAppEvents.filter((event) => isRecord(event) && event.status === "published");
  if (publishedEvents.length > 10) {
    issues.push(issue("error", "design_state.in_app_events.published_limit", "Only 10 In-App Events can be published at a time.", filePath));
  }

  for (const tokenReference of collectTokenReferences(state)) {
    if (!getToken(tokens, tokenReference)) {
      issues.push(issue("error", "design_state.token_reference_missing", `Unknown token reference: ${tokenReference}`, filePath));
    }
  }

  return issues;
}

function collectTokenReferences(value: unknown): string[] {
  const references: string[] = [];

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (!isRecord(node)) {
      return;
    }
    const tokenReferences = asArray(node.tokenReferences);
    for (const tokenReference of tokenReferences) {
      const tokenText = asString(tokenReference);
      if (tokenText) {
        references.push(tokenText);
      }
    }
    for (const child of Object.values(node)) {
      visit(child);
    }
  }

  visit(value);
  return references;
}

export function getToken(tokens: unknown, tokenPath: string): unknown {
  if (!isRecord(tokens)) {
    return undefined;
  }
  let current: unknown = tokens.tokens;
  for (const segment of tokenPath.split(".")) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function getRecordPath(value: unknown, segments: string[]): Record<string, unknown> | undefined {
  let current: unknown = value;
  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return isRecord(current) ? current : undefined;
}

export function hashDesignState(state: unknown, tokens: unknown): string {
  return createHash("sha256").update(JSON.stringify({ state, tokens })).digest("hex").slice(0, 16);
}

export function summarizeSurfaces(state: unknown): SurfaceSummary[] {
  if (!isRecord(state)) {
    return [];
  }

  const surfaces = getRecordPath(state, ["surfaces"]);
  const appStore = getRecordPath(state, ["surfaces", "appStore"]);
  const mobileApp = getRecordPath(state, ["surfaces", "mobileApp"]);

  return [
    summarizeSurfaceArray("Web funnels", asArray(surfaces?.webFunnels)),
    summarizeSurfaceArray("Landing pages", asArray(surfaces?.landingPages)),
    summarizeSurfaceArray("Marketing assets", asArray(surfaces?.marketingAssets)),
    summarizeSurfaceArray("App screens", asArray(mobileApp?.screens)),
    summarizeSurfaceArray("App flows", asArray(mobileApp?.flows)),
    summarizeSurfaceArray("Custom product pages", asArray(appStore?.customProductPages)),
    summarizeSurfaceArray("PPO tests", asArray(appStore?.productPageOptimizationTests)),
    summarizeSurfaceArray("In-App Events", asArray(appStore?.inAppEvents)),
  ];
}

function summarizeSurfaceArray(label: string, items: unknown[]): SurfaceSummary {
  let ready = 0;
  let blocked = 0;
  let notStarted = 0;
  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }
    if (item.status === "ready" || item.status === "approved" || item.status === "published") {
      ready += 1;
    } else if (item.status === "blocked") {
      blocked += 1;
    } else if (item.status === "not_started" || item.status === "draft") {
      notStarted += 1;
    }
  }
  return { label, count: items.length, ready, blocked, notStarted };
}

export function rel(root: string, targetPath: string): string {
  return path.relative(root, targetPath) || ".";
}
