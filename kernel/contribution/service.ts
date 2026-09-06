import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  CONTRIBUTION_API_VERSION,
  CONTRIBUTION_OPERATIONS,
  evaluateInputSchema,
  planInputSchema,
  targetInputSchema,
  upgradePlanInputSchema,
  upstreamCheckInputSchema,
  upstreamsListInputSchema,
  type ContributionErrorCode,
  type ContributionFailure,
  type ContributionOperationDeclaration,
  type ContributionResult,
} from "../../contracts/contribution/contract.js";
import { checkContribution } from "./check.js";
import { evaluateContribution } from "./evaluate.js";
import { planContribution, type IntakeDependencies } from "./plan.js";
import { previewContribution } from "./preview.js";
import { checkUpstream, listUpstreams, upgradePlan, type UpstreamDependencies } from "./upstreams.js";
import type { CheckData, EvaluateData, PlanData, PreviewData, UpgradePlanData, UpstreamCheckData, UpstreamInventoryData } from "./types.js";

/**
 * One shared contribution service behind the CLI and the opt-in contributor MCP surface.
 *
 * Boundaries are enforced here, independent of skill wording:
 * - The MCP surface never fetches, never writes, and reads local sources only inside roots the
 *   operator configured (`B2C_APP_BUILDER_CONTRIBUTION_ROOTS`, path-separator delimited).
 * - The CLI resolves relative paths against the caller's directory and may fetch or write only
 *   when the caller asked for it.
 * - No operation runs upstream code, install hooks, provider setup, or a workspace mutation.
 */
export type ContributionSurface = "cli" | "mcp";

export interface ContributionServiceOptions {
  readonly surface: ContributionSurface;
  readonly skillRoot: string;
  /** Directory relative paths resolve against (the invoking shell's directory for the CLI). */
  readonly cwd?: string;
  /** Local roots the MCP surface may read. Ignored by the CLI. */
  readonly roots?: readonly string[];
  readonly now?: () => Date;
  readonly intake?: Partial<IntakeDependencies>;
  readonly upstream?: Partial<UpstreamDependencies>;
}

export class ContributionError extends Error {
  constructor(
    readonly code: ContributionErrorCode,
    message: string,
    readonly fields: string[] = [],
    readonly recovery = "Correct the request using the contribution contract and retry.",
  ) {
    super(message);
    this.name = "ContributionError";
  }
}

export function contributionFailure(code: ContributionErrorCode, message: string, fields: string[] = [], recovery?: string): ContributionFailure {
  return {
    apiVersion: CONTRIBUTION_API_VERSION,
    requestId: randomUUID(),
    ok: false,
    warnings: [],
    error: { code, message, fields, retryable: false, recovery: recovery ?? "Correct the request using the contribution contract and retry." },
  };
}

async function respond<T>(compute: () => Promise<{ data: T; warnings?: string[] }>): Promise<ContributionResult<T>> {
  try {
    const { data, warnings } = await compute();
    return { apiVersion: CONTRIBUTION_API_VERSION, requestId: randomUUID(), ok: true, warnings: warnings ?? [], data };
  } catch (error) {
    if (error instanceof ContributionError) return contributionFailure(error.code, error.message, error.fields, error.recovery);
    if (error instanceof z.ZodError) {
      return contributionFailure(
        "INVALID_INPUT",
        "The request does not match the contribution contract.",
        error.issues.map((issue) => issue.path.map(String).join(".")),
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/^(contribution|upstreams|intake|source)\.[a-z_]+/u.test(message)) {
      const reason = message.split(":")[0]!;
      const code: ContributionErrorCode = reason.includes("network")
        ? "NETWORK_DISABLED"
        : reason.includes("unknown_upstream")
          ? "UNKNOWN_UPSTREAM"
          : reason.includes("unknown_contribution") || reason.includes("manifest_missing")
            ? "UNKNOWN_CONTRIBUTION"
            : reason.includes("scope")
              ? "SCOPE_REFUSED"
              : reason.includes("unavailable")
                ? "SOURCE_UNAVAILABLE"
                : reason.includes("refused")
                  ? "SOURCE_REFUSED"
                  : "LOCAL_OPERATION_REFUSED";
      return contributionFailure(code, message);
    }
    return contributionFailure("INTERNAL_ERROR", message);
  }
}

function realOrSelf(value: string): string {
  try {
    return realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function insideRoot(root: string, target: string): boolean {
  const relative = path.relative(realOrSelf(root), realOrSelf(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Resolve an operator-supplied local path for the requesting surface. The CLI resolves against
 * the caller directory. The MCP surface accepts only paths inside configured roots; an empty
 * root list refuses every local path, and a symlinked root or target never widens access.
 */
export function resolveLocalPath(options: ContributionServiceOptions, value: string, purpose: "read" | "write"): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new ContributionError("INVALID_INPUT", "A local path is required.", ["path"]);
  if (options.surface === "mcp") {
    if (purpose === "write")
      throw new ContributionError("LOCAL_OPERATION_REFUSED", "The contributor MCP surface is read-only. Use the b2c CLI to write a contribution root.", [
        "target",
      ]);
    const roots = (options.roots ?? []).filter((root) => root.trim());
    if (!roots.length)
      throw new ContributionError(
        "LOCAL_OPERATION_REFUSED",
        "No contribution roots are configured for MCP. Set B2C_APP_BUILDER_CONTRIBUTION_ROOTS to the directories the contributor MCP may read.",
        ["path"],
      );
    if (!path.isAbsolute(value))
      throw new ContributionError("LOCAL_OPERATION_REFUSED", "The contributor MCP accepts absolute paths inside a configured root only.", ["path"]);
    const resolved = path.resolve(value);
    const root = roots.find((candidate) => insideRoot(candidate, resolved));
    if (!root) throw new ContributionError("LOCAL_OPERATION_REFUSED", "The path is outside every configured contribution root.", ["path"]);
    if (existsSync(resolved) && lstatSync(resolved).isSymbolicLink() && !insideRoot(root, realOrSelf(resolved)))
      throw new ContributionError("LOCAL_OPERATION_REFUSED", "A symlink must not escape its configured contribution root.", ["path"]);
    return resolved;
  }
  return path.isAbsolute(value) ? value : path.resolve(options.cwd ?? process.cwd(), value);
}

export function contributionOperation(id: string): ContributionOperationDeclaration | undefined {
  return CONTRIBUTION_OPERATIONS.find((operation) => operation.id === id);
}

export async function callContributionOperation(
  id: "contribution.plan",
  input: unknown,
  options: ContributionServiceOptions,
): Promise<ContributionResult<PlanData>>;
export async function callContributionOperation(
  id: "contribution.check",
  input: unknown,
  options: ContributionServiceOptions,
): Promise<ContributionResult<CheckData>>;
export async function callContributionOperation(
  id: "contribution.preview",
  input: unknown,
  options: ContributionServiceOptions,
): Promise<ContributionResult<PreviewData>>;
export async function callContributionOperation(
  id: "contribution.evaluate",
  input: unknown,
  options: ContributionServiceOptions,
): Promise<ContributionResult<EvaluateData>>;
export async function callContributionOperation(
  id: "upstreams.list",
  input: unknown,
  options: ContributionServiceOptions,
): Promise<ContributionResult<UpstreamInventoryData>>;
export async function callContributionOperation(
  id: "upstreams.check",
  input: unknown,
  options: ContributionServiceOptions,
): Promise<ContributionResult<UpstreamCheckData>>;
export async function callContributionOperation(
  id: "upstreams.upgrade-plan",
  input: unknown,
  options: ContributionServiceOptions,
): Promise<ContributionResult<UpgradePlanData>>;
export async function callContributionOperation(id: string, input: unknown, options: ContributionServiceOptions): Promise<ContributionResult<unknown>>;
export async function callContributionOperation(id: string, input: unknown, options: ContributionServiceOptions): Promise<ContributionResult<unknown>> {
  const declaration = contributionOperation(id);
  if (!declaration) return contributionFailure("INVALID_INPUT", `Unknown contribution operation: ${id}.`, ["operation"]);
  if (options.surface === "mcp" && declaration.mcp === null) {
    return contributionFailure("LOCAL_OPERATION_REFUSED", `${id} is CLI-only.`, ["operation"], "Run the b2c CLI for this operation.");
  }
  const now = options.now ?? (() => new Date());
  switch (declaration.id) {
    case "contribution.plan":
      return respond(async () => {
        const parsed = planInputSchema.parse(input);
        const mcp = options.surface === "mcp";
        if (mcp && parsed.network)
          throw new ContributionError("NETWORK_DISABLED", "The contributor MCP never fetches. Run b2c contribute plan --network from the CLI.", ["network"]);
        if (mcp && parsed.target)
          throw new ContributionError("LOCAL_OPERATION_REFUSED", "The contributor MCP writes nothing. Omit target or use the CLI.", ["target"]);
        const sources = parsed.sources.map((source) => {
          if (source.url && source.path) throw new ContributionError("INVALID_INPUT", "A source is a URL or a local path, not both.", ["sources"]);
          if (source.url) {
            if (mcp) throw new ContributionError("NETWORK_DISABLED", "The contributor MCP inspects local roots only.", ["sources"]);
            return { url: source.url };
          }
          if (!source.path) throw new ContributionError("INVALID_INPUT", "A source needs a URL or a local path.", ["sources"]);
          return { path: resolveLocalPath(options, source.path, "read") };
        });
        const target = parsed.target ? resolveLocalPath(options, parsed.target, "write") : undefined;
        const data = await planContribution(
          {
            sources,
            goal: parsed.goal,
            scope: parsed.scope,
            target,
            synthetic: parsed.synthetic ?? false,
            network: !mcp && (parsed.network ?? false),
            batch: parsed.batch ?? parsed.sources.length > 1,
          },
          { skillRoot: options.skillRoot, now, ...(options.intake ?? {}) },
        );
        return { data };
      });
    case "contribution.check":
      return respond(async () => {
        const parsed = targetInputSchema.parse(input);
        return { data: checkContribution(resolveLocalPath(options, parsed.target, "read"), { skillRoot: options.skillRoot, now }) };
      });
    case "contribution.preview":
      return respond(async () => {
        const parsed = targetInputSchema.parse(input);
        return { data: previewContribution(resolveLocalPath(options, parsed.target, "read"), { skillRoot: options.skillRoot }) };
      });
    case "contribution.evaluate":
      return respond(async () => {
        const parsed = evaluateInputSchema.parse(input);
        return {
          data: await evaluateContribution(resolveLocalPath(options, parsed.target, "read"), {
            skillRoot: options.skillRoot,
            suite: parsed.suite,
            allowCommands: parsed.allowCommands ?? false,
          }),
        };
      });
    case "upstreams.list":
      return respond(async () => {
        const parsed = upstreamsListInputSchema.parse(input);
        if (options.surface === "mcp" && parsed.observeHost)
          throw new ContributionError("LOCAL_OPERATION_REFUSED", "Host observation runs executables and is CLI-only.", ["observeHost"]);
        return { data: listUpstreams({ skillRoot: options.skillRoot, now, ...(options.upstream ?? {}) }, parsed) };
      });
    case "upstreams.check":
      return respond(async () => {
        const parsed = upstreamCheckInputSchema.parse(input);
        if (options.surface === "mcp" && (parsed.fetch || parsed.write || parsed.observeHost))
          throw new ContributionError("NETWORK_DISABLED", "Fetching, host observation, and writing observations are CLI-only.", [
            "fetch",
            "write",
            "observeHost",
          ]);
        return { data: await checkUpstream({ skillRoot: options.skillRoot, now, ...(options.upstream ?? {}) }, parsed) };
      });
    case "upstreams.upgrade-plan":
      return respond(async () => {
        const parsed = upgradePlanInputSchema.parse(input);
        const target = parsed.target ? resolveLocalPath(options, parsed.target, "write") : undefined;
        return { data: upgradePlan({ skillRoot: options.skillRoot, now, ...(options.upstream ?? {}) }, { ...parsed, target }) };
      });
    default: {
      const exhaustive: never = declaration;
      return contributionFailure("INTERNAL_ERROR", `Unhandled operation ${JSON.stringify(exhaustive)}.`);
    }
  }
}

/** Roots the contributor MCP may read, from the environment. Empty means no local reads. */
export function contributionRootsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.B2C_APP_BUILDER_CONTRIBUTION_ROOTS?.trim();
  if (!raw) return [];
  return raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry && path.isAbsolute(entry));
}
