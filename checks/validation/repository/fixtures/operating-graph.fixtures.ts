import { writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, skillRoot } from "./_harness.js";

const GATE = "check-operating-graph.ts";

export function register(harness: Harness): void {
  const run = (label: string, extra: string[], expectedCode: number, expectedText?: string): void => {
    harness.runScriptArgs(label, GATE, ["--skill-root", skillRoot, ...extra], expectedCode, expectedText);
  };

  run("operating-graph passes the shipped packs and kernel", [], 0, "0 error(s)");
  run("operating-graph fails when both business packs share one catalog", ["--compose-all"], 1, "operating_graph.pack_leakage");

  {
    const root = harness.makeEmptyFixture("operating-graph-kernel-branch");
    writeFileSync(
      path.join(root, "branch.ts"),
      'export function choose(packId: string): string {\n  if (packId === "business-pack.consumer-app") return "app";\n  return "other";\n}\n',
      "utf8",
    );
    run("operating-graph fails when kernel code branches on business identity", ["--kernel-root", root], 1, "operating_graph.kernel_business_branch");
  }
}
