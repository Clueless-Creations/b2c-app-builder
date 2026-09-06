import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { type Harness, skillRoot } from "./_harness.js";

const GATE = "check-graph-foundations.ts";

function writeRegistry(root: string, principles: unknown[], vocabulary?: unknown): void {
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
  const run = (label: string, root: string, expectedCode: number, expectedText?: string, extra: string[] = []): void => {
    harness.runScriptArgs(label, GATE, ["--skill-root", root, ...extra], expectedCode, expectedText);
  };

  run("graph-foundations passes the shipped registry", skillRoot, 0, "0 error(s)");

  {
    const root = harness.makeEmptyFixture("graph-foundations-missing-fixture");
    writeRegistry(root, [
      samplePrinciple({
        enforcement: {
          command: "check:graph-foundations",
          guard: "ungrounded_belief",
          issue_code: "graph_foundations.ungrounded_belief",
        },
      }),
    ]);
    run("graph-foundations fails when a must-level principle has no negative fixture", root, 1, "graph_foundations.fixture_missing");
  }

  {
    const root = harness.makeEmptyFixture("graph-foundations-vacuous");
    writeRegistry(root, [
      samplePrinciple({
        id: "graph.fixture.vacuous",
        enforcement: {
          command: "check:graph-foundations",
          guard: "ungrounded_belief",
          issue_code: "graph_foundations.ungrounded_belief",
          negative_input: { kind: "belief", evidence: [{ source_id: "obs.1" }] },
        },
      }),
    ]);
    run("graph-foundations fails when the fixture never exercises the guard", root, 1, "graph_foundations.enforcement_vacuous");
  }

  {
    const root = harness.makeEmptyFixture("graph-foundations-duplicate");
    writeRegistry(root, [samplePrinciple(), samplePrinciple({ source_id: "graph_memory" })]);
    run("graph-foundations fails on a duplicate principle id", root, 1, "graph_foundations.duplicate_id");
  }

  {
    const root = harness.makeEmptyFixture("graph-foundations-unpinned");
    writeRegistry(root, [samplePrinciple({ source_commit: "HEAD" })]);
    run("graph-foundations fails on an unpinned source commit", root, 1, "graph_foundations.unpinned_commit");
  }

  run("graph-foundations fails an unapproved public term", skillRoot, 1, "graph_foundations.public_term_unapproved", [
    "--declare-public-term",
    "TotallyNewPublicType",
  ]);
  run("graph-foundations allows a provisional internal alias", skillRoot, 0, "0 error(s)", ["--declare-public-term", "operating.internal.occurrence"]);
}
