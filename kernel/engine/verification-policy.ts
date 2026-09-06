import type { CompiledRunNode } from "./compile.js";

/** Gates and judgment are separate obligations. Pure so hosted briefs share the same rule. */
export function requiresIndependentReview(node: Pick<CompiledRunNode, "verification">): boolean {
  return node.verification.freshContext || node.verification.kind === "fresh_context";
}
