import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { evaluateGuard } from "../../../catalog/principles/guards.js";
import { loadPrinciples, loadVocabulary } from "../../../catalog/principles/load.js";
import { GUARD_KINDS, PRINCIPLE_SOURCE_IDS } from "../../../catalog/principles/types.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

function githubTree(ownerRepo: string, commit: string): string {
  return ["http", "s://github.com/", ownerRepo, "/tree/", commit].join("");
}

const CHECKER = "checks/validation/repository/check-graph-foundations.ts";

function writeMinimalRegistry(root: string, principles: unknown[], vocabulary?: unknown): void {
  mkdirSync(path.join(root, "catalog/principles"), { recursive: true });
  writeFileSync(path.join(root, "catalog/principles/principles.yaml"), stringifyYaml({ schema_version: 1, principles }), "utf8");
  writeFileSync(
    path.join(root, "catalog/principles/vocabulary.yaml"),
    stringifyYaml(
      vocabulary ?? {
        schema_version: 1,
        status: "approved",
        interview_date: "2026-08-22",
        chosen_terms: ["work order"],
        aliases: [{ from: "work-order occurrence", to: "work order" }],
        rejected_terms: ["semantic similarity router"],
        provisional_prefixes: ["operating.internal."],
        compatibility: ["Existing catalog IDs stay unchanged."],
      },
    ),
    "utf8",
  );
}

function samplePrinciple(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "graph.invariant.ungrounded_belief",
    source_id: "trendingai",
    source_repository: "TrendingAI",
    source_url: "https://github.com/Glitch-Cat-Club/TrendingAI/tree/51233873060a8835f9ac8055a710f65aa21d0b54",
    source_commit: "51233873060a8835f9ac8055a710f65aa21d0b54",
    source_anchor: "src/harvesters/orchestrator.ts",
    rule: "A belief-changing fact must cite source evidence.",
    strength: "must",
    owner: "operating-model",
    status: "active",
    enforcement: {
      command: "check:graph-foundations",
      guard: "ungrounded_belief",
      issue_code: "graph_foundations.ungrounded_belief",
      negative_input: { kind: "belief", evidence: [] },
    },
    review_condition: "source_commit_changed",
    exception_policy: "none",
    ...overrides,
  };
}

export function register(harness: Harness): void {
  harness.runScript("graph-foundations passes the shipped registry", CHECKER, ["--skill-root", skillRoot], 0, "0 error(s)");

  harness.check("principle registry is queryable and names all six sources", () => {
    const registry = loadPrinciples(skillRoot);
    const ids = new Set(registry.principles.map((principle) => principle.id));
    assert(ids.size === registry.principles.length, "principle ids must be unique");
    const sources = new Set(registry.principles.map((principle) => principle.source_id));
    for (const sourceId of PRINCIPLE_SOURCE_IDS) {
      assert(sources.has(sourceId), `missing source ${sourceId}`);
    }
    const byId = registry.principles.find((principle) => principle.id === "graph.invariant.ungrounded_belief");
    assert(byId !== undefined, "unconditional ungrounded-belief invariant is missing");
  });

  harness.check("vocabulary decision record unblocks the approved public terms", () => {
    const vocabulary = loadVocabulary(skillRoot);
    assert(vocabulary.status === "approved", `expected approved vocabulary, got ${vocabulary.status}`);
    assert(vocabulary.chosen_terms.includes("work order"), "work order must be an approved public term");
    assert(vocabulary.rejected_terms.includes("semantic similarity router"), "rejected terms must include semantic similarity router");
  });

  const registry = loadPrinciples(skillRoot);
  const mustPrinciples = registry.principles.filter((principle) => principle.strength === "must" && principle.status === "active");
  for (const principle of mustPrinciples) {
    harness.check(`${principle.id} negative input emits ${principle.enforcement.issue_code}`, () => {
      const issues = evaluateGuard(principle, principle.enforcement.negative_input);
      assert(
        issues.some((item) => item.code === principle.enforcement.issue_code),
        `${principle.id} did not emit ${principle.enforcement.issue_code}: ${issues.map((item) => item.code).join(", ") || "<none>"}`,
      );
    });
    harness.check(`${principle.id} is vacuous unless the named guard is what fails`, () => {
      const disabled = evaluateGuard(principle, principle.enforcement.negative_input, { disableGuard: true });
      assert(
        !disabled.some((item) => item.code === principle.enforcement.issue_code),
        `${principle.id} still emitted ${principle.enforcement.issue_code} after the guard was removed`,
      );
    });
  }

  {
    const root = harness.makeTempDir("foundations-missing-fixture");
    writeMinimalRegistry(root, [
      samplePrinciple({
        enforcement: {
          command: "check:graph-foundations",
          guard: "ungrounded_belief",
          issue_code: "graph_foundations.ungrounded_belief",
        },
      }),
    ]);
    harness.runScript("must-level principle without a negative fixture fails", CHECKER, ["--skill-root", root], 1, "graph_foundations.fixture_missing");
  }

  {
    const root = harness.makeTempDir("foundations-vacuous-guard");
    const principle = samplePrinciple({
      id: "graph.fixture.vacuous",
      enforcement: {
        command: "check:graph-foundations",
        guard: "ungrounded_belief",
        issue_code: "graph_foundations.ungrounded_belief",
        negative_input: { kind: "belief", evidence: [{ source_id: "obs.1" }] },
      },
    });
    writeMinimalRegistry(root, [principle]);
    harness.runScript("a fixture that never exercises the guard fails as vacuous", CHECKER, ["--skill-root", root], 1, "graph_foundations.enforcement_vacuous");
  }

  {
    const root = harness.makeTempDir("foundations-duplicate-id");
    writeMinimalRegistry(root, [samplePrinciple(), samplePrinciple({ source_id: "graph_memory" })]);
    harness.runScript("duplicate stable principle id fails compilation", CHECKER, ["--skill-root", root], 1, "graph_foundations.duplicate_id");
  }

  {
    const root = harness.makeTempDir("foundations-unpinned-commit");
    writeMinimalRegistry(root, [samplePrinciple({ source_commit: "HEAD" })]);
    harness.runScript("unpinned source commit fails compilation", CHECKER, ["--skill-root", root], 1, "graph_foundations.unpinned_commit");
  }

  {
    const root = harness.makeTempDir("foundations-source-review");
    writeMinimalRegistry(root, [
      samplePrinciple({
        source_commit: "a".repeat(40),
        source_url: githubTree("Glitch-Cat-Club/TrendingAI", "a".repeat(40)),
      }),
    ]);
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "checks/validation/repository/source-registry.yaml"),
      stringifyYaml({
        schema_version: 1,
        sources: [
          {
            id: "github-com-glitch-cat-club-trendingai-tree",
            url: "https://github.com/Glitch-Cat-Club/TrendingAI/tree/51233873060a8835f9ac8055a710f65aa21d0b54",
          },
        ],
      }),
      "utf8",
    );
    harness.runScript(
      "a changed upstream source marks review and does not fail the gate",
      CHECKER,
      ["--skill-root", root],
      0,
      "graph_foundations.source_review_required",
    );
  }

  {
    harness.runScript(
      "an unapproved public schema term fails the stability gate",
      CHECKER,
      ["--skill-root", skillRoot, "--declare-public-term", "TotallyNewPublicType"],
      1,
      "graph_foundations.public_term_unapproved",
    );
  }

  {
    harness.runScript(
      "a provisional internal alias remains allowed",
      CHECKER,
      ["--skill-root", skillRoot, "--declare-public-term", "operating.internal.occurrence"],
      0,
      "0 error(s)",
    );
  }

  harness.check("every must-level principle names an executable guard", () => {
    const kinds = new Set(GUARD_KINDS);
    for (const principle of mustPrinciples) {
      assert(kinds.has(principle.enforcement.guard), `${principle.id} names unknown guard ${principle.enforcement.guard}`);
    }
  });
}
