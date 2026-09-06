/**
 * The plans Checkout sells must be the plans the access gate admits.
 *
 * `billing/plans.ts` names the Stripe Price lookup_keys a customer can buy, and every entitlement
 * row `billing/webhook.ts` writes is keyed by exactly that lookup_key. The MCP Worker's gate
 * (`hosted/knowledge-mcp/access.ts`) admits the keys listed in `auth.ts`'s
 * READ_SCOPE_LOOKUP_KEYS. A plan sold here but missing there is paid for and refused — the
 * failure this file exists to make impossible to ship.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAN_LOOKUP_KEYS, READ_SCOPE, READ_SCOPE_LOOKUP_KEYS } from "../../knowledge-mcp/auth.js";
import { PLAN_IDS, PLANS } from "../billing/plans.js";

test("every sellable plan's lookup_key grants the read scope at the MCP gate", () => {
  for (const id of PLAN_IDS) {
    const plan = PLANS[id];
    assert.ok(
      (PLAN_LOOKUP_KEYS as readonly string[]).includes(plan.lookupKey),
      `plan "${id}" sells lookup_key "${plan.lookupKey}", which hosted/knowledge-mcp/auth.ts's PLAN_LOOKUP_KEYS does not grant`,
    );
    assert.ok(READ_SCOPE_LOOKUP_KEYS.includes(plan.lookupKey));
  }
});

test("the read scope's own key stays admitted alongside the plans", () => {
  assert.ok(READ_SCOPE_LOOKUP_KEYS.includes(READ_SCOPE));
  assert.equal(new Set(READ_SCOPE_LOOKUP_KEYS).size, READ_SCOPE_LOOKUP_KEYS.length, "no duplicate keys");
});
