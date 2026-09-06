import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { snapshotPackage } from "../../../kernel/composition/resources.js";
import { loadSnapshotPacks } from "../../../catalog/packs/snapshots.js";
import { composeCatalog } from "../../../catalog/index.js";
import { toRecipeCatalogInput } from "../../../catalog/bridge.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { skillRoot } from "./_harness.js";
import { normalizeSuperwallRevenueCatObservation } from "../../../adapters/providers/superwall/measurement.js";
import assert from "node:assert/strict";
import { type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("recorded native compilation proof matches current native source and dependency inputs", () => {
    const root = path.join(skillRoot, "examples/extensions/superwall-ios");
    const proof = JSON.parse(readFileSync(path.join(root, "local-proof.json"), "utf8"));
    assert.equal(proof.checks.iosSdkCompilation.status, "passed");
    assert.equal(proof.limits.sandboxProviderRoundTrip, "not_observed");
    for (const [relative, sha] of Object.entries(proof.inputs)) {
      assert.equal(
        createHash("sha256")
          .update(readFileSync(path.join(root, relative)))
          .digest("hex"),
        sha,
        `native proof stale: ${relative}`,
      );
    }
  });

  harness.check("native monetization extension pins declarative workflows and refuses non-iOS selection", () => {
    const store = harness.makeTempDir("native-monetization-package");
    const snapshot = snapshotPackage(path.join(skillRoot, "examples/extensions/superwall-ios"), store, []);
    const packages = [{ directory: path.join(store, snapshot.digest.slice(7)), snapshot }];
    const recipe = { packageId: snapshot.extension.id, packageVersion: "1.0.0", recipeId: "superwall-ios/composition" };
    const resolved = resolveRecipeBindings({ packages, recipe, target: { platform: "ios", runtime: "swiftui" } });
    const input = toRecipeCatalogInput(composeCatalog(skillRoot, loadSnapshotPacks(packages)), resolved);
    const plan = compilePlan(input);
    assert.equal(plan.nodes.length, 3);
    assert.equal(plan.nodes.find((node) => node.workflowId.endsWith("-purchase"))?.actionClass, "spend");
    assert(plan.nodes.every((node) => node.selectedOperation?.executionRoute === "unknown"));
    assert.equal(resolveRecipeBindings({ packages, recipe, target: { platform: "android", runtime: "kotlin" } }).status, "refused");
  });

  harness.check("native monetization observations use explicit U16 joins and amount normalization", () => {
    const from = { appId: "fixture-app", environment: "sandbox", opaqueRef: "subject-anonymous" };
    const to = { ...from, opaqueRef: "subject-account" };
    const purchase = { sourceEventId: "transaction-1", kind: "purchase" as const, amount: 1000, currency: "USD", amountTreatment: "gross" as const };
    const base = {
      assignmentOwner: "superwall" as const,
      entitlementAuthority: "revenuecat" as const,
      exposure: { assignmentId: "treatment-1", subject: from, observedAt: "2026-09-05T00:00:00Z" },
      identifiedSubject: to,
      identityJoin: { from, to, lifecycle: "identified" as const, recordedAt: "2026-09-05T00:00:01Z" },
      amountEvents: [purchase, purchase],
    };
    const value = normalizeSuperwallRevenueCatObservation(base);
    assert.equal(value.amounts.netAmount, 1000);
    assert.equal(value.amounts.duplicateCopiesIgnored, 1);
    assert.equal(value.exposureSubjectRef.opaqueRef, "subject-anonymous");
    assert.equal(value.subjectRef.opaqueRef, "subject-account");
    assert.throws(() => normalizeSuperwallRevenueCatObservation({ ...base, identityJoin: undefined }), /identity_join/);
    assert.throws(
      () => normalizeSuperwallRevenueCatObservation({ ...base, identityJoin: { ...base.identityJoin, to: { ...to, environment: "production" } } }),
      /identity_join/,
    );
    const empty = { appId: "", environment: "", opaqueRef: "" };
    assert.throws(
      () =>
        normalizeSuperwallRevenueCatObservation({ ...base, exposure: { ...base.exposure, subject: empty }, identifiedSubject: empty, identityJoin: undefined }),
      /identity_invalid/,
    );
    assert.throws(
      () =>
        normalizeSuperwallRevenueCatObservation({ ...base, identifiedSubject: from, identityJoin: { ...base.identityJoin, to: from, lifecycle: "deleted" } }),
      /identity_join/,
    );
    assert.equal(value.providerProof, "not_observed");
  });
}
