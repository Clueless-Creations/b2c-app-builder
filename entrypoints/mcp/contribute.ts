import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONTRIBUTION_OPERATIONS } from "../../contracts/contribution/contract.js";
import { callContributionOperation, contributionRootsFromEnv } from "../../kernel/contribution/service.js";

/**
 * Opt-in contributor MCP surface (ADR-0005). Registered only when
 * `B2C_APP_BUILDER_MCP_CONTRIBUTOR=1`. Every tool is read-only: the service refuses network
 * fetches, host probes, and writes on this surface, and local source inspection is limited to
 * the roots in `B2C_APP_BUILDER_CONTRIBUTION_ROOTS`. The CLI-only operations (evaluate) are
 * never registered here. Business workers do not receive these tools or their results.
 */
export function contributorToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.B2C_APP_BUILDER_MCP_CONTRIBUTOR === "1";
}

export function registerContributorTools(server: McpServer, options: { skillRoot: string; env?: NodeJS.ProcessEnv }): string[] {
  const env = options.env ?? process.env;
  const roots = contributionRootsFromEnv(env);
  const registered: string[] = [];
  for (const operation of CONTRIBUTION_OPERATIONS) {
    if (operation.mcp === null) continue;
    server.registerTool(
      operation.mcp,
      {
        title: operation.title,
        description: `${operation.description} Contributor surface: read-only; no fetch, no host probe, no write; local paths must be absolute and inside a configured contribution root.`,
        inputSchema: operation.inputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (input: unknown) => {
        const result = await callContributionOperation(operation.id, input, { surface: "mcp", skillRoot: options.skillRoot, roots });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result as unknown as Record<string, unknown>,
          ...(!result.ok ? { isError: true } : {}),
        };
      },
    );
    registered.push(operation.mcp);
  }
  return registered;
}
