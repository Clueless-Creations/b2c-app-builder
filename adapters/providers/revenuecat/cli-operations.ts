/**
 * Reviewed RevenueCat CLI command-to-operation mapping for release v0.1.1
 * (commit 448a9998bd2107c274b9eb1cf55ad5d5d81f6377). Branch-head README commands are not
 * treated as present in the installed binary. This module is the executable matrix: it
 * classifies effects and builds typed argv. It does not spawn processes and does not grant
 * authority. Create encoding maps lookup-key/display-name/store-id flags from the pinned
 * cobra schema; it does not invent server-assigned resource ids.
 */

import { REVENUECAT_PRODUCT_TYPES, type RevenueCatProductType } from "./cli-command-schema.js";

export const REVENUECAT_CLI_RELEASE = {
  tag: "v0.1.1",
  version: "0.1.1",
  commit: "448a9998bd2107c274b9eb1cf55ad5d5d81f6377",
  publishedAt: "2026-08-27T14:29:23Z",
  npmPackage: "@revenuecat/cli",
  npmVersion: "0.1.1",
  sourceHeadObserved: "f4e77d6c6b128a390d46e9ed5aef9c4cf79f62e2",
} as const;

export const REST_PROBE_COLLECTOR = "revenuecat@1";
export const CLI_PROOF_COLLECTOR = "revenuecat-cli@1";

export const CLI_EFFECT_CLASSES = [
  "local-discovery",
  "authenticated-read",
  "authenticated-read-with-user",
  "catalog-mutation",
  "test-store-mutation",
  "offering-current",
  "paywall-publish",
  "ai-generation",
  "store-plan",
  "store-apply",
  "entitlement-change",
  "refund",
  "credential-setup",
  "account-signup",
  "nested-orchestration",
  "raw-api",
  "profile-default-mutation",
] as const;
export type CliEffectClass = (typeof CLI_EFFECT_CLASSES)[number];

export const CLI_SUPPORT_STATUSES = ["implemented-fixture", "source-only", "experimental-excluded", "deliberately-excluded"] as const;
export type CliSupportStatus = (typeof CLI_SUPPORT_STATUSES)[number];

export type CliCommandPath = readonly string[];

export interface CliOperationSpec {
  readonly id: string;
  readonly title: string;
  readonly command: CliCommandPath;
  readonly effectClass: CliEffectClass;
  readonly support: CliSupportStatus;
  readonly requiresAuth: boolean;
  readonly requiresProject: boolean;
  readonly requiresApp: boolean;
  readonly requiresHostAuthority: boolean;
  readonly allowsYesFlag: boolean;
  readonly experimental: boolean;
  readonly proofCollector: typeof CLI_PROOF_COLLECTOR | typeof REST_PROBE_COLLECTOR | "none";
}

const discovery = (partial: Omit<CliOperationSpec, "effectClass" | "requiresAuth" | "requiresProject" | "requiresApp" | "requiresHostAuthority" | "allowsYesFlag" | "experimental" | "proofCollector" | "support">): CliOperationSpec => ({
  ...partial,
  effectClass: "local-discovery",
  support: "implemented-fixture",
  requiresAuth: false,
  requiresProject: false,
  requiresApp: false,
  requiresHostAuthority: false,
  allowsYesFlag: false,
  experimental: false,
  proofCollector: "none",
});

const excluded = (
  partial: Pick<CliOperationSpec, "id" | "title" | "command" | "effectClass"> & Partial<Pick<CliOperationSpec, "experimental" | "support">>,
): CliOperationSpec => ({
  requiresAuth: true,
  requiresProject: true,
  requiresApp: false,
  requiresHostAuthority: true,
  allowsYesFlag: false,
  experimental: partial.experimental ?? false,
  proofCollector: "none",
  support: partial.support ?? "deliberately-excluded",
  ...partial,
});

export const REVENUECAT_CLI_OPERATIONS: readonly CliOperationSpec[] = [
  discovery({ id: "rc.version", title: "Resolve CLI version", command: ["--version"] }),
  discovery({ id: "rc.commands", title: "List command tree", command: ["commands"] }),
  discovery({ id: "rc.schema", title: "Describe one command schema", command: ["schema"] }),
  {
    id: "rc.offerings.list",
    title: "List offerings",
    command: ["offerings", "list"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.offerings.show",
    title: "Show one offering",
    command: ["offerings", "show"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.offerings.verify",
    title: "Verify offering graph",
    command: ["offerings", "verify"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.offerings.preview",
    title: "SDK preview for an app",
    command: ["offerings", "preview"],
    effectClass: "authenticated-read-with-user",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: true,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.apps.list",
    title: "List RevenueCat apps",
    command: ["apps", "list"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.apps.show",
    title: "Show one RevenueCat app",
    command: ["apps", "show"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: true,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.products.list",
    title: "List products",
    command: ["products", "list"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.entitlements.list",
    title: "List entitlements",
    command: ["entitlements", "list"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.projects.list",
    title: "List projects",
    command: ["projects", "list"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: false,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.customers.simulate-purchase",
    title: "Test Store simulate-purchase",
    command: ["customers", "simulate-purchase"],
    effectClass: "test-store-mutation",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: true,
    requiresHostAuthority: true,
    allowsYesFlag: true,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.catalog.create",
    title: "Create catalog objects",
    command: ["offerings", "create"],
    effectClass: "catalog-mutation",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: true,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.projects.show",
    title: "Show one project",
    command: ["projects", "show"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.products.show",
    title: "Show one product",
    command: ["products", "show"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.products.create",
    title: "Create a product",
    command: ["products", "create"],
    effectClass: "catalog-mutation",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: true,
    requiresHostAuthority: true,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.entitlements.show",
    title: "Show one entitlement",
    command: ["entitlements", "show"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.entitlements.create",
    title: "Create an entitlement",
    command: ["entitlements", "create"],
    effectClass: "catalog-mutation",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: true,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.entitlements.attach",
    title: "Attach products to an entitlement",
    command: ["entitlements", "attach"],
    effectClass: "catalog-mutation",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: true,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.offerings.packages",
    title: "List packages for an offering",
    command: ["offerings", "packages"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.packages.show",
    title: "Show one package",
    command: ["packages", "show"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.packages.create",
    title: "Create a package on an offering",
    command: ["packages", "create"],
    effectClass: "catalog-mutation",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: true,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.packages.attach",
    title: "Attach products to a package",
    command: ["packages", "attach"],
    effectClass: "catalog-mutation",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: true,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.paywalls.list",
    title: "List paywalls",
    command: ["paywalls", "list"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.paywalls.show",
    title: "Show one paywall",
    command: ["paywalls", "show"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.paywalls.attach",
    title: "Attach a paywall to an offering",
    command: ["paywalls", "attach"],
    effectClass: "catalog-mutation",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: true,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.customers.show",
    title: "Show one customer",
    command: ["customers", "show"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.subscriptions.show",
    title: "Show one subscription",
    command: ["subscriptions", "show"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.metrics",
    title: "Project overview metrics",
    command: ["metrics"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.charts.show",
    title: "Show one named chart",
    command: ["charts", "show"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  {
    id: "rc.audit",
    title: "Scoped audit log",
    command: ["audit"],
    effectClass: "authenticated-read",
    support: "implemented-fixture",
    requiresAuth: true,
    requiresProject: true,
    requiresApp: false,
    requiresHostAuthority: false,
    allowsYesFlag: false,
    experimental: false,
    proofCollector: CLI_PROOF_COLLECTOR,
  },
  excluded({ id: "rc.customers.list", title: "List all customers", command: ["customers", "list"], effectClass: "authenticated-read" }),
  excluded({ id: "rc.webhooks.list", title: "List webhooks", command: ["webhooks", "list"], effectClass: "authenticated-read" }),
  excluded({ id: "rc.webhooks.show", title: "Show one webhook", command: ["webhooks", "show"], effectClass: "authenticated-read" }),
  excluded({ id: "rc.webhooks.create", title: "Create a webhook", command: ["webhooks", "create"], effectClass: "nested-orchestration" }),
  excluded({ id: "rc.auth.login", title: "Interactive or OAuth login", command: ["auth", "login"], effectClass: "credential-setup" }),
  excluded({
    id: "rc.products.store.show",
    title: "Show a remote store plan",
    command: ["products", "store", "show"],
    effectClass: "store-plan",
    experimental: true,
    support: "experimental-excluded",
  }),
  excluded({
    id: "rc.products.store.list",
    title: "List remote store plans",
    command: ["products", "store", "list"],
    effectClass: "store-plan",
    experimental: true,
    support: "experimental-excluded",
  }),
  excluded({
    id: "rc.products.store.discard",
    title: "Discard a remote store plan",
    command: ["products", "store", "discard"],
    effectClass: "store-apply",
    experimental: true,
    support: "experimental-excluded",
  }),
  excluded({ id: "rc.api", title: "Raw API escape hatch", command: ["api"], effectClass: "raw-api" }),
  excluded({ id: "rc.setup", title: "Nested setup agent", command: ["setup"], effectClass: "nested-orchestration" }),
  excluded({ id: "rc.setup.apple", title: "Apple credential setup", command: ["setup", "apple"], effectClass: "credential-setup", experimental: true, support: "experimental-excluded" }),
  excluded({ id: "rc.setup.google", title: "Google credential setup", command: ["setup", "google"], effectClass: "credential-setup", experimental: true, support: "experimental-excluded" }),
  excluded({ id: "rc.rico", title: "Nested Rico agent", command: ["rico"], effectClass: "nested-orchestration" }),
  excluded({ id: "rc.skills.install", title: "Install upstream skills", command: ["skills", "install"], effectClass: "nested-orchestration" }),
  excluded({ id: "rc.auth.signup", title: "Create a RevenueCat account", command: ["auth", "signup"], effectClass: "account-signup" }),
  excluded({ id: "rc.paywalls.publish", title: "Publish a paywall", command: ["paywalls", "publish"], effectClass: "paywall-publish" }),
  excluded({ id: "rc.paywalls.unpublish", title: "Unpublish a paywall", command: ["paywalls", "unpublish"], effectClass: "paywall-publish" }),
  excluded({ id: "rc.paywalls.generate", title: "AI paywall generation", command: ["paywalls", "generate"], effectClass: "ai-generation" }),
  excluded({ id: "rc.paywalls.edit", title: "AI paywall edit", command: ["paywalls", "edit"], effectClass: "ai-generation" }),
  excluded({
    id: "rc.products.store.plan",
    title: "Remote store plan create",
    command: ["products", "store", "plan"],
    effectClass: "store-plan",
    experimental: true,
    support: "experimental-excluded",
  }),
  excluded({
    id: "rc.products.store.apply",
    title: "Remote store plan apply",
    command: ["products", "store", "apply"],
    effectClass: "store-apply",
    experimental: true,
    support: "experimental-excluded",
  }),
  excluded({
    id: "rc.products.store.sync",
    title: "Interactive store sync",
    command: ["products", "store", "sync"],
    effectClass: "store-apply",
    experimental: true,
    support: "experimental-excluded",
  }),
  excluded({ id: "rc.customers.grant", title: "Grant entitlement", command: ["customers", "grant"], effectClass: "entitlement-change" }),
  excluded({ id: "rc.customers.revoke", title: "Revoke entitlement", command: ["customers", "revoke"], effectClass: "entitlement-change" }),
  excluded({ id: "rc.customers.transfer", title: "Transfer customer", command: ["customers", "transfer"], effectClass: "entitlement-change" }),
  excluded({ id: "rc.subscriptions.refund", title: "Refund a subscription", command: ["subscriptions", "refund"], effectClass: "refund" }),
  excluded({ id: "rc.purchases.refund", title: "Refund a purchase", command: ["purchases", "refund"], effectClass: "refund" }),
  excluded({ id: "rc.offerings.set-current", title: "Activate current offering", command: ["offerings", "set-current"], effectClass: "offering-current" }),
  excluded({ id: "rc.projects.use", title: "Change profile default project", command: ["projects", "use"], effectClass: "profile-default-mutation" }),
  excluded({ id: "rc.profiles.use", title: "Change global default profile", command: ["profiles", "use"], effectClass: "profile-default-mutation" }),
];

const byId = new Map(REVENUECAT_CLI_OPERATIONS.map((operation) => [operation.id, operation]));

export function getRevenueCatCliOperation(id: string): CliOperationSpec | undefined {
  return byId.get(id);
}

export function findRevenueCatCliOperationByArgv(argv: readonly string[]): CliOperationSpec | undefined {
  const commandTokens = argv.filter((token) => !token.startsWith("-"));
  let best: CliOperationSpec | undefined;
  for (const operation of REVENUECAT_CLI_OPERATIONS) {
    if (operation.command[0] === "--version") {
      if (argv.includes("--version") || commandTokens[0] === "version") best = operation;
      continue;
    }
    if (operation.command.length === 0) continue;
    const matches = operation.command.every((token, index) => commandTokens[index] === token);
    if (!matches) continue;
    if (!best || operation.command.length > best.command.length) best = operation;
  }
  return best;
}

export type ArgvBuildRefusal =
  | "unknown-operation"
  | "unsupported-operation"
  | "model-authored-flag"
  | "missing-project"
  | "missing-app"
  | "missing-resource"
  | "invalid-chart"
  | "yes-without-authority"
  | "ambiguous-target";

export class CliArgvRefusal extends Error {
  readonly code: ArgvBuildRefusal;
  constructor(code: ArgvBuildRefusal, message: string) {
    super(message);
    this.name = "CliArgvRefusal";
    this.code = code;
  }
}

export interface CliArgvRequest {
  readonly operationId: string;
  readonly projectId?: string;
  readonly appId?: string;
  readonly offeringId?: string;
  readonly productId?: string;
  readonly appUserId?: string;
  readonly customerId?: string;
  readonly subscriptionId?: string;
  readonly paywallId?: string;
  readonly packageId?: string;
  readonly entitlementId?: string;
  readonly chartName?: string;
  readonly auditLimit?: number;
  readonly lookupKey?: string;
  readonly displayName?: string;
  readonly storeIdentifier?: string;
  readonly productType?: string;
  readonly duration?: string;
  readonly createTitle?: string;
  readonly attachProductIds?: readonly string[];
  readonly schemaCommand?: CliCommandPath;
  readonly profile?: string;
  readonly hostAuthorityGranted: boolean;
  readonly extraFlags?: readonly string[];
}

const NONINTERACTIVE_FLAGS = ["--json", "--no-input", "--no-color"] as const;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;
const LOOKUP_KEY_PATTERN = /^[A-Za-z0-9._$-]{1,80}$/u;
const DURATION_PATTERN = /^P\d+[YMWD]$/u;
const SAFE_TITLE_PATTERN = /^[A-Za-z0-9._ -]{1,80}$/u;
export const REVENUECAT_CHART_NAMES = [
  "actives",
  "actives_movement",
  "actives_new",
  "arr",
  "churn",
  "cohort_explorer",
  "conversion_to_paying",
  "customers_active",
  "customers_new",
  "ltv_per_customer",
  "ltv_per_paying_customer",
  "mrr",
  "mrr_movement",
  "prediction_explorer",
  "refund_rate",
  "revenue",
  "subscription_retention",
  "subscription_status",
  "trial_conversion_rate",
  "trials",
  "trials_movement",
  "trials_new",
] as const;
export type RevenueCatChartName = (typeof REVENUECAT_CHART_NAMES)[number];

export function isSafeRevenueCatResourceId(value: string): boolean {
  return RESOURCE_ID_PATTERN.test(value);
}

function assertSafeId(value: string | undefined, label: string): void {
  if (value === undefined) return;
  if (!RESOURCE_ID_PATTERN.test(value)) throw new CliArgvRefusal("ambiguous-target", `${label} is not a validated RevenueCat identifier.`);
}

function assertSafeLookupKey(value: string | undefined): void {
  if (value === undefined) return;
  if (!LOOKUP_KEY_PATTERN.test(value) || value.startsWith("-")) {
    throw new CliArgvRefusal("ambiguous-target", "lookup key is not a validated RevenueCat lookup key.");
  }
}

function assertSafeTitle(value: string | undefined, label: string): void {
  if (value === undefined) return;
  if (!SAFE_TITLE_PATTERN.test(value) || value.startsWith("-")) {
    throw new CliArgvRefusal("ambiguous-target", `${label} is not a validated catalog title.`);
  }
}

function requireText(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new CliArgvRefusal("missing-resource", `${label} is required under --no-input.`);
  return trimmed;
}

function appendFlag(argv: string[], flag: string, value: string): void {
  argv.push(flag, value);
}

function appendCreateAttachOperands(operation: CliOperationSpec, request: CliArgvRequest, argv: string[]): void {
  switch (operation.id) {
    case "rc.catalog.create": {
      const lookupKey = requireText(request.lookupKey, "rc.catalog.create --lookup-key");
      const displayName = requireText(request.displayName, "rc.catalog.create --display-name");
      appendFlag(argv, "--lookup-key", lookupKey);
      appendFlag(argv, "--display-name", displayName);
      return;
    }
    case "rc.products.create": {
      const storeIdentifier = requireText(request.storeIdentifier, "rc.products.create --store-id");
      const productType = requireText(request.productType, "rc.products.create --type");
      if (!(REVENUECAT_PRODUCT_TYPES as readonly string[]).includes(productType)) {
        throw new CliArgvRefusal("ambiguous-target", `${productType} is not a pinned RevenueCat product type.`);
      }
      const typedType: RevenueCatProductType = productType as RevenueCatProductType;
      const appId = requireText(request.appId, "rc.products.create --app-id");
      appendFlag(argv, "--store-id", storeIdentifier);
      appendFlag(argv, "--type", typedType);
      appendFlag(argv, "--app-id", appId);
      if (request.createTitle) appendFlag(argv, "--title", request.createTitle);
      if (request.displayName) appendFlag(argv, "--display-name", request.displayName);
      if (request.duration) {
        if (!DURATION_PATTERN.test(request.duration)) {
          throw new CliArgvRefusal("ambiguous-target", "duration is not a validated ISO 8601 period (for example P1M).");
        }
        appendFlag(argv, "--duration", request.duration);
      }
      return;
    }
    case "rc.entitlements.create": {
      const lookupKey = requireText(request.lookupKey, "rc.entitlements.create --lookup-key");
      const displayName = requireText(request.displayName, "rc.entitlements.create --display-name");
      appendFlag(argv, "--lookup-key", lookupKey);
      appendFlag(argv, "--display-name", displayName);
      return;
    }
    case "rc.packages.create": {
      const offeringId = requireText(request.offeringId, "rc.packages.create offering id");
      const lookupKey = requireText(request.lookupKey, "rc.packages.create --lookup-key");
      const displayName = requireText(request.displayName, "rc.packages.create --display-name");
      argv.push(offeringId);
      appendFlag(argv, "--lookup-key", lookupKey);
      appendFlag(argv, "--display-name", displayName);
      return;
    }
    case "rc.entitlements.attach": {
      if (!request.entitlementId?.trim() || !request.attachProductIds?.length) {
        throw new CliArgvRefusal("missing-resource", "rc.entitlements.attach requires an entitlement id and at least one product id.");
      }
      argv.push(request.entitlementId, ...request.attachProductIds);
      return;
    }
    case "rc.packages.attach": {
      if (!request.packageId?.trim() || !request.attachProductIds?.length) {
        throw new CliArgvRefusal("missing-resource", "rc.packages.attach requires a package id and at least one product id.");
      }
      argv.push(request.packageId, ...request.attachProductIds);
      return;
    }
    case "rc.paywalls.attach": {
      if (!request.paywallId?.trim() || !request.offeringId?.trim()) {
        throw new CliArgvRefusal("missing-resource", "rc.paywalls.attach requires a paywall id and an offering id.");
      }
      argv.push(request.paywallId, request.offeringId);
      return;
    }
    default:
      return;
  }
}

export function buildRevenueCatCliArgv(request: CliArgvRequest): string[] {
  const operation = getRevenueCatCliOperation(request.operationId);
  if (!operation) throw new CliArgvRefusal("unknown-operation", `Unknown RevenueCat CLI operation ${request.operationId}.`);
  if (operation.support !== "implemented-fixture") {
    throw new CliArgvRefusal("unsupported-operation", `${operation.id} is ${operation.support}; the builder will not spawn it.`);
  }
  assertSafeId(request.projectId, "project id");
  assertSafeId(request.appId, "app id");
  assertSafeId(request.offeringId, "offering id");
  assertSafeId(request.productId, "product id");
  assertSafeId(request.appUserId, "app user id");
  assertSafeId(request.customerId, "customer id");
  assertSafeId(request.subscriptionId, "subscription id");
  assertSafeId(request.paywallId, "paywall id");
  assertSafeId(request.packageId, "package id");
  assertSafeId(request.entitlementId, "entitlement id");
  assertSafeId(request.profile, "profile name");
  assertSafeLookupKey(request.lookupKey);
  assertSafeTitle(request.displayName, "display name");
  assertSafeId(request.storeIdentifier, "store identifier");
  if (request.attachProductIds) {
    for (const productId of request.attachProductIds) assertSafeId(productId, "attach product id");
  }
  assertSafeTitle(request.createTitle, "create title");
  if (request.chartName !== undefined && !REVENUECAT_CHART_NAMES.includes(request.chartName as RevenueCatChartName)) {
    throw new CliArgvRefusal("invalid-chart", `${request.chartName} is not a reviewed RevenueCat chart name.`);
  }
  if (request.auditLimit !== undefined && (!Number.isInteger(request.auditLimit) || request.auditLimit < 1 || request.auditLimit > 100)) {
    throw new CliArgvRefusal("missing-resource", "audit --limit must be an integer from 1 to 100.");
  }
  if (request.extraFlags && request.extraFlags.length > 0) {
    const name = request.extraFlags[0]!.split("=")[0] ?? request.extraFlags[0];
    throw new CliArgvRefusal(
      "model-authored-flag",
      `Refusing extra flag ${name}. Caller-authored flags, including equals-form --project-id and --base-url, are not a generic escape hatch.`,
    );
  }
  if (operation.requiresProject && !request.projectId?.trim()) {
    throw new CliArgvRefusal("missing-project", `${operation.id} requires an explicit validated --project-id. Profile defaults are not used.`);
  }
  if (operation.requiresApp && !request.appId?.trim()) {
    throw new CliArgvRefusal("missing-app", `${operation.id} requires an explicit RevenueCat app id.`);
  }
  if (operation.allowsYesFlag && !request.hostAuthorityGranted) {
    throw new CliArgvRefusal("yes-without-authority", `${operation.id} needs host authority before --yes can be added. --no-input is not permission.`);
  }
  if (!operation.allowsYesFlag && request.hostAuthorityGranted === false && operation.requiresHostAuthority) {
    throw new CliArgvRefusal("yes-without-authority", `${operation.id} requires host authority before the process starts.`);
  }

  const argv: string[] = [];
  if (request.profile) argv.push("--profile", request.profile);
  if (operation.requiresProject && request.projectId) argv.push("--project-id", request.projectId);
  if (operation.command[0] === "--version") {
    argv.push("--version");
    return argv;
  }
  argv.push(...operation.command);
  if (operation.id === "rc.schema") {
    if (!request.schemaCommand?.length) throw new CliArgvRefusal("unknown-operation", "rc.schema requires a typed command path.");
    argv.push(...request.schemaCommand);
  }
  if (operation.id === "rc.offerings.verify" && request.offeringId) argv.push(request.offeringId);
  if (operation.id === "rc.offerings.show" && request.offeringId) argv.push(request.offeringId);
  if (operation.id === "rc.offerings.packages") {
    if (!request.offeringId?.trim()) throw new CliArgvRefusal("missing-resource", "rc.offerings.packages requires an offering id.");
    argv.push(request.offeringId);
  }
  if (operation.id === "rc.offerings.preview" && request.appId) argv.push(request.appId);
  if (operation.id === "rc.apps.show" && request.appId) argv.push(request.appId);
  if (operation.id === "rc.projects.show" && request.projectId) argv.push(request.projectId);
  if (operation.id === "rc.products.show") {
    if (!request.productId?.trim()) throw new CliArgvRefusal("missing-resource", "rc.products.show requires a product id.");
    argv.push(request.productId);
  }
  if (operation.id === "rc.entitlements.show") {
    if (!request.entitlementId?.trim()) throw new CliArgvRefusal("missing-resource", "rc.entitlements.show requires an entitlement id.");
    argv.push(request.entitlementId);
  }
  if (operation.id === "rc.packages.show") {
    if (!request.packageId?.trim()) throw new CliArgvRefusal("missing-resource", "rc.packages.show requires a package id.");
    argv.push(request.packageId);
  }
  if (operation.id === "rc.paywalls.show") {
    if (!request.paywallId?.trim()) throw new CliArgvRefusal("missing-resource", "rc.paywalls.show requires a paywall id.");
    argv.push(request.paywallId);
  }
  if (operation.id === "rc.customers.show") {
    if (!request.customerId?.trim()) throw new CliArgvRefusal("missing-resource", "rc.customers.show requires an explicit customer id. Listing all customers is refused.");
    argv.push(request.customerId);
  }
  if (operation.id === "rc.subscriptions.show") {
    if (!request.subscriptionId?.trim()) throw new CliArgvRefusal("missing-resource", "rc.subscriptions.show requires a subscription id.");
    argv.push(request.subscriptionId);
  }
  if (operation.id === "rc.charts.show") {
    if (!request.chartName?.trim()) throw new CliArgvRefusal("missing-resource", "rc.charts.show requires a reviewed chart name.");
    argv.push(request.chartName);
  }
  if (operation.id === "rc.audit") {
    if (request.auditLimit === undefined) throw new CliArgvRefusal("missing-resource", "rc.audit requires an explicit --limit.");
    argv.push("--limit", String(request.auditLimit));
  }
  if (operation.id === "rc.offerings.preview" && request.appUserId) argv.push("--app-user-id", request.appUserId);
  if (operation.id === "rc.customers.simulate-purchase") {
    if (request.appId) argv.push("--app-id", request.appId);
    if (request.productId) argv.push("--product", request.productId);
    if (request.appUserId) argv.push("--app-user-id", request.appUserId);
  }
  appendCreateAttachOperands(operation, request, argv);
  argv.push(...NONINTERACTIVE_FLAGS);
  if (operation.allowsYesFlag && request.hostAuthorityGranted) argv.push("--yes");
  return argv;
}

export function isMutationEffect(effectClass: CliEffectClass): boolean {
  switch (effectClass) {
    case "local-discovery":
    case "authenticated-read":
    case "authenticated-read-with-user":
      return false;
    case "catalog-mutation":
    case "test-store-mutation":
    case "offering-current":
    case "paywall-publish":
    case "ai-generation":
    case "store-plan":
    case "store-apply":
    case "entitlement-change":
    case "refund":
    case "credential-setup":
    case "account-signup":
    case "nested-orchestration":
    case "raw-api":
    case "profile-default-mutation":
      return true;
    default: {
      const exhaustive: never = effectClass;
      return exhaustive;
    }
  }
}

export function commandLooksLikePlan(command: CliCommandPath): boolean {
  return command.includes("plan") || command.includes("preview") || command.includes("sync");
}
