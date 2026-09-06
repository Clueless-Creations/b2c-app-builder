import { createHash } from "node:crypto";
import { cpSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadKnowledgePackages } from "../../../catalog/knowledge-packages.js";
import { renderFirstpartyPackage } from "../../../catalog/packs/firstparty.js";
import type { CatalogKnowledgePackage } from "../../../catalog/types.js";
import type { ContributionManifest } from "../../../contracts/contribution/contract.js";
import { validateExtension } from "../../../contracts/extensions/contract.js";
import { checkAcceptedUpstreams } from "../../../kernel/contribution/accepted-upstreams.js";
import { checkContribution } from "../../../kernel/contribution/check.js";
import { readContributionManifest } from "../../../kernel/contribution/manifest-io.js";
import { loadUpstreams } from "../../../kernel/contribution/upstreams-load.js";
import { sourceRevisionChanges } from "../../../kernel/contribution/upstreams.js";
import { upstreamCoverage, renderUpstreamCoverage } from "../../../kernel/contribution/upstream-coverage.js";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import type { HostedKnowledgeBundle } from "../../../kernel/knowledge-service/types.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

/** Source/contract fixtures only. Never runs upstream setup, captures an app or contacts a provider. */
export function register(h: Harness): void {
  const ids = ["parth-app-store-screenshots", "eronred-aso-skills", "sentry-xcodebuildmcp", "sentry-snapshotpreviews", "evanbacon-serve-sim"];
  const root = path.join(skillRoot, "examples/contributions/screenshot-toolchain");
  const original = readContributionManifest(root);
  const loaded = loadUpstreams(skillRoot);
  const manifests = loaded.upstreams.map((entry) => entry.manifest);
  const refs = loadKnowledgePackages(skillRoot);
  const selected = manifests.filter((m) => ids.includes(m.id));
  const read = (file: string): string => readFileSync(path.join(skillRoot, file), "utf8");
  const ref = refs.find((r) => r.id === "reference.store.screenshot-toolchain")!;
  const check = (manifest: ContributionManifest, at = root) => checkAcceptedUpstreams(manifest, at, skillRoot);
  const mutation = (label: string, change: (manifest: ContributionManifest) => void, code: string): void => {
    h.check(`screenshot upstreams: ${label}`, () => {
      const m = structuredClone(original);
      change(m);
      assert(
        check(m).some((issue) => issue.code === `contribution.${code}`),
        JSON.stringify(check(m)),
      );
    });
  };
  h.check("screenshot upstreams: five real sources have exact baselines and no installed support claim", () => {
    assert(!loaded.issues.length && selected.length === ids.length, JSON.stringify(loaded.issues));
    for (const m of selected) {
      assert(/^[a-f0-9]{40}$/.test(m.baselines.reviewedSource!.revision), "mutable source baseline");
      assert(
        m.support.versions.every((v) => v.status === "untested"),
        "source review claimed executable support",
      );
      assert(!m.hostProbe && m.credits.acknowledge, "unexpected executable probe or missing credit");
      assert(
        m.relationships.every((r) => r.kind === "adapted-method"),
        "unperformed integration claimed",
      );
    }
  });
  h.check("screenshot upstreams: accepted contribution and derivations pass the public checker", () => {
    const result = checkContribution(root, { skillRoot, now: () => new Date("2026-09-06T19:00:00Z") });
    assert(result.pass, JSON.stringify(result.issues));
    assert(
      original.units.every((u) => u.status === "accepted"),
      "test did not exercise acceptance",
    );
    assert(check(original).length === 0, JSON.stringify(check(original)));
  });
  h.check("screenshot upstreams: every selected active source binding is traced", () => {
    const rows = upstreamCoverage(refs, manifests);
    const mapped = rows.filter((r) => ids.includes(r.upstreamId ?? ""));
    assert(mapped.length >= 10 && mapped.every((r) => r.status === "tracked"), JSON.stringify(mapped));
  });
  h.check("screenshot upstreams: original authors and non-MIT license are preserved", () => {
    assert(selected.find((m) => m.id === ids[0])!.copyright!.includes("Parth Jadhav"), "Parth credit lost");
    assert(selected.find((m) => m.id === ids[1])!.copyright!.includes("Erencan"), "Eronred credit lost");
    assert(selected.find((m) => m.id === ids[2])!.copyright!.includes("Cameron Cooke"), "Xcode author lost");
    assert(selected.find((m) => m.id === ids[3])!.copyright!.includes("Emerge Tools"), "Snapshot author lost");
    const serve = selected.find((m) => m.id === ids[4])!;
    assert(serve.license.spdx === "Apache-2.0" && serve.authors[0]!.name === "Evan Bacon", "Apache attribution changed");
    assert(serve.copyright!.includes("not stated"), "invented copyright line");
  });
  mutation(
    "Apache adoption needs its own notice",
    (m) => {
      m.notices = m.notices.filter((n) => n.sourceId !== ids[4]);
    },
    "notice_missing",
  );
  mutation(
    "Apache cannot be relabeled MIT",
    (m) => {
      m.notices.find((n) => n.sourceId === ids[4])!.spdx = "MIT";
    },
    "notice_mismatch",
  );
  mutation(
    "another project's notice cannot cover Apache guidance",
    (m) => {
      m.notices.find((n) => n.sourceId === ids[4])!.noticePath = m.notices[0]!.noticePath;
    },
    "notice_mismatch",
  );
  mutation(
    "missing immutable baseline blocks adoption",
    (m) => {
      m.sources[0]!.revision = "main";
    },
    "upstream_baseline_mismatch",
  );
  mutation(
    "missing upstream identity blocks actual adoption",
    (m) => {
      m.sources[0]!.upstreamId = "absent-screenshot-upstream";
    },
    "upstream_required",
  );
  mutation(
    "unmapped source blocks adoption",
    (m) => {
      m.sources[0]!.registrySourceId = "wrong-source";
    },
    "upstream_source_mapping_missing",
  );
  h.check("screenshot upstreams: changed Apache bytes and symlink notices fail", () => {
    const temp = h.makeTempDir("screenshot-notice-tamper");
    cpSync(root, temp, { recursive: true });
    const m = structuredClone(original);
    const notice = m.notices.find((n) => n.sourceId === ids[4])!;
    const file = path.join(temp, notice.noticePath);
    writeFileSync(file, "Not the retained upstream notice.\n");
    assert(
      check(m, temp).some((i) => i.code === "contribution.notice_mismatch"),
      "changed bytes accepted",
    );
    unlinkSync(file);
    symlinkSync(path.join(root, notice.noticePath), file);
    assert(
      check(m, temp).some((i) => i.code === "contribution.notice_unreadable"),
      "symlink accepted",
    );
  });
  h.check("screenshot upstreams: notices travel with all covered actual package resources", () => {
    const files = renderFirstpartyPackage(skillRoot);
    const prefix = "catalog/generated/firstparty/";
    const extension = validateExtension(YAML.parse(files[prefix + "extension.yaml"]!.toString()));
    for (const m of selected) {
      const notice = extension.thirdParty!.find((n) => n.id === `b2c/notice-${m.id}`)!;
      assert(notice && notice.license === m.license.spdx && notice.covers.length > 0, "missing source-specific package notice");
      const resource = extension.resources.find((r) => r.id === notice.notice)!;
      const bytes = files[prefix + resource.path]!;
      assert(createHash("sha256").update(bytes).digest("hex") === m.license.evidenceSha256, "package notice changed");
      for (const target of notice.covers) {
        const covered = extension.resources.find((r) => r.id === target)!;
        assert(covered.kind === "knowledge" && files[prefix + covered.path], "notice covers nonexistent resource");
      }
    }
    assert(!Object.keys(files).some((p) => /app-store-screenshots\/template|serve-sim-bin|PreviewGallery\.swift/.test(p)), "upstream implementation imported");
  });
  h.check("screenshot upstreams: exact source selectors and deliberate deviations remain visible", () => {
    assert(selected[0] !== undefined, "no selection");
    const parth = selected.find((m) => m.id === ids[0])!;
    assert(parth.relationships[0]!.upstreamPaths.includes("skills/app-store-screenshots/SKILL.md"), "incorrect root skill path");
    const body = read("knowledge/store/screenshot-toolchain.md");
    for (const text of ["connectedCanvas: false", "custom theme", "does not contain", "standalone exported crop", "does not freeze"])
      assert(body.includes(text), `missing adaptation ${text}`);
    assert(!body.includes("80%") && !body.includes("3-6 seconds"), "unverified performance claim imported");
  });
  h.check("screenshot upstreams: route stays bounded and separate from native capture", () => {
    assert(ref.workflowIds.length === 1 && ref.workflowIds[0] === "workflow.store.store-screenshots-production", "broad provider routing");
    assert(!ref.contextPackIds.length, "new global context injected");
    const service = createKnowledgeService(JSON.parse(read("catalog/generated/hosted-knowledge.json")) as HostedKnowledgeBundle);
    const route = service.workflow({ workflowId: ref.workflowIds[0]! });
    assert(route.workflow.referenceIds.includes(ref.id) && route.knowledgeBundle === null, "guide unavailable or eagerly pushed");
    assert(!service.workflow({ workflowId: "workflow.research.research-backed-spec" }).workflow.referenceIds.includes(ref.id), "editor guide in research");
    assert(!JSON.stringify(route).includes("Upstream source coverage"), "maintainer inventory leaked to worker");
  });
  h.check("screenshot upstreams: source-only upstream drift remains a review candidate", () => {
    const entry = loaded.upstreams.find((e) => e.manifest.id === ids[0])!;
    const observed = structuredClone(entry.observation!);
    observed.branchHead = { branch: "main", sha: "f".repeat(40), committedAt: "2026-09-06T19:00:00Z" };
    const before = JSON.stringify(entry.manifest);
    const changes = sourceRevisionChanges(observed, entry.manifest);
    assert(changes.length > 0 && changes.every((c) => c.maintainerDecision === "pending"), "drift hidden or auto-approved");
    assert(before === JSON.stringify(entry.manifest), "baseline changed during observation");
  });
  const sample = (): CatalogKnowledgePackage => {
    const clone = structuredClone(ref);
    clone.sources = [clone.sources[0]!];
    return clone;
  };
  h.check("upstream coverage: declared transfer aliases resolve without a duplicate upstream", () => {
    const snapshot = selected.find((m) => m.id === ids[3])!;
    const r = sample();
    r.sources = [
      {
        ...r.sources[0]!,
        url: "https://github.com/EmergeTools/SnapshotPreviews",
        upstreamId: snapshot.id,
        id: snapshot.sourceIds[0]!,
        revision: snapshot.baselines.reviewedSource!.revision,
      },
    ];
    const rows = upstreamCoverage([r], manifests);
    assert(rows.length === 1 && rows[0]!.status === "tracked" && rows[0]!.upstreamId === snapshot.id, JSON.stringify(rows));
  });
  h.check("upstream coverage: a new reference needs linkage, not automatic credit", () => {
    const r = sample();
    delete r.sources[0]!.upstreamId;
    const rows = upstreamCoverage([r], manifests);
    assert(rows[0]!.status === "needs-link", JSON.stringify(rows));
  });
  h.check("upstream coverage: untracked references are candidates only", () => {
    const r = sample();
    r.sources = [{ ...r.sources[0]!, url: "https://github.com/fixture/unreviewed", upstreamId: undefined }];
    const rows = upstreamCoverage([r], manifests);
    assert(rows[0]!.status === "untracked" && rows[0]!.upstreamId === null, JSON.stringify(rows));
    assert(renderUpstreamCoverage(rows).includes("does not infer adoption or permission"), "candidate scope hidden");
  });
  h.check("upstream coverage: false identities and ambiguous aliases are conflicts", () => {
    const r = sample();
    r.sources[0]!.upstreamId = ids[1];
    assert(upstreamCoverage([r], manifests)[0]!.status === "conflict", "identity mismatch hidden");
    const duplicate = structuredClone(selected[0]!);
    duplicate.id = "duplicate";
    assert(
      upstreamCoverage([ref], [...manifests, duplicate]).some((row) => row.status === "conflict"),
      "ambiguous owner hidden",
    );
  });
  h.check("upstream coverage: missing reviewed revision cannot look tracked", () => {
    const r = sample();
    r.sources[0]!.revision = "main";
    assert(upstreamCoverage([r], manifests)[0]!.status === "needs-link", "moving ref accepted");
  });
  h.check("upstream coverage: inactive, unbound, self and non-GitHub sources are excluded", () => {
    const inactive = sample();
    inactive.lifecycle = "draft";
    const unbound = sample();
    unbound.workflowIds = [];
    unbound.contextPackIds = [];
    const own = sample();
    own.sources = [{ ...own.sources[0]!, url: "https://github.com/Clueless-Creations/b2c-app-builder/blob/main/README.md" }];
    const other = sample();
    other.sources = [{ ...other.sources[0]!, url: "https://example.invalid/guide" }];
    assert(!upstreamCoverage([inactive, unbound, own, other], manifests, "git+https://github.com/Clueless-Creations/b2c-app-builder.git").length, "scope widened");
  });
  h.check("upstream coverage: rendered queue is deterministic and empty scope is honest", () => {
    const rows = upstreamCoverage(refs, manifests, "https://github.com/Clueless-Creations/b2c-app-builder");
    const reversed = upstreamCoverage([...refs].reverse(), [...manifests].reverse(), "https://github.com/Clueless-Creations/b2c-app-builder");
    assert(JSON.stringify(rows) === JSON.stringify(reversed), "ordering changed");
    assert(read("docs/upstreams/coverage-report.md") === renderUpstreamCoverage(rows), "committed queue stale");
    assert(renderUpstreamCoverage([]).includes("not proof that every dependency is tracked"), "empty scope certified whole system");
  });
}
