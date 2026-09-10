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
  observed: z
    .strictObject({
      knowledge: z.enum(["available", "unavailable"]).optional(),
      writes: z.enum(["mcp_readonly", "mcp_write_enabled"]).optional(),
    })
    .optional(),
});
export type ConnectionReceipt = z.infer<typeof connectionReceiptSchema>;

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
    ...(observed ? { observed } : {}),
  };
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

export function localMcpInstructions(input: {
  knowledge: "available" | "unavailable";
  engineVersion: string;
  writes?: "mcp_readonly" | "mcp_write_enabled";
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
    "Use it for workspace status, planning, and CLI-backed execution.",
    "Hosted knowledge is a different connection (b2c-hosted) and cannot see or run this workspace.",
    "A leftover b2c-app-builder registration is the legacy local name, not hosted knowledge.",
    "Provider readiness is not implied by this receipt.",
    formatConnectionReceipt(receipt),
  ].join(" ");
}

export function hostedMcpInstructionsSuffix(engineVersion: string): string {
  const receipt = connectionReceipt({ mode: "hosted_knowledge", engineVersion });
  return (
    " This connection is hosted knowledge (b2c-hosted). It cannot access local files or run a local business. " +
    "Connect the local builder as b2c-local for workspace planning and execution. " +
    "A leftover b2c-app-builder client name is the legacy local name, not this hosted handshake. " +
    formatConnectionReceipt(receipt)
  );
}
