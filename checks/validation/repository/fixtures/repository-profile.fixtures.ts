import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { REPOSITORY_PROFILE_REVISION, repositoryProfileIds } from "../../../../catalog/repository-profiles/types.js";
import { writeCompleteAiProviderControls } from "./_builders-ops.js";
import { skillRoot, type Harness, readState, writeState } from "./_harness.js";

const GATE = "check-repository-profile.ts";

function acceptProfile(root: string, id: (typeof repositoryProfileIds)[number]): void {
  const state = readState(root);
  const project = state.project as Record<string, unknown>;
  project.repositoryProfile = {
    id,
    revision: REPOSITORY_PROFILE_REVISION,
    acceptedAt: "2026-08-24T00:00:00.000Z",
  };
  writeState(root, state);
}

function writeOverlay(root: string, body: Record<string, unknown>): void {
  mkdirSync(path.join(root, "state"), { recursive: true });
  writeFileSync(path.join(root, "state/repository-profile.yaml"), stringifyYaml(body), "utf8");
}

function writeCommunityFrontDoor(root: string): void {
  writeFileSync(path.join(root, "CONTRIBUTING.md"), "# Contributing\n\nOpen a pull request.\n", "utf8");
  mkdirSync(path.join(root, ".github"), { recursive: true });
  writeFileSync(path.join(root, ".github/SECURITY.md"), "# Security\n\nReport issues to security@example.com.\n", "utf8");
  writeFileSync(path.join(root, ".github/CODE_OF_CONDUCT.md"), "# Code Of Conduct\n\nBe respectful.\n", "utf8");
}

function writeNamedNotApplicablePaidGeneration(root: string): void {
  mkdirSync(path.join(root, "trust"), { recursive: true });
  writeFileSync(
    path.join(root, "trust/AI_PROVIDER_CONTROLS.md"),
    "# AI Provider Controls\n\nPaid generation: not applicable — on-device models with no provider API\n",
    "utf8",
  );
}

function appendPaidProviderEvidence(root: string): void {
  const specPath = path.join(root, "PRODUCT.md");
  writeFileSync(specPath, `${readFileSync(specPath, "utf8")}\nThe product calls the OpenAI Responses API for paid generation.\n`, "utf8");
}

export function register(harness: Harness): void {
  const run = (label: string, root: string, expectedCode: number, expectedText?: string, extraArgs: string[] = [], forbiddenText?: string): void => {
    harness.runFixture(label, root, GATE, expectedCode, expectedText, extraArgs, undefined, forbiddenText);
  };

  {
    const root = harness.makeFixture("repository-profile-default-routing");
    run("repository-profile without an explicit profile uses default routing", root, 0, "0 error(s)");
  }

  for (const id of repositoryProfileIds) {
    const root = harness.makeFixture(`repository-profile-${id}`);
    acceptProfile(root, id);
    if (id === "public-package") writeCommunityFrontDoor(root);
    run(`repository-profile ${id} compiles`, root, 0, "0 error(s)");
  }

  {
    const root = harness.makeFixture("repository-profile-write-inventory");
    acceptProfile(root, "founder-operating");
    run("repository-profile writes the generated inventory", root, 0, "0 error(s)", ["--write"]);
  }

  {
    const root = harness.makeFixture("repository-profile-founder-no-community");
    acceptProfile(root, "founder-operating");
    run("repository-profile founder-operating does not require community files", root, 0, "0 error(s)");
  }

  {
    const root = harness.makeFixture("repository-profile-public-missing-front-door");
    acceptProfile(root, "public-package");
    run("repository-profile public-package missing community files fails", root, 1, "repository_profile.front_door_missing");
  }

  {
    const root = harness.makeFixture("repository-profile-missing-canonical");
    acceptProfile(root, "app-source");
    rmSync(path.join(root, "PRODUCT.md"), { force: true });
    run("repository-profile fails when a required canonical artifact is missing", root, 1, "repository_profile.canonical_missing");
  }

  {
    const root = harness.makeEmptyFixture("repository-profile-overlay-missing-canonical");
    writeOverlay(root, {
      id: "founder-operating",
      revision: REPOSITORY_PROFILE_REVISION,
      acceptedAt: "2026-08-24T00:00:00.000Z",
    });
    run("repository-profile overlay-only founder-operating misses business-state.json", root, 1, "repository_profile.canonical_missing");
  }

  {
    const root = harness.makeFixture("repository-profile-suppression");
    acceptProfile(root, "founder-operating");
    writeOverlay(root, {
      id: "founder-operating",
      revision: REPOSITORY_PROFILE_REVISION,
      acceptedAt: "2026-08-24T00:00:00.000Z",
      suppress_gates: ["check:privacy"],
    });
    run("repository-profile fails when a profile suppresses a safety gate", root, 1, "repository_profile.safety_suppressed");
  }

  {
    const root = harness.makeFixture("repository-profile-generated-as-source");
    acceptProfile(root, "app-source");
    writeOverlay(root, {
      id: "app-source",
      revision: REPOSITORY_PROFILE_REVISION,
      acceptedAt: "2026-08-24T00:00:00.000Z",
      canonical_paths: ["state/generated/requirement-inventory.json"],
    });
    run("repository-profile fails when a generated projection is listed as source", root, 1, "repository_profile.generated_as_source");
  }

  {
    const root = harness.makeEmptyFixture("repository-profile-unknown-id");
    writeOverlay(root, { id: "private-lab", revision: REPOSITORY_PROFILE_REVISION, acceptedAt: "2026-08-24T00:00:00.000Z" });
    run("repository-profile fails on an unknown profile id", root, 1, "repository_profile.unknown_id");
  }

  {
    const root = harness.makeFixture("repository-profile-revision-stale");
    acceptProfile(root, "founder-operating");
    const state = readState(root);
    (state.project as Record<string, unknown>).repositoryProfile = {
      id: "founder-operating",
      revision: "rev-stale",
      acceptedAt: "2026-08-24T00:00:00.000Z",
    };
    writeState(root, state);
    run("repository-profile fails on a stale revision", root, 1, "repository_profile.revision_stale");
  }

  {
    const root = harness.makeFixture("repository-profile-id-conflict");
    acceptProfile(root, "founder-operating");
    writeOverlay(root, {
      id: "app-source",
      revision: REPOSITORY_PROFILE_REVISION,
      acceptedAt: "2026-08-24T00:00:00.000Z",
    });
    run("repository-profile fails when overlay and project ids conflict", root, 1, "repository_profile.id_conflict");
  }

  {
    const root = harness.makeFixture("repository-profile-paid-ai-pack-missing");
    writeCompleteAiProviderControls(root);
    run("repository-profile fails when paid AI is active without the control pack", root, 1, "repository_profile.paid_ai_pack_missing");
  }

  {
    const root = harness.makeFixture("repository-profile-paid-ai-pack-pinned");
    writeCompleteAiProviderControls(root);
    writeOverlay(root, { composition_packs: ["capability.paid-generative-ai"] });
    run("repository-profile passes when paid AI is pinned to the control pack", root, 0, "0 error(s)");
  }

  {
    const root = harness.makeFixture("repository-profile-paid-ai-unanchored-not-applicable");
    writeCompleteAiProviderControls(root);
    writeFileSync(
      path.join(root, "trust/AI_PROVIDER_CONTROLS.md"),
      `${readFileSync(path.join(root, "trust/AI_PROVIDER_CONTROLS.md"), "utf8")}\nThe feature paid generation: not applicable in some regions.\n`,
      "utf8",
    );
    run("repository-profile does not skip the paid-AI pack on an unanchored not-applicable phrase", root, 1, "repository_profile.paid_ai_pack_missing");
  }

  {
    const root = harness.makeFixture("repository-profile-paid-ai-not-applicable-with-evidence");
    writeNamedNotApplicablePaidGeneration(root);
    appendPaidProviderEvidence(root);
    run("repository-profile fails when product evidence overrides a named not-applicable line", root, 1, "repository_profile.paid_ai_pack_missing");
  }

  {
    const root = harness.makeFixture("repository-profile-paid-ai-not-applicable-named-skip");
    writeNamedNotApplicablePaidGeneration(root);
    run("repository-profile passes a named not-applicable paid-generation skip without product evidence", root, 0, "0 error(s)");
  }

  {
    const root = harness.makeFixture("repository-profile-overlay-invalid-yaml");
    writeFileSync(
      path.join(root, "state/repository-profile.yaml"),
      ["- id: public-package", `  revision: ${REPOSITORY_PROFILE_REVISION}`, '  acceptedAt: "2026-08-24T00:00:00.000Z"', ""].join("\n"),
      "utf8",
    );
    run("repository-profile fails when overlay YAML is not a mapping", root, 1, "repository_profile.overlay_invalid", [], "front_door_missing");
  }

  {
    const root = harness.makeFixture("repository-profile-acceptance-incomplete");
    writeOverlay(root, { id: "public-package" });
    run(
      "repository-profile does not activate a profile from an incomplete overlay",
      root,
      1,
      "repository_profile.acceptance_incomplete",
      [],
      "front_door_missing",
    );
  }

  {
    const root = harness.makeEmptyFixture("no-slop-founder-operating-front-door");
    const repoRoot = path.join(root, "repo");
    const fixtureSkillRoot = path.join(repoRoot, "skill", "pkg");
    mkdirSync(path.join(fixtureSkillRoot, "knowledge", "words"), { recursive: true });
    mkdirSync(path.join(repoRoot, "state"), { recursive: true });
    writeFileSync(path.join(repoRoot, "README.md"), "# Example\n\nA plain description of what this project does.\n", "utf8");
    writeFileSync(path.join(repoRoot, "AGENTS.md"), "# Agents\n\nFollow the repository conventions documented here.\n", "utf8");
    writeFileSync(path.join(repoRoot, "CLAUDE.md"), "# Claude Instructions\n\nFollow the repository conventions documented here.\n", "utf8");
    writeFileSync(
      path.join(repoRoot, "state/business-state.json"),
      JSON.stringify({
        schemaVersion: "2.0.0",
        project: {
          repositoryProfile: {
            id: "founder-operating",
            revision: REPOSITORY_PROFILE_REVISION,
            acceptedAt: "2026-08-24T00:00:00.000Z",
          },
        },
      }),
      "utf8",
    );
    cpSync(path.join(skillRoot, "knowledge/words/no-slop-writing.md"), path.join(fixtureSkillRoot, "knowledge/words/no-slop-writing.md"));
    harness.runScriptArgs(
      "no-slop skips public community files for founder-operating",
      "check-no-slop.ts",
      ["--repo-root", repoRoot, "--skill-root", fixtureSkillRoot],
      0,
    );
  }
}
