/**
 * Browser bootstrap for the server-rendered console and marketing pages.
 *
 * Both surfaces are server-rendered HTML, so there is no bundler and no framework provider —
 * the SDK is injected as a script tag. Server-side capture alone would miss what only the
 * browser can see: referrer, UTMs on first landing, session stitching, and click intent. Both
 * halves are wired, each doing what it is uniquely able to do.
 */

// Shared with the MCP Worker rather than duplicated. Two copies of a country list are a
// security control that fails open silently when they drift, for exactly the population
// the suppression protects.
import { analyticsSuppressedByCountry } from "../../shared/geo.js";
import { scrubProperties } from "./events.js";
import type { CheckoutGate } from "./flags.js";
import { CHECKOUT_FLAG_KEY } from "./flags.js";
import { RELAY_PREFIX } from "./relay.js";

export interface SnippetOptions {
  readonly token: string;
  /** Present only once the session is resolved. Anonymous pages omit it. */
  readonly accountId?: string;
  /** Server-resolved gate, handed to the client so the flag has no async gap on first paint. */
  readonly gate: CheckoutGate;
  /** CSP nonce for the inline script. */
  readonly nonce: string;
  /**
   * The visitor's country from Cloudflare's CF-IPCountry header, passed in rather than read here
   * so the caller cannot forget that this decision exists. Omit it and analytics is suppressed.
   */
  readonly country?: string | null;
  /** Person properties to `$set` at identify. Email belongs here, never in an event. */
  readonly personProperties?: Record<string, string>;
}

/**
 * Escape for embedding inside a <script> element.
 *
 * JSON.stringify alone is not enough: a `</script>` sequence inside any string value closes the
 * element and turns data into markup. Escaping `<` is what prevents that.
 */
function embed(value: unknown): string {
  // U+2028 / U+2029 are literal line terminators in JS source but legal inside a JSON string,
  // so an unescaped one turns valid JSON into a syntax error once inlined.
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Browser-side URL scrubber, inlined into the page.
 *
 * The published policy says we record the URL of pages you visit. That is only safe while console
 * URLs carry no identifiers, and "nobody will put a key id in a path" is a promise rather than a
 * property. This makes it a property: identifier-shaped path segments and query values are
 * replaced before the event leaves the browser, so a future `/console/keys/<key_id>` route cannot
 * quietly turn a published disclosure false.
 *
 * Query KEYS are preserved and only values are redacted, so utm_source and friends survive — the
 * acquisition funnel depends on them. The 32-character threshold for opaque values is set above
 * realistic campaign names for the same reason.
 */
export const URL_SCRUBBER = `function(p){
var ID=/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|b2c_[A-Za-z0-9_-]{43}|ph[cxs]_[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{32,})$/i;
var MAIL=/@|%40/;
var seg=function(v){return v.split("/").map(function(x){return x&&(ID.test(x)||MAIL.test(x))?":id":x;}).join("/");};
var one=function(v){
if(typeof v!=="string")return v;
var h=v.split("#"),q=h[0].split("?"),path=seg(q[0]),rest=q.slice(1).join("?");
if(rest){rest=rest.split("&").map(function(kv){var i=kv.indexOf("=");if(i<0)return kv;var k=kv.slice(0,i),val=decodeURIComponent(kv.slice(i+1));return k+"="+(ID.test(val)||MAIL.test(val)?":id":kv.slice(i+1));}).join("&");}
return path+(rest?"?"+rest:"");
};
var keys=["$current_url","$pathname","$referrer","$initial_current_url","$initial_pathname","$initial_referrer"];
for(var i=0;i<keys.length;i++){if(keys[i] in p)p[keys[i]]=one(p[keys[i]]);}
return p;
}`;

/**
 * Render the bootstrap script.
 *
 * `api_host` is the first-party relay, so requests are same-origin. `ui_host` still points at
 * PostHog so the toolbar and "view in PostHog" links resolve to the real app.
 *
 * Flags are bootstrapped from the server's own evaluation. Without that, client-side evaluation
 * is async and the upgrade surface would render the collector, then flip — visible flicker, and
 * a flag value that disagrees with the server's for one frame.
 */
// Re-exported so console callers have one obvious import, still resolving to the shared source.
export { analyticsSuppressedByCountry } from "../../shared/geo.js";

export function renderAnalyticsSnippet(options: SnippetOptions): string {
  // Nothing at all for EEA/UK visitors: no script, so no SDK, no cookie, no localStorage key and
  // no network request. The page promises absence, not opt-out.
  if (analyticsSuppressedByCountry(options.country)) return "";

  const bootstrap: Record<string, unknown> = {
    featureFlags: { [CHECKOUT_FLAG_KEY]: options.gate.checkoutAvailable },
  };
  if (options.accountId !== undefined) bootstrap.distinctID = options.accountId;

  const config = {
    api_host: RELAY_PREFIX,
    ui_host: "https://us.posthog.com",
    // The console is behind auth and renders account data; recording it is a separate decision
    // with its own privacy review, so it stays off until that decision is made.
    disable_session_recording: true,
    // Autocapture defaults to TRUE and must be turned off explicitly here.
    //
    // It harvests clicks, form submissions and element text, and it reaches PostHog through the
    // relay as an opaque SDK payload — scrubProperties never sees it, so the redaction guard in
    // events.ts offers no protection whatsoever on this path. The console displays a newly
    // created API key exactly once; an autocaptured click on that screen is the one way this
    // platform could ship a live credential to a third party. Everything this taxonomy needs is
    // captured explicitly by name, so autocapture buys nothing to offset that.
    autocapture: false,
    // Kept: $pageview is the funnel's entry step. Console URLs are opaque paths and must stay
    // that way — never put a key id or an email in a path segment.
    capture_pageview: true,
    persistence: "localStorage+cookie",
    bootstrap,
  };

  // Every other identify path reaches PostHog through capture(), which scrubs. This one inlines
  // straight into the page, so it has to scrub for itself — a credential handed to
  // renderAnalyticsSnippet would not merely be captured, it would be served in the HTML.
  const person = options.personProperties === undefined ? undefined : scrubProperties(options.personProperties, "drop").properties;
  const hasPerson = person !== undefined && Object.keys(person).length > 0;
  const identify = options.accountId === undefined ? "" : `ph.identify(${embed(options.accountId)}${hasPerson ? `,${embed(person)}` : ""});`;

  return [
    `<script nonce="${options.nonce}">`,
    `!function(){var s=document.createElement("script");s.async=!0;s.src=${embed(`${RELAY_PREFIX}/static/array.js`)};`,
    // sanitize_properties is a function, so it is grafted on after the JSON rather than inside it.
    `s.onload=function(){var ph=window.posthog;if(!ph)return;ph.init(${embed(options.token)},Object.assign(${embed(config)},{sanitize_properties:${URL_SCRUBBER}}));${identify}};`,
    `document.head.appendChild(s)}();`,
    `</script>`,
  ].join("");
}

/** CSP for a page carrying the snippet. `connect-src 'self'` is sufficient — the relay is first-party. */
export function analyticsContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}
