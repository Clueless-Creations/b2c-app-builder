import { verifySnapshot, type PackageDependency } from "./resources.js";
import type { Extension } from "../../contracts/extensions/contract.js";

/** Provider groups identify vendors; implementations identify one operation on one target. */
export function resolveProviderImplementation(
  packages: readonly PackageDependency[],
  request: { operation: string; provider: { id: string; version: string }; target: { platform: string; runtime: string } },
): { owner: PackageDependency; implementation: Extension["implementations"][number] } {
  for (const entry of packages) verifySnapshot(entry.directory, entry.snapshot);
  const providers = packages.flatMap((owner) =>
    (owner.snapshot.extension.providers ?? [])
      .filter((provider) => provider.id === request.provider.id && provider.version === request.provider.version)
      .map((provider) => ({ owner, provider })),
  );
  if (providers.length !== 1) throw new Error("composition.provider_missing_or_ambiguous");
  const providerOwner = providers[0]!.owner;
  const matches = packages.flatMap((owner) =>
    owner.snapshot.extension.implementations
      .filter((implementation) => {
        if (
          implementation.provider !== request.provider.id ||
          implementation.operation !== request.operation ||
          !implementation.targets.some((target) => target.platform === request.target.platform && target.runtime === request.target.runtime)
        )
          return false;
        if (owner.snapshot.digest === providerOwner.snapshot.digest) return true;
        return (
          owner.snapshot.dependencies.some(
            (dependency) => dependency.id === providerOwner.snapshot.extension.id && dependency.digest === providerOwner.snapshot.digest,
          ) &&
          owner.snapshot.extension.imports.some(
            (item) =>
              item.package.id === providerOwner.snapshot.extension.id &&
              item.package.version === providerOwner.snapshot.extension.version &&
              item.exports.includes(request.provider.id),
          )
        );
      })
      .map((implementation) => ({ owner, implementation })),
  );
  if (matches.length !== 1) throw new Error("composition.provider_implementation_missing_or_ambiguous");
  return matches[0]!;
}
