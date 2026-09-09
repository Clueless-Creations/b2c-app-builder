/**
 * Reviewed RevenueCat CLI command-to-operation mapping for release v0.1.1
 * (commit 448a9998bd2107c274b9eb1cf55ad5d5d81f6377). Branch-head README commands are not
 * treated as present in the installed binary. This module is the executable matrix: it
 * classifies effects and builds typed argv. It does not spawn processes and does not grant
 * authority.
 */

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

const REFUSED_FLAG_PREFIXES = ["--api-key", "--format", "--body", "--header", "--password", "--apple-password"] as const;

export type ArgvBuildRefusal =
  | "unknown-operation"
  | "unsupported-operation"
  | "model-authored-flag"
  | "missing-project"
  | "missing-app"
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
  readonly schemaCommand?: CliCommandPath;
  readonly profile?: string;
  readonly hostAuthorityGranted: boolean;
  readonly extraFlags?: readonly string[];
}

const NONINTERACTIVE_FLAGS = ["--json", "--no-input", "--no-color"] as const;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;

function assertSafeId(value: string | undefined, label: string): void {
  if (value === undefined) return;
  if (!RESOURCE_ID_PATTERN.test(value)) throw new CliArgvRefusal("ambiguous-target", `${label} is not a validated RevenueCat identifier.`);
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
  assertSafeId(request.profile, "profile name");
  if (request.extraFlags) {
    for (const flag of request.extraFlags) {
      const name = flag.split("=")[0] ?? flag;
      if (REFUSED_FLAG_PREFIXES.some((prefix) => name === prefix || name.startsWith(`${prefix}=`)) || name === "--yes" || name === "-y") {
        throw new CliArgvRefusal("model-authored-flag", `Refusing extra flag ${name}. Secrets, jq formats, raw bodies, and --yes are not caller-authored.`);
      }
      if (!name.startsWith("--")) throw new CliArgvRefusal("model-authored-flag", "Extra CLI tokens must be explicit flags from the typed schema.");
    }
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
  if (operation.id === "rc.offerings.preview" && request.appId) argv.push(request.appId);
  if (operation.id === "rc.apps.show" && request.appId) argv.push(request.appId);
  if (operation.id === "rc.offerings.preview" && request.appUserId) argv.push("--app-user-id", request.appUserId);
  if (operation.id === "rc.customers.simulate-purchase") {
    if (request.appId) argv.push("--app-id", request.appId);
    if (request.productId) argv.push("--product", request.productId);
    if (request.appUserId) argv.push("--app-user-id", request.appUserId);
  }
  argv.push(...NONINTERACTIVE_FLAGS);
  if (operation.allowsYesFlag && request.hostAuthorityGranted) argv.push("--yes");
  if (request.extraFlags) argv.push(...request.extraFlags);
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
