import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, skillRoot } from "./_harness.js";
import { ARCH02_RULE } from "../check-architecture.js";

function seedRepo(harness: Harness, name: string): string {
  const root = path.join(harness.tempRoot, name);
  mkdirSync(path.join(root, "kernel/schema"), { recursive: true });
  mkdirSync(path.join(root, "kernel/session"), { recursive: true });
  mkdirSync(path.join(root, "adapters"), { recursive: true });
  mkdirSync(path.join(root, "catalog/repository-profiles"), { recursive: true });
  mkdirSync(path.join(root, "checks/validation/business/process"), { recursive: true });
  mkdirSync(path.join(root, "checks/validation/business/design/lib"), { recursive: true });
  mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
  mkdirSync(path.join(root, "tooling"), { recursive: true });
  writeFileSync(path.join(root, "kernel/schema/types.ts"), "export type Id = string;\n");
  writeFileSync(path.join(root, "checks/validation/business/process/required-table-section.ts"), "export function inspectRenderedH2Section(): void {}\n");
  writeFileSync(path.join(root, "checks/validation/business/design/lib/worthiness-mechanical.ts"), "export function checkContrastMechanical(): void {}\n");
  return root;
}

export function register(harness: Harness): void {
  const realRoot = skillRoot;

  harness.runScriptArgs("architecture has no runtime imports of validators", "check-architecture", ["--repo-root", realRoot], 0);

  const validatorContract = seedRepo(harness, "architecture-validator-kernel-schema");
  writeFileSync(
    path.join(validatorContract, "checks/validation/repository/check-example.ts"),
    'import type { Id } from "../../../kernel/schema/types.js";\nexport const id: Id = "ok";\n',
  );
  harness.runScriptArgs(
    "architecture check allows checks/validation/repository to import kernel/schema",
    "check-architecture",
    ["--repo-root", validatorContract],
    0,
  );

  const commentOnly = seedRepo(harness, "architecture-comment-is-not-an-import");
  writeFileSync(
    path.join(commentOnly, "kernel/session/clean.ts"),
    '// import { inspectRenderedH2Section } from "../../checks/validation/business/process/required-table-section.js";\nexport const ok = true;\n',
  );
  harness.runScriptArgs("architecture check ignores validation import examples in comments", "check-architecture", ["--repo-root", commentOnly], 0);

  const twoViolations = seedRepo(harness, "architecture-scoped-exception");
  writeFileSync(
    path.join(twoViolations, "kernel/session/executor.ts"),
    'import { inspectRenderedH2Section } from "../../checks/validation/business/process/required-table-section.js";\nexport const run = inspectRenderedH2Section;\n',
  );
  writeFileSync(
    path.join(twoViolations, "adapters/new-violation.ts"),
    'import { inspectRenderedH2Section } from "../checks/validation/business/process/required-table-section.js";\nexport const extra = inspectRenderedH2Section;\n',
  );
  harness.runScriptArgs(
    "architecture check: a scoped exception does not permit a different dependency violation",
    "check-architecture",
    ["--repo-root", twoViolations, "--allow-edge", "kernel/session/executor.ts:1"],
    1,
    "adapters/new-violation.ts:1",
  );
  harness.runScriptArgs(
    "architecture check still cites ARCH-02 after a scoped exception for a different file",
    "check-architecture",
    ["--repo-root", twoViolations, "--allow-edge", "kernel/session/executor.ts:1"],
    1,
    "ARCH-02",
  );
  harness.runScriptArgs(
    "architecture check recorded-debt ledger does not accept a new synthetic violation",
    "check-architecture",
    ["--repo-root", twoViolations, "--accept-recorded-debt"],
    1,
    "adapters/new-violation.ts:1",
  );

  const toolingConsumer = seedRepo(harness, "architecture-tooling-consumer");
  writeFileSync(
    path.join(toolingConsumer, "tooling/grade-design-surface.ts"),
    'import { checkContrastMechanical } from "../checks/validation/business/design/lib/worthiness-mechanical.js";\nexport const grade = checkContrastMechanical;\n',
  );
  harness.runScriptArgs(
    "architecture check classifies tooling→checks/validation/business as an allowed consumer",
    "check-architecture",
    ["--repo-root", toolingConsumer],
    0,
  );

  harness.runScriptArgs(
    "architecture check emits the ARCH-02 rule under --json",
    "check-architecture",
    ["--repo-root", twoViolations, "--json"],
    1,
    ARCH02_RULE,
  );
}
