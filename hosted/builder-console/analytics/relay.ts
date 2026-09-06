/**
 * First-party reverse proxy for PostHog.
 *
 * PostHog still recommends a reverse proxy so tracking blockers do not silently delete the
 * funnel. Of the documented options, a Cloudflare Worker proxy on the app's *own* origin is the
 * strongest: a separate proxy subdomain is still a third-party origin to a blocker heuristic and
 * needs CORS, while `app.clueless-creations.com/relay/*` is indistinguishable from the console's
 * own traffic. PostHog's managed proxy is the lower-effort alternative — see README.md for the
 * trade-off and how to switch.
 *
 * The path is `/relay` on purpose. PostHog's docs call out that blockers match `analytics`,
 * `tracking`, `telemetry`, `posthog`, and `ph`; a name from the design system matches none.
 */

/** US Cloud. The organisation's projects live on us.posthog.com, so these are the US hosts. */
export const API_HOST = "us.i.posthog.com";
export const ASSET_HOST = "us-assets.i.posthog.com";

export const RELAY_PREFIX = "/relay";

/** Static SDK bundles are immutable per version and safe to cache at the edge. */
const ASSET_CACHE_CONTROL = "public, max-age=86400";

const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS"]);

/**
 * Headers that must never leave our origin.
 *
 * This is the whole reason not to copy the reference proxy verbatim. The console's session
 * cookie is `__Host-` prefixed, which forces `Path=/` — so the browser attaches it to every
 * same-origin request, `/relay/*` included. Forwarding headers unchanged would hand a live
 * session cookie to a third party on every captured event.
 */
const STRIPPED_REQUEST_HEADERS = ["cookie", "authorization", "cf-connecting-ip", "x-forwarded-for", "cf-ipcountry"];

/** PostHog has no business setting cookies on our registrable domain. */
const STRIPPED_RESPONSE_HEADERS = ["set-cookie"];

export function isRelayPath(pathname: string): boolean {
  return pathname === RELAY_PREFIX || pathname.startsWith(`${RELAY_PREFIX}/`);
}

/**
 * Proxy one request to PostHog.
 *
 * Returns 404 for anything outside the relay prefix so the caller can mount this without a
 * second path check.
 */
export async function handleRelay(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!isRelayPath(url.pathname)) return new Response("Not found", { status: 404 });
  if (!ALLOWED_METHODS.has(request.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, OPTIONS" } });

  const path = url.pathname.slice(RELAY_PREFIX.length) || "/";
  // `/static/*` is the SDK bundle and lives on the asset host; everything else is ingestion,
  // flag evaluation, and surveys on the API host.
  const isAsset = path.startsWith("/static/");
  const host = isAsset ? ASSET_HOST : API_HOST;

  const headers = new Headers(request.headers);
  for (const name of STRIPPED_REQUEST_HEADERS) headers.delete(name);
  // Delete rather than pin: the incoming Host is our own origin and must not be forwarded, while
  // the runtime derives the correct one from the target URL. A pinned Host would also survive a
  // cross-host redirect under redirect:"follow" and arrive mismatched.
  headers.delete("host");
  // Without this the origin sees `app.clueless-creations.com` and can 302 asset requests.
  headers.delete("origin");
  headers.delete("referer");

  const target = new URL(`https://${host}${path}${url.search}`);
  // `duplex: "half"` is required by the fetch spec whenever the body is a stream. workerd is
  // lenient about it; undici is not, so omitting it makes this module untestable off-runtime.
  const upstream = new Request(target, {
    method: request.method,
    headers,
    body: request.method === "POST" ? request.body : undefined,
    redirect: "follow",
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  let response: Response;
  try {
    response = await fetch(upstream);
  } catch {
    // A relay outage must not surface as a console error to the user.
    return new Response(null, { status: 204 });
  }

  const outgoing = new Headers(response.headers);
  for (const name of STRIPPED_RESPONSE_HEADERS) outgoing.delete(name);
  if (isAsset && response.ok) outgoing.set("Cache-Control", ASSET_CACHE_CONTROL);
  // Same-origin by construction, so no CORS headers are needed or wanted.
  for (const name of ["access-control-allow-origin", "access-control-allow-credentials"]) outgoing.delete(name);

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outgoing });
}
