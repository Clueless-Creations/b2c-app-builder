import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { skillRoot, type Harness } from "./_harness.js";
import {
  DESIGN_TASTE_DIMENSIONS,
  DESIGN_TASTE_RUBRIC,
  KNOWN_UNMAPPED_WORTHINESS_RULES,
  MAPPED_WORTHINESS_RULES,
  PINNED_KNOWLEDGE_REFERENCES,
  findRubricDimension,
  findRubricPinDrift,
  knowledgeSourceSha256,
  worthinessRuleNumbers,
} from "../../../../tooling/lib/design-taste-rubric.js";

/**
 * design-taste-rubric.fixtures.ts — proves the rubric's content-hash pin against
 * knowledge/design/vibecoded-tells.md and knowledge/design/design-worthiness.md, and the
 * manifest's own referential integrity (unique keys, every dimension pointing at one of the
 * two pinned references).
 *
 * The pin fixture is deliberately not "assert findRubricPinDrift(skillRoot) is empty" alone —
 * that would pass just as well if findRubricPinDrift were a stub that always returns []. Each
 * check here also proves the underlying hash function is sensitive to content, by hashing a
 * synthetic mutated copy of a real knowledge doc in a throwaway fixture directory and asserting
 * the result differs from the live pin. A maintainer who edits either knowledge doc for real
 * sees exactly that failure until DESIGN_TASTE_RUBRIC_VERSION is reviewed and the pin updated.
 */
export function register(harness: Harness): void {
  const check = (label: string, run: () => void): void => {
    try {
      run();
      harness.results.push({ label, ok: true, expectedCode: 0, actualCode: 0, output: "" });
    } catch (error) {
      harness.results.push({ label, ok: false, expectedCode: 0, actualCode: 1, output: error instanceof Error ? error.message : String(error) });
    }
  };

  check("both pinned knowledge references match the live document content", () => {
    const drift = findRubricPinDrift(skillRoot);
    assert.deepEqual(drift, [], `expected no drift, got: ${JSON.stringify(drift)}`);
  });

  check("knowledgeSourceSha256 changes when a document's bytes change (proves the pin can fail)", () => {
    const fixtureRoot = harness.makeEmptyFixture("design-taste-rubric-drift");
    const reference = PINNED_KNOWLEDGE_REFERENCES.find((candidate) => candidate.referenceId === "reference.design.vibecoded-tells");
    assert.ok(reference, "reference.design.vibecoded-tells must be a pinned reference");
    const mutatedPath = path.join(fixtureRoot, reference!.documentPath);
    mkdirSync(path.dirname(mutatedPath), { recursive: true });
    writeFileSync(mutatedPath, "# Mutated for the fixture — not the real document.\n", "utf8");

    const mutatedHash = knowledgeSourceSha256(fixtureRoot, reference!.documentPath);
    assert.notEqual(mutatedHash, reference!.sourceSha256, "a content change must change the hash, or the pin can never fail");

    const liveHash = knowledgeSourceSha256(skillRoot, reference!.documentPath);
    assert.equal(liveHash, reference!.sourceSha256, "the live document must still match its pin (see the previous check)");
  });

  check("every dimension key is unique", () => {
    const keys = DESIGN_TASTE_DIMENSIONS.map((dimension) => dimension.key);
    assert.equal(new Set(keys).size, keys.length, `duplicate dimension key(s): ${JSON.stringify(keys)}`);
  });

  check("every dimension points at a pinned reference", () => {
    const pinnedIds = new Set(PINNED_KNOWLEDGE_REFERENCES.map((reference) => reference.referenceId));
    for (const dimension of DESIGN_TASTE_DIMENSIONS) {
      assert.ok(pinnedIds.has(dimension.sourceReferenceId), `${dimension.key} cites ${dimension.sourceReferenceId}, which is not a pinned reference`);
    }
  });

  check("a tier:taste dimension never carries a severity ceiling", () => {
    for (const dimension of DESIGN_TASTE_DIMENSIONS) {
      if (dimension.tier === "taste") {
        assert.equal(
          dimension.severity,
          undefined,
          `${dimension.key} is tier:"taste" and must carry no severity because it records an authorized judgment instead of a computed score`,
        );
      } else {
        assert.notEqual(dimension.severity, undefined, `${dimension.key} is tier:"${dimension.tier}" and must declare a severity ceiling`);
      }
    }
  });

  check("findRubricDimension resolves every declared key and rejects an unknown one", () => {
    for (const dimension of DESIGN_TASTE_DIMENSIONS) {
      assert.equal(findRubricDimension(dimension.key)?.key, dimension.key);
    }
    assert.equal(findRubricDimension("worthiness.not_a_real_dimension"), undefined);
  });

  // Every numbered design-worthiness heading must have a dimension or sit in
  // KNOWN_UNMAPPED_WORTHINESS_RULES. Mapping 10 and 11 closed the historical ten-of-twelve gap;
  // adding rule 13 without a dimension still fails here.
  check("every design-worthiness rule is either mapped or declared unmapped", () => {
    const declared = worthinessRuleNumbers(skillRoot);
    assert.ok(declared.length > 0, "design-worthiness.md must declare numbered rules for this check to mean anything");
    const accounted = [...MAPPED_WORTHINESS_RULES, ...KNOWN_UNMAPPED_WORTHINESS_RULES].sort((left, right) => left - right);
    assert.deepEqual(
      declared,
      accounted,
      `design-worthiness.md declares rules ${JSON.stringify(declared)}, but the rubric accounts for ${JSON.stringify(accounted)}. ` +
        "Map the new rule to a dimension, or add it to KNOWN_UNMAPPED_WORTHINESS_RULES with the reason.",
    );
    for (const rule of KNOWN_UNMAPPED_WORTHINESS_RULES) {
      assert.ok(!MAPPED_WORTHINESS_RULES.includes(rule), `rule ${rule} cannot be both mapped and declared unmapped`);
    }
  });

  check("rules 10 and 11 reuse the document's declared tiers and severities", () => {
    assert.ok(MAPPED_WORTHINESS_RULES.includes(10) && MAPPED_WORTHINESS_RULES.includes(11), "rules 10 and 11 must be mapped");
    assert.ok(
      !KNOWN_UNMAPPED_WORTHINESS_RULES.includes(10) && !KNOWN_UNMAPPED_WORTHINESS_RULES.includes(11),
      "rules 10 and 11 must not stay in the unmapped hole",
    );
    const nativeFlow = findRubricDimension("worthiness.native_flow_semantics");
    assert.equal(nativeFlow?.tier, "attested");
    assert.equal(nativeFlow?.severity, "warning");
    assert.equal(nativeFlow?.automatedByGrader, false);
    const undeclaredColor = findRubricDimension("worthiness.anti_generic_undeclared_color");
    assert.equal(undeclaredColor?.tier, "mechanical");
    assert.equal(undeclaredColor?.severity, "error");
    assert.equal(undeclaredColor?.automatedByGrader, true);
    const antiGenericRemainder = findRubricDimension("worthiness.anti_generic_consistency");
    assert.equal(antiGenericRemainder?.tier, "attested");
    assert.equal(antiGenericRemainder?.severity, "warning");
    assert.equal(antiGenericRemainder?.automatedByGrader, false);
  });

  check("the exported rubric composes the same version, references, and dimensions", () => {
    assert.equal(DESIGN_TASTE_RUBRIC.rubricVersion.length > 0, true);
    assert.equal(DESIGN_TASTE_RUBRIC.pinnedReferences, PINNED_KNOWLEDGE_REFERENCES);
    assert.equal(DESIGN_TASTE_RUBRIC.dimensions, DESIGN_TASTE_DIMENSIONS);
  });
}
