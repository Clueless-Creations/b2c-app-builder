import assert from "node:assert/strict";
import { test } from "node:test";
import { renderSigninPage } from "../console/pages.js";

test("signed-out front door states the paid four-step purchase path before Google auth", () => {
  const html = renderSigninPage({ entryPoint: "landing", notice: null });

  assert.match(html, /Use the agent you already have\./);
  assert.match(html, /\$19 a month or \$190 a year/);
  assert.match(html, /no free tier or trial/i);
  assert.match(html, /Signing in creates your account; it does not start a paid plan/i);
  assert.match(html, /01[\s\S]*Create your console account with Google/);
  assert.match(html, /02[\s\S]*Choose a plan/);
  assert.match(html, /03[\s\S]*Create a key/);
  assert.match(html, /04[\s\S]*Connect your agent/);
  assert.match(html, /through Stripe/);
  assert.match(html, /Model usage, coding-agent costs, infrastructure, and third-party services are separate/i);
  assert.match(html, /14-day refund policy/i);
  assert.match(html, /\/auth\/google\/start\?entry_point=landing/);
});

test("sign-in notice still renders without changing the purchase explanation", () => {
  const html = renderSigninPage({ entryPoint: "signin", notice: "cancelled" });
  assert.match(html, /Google sign-in was cancelled\. Nothing was created\./);
  assert.match(html, /Choose a plan/);
  assert.match(html, /entry_point=signin/);
});
