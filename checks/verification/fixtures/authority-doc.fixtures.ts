/**
 * Drift guard for docs/authority-envelopes.md (#31): every value in kernel/schema/types.ts's
 * `protectedCategories` array must be named at least once in the design doc, so a sixth
 * protected category added later cannot silently fall out of sync with the doc that claims to
 * enumerate what a founder can and cannot delegate. Same spirit as hosted/builder-console/test/events.test.ts's
 * taxonomy-vs-code check: read the real source of truth, not a copy of it.
 *
 * Repo-only: the design doc lives at the repository root, which an installed runtime does not
 * ship (see _harness.ts's repoCheckoutPresent doc comment).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { protectedCategories } from "../../../kernel/schema/types.js";
import { assert, repoCheckoutPresent, repoRoot, type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  const authorityDocCase: (label: string, fn: () => void) => void = repoCheckoutPresent()
    ? harness.check
    : (label) => harness.skip(label, `repo-only: docs/authority-envelopes.md is not shipped in an installed runtime (checked at ${repoRoot})`);

  authorityDocCase("authority-doc: every protectedCategory value in kernel/schema/types.ts is named in docs/authority-envelopes.md", () => {
    const docPath = path.join(repoRoot, "docs", "authority-envelopes.md");
    let doc: string;
    try {
      doc = readFileSync(docPath, "utf8");
    } catch (error) {
      throw new Error(`docs/authority-envelopes.md is missing at ${docPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    assert(protectedCategories.length > 0, "kernel/schema/types.ts's protectedCategories array must not itself be empty — nothing to check against.");
    const missing = protectedCategories.filter((category) => !doc.includes(category));
    assert(
      missing.length === 0,
      `docs/authority-envelopes.md never names protectedCategory value(s): ${missing.join(", ")}. A category added to kernel/schema/types.ts's protectedCategories must also be named in the design doc's never-authorize/grant coverage.`,
    );
  });
}
