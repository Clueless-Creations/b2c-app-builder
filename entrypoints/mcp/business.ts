import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PUBLIC_OPERATIONS } from "../../contracts/public-api/contract.js";
import { callPublicOperation } from "../../kernel/services/business.js";

export function registerPublicTools(server: McpServer): void {
  for (const operation of PUBLIC_OPERATIONS) {
    if (operation.mcp === null) continue;
    server.registerTool(
      operation.mcp,
      {
        title: operation.title,
        description: operation.description,
        inputSchema: operation.inputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (input: unknown) => {
        const result = callPublicOperation(operation.id, input);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result, ...(!result.ok ? { isError: true } : {}) };
      },
    );
  }
}
