import { cpSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { checkAcceptedUpstreams } from "../../../kernel/contribution/accepted-upstreams.js";
import { checkContribution } from "../../../kernel/contribution/check.js";
import { readContributionManifest, writeContributionManifest } from "../../../kernel/contribution/manifest-io.js";
import { loadUpstreams } from "../../../kernel/contribution/upstreams-load.js";
import { sourceRevisionChanges, upgradePlan } from "../../../kernel/contribution/upstreams.js";
import { summarizeReleaseBody, RELEASE_SUMMARY_MAX_CHARS } from "../../../kernel/contribution/github-metadata.js";
import { firstpartyNotices } from "../../../catalog/packs/firstparty-notices.js";
import { renderFirstpartyPackage } from "../../../catalog/packs/firstparty.js";
import { loadKnowledgePackages } from "../../../catalog/knowledge-packages.js";
import { validateExtension } from "../../../contracts/extensions/contract.js";
import type { ContributionManifest } from "../../../contracts/contribution/contract.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

/** Local source and contract proofs only. No upstream script, provider or network is executed. */
export function register(h: Harness): void {
  const root = path.join(skillRoot, "examples/contributions/official-provider-tooling");
  const now = () => new Date("2026-09-06T18:00:00Z");
  const original = readContributionManifest(root);
  const accepted = (): ContributionManifest => {
    const m = structuredClone(original);
    for (const unit of m.units) if (unit.disposition === "adapt") unit.status = "accepted";
    return m;
  };
  const check = (m: ContributionManifest) => checkAcceptedUpstreams(m, root, skillRoot);
  const refusal = (label: string, mutate: (m: ContributionManifest) => void, code: string): void => {
    h.check(`official upstreams: ${label}`, () => {
      const m = accepted();
      mutate(m);
      assert(
        check(m).some((issue) => issue.code === `contribution.${code}`),
        `Expected ${code}, got ${JSON.stringify(check(m))}`,
      );
    });
  };
  h.check("official upstreams: real proposal passes without executing setup", () => {
    const result = checkContribution(root, { skillRoot, now });
    assert(result.pass, JSON.stringify(result.issues));
  });
  h.check("official upstreams: accepted adaptation has exact sources and source-specific notices", () => {
    assert(check(accepted()).length === 0, JSON.stringify(check(accepted())));
  });
  refusal(
    "missing upstream blocks promotion",
    (m) => {
      delete m.sources[0]!.upstreamId;
    },
    "upstream_required",
  );
  refusal(
    "unrelated repository identity blocks promotion",
    (m) => {
      m.sources[0]!.canonicalUrl = "https://github.com/PostHog/wizard";
    },
    "upstream_identity_mismatch",
  );
  refusal(
    "removing canonical origin cannot bypass promotion",
    (m) => {
      delete m.sources[0]!.canonicalUrl;
    },
    "upstream_identity_mismatch",
  );
  refusal(
    "moving branch is not a reviewed baseline",
    (m) => {
      m.sources[0]!.revision = "main";
    },
    "upstream_baseline_mismatch",
  );
  refusal(
    "unmapped source blocks promotion",
    (m) => {
      m.sources[0]!.registrySourceId = "unmapped";
    },
    "upstream_source_mapping_missing",
  );
  refusal(
    "unverified rights block accepted adaptation",
    (m) => {
      m.sources[0]!.rights.status = "unverified";
    },
    "upstream_rights_unverified",
  );
  refusal(
    "missing derivation blocks promotion",
    (m) => {
      m.derivations = [];
    },
    "derivation_missing",
  );
  refusal(
    "another source cannot supply the notice",
    (m) => {
      m.notices[0]!.sourceId = "revenuecat-cli";
    },
    "notice_missing",
  );
  refusal(
    "wrong notice bytes cannot satisfy MIT",
    (m) => {
      m.notices[0]!.noticePath = "notices/posthog-wizard.txt";
    },
    "notice_mismatch",
  );
  refusal(
    "notice traversal refuses",
    (m) => {
      m.notices[0]!.noticePath = "../../LICENSE";
    },
    "notice_unreadable",
  );
  h.check("official upstreams: symlink notice refuses", () => {
    const copy = h.makeTempDir("official-notice-symlink");
    cpSync(root, copy, { recursive: true });
    const file = path.join(copy, "notices/revenuecat-ai-toolkit.txt");
    unlinkSync(file);
    symlinkSync(path.join(root, "notices/revenuecat-ai-toolkit.txt"), file);
    assert(
      checkAcceptedUpstreams(accepted(), copy, skillRoot).some((issue) => issue.code === "contribution.notice_unreadable"),
      "symlink accepted",
    );
  });
  h.check("official upstreams: unrelated notice also fails the public contribution check", () => {
    const copy = h.makeTempDir("official-public-check");
    cpSync(root, copy, { recursive: true });
    const m = accepted();
    m.notices[0]!.sourceId = "revenuecat-cli";
    writeContributionManifest(copy, m);
    assert(!checkContribution(copy, { skillRoot, now }).pass, "public check ignored promotion gate");
  });
  h.check("official upstreams: acknowledgment is required only on actual adoption", () => {
    const copy = h.makeTempDir("official-metadata");
    cpSync(path.join(skillRoot, "catalog"), path.join(copy, "catalog"), { recursive: true });
    const file = path.join(copy, "catalog/upstreams/revenuecat-ai-toolkit.yaml");
    const raw = YAML.parse(readFileSync(file, "utf8"));
    raw.credits.acknowledge = false;
    writeFileSync(file, YAML.stringify(raw));
    assert(
      checkAcceptedUpstreams(accepted(), root, copy).some((issue) => issue.code === "contribution.upstream_credit_missing"),
      "missing credits accepted",
    );
    const held = loadUpstreams(skillRoot).upstreams.find((row) => row.manifest.id === "posthog-context-mill")!;
    assert(!held.manifest.credits.acknowledge && held.manifest.review.status === "deferred", "unadopted project falsely credited");
    assert(!original.derivations.some((row) => row.sourceIds.includes("posthog-context-mill")), "unlicensed content imported");
  });
  h.check("official upstreams: release notes retain dash bullets and prose with bounded output", () => {
    const summary = summarizeReleaseBody("## Changes\n- Fix identity handling\n* Add events\nConsent behavior changed.\n" + "- detail\n".repeat(1000));
    assert(summary.includes("identity") && summary.includes("Consent behavior"), "release notes lost meaningful text");
    assert(summary.length <= RELEASE_SUMMARY_MAX_CHARS && summary.includes("omitted"), "summary cap or disclosure failed");
  });
  h.check("official upstreams: source drift surfaces without a new release", () => {
    const row = loadUpstreams(skillRoot).upstreams.find((entry) => entry.manifest.id === "revenuecat-ai-toolkit")!;
    const observation = structuredClone(row.observation!);
    observation.branchHead!.sha = "a".repeat(40);
    observation.releasesSinceBaseline = [];
    const changes = sourceRevisionChanges(observation, row.manifest);
    assert(
      changes.length > 0 && changes.every((item) => item.maintainerDecision === "pending" && item.classification === "unknown-impact"),
      "source change hidden or adopted",
    );
    assert(sourceRevisionChanges(row.observation!, row.manifest).length === 0, "unchanged baseline reports drift");
    const before = readFileSync(path.join(skillRoot, row.manifestPath), "utf8");
    const plan = upgradePlan({ skillRoot, now }, { upstreamId: row.manifest.id, candidate: row.observation!.branchHead!.sha });
    assert(
      plan.effectsUnchanged && !plan.written && plan.retainedAdaptations.some((a) => a.id === "identity-docs-over-skill"),
      "upgrade lost boundary or correction",
    );
    assert(before === readFileSync(path.join(skillRoot, row.manifestPath), "utf8"), "read-only plan changed baseline");
  });
  h.check("official upstreams: required notices travel with actual package resources", () => {
    const files = renderFirstpartyPackage(skillRoot);
    const prefix = "catalog/generated/firstparty/";
    const extension = validateExtension(YAML.parse(files[prefix + "extension.yaml"]!.toString()));
    for (const upstreamId of ["revenuecat-ai-toolkit", "revenuecat-cli", "posthog-wizard"]) {
      const notice = extension.thirdParty?.find((row) => row.id === `b2c/notice-${upstreamId}`);
      assert(notice && notice.covers.length === 1, `missing notice coverage for ${upstreamId}`);
      const resource = extension.resources.find((row) => row.id === notice.notice)!;
      assert(
        resource.kind === "notice" && files[prefix + resource.path]!.equals(readFileSync(path.join(skillRoot, resource.path))),
        "notice bytes changed during packaging",
      );
    }
    assert(!extension.thirdParty?.some((row) => row.project.includes("context mill")), "unadopted source entered package");
  });
  h.check("official upstreams: missing upstream notice mapping blocks package rendering", () => {
    const refs = loadKnowledgePackages(skillRoot).filter((row) => row.id === "reference.money.revenuecat-agent-tooling");
    const copy = structuredClone(refs);
    copy[0]!.derivations![0]!.notice = "LICENSE";
    let failed = false;
    try {
      firstpartyNotices(skillRoot, copy, []);
    } catch {
      failed = true;
    }
    assert(failed, "notice mapping bypassed");
  });
  h.check("official upstreams: guides route only to relevant provider work", () => {
    const references = loadKnowledgePackages(skillRoot);
    for (const id of ["reference.money.revenuecat-agent-tooling", "reference.data.posthog-agent-tooling"]) {
      const reference = references.find((row) => row.id === id)!;
      assert(reference.contextPackIds.length === 0, "provider procedures injected into a shared context pack");
      assert(!reference.workflowIds.includes("workflow.research.research-backed-spec"), "provider setup injected into opportunity research");
    }
    const posthog = readFileSync(path.join(skillRoot, "knowledge/data/posthog-agent-tooling.md"), "utf8");
    const rc = readFileSync(path.join(skillRoot, "knowledge/money/revenuecat-agent-tooling.md"), "utf8");
    assert(posthog.includes("source upload") && posthog.includes("consent"), "setup disclosure guidance absent");
    assert(rc.includes("conditional") && rc.includes("logIn"), "upstream identity conflict not resolved");
  });
}
