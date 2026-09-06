import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { contextPacks } from "../../../catalog/context-packs.js";
import { domains } from "../../../catalog/domains.js";
import { loadKnowledgePackages } from "../../../catalog/knowledge-packages.js";
import { validateKnowledgePackages } from "../../../catalog/knowledge-validation.js";
import { operators } from "../../../catalog/operators.js";
import { parsePackYaml } from "../../../catalog/packs/load.js";
import { roles } from "../../../catalog/roles.js";
import type { CatalogKnowledgeDerivation, CatalogKnowledgePackage, CatalogKnowledgeSource } from "../../../catalog/types.js";
import { workflows } from "../../../catalog/workflows/index.js";
import { loadPinnedKnowledgeFreshnessNow } from "../../../tooling/lib/knowledge-freshness-pin.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

/**
 * Provenance and derivation rules for knowledge manifests (ADR-0005): a derivation names sources
 * the package declares, copied material keeps a retained notice, and adapted or copied material
 * needs rights evidence that permits it. Every package here is a labeled synthetic fixture on a
 * reserved `.invalid` host, validated against the real catalog domains, workflows, context packs,
 * roles, and operators, so the only variable in each case is the provenance under test. The
 * real-root cases at the end lock the committed Rork manifest to real files and real digests.
 */
const subscribers = [...roles, ...operators];
/** Inside every fixture source's review cadence, so cadence never adds an issue of its own. */
const now = new Date("2026-08-20T00:00:00Z");
const DOCUMENT_PATH = "knowledge/store/fixture-derivations.md";
const NOTICE_PATH = "catalog/upstreams/notices/fixture-derivations.txt";
const NOTICE_TEXT = "MIT License\n\nCopyright (c) 2026 Fixture Author\n";
const REAL_PACKAGE_ID = "reference.store.app-store-connect-cli";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const sameCodes = (actual: readonly string[], expected: readonly string[]): boolean => [...actual].sort().join(",") === [...expected].sort().join(",");
const sameList = (actual: readonly string[] | undefined, expected: readonly string[]): boolean => JSON.stringify(actual) === JSON.stringify(expected);

function source(overrides: Partial<CatalogKnowledgeSource> = {}): CatalogKnowledgeSource {
  return {
    id: "fixture-upstream",
    name: "fixture.example.invalid",
    sourceType: "github",
    url: "https://fixture.example.invalid/upstream",
    reviewCadenceDays: 7,
    claimScope: "Synthetic fixture material.",
    lastReviewDate: "2026-08-18",
    reviewer: "fixture",
    rights: { status: "verified", spdx: "MIT", evidence: NOTICE_PATH },
    ...overrides,
  };
}

function derivation(overrides: Partial<CatalogKnowledgeDerivation> = {}): CatalogKnowledgeDerivation {
  return {
    sourceIds: ["fixture-upstream"],
    relationship: "adapted",
    rationale: "Synthetic fixture derivation.",
    reviewer: "fixture",
    reviewedAt: "2026-08-18",
    ...overrides,
  };
}

function knowledge(overrides: Partial<CatalogKnowledgePackage> = {}): CatalogKnowledgePackage {
  return {
    id: "reference.store.fixture-derivations",
    title: "Fixture derivations",
    domainId: "domain.store",
    path: DOCUMENT_PATH,
    loadWhen: "during derivation fixture work only",
    lifecycle: "active",
    sources: [source()],
    derivations: [derivation()],
    replacementIds: [],
    workflowIds: ["workflow.store.asc-cli-automation"],
    contextPackIds: [],
    manifestPath: "catalog/knowledge/store/fixture-derivations.yaml",
    ...overrides,
  };
}

function writeFile(root: string, relative: string, content: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/** A skill root holding the fixture document, so knowledge.document.missing never fires, and optionally the notice. */
function fixtureRoot(harness: Harness, name: string, options: { notice: boolean }): string {
  const root = harness.makeTempDir(`knowledge-derivations-${name}`);
  writeFile(root, DOCUMENT_PATH, "# Fixture derivations\n\nSynthetic document.\n");
  if (options.notice) writeFile(root, NOTICE_PATH, NOTICE_TEXT);
  return root;
}

function codes(root: string, packages: CatalogKnowledgePackage[]): string[] {
  return validateKnowledgePackages(packages, root, domains, workflows, contextPacks, subscribers, now).map((issue) => issue.code);
}

function provenanceCodes(root: string, packages: CatalogKnowledgePackage[]): string[] {
  return codes(root, packages).filter((code) => code.startsWith("knowledge.derivation.") || code.startsWith("knowledge.source."));
}

function failureMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

/** The authored manifest shape that exercises every ADR-0005 field; `mutate` applies one defect. */
function authoredManifest(digest: string, mutate: (manifest: Record<string, unknown>) => void = () => undefined): string {
  const manifest: Record<string, unknown> = {
    schema_version: "1.0.0",
    id: "reference.store.fixture-derivations",
    title: "Fixture derivations",
    domain_id: "domain.store",
    document_path: DOCUMENT_PATH,
    load_when: "during derivation fixture work only",
    lifecycle: "active",
    bindings: { workflow_ids: ["workflow.store.asc-cli-automation"], context_pack_ids: [] },
    sources: [
      {
        id: "fixture-upstream",
        name: "fixture.example.invalid",
        source_type: "github",
        url: "https://fixture.example.invalid/upstream",
        review_cadence_days: 7,
        claim_scope: "Synthetic fixture material.",
        last_review_date: "2026-08-18",
        reviewer: "fixture",
        publisher: "Fixture Author (author); Fixture Org (maintainer)",
        revision: "v1.2.3 observed 2026-08-18",
        published_at: "2026-08-01",
        retrieved_at: "2026-08-18",
        rights: { status: "verified", spdx: "MIT", evidence: NOTICE_PATH, evidence_sha256: digest, notes: "Fixture notice." },
        selectors: ["README.md", "docs/usage.md"],
        upstream_id: "fixture-upstream",
      },
    ],
    derivations: [
      {
        relationship: "adapted",
        source_ids: ["fixture-upstream"],
        baseline: "v1.2.3 (2026-08-18)",
        selectors: ["README.md"],
        rationale: "Synthetic fixture derivation.",
        omissions: ["install hook", "remote fetch"],
        reviewer: "fixture",
        reviewed_at: "2026-08-18",
        evaluation: "fixture-suite",
        notice: NOTICE_PATH,
      },
    ],
  };
  mutate(manifest);
  return YAML.stringify(manifest);
}

function sourceOf(manifest: Record<string, unknown>): Record<string, unknown> {
  return (manifest.sources as Record<string, unknown>[])[0]!;
}

function derivationOf(manifest: Record<string, unknown>): Record<string, unknown> {
  return (manifest.derivations as Record<string, unknown>[])[0]!;
}

export function register(harness: Harness): void {
  harness.check("knowledge-derivations: an adapted derivation over a verified source on an otherwise valid package produces no issues", () => {
    const root = fixtureRoot(harness, "control", { notice: false });
    const result = codes(root, [knowledge()]);
    assert(result.length === 0, `control package produced issues: ${result.join(", ")}`);
  });

  harness.check("knowledge-derivations: copied material without a notice fails copied_without_notice", () => {
    const root = fixtureRoot(harness, "copied-no-notice", { notice: true });
    const result = provenanceCodes(root, [knowledge({ derivations: [derivation({ relationship: "copied" })] })]);
    assert(sameCodes(result, ["knowledge.derivation.copied_without_notice"]), `expected copied_without_notice only, got ${result.join(", ") || "nothing"}`);
  });

  harness.check("knowledge-derivations: copied material naming a notice path that does not exist fails notice_missing", () => {
    const root = fixtureRoot(harness, "copied-absent-notice", { notice: false });
    const result = provenanceCodes(root, [knowledge({ derivations: [derivation({ relationship: "copied", notice: NOTICE_PATH })] })]);
    assert(sameCodes(result, ["knowledge.derivation.notice_missing"]), `expected notice_missing only, got ${result.join(", ") || "nothing"}`);
    const present = provenanceCodes(fixtureRoot(harness, "copied-present-notice", { notice: true }), [
      knowledge({ derivations: [derivation({ relationship: "copied", notice: NOTICE_PATH })] }),
    ]);
    assert(present.length === 0, `the same derivation with the notice on disk must pass, got ${present.join(", ")}`);
  });

  harness.check("knowledge-derivations: copied material with a retained notice but unknown source rights fails rights_unverified", () => {
    const root = fixtureRoot(harness, "copied-unknown-rights", { notice: true });
    const result = provenanceCodes(root, [
      knowledge({ sources: [source({ rights: { status: "unknown" } })], derivations: [derivation({ relationship: "copied", notice: NOTICE_PATH })] }),
    ]);
    assert(sameCodes(result, ["knowledge.derivation.rights_unverified"]), `expected rights_unverified only, got ${result.join(", ") || "nothing"}`);
    const unverified = provenanceCodes(root, [
      knowledge({ sources: [source({ rights: { status: "unverified" } })], derivations: [derivation({ relationship: "copied", notice: NOTICE_PATH })] }),
    ]);
    assert(unverified.includes("knowledge.derivation.rights_unverified"), "an unverified status must not count as verified for copied material");
  });

  harness.check("knowledge-derivations: adapting material whose rights forbid redistribution fails rights_incompatible", () => {
    const root = fixtureRoot(harness, "adapted-not-redistributable", { notice: false });
    for (const status of ["not-redistributable", "incompatible"] as const) {
      const result = provenanceCodes(root, [knowledge({ sources: [source({ rights: { status } })] })]);
      assert(
        sameCodes(result, ["knowledge.derivation.rights_incompatible"]),
        `${status}: expected rights_incompatible only, got ${result.join(", ") || "nothing"}`,
      );
    }
  });

  harness.check("knowledge-derivations: adapting a source with no rights fails rights_unknown on an active package and passes on a draft", () => {
    const root = fixtureRoot(harness, "adapted-rights-unknown", { notice: false });
    const active = provenanceCodes(root, [knowledge({ sources: [source({ rights: undefined })] })]);
    assert(sameCodes(active, ["knowledge.derivation.rights_unknown"]), `active: expected rights_unknown only, got ${active.join(", ") || "nothing"}`);
    const unknownStatus = provenanceCodes(root, [knowledge({ sources: [source({ rights: { status: "unknown" } })] })]);
    assert(sameCodes(unknownStatus, ["knowledge.derivation.rights_unknown"]), `active with status unknown: got ${unknownStatus.join(", ") || "nothing"}`);
    const draft = provenanceCodes(root, [knowledge({ lifecycle: "draft", sources: [source({ rights: undefined })] })]);
    assert(draft.length === 0, `draft: expected no provenance issue, got ${draft.join(", ")}`);
  });

  harness.check("knowledge-derivations: an informed derivation over a source with unknown rights produces no derivation issue", () => {
    const root = fixtureRoot(harness, "informed-unknown-rights", { notice: false });
    const result = codes(root, [knowledge({ sources: [source({ rights: { status: "unknown" } })], derivations: [derivation({ relationship: "informed" })] })]);
    assert(result.length === 0, `expected no issues, got ${result.join(", ")}`);
    const withoutRights = codes(root, [knowledge({ sources: [source({ rights: undefined })], derivations: [derivation({ relationship: "informed" })] })]);
    assert(withoutRights.length === 0, `a source with no rights block must still pass for informed, got ${withoutRights.join(", ")}`);
  });

  harness.check("knowledge-derivations: a derivation naming a source the package does not declare fails source_unknown", () => {
    const root = fixtureRoot(harness, "source-unknown", { notice: false });
    const informed = provenanceCodes(root, [
      knowledge({ derivations: [derivation({ relationship: "informed", sourceIds: ["fixture-upstream", "absent-upstream"] })] }),
    ]);
    assert(sameCodes(informed, ["knowledge.derivation.source_unknown"]), `expected source_unknown only, got ${informed.join(", ") || "nothing"}`);
    const adapted = provenanceCodes(root, [knowledge({ derivations: [derivation({ sourceIds: ["absent-upstream"] })] })]);
    assert(
      adapted.includes("knowledge.derivation.source_unknown") && adapted.includes("knowledge.derivation.rights_unknown"),
      `an adapted derivation over an undeclared source has unknown rights too, got ${adapted.join(", ") || "nothing"}`,
    );
  });

  harness.check("knowledge-derivations: a package declaring the same source id twice fails source.duplicate", () => {
    const root = fixtureRoot(harness, "source-duplicate", { notice: false });
    const result = provenanceCodes(root, [knowledge({ sources: [source(), source({ name: "second listing" })] })]);
    assert(sameCodes(result, ["knowledge.source.duplicate"]), `expected source.duplicate only, got ${result.join(", ") || "nothing"}`);
  });

  harness.check("knowledge-derivations: loadKnowledgePackages round-trips every ADR-0005 field and rejects invalid rights and relationships", () => {
    const digest = sha256(NOTICE_TEXT);
    const validRoot = fixtureRoot(harness, "load-valid", { notice: true });
    writeFile(validRoot, "catalog/knowledge/store/fixture-derivations.yaml", authoredManifest(digest));
    const loaded = loadKnowledgePackages(validRoot);
    assert(loaded.length === 1 && loaded[0]?.id === "reference.store.fixture-derivations", `expected one fixture package, got ${loaded.length}`);
    const item = loaded[0]!;
    const first = item.sources[0];
    assert(first !== undefined, "the source was dropped");
    assert(first.publisher === "Fixture Author (author); Fixture Org (maintainer)", `publisher lost: ${String(first.publisher)}`);
    assert(first.revision === "v1.2.3 observed 2026-08-18", `revision lost: ${String(first.revision)}`);
    assert(first.publishedAt === "2026-08-01" && first.retrievedAt === "2026-08-18", `dates lost: ${String(first.publishedAt)} / ${String(first.retrievedAt)}`);
    assert(first.rights?.status === "verified" && first.rights.spdx === "MIT" && first.rights.evidence === NOTICE_PATH, "rights block lost");
    assert(first.rights.evidenceSha256 === digest, `evidence_sha256 lost: ${String(first.rights.evidenceSha256)}`);
    assert(first.rights.notes === "Fixture notice.", "rights.notes lost");
    assert(sameList(first.selectors, ["README.md", "docs/usage.md"]), `selectors lost: ${JSON.stringify(first.selectors)}`);
    assert(first.upstreamId === "fixture-upstream", `upstream_id lost: ${String(first.upstreamId)}`);
    const adapted = item.derivations?.[0];
    assert(adapted !== undefined && item.derivations?.length === 1, "the derivation was dropped");
    assert(adapted.relationship === "adapted" && sameList(adapted.sourceIds, ["fixture-upstream"]), "derivation identity lost");
    assert(sameList(adapted.omissions, ["install hook", "remote fetch"]), `omissions lost: ${JSON.stringify(adapted.omissions)}`);
    assert(adapted.baseline === "v1.2.3 (2026-08-18)" && sameList(adapted.selectors, ["README.md"]), "baseline or selectors lost");
    assert(adapted.reviewer === "fixture" && adapted.reviewedAt === "2026-08-18", "reviewer or reviewed_at lost");
    assert(adapted.evaluation === "fixture-suite" && adapted.notice === NOTICE_PATH, "evaluation or notice lost");
    const validated = provenanceCodes(validRoot, loaded);
    assert(validated.length === 0, `the loaded manifest must validate cleanly, got ${validated.join(", ")}`);

    const rightsRoot = fixtureRoot(harness, "load-invalid-rights", { notice: true });
    const rightsManifest = path.join(rightsRoot, "catalog/knowledge/store/fixture-derivations.yaml");
    writeFile(
      rightsRoot,
      "catalog/knowledge/store/fixture-derivations.yaml",
      authoredManifest(digest, (manifest) => (sourceOf(manifest).rights = { status: "maybe" })),
    );
    const rightsMessage = failureMessage(() => loadKnowledgePackages(rightsRoot));
    assert(rightsMessage === `${rightsManifest}: sources[].rights.status is invalid.`, `unexpected rights.status refusal: ${rightsMessage || "none"}`);

    const relationshipRoot = fixtureRoot(harness, "load-invalid-relationship", { notice: true });
    const relationshipManifest = path.join(relationshipRoot, "catalog/knowledge/store/fixture-derivations.yaml");
    writeFile(
      relationshipRoot,
      "catalog/knowledge/store/fixture-derivations.yaml",
      authoredManifest(digest, (manifest) => (derivationOf(manifest).relationship = "plagiarized")),
    );
    const relationshipMessage = failureMessage(() => loadKnowledgePackages(relationshipRoot));
    assert(
      relationshipMessage === `${relationshipManifest}: derivations[].relationship is invalid.`,
      `unexpected relationship refusal: ${relationshipMessage || "none"}`,
    );

    const digestRoot = fixtureRoot(harness, "load-invalid-digest", { notice: true });
    writeFile(
      digestRoot,
      "catalog/knowledge/store/fixture-derivations.yaml",
      authoredManifest(digest, (manifest) => ((sourceOf(manifest).rights as Record<string, unknown>).evidence_sha256 = "sha256:not-a-digest")),
    );
    const digestMessage = failureMessage(() => loadKnowledgePackages(digestRoot));
    assert(digestMessage.endsWith(": sources[].rights.evidence_sha256 must be a sha256 hex digest."), `unexpected digest refusal: ${digestMessage || "none"}`);
  });

  harness.check("knowledge-derivations: the committed Rork package records an adapted derivation whose omissions and rights evidence are real", () => {
    const item = loadKnowledgePackages(skillRoot).find((candidate) => candidate.id === REAL_PACKAGE_ID);
    assert(item !== undefined, `${REAL_PACKAGE_ID} is not in the catalog`);
    assert(item.derivations?.length === 1, `expected one derivation, got ${item.derivations?.length ?? 0}`);
    const adapted = item.derivations[0]!;
    assert(adapted.relationship === "adapted", `expected relationship adapted, got ${adapted.relationship}`);
    assert(
      adapted.omissions?.includes("asc web agreements accept") === true,
      `omissions do not name the agreement acceptance: ${JSON.stringify(adapted.omissions)}`,
    );
    const declared = new Set(item.sources.map((entry) => entry.id));
    assert(
      adapted.sourceIds.length === 2 && adapted.sourceIds.every((id) => declared.has(id)),
      `derivation names undeclared sources: ${adapted.sourceIds.join(", ")}`,
    );
    assert(adapted.reviewer === "b2c-maintainers" && /^\d{4}-\d{2}-\d{2}$/u.test(adapted.reviewedAt), "the derivation review is unattributed or undated");
    for (const entry of item.sources) {
      assert(entry.publisher?.startsWith("Rudrank Riyam") === true, `${entry.id} does not credit the original author: ${String(entry.publisher)}`);
      assert(entry.rights?.status === "verified" && entry.rights.spdx === "MIT", `${entry.id} rights are not verified MIT`);
      assert(entry.rights.evidence !== undefined && entry.rights.evidenceSha256 !== undefined, `${entry.id} records no rights evidence`);
      const noticeFile = path.join(skillRoot, entry.rights.evidence);
      assert(existsSync(noticeFile), `${entry.id} rights evidence is not on disk: ${entry.rights.evidence}`);
      assert(sha256(readFileSync(noticeFile, "utf8")) === entry.rights.evidenceSha256, `${entry.id} evidence_sha256 does not match ${entry.rights.evidence}`);
      assert(
        entry.upstreamId !== undefined && existsSync(path.join(skillRoot, "catalog/upstreams", `${entry.upstreamId}.yaml`)),
        `${entry.id} names no upstream manifest`,
      );
      assert(entry.revision !== undefined && entry.retrievedAt === "2026-09-05", `${entry.id} lacks a revision or retrieval date`);
      assert(!/auto-discovered/iu.test(entry.claimScope), `${entry.id} still carries the placeholder claim scope`);
    }
    const issues = validateKnowledgePackages([item], skillRoot, domains, workflows, contextPacks, subscribers, loadPinnedKnowledgeFreshnessNow(skillRoot))
      .map((issue) => issue.code)
      .filter((code) => code.startsWith("knowledge.derivation.") || code.startsWith("knowledge.source."));
    assert(issues.length === 0, `the committed package raises provenance issues: ${issues.join(", ")}`);
  });

  harness.check("knowledge-derivations: parsePackYaml round-trips snake_case rights and derivations and refuses an unknown rights field", () => {
    const digest = sha256(NOTICE_TEXT);
    const reference = (rights: Record<string, unknown>): Record<string, unknown> => ({
      id: "reference.fixture-derivations",
      path: DOCUMENT_PATH,
      domain_id: "domain.store",
      title: "Fixture derivations",
      load_when: "during derivation fixture work only",
      sources: [
        {
          id: "fixture-upstream",
          name: "fixture.example.invalid",
          source_type: "github",
          url: "https://fixture.example.invalid/upstream",
          review_cadence_days: 7,
          claim_scope: "Synthetic fixture material.",
          last_review_date: "2026-08-18",
          reviewer: "fixture",
          publisher: "Fixture Author",
          revision: "v1.2.3",
          published_at: "2026-08-01",
          retrieved_at: "2026-08-18",
          rights,
          selectors: ["README.md"],
          upstream_id: "fixture-upstream",
        },
      ],
      derivations: [
        {
          source_ids: ["fixture-upstream"],
          relationship: "adapted",
          baseline: "v1.2.3",
          selectors: ["README.md"],
          rationale: "Synthetic fixture derivation.",
          omissions: ["install hook"],
          reviewer: "fixture",
          reviewed_at: "2026-08-18",
          evaluation: "fixture-suite",
          notice: NOTICE_PATH,
        },
      ],
    });
    const packYaml = (rights: Record<string, unknown>): string =>
      YAML.stringify({
        id: "business-pack.fixture-derivations",
        title: "Fixture derivations",
        version: "1.0.0",
        revision: "rev-1",
        references: [reference(rights)],
      });
    const pack = parsePackYaml(
      packYaml({ status: "verified", spdx: "MIT", evidence: NOTICE_PATH, evidence_sha256: digest, notes: "Fixture notice." }),
      "fixture-pack.yaml",
    );
    const parsed = pack.references[0];
    assert(parsed !== undefined && parsed.sources.length === 1, "the reference or its source was dropped");
    const first = parsed.sources[0]!;
    assert(
      first.rights?.status === "verified" && first.rights.evidenceSha256 === digest && first.rights.notes === "Fixture notice.",
      "rights did not reach camelCase",
    );
    assert(
      first.publishedAt === "2026-08-01" && first.retrievedAt === "2026-08-18" && first.upstreamId === "fixture-upstream",
      "provenance did not reach camelCase",
    );
    assert(
      first.publisher === "Fixture Author" && first.revision === "v1.2.3" && sameList(first.selectors, ["README.md"]),
      "publisher, revision, or selectors lost",
    );
    assert(!("evidence_sha256" in first.rights) && !("upstream_id" in first) && !("retrieved_at" in first), "snake_case keys leaked into the parsed source");
    const parsedDerivation = parsed.derivations?.[0];
    assert(parsedDerivation !== undefined && parsed.derivations?.length === 1, "the derivation was dropped");
    assert(
      sameList(parsedDerivation.sourceIds, ["fixture-upstream"]) && parsedDerivation.relationship === "adapted",
      "derivation identity did not reach camelCase",
    );
    assert(parsedDerivation.reviewedAt === "2026-08-18" && sameList(parsedDerivation.omissions, ["install hook"]), "reviewed_at or omissions lost");
    assert(
      parsedDerivation.evaluation === "fixture-suite" && parsedDerivation.notice === NOTICE_PATH && parsedDerivation.baseline === "v1.2.3",
      "evaluation, notice, or baseline lost",
    );
    assert(!("source_ids" in parsedDerivation) && !("reviewed_at" in parsedDerivation), "snake_case keys leaked into the parsed derivation");

    const unknownField = failureMessage(() => parsePackYaml(packYaml({ status: "verified", licence: "MIT" }), "fixture-pack.yaml"));
    assert(unknownField.includes('unknown field "licence"'), `an unknown rights field must fail before normalization, got ${unknownField || "no refusal"}`);
    const badStatus = failureMessage(() => parsePackYaml(packYaml({ status: "maybe" }), "fixture-pack.yaml"));
    assert(
      badStatus.includes("expected verified | unverified | unknown | incompatible | not-redistributable | not-applicable"),
      `unexpected status refusal: ${badStatus || "none"}`,
    );
  });
}
