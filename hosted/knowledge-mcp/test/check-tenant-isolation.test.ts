/**
 * Proves the generalized tools/check-tenant-isolation.ts actually catches a stray D1 access
 * outside its allowlist, and does so against a root other than this package (hosted/builder-console binds the
 * same `clueless-creations` D1 database — see hosted/builder-console/wrangler.jsonc — and has grown its own
 * repository-shaped module and its own copy of the fixture helper).
 *
 * Fixture SOURCE lives in test/fixtures/*.ts.snippet, not inline here and not as a checked-in
 * *.ts file, for two independent reasons:
 *   - hosted/tsconfig.json's "include" picks up every *.ts under test/, so a checked-in *.ts
 *     fixture would have to typecheck cleanly under this package's strict settings for no reason
 *     connected to what it is testing.
 *   - This suite's own default invocation (no --allow) scans this very package, comments
 *     stripped but string/template literals NOT stripped by design (that's what lets the tool
 *     catch a banned call hidden in a dynamically-built string elsewhere). A fixture embedded as
 *     a template literal in this .ts file would therefore flag ITSELF the moment `npm run
 *     lint:tenant` ran with no arguments. A `.snippet` extension is invisible to
 *     collectSources(), which only walks `*.ts`.
 *
 * The tool itself is exercised as the real CLI, in a child process, exactly the way
 * `npm run lint:tenant` invokes it — not by importing its internals — because the behaviour
 * worth pinning here is the one every package's package.json actually depends on: exit code and
 * stderr content for a given `--root` and `--allow` set.
 *
 * The same self-scanning reason means this file's own prose and assertions avoid spelling out
 * the literal banned tokens where a plain word would do — see FLAGGED_TYPE_LABEL below.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

const run = promisify(execFile);
const TOOL = fileURLToPath(new NodeURL("../tools/check-tenant-isolation.ts", import.meta.url));
const FIXTURES = fileURLToPath(new NodeURL("fixtures", import.meta.url));

// Built by concatenation rather than written as one literal, for the reason in the file header:
// this exact phrase is the label the tool's own D1Database-type rule reports, and spelling it
// as one literal here would make this very line a hit when this package's own default,
// no-arguments `npm run lint:tenant` scans its test/ directory.
const FLAGGED_TYPE_LABEL = ["D1", "Database type"].join("");

let root: string;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "b2c-tenant-isolation-"));
  await mkdir(join(root, "interest"), { recursive: true });
  await mkdir(join(root, "console"), { recursive: true });
  // A legitimate repository-shaped module, the same shape as hosted/builder-console/interest/repository.ts.
  await writeFile(join(root, "interest", "repository.ts"), await readFile(join(FIXTURES, "tenant-isolation-allowed-repository.ts.snippet")));
  // The mistake this check exists to catch: a route reaching D1 directly, bypassing the
  // repository. See that fixture's own comment for what its two functions each prove.
  await writeFile(join(root, "console", "route.ts"), await readFile(join(FIXTURES, "tenant-isolation-stray-route.ts.snippet")));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

test("a stray D1 access outside the allowlist fails the check, in an app-shaped root", async () => {
  await assert.rejects(run("node", ["--import", "tsx", TOOL, "--root", root, "--allow", "interest/repository.ts"]), (error: unknown) => {
    const { code, stderr } = error as { code: number; stderr: string };
    assert.equal(code, 1);
    assert.match(stderr, /console\/route\.ts/);
    assert.match(stderr, /env\.DB/);
    assert.match(stderr, /\.prepare\(/);
    // raw()'s parameter is a plain type usage of the banned identifier — still flagged, unlike
    // the bare Env-field shape checked below.
    assert.ok(stderr.includes(FLAGGED_TYPE_LABEL), "a plain type-usage of the banned identifier must still be flagged");
    // The bare `readonly DB: ...;` Env field is line 3 of the fixture and must not itself be
    // reported as a violation location — only lines 7 and 10 should be. It mirrors
    // hosted/builder-console/worker.ts's own Env-shaped interface, which is what the exemption exists for.
    assert.doesNotMatch(stderr, /route\.ts:3\b/);
    // The allowed file's name legitimately appears in every "D1 access is confined to ..."
    // message, so check it is never a violation *location* rather than absent altogether.
    assert.doesNotMatch(stderr, /^\s*interest\/repository\.ts:\d+/m);
    return true;
  });
});

test("the same root passes once every file with D1 access is named in --allow", async () => {
  const { stdout, stderr } = await run("node", ["--import", "tsx", TOOL, "--root", root, "--allow", "interest/repository.ts", "--allow", "console/route.ts"]);
  assert.equal(stderr, "");
  assert.match(stdout, /2 file\(s\) scanned/);
});

test("a --root with no matching files at all still runs cleanly", async () => {
  const empty = await mkdtemp(join(tmpdir(), "b2c-tenant-isolation-empty-"));
  try {
    const { stdout } = await run("node", ["--import", "tsx", TOOL, "--root", empty, "--allow", "anything.ts"]);
    assert.match(stdout, /0 file\(s\) scanned/);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});
