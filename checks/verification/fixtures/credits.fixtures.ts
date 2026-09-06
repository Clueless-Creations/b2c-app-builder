import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { UpstreamManifest } from "../../../contracts/contribution/contract.js";
import { renderUpstreamManifestYaml } from "../../../kernel/contribution/upstreams-load.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { assert, repoCheckoutPresent, skillRoot, type Harness } from "./_harness.js";

/**
 * Proof 16: ACKNOWLEDGMENTS.md, THIRD_PARTY_NOTICES.md, and docs/upstreams/support-report.md are
 * projections of catalog/upstreams, never independently maintained inventories. The renderer is
 * exercised as a child process, exactly the way `npm run render:credits` and `check:credits` run it.
 * Every manifest here is a labeled synthetic fixture on a reserved `.invalid` host; the real-root
 * cases at the end lock the committed projections to the real manifests.
 */
const tsxBin = resolveTsxBin(skillRoot);
const rendererPath = path.join(skillRoot, "tooling/render-credits.ts");

interface RunResult {
  readonly status: number | null;
  readonly output: string;
}

function runRenderer(root: string, ...args: string[]): RunResult {
  const result = spawnSync(tsxBin, [rendererPath, "--skill-root", root, ...args], { cwd: skillRoot, encoding: "utf8", timeout: 60000 });
  return { status: result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}` };
}

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const FIXTURE_NOTICE = [
  "Fixture Permissive License",
  "",
  "Copyright (c) 2026 Ada Fixture Author",
  "",
  "Permission is granted to the fixture suite only.",
  "",
].join("\n");

function syntheticManifest(overrides: Partial<UpstreamManifest> & Pick<UpstreamManifest, "id" | "project" | "credits" | "relationships">): UpstreamManifest {
  return {
    schemaVersion: 1,
    canonicalUrl: `https://git.example.invalid/fixtures/${overrides.id}`,
    aliases: [],
    transfers: [],
    authors: [{ name: "Ada Fixture Author", role: "original author and copyright holder (fixture)" }],
    maintainers: [],
    license: { spdx: "MIT", status: "verified", scope: "Root LICENSE of the fixture repository." },
    sourceIds: ["fixture-source"],
    baselines: {},
    support: { policy: "Fixture only. Nothing is supported.", versions: [], operations: [], unsupportedOperations: [], platforms: [] },
    adaptations: [],
    review: { owner: "fixture", cadenceDays: 30, lastReview: "2026-09-01", status: "current" },
    ...overrides,
  };
}

interface SeededRoot {
  readonly root: string;
  readonly manifests: readonly UpstreamManifest[];
}

/** Write a temp skill root holding the given manifests, plus the fixture notice text for every manifest that names a notice file. */
function seedSkillRoot(harness: Harness, name: string, manifests: readonly UpstreamManifest[]): SeededRoot {
  const root = harness.makeTempDir(name);
  mkdirSync(path.join(root, "catalog/upstreams/notices"), { recursive: true });
  mkdirSync(path.join(root, "catalog/upstreams/observations"), { recursive: true });
  for (const manifest of manifests) {
    if (manifest.license.noticeFile) {
      const noticePath = path.join(root, manifest.license.noticeFile);
      mkdirSync(path.dirname(noticePath), { recursive: true });
      writeFileSync(noticePath, FIXTURE_NOTICE, "utf8");
    }
    writeFileSync(path.join(root, `catalog/upstreams/${manifest.id}.yaml`), renderUpstreamManifestYaml(manifest), "utf8");
  }
  return { root, manifests };
}

function fencedTextBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```text\n([\s\S]*?)^```$/gmu)].map((match) => match[1] ?? "");
}

const read = (root: string, relative: string): string => readFileSync(path.join(root, relative), "utf8");

export function register(harness: Harness): void {
  const noticeFile = "catalog/upstreams/notices/fixture-runner.txt";
  const credited = syntheticManifest({
    id: "fixture-runner",
    project: "Fixture Runner CLI",
    copyright: "Copyright (c) 2026 Ada Fixture Author",
    maintainers: [{ name: "Fixture Org", role: "maintaining organization" }],
    license: { spdx: "MIT", status: "verified", evidenceSha256: sha256(FIXTURE_NOTICE), noticeFile, scope: "Root LICENSE of the fixture repository." },
    relationships: [
      {
        kind: "external-executable",
        consumption: "The fixture-runner executable on PATH runs synthetic store reads.",
        localOwners: ["adapters/fixture/runner.ts"],
        tests: ["checks/verification/fixtures/credits.fixtures.ts"],
        upstreamPaths: ["README.md"],
        pinAuthority: "PATH lookup at execution time",
      },
    ],
    support: {
      policy: "Fixture only.",
      versions: [{ range: "1.2.3", status: "supported", evidence: ["fixture"] }],
      operations: [],
      unsupportedOperations: [{ id: "fixture.delete", reason: "Destructive; never run from a fixture." }],
      platforms: [],
    },
    adaptations: [
      { id: "fixture-adaptation", description: "The fixture refuses every delete command.", owner: "adapters/fixture/runner.ts", intentional: true },
    ],
    credits: { acknowledge: true, use: "direct", summary: "Runs synthetic store reads for the credits fixture." },
  });
  const inspectedOnly = syntheticManifest({
    id: "fixture-inspected-only",
    project: "Inspected Only Reference Post",
    authors: [{ name: "Ines Inspected", role: "author of a post that was read and not adopted" }],
    license: { spdx: "unknown", status: "unknown" },
    relationships: [
      {
        kind: "adapted-method",
        consumption: "Read during intake; no unit was adopted from it.",
        localOwners: ["docs/guides/adopt-external-sources.md"],
        tests: [],
        upstreamPaths: [],
        pinAuthority: "none",
      },
    ],
    credits: { acknowledge: false, use: "inspiration", summary: "Inspected during intake only." },
  });
  const serviceOnly = syntheticManifest({
    id: "fixture-managed-service",
    project: "Fixture Managed Growth Service",
    authors: [{ name: "Service Fixture Inc", role: "operator of the hosted fixture service" }],
    copyright: "Copyright (c) 2026 Service Fixture Inc",
    license: { spdx: "MIT", status: "verified", evidenceSha256: sha256(FIXTURE_NOTICE), noticeFile: "catalog/upstreams/notices/fixture-managed-service.txt" },
    relationships: [
      {
        kind: "remote-service",
        consumption: "A hosted endpoint reached only after a business signs in; the fixture makes no live call.",
        localOwners: ["adapters/fixture/service.ts"],
        tests: [],
        upstreamPaths: [],
        pinAuthority: "hosted service (no local pin)",
      },
    ],
    credits: { acknowledge: true, use: "service", summary: "Optional managed fixture provider." },
  });

  const seeded = seedSkillRoot(harness, "credits-skill-root", [credited, inspectedOnly, serviceOnly]);
  const render = runRenderer(seeded.root);

  harness.check("render-credits writes the four projections from a synthetic skill root and exits 0", () => {
    assert(render.status === 0, `expected exit 0, got ${render.status}:\n${render.output}`);
    for (const relative of ["ACKNOWLEDGMENTS.md", "THIRD_PARTY_NOTICES.md", "docs/upstreams/support-report.md", "docs/upstreams/coverage-report.md"]) {
      assert(existsSync(path.join(seeded.root, relative)), `expected ${relative} to be written`);
    }
  });

  harness.check("coverage report is checked for drift without requiring knowledge in an empty fixture root", () => {
    const file = path.join(seeded.root, "docs/upstreams/coverage-report.md");
    const before = readFileSync(file, "utf8");
    appendFileSync(file, "\nUnreviewed manual coverage claim.\n", "utf8");
    const result = runRenderer(seeded.root, "--check");
    assert(result.status === 1 && result.output.includes("credits.stale_projection"), result.output);
    writeFileSync(file, before, "utf8");
    assert(runRenderer(seeded.root, "--check").status === 0, "restored coverage remains stale");
  });

  harness.check("ACKNOWLEDGMENTS.md credits the acknowledged manifest's author verbatim and omits the inspected-only manifest", () => {
    const acknowledgments = read(seeded.root, "ACKNOWLEDGMENTS.md");
    assert(acknowledgments.includes("Ada Fixture Author, original author and copyright holder (fixture)"), "expected the author name and role verbatim");
    assert(acknowledgments.includes("**Fixture Runner CLI**"), "expected the credited project as a bold lead");
    assert(acknowledgments.includes("Current maintainer: Fixture Org, maintaining organization"), "expected the distinct maintainer line");
    assert(
      acknowledgments.includes("- external-executable: The fixture-runner executable on PATH runs synthetic store reads."),
      "expected the relationship consumption line",
    );
    assert(!acknowledgments.includes("Inspected Only Reference Post"), "an inspected-only manifest must not be credited");
    assert(!acknowledgments.includes("Ines Inspected"), "an inspected-only author must not be credited");
    const runOrWrap = acknowledgments.indexOf("## Open-source projects we run or wrap");
    const adapted = acknowledgments.indexOf("## Methods and guidance we adapted");
    const services = acknowledgments.indexOf("## Optional managed services");
    const runner = acknowledgments.indexOf("**Fixture Runner CLI**");
    const service = acknowledgments.indexOf("**Fixture Managed Growth Service**");
    assert(runOrWrap >= 0 && adapted > runOrWrap && services > adapted, "expected the three sections in order");
    assert(runner > runOrWrap && runner < adapted, "a direct-use manifest belongs under the run-or-wrap section");
    assert(service > services, "a service-use manifest belongs under the managed services section");
    assert(acknowledgments.trimEnd().endsWith("Edit the manifests, not this file."), "expected the generated-by trailer");
  });

  harness.check(
    "THIRD_PARTY_NOTICES.md carries the retained notice byte for byte with its sha256, and lists a service-only upstream without notice text",
    () => {
      const notices = read(seeded.root, "THIRD_PARTY_NOTICES.md");
      const blocks = fencedTextBlocks(notices);
      assert(blocks.length === 1, `expected exactly one notice block (the executable upstream), got ${blocks.length}`);
      assert(blocks[0] === FIXTURE_NOTICE, "the fenced notice must equal the notice file bytes");
      assert(blocks[0] === read(seeded.root, noticeFile), "the fenced notice must equal what is on disk");
      assert(notices.includes(`Notice sha256: ${sha256(FIXTURE_NOTICE)}`), "expected the notice digest after the block");
      assert(notices.includes("## Fixture Runner CLI"), "expected the entry heading");
      assert(notices.includes("- Copyright: Copyright (c) 2026 Ada Fixture Author"), "expected the manifest copyright");
      assert(notices.includes("- Upstream: https://git.example.invalid/fixtures/fixture-runner"), "expected the canonical URL");
      assert(!notices.includes("## Fixture Managed Growth Service"), "a remote-service-only upstream gets no notice entry");
      assert(
        notices.includes("Services without incorporated material: Fixture Managed Growth Service (fixture-managed-service)."),
        "expected the services line",
      );
      assert(!notices.includes("Inspected Only Reference Post"), "a manifest without a notice file has nothing to ship");
    },
  );

  harness.check("support-report.md has one row per manifest, including the inspected-only one, with the due date derived from the cadence", () => {
    const report = read(seeded.root, "docs/upstreams/support-report.md");
    for (const manifest of seeded.manifests) assert(report.includes(`| ${manifest.id} | ${manifest.project} |`), `expected a table row for ${manifest.id}`);
    assert(report.includes("current; last 2026-09-01; due 2026-10-01"), "expected due = last review + cadence days");
    assert(report.includes("| `1.2.3` supported |"), "expected the supported range cell");
    assert(report.includes("| unknown (no observation) | none | not observed |"), "a manifest without an observation stays unknown and not observed");
    assert(report.includes("- fixture.delete: Destructive; never run from a fixture."), "expected the unsupported operation list");
    assert(
      report.includes("- fixture-adaptation: The fixture refuses every delete command. (owner: adapters/fixture/runner.ts)"),
      "expected the adaptation list",
    );
    assert(!/https:\/\/(?!git\.example\.invalid\/)/u.test(report), "the support report carries no URL other than canonical URLs");
  });

  harness.check("--check exits 0 right after a render and reports credits.stale_projection after a hand edit", () => {
    const fresh = runRenderer(seeded.root, "--check");
    assert(fresh.status === 0, `expected --check to pass on fresh output, got ${fresh.status}:\n${fresh.output}`);
    appendFileSync(path.join(seeded.root, "ACKNOWLEDGMENTS.md"), "\nHand-added credit that no manifest backs.\n", "utf8");
    const stale = runRenderer(seeded.root, "--check");
    assert(stale.status === 1, `expected --check to fail after a hand edit, got ${stale.status}:\n${stale.output}`);
    assert(stale.output.includes("credits.stale_projection"), `expected credits.stale_projection, got:\n${stale.output}`);
    assert(stale.output.includes("ACKNOWLEDGMENTS.md"), "expected the stale file to be named");
    // The fix hint travels in the `b2c check --json` envelope; the text report prints code, file, and message only.
    const staleJson = runRenderer(seeded.root, "--check", "--json");
    assert(staleJson.status === 1, `expected --check --json to fail, got ${staleJson.status}`);
    const parsed = JSON.parse(staleJson.output.trim().split("\n")[0] ?? "") as {
      pass: boolean;
      failures: Array<{ rule: string; path?: string; fixHint?: string }>;
    };
    const staleFailure = parsed.failures.find((failure) => failure.rule === "credits.stale_projection");
    assert(parsed.pass === false && staleFailure !== undefined, "expected the JSON envelope to carry the stale rule");
    assert(staleFailure.path === "ACKNOWLEDGMENTS.md", `expected the stale path in the envelope, got ${staleFailure.path}`);
    assert(staleFailure.fixHint === "Run npm run render:credits.", `expected the fix hint in the envelope, got ${staleFailure.fixHint}`);
    const rerender = runRenderer(seeded.root);
    assert(rerender.status === 0 && runRenderer(seeded.root, "--check").status === 0, "a re-render must restore the projection");
  });

  harness.check("a notice whose digest does not match license.evidence_sha256 fails the render closed", () => {
    const mismatched = syntheticManifest({
      ...credited,
      id: "fixture-mismatch",
      license: { ...credited.license, evidenceSha256: "0".repeat(64), noticeFile: "catalog/upstreams/notices/fixture-mismatch.txt" },
    });
    const broken = seedSkillRoot(harness, "credits-digest-mismatch", [mismatched]);
    const result = runRenderer(broken.root);
    assert(result.status === 1, `expected exit 1 on a digest mismatch, got ${result.status}:\n${result.output}`);
    assert(result.output.includes("upstreams.notice_digest_mismatch"), `expected the loader issue code, got:\n${result.output}`);
    assert(!existsSync(path.join(broken.root, "ACKNOWLEDGMENTS.md")), "nothing may be rendered from metadata that did not validate");
    assert(!existsSync(path.join(broken.root, "THIRD_PARTY_NOTICES.md")), "nothing may be rendered from metadata that did not validate");
  });

  // Real-root cases lock the committed projections to the real manifests. They need the
  // repository files, which an installed runtime without a checkout does not carry.
  const realCase: (label: string, fn: () => void) => void = repoCheckoutPresent()
    ? harness.check
    : (label) => harness.skip(label, "requires the repository checkout (package.json at the skill root)");

  realCase("the committed ACKNOWLEDGMENTS.md, THIRD_PARTY_NOTICES.md, and support report are current (check:credits passes)", () => {
    const result = runRenderer(skillRoot, "--check");
    assert(result.status === 0, `expected check:credits to pass on the committed files, got ${result.status}:\n${result.output}`);
  });

  realCase("the committed ACKNOWLEDGMENTS.md credits the real authors and never a reference-only source", () => {
    const acknowledgments = read(skillRoot, "ACKNOWLEDGMENTS.md");
    assert(acknowledgments.includes("Rudrank Riyam"), "expected the asc CLI author");
    assert(acknowledgments.includes("Layers"), "expected the Layers service");
    for (const referenceOnly of ["OpenClaw", "agentskills", "opensource.org"]) {
      assert(!acknowledgments.includes(referenceOnly), `${referenceOnly} was inspected as a reference, not used; it must not be credited`);
    }
  });

  realCase("the committed THIRD_PARTY_NOTICES.md carries the exact retained asc notice text", () => {
    const notices = read(skillRoot, "THIRD_PARTY_NOTICES.md");
    const noticeText = read(skillRoot, "catalog/upstreams/notices/rork-app-store-connect-cli.txt");
    assert(noticeText.length > 0, "the retained notice must not be empty");
    assert(notices.includes(noticeText), "the rork notice must appear byte for byte");
    assert(fencedTextBlocks(notices).includes(noticeText), "the rork notice must be one whole fenced block");
    assert(notices.includes(`Notice sha256: ${sha256(noticeText)}`), "expected the digest of the retained notice");
  });
}
