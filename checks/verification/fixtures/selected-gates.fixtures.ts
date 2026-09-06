import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { definition, author } from "./binding-resolution.fixtures.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { bindCatalogOperations } from "../../../kernel/composition/compile-bindings.js";
import { compilePlan, type CatalogInput } from "../../../kernel/engine/compile.js";
import { runDeterministicGates, assertGateProviderBindings } from "../../../kernel/session/deterministic-gates.js";
import { assert, skillRoot, type Harness } from "./_harness.js";
function setup(h: Harness) {
  const extension = definition();
  extension.implementations[0]!.validationContract = { id: "revenuecat", version: "1.0.0", kind: "billing" };
  extension.recipes[0]!.workflows = ["workflow.build"];
  extension.recipes[0]!.operations = [extension.recipes[0]!.operations[0]!];
  extension.recipes[0]!.operations[0]!.workflowContexts = [
    {
      workflowId: "workflow.build",
      instructions: "neutral",
      roleInstructions: "neutral",
      neutralReferenceIds: [],
      providerReferenceIds: [],
      neutralContextPackIds: [],
      providerContextPackIds: [],
    },
  ];
  const snapshot = author({ ...h, makeTempDir: (name) => h.makeTempDir(`${name}-${randomUUID()}`) }, extension);
  const resolved = resolveRecipeBindings({
    packages: [snapshot],
    recipe: { packageId: extension.id, packageVersion: extension.version, recipeId: extension.recipes[0]!.id },
    target: { platform: "ios", runtime: "swiftui" },
  });
  const source: CatalogInput = {
    version: "gates",
    artifacts: [],
    workflows: [
      {
        id: "workflow.build",
        title: "Build",
        domainId: "domain.code",
        actionClass: "draft",
        dependencies: [],
        outputPaths: [],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: ["check:revenue"],
        idempotent: true,
      },
    ],
  };
  return bindCatalogOperations(source, resolved);
}
function refuses(action: () => unknown, code: string) {
  let message = "";
  try {
    action();
  } catch (error) {
    message = String(error);
  }
  assert(message.includes(code), message || "did not refuse");
}
export function register(h: Harness): void {
  h.check("selected validation contract compiles exact gate argv and rejects forged adapter/version/argument identity", () => {
    const catalog = setup(h),
      plan = compilePlan(catalog),
      node = plan.nodes[0]!;
    assert(
      JSON.stringify(node.verification.gateArguments?.["check:revenue"]) ===
        JSON.stringify(["--provider-contract", "revenuecat", "--provider-contract-version", "1.0.0"]),
      "arguments missing",
    );
    assertGateProviderBindings(
      node.verification.gateIds,
      { gateArguments: node.verification.gateArguments, selectedOperation: node.selectedOperation },
      skillRoot,
    );
    for (const args of [["--provider-contract", "other"], ["--provider-contract revenuecat"], [], ["--provider-contract", "revenuecat", "--root", "/tmp"]]) {
      const tampered = structuredClone(catalog);
      tampered.workflows[0]!.gateArguments = { "check:revenue": args };
      refuses(() => compilePlan(tampered), "binding.gate_arguments_mismatch");
    }
    const tampered = structuredClone(catalog);
    tampered.workflows[0]!.selectedOperation!.implementation.validationContract!.version = "2.0.0";
    refuses(() => compilePlan(tampered), "binding.implementation_contract_mismatch");
    const removed = structuredClone(catalog);
    delete removed.workflows[0]!.gateArguments;
    refuses(() => compilePlan(removed), "binding.gate_arguments_mismatch");
    const shell = structuredClone(catalog);
    shell.workflows[0]!.gateCommands = ["check:revenue --provider-contract revenuecat"];
    refuses(() => compilePlan(shell), "binding.invalid_gate_id");
  });
  h.check("deterministic gate uses separate argv and refuses invalid selected contract before spawning", () => {
    const node = compilePlan(setup(h)).nodes[0]!,
      workspace = h.makeTempDir(`selected-gate-${randomUUID()}`),
      bin = path.join(workspace, "bin"),
      capture = path.join(workspace, "argv.txt");
    mkdirSync(bin);
    const npm = path.join(bin, "npm");
    writeFileSync(npm, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$B2C_GATE_TEST_CAPTURE"\nexit 0\n');
    chmodSync(npm, 0o755);
    const priorPath = process.env.PATH,
      priorCapture = process.env.B2C_GATE_TEST_CAPTURE;
    process.env.PATH = `${bin}:${priorPath}`;
    process.env.B2C_GATE_TEST_CAPTURE = capture;
    try {
      const result = runDeterministicGates(node.verification.gateIds, workspace, {
        gateArguments: node.verification.gateArguments,
        selectedOperation: node.selectedOperation,
      });
      assert(result.allPassed, "synthetic subprocess did not run");
      const argv = readFileSync(capture, "utf8").trim().split("\n");
      assert(
        argv.includes("check:revenue") &&
          argv.includes("--") &&
          argv.at(-4) === "--provider-contract" &&
          argv.at(-3) === "revenuecat" &&
          argv.at(-2) === "--provider-contract-version" &&
          argv.at(-1) === "1.0.0",
        "provider args were not separate tokens",
      );
      writeFileSync(capture, "untouched");
      const unregistered = runDeterministicGates(["check:catalog", "build"], workspace);
      assert(!unregistered.allPassed && unregistered.issueCodes.includes("gate.unregistered_host_command"), "non-gate script was accepted");
      assert(readFileSync(capture, "utf8") === "untouched", "preflight started a valid gate before rejecting a later command");
      const invalid = runDeterministicGates(node.verification.gateIds, workspace, {
        gateArguments: { "check:revenue": ["--provider-contract", "other"] },
        selectedOperation: node.selectedOperation,
      });
      assert(
        !invalid.allPassed && invalid.issueCodes.includes("gate.provider_binding_invalid") && readFileSync(capture, "utf8") === "untouched",
        "invalid binding spawned a process",
      );
    } finally {
      process.env.PATH = priorPath;
      if (priorCapture === undefined) delete process.env.B2C_GATE_TEST_CAPTURE;
      else process.env.B2C_GATE_TEST_CAPTURE = priorCapture;
    }
  });
}
