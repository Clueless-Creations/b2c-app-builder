import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ProviderContract } from "./contract.js";
import { issue, type Issue } from "../../tooling/lib/launch-state.js";

const reference = z.string().min(1);
const proofSchema = z.strictObject({
  schemaVersion: z.literal("b2c.monetization-proof/v1"),
  providerId: reference,
  contractVersion: reference,
  observedAt: z.string().datetime(),
  pricingDecision: z.strictObject({ approvedBy: z.literal("founder"), approvedAt: z.string().datetime(), evidencePath: reference }),
  entitlement: z.strictObject({ id: reference, grantedInApp: z.literal(true), restoredInApp: z.literal(true), evidencePath: reference }),
  experiment: z.strictObject({
    id: reference,
    engine: reference,
    status: z.enum(["active", "completed"]),
    observedAt: z.string().datetime(),
    evidencePath: reference,
  }),
});
/** Offline capability evidence validation. It never performs or claims a live provider readback. */
export function monetizationCapabilityIssues(contract: ProviderContract): Issue[] {
  return contract.kind !== "billing" ||
    ["entitlements", "experiments"].some((id) => !contract.features.some((feature) => feature.id === id && feature.required))
    ? [
        issue(
          "error",
          "revenue.provider_capability.unsupported",
          `Selected provider ${contract.id} must declare required entitlement and experiment capabilities.`,
          "catalog/providers",
        ),
      ]
    : [];
}
export function validateMonetizationOutcomes(root: string, contract: ProviderContract, now = new Date()): Issue[] {
  const issues: Issue[] = [];
  const file = "revenue/monetization-proof.json";
  const readEvidence = (relative: string): string => {
    if (!relative || path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === ".."))
      throw new Error("Evidence must be an in-workspace relative file.");
    let cursor = path.resolve(root);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error("Workspace cannot be a symbolic link.");
    for (const segment of relative.split("/")) {
      cursor = path.join(cursor, segment);
      if (lstatSync(cursor).isSymbolicLink()) throw new Error("Evidence cannot follow a symbolic link.");
    }
    if (!lstatSync(cursor).isFile()) throw new Error("Evidence must be a regular file.");
    return readFileSync(cursor, "utf8");
  };
  const capabilityIssues = monetizationCapabilityIssues(contract);
  if (capabilityIssues.length) return capabilityIssues;
  try {
    const proof = proofSchema.parse(JSON.parse(readEvidence(file)));
    if (proof.providerId !== contract.id || proof.contractVersion !== contract.version)
      throw new Error("Proof provider/version differs from the selected contract.");
    const fresh = (date: string, days: number) => {
      const age = now.getTime() - Date.parse(date);
      if (age < 0 || age > days * 86_400_000) throw new Error("Selected provider evidence is stale or future dated.");
    };
    fresh(proof.observedAt, 30);
    fresh(proof.experiment.observedAt, 14);
    for (const evidence of [proof.entitlement.evidencePath, proof.experiment.evidencePath, proof.pricingDecision.evidencePath]) {
      const text = readEvidence(evidence).trim();
      if (text.length < 32 || /\b(TODO|TBD|placeholder)\b/i.test(text))
        throw new Error("Entitlement and experiment evidence must contain substantive observations.");
    }
  } catch (error) {
    issues.push(
      issue(
        "error",
        "revenue.selected_provider.proof_invalid",
        `Selected ${contract.id} capability proof is missing or invalid: ${error instanceof Error ? error.message : String(error)}`,
        file,
      ),
    );
  }
  return issues;
}
