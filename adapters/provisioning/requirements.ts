import { REVENUECAT_PROVISIONING } from "../providers/revenuecat/provisioning.js";
/**
 * The provisioning-requirements manifest (declare-upfront layer, KTD-provisioning).
 *
 * One entry per provider a business can connect. Each entry carries what connecting it unlocks
 * and the concrete things a founder must set up before it can be trusted — keyed on
 * `providerId`, the same string catalog/workflows/*.ts nodes list under their own `providers`
 * array, so a workflow node and this manifest join on one shared id with no second registry to
 * keep in sync by hand.
 *
 * This module is data only — no I/O, no process access, no resolution logic (see resolve.ts for
 * that). It exists so "what does the founder need to set up" is answered once, from source
 * evidence, rather than discovered piecemeal the first time a provider's absence breaks a run.
 *
 * Source: a prior research pass across catalog/, kernel/, knowledge/, and examples/workspace/ (file:line
 * evidence recorded in the authoring PR). Every provider named there is declared here; nothing
 * is invented. Three catalog providerIds that this pass's own evidence describes as sharing the
 * exact same no-secret, local-tooling shape as provider.in-app-ios-simulator — provider.codex-
 * native-ios, provider.snapshot-previews, provider.serve-sim — are deliberately NOT declared as
 * separate entries; that decision is enforced as typed catalog validation in catalog/validate.ts
 * (catalog_graph.workflow.provider_unknown / catalog_graph.provider.exception_stale), not here.
 */

import type { AccessRoute } from "../../kernel/schema/types.js";

export type RequirementKind = "secret" | "config" | "external";

export interface ProvisioningRequirement {
  /** What kind of thing this is: a credential value, a named non-secret setting, or a fact about the outside world (an account state, a completed setup step) no key or config value can express. */
  readonly kind: RequirementKind;
  /** For secret/config: the literal name (usually an env-var-shaped string) a probe can look up. For external: a short label naming the fact. */
  readonly name: string;
  /** Founder-facing: why this specific thing is needed, in plain language. */
  readonly why: string;
  /** True when *some* mechanism (a probe, a presence check, a structural fact) can establish satisfied/missing for this item today. False means only a human can currently attest to it. Independent of resolve.ts's runtime resolution — this is a static claim about whether checking is possible at all, not whether this repo currently performs that check. */
  readonly verifiable: boolean;
}

export interface ProvisioningProvider {
  /** Joins catalog/workflows/*.ts's `providers: ["provider.x", ...]` arrays. */
  readonly providerId: string;
  /** Short slug naming what connecting this provider turns on. */
  readonly capability: string;
  /**
   * How an agent can actually reach and operate this provider — the routes the provider
   * supports, not the one a business chose (that lives in business state as
   * tools.<name>.access_route / providers.<name>.accessRoute). Coarsened into the shipped
   * agent-operations ledger vocabulary by ledgerRouteFor().
   */
  readonly accessRoutes: readonly AccessRoute[];
  /** Founder-facing: the concrete thing this unlocks, in one or two sentences. */
  readonly unlocks: string;
  readonly requirements: readonly ProvisioningRequirement[];
}

export const PROVISIONING_MANIFEST: readonly ProvisioningProvider[] = [
  {
    providerId: "provider.doppler",
    capability: "secret-storage-and-injection",
    // `doppler run --`/service tokens are the working route; first login is interactive browser auth.
    accessRoutes: ["cli", "browser"],
    unlocks: "Lets the agent store and safely inject every other provider's API keys/tokens without raw values ever touching chat, git, or logs.",
    requirements: [
      { kind: "secret", name: "DOPPLER_TOKEN", why: "CI/production service token used to inject secrets non-interactively.", verifiable: true },
      {
        kind: "config",
        name: "Doppler project + per-environment config names (local/staging/prod)",
        why: "Config names are project-specific; guessing them (e.g. 'prod' vs 'prd') hard-errors.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "Founder has run `doppler login` once (interactive browser auth)",
        why: "Doppler CLI cannot authenticate non-interactively for the first login; the agent cannot do this for the founder.",
        verifiable: true,
      },
    ],
  },
  {
    providerId: "provider.resend",
    capability: "founder-digest-email",
    // REST send/webhook API; domain verification lives in the Resend dashboard.
    accessRoutes: ["api", "browser"],
    unlocks:
      "Lets the app send real transactional/lifecycle email to users, and lets the autonomous runtime email the founder a session digest after every scheduled work session.",
    requirements: [
      { kind: "secret", name: "RESEND_API_KEY", why: "Bearer token for the Resend REST API send call.", verifiable: true },
      {
        kind: "secret",
        name: "RESEND_WEBHOOK_SECRET",
        why: "Verifies inbound webhook signatures (svix) before trusting delivery/bounce/complaint events.",
        verifiable: true,
      },
      {
        kind: "config",
        name: "Verified sending domain + real from-address per purpose (digest, welcome, support, etc.)",
        why: "Resend rejects sends from a domain the account has not verified; the founder must choose and own a real subdomain (e.g. updates.<their-domain>.com), not a placeholder.",
        verifiable: false,
      },
      {
        kind: "config",
        name: "Founder recipient email for the session digest",
        why: "pushDigest() needs a `to` address; this one is already sourced correctly from brief.founderContact.email.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "Sending domain verified in Resend (SPF + DKIM pass, optional DMARC)",
        why: "A valid API key sends nothing if the domain behind the `from` address is unverified — this is the exact 403 the motivating failure describes.",
        verifiable: false,
      },
      {
        kind: "external",
        name: "MX records actually exist for any reply-to/support alias domain used in copy",
        why: "The skill's own privacy-page rule requires a live `dig MX` check before writing an @domain address into any page; the same class of gap (address exists in text, not in DNS) applies to the digest's implicit sender identity.",
        verifiable: true,
      },
    ],
  },
  {
    providerId: "provider.posthog",
    capability: "product-analytics-and-attribution",
    // Live query probe reads the API; region/replay/project posture is set in the console.
    accessRoutes: ["api", "browser"],
    unlocks: "Lets the app record events and lets the agent prove real users are doing something (funnels, activation, attribution) instead of asserting it.",
    requirements: [
      { kind: "secret", name: "POSTHOG_PERSONAL_API_KEY", why: "Used by the live query probe to read event counts from the PostHog API.", verifiable: true },
      { kind: "secret", name: "POSTHOG_PROJECT_API_KEY", why: "Public client-side capture key shipped in the app bundle.", verifiable: true },
      {
        kind: "config",
        name: "POSTHOG_PROJECT_ID and POSTHOG_HOST/region",
        why: "Numeric project ID and self-hosted host/region must be set or the probe silently targets the wrong project/host.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "A named attribution event has actually arrived in PostHog with count > 0 in the rolling window",
        why: "Keys and IDs can all be valid while zero real events have flowed, meaning attribution is unproven; only a live query against the API establishes this.",
        verifiable: true,
      },
    ],
  },
  REVENUECAT_PROVISIONING,
  {
    providerId: "provider.stripe",
    capability: "web-checkout-billing",
    // Server API keys, Stripe CLI lifecycle tests, and dashboard-only profile/payout setup.
    accessRoutes: ["api", "cli", "browser"],
    unlocks: "Lets the app sell on the web and reconcile a successful Stripe payment into the same entitlement the mobile app checks.",
    requirements: [
      { kind: "secret", name: "STRIPE_SECRET_KEY", why: "Server-side API key for checkout/session/product calls.", verifiable: true },
      { kind: "secret", name: "STRIPE_WEBHOOK_SECRET", why: "Verifies webhook signatures before trusting payment/subscription events.", verifiable: true },
      { kind: "config", name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", why: "Public client key for Stripe.js/checkout embed.", verifiable: true },
      {
        kind: "external",
        name: "Stripe account has a completed business profile, branding, support email, and statement descriptor",
        why: "knowledge/money/revenue-monetization.md's Stripe setup checklist lists these as required before live mode — an incomplete business profile is exactly the kind of dashboard-state gap that blocks payouts even though every API key is valid.",
        verifiable: false,
      },
      {
        kind: "external",
        name: "Payout bank account added and verified in the Stripe dashboard",
        why: "Without a verified payout destination, collected revenue has nowhere to go even once checkout works end-to-end.",
        verifiable: false,
      },
      {
        kind: "external",
        name: "Subscription/payment lifecycle events (paid, failed, action-required, canceled) tested against Stripe's CLI/sandbox before switching to live API keys",
        why: "knowledge/money/revenue-monetization.md is explicit: use Stripe CLI/sandbox to test all lifecycle events before going live — skipping this risks discovering a broken webhook handler only after real money is moving.",
        verifiable: false,
      },
      {
        kind: "external",
        name: "A live webhook endpoint is registered in the Stripe dashboard and is actually receiving events",
        why: "A correct signing secret proves nothing if no endpoint is registered to deliver to it in the first place.",
        verifiable: false,
      },
      {
        kind: "external",
        name: "A successful Stripe checkout is confirmed to project into the selected entitlement provider and backend access state",
        why: "The knowledge base explicitly warns: 'do not let Stripe success alone equal app entitlement' — this is state only a live end-to-end trace proves.",
        verifiable: true,
      },
    ],
  },
  {
    providerId: "provider.sentry",
    capability: "crash-and-error-monitoring",
    // DSN ingestion is API; sentry-cli uploads mappings; alert routes are configured in the console.
    accessRoutes: ["api", "cli", "browser"],
    unlocks: "Lets the founder learn about real crashes/errors from the live app instead of finding out from a 1-star review.",
    requirements: [
      { kind: "secret", name: "SENTRY_DSN", why: "Client/server ingestion endpoint identifier.", verifiable: true },
      {
        kind: "secret",
        name: "SENTRY_AUTH_TOKEN",
        why: "Needed to upload source maps/dSYMs/ProGuard mappings so stack traces are readable.",
        verifiable: true,
      },
      {
        kind: "config",
        name: "Project/release/environment naming and PII-scrubbing rules",
        why: "Determines where events land and what gets redacted before storage.",
        verifiable: false,
      },
      {
        kind: "external",
        name: "A known non-production test event and an alert route are both confirmed reaching Sentry",
        why: "A valid DSN can be wired into the SDK while nothing ever actually arrives (wrong project, network egress blocked, sampling misconfigured); only a live test event proves the pipe works.",
        verifiable: true,
      },
    ],
  },
  {
    providerId: "provider.app-store-connect",
    capability: "ios-distribution-and-testflight",
    // xcodebuild/asc CLI over the ASC API key; agreements and some app-record steps are ASC-web-only.
    accessRoutes: ["cli", "api", "browser"],
    unlocks: "Lets the agent create the App Store Connect app record, sign builds, and submit to TestFlight/App Store.",
    requirements: [
      {
        kind: "secret",
        name: "ASC_KEY_ID",
        why: "App Store Connect API key ID used for `xcodebuild -exportArchive` auth and the `asc` CLI.",
        verifiable: true,
      },
      { kind: "secret", name: "ASC_ISSUER_ID", why: "Paired with the key ID for ASC API authentication.", verifiable: true },
      {
        kind: "secret",
        name: "ASC_PRIVATE_KEY_PATH",
        why: "Path to the .p8 private key; the key content itself must never be printed or committed.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "Active, paid Apple Developer Program membership with the founder as account holder/admin",
        why: "This requires Apple enrollment and payment — an agent cannot complete it; it is an explicit founder-only stop.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "Latest Apple Developer / App Store Connect agreements are signed",
        why: "Unsigned agreements silently block app-record creation and uploads even when API credentials work correctly.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "Registered explicit App ID / bundle identifier owned by the founder's team, matching the Xcode target",
        why: "Bundle ID is sticky platform identity — it cannot be changed after a build is uploaded, and services (push, billing, OAuth) attach to it.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "Distribution signing material actually present (Apple Distribution cert + App Store provisioning profile, or Xcode automatic/cloud-managed signing attached to the correct team)",
        why: "A working Apple Development identity is not the same as App Store distribution signing; uploads fail without it even though local simulator builds succeed.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "App Store Connect app record actually created (name reserved, SKU, bundle ID attached, no name collision)",
        why: "Credentials can be perfectly valid while no app record exists yet.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "PrivacyInfo.xcprivacy is lint-clean and required-reason API categories are fully declared",
        why: "A structurally valid credential set and a passing local build can still get rejected/blocked at upload for an unrelated, undeclared privacy-manifest fact — the same shape as the Resend bug.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "Export compliance answer completed for the app record (ITSAppUsesNonExemptEncryption / encryption-use questionnaire)",
        why: "Named as a blocking release-checklist item everywhere store readiness is described (Apple signing/release, launch-phases, artifact-contracts, ASO/store-ops) — Apple withholds release until it's answered, even when the binary, signing, and every other field are otherwise ready.",
        verifiable: true,
      },
    ],
  },
  {
    providerId: "provider.google-play",
    capability: "android-distribution",
    // Service-account Play Developer API; data-safety/IARC and account setup are Play-Console-only.
    accessRoutes: ["api", "browser"],
    unlocks: "Lets the agent create the Play Console app record and release Android builds.",
    requirements: [
      {
        kind: "secret",
        name: "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
        why: "Service-account credential for the Play Developer API (uploads, track promotion).",
        verifiable: true,
      },
      {
        kind: "external",
        name: "Active, identity-verified Google Play developer account with registration fee paid",
        why: "Requires founder payment and identity verification; an agent cannot complete this.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "For PERSONAL accounts only: a closed test with ≥12 testers opted in continuously for ≥14 days, completed before production access can even be requested",
        why: "This is a pure calendar gate with no secret or config component at all — it sets the earliest possible production date and can reset if testers drop out.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "Play App Signing enrollment completed and upload key generated",
        why: "Without enrollment, a lost upload key can strand the app permanently.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "Data safety form + IARC content rating completed and reconciled with the iOS App Privacy answers",
        why: "A mismatch between the two stores' declared data practices for the same codebase is a rejection/removal trigger.",
        verifiable: false,
      },
      {
        kind: "external",
        name: "Build's targetSdkVersion currently meets Google's ratcheting minimum at upload time",
        why: "This requirement changes roughly yearly; a build that compiled fine months ago can be unsubmittable today.",
        verifiable: true,
      },
    ],
  },
  {
    providerId: "provider.paid-ad-channels",
    capability: "paid-user-acquisition-spend",
    // Zero named secrets; account existence, funding, and spend are founder attestation.
    accessRoutes: ["manual"],
    unlocks:
      "Lets the founder run paid ad campaigns (Meta/TikTok/Google/Apple Search Ads) and lets the agent measure return against selected monetization and analytics truth.",
    requirements: [
      {
        kind: "external",
        name: "Funded, connected ad account (Business Manager / Ads account) with a billing method on file, per chosen channel",
        why: "The catalog carries zero named secrets for this provider (required_secrets: []), so account existence and funding are invisible to any automated check today — readiness lives entirely in founder attestation.",
        verifiable: false,
      },
      {
        kind: "external",
        name: "Founder-approved budget cap and date range",
        why: "Paid spend is an explicit founder-only gate; agents may prepare everything else but must not commit spend.",
        verifiable: true,
      },
      {
        kind: "config",
        name: "Single chosen channel + target event (trial start, subscription, etc.)",
        why: "The playbook requires starting with one channel and one measurable target event, not a multi-channel launch.",
        verifiable: false,
      },
    ],
  },
  {
    providerId: "provider.refero",
    capability: "ux-pattern-research",
    accessRoutes: ["api"],
    unlocks: "Lets the agent pull real competitor UX flow/state patterns instead of guessing screen structure from memory.",
    requirements: [
      { kind: "secret", name: "REFERO_API_TOKEN", why: "OAuth or bearer token for the Refero API.", verifiable: true },
      {
        kind: "external",
        name: "Refero Pro access tier is actually active on the account",
        why: "A valid token can exist on a free tier lacking Pro access — the same 'key present, entitlement absent' shape as the Resend bug — and the query budget must also be confirmed.",
        verifiable: false,
      },
    ],
  },
  {
    providerId: "provider.higgsfield",
    capability: "ai-generated-marketing-visuals",
    // Auth and generation ride the connected Higgsfield MCP tool, outside Doppler routing.
    accessRoutes: ["mcp"],
    unlocks: "Lets the agent generate on-brand product photos, ads, and video for store/marketing/email surfaces.",
    requirements: [
      {
        kind: "external",
        name: "Higgsfield account with sufficient credit balance for the requested generation batch",
        why: "This is pay-per-generation; the catalog lists no secret for it (auth is handled by the connected Higgsfield MCP tool outside this skill's Doppler routing), so spend readiness is purely an account-state fact the agent must surface and the founder must confirm before each generation batch.",
        verifiable: false,
      },
      {
        kind: "config",
        name: "Trained Soul/identity reference (soul_reference_id, avatar_id) when presenter/avatar continuity across assets is needed",
        why: "Avoids retraining/duplicate identity runs across ads, UGC, and lifecycle email art.",
        verifiable: true,
      },
    ],
  },
  {
    providerId: "provider.mobai",
    capability: "device-automation-and-demo-capture",
    // Its own MCP connection carries auth; the desktop tier also ships a CLI.
    accessRoutes: ["mcp", "cli"],
    unlocks:
      "Lets the agent drive a real iOS/Android device or simulator to prove flows work and produce demo videos/screenshots, instead of narrating an untested claim.",
    requirements: [
      { kind: "config", name: "Selected tier: free | plus | pro", why: "Determines available device/automation coverage.", verifiable: true },
      {
        kind: "external",
        name: "Founder approval and a paid account for Plus/Pro tier when Free does not cover the needed device/app access",
        why: "MobAI has no secret in this repo's model (its own MCP connection carries auth); tier sufficiency is a founder-confirmed fact, not a checkable value.",
        verifiable: false,
      },
      {
        kind: "external",
        name: "A fixture/sandbox account is seeded on the device before any sign-in",
        why: "The skill's own SECRETS.md rule forbids ever signing a driven device into a real founder account, since device screenshots leave the machine with the conversation.",
        verifiable: false,
      },
    ],
  },
  {
    providerId: "provider.security-review",
    capability: "security-scanning-and-release-gate",
    // Local/free scanners run as CLIs; which paid scanner (if any) is a founder routing decision.
    accessRoutes: ["cli", "manual"],
    unlocks:
      "Runs automated security scans (Claude Security / Codex Security / GitHub Advanced Security / Snyk / MobSF, or an approved free fallback) before release is called ready.",
    requirements: [
      {
        kind: "external",
        name: "Founder decision on which paid/account-gated scanner is approved, or explicit approval of a free/local fallback",
        why: "The catalog carries zero named secrets for this provider; the actual blocking fact is a routing decision the founder must make, recorded in strategy/TOOL_DECISIONS.md.",
        verifiable: false,
      },
    ],
  },
  {
    providerId: "provider.app-store-screenshots",
    capability: "store-screenshot-composition",
    accessRoutes: ["skill_pack"],
    unlocks: "Composes final App Store/Play screenshot images at the exact required device sizes from raw captures.",
    requirements: [
      {
        kind: "external",
        name: "Raw capture files meet the minimum native pixel width for the target device well before composition",
        why: "Upscaling an undersized capture (e.g. a reduced-stream simulator pane screenshot) produces blurry art Apple can reject; this is caught only by measuring the actual file, not by any credential check.",
        verifiable: true,
      },
    ],
  },
  {
    providerId: "provider.aso-skills",
    capability: "aso-specialist-guidance",
    accessRoutes: ["skill_pack"],
    unlocks:
      "Gives the agent a specialist ASO skill pack (keyword research, screenshot optimization, localization, apple-search-ads, etc.) instead of improvising ASO from general knowledge.",
    requirements: [
      {
        kind: "external",
        name: "Local skill pack installed/refreshed",
        why: "It is a local skill pack route, not a real external account — no secret is required, but the pack must actually be present to route to it.",
        verifiable: true,
      },
    ],
  },
  {
    providerId: "provider.in-app-ios-simulator",
    capability: "local-device-proof",
    accessRoutes: ["native_device"],
    unlocks: "Lets the agent capture real simulator/device screenshots as build evidence on the founder's own Mac, without any third-party account.",
    requirements: [
      {
        kind: "external",
        name: "Local macOS session with Xcode + an iOS simulator runtime installed",
        why: "This route is unreachable from a cloud/SSH/container session; it works only when the agent is literally on the founder's Mac.",
        verifiable: true,
      },
      {
        kind: "external",
        name: "A fixture or sandbox account confirmed before any device sign-in",
        why: "Same rule as MobAI — never sign a driven device into a real account since captures leave the machine with the conversation.",
        verifiable: false,
      },
    ],
  },
];

const manifestById = new Map<string, ProvisioningProvider>(PROVISIONING_MANIFEST.map((provider) => [provider.providerId, provider]));

export function findProvisioningProvider(providerId: string): ProvisioningProvider | undefined {
  return manifestById.get(providerId);
}

export function provisioningProviderIds(): readonly string[] {
  return PROVISIONING_MANIFEST.map((provider) => provider.providerId);
}

/** Mirror of examples/workspace/business/operations/agent-operations.schema.json's $defs capability.kind / action.route enum. */
export type LedgerRoute = "connector" | "api_or_cli" | "browser" | "native_device" | "manual";

/**
 * Total coarsening from the manifest's fine-grained access routes into the agent-operations
 * ledger vocabulary. "skill_pack" maps to "no_ledger_action": a local skill pack performs no
 * external action, so nothing it does ever lands in the ledger. The provisioning fixture asserts
 * every other result is a member of the schema's enum, so ledger-enum drift fails loudly here
 * rather than silently diverging.
 */
export function ledgerRouteFor(route: AccessRoute): LedgerRoute | "no_ledger_action" {
  switch (route) {
    case "mcp":
      return "connector";
    case "api":
    case "cli":
      return "api_or_cli";
    case "browser":
      return "browser";
    case "native_device":
      return "native_device";
    case "manual":
      return "manual";
    case "skill_pack":
      return "no_ledger_action";
    default: {
      const never: never = route;
      throw new Error(`unmapped access route ${String(never)}`);
    }
  }
}

/**
 * Local simulator and preview tooling share the provider.in-app-ios-simulator access
 * contract: external configuration without a secret. These provider IDs do not need
 * separate provisioning requirements. The catalog validator checks this explicit
 * exclusion so an undeclared provider cannot silently bypass access requirements.
 */
export const DELIBERATELY_UNDECLARED_PROVIDER_IDS: readonly string[] = ["provider.codex-native-ios", "provider.snapshot-previews", "provider.serve-sim"];
