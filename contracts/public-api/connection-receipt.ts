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

/** Wrong-surface and provider claims come from declared capabilities, not the leftover server name. */
export function connectionCapabilityGuidance(receipt: ConnectionReceipt): string {
  if (receipt.declares.workspaceExecution === "none" || receipt.declares.workspacePlanning === "none") {
    return "Hosted knowledge is connected. It can return maintained guidance, but it cannot access or run this local business. Connect the local builder as b2c-local for workspace execution.";
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
}): string {
  const receipt = connectionReceipt({
    mode: "local_execution",
    engineVersion: input.engineVersion,
    observed: {
      knowledge: input.knowledge,
      writes: input.writes ?? "mcp_readonly",
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
        guidance: `Use ${connection.clientName} for ${configuredSurfaceNeedLabel(input.need, connection.mode)}.`,
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

/** Local workspace planning and execution names. Hosted knowledge refuses these without listing them as tools. */
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

/** Wrong-surface local workspace requests take capability from the hosted receipt, not a missing-tool guess. */
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
