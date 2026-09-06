/**
 * Fails the build when D1 is reached from anywhere except the tenant repository.
 *
 * D1 has no row-level security. The isolation contract is that every tenant-scoped
 * statement lives in db/tenant.ts behind a server-resolved AccountId. A contract of that
 * shape decays the moment someone adds one convenient `env.DB.prepare()` in a route
 * handler, so it is enforced here rather than by review.
 *
 * Two rules:
 *
 *   1. D1 access (`.prepare(`, `.exec(`, `.batch(`, `env.DB`, the D1 types) may appear
 *      only in the files the effective allowlist names — DEFAULT_ALLOWED_D1_ACCESS below,
 *      or whatever `--allow` passes instead.
 *   2. `is_gifted` may not appear in any TypeScript source. It is an informational mirror
 *      of a Stripe discount; entitlement comes from the entitlements table. Reading it on
 *      an authorization path would turn a local boolean back into the access gate.
 *
 * Comments are stripped before matching, so the rules can be documented in prose without
 * tripping themselves. String and template literals are NOT stripped: the banned tokens
 * are call syntax, and stripping strings would hide a dynamically dispatched call.
 *
 * hosted/builder-console binds the same D1 database (see hosted/builder-console/wrangler.jsonc) and has grown its own
 * repository-shaped module (interest/repository.ts) plus its own copy of the fixture helper
 * (test/support/d1.ts). Rather than hard-coding a second allowlist for a second package, the
 * allowlist is a CLI input: pass one or more `--allow <path>` flags (relative to `--root`) to
 * scan a different root with its own set of permitted files. With no `--allow` at all this is
 * exactly the original hosted-only check, unchanged, which is what `npm run lint:tenant` in
 * hosted/knowledge-mcp still invokes.
 *
 * Usage: node --import tsx tools/check-tenant-isolation.ts [--root <dir>] [--allow <path> ...]
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath, URL as NodeURL } from "node:url";

/** The original, hosted-only allowlist. Used whenever the caller passes no `--allow` flag. */
const DEFAULT_ALLOWED_D1_ACCESS = [
  // The single repository module. Every tenant-scoped statement in the Worker lives here.
  "db/tenant.ts",
  // Fixture helper. Seeds and cross-tenant assertions for the canary suite only; it is
  // never imported by Worker code, which tools/check verifies below.
  "test/support/d1.ts",
];

const SKIP_DIRECTORIES = new Set(["node_modules", ".wrangler", ".git", "dist", "migrations"]);
const SKIP_FILES = new Set(["worker-configuration.d.ts"]);

/**
 * This file states the banned tokens as regular-expression literals and as message text,
 * so scanning it always reports every rule against itself. It is exempt for that reason
 * alone. The exemption is a single hard-coded path, not a pattern, so it cannot be widened
 * by adding a file: any new tool that wanted the same exemption would have to be named
 * here, in a diff a reviewer sees.
 */
const SELF = "tools/check-tenant-isolation.ts";

/**
 * A whole line that does nothing but type one interface/type field as a raw D1 handle, e.g.
 * `readonly DB: D1Database;` on hosted/builder-console's own Env-shaped interface (worker.ts, ungenerated —
 * hosted/knowledge-mcp relies on the ambient Env in the generated, SKIP_FILES-exempt
 * worker-configuration.d.ts instead, so this line shape has never had to appear there).
 *
 * That line cannot itself call `.prepare(`/`.batch(`/`.exec(` — nothing follows the `;` — and
 * a file that goes on to read `env.DB` and call a method on it is still caught by the `env.DB`
 * and `.prepare(` rules below, which do not carry this exemption. What the exemption removes is
 * only the redundant, no-signal flag on the declaration a Worker's entrypoint cannot avoid
 * writing for a binding it will hand to db/tenant.ts. A `db: D1Database` function PARAMETER, a
 * cast, or a generic argument does not match this shape and is still flagged in full.
 */
const BARE_BINDING_FIELD = /^(?:readonly\s+)?[A-Za-z_$][\w$]*\??\s*:\s*(?:D1Database|D1PreparedStatement)\s*;$/;

const D1_ACCESS_RULES = [
  { pattern: /\.prepare\s*\(/, label: "D1 .prepare(" },
  { pattern: /\.batch\s*\(/, label: "D1 .batch(" },
  { pattern: /\bDB\s*\.\s*exec\s*\(/, label: "D1 .exec(" },
  { pattern: /\benv\s*\.\s*DB\b/, label: "env.DB" },
  { pattern: /\bD1Database\b/, label: "D1Database type", exemptBareBindingField: true },
  { pattern: /\bD1PreparedStatement\b/, label: "D1PreparedStatement type", exemptBareBindingField: true },
];

const GIFT_RULE = { pattern: /\bis_gifted\b/, label: "subscriptions.is_gifted" };

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly label: string;
  readonly text: string;
  readonly rule: string;
}

/**
 * Replaces comment bodies with spaces, preserving line structure so reported line numbers
 * stay accurate. Tracks quotes and template literals so a `//` inside a string survives.
 * A regular-expression literal containing `//` or comment-start would be over-stripped;
 * no source in this Worker contains one, and over-stripping cannot hide executable code.
 */
function stripComments(source: string): string {
  const out: string[] = [];
  let state: "code" | "line" | "block" | "'" | '"' | "`" = "code";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] as string;
    const next = source[i + 1];
    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        out.push("  ");
        i += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "block";
        out.push("  ");
        i += 1;
        continue;
      }
      if (char === "'" || char === '"' || char === "`") state = char;
      out.push(char);
      continue;
    }
    if (state === "line") {
      if (char === "\n") state = "code";
      out.push(char === "\n" ? "\n" : " ");
      continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        out.push("  ");
        i += 1;
        continue;
      }
      out.push(char === "\n" ? "\n" : " ");
      continue;
    }
    // Inside a string or template literal. Preserve everything, honour escapes.
    if (char === "\\") {
      out.push(char, source[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (char === state) state = "code";
    out.push(char);
  }
  return out.join("");
}

async function collectSources(root: string, current = root, found: string[] = []): Promise<string[]> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      await collectSources(root, join(current, entry.name), found);
      continue;
    }
    if (!entry.name.endsWith(".ts") || SKIP_FILES.has(entry.name)) continue;
    found.push(join(current, entry.name));
  }
  return found;
}

function inspect(relativePath: string, source: string, allowedD1Access: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  const allowed = allowedD1Access.includes(relativePath);
  const lines = stripComments(source).split("\n");
  lines.forEach((line, index) => {
    if (GIFT_RULE.pattern.test(line))
      findings.push({
        file: relativePath,
        line: index + 1,
        label: GIFT_RULE.label,
        text: line.trim(),
        rule: "is_gifted is informational; read entitlements instead",
      });
    if (allowed) return;
    const bareBindingField = BARE_BINDING_FIELD.test(line.trim());
    for (const rule of D1_ACCESS_RULES) {
      if (!rule.pattern.test(line)) continue;
      if (rule.exemptBareBindingField === true && bareBindingField) continue;
      findings.push({
        file: relativePath,
        line: index + 1,
        label: rule.label,
        text: line.trim(),
        rule: `D1 access is confined to ${allowedD1Access.join(", ")}`,
      });
    }
  });
  return findings;
}

/** The fixture helper must never be reachable from Worker code. */
function checkFixtureContainment(files: { path: string; source: string }[]): Finding[] {
  return files
    .filter((file) => !file.path.startsWith("test/") && /from\s+["'][^"']*test\/support\/d1/.test(stripComments(file.source)))
    .map((file) => ({
      file: file.path,
      line: 1,
      label: "test/support/d1.ts imported outside test/",
      text: file.path,
      rule: "the fixture helper holds unscoped SQL and must stay in the test tree",
    }));
}

/** Every value that followed a `--allow` flag, in order, so a caller can pass several. */
function collectAllowFlags(args: readonly string[]): string[] {
  const found: string[] = [];
  args.forEach((arg, index) => {
    if (arg === "--allow" && args[index + 1] !== undefined) found.push(args[index + 1]!);
  });
  return found;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const rootFlag = args.indexOf("--root");
  const root = rootFlag === -1 ? fileURLToPath(new NodeURL("..", import.meta.url)) : args[rootFlag + 1];
  if (root === undefined) {
    process.stderr.write("check-tenant-isolation: --root needs a directory\n");
    process.exitCode = 1;
    return;
  }
  // No --allow at all reproduces the original hosted-only behaviour exactly. One or more
  // --allow flags replace it wholesale rather than extending it, so a second package states
  // its own complete allowlist instead of inheriting hosted's paths by accident.
  const allowFlags = collectAllowFlags(args);
  const allowedD1Access = allowFlags.length > 0 ? allowFlags : DEFAULT_ALLOWED_D1_ACCESS;

  const paths = await collectSources(root);
  const files = (
    await Promise.all(paths.map(async (path) => ({ path: relative(root, path).split(sep).join("/"), source: await readFile(path, "utf8") })))
  ).filter((file) => file.path !== SELF);
  const findings = [...files.flatMap((file) => inspect(file.path, file.source, allowedD1Access)), ...checkFixtureContainment(files)];
  if (findings.length > 0) {
    process.stderr.write(`check-tenant-isolation: ${findings.length} violation(s)\n\n`);
    for (const finding of findings) process.stderr.write(`  ${finding.file}:${finding.line}  ${finding.label}\n    ${finding.text}\n    ${finding.rule}\n\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`check-tenant-isolation: ${files.length} file(s) scanned, D1 access confined to ${allowedD1Access.join(", ")}\n`);
}

await main();
