/**
 * Grouped top-level help rendered from the CLI command registry.
 *
 * Headings are presentation only. They are not command namespaces, catalog areas,
 * or permission grants. Command names and summaries stay literal.
 *
 * COMMANDS is the dispatcher registry. Keep it here so help and coverage checks
 * can import it without running the bin.
 */
export const COMMANDS = new Map([
  ["research-lookup", { script: "entrypoints/cli/business.ts", prefixArgs: ["research-lookup"], summary: "read saved research before a new provider query" }],
  [
    "research-record",
    { script: "entrypoints/cli/business.ts", prefixArgs: ["research-record"], summary: "revision-checked checkpoint for registered planning research" },
  ],
  ["business-create", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-create"], summary: "b2c/v1: create a registered hypothesis" }],
  ["business-initialize", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-initialize"], summary: "b2c/v1: initialize accepted product" }],
  ["business-plan", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-plan"], summary: "b2c/v1: passive authorized work preview" }],
  ["business-recover", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-recover"], summary: "b2c/v1: close a reconciled interrupted request" }],
  ["business-run", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-run"], summary: "b2c/v1: bounded revision-checked session" }],
  ["business-evidence", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-evidence"], summary: "b2c/v1: current accepted evidence" }],

  ["packages", { script: "entrypoints/cli/business.ts", prefixArgs: ["packages"], summary: "b2c/v1: inspect installed snapshots" }],
  ["package-import", { script: "entrypoints/cli/business.ts", prefixArgs: ["package-import"], summary: "b2c/v1: import operator-selected local package" }],
  ["composition-plan", { script: "entrypoints/cli/business.ts", prefixArgs: ["composition-plan"], summary: "b2c/v1: preview installed package activation" }],
  ["composition-activate", { script: "entrypoints/cli/business.ts", prefixArgs: ["composition-activate"], summary: "b2c/v1: activate exact preview" }],
  [
    "composition-recover",
    { script: "entrypoints/cli/business.ts", prefixArgs: ["composition-recover"], summary: "b2c/v1: resume or restore local activation" },
  ],
  ["market-report", { script: "entrypoints/cli/business.ts", prefixArgs: ["market-report"], summary: "b2c/v1: read comparable independent business outcomes" }],

  ["catalog", { script: "entrypoints/cli/business.ts", prefixArgs: ["catalog"], summary: "b2c/v1: discover capabilities, providers, and recipes (--json)" }],
  [
    "compose",
    {
      script: "entrypoints/cli/business.ts",
      prefixArgs: ["compose"],
      summary: "b2c/v1: preview a business composition (--config b2c.yaml --json); apply is unavailable",
    },
  ],
  [
    "business-status",
    {
      script: "entrypoints/cli/business.ts",
      prefixArgs: ["business-status"],
      summary: "b2c/v1: registered business lifecycle and work counts (--workspace <id> --json)",
    },
  ],
  ["setup", { script: "kernel/session/setup.ts", summary: "one-time machine preparation: b2c home, empty registry, health checks, next steps" }],
  [
    "founder-key",
    {
      script: "kernel/session/founder-key.ts",
      summary: "install the protected founder Ed25519 public-key trust store (dry-run by default)",
    },
  ],
  [
    "inspect",
    {
      script: "kernel/session/doctor.ts",
      summary: "check the builder installation and local tooling; records a sanitized local host observation. Does not install tools or approve a release.",
    },
  ],
  [
    "doctor",
    {
      script: "kernel/session/doctor.ts",
      aliasOf: "inspect",
      summary: "Same checks, finding codes, and host observation.",
    },
  ],
  ["new", { script: "kernel/session/new.ts", summary: "create a small planning workspace: b2c new <slug> [--dir <path>] [--idea <hypothesis>]" }],
  [
    "render-product",
    { script: "tooling/render-product.ts", summary: "render PRODUCT.md from product.yaml: b2c render-product --workspace <id-or-path> [--check]" },
  ],
  [
    "bootstrap",
    {
      script: "kernel/session/bootstrap.ts",
      summary: "compose entrypoints, workspace state, reducer baseline, and onboarding into a runnable workspace (dry-run by default)",
    },
  ],
  ["status", { script: "kernel/session/status.ts", summary: "read-only workspace status: durable run counts and latest founder digest" }],
  [
    "check",
    {
      script: "kernel/session/check.ts",
      summary: "run one named gate: b2c check <name> --workspace <id-or-path> [--json] (b2c check --list)",
    },
  ],
  ["plan", { script: "kernel/session/plan.ts", summary: "read-only frontier report: what would run, what is parked, and why" }],
  ["run", { script: "kernel/session/run.ts", summary: "one bounded headless session: resume durable state, dispatch, verify, digest" }],
  ["approve", { script: "kernel/session/approve.ts", summary: "record a founder approval, direct design-taste verdict, or audit delegation" }],
  ["verify", { script: "kernel/session/verify.ts", summary: "fresh-context acceptance for produced work (producer never verifies its own)" }],
  [
    "proof",
    {
      script: "kernel/session/proof.ts",
      summary: "one-target device proof: select iOS or Android, run its Route Ladder adapter, and write a bounded receipt",
    },
  ],
  [
    "browser-proof",
    {
      script: "tooling/browser-proof.ts",
      summary: "fresh Chrome landing proof from an authored, current-candidate browser-proof.json config",
    },
  ],
  [
    "scope",
    { script: "kernel/session/scope.ts", summary: "record a founder applicability verdict: answer a conditional question or override a profile deferral" },
  ],
  ["onboard", { script: "kernel/session/onboard.ts", summary: "apply founder grants, waivers, and budgets through the reducer" }],
  ["schedule", { script: "adapters/install-schedule.ts", summary: "install or remove the OS-level trigger for recurring sessions (dry-run by default)" }],
  ["workspaces", { script: "kernel/session/workspaces.ts", summary: "the machine's registry of its businesses: list, register, remove (the MCP allowlist)" }],
  ["list", { script: "kernel/session/workspaces.ts", prefixArgs: ["list"], summary: "every registered business with its live run status" }],
  ["operate", { script: "kernel/session/operate.ts", summary: "preview or commit the next operating-loop decision through one typed service" }],
  [
    "app-review-ingress",
    {
      script: "kernel/session/app-review-ingress.ts",
      summary: "verify, accept, or consume a signed App Store Connect webhook without asc webhooks serve",
    },
  ],
  [
    "update",
    {
      script: "kernel/session/update.ts",
      summary: "update the B2C App Builder install (dry-run by default); businesses re-pin separately via bootstrap --apply",
    },
  ],
  [
    "contribute",
    {
      script: "entrypoints/cli/contribute.ts",
      summary: "contributor and maintainer family: plan, check, preview, evaluate, upstreams, upstream-check, upgrade-plan (b2c contribute --help)",
    },
  ],
]);

export const HELP_SECTIONS = [
  {
    heading: "Prepare the kitchen — installation and workspaces",
    commands: ["setup", "inspect", "doctor", "workspaces", "list"],
  },
  {
    heading: "Build and run a business — product work and lifecycle",
    clusters: [
      { label: "Business lifecycle (normal supported path)", commands: ["business-create", "business-initialize", "business-plan", "business-run", "business-status", "business-recover"] },
      { label: "Research and operations", commands: ["research-lookup", "research-record", "operate", "market-report", "render-product"] },
      {
        label: "Advanced session controls (supported; not aliases of business-* commands)",
        commands: ["new", "bootstrap", "status", "plan", "run", "schedule"],
      },
    ],
  },
  {
    heading: "Review at the pass — evidence, verification, and authority",
    commands: ["business-evidence", "check", "verify", "proof", "browser-proof", "approve", "scope", "onboard", "founder-key", "app-review-ingress"],
  },
  {
    heading: "Maintain and extend — catalog, providers, and composition",
    commands: ["catalog", "compose", "packages", "package-import", "composition-plan", "composition-activate", "composition-recover", "update", "contribute"],
  },
];

export function listedCommandNames(sections = HELP_SECTIONS) {
  const names = [];
  for (const section of sections) {
    if (section.commands) names.push(...section.commands);
    if (section.clusters) {
      for (const cluster of section.clusters) names.push(...cluster.commands);
    }
  }
  return names;
}

function assertHelpCoverage(commands) {
  const listed = listedCommandNames();
  const listedSet = new Set(listed);
  if (listed.length !== listedSet.size) {
    throw new Error("help: HELP_SECTIONS lists a command more than once");
  }
  for (const name of listed) {
    if (!commands.has(name)) {
      throw new Error(`help: grouped command "${name}" is not registered`);
    }
  }
  for (const name of commands.keys()) {
    if (!listedSet.has(name)) {
      throw new Error(`help: registered command "${name}" is missing from grouped help`);
    }
  }
}

export const HELP_WRAP_COLUMNS = 80;

function wrapRow(prefix, summary, maxWidth) {
  const words = summary.split(/\s+/).filter(Boolean);
  if (words.length === 0) return prefix.trimEnd();
  const pad = " ".repeat(prefix.length);
  const lines = [];
  let column = prefix;
  for (const word of words) {
    const empty = column === prefix || column === pad;
    const tentative = empty ? column + word : `${column} ${word}`;
    if (tentative.length <= maxWidth || empty) {
      column = tentative;
      continue;
    }
    lines.push(column);
    column = pad + word;
  }
  lines.push(column);
  return lines.join("\n");
}

function formatRow(name, summary, width, indent) {
  return wrapRow(`${indent}${name.padEnd(width)}  `, summary, HELP_WRAP_COLUMNS);
}

export function renderUsage(commands = COMMANDS) {
  assertHelpCoverage(commands);
  const width = Math.max(12, ...[...commands.keys()].map((name) => name.length));
  const lines = ["Usage: b2c <command> [options]", ""];
  for (const section of HELP_SECTIONS) {
    lines.push(section.heading);
    const clusters = section.clusters ?? [{ commands: section.commands ?? [] }];
    for (const cluster of clusters) {
      const indent = cluster.label ? "    " : "  ";
      if (cluster.label) lines.push(`  ${cluster.label}`);
      for (const name of cluster.commands) {
        const meta = commands.get(name);
        if (!meta) {
          throw new Error(`help: grouped command "${name}" is not registered`);
        }
        const summary = meta.aliasOf ? `Supported equivalent of ${meta.aliasOf}. ${meta.summary}` : meta.summary;
        lines.push(formatRow(name, summary, width, indent));
      }
    }
    lines.push("");
  }
  lines.push("Most commands print usage when run without required options.");
  lines.push(
    wrapRow(
      "",
      "inspect runs the installation diagnostic and records a sanitized local host observation. b2c doctor is a supported equivalent.",
      HELP_WRAP_COLUMNS,
    ),
  );
  lines.push(
    wrapRow(
      "",
      "They do not install tools, approve a release, or accept --json or a command-specific --help flag.",
      HELP_WRAP_COLUMNS,
    ),
  );
  return lines.join("\n");
}
