import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "../fixtures/_harness.js";

/**
 * Structural proof of the task's "your module READS control/grants/waivers/ledger docs, never
 * writes them" boundary (KTD7: mutation is reachable only through the reducer CLI's typed-patch
 * interface). This is not a behavioral test of any one function — it is a source-level guarantee
 * that kernel/autonomy/**​/*.ts never even imports a disk-mutating primitive, so no future change to
 * any function in this unit can silently start writing without also failing this check. The scan
 * is recursive so subdirectories (e.g. probes/) are covered, not just autonomyDir's own top-level
 * files.
 *
 * HONEST LIMITATION: this is a structural smoke check, not a proof of "cannot write to disk". It
 * greps each file's own source text for a fixed list of Node fs write-primitive names. It catches
 * a direct `writeFileSync(...)`-shaped call added straight into this tree. It does NOT catch a
 * write reached indirectly — e.g. a module here importing and calling a writer function defined
 * in another file (that helper need not have a "write-shaped" name at all), a write performed via
 * a passed-in callback, or one reached through reflection/dynamic property access. A pass here
 * means "no obvious direct write primitive was referenced in this file's own source", not "this
 * code is provably incapable of writing to disk".
 */
const WRITE_PRIMITIVES = [
  "writeFileSync",
  "appendFileSync",
  "renameSync",
  "unlinkSync",
  "mkdirSync",
  "writeSync",
  "fsyncSync",
  "rmSync",
  "rmdirSync",
  "copyFileSync",
  "truncateSync",
];

const autonomyDir = path.join(skillRoot, "kernel/autonomy");

/** Recursive .ts file collection so a subdirectory like probes/ is scanned, not silently skipped. */
function collectTsFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFilesRecursive(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

export function register(harness: Harness): void {
  const topLevelNames = readdirSync(autonomyDir).filter((name) => name.endsWith(".ts"));
  const files = collectTsFilesRecursive(autonomyDir);

  harness.check("producer boundary: kernel/autonomy contains the five expected modules plus the evaluator assembly", () => {
    for (const expected of ["grants.ts", "prerequisites.ts", "waivers.ts", "budget.ts", "killswitch.ts", "evaluator.ts"]) {
      assert(topLevelNames.includes(expected), `expected ${expected} to exist in ${path.relative(skillRoot, autonomyDir)}`);
    }
  });

  for (const file of files) {
    const relative = path.relative(autonomyDir, file).split(path.sep).join("/");
    harness.check(`producer boundary: ${relative} never imports or calls a disk-write primitive`, () => {
      const source = readFileSync(file, "utf8");
      const hits = WRITE_PRIMITIVES.filter((name) => new RegExp(`\\b${name}\\b`).test(source));
      assert(
        hits.length === 0,
        `${relative} references write primitive(s) [${hits.join(", ")}] — the autonomy engine must only read control/grants/waivers/ledger docs, never write them`,
      );
    });
  }
}
