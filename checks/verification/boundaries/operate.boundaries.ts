import { operate } from "../../../kernel/session/operating-service.js";
import type { OperateInput } from "../../../kernel/session/operating-types.js";
import { buildOperateFixture, cloneOperateInput } from "../fixtures/operate.fixtures.js";
import { assert, type Harness } from "../fixtures/_harness.js";

export function register(harness: Harness): void {
  harness.check("operate boundary: a raw patch cannot enter the operating service", () => {
    const input = buildOperateFixture();
    const receipt = operate({
      ...input,
      transport: { ...input.transport, patch: { targetDoc: "business-state", ops: [] } } as OperateInput["transport"] & { patch: unknown },
    });
    assert(receipt.actionStatus === "refused" && receipt.reasonCode === "operate.patch_refused", `expected patch refusal, got ${receipt.reasonCode}`);
  });

  harness.check("operate boundary: undeclared context selectors cannot enter the operating service", () => {
    const input = buildOperateFixture();
    const receipt = operate({
      ...input,
      transport: { ...input.transport, contextSelectors: ["knowledge/secret.md"] } as OperateInput["transport"] & { contextSelectors: string[] },
    });
    assert(receipt.actionStatus === "refused" && receipt.reasonCode === "operate.undeclared_selector", `expected selector refusal, got ${receipt.reasonCode}`);
  });

  harness.check("operate boundary: unregistered workspace and revoked lease refuse commit", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    const unregistered = operate({ ...input, gates: { ...input.gates, workspaceRegistered: false } });
    assert(unregistered.reasonCode === "operate.unregistered_workspace", `expected unregistered refusal, got ${unregistered.reasonCode}`);
    const lease = operate({ ...input, gates: { ...input.gates, lease: "revoked" } });
    assert(lease.reasonCode === "operate.lease_revoked", `expected lease refusal, got ${lease.reasonCode}`);
  });
}
