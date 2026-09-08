import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadProductInstanceDocument } from "../../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../../catalog/ontology/render-product.js";
import { skillRoot } from "./_harness.js";

/** Canonical authored product and its exact rendered view; no runtime state is seeded. */
export function writeProductFixture(workspace: string, name: string, status = "accepted"): void {
  mkdirSync(workspace, { recursive: true });
  const source = YAML.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/product.yaml"), "utf8"));
  source.meta.name = name;
  source.meta.slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  source.meta.status = status;
  const file = path.join(workspace, "product.yaml");
  writeFileSync(file, YAML.stringify(source));
  writeFileSync(path.join(workspace, "PRODUCT.md"), renderProductMarkdown(loadProductInstanceDocument(file)));
}

/**
 * Wall-clock budget for one `bootstrap.ts --apply`. This is the heaviest fixture primitive in the
 * repository: a single run composes the 449-file first-party package three times over — once to
 * plan the activation, once to apply it, and once more to verify the applied result — and each
 * composition re-parses and re-hashes that package's YAML. Measured end-to-end on a 10-core M-series
 * host: ~20s idle, 26-82s under the load a parallel audit produces. The previous 60s cap sat inside
 * that band, so the fixture failed on contention rather than on a defect.
 *
 * The cap was authored in the same commit (28679576) as the composition-activation initialization
 * path it bounds, and an A/B against that commit measures the same cost as HEAD: 60s was always too
 * tight for this fixture, not a budget a later regression grew into. 240s is ~3x the slowest run
 * observed here, matches the repository's other heavy nested driver spawns, and leaves headroom
 * under tooling/test-public-api.ts's 300s per-suite budget.
 *
 * B2C_FIXTURE_BOOTSTRAP_TIMEOUT_MS overrides it, the way B2C_FIXTURE_CONCURRENCY overrides the
 * shard pool width: a no-code-change escape on a host slower or busier than the one measured.
 */
const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 240_000;

function bootstrapTimeoutMs(): number {
  const override = Number(process.env.B2C_FIXTURE_BOOTSTRAP_TIMEOUT_MS ?? "");
  return Number.isFinite(override) && override > 0 ? Math.floor(override) : DEFAULT_BOOTSTRAP_TIMEOUT_MS;
}

/**
 * Why this reports so much: when spawnSync kills a child on its own `timeout`, stdout and stderr
 * come back empty and `status` is null, so a bare `${result.stdout}\n${result.stderr}` throws the
 * string "Fixture initialization failed:" and nothing else. Every failure mode here names itself
 * and carries the elapsed time against the cap.
 */
export function initializeProductFixture(workspace: string, name: string): void {
  writeProductFixture(workspace, name);
  const timeoutMs = bootstrapTimeoutMs();
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(skillRoot, "kernel/session/bootstrap.ts"), "--workspace", workspace, "--apply"], {
    cwd: skillRoot,
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (result.status === 0) return;

  const cap = timeoutMs % 1000 === 0 ? `${timeoutMs / 1000}s` : `${timeoutMs}ms`;
  const elapsed = `${((Date.now() - startedAt) / 1000).toFixed(1)}s elapsed against a ${cap} cap`;
  const spawnError = result.error as NodeJS.ErrnoException | undefined;
  const cause = (() => {
    if (spawnError?.code === "ETIMEDOUT") {
      return `bootstrap exceeded its timeout and was killed with ${result.signal ?? "no signal"} (${elapsed}). Raise B2C_FIXTURE_BOOTSTRAP_TIMEOUT_MS to give a slow or contended host more room.`;
    }
    if (spawnError) return `bootstrap could not be run: ${spawnError.code ?? "spawn error"}: ${spawnError.message} (${elapsed})`;
    if (result.signal) return `bootstrap was killed with ${result.signal} (${elapsed})`;
    return `bootstrap exited ${result.status ?? "with no status"} (${elapsed})`;
  })();
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  throw new Error(`Fixture initialization failed: ${cause}${output ? `\n${output}` : "\nThe child produced no output."}`);
}

/**
 * The one valid offer-evidence document the fixtures share. `validateProductPriceEvidence` reads it
 * whenever the revenue lane is active, so any workspace fixture that approves a price needs it —
 * a second, divergent copy is how a fixture starts asserting a contract nobody authored.
 * Keep the founder decider intact: `isDecider` in price-evidence.ts rejects agent-shaped names.
 */
export const OFFER_TEST_FIXTURE = `# Offer test
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

/** Write the shared offer evidence a price-approving workspace fixture needs. */
export function writeOfferTestFixture(workspace: string): void {
  mkdirSync(path.join(workspace, "strategy"), { recursive: true });
  writeFileSync(path.join(workspace, "strategy/OFFER_TEST.md"), OFFER_TEST_FIXTURE);
}
