import { z } from "zod";

/** Compact handshake for local vs hosted B2C connections. Mode declarations are not live evidence. */
export const connectionReceiptSchema = z.strictObject({
  mode: z.enum(["local_execution", "hosted_knowledge"]),
  identity: z.strictObject({
    recommended: z.enum(["b2c-local", "b2c-hosted"]),
    legacy: z.array(z.literal("b2c-app-builder")).max(1).optional(),
  }),
  engineVersion: z.string().min(1).max(32),
  declares: z.strictObject({
    knowledge: z.enum(["bundled", "none"]),
    workspacePlanning: z.enum(["local_cli", "none"]),
    workspaceExecution: z.enum(["local_cli", "none"]),
    writes: z.enum(["cli_default", "none"]),
  }),
  providerObservation: z.literal("not_tested"),
  observed: z
    .strictObject({
      knowledge: z.enum(["available", "unavailable"]).optional(),
      workspacePlanning: z.enum(["available", "unavailable"]).optional(),
      workspaceExecution: z.enum(["available", "unavailable"]).optional(),
      writes: z.enum(["mcp_readonly", "mcp_write_enabled"]).optional(),
    })
    .optional(),
});
export type ConnectionReceipt = z.infer<typeof connectionReceiptSchema>;

export const LOCAL_CLIENT_NAME = "b2c-local" as const;
export const HOSTED_CLIENT_NAME = "b2c-hosted" as const;
export const LEFTOVER_LOCAL_CLIENT_NAME = "b2c-app-builder" as const;

/** Claude, Cursor, and Codex names. Handshake receipts decide capability, not these labels. */
export const leftoverNameClientMatrix = [
  {
    client: "claude",
    freshLocal: "claude mcp add --scope user b2c-local --",
    leftoverLocal: "existing Claude user-scope name b2c-app-builder",
    hosted: "claude mcp add --transport http b2c-hosted ",
  },
  {
    client: "cursor",
    freshLocal: '"b2c-local": { "command"',
    leftoverLocal: 'existing Cursor mcpServers key "b2c-app-builder"',
    hosted: '"b2c-hosted": { "url"',
  },
  {
    client: "codex",
    freshLocal: "[mcp_servers.b2c-local]",
    leftoverLocal: "existing Codex table [mcp_servers.b2c-app-builder]",
    hosted: "codex mcp add b2c-hosted --url",
  },
] as const;

export type LeftoverNameClientRow = (typeof leftoverNameClientMatrix)[number];

export type ConfiguredConnectionReading = {
  clientName: string;
  leftoverName: boolean;
  mode: ConnectionReceipt["mode"];
  recommendedName: ConnectionReceipt["identity"]["recommended"];
  guidance: string;
};

export type ConfiguredConnectionSet = {
  names: readonly string[];
  bothConfigured: boolean;
  leftoverPointsAtLocal: boolean;
  leftoverPointsAtHosted: boolean;
  duplicateNames: boolean;
};

export type ConfiguredSurfaceNeed = "workspace_planning" | "workspace_execution" | "knowledge";

export type ConfiguredSurfaceSelection =
  | {
      status: "selected";
      need: ConfiguredSurfaceNeed;
      set: ConfiguredConnectionSet;
      connection: ConfiguredConnectionReading;
      guidance: string;
    }
  | {
      status: "wrong_surface";
      need: ConfiguredSurfaceNeed;
      set: ConfiguredConnectionSet;
      connection: ConfiguredConnectionReading;
      guidance: string;
    }
  | {
      status: "collision";
      need: ConfiguredSurfaceNeed;
      set: ConfiguredConnectionSet;
      guidance: string;
    }
  | {
      status: "unavailable";
      need: ConfiguredSurfaceNeed;
      set: ConfiguredConnectionSet;
      guidance: string;
    };

export function connectionReceipt(input: {
  mode: "local_execution" | "hosted_knowledge";
  engineVersion: string;
  observed?: ConnectionReceipt["observed"];
}): ConnectionReceipt {
  const engineVersion = input.engineVersion.trim() || "0.0.0";
  const observed = input.observed && Object.values(input.observed).some((value) => value !== undefined) ? input.observed : undefined;
  if (input.mode === "hosted_knowledge") {
    return {
      mode: "hosted_knowledge",
      identity: { recommended: "b2c-hosted" },
      engineVersion,
      declares: {
        knowledge: "bundled",
        workspacePlanning: "none",
        workspaceExecution: "none",
        writes: "none",
      },
      providerObservation: "not_tested",
      ...(observed ? { observed } : {}),
    };
  }
  return {
    mode: "local_execution",
    identity: { recommended: "b2c-local", legacy: ["b2c-app-builder"] },
    engineVersion,
    declares: {
      knowledge: "bundled",
      workspacePlanning: "local_cli",
      workspaceExecution: "local_cli",
      writes: "cli_default",
    },
    providerObservation: "not_tested",
    ...(observed ? { observed } : {}),
  };
}

/** Declared local support is not live worker-runtime health. Hosted-by-design stays on declares.none. */
export function anyWorkerRuntimeFound(runtimes: readonly { available: boolean }[]): boolean {
  return runtimes.some((entry) => entry.available);
}

export function observedLocalWorkspaceHealth(input: { workerRuntimeFound: boolean }): {
  workspacePlanning: "available";
  workspaceExecution: "available" | "unavailable";
} {
  return {
    workspacePlanning: "available",
    workspaceExecution: input.workerRuntimeFound ? "available" : "unavailable",
  };
}

/** Wrong-surface and provider claims come from declared capabilities, not the leftover server name. */
export function connectionCapabilityGuidance(receipt: ConnectionReceipt): string {
  if (receipt.declares.workspaceExecution === "none" || receipt.declares.workspacePlanning === "none") {
    return "Hosted knowledge is connected. It can return maintained guidance, but it cannot access or run this local business. Connect the local builder as b2c-local for workspace execution.";
  }
  if (receipt.observed?.workspaceExecution === "unavailable") {
    return "Use this local builder for workspace status, planning, and packaged knowledge. Execution health is separately degraded: no worker CLI was found. Fixture sessions still run. Provider readiness is not implied by this receipt.";
  }
  return "Use this local builder for workspace status, planning, and CLI-backed execution. Provider readiness is not implied by this receipt.";
}

export function formatConnectionReceipt(receipt: ConnectionReceipt): string {
  return `Connection receipt: ${JSON.stringify(receipt)}`;
}

export function parseConnectionReceipt(text: string): ConnectionReceipt {
  const marker = "Connection receipt: ";
  const start = text.indexOf(marker);
  if (start < 0) throw new Error("connection_receipt.missing");
  const encoded = text.slice(start + marker.length).trim().split(/\r?\n/, 1)[0] ?? "";
  return connectionReceiptSchema.parse(JSON.parse(encoded));
}

/** Capability comes from the handshake receipt, not the leftover client name. */
export function interpretConfiguredConnection(input: {
  clientName: string;
  receipt: ConnectionReceipt;
}): ConfiguredConnectionReading {
  const leftoverName = input.clientName === LEFTOVER_LOCAL_CLIENT_NAME;
  const capability = connectionCapabilityGuidance(input.receipt);
  const guidance = leftoverName
    ? input.receipt.mode === "hosted_knowledge"
      ? `The leftover client name ${LEFTOVER_LOCAL_CLIENT_NAME} is not a capability. ${capability}`
      : `The leftover client name ${LEFTOVER_LOCAL_CLIENT_NAME} is the legacy local registration. ${capability}`
    : capability;
  return {
    clientName: input.clientName,
    leftoverName,
    mode: input.receipt.mode,
    recommendedName: input.receipt.identity.recommended,
    guidance,
  };
}

function leftoverNameProse(receipt: ConnectionReceipt, capability: string): string {
  const leftover = interpretConfiguredConnection({ clientName: LEFTOVER_LOCAL_CLIENT_NAME, receipt });
  return leftover.guidance.endsWith(capability)
    ? leftover.guidance.slice(0, leftover.guidance.length - capability.length).trim()
    : leftover.guidance;
}

function handshakeGuidance(clientName: string, receipt: ConnectionReceipt): string {
  const bound = interpretConfiguredConnection({ clientName, receipt });
  if (bound.leftoverName) return bound.guidance;
  const leftoverProse = leftoverNameProse(receipt, bound.guidance);
  return leftoverProse.length > 0 ? `${bound.guidance} ${leftoverProse}` : bound.guidance;
}

export function localMcpInstructions(input: {
  knowledge: "available" | "unavailable";
  engineVersion: string;
  writes?: "mcp_readonly" | "mcp_write_enabled";
  clientName?: string;
  workspaceExecution: "available" | "unavailable";
}): string {
  const receipt = connectionReceipt({
    mode: "local_execution",
    engineVersion: input.engineVersion,
    observed: {
      knowledge: input.knowledge,
      writes: input.writes ?? "mcp_readonly",
      ...observedLocalWorkspaceHealth({ workerRuntimeFound: input.workspaceExecution === "available" }),
    },
  });
  return [
    "This is the local B2C App Builder. Register it as b2c-local.",
    handshakeGuidance(input.clientName ?? LOCAL_CLIENT_NAME, receipt),
    "Hosted knowledge is a different connection (b2c-hosted) and cannot see or run this workspace.",
    formatConnectionReceipt(receipt),
  ].join(" ");
}

export function hostedMcpInstructionsSuffix(engineVersion: string, clientName: string = HOSTED_CLIENT_NAME): string {
  const receipt = connectionReceipt({ mode: "hosted_knowledge", engineVersion });
  return (
    " This connection is hosted knowledge (b2c-hosted). " +
    handshakeGuidance(clientName, receipt) +
    " " +
    formatConnectionReceipt(receipt)
  );
}

export type ConfiguredConnectionEntry = {
  clientName: string;
  receipt: ConnectionReceipt;
};

export function configuredConnectionSet(entries: readonly ConfiguredConnectionEntry[]): ConfiguredConnectionSet {
  const names = entries.map((entry) => entry.clientName);
  return {
    names,
    bothConfigured:
      entries.some((entry) => entry.receipt.mode === "local_execution") &&
      entries.some((entry) => entry.receipt.mode === "hosted_knowledge"),
    leftoverPointsAtLocal: entries.some(
      (entry) => entry.clientName === LEFTOVER_LOCAL_CLIENT_NAME && entry.receipt.mode === "local_execution",
    ),
    leftoverPointsAtHosted: entries.some(
      (entry) => entry.clientName === LEFTOVER_LOCAL_CLIENT_NAME && entry.receipt.mode === "hosted_knowledge",
    ),
    duplicateNames: names.length !== new Set(names).size,
  };
}

function pickConfiguredEntry(
  entries: readonly ConfiguredConnectionEntry[],
  mode: ConnectionReceipt["mode"],
  recommendedName: ConnectionReceipt["identity"]["recommended"],
): ConfiguredConnectionEntry | undefined {
  const matches = entries.filter((entry) => entry.receipt.mode === mode);
  return matches.find((entry) => entry.clientName === recommendedName) ?? matches[0];
}

function configuredSurfaceNeedLabel(need: ConfiguredSurfaceNeed, mode: ConnectionReceipt["mode"]): string {
  if (need === "workspace_planning") return "workspace planning";
  if (need === "workspace_execution") return "workspace execution";
  return mode === "hosted_knowledge" ? "hosted knowledge" : "packaged knowledge";
}

function selectedSurfaceGuidance(
  need: ConfiguredSurfaceNeed,
  connection: ConfiguredConnectionReading,
  receipt: ConnectionReceipt,
): string {
  if (need === "workspace_execution" && receipt.observed?.workspaceExecution === "unavailable") {
    return connection.guidance;
  }
  return `Use ${connection.clientName} for ${configuredSurfaceNeedLabel(need, connection.mode)}.`;
}

/** Pick local vs hosted from declared receipts. Duplicate names are a collision, not a leftover third surface. */
export function selectConfiguredSurface(input: {
  entries: readonly ConfiguredConnectionEntry[];
  need: ConfiguredSurfaceNeed;
}): ConfiguredSurfaceSelection {
  const set = configuredConnectionSet(input.entries);
  if (set.duplicateNames) {
    return {
      status: "collision",
      need: input.need,
      set,
      guidance: `Duplicate B2C connection names are a collision, not a capability. Keep ${LOCAL_CLIENT_NAME} and ${HOSTED_CLIENT_NAME} as distinct names.`,
    };
  }
  const local = pickConfiguredEntry(input.entries, "local_execution", LOCAL_CLIENT_NAME);
  const hosted = pickConfiguredEntry(input.entries, "hosted_knowledge", HOSTED_CLIENT_NAME);
  if (input.need === "workspace_planning" || input.need === "workspace_execution") {
    if (local) {
      const connection = interpretConfiguredConnection(local);
      return {
        status: "selected",
        need: input.need,
        set,
        connection,
        guidance: selectedSurfaceGuidance(input.need, connection, local.receipt),
      };
    }
    if (hosted) {
      const connection = interpretConfiguredConnection(hosted);
      return { status: "wrong_surface", need: input.need, set, connection, guidance: connection.guidance };
    }
    return {
      status: "unavailable",
      need: input.need,
      set,
      guidance: `No B2C connection is configured for workspace planning or execution. Connect the local builder as ${LOCAL_CLIENT_NAME}.`,
    };
  }
  if (hosted) {
    const connection = interpretConfiguredConnection(hosted);
    return {
      status: "selected",
      need: input.need,
      set,
      connection,
      guidance: `Use ${connection.clientName} for ${configuredSurfaceNeedLabel(input.need, connection.mode)}.`,
    };
  }
  if (local && local.receipt.declares.knowledge === "bundled") {
    const connection = interpretConfiguredConnection(local);
    return {
      status: "selected",
      need: input.need,
      set,
      connection,
      guidance: `Use ${connection.clientName} for ${configuredSurfaceNeedLabel(input.need, connection.mode)}.`,
    };
  }
  return {
    status: "unavailable",
    need: input.need,
    set,
    guidance: "No B2C knowledge connection is configured.",
  };
}

export function bothConfiguredRoutingGuidance(): string {
  return [
    `When ${LOCAL_CLIENT_NAME} and ${HOSTED_CLIENT_NAME} are both configured, they stay separately named.`,
    `Workspace planning and execution use ${LOCAL_CLIENT_NAME}.`,
    `Hosted knowledge uses ${HOSTED_CLIENT_NAME}.`,
    `A leftover ${LEFTOVER_LOCAL_CLIENT_NAME} name is not a third surface.`,
    "Duplicate names are a collision, not a capability.",
    "Local packaged knowledge stays available when hosted knowledge is absent.",
    "A missing worker CLI degrades local execution health. It does not select hosted knowledge for execution.",
  ].join(" ");
}

export function leftoverNameMigrationGuidance(): string {
  return [
    "Existing leftover names stay in your agent config. Setup never edits Claude, Cursor, or Codex files.",
    `Claude leftover: ${leftoverNameClientMatrix[0].leftoverLocal}.`,
    `Cursor leftover: ${leftoverNameClientMatrix[1].leftoverLocal}.`,
    `Codex leftover: ${leftoverNameClientMatrix[2].leftoverLocal}.`,
    "The leftover name is not a capability. The handshake receipt decides local execution versus hosted knowledge.",
    `Rename a leftover local entry to ${LOCAL_CLIENT_NAME}, or a leftover hosted entry to ${HOSTED_CLIENT_NAME}, only when you choose to.`,
    `Fresh local setup uses ${LOCAL_CLIENT_NAME}. Hosted snippets use ${HOSTED_CLIENT_NAME}.`,
    bothConfiguredRoutingGuidance(),
    "Do not register hosted knowledge under the leftover name.",
  ].join("\n");
}

/**
 * Leftover MCP names for CLI-only public operations. Local MCP never registers these;
 * leftover agents still call them. Hosted knowledge refuses them as wrong-surface.
 * Local MCP refuses them as cli_only with the local receipt reading, not as missing tools.
 */
export const HOSTED_WRONG_SURFACE_LEFTOVER_CLI_ONLY_TOOL_NAMES = [
  "b2c_research_decision",
  "b2c_research_record",
  "b2c_package_import",
  "b2c_composition_activate",
  "b2c_composition_recover",
  "b2c_business_create",
  "b2c_business_initialize",
  "b2c_business_run",
  "b2c_business_recover",
] as const;

/** Local-only MCP names. Hosted knowledge refuses these without listing them as tools. */
export const HOSTED_WRONG_SURFACE_TOOL_NAMES = [
  "b2c_plan",
  "b2c_status",
  "b2c_operate",
  "b2c_bootstrap",
  "b2c_run",
  "b2c_approvals",
  "b2c_verify",
  "b2c_schedule",
  "b2c_business_status",
  "b2c_business_plan",
  "b2c_business_evidence",
  "b2c_packages",
  "b2c_composition_plan",
  "b2c_research_lookup",
  "b2c_discover",
  "b2c_compose",
  "b2c_market_report",
  "b2c_contribute_plan",
  "b2c_contribute_check",
  "b2c_contribute_preview",
  "b2c_contribute_upstreams",
  "b2c_contribute_upstream_check",
  "b2c_contribute_upgrade_plan",
  ...HOSTED_WRONG_SURFACE_LEFTOVER_CLI_ONLY_TOOL_NAMES,
] as const;

export type HostedWrongSurfaceToolName = (typeof HOSTED_WRONG_SURFACE_TOOL_NAMES)[number];

export type HostedWrongSurfaceRefusal = {
  error: "wrong_surface";
  toolName: string;
  connection: ConfiguredConnectionReading;
};

export function isHostedWrongSurfaceTool(name: string): name is HostedWrongSurfaceToolName {
  return (HOSTED_WRONG_SURFACE_TOOL_NAMES as readonly string[]).includes(name);
}

/** Wrong-surface local-only MCP names take capability from the hosted receipt, not a missing-tool guess. */
export function hostedWrongSurfaceRefusal(input: {
  engineVersion: string;
  toolName: string;
  clientName?: string;
}): HostedWrongSurfaceRefusal {
  return {
    error: "wrong_surface",
    toolName: input.toolName,
    connection: interpretConfiguredConnection({
      clientName: input.clientName ?? HOSTED_CLIENT_NAME,
      receipt: connectionReceipt({ mode: "hosted_knowledge", engineVersion: input.engineVersion }),
    }),
  };
}

export type LeftoverCliOnlyPublicToolName = (typeof HOSTED_WRONG_SURFACE_LEFTOVER_CLI_ONLY_TOOL_NAMES)[number];

export function isLeftoverCliOnlyPublicTool(name: string): name is LeftoverCliOnlyPublicToolName {
  return (HOSTED_WRONG_SURFACE_LEFTOVER_CLI_ONLY_TOOL_NAMES as readonly string[]).includes(name);
}

export type LeftoverCliOnlyLocalRefusal = {
  error: "cli_only";
  toolName: string;
  connection: ConfiguredConnectionReading;
};

/** Leftover CLI-only public MCP names stay on the local surface. They are not hosted wrong-surface. */
export function leftoverCliOnlyLocalRefusal(input: {
  engineVersion: string;
  toolName: string;
  clientName?: string;
  observed?: ConnectionReceipt["observed"];
}): LeftoverCliOnlyLocalRefusal {
  return {
    error: "cli_only",
    toolName: input.toolName,
    connection: interpretConfiguredConnection({
      clientName: input.clientName ?? LOCAL_CLIENT_NAME,
      receipt: connectionReceipt({
        mode: "local_execution",
        engineVersion: input.engineVersion,
        observed: input.observed,
      }),
    }),
  };
}

/**
 * Leftover write-gated local MCP names. Default local MCP never registers these;
 * leftover agents still call them. Hosted knowledge refuses them as wrong-surface.
 * Read-only local MCP refuses them as cli_only with the local receipt reading.
 * Write-enabled local MCP registers them and does not intercept.
 */
export const LOCAL_WRITE_GATED_LEFTOVER_TOOL_NAMES = [
  "b2c_bootstrap",
  "b2c_run",
  "b2c_approvals",
  "b2c_verify",
  "b2c_schedule",
] as const;

export type LeftoverWriteGatedLocalToolName = (typeof LOCAL_WRITE_GATED_LEFTOVER_TOOL_NAMES)[number];

export function isLeftoverWriteGatedLocalTool(name: string): name is LeftoverWriteGatedLocalToolName {
  return (LOCAL_WRITE_GATED_LEFTOVER_TOOL_NAMES as readonly string[]).includes(name);
}

function leftoverLocalMcpCallName(payload: unknown): { id: unknown; name: string } | null {
  let message = payload;
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch {
      return null;
    }
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const call = message as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  if (call.method !== "tools/call") return null;
  if (!call.params || typeof call.params !== "object" || Array.isArray(call.params)) return null;
  const name = (call.params as { name?: unknown }).name;
  if (typeof name !== "string") return null;
  return { id: "id" in call ? call.id : null, name };
}

function leftoverCliOnlyLocalMcpResult(
  id: unknown,
  refusal: LeftoverCliOnlyLocalRefusal,
): {
  jsonrpc: "2.0";
  id: unknown;
  result: { content: Array<{ type: "text"; text: string }>; structuredContent: LeftoverCliOnlyLocalRefusal; isError: true };
} {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(refusal) }],
      structuredContent: refusal,
      isError: true,
    },
  };
}

/** MCP tools/call for a leftover CLI-only public name becomes cli_only, not a missing-tool guess. */
export function leftoverCliOnlyLocalMcpResponse(
  payload: unknown,
  input: {
    engineVersion: string;
    clientName?: string;
    observed?: ConnectionReceipt["observed"];
  },
): unknown {
  const call = leftoverLocalMcpCallName(payload);
  if (!call || !isLeftoverCliOnlyPublicTool(call.name)) return null;
  return leftoverCliOnlyLocalMcpResult(
    call.id,
    leftoverCliOnlyLocalRefusal({
      engineVersion: input.engineVersion,
      toolName: call.name,
      clientName: input.clientName,
      observed: input.observed,
    }),
  );
}

/** Leftover write-gated names stay on the local surface. They are not hosted wrong-surface. */
export function leftoverWriteGatedLocalRefusal(input: {
  engineVersion: string;
  toolName: string;
  clientName?: string;
  observed?: ConnectionReceipt["observed"];
}): LeftoverCliOnlyLocalRefusal {
  return leftoverCliOnlyLocalRefusal(input);
}

/** MCP tools/call for a leftover write-gated name on read-only local MCP becomes cli_only. */
export function leftoverWriteGatedLocalMcpResponse(
  payload: unknown,
  input: {
    engineVersion: string;
    clientName?: string;
    observed?: ConnectionReceipt["observed"];
  },
): unknown {
  if (input.observed?.writes === "mcp_write_enabled") return null;
  const call = leftoverLocalMcpCallName(payload);
  if (!call || !isLeftoverWriteGatedLocalTool(call.name)) return null;
  return leftoverCliOnlyLocalMcpResult(
    call.id,
    leftoverWriteGatedLocalRefusal({
      engineVersion: input.engineVersion,
      toolName: call.name,
      clientName: input.clientName,
      observed: input.observed,
    }),
  );
}

/**
 * Leftover contributor local MCP names. Default local MCP never registers these;
 * leftover agents still call them. Hosted knowledge refuses them as wrong-surface.
 * Default local MCP refuses them as cli_only with the local receipt reading.
 * Contributor-enabled local MCP registers them and does not intercept.
 */
export const LOCAL_CONTRIBUTOR_LEFTOVER_TOOL_NAMES = [
  "b2c_contribute_plan",
  "b2c_contribute_check",
  "b2c_contribute_preview",
  "b2c_contribute_upstreams",
  "b2c_contribute_upstream_check",
  "b2c_contribute_upgrade_plan",
] as const;

export type LeftoverContributorLocalToolName = (typeof LOCAL_CONTRIBUTOR_LEFTOVER_TOOL_NAMES)[number];

export function isLeftoverContributorLocalTool(name: string): name is LeftoverContributorLocalToolName {
  return (LOCAL_CONTRIBUTOR_LEFTOVER_TOOL_NAMES as readonly string[]).includes(name);
}

/** Leftover contributor names stay on the local surface. They are not hosted wrong-surface. */
export function leftoverContributorLocalRefusal(input: {
  engineVersion: string;
  toolName: string;
  clientName?: string;
  observed?: ConnectionReceipt["observed"];
}): LeftoverCliOnlyLocalRefusal {
  return leftoverCliOnlyLocalRefusal(input);
}

/** MCP tools/call for a leftover contributor name on default local MCP becomes cli_only. */
export function leftoverContributorLocalMcpResponse(
  payload: unknown,
  input: {
    engineVersion: string;
    clientName?: string;
    observed?: ConnectionReceipt["observed"];
    contributorEnabled?: boolean;
  },
): unknown {
  if (input.contributorEnabled) return null;
  const call = leftoverLocalMcpCallName(payload);
  if (!call || !isLeftoverContributorLocalTool(call.name)) return null;
  return leftoverCliOnlyLocalMcpResult(
    call.id,
    leftoverContributorLocalRefusal({
      engineVersion: input.engineVersion,
      toolName: call.name,
      clientName: input.clientName,
      observed: input.observed,
    }),
  );
}
