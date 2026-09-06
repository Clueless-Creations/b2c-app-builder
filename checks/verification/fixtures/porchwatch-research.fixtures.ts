import { mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createBusiness, planBusiness } from "../../../kernel/services/lifecycle.js";
import { lookupResearch, recordResearch } from "../../../kernel/services/research.js";
import { callPublicOperation } from "../../../kernel/services/business.js";
import { researchQueryId } from "../../../kernel/session/research-observations.js";
import { workspaceRevision } from "../../../kernel/session/workspace-revision.js";
import { validateProductPriceEvidence } from "../../validation/business/money/price-evidence.js";
import { validateOfferTest } from "../../validation/business/research/offer-evidence.js";
import { type Issue } from "../../../tooling/lib/launch-state.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const query = {
  provider: "fixture/research",
  providerVersion: "1.0.0",
  connectionRef: "connection:research",
  operation: "category-estimates",
  parameters: { category: "parcel-trackers", country: "US" },
};
const offer = `# Offer test
## Test Contract
| Field | Value |
| --- | --- |
| Audience | people who repeatedly abandon habit streaks |
| Exact discovery location | r/habits |
| Native format | case-study post |
| Offer | join a recovery waitlist |
| Owned relationship | email waitlist |
| Primary response | waitlist signup |
| Stop rule | 1000 qualified visits |
## Exposure And Conversion
| Date | Channel | Evidence source | Exposure type | Exposure | CTA conversions | Conversion rate | Cost | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-20 | Reddit | fixture cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |
## Decision
| Status | Date | Evidence | Decision | Decided by |
| --- | --- | --- | --- | --- |
| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |
## Founder Waiver
| Date | Founder | Reason | Residual risk accepted |
| --- | --- | --- | --- |
`;

export function register(h: Harness): void {
  let count = 0;
  const business = (test: (root: string, id: string) => void) => {
    const suffix = ++count,
      home = h.makeTempDir(`research-home-${suffix}`),
      root = path.join(h.makeTempDir(`research-root-${suffix}`), "business"),
      id = `research-${suffix}`;
    const oldHome = process.env.B2C_APP_BUILDER_HOME;
    process.env.B2C_APP_BUILDER_HOME = home;
    try {
      createBusiness({ workspaceId: id, directory: root, name: "Fixture research", hypothesis: "A complete consumer business" });
      test(root, id);
    } finally {
      if (oldHome === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = oldHome;
    }
  };
  h.check("Porchwatch F6: uncertain requests require readback and saved observations survive a fresh process", () =>
    business((root, id) => {
      const missing = lookupResearch({ workspaceId: id, query, maxAgeSeconds: 3600 });
      assert(missing.status === "needs_collection" && !missing.authorityGranted, "lookup invented a result or authority");
      const pending = recordResearch({
        workspaceId: id,
        expectedRevision: missing.revision,
        observation: { query, outcome: "pending", summary: "One approved fixture request is being dispatched." },
      });
      const uncertain = recordResearch({
        workspaceId: id,
        expectedRevision: pending.revision,
        observation: { query, outcome: "uncertain", summary: "The caller stopped before receiving the result.", providerRequestId: "fixture-request-1" },
      });
      assert(lookupResearch({ workspaceId: id, query, maxAgeSeconds: 3600 }).status === "needs_reconciliation", "uncertain request would be repeated");
      let rejected = false;
      try {
        recordResearch({
          workspaceId: id,
          expectedRevision: uncertain.revision,
          observation: { query, outcome: "pending", summary: "Retry", refreshReason: "Context restarted" },
        });
      } catch (error) {
        rejected = String(error).includes("research_readback_required");
      }
      assert(rejected, "context loss authorized duplicate paid work");
      const observed = recordResearch({
        workspaceId: id,
        expectedRevision: uncertain.revision,
        observation: {
          query,
          outcome: "observed",
          summary: "Saved fixture estimates and their uncertainty; not a live provider observation.",
          sourceRefs: ["fixture:category-estimates"],
          providerRequestId: "fixture-request-1",
          observedAt: new Date().toISOString(),
        },
      });
      const qfile = path.join(h.makeTempDir("research-cli"), "query.json");
      writeFileSync(qfile, JSON.stringify(query));
      const result = spawnSync(
        process.execPath,
        ["entrypoints/cli/b2c.mjs", "research-lookup", "--workspace", id, "--query", qfile, "--max-age", "3600", "--json"],
        { cwd: skillRoot, encoding: "utf8", env: process.env },
      );
      assert(result.status === 0, `fresh process lookup failed: ${result.stderr} ${result.stdout}`);
      const envelope = JSON.parse(result.stdout);
      assert(envelope.ok && envelope.data.status === "reusable" && envelope.data.observation.sha256 === observed.sha256, "resume did not retrieve saved bytes");
      const reordered = { ...query, parameters: { country: "US", category: "parcel-trackers" } };
      assert(researchQueryId(reordered) === observed.queryId, "object key order caused repeated collection");
      const plan = planBusiness({ workspaceId: id, maxConcurrency: 1 });
      assert(
        plan.resume?.researchQueries[0]?.outcome === "observed" && !plan.completion.deliveryAccepted,
        "resume lost query or accepted research as a business",
      );
    }),
  );
  h.check("Porchwatch F6/F7: checkpoint writes reject stale revisions, unknown targets, secrets and tampered results", () =>
    business((root, id) => {
      const before = workspaceRevision(root);
      const record = recordResearch({
        workspaceId: id,
        expectedRevision: before,
        observation: { query, outcome: "observed", summary: "Fixture observation", sourceRefs: ["fixture:one"], observedAt: "2026-01-01T00:00:00Z" },
      });
      assert(lookupResearch({ workspaceId: id, query, maxAgeSeconds: 1 }).status === "stale", "freshness not enforced");
      const stale = callPublicOperation("business.research.record", {
        workspaceId: id,
        expectedRevision: before,
        observation: { query, outcome: "pending", summary: "Requery", refreshReason: "Stale" },
      });
      assert(!stale.ok && stale.error.code === "STALE_PREVIEW", "stale checkpoint write accepted");
      const unknown = callPublicOperation("business.research.lookup", { workspaceId: "unregistered", query, maxAgeSeconds: 1 });
      assert(!unknown.ok && unknown.error.code === "UNKNOWN_WORKSPACE", "unregistered target read accepted");
      const secret = callPublicOperation("business.research.lookup", {
        workspaceId: id,
        query: { ...query, parameters: { apiKey: "fixture-do-not-retain" } },
        maxAgeSeconds: 1,
      });
      assert(!secret.ok && !JSON.stringify(secret).includes("fixture-do-not-retain"), "credential-shaped parameters accepted or echoed");
      const target = path.join(root, record.path);
      writeFileSync(target, readFileSync(target, "utf8").replace("Fixture observation", "Different observation"));
      let refused = false;
      try {
        lookupResearch({ workspaceId: id, query, maxAgeSeconds: 3600 });
      } catch {
        refused = true;
      }
      assert(refused, "tampered observation treated as cached evidence");
    }),
  );
  h.check("Porchwatch F6: interrupted temporary writes are not results and symlinked evidence is refused", () =>
    business((root, id) => {
      const dir = path.join(root, "strategy/research-evidence");
      mkdirSync(dir);
      writeFileSync(path.join(dir, `${"a".repeat(64)}-${"b".repeat(64)}.json.00000000-0000-0000-0000-000000000000.tmp`), "partial");
      assert(lookupResearch({ workspaceId: id, query, maxAgeSeconds: 3600 }).status === "needs_collection", "unfinished write became a result");
      const outside = path.join(h.makeTempDir("research-outside"), "observation.json");
      writeFileSync(outside, "{}");
      symlinkSync(outside, path.join(dir, `${"c".repeat(64)}-${"d".repeat(64)}.json`));
      let refused = false;
      try {
        lookupResearch({ workspaceId: id, query, maxAgeSeconds: 3600 });
      } catch {
        refused = true;
      }
      assert(refused, "evidence symlink followed");
    }),
  );
  h.check("Porchwatch F9: hypotheses are allowed but canonical production prices require actual offer evidence", () =>
    business((root) => {
      assert(validateProductPriceEvidence(root).length === 0, "research hypothesis prematurely requires a price approval");
      const product = path.join(root, "product.yaml");
      writeFileSync(product, `${readFileSync(product, "utf8")}\n  - id: price.annual\n    class_id: class.price\n    slots: {}\n`);
      assert(validateProductPriceEvidence(root).length > 0, "template offer accepted a production price");
      writeFileSync(path.join(root, "strategy/OFFER_TEST.md"), offer);
      assert(validateProductPriceEvidence(root).length === 0, "valid synthetic offer rejected");
      writeFileSync(path.join(root, "strategy/OFFER_TEST.md"), offer.replace("| founder |", "| Founder opening mandate |"));
      assert(validateProductPriceEvidence(root).length > 0, "general build mandate became exact pricing authority");
    }),
  );
  h.check("Porchwatch F9: shared offer validation rejects fabricated measurements and does not require live paid tests", () => {
    const accepted: Issue[] = [];
    validateOfferTest(offer, accepted, (name) => name === "founder");
    assert(accepted.length === 0, `offer fixture invalid: ${JSON.stringify(accepted)}`);
    const rejected: Issue[] = [];
    validateOfferTest(offer.replace("840 | 31 | 3.69%", "840 | 999 | 118.9%"), rejected, (name) => name === "founder");
    assert(rejected.length > 0, "impossible conversion evidence accepted");
  });
}
