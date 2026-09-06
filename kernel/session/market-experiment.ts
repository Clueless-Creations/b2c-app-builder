import { assertNoPendingErasure } from "../reducer/erasure-guard.js";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { loadRegistry, type WorkspaceRegistry } from "../../adapters/registry.js";
import { validateBusinessState, validateMetricContracts } from "../schema/index.js";
import { catalogFromDocument } from "../operating-model/measurement.js";
import { marketExperimentSchema, reportMarketExperiment, type MarketBusinessInput, type MarketExperimentReport } from "../operating-model/market-experiment.js";
import { assertCompositionActivationComplete } from "../composition/activation.js";

function registered(registry: WorkspaceRegistry, id: string): string {
  const matches = registry.workspaces.filter((entry) => entry.id === id);
  if (matches.length !== 1) throw new Error("market.workspace_unregistered_or_ambiguous");
  const root = realpathSync(matches[0]!.path);
  if (
    registry.workspaces.some(
      (entry) =>
        entry.id !== id &&
        (() => {
          try {
            return realpathSync(entry.path) === root;
          } catch {
            return false;
          }
        })(),
    )
  )
    throw new Error("market.workspace_identity_alias");
  assertNoPendingErasure(root);
  return root;
}
function readJson(root: string, relative: string): unknown {
  let file = root;
  for (const segment of relative.split("/")) {
    file = path.join(file, segment);
    if (lstatSync(file).isSymbolicLink()) throw new Error("market.workspace_file_symlink");
  }
  return JSON.parse(readFileSync(file, "utf8"));
}
function metricDocument(root: string): Record<string, unknown> {
  const raw = readJson(root, "operations/metric-contracts.json");
  if (!validateMetricContracts(raw).valid) throw new Error("market.metric_contracts_invalid");
  return raw as Record<string, unknown>;
}
/** Registry-scoped read model. The authored experiment stays in the existing metric contract document. */
export function readMarketExperimentReport(
  input: { workspaceId: string; experimentId: string; now?: string },
  registry = loadRegistry(),
): MarketExperimentReport {
  const owner = registered(registry, input.workspaceId);
  assertCompositionActivationComplete(owner);
  const document = metricDocument(owner);
  const matches = (Array.isArray(document.marketExperiments) ? document.marketExperiments : []).filter(
    (entry) => (entry as { id?: unknown })?.id === input.experimentId,
  );
  if (matches.length !== 1) throw new Error("market.experiment_missing_or_ambiguous");
  const experiment = marketExperimentSchema.parse(matches[0]);
  const businesses: MarketBusinessInput[] = experiment.participants.map((participant) => {
    try {
      const root = registered(registry, participant.workspaceId);
      assertCompositionActivationComplete(root);
      const state = validateBusinessState(readJson(root, "state/business-state.json"));
      if (!state.valid || !state.value) throw new Error("market.business_state_invalid");
      const metrics = metricDocument(root);
      return {
        workspaceId: participant.workspaceId,
        appId: String(metrics.appId),
        environment: String(metrics.environment),
        model: state.value.operatingModel,
        measurement: catalogFromDocument(metrics),
      };
    } catch (error) {
      return {
        workspaceId: participant.workspaceId,
        appId: participant.appId,
        environment: participant.environment,
        unavailableReason: error instanceof Error && error.message.startsWith("market.") ? error.message : "market.workspace_unreadable",
      };
    }
  });
  return reportMarketExperiment({ experiment, businesses, now: input.now ?? new Date().toISOString() });
}
