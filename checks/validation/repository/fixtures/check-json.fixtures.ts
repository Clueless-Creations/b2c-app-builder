import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { type Harness, skillRoot, writeBusinessEntrypoints } from "./_harness.js";
import { checkNames } from "../../../../catalog/gates.js";
import { resolveScriptPath } from "../../../../tooling/lib/script-paths.js";
import { resolveTsxBin } from "../../../../tooling/lib/tsx-bin.js";

/**
 * D1 (#32): `b2c check <name> --json`'s `{pass, failures}` contract, proven two ways.
 *
 * 1. A parity sample: ~15-20 already-understood PASS/FAIL invocations (the same fixture roots
 *    and script args existing text-mode fixtures elsewhere already prove), re-run with --json
 *    through the new runFixtureJson helper. This proves the reportAndExit-level "--json for
 *    free" change on a real spread of validators, plus the three hand-patched outliers
 *    (check-catalog.ts, check-continuity-contract.ts, tooling/render-hosted-bundle.ts).
 * 2. A full-registry smoke test: every one of the ~100 check:* npm scripts, run through the real
 *    `npm run check:<name> -- --json` invocation, asserting only structural validity (a clean
 *    exit 0 or 1, JSON stdout shaped as {pass: boolean, failures: [{severity, rule, message}]}).
 *    Several of these gates are EXPECTED to fail against a generic reference workspace (the
 *    onboarding-evidence-onb-NN gates, apple-release-readiness, and friends — see
 *    tooling/lib/audit-plan.ts's auditExcludedScripts for why) — this test does not care about
 *    the verdict, only that --json never crashes or emits something unparsable.
 */
function runRawJson(h: Harness, label: string, script: string, args: string[], expectedCode: number, expectedRule?: string): void {
  const result = spawnSync(resolveTsxBin(skillRoot), [resolveScriptPath(skillRoot, script), ...args, "--json"], { cwd: skillRoot, encoding: "utf8" });
  const rawOutput = `${result.stdout}\n${result.stderr}`;
  let parsed: { pass?: unknown; failures?: unknown } | undefined;
  let parseError: string | undefined;
  try {
    parsed = JSON.parse((result.stdout ?? "").trim()) as { pass?: unknown; failures?: unknown };
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  const failures = Array.isArray(parsed?.failures) ? (parsed.failures as Array<{ rule?: unknown }>) : [];
  const passMatches = parsed !== undefined && parsed.pass === (expectedCode === 0);
  const ruleMatches = expectedRule === undefined || failures.some((failure) => failure.rule === expectedRule);
  h.results.push({
    label,
    ok: result.status === expectedCode && parsed !== undefined && passMatches && ruleMatches,
    expectedCode,
    actualCode: result.status,
    expectedText: expectedRule,
    output: parseError ? `${rawOutput}\n(--json did not parse: ${parseError})` : rawOutput,
  });
}

export function register(h: Harness): void {
  const { makeFixture, runFixtureJson } = h;

  // ── Parity sample: a spread of already-proven reportAndExit validators ──────────────────────

  const clean = makeFixture("check-json-clean");
  runFixtureJson("product-md: shipped reference passes under --json", clean, "check-product-md.ts", 0);
  runFixtureJson("secret-routing: shipped reference passes under --json", clean, "check-secret-routing.ts", 0);
  runFixtureJson("privacy-terms: shipped reference passes under --json", clean, "check-privacy-terms.ts", 0);
  runFixtureJson("template-safety: shipped reference passes under --json", clean, "check-template-safety.ts", 0);
  runFixtureJson("vibecoded-tells: shipped reference passes under --json", clean, "check-vibecoded-tells.ts", 0);
  runFixtureJson("token-promotion: shipped reference passes under --json", clean, "check-token-promotion.ts", 0);
  runFixtureJson("generated-pages: shipped reference passes under --json", clean, "check-generated-pages.ts", 0);
  runFixtureJson("repository-profile: shipped reference passes under --json", clean, "check-repository-profile.ts", 0);
  runFixtureJson("app-review-contract: shipped reference passes under --json", clean, "check-app-review-contract.ts", 0);
  runFixtureJson("attribution-contract: shipped reference passes under --json", clean, "check-attribution-contract.ts", 0);
  runFixtureJson("onboarding-graph: shipped reference passes under --json", clean, "check-onboarding-graph.ts", 0);
  runFixtureJson("design-room-contract: shipped reference passes under --json", clean, "check-design-room-contract.ts", 0);

  const missingProduct = makeFixture("check-json-missing-product-md");
  rmSync(path.join(missingProduct, "PRODUCT.md"));
  runFixtureJson("product-md: a missing PRODUCT.md fails under --json with rule PRODUCT_MD", missingProduct, "check-product-md.ts", 1, "PRODUCT_MD");

  const missingDesign = makeFixture("check-json-missing-design-md");
  rmSync(path.join(missingDesign, "DESIGN.md"));
  runFixtureJson("design-md: a missing DESIGN.md fails under --json with rule design_md.missing", missingDesign, "check-design-md.ts", 1, "design_md.missing");

  // ── The three non-reportAndExit outliers: each hand-wires its own --json branch ─────────────

  const continuityClean = makeFixture("check-json-continuity-clean");
  writeBusinessEntrypoints(continuityClean);
  runFixtureJson("continuity-contract (outlier): a complete business passes under --json", continuityClean, "check-continuity-contract.ts", 0);

  const continuityMissingStatus = makeFixture("check-json-continuity-missing-status");
  writeBusinessEntrypoints(continuityMissingStatus);
  {
    const agentsPath = path.join(continuityMissingStatus, "AGENTS.md");
    writeFileSync(agentsPath, readFileSync(agentsPath, "utf8").replaceAll("b2c status", "status unavailable"), "utf8");
  }
  runFixtureJson(
    "continuity-contract (outlier): a missing status entrypoint fails under --json with rule continuity.term_missing",
    continuityMissingStatus,
    "check-continuity-contract.ts",
    1,
    "continuity.term_missing",
  );

  // check-catalog.ts treats --root as an alias for --skill-root (its own parseArgs), so the
  // shared skillRoot constant IS the right thing to pass through runFixtureJson here.
  runFixtureJson("catalog (outlier): the shipped catalog graph passes under --json", skillRoot, "check-catalog.ts", 0);

  // render-hosted-bundle.ts takes --skill-root (not --root) and requires --check to avoid
  // writing — its flag shape does not fit runFixtureJson's runFixture-style calling convention,
  // so it is spawned directly here, the same way the other outlier hand-writes its own branch.
  runRawJson(h, "hosted-bundle (outlier): the shipped bundle is current under --json", "render-hosted-bundle.ts", ["--check", "--skill-root", skillRoot], 0);

  // ── Full-registry smoke test: every check:* name emits valid --json, pass or fail ───────────

  const smokeRoot = makeFixture("check-json-smoke");
  const names = checkNames(skillRoot);
  for (const name of names) {
    const result = spawnSync("npm", ["run", "--silent", "--prefix", skillRoot, `check:${name}`, "--", "--json"], {
      cwd: skillRoot,
      encoding: "utf8",
      env: { ...process.env, BUSINESS_ROOT: smokeRoot },
      // The multi-session engine journey exceeds two minutes; ordinary checks retain their shorter bound.
      timeout: name === "engine-e2e" ? 300_000 : 120_000,
    });
    const rawOutput = `${result.stdout}\n${result.stderr}`;
    let parsed: { pass?: unknown; failures?: unknown } | undefined;
    let parseError: string | undefined;
    try {
      parsed = JSON.parse((result.stdout ?? "").trim()) as { pass?: unknown; failures?: unknown };
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
    const shapeOk =
      parsed !== undefined &&
      typeof parsed.pass === "boolean" &&
      Array.isArray(parsed.failures) &&
      (parsed.failures as unknown[]).every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { severity?: unknown }).severity === "string" &&
          typeof (item as { rule?: unknown }).rule === "string" &&
          typeof (item as { message?: unknown }).message === "string",
      );
    const cleanExit = result.status === 0 || result.status === 1;
    h.results.push({
      label: `check:${name} emits structurally valid --json (pass:false is fine; a crash or unparsable stdout is not)`,
      ok: cleanExit && shapeOk,
      expectedCode: 0,
      actualCode: result.status,
      output: parseError ? `${rawOutput}\n(--json did not parse: ${parseError})` : rawOutput,
    });
  }
}
