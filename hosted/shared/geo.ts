/**
 * EEA and UK analytics suppression, shared by both Workers.
 *
 * THIS MODULE MUST NOT IMPORT ANYTHING. That is not style, it is the property that makes it
 * safe to share. The hosted Worker is an OAuth authorization server and the app Worker is the
 * console; they are deliberately separate so a fault in one cannot reach the other. A module
 * with dependencies has a fault domain, and importing it from both sides would drag that
 * domain across the boundary — which is exactly the objection that kept D1 access and console
 * rendering unshared. A module of constants and one pure predicate has no fault domain to
 * drag. The first person to add an import here will not realise what they are undoing.
 *
 * It lives here rather than duplicated in each Worker because the two copies it replaces were
 * a security control, not a convenience. A country present in one copy and missing from the
 * other fails open silently, for precisely the population the suppression exists to protect.
 * A drift test can catch that, but only if someone remembers to keep the test honest.
 */

/**
 * Codes that are shaped like a country but are not one.
 *
 * `XX` is Cloudflare's unresolvable address and `T1` is Tor; the rest are MaxMind pseudo-codes
 * that survive a two-letter shape check. `EU` matters most — it means "somewhere in Europe",
 * the exact population this suppression protects, so treating it as an ordinary non-EEA
 * country would be a silent fail-open.
 */
export const NOT_A_COUNTRY: ReadonlySet<string> = new Set(["XX", "T1", "A1", "A2", "O1", "AP", "EU"]);

/** EU 27, the three non-EU EEA states, and the UK. */
export const EEA_AND_UK: ReadonlySet<string> = new Set([
  // EU 27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EEA, not EU
  "IS", "LI", "NO",
  // UK
  "GB",
]);

/**
 * True when analytics must not run for this request.
 *
 * Fail-closed on anything it cannot positively resolve: absent, malformed, or one of the
 * pseudo-codes above. Cloudflare sets CF-IPCountry on every request it serves, but the value
 * can be `XX` for an unresolvable address, `T1` for Tor, or missing entirely off-platform.
 * Suppressing on "don't know" costs a little data. Guessing wrong breaks a promise the
 * published privacy policy states absolutely rather than as best effort.
 *
 * The caller passes the country rather than this reading a header, so neither Worker can
 * forget the decision exists, and so this stays free of any request type.
 */
export function analyticsSuppressedByCountry(country: string | null | undefined): boolean {
  if (country === null || country === undefined) return true;
  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return true;
  if (NOT_A_COUNTRY.has(code)) return true;
  return EEA_AND_UK.has(code);
}
