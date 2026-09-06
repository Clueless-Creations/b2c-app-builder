import { BRAND_MARK_SVG, themeCss } from "./theme.js";
import OAuthProvider, {
  AuthorizationError,
  CimdFetchError,
  OAuthError,
  ExternalTokenError,
  type AuthRequest,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { AccessError, READ_SCOPE, constantTimeEqual, issueConsentToken, sha256, verifyConsentToken, validateRedirectUri } from "./auth.js";
import { resolveApiKeyAccess, resolveGrantAccess } from "./access.js";
import { failure, RequestError, uniqueParams } from "./http.js";

type OAuthEnv = Env & { OAUTH_PROVIDER?: OAuthHelpers };
type ConsentError = "missing_key" | "invalid_key" | "invalid_challenge";
const COOKIE_PREFIX = "__Host-b2c-consent-";
const AUTH_PARAMS = ["client_id", "redirect_uri", "response_type", "state", "scope", "code_challenge", "code_challenge_method", "resource"];
/** The consent screen shares the console theme. This Worker serves no font files. */
const AUTH_PAGE_STYLES = themeCss({ fonts: false });
const AUTH_PAGE_HEADER = `<header class="site wrap"><span class="brand">${BRAND_MARK_SVG}<span>Clueless Creations <small>Hosted access</small></span></span></header>`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function consentPage(clientName: string, destination: string, csrf: string, error?: ConsentError): string {
  const keyError =
    error === "missing_key"
      ? "Enter your owner API key to allow read access."
      : error === "invalid_key"
        ? "This key cannot connect your agent. Check the owner key in Doppler and try again."
        : undefined;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect hosted access | Clueless Creations</title><style>${AUTH_PAGE_STYLES}</style></head><body>
${AUTH_PAGE_HEADER}<main class="wrap">
<p class="eyebrow">Connect your agent</p><h1>Allow read access.</h1>
<p class="lede"><strong>${escapeHtml(clientName)}</strong> wants to read the workflows and references available through your hosted account.</p>
<dl><dt>It can read</dt><dd>Workflows, guidance, and source-backed knowledge.</dd>
<dt>It cannot touch</dt><dd>Your local files, business state, approvals, or app execution.</dd>
<dt>When you finish</dt><dd>You return to ${escapeHtml(destination)}</dd></dl>
${error === "invalid_challenge" ? '<p class="notice" role="alert">This connection request expired or could not be verified. No access was granted. Enter your owner key to try again, or cancel. If this happens again, allow cookies for this page.</p>' : ""}
<form method="post"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<label for="api-key">Owner API key</label><input id="api-key" name="api_key" type="password" value="" autocomplete="off" spellcheck="false" aria-describedby="key-help${keyError ? " key-error" : ""}"${keyError ? ' aria-invalid="true"' : ""} maxlength="128" required>
${keyError ? `<p class="field-error" id="key-error" role="alert">${keyError}</p>` : ""}
<p class="help" id="key-help">Use B2C_APP_BUILDER_API_KEY from Doppler’s b2c / prd config. Your MCP client receives an OAuth token, not this key.</p>
<div class="actions"><button name="decision" value="allow" type="submit">Allow read access</button><button class="secondary" name="decision" value="deny" type="submit" formnovalidate>Cancel</button></div>
</form><footer>Owner access only. Authorization records are stored on Cloudflare. This application does not retain knowledge queries. Cloudflare and your MCP client process connection data.</footer>
</main></body></html>`;
}

/** Fixed recovery text only: never reflect an authorization request or credential. */
export function browserAuthorizationFailure(request: Request, status: number, headers: HeadersInit): Response | undefined {
  if (
    (status !== 429 && (status < 500 || status > 599)) ||
    (request.method !== "GET" && request.method !== "POST") ||
    new URL(request.url).pathname !== "/oauth/authorize"
  )
    return undefined;
  const acceptsHtml = (request.headers.get("accept") ?? "").split(",").some((range) => {
    const [mediaType, ...parameters] = range.toLowerCase().split(";");
    return mediaType?.trim() === "text/html" && !parameters.some((parameter) => /^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(parameter));
  });
  if (!acceptsHtml) return undefined;
  const rateLimited = status === 429;
  const title = rateLimited ? "Wait a minute, then reconnect." : "Hosted access is unavailable.";
  const guidance = rateLimited
    ? "<p>Too many connection requests arrived at once. Wait at least one minute before trying again.</p><p>Reload this page, or return to your agent and start a new connection. If your browser asks to resend a form, cancel and restart from your agent.</p>"
    : "<p>The service cannot complete this connection right now.</p><p>Check the hosted service before retrying. Once it is available, return to your agent and start a new connection.</p>";
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  responseHeaders.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  return new Response(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | Clueless Creations</title><style>${AUTH_PAGE_STYLES}</style></head><body>
${AUTH_PAGE_HEADER}<main class="wrap">
<p class="eyebrow">Connect your agent</p><h1>${title}</h1>
${guidance}
<footer>Owner access only. Manage this connection from your agent.</footer>
</main></body></html>`,
    { status, headers: responseHeaders },
  );
}

async function validatedAuthorization(request: Request, helpers: OAuthHelpers, origin: string, trusted: readonly string[]): Promise<AuthRequest> {
  const query = uniqueParams(new URL(request.url).searchParams, AUTH_PARAMS);
  if (
    !query.client_id ||
    query.client_id.length > 256 ||
    !query.redirect_uri ||
    !validateRedirectUri(query.redirect_uri, trusted) ||
    query.response_type !== "code" ||
    query.scope !== READ_SCOPE ||
    !query.state ||
    query.state.length > 512 ||
    query.code_challenge_method !== "S256" ||
    !query.code_challenge ||
    !/^[A-Za-z0-9_-]{43}$/.test(query.code_challenge) ||
    (query.resource !== undefined && query.resource !== `${origin}/mcp`)
  )
    throw new RequestError(400, "invalid_request");
  try {
    return await helpers.parseAuthRequest(request);
  } catch (error) {
    if (error instanceof AuthorizationError) throw new RequestError(400, "invalid_request");
    if (error instanceof CimdFetchError) throw new RequestError(400, "invalid_client");
    throw error;
  }
}

function cookieValue(request: Request, name: string): string | undefined {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0]!.slice(name.length + 1) : undefined;
}

async function handleConsent(request: Request, env: OAuthEnv, trusted: readonly string[]): Promise<Response> {
  if (new URL(request.url).pathname !== "/oauth/authorize") return failure(404, "not_found");
  const helpers = env.OAUTH_PROVIDER;
  if (!helpers) throw new AccessError(503);
  const authRequest = await validatedAuthorization(request, helpers, env.B2C_APP_BUILDER_PUBLIC_ORIGIN, trusted);
  const params = new URL(request.url).searchParams.toString();
  const cookieName = `${COOKIE_PREFIX}${await sha256(params)}`;
  const cookieAttributes = "Secure; HttpOnly; SameSite=Lax; Path=/";
  const renderConsent = async (status = 200, error?: ConsentError): Promise<Response> => {
    const client = await helpers.lookupClient(authRequest.clientId);
    if (!client) throw new RequestError(400, "invalid_request");
    const token = await issueConsentToken(env.B2C_APP_BUILDER_AUTH_SECRET, params);
    const headers = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(authRequest.redirectUri).origin}; base-uri 'none'; frame-ancestors 'none'`,
      "Set-Cookie": `${cookieName}=${token}; ${cookieAttributes}; Max-Age=300`,
    });
    if (status === 401)
      headers.set("WWW-Authenticate", `Bearer resource_metadata="${env.B2C_APP_BUILDER_PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
    return new Response(consentPage(client.clientName || "Your MCP client", authRequest.redirectUri, token, error), { status, headers });
  };
  if (request.method === "GET") return renderConsent();
  if (request.headers.get("origin") !== env.B2C_APP_BUILDER_PUBLIC_ORIGIN) throw new RequestError(403, "access_denied");
  const form = uniqueParams(new URLSearchParams(await request.text()), ["csrf", "api_key", "decision"]);
  const cookie = cookieValue(request, cookieName);
  if (!form.csrf || !cookie || !constantTimeEqual(cookie, form.csrf) || !(await verifyConsentToken(env.B2C_APP_BUILDER_AUTH_SECRET, form.csrf, params)))
    return renderConsent(403, "invalid_challenge");
  const headers = new Headers({ "Set-Cookie": `${cookieName}=; ${cookieAttributes}; Max-Age=0` });
  if (form.decision === "deny") {
    const redirect = new URL(authRequest.redirectUri);
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("state", authRequest.state);
    redirect.searchParams.set("iss", env.B2C_APP_BUILDER_PUBLIC_ORIGIN);
    headers.set("Location", redirect.toString());
    return new Response(null, { status: 303, headers });
  }
  if (form.decision !== "allow") throw new RequestError(400, "invalid_request");
  if (!form.api_key) return renderConsent(400, "missing_key");
  let principal;
  try {
    principal = (await resolveApiKeyAccess(env, form.api_key)).principal;
  } catch (error) {
    if (error instanceof AccessError && (error.status === 401 || error.status === 403)) return renderConsent(error.status, "invalid_key");
    throw error;
  }
  const result = await helpers.completeAuthorization({
    request: authRequest,
    userId: principal.subject,
    scope: [READ_SCOPE],
    props: principal,
    metadata: { label: "Hosted knowledge access" },
  });
  headers.set("Location", result.redirectTo);
  return new Response(null, { status: 303, headers });
}

/** Construct per request: neither OAuth helper state nor caller identity is shared. */
export function createOAuthProvider(env: Env, trusted: readonly string[], mcp: ExportedHandler<OAuthEnv>) {
  const resource = `${env.B2C_APP_BUILDER_PUBLIC_ORIGIN}/mcp`;
  return new OAuthProvider<OAuthEnv>({
    apiRoute: "/mcp",
    apiHandler: { fetch: mcp.fetch! },
    defaultHandler: { fetch: (request, requestEnv) => handleConsent(request, requestEnv, trusted) },
    authorizeEndpoint: "/oauth/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    accessTokenTTL: 600,
    refreshTokenTTL: 604_800,
    clientRegistrationTTL: 7_776_000,
    scopesSupported: [READ_SCOPE],
    allowPlainPKCE: false,
    allowImplicitFlow: false,
    allowTokenExchangeGrant: false,
    clientIdMetadataDocumentEnabled: true,
    resourceMatchOriginOnly: false,
    resourceMetadata: {
      resource,
      authorization_servers: [env.B2C_APP_BUILDER_PUBLIC_ORIGIN],
      scopes_supported: [READ_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Clueless Creations hosted knowledge",
    },
    clientRegistrationCallback: ({ clientMetadata }) => {
      const redirects = clientMetadata.redirect_uris;
      if (
        !Array.isArray(redirects) ||
        redirects.length === 0 ||
        redirects.length > 8 ||
        !redirects.every((uri: unknown) => typeof uri === "string" && validateRedirectUri(uri, trusted)) ||
        (clientMetadata.client_name !== undefined && (typeof clientMetadata.client_name !== "string" || clientMetadata.client_name.length > 120)) ||
        clientMetadata.software_statement !== undefined
      )
        return { code: "invalid_client_metadata", description: "Client registration is not allowed." };
      return undefined;
    },
    tokenExchangeCallback: async (options) => {
      let principal;
      try {
        principal = (await resolveGrantAccess(env, options.props)).principal;
        if (options.userId !== principal.subject) throw new AccessError(403);
      } catch {
        throw new OAuthError("invalid_grant", { description: "Authorization is no longer valid." });
      }
      const effective = options.requestedScope.filter((scope) => options.scope.includes(scope) && principal.scopes.includes(scope as typeof READ_SCOPE));
      if (!effective.includes(READ_SCOPE)) throw new OAuthError("invalid_scope", { description: "Read permission is required." });
      return { accessTokenScope: effective, accessTokenProps: { ...principal, scopes: effective } };
    },
    resolveExternalToken: async ({ token }) => {
      try {
        return { props: (await resolveApiKeyAccess(env, token)).principal, audience: resource };
      } catch (error) {
        if (error instanceof AccessError && error.status === 403)
          throw new ExternalTokenError("insufficient_scope", { description: "Access denied", statusCode: 403 });
        return null;
      }
    },
    onError: ({ code, status, headers }) => failure(status, code, headers),
  });
}
