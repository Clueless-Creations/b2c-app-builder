/**
 * Behaviour of the shared EEA/UK suppression predicate.
 *
 * These assertions replace an earlier drift test that compared two duplicated copies. The
 * duplication is gone — hosted/shared/geo.ts owns the rule and both Workers import it — so what
 * is worth pinning now is the behaviour itself, and above all the direction it fails in.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { test } from "node:test";
import { analyticsSuppressedByCountry, EEA_AND_UK, NOT_A_COUNTRY } from "../../shared/geo.js";

test("suppression fails closed on anything it cannot positively resolve", () => {
  // Absent and malformed, then the codes that survive a two-letter shape check without
  // naming a country. EU is the one that matters: it means "somewhere in Europe", so
  // treating it as an ordinary country would fail open for the protected population.
  for (const value of [null, undefined, "", " ", "USA", "u", "1S", "XX", "T1", "A1", "A2", "O1", "AP", "EU"])
    assert.equal(analyticsSuppressedByCountry(value), true, `${String(value)} must suppress`);
});

test("every code in the shared sets suppresses", () => {
  for (const code of [...EEA_AND_UK, ...NOT_A_COUNTRY]) assert.equal(analyticsSuppressedByCountry(code), true, `${code} must suppress`);
  // The EEA is not the EU: Iceland, Liechtenstein and Norway are in, and the UK is in on its
  // own footing. Getting this wrong is the likeliest way the set silently loses someone.
  for (const code of ["IS", "LI", "NO", "GB"]) assert.equal(EEA_AND_UK.has(code), true, `${code} missing`);
  assert.equal(EEA_AND_UK.size, 31, "EU 27 + IS/LI/NO + GB");
});

test("elsewhere is not suppressed, and header casing does not decide it", () => {
  // Switzerland is the useful negative: in Europe, in neither the EU nor the EEA.
  for (const code of ["US", "CA", "AU", "JP", "BR", "CH"]) assert.equal(analyticsSuppressedByCountry(code), false, `${code} must not suppress`);
  assert.equal(analyticsSuppressedByCountry(" de "), true, "a header value may arrive padded");
  assert.equal(analyticsSuppressedByCountry("us"), false, "and lowercased");
});

test("the shared module has no imports, which is what makes it safe to share", async () => {
  // Both Workers bundle this. A dependency-free module of constants and a pure predicate has
  // no fault domain, so sharing it cannot drag one Worker's failures into the other — which is
  // the whole reason D1 access and console rendering stayed unshared. Asserting it here means
  // the property is enforced rather than requested in a comment nobody re-reads.
  const source = await readFile(fileURLToPath(new NodeURL("../../shared/geo.ts", import.meta.url)), "utf8");
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.equal(
    /(^|\n)\s*import\s/.test(withoutComments),
    false,
    "hosted/shared/geo.ts must not import anything — adding one couples the two Workers through it",
  );
  assert.equal(/\brequire\s*\(/.test(withoutComments), false, "nor require()");
});
