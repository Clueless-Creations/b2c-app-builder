import { assert, type Harness } from "../fixtures/_harness.js";
import { evaluateGrantCeiling } from "../../../kernel/autonomy/grants.js";
import { makeGrants } from "./_fixtures.js";

export function register(harness: Harness): void {
  harness.check("grants: in-scope action at sufficient grant level is allowed", () => {
    const grants = makeGrants([["domain.engineering", "run-with-guardrails"]]);
    const result = evaluateGrantCeiling(grants, "domain.engineering", "mutate");
    assert(result.ok, `expected ok, got: ${result.reason}`);
    assert(result.grant?.level === "run-with-guardrails", "expected the grant record to be returned on success");
  });

  harness.check("grants: action above the grant ceiling parks with a recorded reason", () => {
    const grants = makeGrants([["domain.engineering", "review-first"]]);
    const result = evaluateGrantCeiling(grants, "domain.engineering", "mutate");
    assert(!result.ok, "expected mutate to exceed a review-first ceiling");
    assert(result.reasonCode === "autonomy.above_grant_level", `expected above_grant_level, got ${result.reasonCode}`);
    assert(result.reason.includes("mutate") && result.reason.includes("review-first"), `reason should name the class and level, got: ${result.reason}`);
  });

  harness.check("grants: no grant at all for the domain parks fail closed", () => {
    const result = evaluateGrantCeiling({}, "domain.growth", "observe");
    assert(!result.ok, "expected no-grant to reject even the lowest action class");
    assert(result.reasonCode === "autonomy.no_grant", `expected no_grant, got ${result.reasonCode}`);
  });

  harness.check("grants: system domains (process, orchestration) are never grantable, fail closed", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    for (const systemDomain of ["domain.process", "domain.orchestration"]) {
      const result = evaluateGrantCeiling(grants, systemDomain, "observe");
      assert(!result.ok, `expected "${systemDomain}" to never be grantable`);
      assert(
        result.reasonCode === "autonomy.system_domain_not_grantable",
        `expected system_domain_not_grantable for ${systemDomain}, got ${result.reasonCode}`,
      );
    }
  });

  harness.check("grants: a catalog-grantable second-business domain is accepted when authority is pinned", () => {
    const grants = makeGrants([["domain.food", "run-with-guardrails"]]);
    const authority = [
      {
        id: "domain.food",
        grantable: true,
        system: false,
        machine: false,
        operatorGroup: "Operations" as const,
        aliases: [],
        protectedCategories: [],
      },
    ];
    const result = evaluateGrantCeiling(grants, "domain.food", "draft", { authority });
    assert(result.ok, `expected catalog-grantable domain.food to pass, got ${result.reasonCode}: ${result.reason}`);
    const unknown = evaluateGrantCeiling(grants, "domain.food", "draft");
    assert(!unknown.ok && unknown.reasonCode === "autonomy.unknown_domain", "without the catalog pin, domain.food must still fail closed");
  });

  harness.check("grants: an unrecognized domain id parks fail closed, not treated as ungranted-but-fine", () => {
    const result = evaluateGrantCeiling({}, "domain.not-a-real-domain", "observe");
    assert(!result.ok, "expected an unknown domain to be rejected");
    assert(result.reasonCode === "autonomy.unknown_domain", `expected unknown_domain, got ${result.reasonCode}`);
  });

  harness.check("grants: an unrecognized action class parks fail closed, even with a full grant", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const result = evaluateGrantCeiling(grants, "domain.engineering", "not-a-real-class");
    assert(!result.ok, "expected an unknown action class to be rejected");
    assert(result.reasonCode === "autonomy.unknown_action_class", `expected unknown_action_class, got ${result.reasonCode}`);
  });

  harness.check("grants: spend/release are ceiling-exempt but still require grant level full", () => {
    for (const actionClass of ["spend", "release"] as const) {
      const guardrails = evaluateGrantCeiling(makeGrants([["domain.money", "run-with-guardrails"]]), "domain.money", actionClass);
      assert(!guardrails.ok, `expected ${actionClass} to be rejected at run-with-guardrails`);
      assert(
        guardrails.reasonCode === "autonomy.protected_class_requires_full",
        `expected protected_class_requires_full for ${actionClass}, got ${guardrails.reasonCode}`,
      );

      const full = evaluateGrantCeiling(makeGrants([["domain.money", "full"]]), "domain.money", actionClass);
      assert(full.ok, `expected ${actionClass} to pass the ceiling gate at full (reason: ${full.reason})`);
    }
  });

  harness.check("grants: destructive requires full (literal ceiling member, but also a direct-protected class)", () => {
    const guardrails = evaluateGrantCeiling(makeGrants([["domain.engineering", "run-with-guardrails"]]), "domain.engineering", "destructive");
    assert(!guardrails.ok, "expected destructive to be rejected below full");
    assert(guardrails.reasonCode === "autonomy.protected_class_requires_full", `expected protected_class_requires_full, got ${guardrails.reasonCode}`);

    const full = evaluateGrantCeiling(makeGrants([["domain.engineering", "full"]]), "domain.engineering", "destructive");
    assert(full.ok, `expected destructive to pass the ceiling gate at full (reason: ${full.reason})`);
  });

  harness.check("grants: review-first only reaches observe/draft", () => {
    const grants = makeGrants([["domain.words", "review-first"]]);
    assert(evaluateGrantCeiling(grants, "domain.words", "observe").ok, "observe should pass at review-first");
    assert(evaluateGrantCeiling(grants, "domain.words", "draft").ok, "draft should pass at review-first");
    assert(!evaluateGrantCeiling(grants, "domain.words", "mutate").ok, "mutate should not pass at review-first");
    assert(!evaluateGrantCeiling(grants, "domain.words", "publish").ok, "publish should not pass at review-first");
  });
}
