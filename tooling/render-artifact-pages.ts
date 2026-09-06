#!/usr/bin/env node
/**
 * render-artifact-pages.ts — write every `authored-from` page in the artifact-page
 * manifest from its Markdown source.
 *
 * `--check` computes each page in memory and compares it byte for byte against
 * what is on disk, reporting `.output.missing` when the file is absent and
 * `.output.drift` when it differs. That is the same check-mode shape
 * the catalog renderer uses: one pattern for stale generated files across the repo.
 *
 * The audit pipeline runs check:generated-pages rather than this script, because
 * the gate additionally proves the manifest still covers every page on disk. This
 * script is what a maintainer or a launched business runs to re-render after
 * changing a source document.
 *
 * npm script: render:artifact-pages
 * Usage: tsx tooling/render-artifact-pages.ts [--root /path/to/business] [--check]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artifactPageEntries, renderAuthoredPage } from "./lib/artifact-pages.js";
import { flagBoolean, flagString, issue, parseFlags, reportAndExit, type Issue } from "./lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultBusinessRoot = path.join(path.resolve(scriptDir, ".."), "business");

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--root", "--business"], key: "root" },
  { flags: ["--check"], key: "check", kind: "boolean" },
]);
const businessRoot = flagString(flags, "root") ?? defaultBusinessRoot;
const check = flagBoolean(flags, "check");
const issues: Issue[] = [];

if (!existsSync(businessRoot)) {
  issues.push(issue("error", "artifact_pages.business_root_missing", `Business directory is missing: ${businessRoot}`, businessRoot));
  reportAndExit("Artifact page render", issues);
} else {
  for (const [html, entry] of artifactPageEntries()) {
    if (entry.kind !== "authored-from") continue;

    const markdownPath = path.join(businessRoot, entry.markdown);
    if (!existsSync(markdownPath)) {
      issues.push(
        issue(
          "error",
          "artifact_pages.source_missing",
          `${html} is rendered from ${entry.markdown}, which is missing. Restore the source document or change its entry in tooling/lib/artifact-pages.ts.`,
          entry.markdown,
        ),
      );
      continue;
    }

    let rendered: string;
    try {
      rendered = renderAuthoredPage(businessRoot, entry);
    } catch (error) {
      // markdown-lite rejects constructs outside its subset rather than rendering
      // them as something else, so this is a real authoring failure, not noise.
      issues.push(
        issue(
          "error",
          "artifact_pages.unsupported_markdown",
          `${entry.markdown} cannot be rendered: ${error instanceof Error ? error.message : String(error)}`,
          entry.markdown,
        ),
      );
      continue;
    }

    const outputPath = path.join(businessRoot, html);
    if (check) {
      if (!existsSync(outputPath)) {
        issues.push(issue("error", "artifact_pages.output.missing", `Generated page is missing: ${html}. Run render:artifact-pages.`, html));
      } else if (readFileSync(outputPath, "utf8") !== rendered) {
        issues.push(
          issue(
            "error",
            "artifact_pages.output.drift",
            `${html} no longer matches a fresh render of ${entry.markdown}. Re-run render:artifact-pages; edit the Markdown source, never the page.`,
            html,
          ),
        );
      }
    } else {
      writeFileSync(outputPath, rendered, "utf8");
    }
  }

  reportAndExit(check ? "Artifact page render check" : "Artifact page render", issues);
}
