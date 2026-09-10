import { z } from "zod";

/** Compact handshake for local vs hosted B2C connections. Not a provider-readiness claim. */
export const connectionReceiptSchema = z.strictObject({
  mode: z.enum(["local_execution", "hosted_knowledge"]),
  identity: z.strictObject({
    recommended: z.enum(["b2c-local", "b2c-hosted"]),
    legacy: z.array(z.literal("b2c-app-builder")).max(1),
  }),
  knowledge: z.enum(["available", "unavailable"]),
  workspacePlanning: z.enum(["available", "unavailable"]),
  workspaceExecution: z.enum(["available", "unavailable"]),
  writes: z.enum(["cli_only", "unavailable"]),
  providerObservation: z.literal("not_tested"),
  engineVersion: z.string().min(1).max(32),
});
export type ConnectionReceipt = z.infer<typeof connectionReceiptSchema>;

export function connectionReceipt(input: {
  mode: "local_execution" | "hosted_knowledge";
  knowledge: "available" | "unavailable";
  engineVersion: string;
}): ConnectionReceipt {
  const engineVersion = input.engineVersion.trim() || "0.0.0";
  if (input.mode === "hosted_knowledge") {
    return {
      mode: "hosted_knowledge",
      identity: { recommended: "b2c-hosted", legacy: ["b2c-app-builder"] },
      knowledge: input.knowledge,
      workspacePlanning: "unavailable",
      workspaceExecution: "unavailable",
      writes: "unavailable",
      providerObservation: "not_tested",
      engineVersion,
    };
  }
  return {
    mode: "local_execution",
    identity: { recommended: "b2c-local", legacy: ["b2c-app-builder"] },
    knowledge: input.knowledge,
    workspacePlanning: "available",
    workspaceExecution: "available",
    writes: "cli_only",
    providerObservation: "not_tested",
    engineVersion,
  };
}

export function formatConnectionReceipt(receipt: ConnectionReceipt): string {
  return `Connection receipt: ${JSON.stringify(receipt)}`;
}

export function localMcpInstructions(input: { knowledge: "available" | "unavailable"; engineVersion: string }): string {
  const receipt = connectionReceipt({ mode: "local_execution", knowledge: input.knowledge, engineVersion: input.engineVersion });
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
  const receipt = connectionReceipt({ mode: "hosted_knowledge", knowledge: "available", engineVersion });
  return (
    " This connection is hosted knowledge (b2c-hosted). It cannot access local files or run a local business. " +
    "Connect the local builder as b2c-local for workspace planning and execution. " +
    formatConnectionReceipt(receipt)
  );
}
