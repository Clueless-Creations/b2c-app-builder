import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { stringify } from "yaml";
import { validateMonetizationOutcomes } from "../../../adapters/providers/monetization-validation.js";
import type { ProviderContract } from "../../../adapters/providers/contract.js";
import { findProvisioningProvider } from "../../../adapters/provisioning/requirements.js";
import { assert, skillRoot, type Harness } from "./_harness.js";
const contract: ProviderContract = {
  schemaVersion: 1,
  id: "custompay",
  version: "1.0.0",
  title: "Custom billing fixture",
  kind: "billing",
  sourceIds: ["authored-conformance-contract"],
  features: [
    { id: "entitlements", required: true, notes: "Purchase and restore access" },
    { id: "experiments", required: true, notes: "A measured pricing experiment" },
  ],
  deprecations: [],
  machineReadableFeeds: [],
  reviewCadenceDays: 7,
};
function setup(harness: Harness) {
  const root = harness.makeTempDir("monetization-outcomes");
  mkdirSync(path.join(root, "revenue"), { recursive: true });
  mkdirSync(path.join(root, "state"), { recursive: true });
  mkdirSync(path.join(root, "catalog/providers"), { recursive: true });
  const now = new Date().toISOString();
  const proof = {
    schemaVersion: "b2c.monetization-proof/v1",
    providerId: "custompay",
    contractVersion: "1.0.0",
    observedAt: now,
    pricingDecision: { approvedBy: "founder", approvedAt: now, evidencePath: "revenue/pricing.md" },
    entitlement: { id: "paid-access", grantedInApp: true, restoredInApp: true, evidencePath: "revenue/purchase.md" },
    experiment: { id: "trial-length", engine: "custom-experiment", status: "active", observedAt: now, evidencePath: "revenue/experiment.md" },
  };
  for (const file of ["pricing", "purchase", "experiment"])
    writeFileSync(path.join(root, `revenue/${file}.md`), `The conformance fixture records substantive ${file} observations for case subscription-alpha.`);
  writeFileSync(path.join(root, "revenue/monetization-proof.json"), JSON.stringify(proof));
  writeFileSync(
    path.join(root, "revenue/REVENUE_OPS.md"),
    "The chosen pricing model, founder decision, entitlement behavior, and measured experiment are recorded in their linked proof files.",
  );
  const state = JSON.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/state/business-state.json"), "utf8"));
  state.lanes.revenue.status = "succeeded";
  writeFileSync(path.join(root, "state/business-state.json"), JSON.stringify(state));
  writeFileSync(
    path.join(root, "catalog/providers/custompay.yaml"),
    stringify({
      schema_version: 1,
      id: contract.id,
      version: contract.version,
      title: contract.title,
      kind: "billing",
      source_ids: contract.sourceIds,
      features: contract.features,
      deprecations: [],
      machine_readable_feeds: [],
      review_cadence_days: 7,
    }),
  );
  writeFileSync(path.join(root, "catalog/providers/capability-delta.yaml"), stringify({ schema_version: 1, reviewed_at: now.slice(0, 10), entries: [] }));
  return { root, proof };
}
export function register(harness: Harness): void {
  harness.check("monetization: explicit alternate provider validates its capability proof without RevenueCat artifacts or engines", () => {
    const { root } = setup(harness);
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        path.join(skillRoot, "checks/validation/business/money/check-revenue.ts"),
        "--root",
        root,
        "--skill-root",
        root,
        "--provider-contract",
        "custompay",
      ],
      { cwd: skillRoot, encoding: "utf8" },
    );
    assert(result.status === 0, result.stdout + result.stderr);
    assert(!result.stdout.toLowerCase().includes("revenuecat"), "unselected provider validation ran");
  });
  harness.check("monetization: entitlement, experiment, selection identity and capabilities remain mandatory", () => {
    const { root, proof } = setup(harness);
    assert(validateMonetizationOutcomes(root, contract).length === 0, "valid capability proof rejected");
    for (const broken of [
      { ...proof, entitlement: { ...proof.entitlement, grantedInApp: false } },
      { ...proof, experiment: undefined },
      { ...proof, providerId: "other" },
    ]) {
      writeFileSync(path.join(root, "revenue/monetization-proof.json"), JSON.stringify(broken));
      assert(
        validateMonetizationOutcomes(root, contract).some((issue) => issue.severity === "error"),
        "missing or mismatched proof accepted",
      );
    }
    assert(
      validateMonetizationOutcomes(root, { ...contract, features: [] }).some((issue) => issue.code === "revenue.provider_capability.unsupported"),
      "unknown capability accepted",
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        path.join(skillRoot, "checks/validation/business/money/check-revenue.ts"),
        "--root",
        root,
        "--skill-root",
        root,
        "--provider-contract",
        "unknown",
      ],
      { cwd: skillRoot, encoding: "utf8" },
    );
    assert(result.status === 1 && result.stdout.includes("revenue.provider_contract.unknown"), "unknown provider silently fell back");
  });
  harness.check("monetization: selected default retains RevenueCat purchase and configuration requirements", () => {
    const provider = findProvisioningProvider("provider.revenuecat");
    assert(provider, "default provider missing");
    assert(
      provider?.requirements.some((entry) => entry.name === "REVENUECAT_SECRET_API_KEY"),
      "default credential obligation lost",
    );
    assert(
      provider.requirements.some((entry) => entry.name.includes("purchase actually completes")),
      "default purchase-to-access obligation lost",
    );
  });
}
