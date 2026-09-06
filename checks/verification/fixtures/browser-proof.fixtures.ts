import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify as yaml } from "yaml";
import { outputFingerprintPath } from "../../../kernel/engine/artifact-fingerprint.js";
import { browserProofPointerSchema, type BrowserProofPointer } from "../../../tooling/browser-proof.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import {
  designAcceptanceScopeSchema,
  designArtifact,
  designBrowserResourceManifestSchema,
  designBrowserRuntimeProofReceiptSchema,
  designCandidateFingerprint,
  type DesignBrowserRuntimeProofReceipt,
} from "../../validation/business/design/design-acceptance.js";
import { validateBrowserRuntimeProof } from "../../validation/business/design/check-browser-runtime-proof.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const helper = path.join(skillRoot, "checks/verification/fixtures/browser-proof.fixture-helper.ts");
const sessionId = "session.landing.current";

function put(root: string, relative: string, value: string | Buffer): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, value);
}

function example(harness: Harness, name: string, mode = "pass"): string {
  const root = harness.makeTempDir(name);
  const scope = designAcceptanceScopeSchema.parse({
    schemaVersion: 1,
    status: "accepted",
    designContractPaths: ["design/screens/landing.md"],
    surfaces: [
      {
        id: "landing-mobile",
        surfaceId: "landing",
        kind: "landing",
        platform: "web",
        viewport: "mobile",
        routePath: "/index.html",
        productScreenIds: ["landing"],
        implementationPaths: ["growth/landing"],
        rubricPath: "design/reviews/rubrics/landing.json",
        locales: ["en-US"],
        states: ["default"],
        stateExclusions: [],
        interactions: [
          {
            id: "primary-cta",
            action: "Activate the primary call to action from the fresh landing document.",
            expected: "The current landing route responds and preserves the intended conversion path.",
          },
        ],
      },
    ],
    exclusions: [],
  });
  put(root, "growth/landing/dist/index.html", '<!doctype html><script src="/app.js"></script><h1>Current candidate</h1>\n');
  put(root, "growth/landing/dist/app.js", 'document.documentElement.dataset.candidate = "current";\n');
  put(root, "growth/landing/src/app.ts", "// Current authored landing source.\n");
  put(root, "design/screens/landing.md", "# Landing screen\n\nThe current visual and interaction contract.\n");
  put(
    root,
    "DESIGN.md",
    `---\n${yaml({
      version: 1,
      name: "Fixture",
      description: "Fixture browser proof design system",
      colors: { primary: "#000000" },
      typography: { body: { family: "system-ui", weight: 400 } },
      rounded: { base: "8px" },
      spacing: { base: "8px" },
      components: {},
      acceptance: scope,
    })}---\n\n# Fixture\n`,
  );
  const candidateSha256 = designCandidateFingerprint(root, scope);
  put(
    root,
    "growth/landing/browser-proof.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        runtimeId: "landing-chrome-current",
        candidateSha256,
        surfaceIds: ["landing-mobile"],
        sourceRoots: ["growth/landing"],
        build: {
          entrypoint: "growth/landing/dist/index.html",
          resources: [
            { path: "growth/landing/dist/index.html", urlPath: "/index.html" },
            { path: "growth/landing/dist/app.js", urlPath: "/app.js" },
          ],
        },
        served: { origin: "http://127.0.0.1:4179", url: "http://127.0.0.1:4179/index.html" },
        browser: { channel: "chrome" },
        captures: [
          {
            id: "landing-default",
            surfaceId: "landing-mobile",
            state: "default",
            locale: "en-US",
            viewport: { width: 390, height: 844 },
            scale: 1,
            settings: { reducedMotion: false, screenReader: false, largeText: false, javascript: true },
            steps: [],
            assertions: [{ kind: "selector-exists", selector: "html" }],
          },
        ],
        interactions: [
          {
            id: "landing-primary-interaction",
            surfaceId: "landing-mobile",
            interactionId: "primary-cta",
            locale: "en-US",
            captureIds: ["landing-default"],
            steps: [{ action: "wait", durationMs: 0 }],
            assertions: [{ kind: "selector-exists", selector: "html" }],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const produced = spawnSync(resolveTsxBin(skillRoot), [helper, root, mode], { cwd: skillRoot, encoding: "utf8" });
  if (produced.status !== 0) throw new Error(`fixture producer failed: ${produced.stdout}\n${produced.stderr}`);
  put(
    root,
    "run/run-state.json",
    `${JSON.stringify(
      {
        schemaVersion: "1.0.0",
        artifactBindings: [
          {
            artifactId: "artifact.growth-landing",
            path: "growth/landing",
            fingerprint: outputFingerprintPath(path.join(root, "growth/landing")),
            accepted: false,
            producedBy: "run.growth.pre-launch-funnel-landing-waitlist",
            attemptId: "attempt.landing.current",
          },
        ],
        nodes: {
          "run.growth.pre-launch-funnel-landing-waitlist": {
            status: "blocked",
            blocker: "Verification required",
            attempts: [
              {
                id: "attempt.landing.current",
                status: "blocked",
                ownerSessionId: sessionId,
                startedAt: "2026-09-04T12:00:00Z",
                finishedAt: "2026-09-04T12:05:00Z",
              },
            ],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

function pointer(root: string): BrowserProofPointer {
  return browserProofPointerSchema.parse(JSON.parse(readFileSync(path.join(root, "growth/landing/proof/browser-proof.json"), "utf8")));
}

function receipt(root: string, selected = pointer(root)): DesignBrowserRuntimeProofReceipt {
  return designBrowserRuntimeProofReceiptSchema.parse(JSON.parse(readFileSync(path.join(root, selected.receipt.path), "utf8")));
}

function writeReceipt(root: string, selected: BrowserProofPointer, value: DesignBrowserRuntimeProofReceipt): void {
  writeFileSync(path.join(root, selected.receipt.path), `${JSON.stringify(value, null, 2)}\n`);
  selected.receipt = designArtifact(root, selected.receipt.path);
  writeFileSync(path.join(root, "growth/landing/proof/browser-proof.json"), `${JSON.stringify(selected, null, 2)}\n`);
}

export function register(harness: Harness): void {
  harness.check("browser-proof: producer materializes a current attempt-bound proof bundle", () => {
    const root = example(harness, "browser-proof-pass");
    const issues = validateBrowserRuntimeProof(root);
    assert(issues.length === 0, JSON.stringify(issues));
  });

  harness.check("browser-proof: producer refuses served bytes from an unrelated old page", () => {
    const root = harness.makeTempDir("browser-proof-producer-old-response");
    // Build the authored workspace first, then remove its valid output and exercise the mismatch mode.
    const valid = example(harness, "browser-proof-producer-old-response-seed");
    cpSync(valid, root, { recursive: true });
    rmSync(path.join(root, "growth/landing/proof"), { recursive: true, force: true });
    rmSync(path.join(root, "run"), { recursive: true, force: true });
    const produced = spawnSync(resolveTsxBin(skillRoot), [helper, root, "wrong-response"], { cwd: skillRoot, encoding: "utf8" });
    assert(produced.status === 1, `expected producer refusal, got ${produced.status}: ${produced.stdout}\n${produced.stderr}`);
    assert(!existsSync(path.join(root, "growth/landing/proof/browser-proof.json")), "failed proof published a pointer");
  });

  harness.check("browser-proof: retained response relabeling cannot replace current build bytes", () => {
    const root = example(harness, "browser-proof-response-relabel");
    const selected = pointer(root);
    const runtimeReceipt = receipt(root, selected);
    const resourceManifestPath = path.join(root, runtimeReceipt.served.resourceManifest.path);
    const resourceManifest = designBrowserResourceManifestSchema.parse(JSON.parse(readFileSync(resourceManifestPath, "utf8")));
    const document = resourceManifest.resources.find((resource) => resource.url.endsWith("/index.html"))!;
    writeFileSync(path.join(root, document.response.path), "<h1>Old unrelated page relabeled as current</h1>\n");
    document.response = designArtifact(root, document.response.path);
    writeFileSync(resourceManifestPath, `${JSON.stringify(resourceManifest, null, 2)}\n`);
    runtimeReceipt.served.resourceManifest = designArtifact(root, runtimeReceipt.served.resourceManifest.path);
    writeReceipt(root, selected, runtimeReceipt);
    const issues = validateBrowserRuntimeProof(root);
    assert(
      issues.some((entry) => entry.code === "browser_runtime_proof.served_bytes"),
      JSON.stringify(issues),
    );
  });

  harness.check("browser-proof: a prior engine session cannot be relabeled as the current attempt", () => {
    const root = example(harness, "browser-proof-session-relabel");
    const selected = pointer(root);
    const runtimeReceipt = receipt(root, selected);
    runtimeReceipt.sessionId = "session.landing.previous";
    selected.sessionId = runtimeReceipt.sessionId;
    writeReceipt(root, selected, runtimeReceipt);
    const issues = validateBrowserRuntimeProof(root);
    assert(
      issues.some((entry) => entry.code === "browser_runtime_proof.session_identity"),
      JSON.stringify(issues),
    );
  });

  harness.check("browser-proof: a stale authored candidate config cannot mint a new receipt", () => {
    const root = example(harness, "browser-proof-stale-config");
    const configPath = path.join(root, "growth/landing/browser-proof.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.candidateSha256 = "f".repeat(64);
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const produced = spawnSync(resolveTsxBin(skillRoot), [helper, root], { cwd: skillRoot, encoding: "utf8" });
    assert(produced.status === 1, `expected stale-config refusal, got ${produced.status}: ${produced.stdout}\n${produced.stderr}`);
  });
}
