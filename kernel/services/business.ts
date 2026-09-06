import { lookupResearch, recordResearch } from "./research.js";
import * as lifecycleService from "./lifecycle.js";
import type { SessionHost } from "../session/run.js";
import * as localComposition from "./installed-composition.js";
import * as publicSchemas from "../../contracts/public-api/contract.js";
import { readMarketExperimentReport } from "../session/market-experiment.js";
import { loadRegistry, resolveRegisteredWorkspace } from "../../adapters/registry.js";
import { readWorkspaceStatus } from "../session/status.js";
import { randomUUID } from "node:crypto";
import { digest, stableJson } from "../../tooling/lib/canonical-json.js";
import { z } from "zod";
import {
  API_VERSION,
  businessStatusInputSchema,
  businessStatusSchema,
  composeInputSchema,
  discoverInputSchema,
  discoverySchema,
  previewSchema,
  type Binding,
  type ErrorCode,
  type Reference,
  type Result,
  type OperationId,
} from "../../contracts/public-api/contract.js";
import { resolveProviderImplementation } from "../composition/providers.js";
import { installedPublicDeclarations, installedPublicPackage } from "../../catalog/business-primitives.js";

class ContractError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields: string[],
    readonly recovery: string,
  ) {
    super(message);
  }
}
export function failure(
  code: ErrorCode,
  message: string,
  fields: string[] = [],
  recovery = "Correct the request using the public contract and retry.",
): Result<never> {
  return { apiVersion: API_VERSION, requestId: randomUUID(), ok: false, warnings: [], error: { code, message, fields, retryable: false, recovery } };
}
function respond<T>(compute: () => T): Result<T> {
  try {
    return { apiVersion: API_VERSION, requestId: randomUUID(), ok: true, warnings: [], data: compute() };
  } catch (error) {
    if (error instanceof ContractError) return failure(error.code, error.message, error.fields, error.recovery);
    if (error instanceof z.ZodError)
      return failure(
        "INVALID_INPUT",
        "The request does not match the public schema.",
        error.issues.map((issue) => issue.path.join(".")),
      );
    if (error instanceof Error && /^(composition|market|erasure|business)\.[a-z_]+(?::|$)/.test(error.message)) {
      const reason = error.message.split(":")[0]!;
      const code = reason.includes("workspace_unregistered")
        ? "UNKNOWN_WORKSPACE"
        : [
              "composition.activation_incomplete",
              "erasure.pending_transition",
              "business.request_recovery_required",
              "business.request_readback_required",
              "business.request_lock_recovery_required",
              "business.request_session_not_settled",
              "business.initialization_incomplete",
            ].includes(reason)
          ? "RECOVERY_REQUIRED"
          : ["composition.preview_stale", "business.stale_revision"].includes(reason)
            ? "STALE_PREVIEW"
            : "LOCAL_OPERATION_REFUSED";
      return failure(
        code,
        reason,
        [],
        reason === "business.initialization_incomplete"
          ? "Resume the exact initialization request; the standalone bootstrap command can recover a known local initialization intent."
          : [
                "business.request_recovery_required",
                "business.request_readback_required",
                "business.request_lock_recovery_required",
                "business.request_session_not_settled",
              ].includes(reason)
            ? "Reconcile the interrupted session and uncertain effects, then use business-recover with the request ID and current revision. Recovery does not dispatch work."
            : reason === "erasure.pending_transition"
              ? "Resume the authorized erasure transition before reading or changing this workspace."
              : code === "RECOVERY_REQUIRED"
                ? "Use b2c composition-recover with the registered workspace ID and resume or restore."
                : "Inspect the installed packages, authored configuration and runtime state; correct the refusal before retrying.",
      );
    }
    return failure(
      "INTERNAL_ERROR",
      "The public service could not complete this request.",
      [],
      "Report the request ID and operation; do not include credentials.",
    );
  }
}
function entity(kind: "recipe" | "provider", ref: Reference, field: string) {
  const found = installedPublicDeclarations().entities.find((item) => item.kind === kind && item.id === ref.id);
  if (!found)
    throw new ContractError(
      "UNKNOWN_ENTITY",
      "The requested entity is not in the installed public catalog.",
      [field],
      "Discover available entities with b2c catalog. Use b2c packages for installed external package metadata.",
    );
  if (found.version !== ref.version)
    throw new ContractError(
      "UNSUPPORTED_ENTITY_VERSION",
      "The requested entity version is not installed.",
      [field + ".version"],
      "Use an exact version returned by discovery.",
    );
  return found;
}
export function discover(input: unknown): Result<z.infer<typeof discoverySchema>> {
  return respond(() => {
    const args = discoverInputSchema.parse(input);
    const items = installedPublicDeclarations().entities.filter((item) => (!args.kind || args.kind === item.kind) && (!args.id || args.id === item.id));
    if (args.id && !items.length)
      throw new ContractError(
        "UNKNOWN_ENTITY",
        "The requested entity is not in the installed public catalog.",
        ["id"],
        "List available entities without an id filter.",
      );
    return discoverySchema.parse({ items, contractStatus: "stable", providerExecution: "unavailable" });
  });
}
/** This service only interprets caller-supplied data and bundled declarations. No I/O adapters. */
export function compose(input: unknown): Result<z.infer<typeof previewSchema>> {
  return respond(() => {
    if (input && typeof input === "object" && "mode" in input && input.mode === "apply")
      throw new ContractError(
        "COMPOSITION_APPLY_UNAVAILABLE",
        "Applying a public composition is not implemented.",
        ["mode"],
        "Use installed composition planning and activation.",
      );
    const raw = input && typeof input === "object" && "composition" in input ? input.composition : undefined;
    if (raw && typeof raw === "object" && "apiVersion" in raw && raw.apiVersion !== API_VERSION)
      throw new ContractError(
        "UNSUPPORTED_VERSION",
        "The composition API version is not supported.",
        ["composition.apiVersion"],
        "Use the installed b2c/v1 schema.",
      );
    const { composition } = composeInputSchema.parse(input);
    const { entities: PUBLIC_ENTITIES, defaults: RECIPE_DEFAULTS } = installedPublicDeclarations();
    const recipe = entity("recipe", composition.recipe, "composition.recipe");
    for (const operation of Object.keys(composition.bindings)) {
      if (!recipe.operations.includes(operation))
        throw new ContractError(
          "UNKNOWN_OPERATION",
          "The recipe does not declare this operation.",
          ["composition.bindings", operation],
          "Use operations declared by the selected recipe.",
        );
    }
    const resolved = recipe.operations.map((operation) => {
      const selected: Binding = composition.bindings[operation] ?? RECIPE_DEFAULTS[recipe.id + "@" + recipe.version]![operation]!;
      const provider = entity("provider", selected.provider, "composition.bindings." + operation + ".provider");
      if (!provider.operations.includes(operation))
        throw new ContractError(
          "INCOMPATIBLE_BINDING",
          "The provider does not declare the selected operation.",
          ["composition.bindings", operation],
          "Select a provider that declares this operation; purchase and entitlement owners can differ from paywall presentation.",
        );
      if (provider.targets.some((target) => target.platform === composition.target.platform && target.runtime === composition.target.runtime))
        resolveProviderImplementation([installedPublicPackage()], { operation, provider: selected.provider, target: composition.target });
      return { provider, binding: { operation, ...selected, source: composition.bindings[operation] ? ("explicit" as const) : ("recipe" as const) } };
    });
    const blockers: z.infer<typeof previewSchema>["blockers"] = [
      {
        code: "COMPOSITION_APPLY_UNAVAILABLE",
        message: "Declaration preview does not activate a workspace; use composition-plan for installed package activation.",
      },
    ];
    for (const { binding, provider } of resolved) {
      if (!provider.targets.some((target) => target.platform === composition.target.platform && target.runtime === composition.target.runtime))
        blockers.push({ code: "UNSUPPORTED_TARGET", operation: binding.operation, message: "The provider declaration does not cover this target." });
      if (provider.execution === "unavailable")
        blockers.push({
          code: "PROVIDER_EXECUTION_UNAVAILABLE",
          operation: binding.operation,
          message: "This operation has no conformant public execution adapter yet.",
        });
    }
    const bindings = resolved.map((item) => item.binding);
    const proposal = { apiVersion: API_VERSION, recipe: composition.recipe, target: composition.target, bindings, declarations: PUBLIC_ENTITIES };
    return previewSchema.parse({
      declarationValid: true,
      proposalDigest: "sha256:" + digest(stableJson(proposal)),
      recipe: composition.recipe,
      target: composition.target,
      bindings,
      canApply: false,
      blockers,
      configuration: "not_checked",
      authority: "not_checked",
      verification: "not_checked",
    });
  });
}

/** Project existing runtime observations behind a registered identity; never return raw workspace data. */
export function businessStatus(input: unknown): Result<z.infer<typeof businessStatusSchema>> {
  return respond(() => {
    const args = businessStatusInputSchema.parse(input);
    const entries = loadRegistry().workspaces.filter((entry) => entry.id === args.workspaceId);
    if (entries.length !== 1)
      throw new ContractError(
        "UNKNOWN_WORKSPACE",
        "The workspace ID is not uniquely registered.",
        ["workspaceId"],
        "Use a registered workspace ID. Register a workspace with the local workspace command first.",
      );
    const resolved = resolveRegisteredWorkspace(args.workspaceId);
    if ("refused" in resolved)
      throw new ContractError(
        "UNKNOWN_WORKSPACE",
        "The workspace ID could not be resolved.",
        ["workspaceId"],
        "Check the local workspace registration and retry.",
      );
    const status = readWorkspaceStatus(resolved.path);
    const lifecycle = {
      missing: "missing",
      not_bootstrapped: "not_initialized",
      no_run: "initialized",
      run_state_unreadable: "unreadable",
      composition_incomplete: "recovery_required",
      erasure_incomplete: "recovery_required",
      initialization_incomplete: "recovery_required",
      run: "run_recorded",
    } as const;
    const work =
      status.state === "run" ? { total: 0, pending: 0, active: 0, waitingForFounder: 0, blocked: 0, completed: 0, failed: 0, excluded: 0, unknown: 0 } : null;
    if (work)
      for (const entry of status.run?.counts ?? []) {
        work.total += entry.count;
        switch (entry.status) {
          case "pending":
          case "ready":
          case "stale":
          case "deferred":
            work.pending += entry.count;
            break;
          case "running":
            work.active += entry.count;
            break;
          case "waiting_founder":
            work.waitingForFounder += entry.count;
            break;
          case "blocked":
          case "orphaned":
          case "needs_readback":
            work.blocked += entry.count;
            break;
          case "succeeded":
            work.completed += entry.count;
            break;
          case "failed":
            work.failed += entry.count;
            break;
          case "skipped":
          case "not_needed":
          case "cancelled":
            work.excluded += entry.count;
            break;
          default:
            work.unknown += entry.count;
        }
      }
    return businessStatusSchema.parse({
      workspaceId: args.workspaceId,
      lifecycle: lifecycle[status.state],
      work,
      ...(status.resume ? { resume: status.resume } : {}),
      observedFrom: "local_runtime",
      providerProof: "not_observed",
    });
  });
}

type OperationResult<I extends OperationId> = z.infer<Extract<(typeof publicSchemas.PUBLIC_OPERATIONS)[number], { id: I }>["outputSchema"]>;
async function respondAsync<T>(compute: () => Promise<T>): Promise<Result<T>> {
  try {
    const value = await compute();
    return respond(() => value);
  } catch (error) {
    return respond(() => {
      throw error;
    });
  }
}
export function callPublicOperation(operation: "business.run", input: unknown, host?: SessionHost): Promise<OperationResult<"business.run">>;
export function callPublicOperation<I extends Exclude<OperationId, "business.run">>(operation: I, input: unknown): OperationResult<I>;
export function callPublicOperation(operation: OperationId, input: unknown, host: SessionHost = {}): Result<unknown> | Promise<Result<unknown>> {
  switch (operation) {
    case "business.research.lookup":
      return respond(() => publicSchemas.researchLookupSchema.parse(lookupResearch(publicSchemas.researchLookupInputSchema.parse(input))));
    case "business.research.record":
      return respond(() => publicSchemas.researchRecordedSchema.parse(recordResearch(publicSchemas.researchRecordInputSchema.parse(input))));
    case "business.create":
      return respond(() => publicSchemas.businessCreatedSchema.parse(lifecycleService.createBusiness(publicSchemas.businessCreateInputSchema.parse(input))));
    case "business.initialize":
      return respond(() =>
        publicSchemas.businessInitializedSchema.parse(lifecycleService.initializeBusiness(publicSchemas.businessInitializeInputSchema.parse(input))),
      );
    case "business.plan":
      return respond(() => publicSchemas.businessPlanSchema.parse(lifecycleService.planBusiness(publicSchemas.businessPlanInputSchema.parse(input))));
    case "business.recover":
      return respond(() =>
        publicSchemas.businessRecoveredSchema.parse(lifecycleService.recoverBusiness(publicSchemas.businessRecoverInputSchema.parse(input))),
      );
    case "business.evidence":
      return respond(() =>
        publicSchemas.businessEvidenceSchema.parse(lifecycleService.businessEvidence(publicSchemas.businessEvidenceInputSchema.parse(input))),
      );
    case "business.run":
      return respondAsync(async () =>
        publicSchemas.businessRunSchema.parse(await lifecycleService.runBusiness(publicSchemas.businessRunInputSchema.parse(input), host)),
      );
    case "catalog.list":
      return discover(input);
    case "composition.preview":
      return compose(input);
    case "business.status":
      return businessStatus(input);
    case "packages.list":
      return respond(() => publicSchemas.packageListSchema.parse(localComposition.installedPackages(publicSchemas.packageListInputSchema.parse(input))));
    case "packages.import":
      return respond(() =>
        publicSchemas.packageSummarySchema.parse(localComposition.importInstalledPackage(publicSchemas.packageImportInputSchema.parse(input))),
      );
    case "composition.plan":
      return respond(() =>
        publicSchemas.activationPlanSchema.parse(localComposition.planInstalledComposition(publicSchemas.activationPlanInputSchema.parse(input))),
      );
    case "composition.activate":
      return respond(() =>
        publicSchemas.activationResultSchema.parse(localComposition.activateInstalledComposition(publicSchemas.activationApplyInputSchema.parse(input))),
      );
    case "composition.recover":
      return respond(() =>
        publicSchemas.activationResultSchema.parse(localComposition.recoverInstalledComposition(publicSchemas.activationRecoverInputSchema.parse(input))),
      );
    case "market.report":
      return respond(() => publicSchemas.marketReportSchema.parse(readMarketExperimentReport(publicSchemas.marketReportInputSchema.parse(input))));
    default: {
      const exhaustive: never = operation;
      throw new Error(`Unknown public operation: ${exhaustive}`);
    }
  }
}
