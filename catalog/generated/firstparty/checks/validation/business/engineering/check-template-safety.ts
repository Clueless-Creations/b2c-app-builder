#!/usr/bin/env node
/**
 * check-template-safety
 *
 * Fails if a web-only animation library (framer-motion / the `motion` package)
 * is imported from a shipped template CODE file. framer-motion is web-only; a
 * launched business repo's mobile binary (SwiftUI/Flutter/React Native) must use
 * native animation from DesignTokens.Motion, so these imports must never ship in
 * templates copied into business repos. Markdown/HTML docs are excluded so that
 * documentation examples remain allowed.
 *
 * Deliberate exception: business/growth/landing/ is the landing-page section library
 * — a web-only surface where `motion/react` is the mandated animation library
 * (knowledge/design/landing-motion-craft.md). Those files are copied into a web
 * project, never into the mobile binary, so the import is correct there.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { collectAllFiles, issue, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";
import { skillRoot } from "../../../../tooling/lib/design-state.js";

function parseRoot(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--root" && value) {
      return path.resolve(value);
    }
  }
  return path.join(skillRoot, "examples", "workspace", "business");
}

const root = parseRoot(process.argv.slice(2));
const issues: Issue[] = [];
const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".swift", ".kt", ".dart", ".vue", ".svelte"]);
const forbidden = /(?:import[^;\n]*?from\s*|require\(\s*)['"](?:framer-motion|motion|motion\/react)['"]/;

for (const file of collectAllFiles(root)) {
  if (file.split(path.sep).includes("node_modules")) {
    continue;
  }
  const text = readFileSync(file, "utf8");
  if (/mcp__mobai__[A-Za-z0-9_]+/.test(text)) {
    issues.push(
      issue(
        "error",
        "template_safety.stale_mobai_mcp_name",
        `Hardcoded MobAI MCP identifier found in ${path.relative(root, file)}. Generated guidance must discover current exposed tools and use verified CLI alternatives.`,
        path.relative(root, file),
      ),
    );
  }
  // Web-only landing surface (the top-level landing/ section library):
  // motion/react is the mandated animation library there and never ships into
  // the binary. Anchored to the first segment so unrelated nested directories
  // that happen to be named "landing" stay covered by the gate.
  const relativeSegments = path.relative(root, file).split(path.sep);
  if (relativeSegments[0] === "growth" && relativeSegments[1] === "landing") {
    continue;
  }
  if (!codeExtensions.has(path.extname(file))) {
    continue;
  }
  if (forbidden.test(text)) {
    issues.push(
      issue(
        "error",
        "template_safety.framer_motion_in_template",
        `framer-motion / motion import found in a shipped template code file: ${path.relative(root, file)}. framer-motion is web-only; the mobile binary must use native animation from DesignTokens.Motion.`,
        path.relative(root, file),
      ),
    );
  }
}

reportAndExit("Template safety check", issues);
