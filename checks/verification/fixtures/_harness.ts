import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema, type ErrorObject } from "ajv/dist/2020.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";

export interface CaseResult {
  label: string;
  ok: boolean;
  detail: string;
  /**
   * A case that could not be evaluated here, as distinct from one that passed. Skipped cases do
   * not fail the suite and are never reported as passes — see `skip` on Harness for when this is
   * legitimate, which is narrower than it looks.
   */
  skipped?: boolean;
}

export interface SchemaCheckResult {
  valid: boolean;
  errors: ErrorObject[];
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const skillRoot = path.resolve(scriptDir, "../../..");

/**
 * The repository root. Since ADR-0002 the package root is the repository root, so this is the
 * same directory as `skillRoot`; an installed runtime (`~/.codex/skills/b2c-app-builder`) has the
 * same shape but carries none of the repository-only files. Exported so the fixtures that assert
 * repo-level invariants share one definition of where they are looking.
 */
export const repoRoot = skillRoot;

/**
 * True when this skill is running from a source checkout rather than an installed runtime.
 *
 * `npm run runtime:sync` copies the skill into the runtime and then verifies the installed copy.
 * A handful of fixtures assert things about the *repository* —
 * the migration port ledger under `docs/`, cross-manifest audit-plan parity, the maintainer's own
 * root AGENTS.md/CLAUDE.md — and the runtime deliberately ships none of that. Those cases were
 * failing on ENOENT every sync, which makes the one command that proves an install is good report
 * red no matter what, and a gate that is always red is a gate people stop reading.
 */
export function repoCheckoutPresent(): boolean {
  return existsSync(path.join(repoRoot, "package.json"));
}

function isDateTime(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(new Date(value).getTime()));
}

export function createSchemaRegistry(schemaDir: string): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  ajv.addFormat("date-time", { type: "string", validate: isDateTime });
  for (const fileName of readdirSync(schemaDir)) {
    if (!fileName.endsWith(".schema.json")) continue;
    const schema = JSON.parse(readFileSync(path.join(schemaDir, fileName), "utf8")) as AnySchema;
    ajv.addSchema(schema);
  }
  return ajv;
}

export class AssertionFailure extends Error {}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AssertionFailure(message);
}

export function formatAjvError(error: ErrorObject): string {
  const missing = error.params && "missingProperty" in error.params ? ` (${(error.params as { missingProperty: string }).missingProperty})` : "";
  return `${error.instancePath || "/"} ${error.message ?? "invalid"}${missing}`;
}

export function assertSchemaValid(result: SchemaCheckResult, context: string): void {
  if (!result.valid) {
    throw new AssertionFailure(`${context}: expected valid, got errors: ${result.errors.map(formatAjvError).join("; ")}`);
  }
}

export function assertSchemaInvalid(result: SchemaCheckResult, expectedFragment: string, context: string): void {
  if (result.valid) throw new AssertionFailure(`${context}: expected invalid (matching "${expectedFragment}"), but the document validated`);
  const messages = result.errors.map(formatAjvError);
  if (!messages.some((message) => message.includes(expectedFragment))) {
    throw new AssertionFailure(`${context}: expected an error mentioning "${expectedFragment}", got: ${messages.join("; ")}`);
  }
}

export interface Harness {
  readonly tempRoot: string;
  readonly results: CaseResult[];
  makeTempDir: (name: string) => string;
  check: (label: string, fn: () => void) => void;
  /**
   * Record that a case could not be evaluated in this environment, with the reason. Use only when
   * the case's *subject* is absent — not when it is merely inconvenient to set up, and never to
   * quiet a case that is genuinely failing. The reason is printed, so an unexplained skip is
   * visible rather than silent.
   */
  skip: (label: string, reason: string) => void;
  checkSchema: (schemaId: string, data: unknown) => SchemaCheckResult;
  runScript: (label: string, scriptPath: string, args: string[], expectedCode: number, expectedText?: string) => void;
  cleanup: () => void;
}

export function createHarness(schemaDir: string): Harness {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "b2c-core-fixtures-"));
  const results: CaseResult[] = [];
  const tsxBin = resolveTsxBin(skillRoot);
  const ajv = createSchemaRegistry(schemaDir);

  const makeTempDir = (name: string): string => {
    const dir = path.join(tempRoot, name);
    mkdirSync(dir, { recursive: true });
    return dir;
  };

  const check = (label: string, fn: () => void): void => {
    try {
      fn();
      results.push({ label, ok: true, detail: "" });
    } catch (error) {
      results.push({ label, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };

  const skip = (label: string, reason: string): void => {
    results.push({ label, ok: true, skipped: true, detail: reason });
  };

  const checkSchema = (schemaId: string, data: unknown): SchemaCheckResult => {
    const validate = ajv.getSchema(schemaId);
    if (!validate) throw new Error(`Unknown schema $id: ${schemaId}`);
    const valid = Boolean(validate(data));
    return { valid, errors: [...(validate.errors ?? [])] };
  };

  const runScript = (label: string, scriptPath: string, args: string[], expectedCode: number, expectedText?: string): void => {
    const result = spawnSync(tsxBin, [scriptPath, ...args], { cwd: skillRoot, encoding: "utf8" });
    const output = `${result.stdout}\n${result.stderr}`;
    const ok = result.status === expectedCode && (!expectedText || output.includes(expectedText));
    results.push({ label, ok, detail: ok ? "" : `expected exit ${expectedCode}, got ${result.status}\n${output.trim()}` });
  };

  const cleanup = (): void => {
    rmSync(tempRoot, { recursive: true, force: true });
  };

  return { tempRoot, results, makeTempDir, check, skip, checkSchema, runScript, cleanup };
}

export function reportResults(results: CaseResult[]): number {
  const failed = results.filter((result) => !result.ok);
  const skipped = results.filter((result) => result.skipped);
  console.log("Core fixture tests");
  // Skips are counted out of "passed" rather than folded into it: a suite that reports 185 passed
  // when 8 of them were never evaluated is claiming coverage it does not have.
  const passed = results.length - failed.length - skipped.length;
  console.log(`${failed.length} failure(s), ${passed} passed${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}`);
  for (const result of results) {
    console.log(`${result.skipped ? "SKIP" : result.ok ? "PASS" : "FAIL"} ${result.label}`);
    if (!result.ok || result.skipped) console.log(`  ${result.detail}`);
  }
  return failed.length;
}
