import { operateFromAdapter, operateFromCli, operateFromMcp, operateFromSchedule, semanticReceipt } from "../../../kernel/session/operating-service.js";
import { buildOperateFixture, cloneOperateInput } from "../fixtures/operate.fixtures.js";
import { assert, type Harness } from "../fixtures/_harness.js";

/**
 * Cross-surface operating-service parity (R28, KTD11): the same typed request through CLI, MCP,
 * schedule, and adapter wrappers must yield one semantic receipt. Commit through CLI and MCP
 * shares reducer-side idempotency. Transports never accept raw patches.
 */
export function register(harness: Harness): void {
  harness.check("operate parity: preview receipts are semantically identical across CLI, MCP, schedule, and adapter", () => {
    const input = buildOperateFixture();
    const cli = operateFromCli(input);
    const mcp = operateFromMcp(input);
    const schedule = operateFromSchedule(input);
    const adapter = operateFromAdapter(input);
    assert(semanticReceipt(cli) === semanticReceipt(mcp), "CLI and MCP preview receipts must match");
    assert(semanticReceipt(cli) === semanticReceipt(schedule), "CLI and schedule preview receipts must match");
    assert(semanticReceipt(cli) === semanticReceipt(adapter), "CLI and adapter preview receipts must match");
    assert(
      cli.source === "cli" && mcp.source === "mcp" && schedule.source === "schedule" && adapter.source === "adapter",
      "each wrapper records its own source",
    );
  });

  harness.check("operate parity: CLI and MCP commit share occurrence identity and idempotency", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    input.transport.idempotencyKey = "operate.parity.commit";
    const cli = operateFromCli(input);
    const mcp = operateFromMcp(input);
    assert(cli.actionStatus === "committed" && mcp.actionStatus === "committed", "both writable surfaces must commit");
    assert(cli.occurrenceId === mcp.occurrenceId, "CLI and MCP must reach the same occurrence");
    assert(cli.created === true && mcp.created === false, "the second surface must reuse the first commit");
  });

  harness.check("operate parity: read-only MCP refuses commit while preview still works", () => {
    const input = cloneOperateInput(buildOperateFixture());
    const preview = operateFromMcp({ ...input, gates: { ...input.gates, readOnlySurface: true } });
    assert(preview.actionStatus === "previewed", "read-only MCP may preview");
    input.transport.mode = "commit";
    const commit = operateFromMcp({ ...input, gates: { ...input.gates, readOnlySurface: true } });
    assert(commit.reasonCode === "operate.read_only", `read-only MCP commit must refuse, got ${commit.reasonCode}`);
  });
}
