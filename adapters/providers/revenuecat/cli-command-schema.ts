/**
 * Independently qualified RevenueCat CLI request contracts for release v0.1.1.
 * Transcribed from pinned upstream cobra Use/Flags/Args and --no-input required fields.
 * This module does not import the argv encoder and must not be generated from it.
 */

export const REVENUECAT_CLI_COMMAND_SCHEMA_PIN = {
  tag: "v0.1.1",
  version: "0.1.1",
  commit: "448a9998bd2107c274b9eb1cf55ad5d5d81f6377",
  repository: "https://github.com/RevenueCat/cli",
} as const;

export const REVENUECAT_PRODUCT_TYPES = [
  "subscription",
  "consumable",
  "non_consumable",
  "one_time",
  "non_renewing_subscription",
] as const;
export type RevenueCatProductType = (typeof REVENUECAT_PRODUCT_TYPES)[number];

export type NativeArgvQualificationCode =
  | "unknown-command"
  | "missing-flag"
  | "missing-positional"
  | "unexpected-positional"
  | "invalid-flag-value"
  | "unknown-flag"
  | "secret-in-argv";

export type NativeArgvQualification =
  | { readonly ok: true; readonly command: readonly string[]; readonly builderOperationId: string }
  | { readonly ok: false; readonly code: NativeArgvQualificationCode; readonly message: string };

export interface PinnedNativeCommandSchema {
  readonly command: readonly string[];
  readonly builderOperationId: string;
  readonly source: {
    readonly path: string;
    readonly symbol: string;
    readonly use: string;
    readonly example: string;
  };
  readonly args: { readonly min: number; readonly max: number };
  readonly requiredFlags: readonly string[];
  readonly optionalFlags: readonly string[];
}

const INHERITED_VALUE_FLAGS = ["project-id", "profile"] as const;
const INHERITED_BOOLEAN_FLAGS = ["json", "no-input", "no-color", "yes"] as const;
const FORBIDDEN_FLAGS = ["api-key", "base-url"] as const;

export const PINNED_CREATE_ATTACH_SCHEMAS: readonly PinnedNativeCommandSchema[] = [
  {
    command: ["offerings", "create"],
    builderOperationId: "rc.catalog.create",
    source: {
      path: "internal/cli/offerings.go",
      symbol: "newOfferingsCreateCmd",
      use: "create",
      example: 'rc offerings create --lookup-key default --display-name "Default"',
    },
    args: { min: 0, max: 0 },
    requiredFlags: ["lookup-key", "display-name"],
    optionalFlags: [],
  },
  {
    command: ["products", "create"],
    builderOperationId: "rc.products.create",
    source: {
      path: "internal/cli/products.go",
      symbol: "newProductsCreateCmd",
      use: "create",
      example: "rc products create --store-id premium_monthly --type subscription --app-id test_app --title \"Premium Monthly\" --duration P1M",
    },
    args: { min: 0, max: 0 },
    requiredFlags: ["store-id", "type", "app-id"],
    optionalFlags: ["title", "display-name", "duration"],
  },
  {
    command: ["entitlements", "create"],
    builderOperationId: "rc.entitlements.create",
    source: {
      path: "internal/cli/entitlements.go",
      symbol: "newEntitlementsCreateCmd",
      use: "create",
      example: 'rc entitlements create --lookup-key pro --display-name "Pro"',
    },
    args: { min: 0, max: 0 },
    requiredFlags: ["lookup-key", "display-name"],
    optionalFlags: [],
  },
  {
    command: ["packages", "create"],
    builderOperationId: "rc.packages.create",
    source: {
      path: "internal/cli/packages.go",
      symbol: "newPackagesCreateCmd",
      use: "create [offering-id]",
      example: "rc packages create ofrng_default --lookup-key '$rc_monthly' --display-name \"Monthly\"",
    },
    args: { min: 1, max: 1 },
    requiredFlags: ["lookup-key", "display-name"],
    optionalFlags: [],
  },
  {
    command: ["entitlements", "attach"],
    builderOperationId: "rc.entitlements.attach",
    source: {
      path: "internal/cli/entitlements.go",
      symbol: "newEntitlementsAttachCmd",
      use: "attach <id> <product-id> [product-id...]",
      example: "rc entitlements attach entl_pro prod_monthly prod_yearly",
    },
    args: { min: 2, max: Number.POSITIVE_INFINITY },
    requiredFlags: [],
    optionalFlags: [],
  },
  {
    command: ["packages", "attach"],
    builderOperationId: "rc.packages.attach",
    source: {
      path: "internal/cli/packages.go",
      symbol: "newPackagesAttachCmd",
      use: "attach <package-id> <product-id> [product-id...]",
      example: "rc packages attach pkg_x prod_monthly",
    },
    args: { min: 2, max: Number.POSITIVE_INFINITY },
    requiredFlags: [],
    optionalFlags: [],
  },
  {
    command: ["paywalls", "attach"],
    builderOperationId: "rc.paywalls.attach",
    source: {
      path: "internal/cli/paywalls.go",
      symbol: "newPaywallsAttachCmd",
      use: "attach [paywall-id] [offering-id]",
      example: "rc paywalls attach pw_abc ofrng_default",
    },
    args: { min: 2, max: 2 },
    requiredFlags: [],
    optionalFlags: [],
  },
];

export const INCREMENT_B_MALFORMED_OFFERINGS_CREATE_ARGV = [
  "--project-id",
  "proj_approved",
  "offerings",
  "create",
  "off_default",
  "--json",
  "--no-input",
  "--no-color",
] as const;

export const PINNED_OFFERINGS_CREATE_ARGV = [
  "--project-id",
  "proj_approved",
  "offerings",
  "create",
  "--lookup-key",
  "default",
  "--display-name",
  "Default",
  "--json",
  "--no-input",
  "--no-color",
] as const;

export const PINNED_PRODUCTS_CREATE_ARGV = [
  "--project-id",
  "proj_approved",
  "products",
  "create",
  "--store-id",
  "premium_monthly",
  "--type",
  "subscription",
  "--app-id",
  "app_test",
  "--title",
  "Premium Monthly",
  "--duration",
  "P1M",
  "--json",
  "--no-input",
  "--no-color",
] as const;

export const PINNED_ENTITLEMENTS_CREATE_ARGV = [
  "--project-id",
  "proj_approved",
  "entitlements",
  "create",
  "--lookup-key",
  "pro",
  "--display-name",
  "Pro",
  "--json",
  "--no-input",
  "--no-color",
] as const;

export const PINNED_PACKAGES_CREATE_ARGV = [
  "--project-id",
  "proj_approved",
  "packages",
  "create",
  "ofrng_default",
  "--lookup-key",
  "$rc_monthly",
  "--display-name",
  "Monthly",
  "--json",
  "--no-input",
  "--no-color",
] as const;

export const PINNED_ENTITLEMENTS_ATTACH_ARGV = [
  "--project-id",
  "proj_approved",
  "entitlements",
  "attach",
  "entl_pro",
  "prod_monthly",
  "--json",
  "--no-input",
  "--no-color",
] as const;

export const PINNED_PACKAGES_ATTACH_ARGV = [
  "--project-id",
  "proj_approved",
  "packages",
  "attach",
  "pkg_x",
  "prod_monthly",
  "--json",
  "--no-input",
  "--no-color",
] as const;

export const PINNED_PAYWALLS_ATTACH_ARGV = [
  "--project-id",
  "proj_approved",
  "paywalls",
  "attach",
  "pw_abc",
  "ofrng_default",
  "--json",
  "--no-input",
  "--no-color",
] as const;

interface ParsedNativeArgv {
  readonly flags: ReadonlyMap<string, string>;
  readonly booleans: ReadonlySet<string>;
  readonly tokens: readonly string[];
}

function fail(code: NativeArgvQualificationCode, message: string): NativeArgvQualification {
  return { ok: false, code, message };
}

function parseNativeArgv(argv: readonly string[]): ParsedNativeArgv | NativeArgvQualification {
  const flags = new Map<string, string>();
  const booleans = new Set<string>();
  const tokens: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--") return fail("unknown-flag", "Refusing `--` passthrough in RevenueCat argv.");
    if (!token.startsWith("-")) {
      tokens.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    const name = (equals >= 0 ? token.slice(0, equals) : token).replace(/^--?/, "");
    const inline = equals >= 0 ? token.slice(equals + 1) : undefined;
    if ((FORBIDDEN_FLAGS as readonly string[]).includes(name)) {
      return fail("secret-in-argv", `Refusing ${token}. Secrets and endpoint overrides are not native create operands.`);
    }
    if ((INHERITED_BOOLEAN_FLAGS as readonly string[]).includes(name)) {
      if (inline !== undefined) return fail("invalid-flag-value", `${token} is a boolean flag.`);
      booleans.add(name);
      continue;
    }
    const value = inline ?? argv[index + 1];
    if (inline === undefined) index += 1;
    if (value === undefined || value.startsWith("-")) {
      return fail("missing-flag", `${token} is missing a value.`);
    }
    flags.set(name, value);
  }
  return { flags, booleans, tokens };
}

function schemaForTokens(tokens: readonly string[]): PinnedNativeCommandSchema | undefined {
  let best: PinnedNativeCommandSchema | undefined;
  for (const schema of PINNED_CREATE_ATTACH_SCHEMAS) {
    const matches = schema.command.every((part, index) => tokens[index] === part);
    if (!matches) continue;
    if (!best || schema.command.length > best.command.length) best = schema;
  }
  return best;
}

function allowedFlagNames(schema: PinnedNativeCommandSchema): Set<string> {
  return new Set<string>([...INHERITED_VALUE_FLAGS, ...schema.requiredFlags, ...schema.optionalFlags]);
}

export function findPinnedCreateAttachSchema(command: readonly string[]): PinnedNativeCommandSchema | undefined {
  return PINNED_CREATE_ATTACH_SCHEMAS.find(
    (schema) => schema.command.length === command.length && schema.command.every((part, index) => part === command[index]),
  );
}

export function qualifyRevenueCatNativeArgv(argv: readonly string[]): NativeArgvQualification {
  const parsed = parseNativeArgv(argv);
  if ("ok" in parsed) return parsed;
  const schema = schemaForTokens(parsed.tokens);
  if (!schema) {
    return fail("unknown-command", `No pinned v0.1.1 create/attach schema matches ${parsed.tokens.join(" ") || "(empty)"}.`);
  }
  const positionals = parsed.tokens.slice(schema.command.length);
  if (positionals.length < schema.args.min) {
    return fail("missing-positional", `${schema.command.join(" ")} requires ${schema.args.min} positional argument(s) under --no-input.`);
  }
  if (Number.isFinite(schema.args.max) && positionals.length > schema.args.max) {
    return fail(
      "unexpected-positional",
      `${schema.command.join(" ")} does not take positional ${positionals.join(" ")}. Required fields are flags in the pinned cobra schema.`,
    );
  }
  const allowed = allowedFlagNames(schema);
  for (const name of parsed.flags.keys()) {
    if (!allowed.has(name)) return fail("unknown-flag", `Flag --${name} is not in the pinned ${schema.command.join(" ")} schema.`);
  }
  for (const name of parsed.booleans) {
    if (!(INHERITED_BOOLEAN_FLAGS as readonly string[]).includes(name as (typeof INHERITED_BOOLEAN_FLAGS)[number])) {
      return fail("unknown-flag", `Flag --${name} is not a pinned inherited boolean.`);
    }
  }
  for (const name of schema.requiredFlags) {
    const value = parsed.flags.get(name)?.trim();
    if (!value) return fail("missing-flag", `${schema.command.join(" ")} requires --${name} under --no-input.`);
  }
  const productType = parsed.flags.get("type");
  if (productType !== undefined && !(REVENUECAT_PRODUCT_TYPES as readonly string[]).includes(productType)) {
    return fail("invalid-flag-value", `--type ${productType} is not a pinned product type.`);
  }
  return { ok: true, command: schema.command, builderOperationId: schema.builderOperationId };
}

export function argvContainsBareToken(argv: readonly string[], token: string): boolean {
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]!;
    if (current === token) {
      const previous = argv[index - 1];
      if (previous?.startsWith("-") && previous !== "--json" && previous !== "--no-input" && previous !== "--no-color" && previous !== "--yes") {
        continue;
      }
      return true;
    }
  }
  return false;
}
