import { evaluateGrantCeiling } from "../../../kernel/autonomy/grants.js";
import { standingFounderAgreement } from "../../../kernel/operating-model/agreements.js";
import { revokeMandate, standingFounderMandate } from "../../../kernel/operating-model/mandates.js";
import { assert, type Harness } from "../fixtures/_harness.js";
import { makeGrants } from "./_fixtures.js";

const NOW = "2026-08-22T20:00:00.000Z";

export function register(harness: Harness): void {
  harness.check("grants: requireMandate refuses credentials-shaped access without a current mandate", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const without = evaluateGrantCeiling(grants, "domain.engineering", "mutate", { requireMandate: true, now: NOW });
    assert(!without.ok, "requireMandate must refuse when no mandate is bound");
    assert(without.reasonCode === "authority.mandate_required", `expected mandate_required, got ${without.reasonCode}`);
  });

  harness.check("grants: a revoked mandate fails closed at the grant boundary", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const agreement = standingFounderAgreement(NOW);
    const mandate = revokeMandate(standingFounderMandate(agreement, "domain.engineering", "mutate", NOW), NOW);
    const result = evaluateGrantCeiling(grants, "domain.engineering", "mutate", { requireMandate: true, mandate, now: NOW });
    assert(!result.ok, "revoked mandate must fail closed");
    assert(result.reasonCode === "authority.mandate_required", `expected mandate_required, got ${result.reasonCode}`);
  });
}
