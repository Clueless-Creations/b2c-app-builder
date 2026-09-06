import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "../fixtures/_harness.js";

/**
 * Ports LaunchBench scenario `secret-routing-missing.yaml` (validators cited there:
 * check-secret-routing [port-disposition: keep], validate-project-state [keep] — both survive
 * unchanged, still scanning generated business workspaces). The gap this scenario closes: neither
 * validator's `--root` ever points at the skill's OWN new source tree (kernel/, catalog/, content/,
 * verification/) — `check-secret-routing.ts` only ever scans a generated business's
 * `examples/workspace/business/` tree. The new greenfield core is real, hand-authored code too, and could
 * just as easily hardcode a live-looking secret; nothing was checking that before this scenario.
 *
 * Reuses the exact `secretLike` pattern from
 * checks/validation/business/trust/check-secret-routing.ts (not re-derived — the same literal, so the
 * two scans agree on what "looks like a secret" means) rather than inventing a second, divergent
 * regex (this repo's own recorded "duplicated helpers have already diverged" lesson).
 */

// Mirrors checks/validation/business/trust/check-secret-routing.ts's secretLike constant exactly.
const SECRET_LIKE = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}|whsec_[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN (PRIVATE|RSA|EC) PRIVATE KEY-----/;

const SCAN_ROOTS = ["kernel", "adapters", "contracts", "entrypoints", "hosted", "catalog", "checks/verification"];
const SCAN_EXTENSIONS = new Set([".ts", ".json", ".md", ".yaml", ".yml"]);
const SKIP_DIR_NAMES = new Set(["node_modules", ".git"]);

function listFiles(root: string): string[] {
  const results: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIR_NAMES.has(entry)) continue;
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (SCAN_EXTENSIONS.has(path.extname(entry))) {
        results.push(full);
      }
    }
  };
  walk(root);
  return results;
}

export function register(harness: Harness): void {
  harness.check(
    "scenario/secret-routing (ports secret-routing-missing): the new kernel/catalog/content/verification source tree carries no raw-secret-shaped literal (a scope check-secret-routing.ts never covers — it only scans generated business workspaces)",
    () => {
      const offenders: string[] = [];
      let scannedCount = 0;
      for (const rootName of SCAN_ROOTS) {
        const root = path.join(skillRoot, rootName);
        for (const filePath of listFiles(root)) {
          scannedCount += 1;
          const text = readFileSync(filePath, "utf8");
          if (SECRET_LIKE.test(text)) offenders.push(path.relative(skillRoot, filePath));
        }
      }
      assert(
        scannedCount > 50,
        `expected to scan a substantial number of files across ${SCAN_ROOTS.join(", ")} (the scan itself must not be vacuous), scanned ${scannedCount}`,
      );
      assert(offenders.length === 0, `found raw-secret-shaped literal(s) in the new core source tree: ${JSON.stringify(offenders)}`);
    },
  );

  harness.check("scenario/secret-routing: the SECRET_LIKE scan actually catches a real-shaped secret (the check is not vacuous)", () => {
    // Built by concatenation, deliberately: a literal "sk_live_..." substring in THIS file would
    // be caught by the previous check's own scan of verification/ — the self-referential trap the
    // "duplicated helpers" lesson generalizes to (a check must not fail on its own fixture data).
    const plantedExamples = [
      ["sk", "live", "abcdefghijkl1234567890"].join("_"),
      ["whsec", "abcdefghijkl1234567890"].join("_"),
      ["ghp", "abcdefghijklmnopqrstuvwxyz12345678"].join("_"),
      ["-----BEGIN", "RSA", "PRIVATE KEY-----"].join(" "),
    ];
    for (const example of plantedExamples) {
      assert(SECRET_LIKE.test(`const KEY = "${example}";`), `expected the secret-shaped scan to catch a planted example: ${example}`);
    }
    assert(!SECRET_LIKE.test(["const label = 'RESEND", "API", "KEY';"].join("_")), "a bare env-var NAME (not a value) must not false-positive");
  });
}
