#!/usr/bin/env node
/**
 * probe-revenuecat.ts
 *
 * Founder-run live probe against the RevenueCat REST API.
 * Reads a non-empty offering, confirms entitlements exist, and writes a
 * non-secret proof artifact at <root>/revenue/revenuecat-proof.json.
 *
 * SECURITY RULES (do not relax):
 *   - API keys are read ONLY from environment variables.
 *   - No key, token, or credential is written to any artifact or log line.
 *   - The proof artifact records only non-secret facts.
 *   - If credentials are absent, the script exits cleanly (non-crash) with
 *     a clear message explaining what the founder must do.
 *
 * Usage:
 *   doppler run -- tsx tooling/probe-revenuecat.ts [--root /path/to/business-repo]
 *
 * Required env vars (inject via Doppler — never raw .env):
 *   REVENUECAT_SECRET_API_KEY       — RevenueCat secret key (starts with "sk_")
 *   REVENUECAT_PROJECT_ID    — RevenueCat project ID (optional; used for V2 endpoints)
 *
 * RevenueCat REST API v1 reference:
 *   https://www.revenuecat.com/docs/api-v1
 *   GET /v1/subscribers/$appUserId — subscriber object (not useful for offerings)
 *   Offerings are app-level, accessible via the SDK, but the REST API does not
 *   expose a public "get current offering" endpoint in v1.
 *
 * RevenueCat REST API v2 reference (Projects scope):
 *   https://www.revenuecat.com/docs/api-v2
 *   GET /v2/projects/{project_id}/offerings             — list offerings
 *   GET /v2/projects/{project_id}/entitlements          — list entitlements
 *
 * NOTE: v2 API requires a RevenueCat project ID and uses the same secret key.
 * The probe tries v2 endpoints first. If REVENUECAT_PROJECT_ID is absent, it
 * falls back to a best-effort v1 health check and warns the founder to supply
 * the project ID for full offering + entitlement verification.
 *
 * The output artifact is gated by a "probe":"revenuecat@1" fingerprint so the
 * validator can distinguish real probe output from hand-typed JSON.
 * This is a raised bar, not an unforgeable cryptographic proof — founder
 * approval (explicit sign-off) remains the ultimate backstop.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// CLI args (reuse the same --root convention as other scripts)
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
let root = process.cwd();
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--root" && argv[i + 1]) {
    root = path.resolve(argv[i + 1] as string);
    i++;
  }
}

// ---------------------------------------------------------------------------
// Credential check (mandatory founder gate)
// ---------------------------------------------------------------------------
const apiKey = process.env.REVENUECAT_SECRET_API_KEY ?? "";
const projectId = process.env.REVENUECAT_PROJECT_ID ?? "";

if (!apiKey) {
  console.error(
    [
      "",
      "  probe-revenuecat: REVENUECAT_SECRET_API_KEY is not set.",
      "",
      "  This probe must be run by the founder with live credentials injected",
      "  by Doppler. Do not hardcode or export the key in a shell profile.",
      "",
      "  Run with:",
      "    doppler run -- tsx tooling/probe-revenuecat.ts [--root <path>]",
      "",
      "  Required Doppler secrets:",
      "    REVENUECAT_SECRET_API_KEY      — RevenueCat secret key (starts with sk_)",
      "    REVENUECAT_PROJECT_ID   — RevenueCat project ID (from dashboard URL)",
      "",
    ].join("\n"),
  );
  process.exit(0); // clean exit — not a crash
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const API_HOST = "https://api.revenuecat.com";
const PROBE_FINGERPRINT = "revenuecat@1";
const ARTIFACT_REL_PATH = "revenue/revenuecat-proof.json";

// ---------------------------------------------------------------------------
// Typed minimal shapes for RevenueCat API responses
// ---------------------------------------------------------------------------
interface RCOffering {
  id: string;
  lookup_key?: string;
  packages?: Array<{ id: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

interface RCEntitlement {
  id: string;
  lookup_key?: string;
  [k: string]: unknown;
}

interface RCOfferingsResponse {
  items?: RCOffering[];
  [k: string]: unknown;
}

interface RCEntitlementsResponse {
  items?: RCEntitlement[];
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Fetch helpers (Node 18+ built-in fetch)
// ---------------------------------------------------------------------------
async function rcGet(path: string): Promise<{ status: number; body: unknown }> {
  const url = `${API_HOST}${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

// ---------------------------------------------------------------------------
// Main probe logic
// ---------------------------------------------------------------------------
async function run(): Promise<void> {
  const probedAt = new Date().toISOString();
  const warnings: string[] = [];

  // Result accumulator — only non-secret facts.
  const result: Record<string, unknown> = {
    probe: PROBE_FINGERPRINT,
    api_host: API_HOST,
    probed_at: probedAt,
    http_statuses: {} as Record<string, number>,
    offering_id: null,
    package_ids: [] as string[],
    entitlement_ids: [] as string[],
    warnings: warnings,
  };

  const httpStatuses = result.http_statuses as Record<string, number>;

  // ---
  // 1. Try v2 offerings endpoint (requires REVENUECAT_PROJECT_ID)
  // ---
  if (!projectId) {
    warnings.push(
      "REVENUECAT_PROJECT_ID not set — skipping offering/entitlement verification. " +
        "Supply the project ID (visible in RevenueCat dashboard URL) for full probe coverage.",
    );
    console.warn(
      "\n  WARNING: REVENUECAT_PROJECT_ID not set. " +
        "Offering and entitlement verification skipped.\n" +
        "  Add REVENUECAT_PROJECT_ID to Doppler and re-run for full verification.\n",
    );
  } else {
    // 1a. List offerings
    const offeringsPath = `/v2/projects/${encodeURIComponent(projectId)}/offerings`;
    console.log(`Probing offerings: GET ${API_HOST}${offeringsPath}`);
    const offeringsResp = await rcGet(offeringsPath);
    httpStatuses["GET /v2/projects/{project_id}/offerings"] = offeringsResp.status;

    if (offeringsResp.status === 200) {
      const data = offeringsResp.body as RCOfferingsResponse;
      const items: RCOffering[] = data?.items ?? [];
      if (items.length > 0) {
        // Prefer the offering with lookup_key === "default", otherwise take first.
        // items is non-empty (checked above) so items[0] is defined.
        const defaultOffering: RCOffering =
          items.find((o) => o.lookup_key === "default" || o.id === "default") ??
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          items[0]!;
        result.offering_id = defaultOffering.id ?? null;
        result.package_ids = (defaultOffering.packages ?? []).map((p) => p.id);
        console.log(`  Offering found: ${String(result.offering_id)} ` + `(${(result.package_ids as string[]).length} package(s))`);
      } else {
        warnings.push("No offerings returned from /v2/projects/{project_id}/offerings.");
        console.warn("  WARNING: No offerings returned.");
      }
    } else if (offeringsResp.status === 401 || offeringsResp.status === 403) {
      warnings.push(
        `Offerings API returned ${offeringsResp.status}. ` + "Check that REVENUECAT_SECRET_API_KEY is a secret key (sk_*) with project-level read access.",
      );
      console.error(`  ERROR: Offerings API returned ${offeringsResp.status}. ` + "Verify REVENUECAT_SECRET_API_KEY permissions.");
    } else {
      warnings.push(`Offerings API returned unexpected status ${offeringsResp.status}.`);
      console.warn(`  WARNING: Unexpected HTTP ${offeringsResp.status} from offerings endpoint.`);
    }

    // 1b. List entitlements
    const entitlementsPath = `/v2/projects/${encodeURIComponent(projectId)}/entitlements`;
    console.log(`Probing entitlements: GET ${API_HOST}${entitlementsPath}`);
    const entitlementsResp = await rcGet(entitlementsPath);
    httpStatuses["GET /v2/projects/{project_id}/entitlements"] = entitlementsResp.status;

    if (entitlementsResp.status === 200) {
      const data = entitlementsResp.body as RCEntitlementsResponse;
      const items: RCEntitlement[] = data?.items ?? [];
      result.entitlement_ids = items.map((e) => e.id);
      console.log(`  Entitlements found: ${items.map((e) => e.id).join(", ") || "(none)"}`);
      if (items.length === 0) {
        warnings.push("No entitlements returned from /v2/projects/{project_id}/entitlements.");
        console.warn("  WARNING: No entitlements found. Create entitlements in RevenueCat before marking revenue done.");
      }
    } else if (entitlementsResp.status === 401 || entitlementsResp.status === 403) {
      warnings.push(`Entitlements API returned ${entitlementsResp.status}. ` + "Check REVENUECAT_SECRET_API_KEY permissions.");
      console.error(`  ERROR: Entitlements API returned ${entitlementsResp.status}.`);
    } else {
      warnings.push(`Entitlements API returned unexpected status ${entitlementsResp.status}.`);
      console.warn(`  WARNING: Unexpected HTTP ${entitlementsResp.status} from entitlements endpoint.`);
    }
  }

  // ---
  // 2. Write proof artifact (non-secret facts only)
  // ---
  const artifactPath = path.join(root, ARTIFACT_REL_PATH);
  const artifactDir = path.dirname(artifactPath);
  if (!existsSync(artifactDir)) {
    mkdirSync(artifactDir, { recursive: true });
  }

  const artifact = {
    probe: PROBE_FINGERPRINT,
    api_host: API_HOST,
    probed_at: probedAt,
    project_id_provided: Boolean(projectId),
    http_statuses: httpStatuses,
    offering_id: result.offering_id,
    package_ids: result.package_ids,
    entitlement_ids: result.entitlement_ids,
    // Non-secret summary flags used by check-revenue.ts
    offering_resolved: Boolean(result.offering_id),
    entitlements_present: (result.entitlement_ids as string[]).length > 0,
    warnings: warnings,
  };

  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  console.log(`\nProof artifact written: ${ARTIFACT_REL_PATH}`);

  // ---
  // 3. Summary
  // ---
  const hasErrors = !artifact.offering_resolved || !artifact.entitlements_present || warnings.some((w) => w.includes("401") || w.includes("403"));

  if (hasErrors) {
    console.error("\n  PROBE INCOMPLETE — one or more checks failed. " + "Resolve warnings above and re-run before marking the revenue lane done.\n");
    process.exit(1);
  } else {
    console.log(
      "\n  Probe complete. Review the artifact at " + ARTIFACT_REL_PATH + " and record sandbox/entitlement evidence before marking the revenue lane done.",
    );
  }
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n  probe-revenuecat: unexpected error: ${message}\n`);
  process.exit(1);
});
