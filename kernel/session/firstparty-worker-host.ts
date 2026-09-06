import type { CatalogInput } from "../engine/compile.js";
import { readFirstpartyPackage } from "../../catalog/packs/installed-firstparty.js";
import { skillRoot } from "./reducer-cli.js";
import { createCliWorkerArtifactRoute, resolveWorkerRuntime, type WorkerRuntime } from "./executor.js";
import { OperationRouteRegistry } from "./operation-routes.js";
/** Only the executing, verified shipped package can select the known host worker adapter. */
export function createFirstpartyWorkerRoutes(catalog: CatalogInput, requested: WorkerRuntime = "auto"): OperationRouteRegistry {
  if (!catalog.workflows.some((workflow) => workflow.selectedOperation?.implementation.mode === "worker-artifact")) return new OperationRouteRegistry([]);
  const pack = readFirstpartyPackage(skillRoot()),
    runtime = resolveWorkerRuntime(requested);
  if (!runtime) return new OperationRouteRegistry([]);
  const keys = new Set<string>();
  const routes = catalog.workflows.flatMap((workflow) => {
    const binding = workflow.selectedOperation;
    if (!binding || binding.implementation.packageDigest !== pack.snapshot.digest || binding.implementation.packageId !== pack.snapshot.extension.id) return [];
    const implementation = pack.snapshot.extension.implementations.find(
      (entry) =>
        entry.id === binding.implementation.id &&
        entry.operation === binding.operation &&
        entry.mode === "worker-artifact" &&
        entry.provider === "b2c/consumer-business-worker",
    );
    if (!implementation) return [];
    const key = `${binding.operation}:${implementation.id}`;
    if (keys.has(key)) return [];
    keys.add(key);
    return [createCliWorkerArtifactRoute({ operation: binding.operation, implementationId: implementation.id, packageDigest: pack.snapshot.digest }, runtime)];
  });
  return new OperationRouteRegistry(routes);
}
