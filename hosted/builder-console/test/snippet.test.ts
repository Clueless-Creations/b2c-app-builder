import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckoutGate } from "../analytics/flags.js";
import { analyticsContentSecurityPolicy, renderAnalyticsSnippet, URL_SCRUBBER } from "../analytics/snippet.js";
// From the shared module directly, not via snippet.ts, so this exercises the single source
// both Workers now depend on.
import { analyticsSuppressedByCountry } from "../../shared/geo.js";

const gate: CheckoutGate = { checkoutAvailable: false, reason: "flag_disabled" };
const base = { token: "phc_" + "a".repeat(43), gate, nonce: "n0nce", country: "US" };

test("autocapture is explicitly off — it defaults to true and bypasses the redaction guard", () => {
  // Autocaptured clicks and form values reach PostHog through /relay as an opaque SDK payload,
  // so scrubProperties never inspects them. The console shows a newly created API key once.
  const html = renderAnalyticsSnippet(base);
  assert.match(html, /"autocapture":false/);
});

test("session recording stays off and the SDK is served first-party", () => {
  const html = renderAnalyticsSnippet(base);
  assert.match(html, /"disable_session_recording":true/);
  assert.match(html, /"api_host":"\/relay"/);
  assert.match(html, /\/relay\/static\/array\.js/);
  // ui_host must remain the real PostHog app so toolbar links resolve.
  assert.match(html, /"ui_host":"https:\/\/us\.posthog\.com"/);
});

test("person properties are scrubbed before they are inlined into the page", () => {
  const credential = "b2c_" + "Z".repeat(43);
  const html = renderAnalyticsSnippet({
    ...base,
    accountId: "acct_1",
    personProperties: { email: "person@example.com", leaked_api_key: credential },
  });
  assert.match(html, /person@example\.com/);
  // A credential here would not merely be captured — it would be served in the HTML.
  // Assert on the value, not on the "b2c_" substring: the URL scrubber's own regex contains
  // that prefix by design, so a substring check would pass or fail for the wrong reason.
  assert.equal(html.includes(credential), false);
  assert.equal(html.includes("Z".repeat(43)), false);
});

test("the script tag carries the nonce and cannot be broken out of", () => {
  const html = renderAnalyticsSnippet({ ...base, accountId: "acct_1", personProperties: { note: "</script><img src=x>" } });
  assert.match(html, /<script nonce="n0nce">/);
  // JSON.stringify alone would emit a literal </script> and end the element.
  assert.equal(html.includes("</script><img"), false);
  assert.match(html, /\\u003c\/script/);
});

test("the CSP allows the nonce and keeps connections first-party", () => {
  const csp = analyticsContentSecurityPolicy("n0nce");
  assert.match(csp, /script-src 'self' 'nonce-n0nce'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test("EEA and UK visitors get nothing at all — absence, not opt-out", () => {
  // The published policy promises analytics does not run for these visitors. Returning an empty
  // string means no SDK loads, so no cookie is written, no localStorage key is created and no
  // request is made. persistence:"memory" would still initialise and would break that promise.
  for (const country of ["DE", "FR", "IE", "GB", "NO", "IS", "LI", "de", " gb "]) {
    assert.equal(renderAnalyticsSnippet({ ...base, country }), "", `analytics leaked for ${country}`);
  }
});

test("an unknown country fails closed", () => {
  // Cloudflare sends XX for unresolvable addresses and T1 for Tor, and the header is absent
  // off-platform. Guessing wrong breaks an absolute published promise; suppressing costs data.
  // EU and AP are MaxMind pseudo-codes that pass a two-letter shape check. EU means "somewhere
  // in Europe" — treating it as a non-EEA country is the exact fail-open this guards against.
  for (const country of [undefined, null, "", "XX", "T1", "A1", "A2", "O1", "AP", "EU", "USA", "1"]) {
    assert.equal(renderAnalyticsSnippet({ ...base, country }), "", `analytics leaked for ${String(country)}`);
  }
  assert.equal(analyticsSuppressedByCountry(undefined), true);
  assert.equal(analyticsSuppressedByCountry("XX"), true);
});

test("visitors outside the EEA and UK still get analytics", () => {
  for (const country of ["US", "CA", "AU", "JP", "BR", "us"]) {
    assert.notEqual(renderAnalyticsSnippet({ ...base, country }), "", `analytics wrongly suppressed for ${country}`);
  }
  assert.equal(analyticsSuppressedByCountry("US"), false);
  // Switzerland is neither EU nor EEA, so it is deliberately not on the list.
  assert.equal(analyticsSuppressedByCountry("CH"), false);
});

// Evaluate the exact string that ships in the page, not a re-implementation of it. An inline
// script backing a published disclosure must not be the one thing that goes untested.
const scrub = new Function("return " + URL_SCRUBBER)() as (p: Record<string, unknown>) => Record<string, unknown>;

test("identifier-shaped path segments never leave the browser in a URL", () => {
  const cases: [string, string][] = [
    ["https://app.clueless-creations.com/console/keys/f47ac10b-58cc-4372-a567-0e02b2c3d479", "https://app.clueless-creations.com/console/keys/:id"],
    ["https://app.clueless-creations.com/console/keys/b2c_" + "A".repeat(43), "https://app.clueless-creations.com/console/keys/:id"],
    ["/console/user/person%40example.com", "/console/user/:id"],
    ["/console/user/person@example.com", "/console/user/:id"],
    ["/console/account/" + "z".repeat(40), "/console/account/:id"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(scrub({ $current_url: input }).$current_url, expected, `not scrubbed: ${input}`);
  }
});

test("ordinary console paths are left alone", () => {
  for (const path of ["/console", "/console/keys", "/pricing", "https://clueless-creations.com/"]) {
    assert.equal(scrub({ $current_url: path }).$current_url, path, `wrongly scrubbed: ${path}`);
  }
});

test("UTMs survive, identifying query values do not", () => {
  // The acquisition funnel depends on these, so the scrubber must not be a blunt query strip.
  const url = "https://clueless-creations.com/?utm_source=hacker_news&utm_campaign=launch_v1_2026_06&utm_medium=organic_social";
  assert.equal(scrub({ $current_url: url }).$current_url, url);
  const leaky = "https://app.clueless-creations.com/console?key=b2c_" + "A".repeat(43) + "&email=person%40example.com&utm_source=ad";
  const out = String(scrub({ $current_url: leaky }).$current_url);
  assert.equal(out.includes("b2c_"), false);
  assert.equal(out.includes("person%40example.com"), false);
  assert.match(out, /key=:id/);
  assert.match(out, /email=:id/);
  assert.match(out, /utm_source=ad/, "utm_source must survive");
});

test("every URL-bearing property is scrubbed, and fragments are dropped", () => {
  const dirty = "/console/keys/f47ac10b-58cc-4372-a567-0e02b2c3d479#token";
  const p = scrub({
    $current_url: dirty,
    $pathname: dirty,
    $referrer: dirty,
    $initial_current_url: dirty,
    $initial_pathname: dirty,
    $initial_referrer: dirty,
    unrelated: 42,
  });
  for (const key of ["$current_url", "$pathname", "$referrer", "$initial_current_url", "$initial_pathname", "$initial_referrer"]) {
    assert.equal(p[key], "/console/keys/:id", `${key} not scrubbed`);
  }
  assert.equal(p.unrelated, 42, "non-URL properties must be untouched");
});

test("the scrubber is wired into the rendered snippet", () => {
  const html = renderAnalyticsSnippet({ ...base, accountId: "acct_1" });
  assert.match(html, /sanitize_properties:function\(p\)/);
});
