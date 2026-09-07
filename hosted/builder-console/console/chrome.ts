/**
 * The page shell every console page shares: document, account nav, legal footer,
 * and the Content-Security-Policy every console response carries.
 *
 * The stylesheet itself is `hosted/knowledge-mcp/theme.ts`, shared with the MCP Worker's consent
 * screen so a person moving between the offer page, sign-in, console, and an agent connection
 * prompt stays inside one Clueless Creations visual system.
 *
 * Keep this chrome product-name neutral. The customer-facing name may change, while the technical
 * `b2c` identifiers are stable contracts.
 */

import { BRAND_MARK_SVG, themeCss } from "../../knowledge-mcp/theme.js";

export const CONSOLE_CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

export const SITE_ORIGIN = "https://clueless-creations.com";
export const REPOSITORY_URL = "https://github.com/Clueless-Creations/b2c-app-builder";
export const OFFER_PAGE_URL = `${SITE_ORIGIN}/b2c-app-builder/`;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export type ConsoleSection = "console" | "keys";

export interface ShellNav {
  readonly email: string;
  readonly displayName: string | null;
  readonly signoutCsrfToken: string;
  readonly current?: ConsoleSection;
}

export interface ShellInput {
  readonly title: string;
  readonly body: string;
  readonly nav?: ShellNav;
}

function signedOutNav(): string {
  return `<nav class="site-nav" aria-label="Site"><a href="${OFFER_PAGE_URL}">About</a><a href="${REPOSITORY_URL}">Open source</a><a href="/signin">Sign in</a></nav>`;
}

function signedInNav(nav: ShellNav): string {
  const current = (section: ConsoleSection) => (nav.current === section ? ' aria-current="page"' : "");
  return `<nav class="site-nav" aria-label="Console">
<a href="/console"${current("console")}>Overview</a>
<a href="/console/keys"${current("keys")}>Keys</a>
<span class="who">${escapeHtml(nav.displayName ?? nav.email)}</span>
<form class="row-form" method="post" action="/auth/signout"><input type="hidden" name="signout_token" value="${escapeHtml(nav.signoutCsrfToken)}"><button class="link" type="submit">Sign out</button></form>
</nav>`;
}

export function renderShell(input: ShellInput): string {
  const brandHref = input.nav ? "/console" : "/signin";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(input.title)} | Clueless Creations</title><style>${themeCss({ fonts: true })}</style></head><body>
<header class="site wrap"><a class="brand" href="${brandHref}">${BRAND_MARK_SVG}<span>Clueless Creations <small>Console</small></span></a>${input.nav ? signedInNav(input.nav) : signedOutNav()}</header>
<main class="wrap">
${input.body}
</main>
<footer class="site wrap"><span>Clueless Creations</span><a href="${SITE_ORIGIN}/terms/">Terms</a><a href="${SITE_ORIGIN}/privacy/">Privacy</a><a href="${SITE_ORIGIN}/google-data/">Google data</a><a href="${REPOSITORY_URL}">Open source on GitHub</a>${input.nav ? "<span>Signed in with Google.</span>" : ""}</footer>
</body></html>`;
}

export function consoleHtmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CONSOLE_CSP } });
}
