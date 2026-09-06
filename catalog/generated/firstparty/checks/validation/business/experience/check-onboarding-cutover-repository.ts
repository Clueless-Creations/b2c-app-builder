#!/usr/bin/env node
/**
 * Independent, repository-grounded check for ONB-22's Target Runtime Cutover / Removal Inventory.
 *
 * check-onboarding-graph.ts (and its --require-done wrapper, ONB-22's other gate) only ever
 * inspects product/ONBOARDING.md's own self-authored text -- it has no way to notice a Deletion
 * Manifest row that claims a removal artifact was deleted while that artifact still sits on disk.
 * The executor's own record cannot be its own verification for a destructive, one-time cutover:
 * this check reads the Removal Inventory table and, for every row whose Disposition claims
 * "delete," verifies the claim against actual filesystem state, exactly the way
 * check-live-provider-proof.ts already grounds provider-readiness claims in real evidence paths
 * rather than trusting prose.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { issue, parseCliArgs, readText, reportAndExit, stripNonRenderedMarkdown, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
// The ONB-22 gate variant (check:onboarding-cutover-repository-complete). The general audit
// runs the base mode against the shipped template, whose Removal Inventory row deliberately
// still carries the unresolved disposition option list.
const requireResolved = process.argv.includes("--require-resolved");
const issues: Issue[] = [];

const candidates = ["product/ONBOARDING.md", "business/product/ONBOARDING.md"];
const artifact = candidates
  .map((relativePath) => ({ relativePath, text: readText(args.root, relativePath) }))
  .find((candidate) => candidate.text !== undefined);

if (artifact) {
  const relativePath = artifact.relativePath;
  // check-onboarding-graph.ts already reports onboarding_graph.artifact_missing when this file is
  // absent; this check only has something to say once the artifact exists.
  const liveText = stripNonRenderedMarkdown(artifact.text ?? "");
  const manifest = deletionManifest(liveText);
  if (manifest.kind === "missing") {
    issues.push(
      issue(
        "error",
        "onboarding_cutover.deletion_manifest_missing",
        `${relativePath} has no "### Removal Inventory" heading, so no Disposition "delete" row can be verified against the repository. A phrase-only mention of "Removal Inventory" elsewhere in the document does not satisfy this check -- restore the heading and its table.`,
        relativePath,
      ),
    );
  } else if (manifest.kind === "unparseable") {
    issues.push(
      issue(
        "error",
        "onboarding_cutover.deletion_manifest_unparseable",
        `${relativePath}'s Removal Inventory ${manifest.reason}, so no Disposition "delete" row can be verified against the repository. Restore a parseable table: a Disposition column and at least one data row.`,
        relativePath,
      ),
    );
  } else {
    // Terminal dispositions come from the shipped template's own option list ("Preserve durable
    // data, transform once, recompute, archive legal history, or delete"). Round 24: a bare
    // \bdelete\b substring test read that UNRESOLVED option list itself as a live deletion
    // decision, and its placeholder span (absent from disk by construction) then counted as a
    // verified deletion -- so ONB-22 could complete without a concrete cutover inventory. A row
    // is a deletion claim only when its Disposition cell resolves to the single terminal
    // disposition "delete"; under --require-resolved every row must resolve to exactly one
    // terminal disposition or it is rejected outright.
    const terminalDispositions = ["preserve", "transform", "recompute", "archive", "delete"];
    for (const row of manifest.rows) {
      const cell = row.disposition.toLowerCase();
      const mentioned = terminalDispositions.filter((keyword) => new RegExp(`\\b${keyword}`).test(cell));
      if (mentioned.length !== 1) {
        if (requireResolved) {
          issues.push(
            issue(
              "error",
              "onboarding_cutover.disposition_unresolved",
              `${relativePath}'s Removal Inventory has a row whose Disposition cell ("${row.disposition}") does not resolve to exactly one terminal disposition (preserve, transform, recompute, archive, or delete). Resolve the shipped option list to one decision per row before ONB-22 can claim the cutover.`,
              relativePath,
            ),
          );
        }
        continue;
      }
      if (mentioned[0] !== "delete") continue;
      const spans = backtickSpans(row.raw);
      if (spans.length === 0) {
        issues.push(
          issue(
            "error",
            "onboarding_cutover.deletion_unverifiable",
            `${relativePath}'s Removal Inventory has a row with Disposition "delete" but names no concrete artifact (a backtick-quoted path, key, or identifier) to verify the deletion against.`,
            relativePath,
          ),
        );
        continue;
      }
      for (const span of spans) {
        // Every concrete span is checked, not just ones that look path-shaped by punctuation: a
        // bare extensionless directory name (e.g. `retired`) is a legitimate deletion target with
        // neither a "/" nor a "." in it, and a punctuation heuristic silently exempted exactly that
        // shape from verification. A non-path identifier (a Removal ID, a provider name, an env var)
        // simply will not exist on disk, so checking it costs nothing.
        if (existsSync(path.join(args.root, span))) {
          issues.push(
            issue(
              "error",
              "onboarding_cutover.deletion_not_verified",
              `${relativePath}'s Removal Inventory claims Disposition "delete" for a row naming \`${span}\`, but that path still exists in the repository. Delete it, or correct the manifest.`,
              span,
            ),
          );
        }
      }
    }
  }
}

reportAndExit("Onboarding cutover repository check", issues);

type DeletionManifest = { kind: "missing" } | { kind: "unparseable"; reason: string } | { kind: "parsed"; rows: Array<{ disposition: string; raw: string }> };

/**
 * Removal Inventory table body rows (header and separator rows excluded), located by its own
 * column headers. Distinguishes "no Removal Inventory heading at all" from "heading present but
 * the table beneath it cannot be parsed" (no table, a renamed/missing Disposition column, or zero
 * data rows): both used to return an empty array indistinguishable from "nothing to verify",
 * silently passing a manifest that was removed, or had its Disposition column renamed, while the
 * phrase "Removal Inventory" or the section's own heading text still satisfied check-onboarding-
 * graph.ts's unrelated phrase-presence checks elsewhere in the document.
 */
function deletionManifest(text: string): DeletionManifest {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === "### Removal Inventory");
  if (startIndex === -1) return { kind: "missing" };
  const rest = lines.slice(startIndex + 1);
  const endIndex = rest.findIndex((line) => /^#{1,6}\s/.test(line.trim()));
  const body = endIndex === -1 ? rest : rest.slice(0, endIndex);

  const tableLines = body.map((line) => line.trim()).filter((line) => line.startsWith("|"));
  const headerLine = tableLines[0];
  if (!headerLine) return { kind: "unparseable", reason: "heading has no table beneath it" };
  const header = headerLine.split("|").map((cell) => cell.trim().toLowerCase());
  const dispositionIndex = header.indexOf("disposition");
  if (dispositionIndex === -1) return { kind: "unparseable", reason: "table has no Disposition column" };

  const rows = tableLines
    .slice(1)
    .filter((line) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line))
    .map((line) => ({
      raw: line,
      disposition: (line.split("|")[dispositionIndex] ?? "").trim(),
    }));
  if (rows.length === 0) return { kind: "unparseable", reason: "table has a Disposition column but no data rows" };

  return { kind: "parsed", rows };
}

/** Backtick-quoted spans anywhere in a row's raw text. */
function backtickSpans(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((match) => (match[1] ?? "").trim()).filter((span) => span.length > 0);
}
