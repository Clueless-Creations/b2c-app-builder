import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readFirstpartyPackage } from "../../../catalog/packs/installed-firstparty.js";
import { composeCatalog } from "../../../catalog/index.js";
import { validateExecutableCatalog } from "../../../kernel/session/catalog-contract.js";
import { ARCH02_RULE, classifyToolingValidationImport, collectArchitectureIssues } from "../../validation/repository/check-architecture.js";
import { PROVIDER_BOUNDARY_RULE } from "../../validation/repository/check-provider-boundary.js";
import { assert, skillRoot, type Harness } from "../fixtures/_harness.js";

export function register(harness: Harness): void {
  harness.check("architecture: reading an invalid pin refuses without writing", () => {
    for (const raw of [undefined, null, "fixture-private-value", {}, { version: "catalog.empty", workflows: [], artifacts: [] }]) {
      const result = validateExecutableCatalog(raw);
      assert(result?.reasonCode === "invalid_catalog", `expected catalog refusal, got ${result?.reasonCode}`);
      assert(!result!.reason.includes("fixture-private-value"), "refusal must not echo caller-private text");
    }
  });

  harness.check("architecture: default composition pins verified firstparty and an empty additional-pack list is stable", () => {
    const catalog = composeCatalog(skillRoot);
    const owner = readFirstpartyPackage(skillRoot).snapshot.extension;
    const pins = catalog.composition?.packs ?? [];
    assert(
      pins.length === 1 && pins[0]!.id === "business-pack.consumer-business" && pins[0]!.version === owner.version && pins[0]!.revision === owner.version,
      "default composition must pin exactly the verified firstparty package",
    );
    assert(
      Object.values(catalog.composition!.base).every((count) => count === 0),
      "the default has no privileged base graph",
    );
    assert(Boolean(catalog.composition?.fingerprint), "base composition must still emit a fingerprint");
    const again = composeCatalog(skillRoot, []);
    assert(again.composition?.fingerprint === catalog.composition?.fingerprint, "empty pack list must be byte-stable with no-pack composition");
  });

  harness.check("architecture: tooling→checks/validation/business is an explicit allowed-consumer classification", () => {
    const grade = classifyToolingValidationImport("tooling/grade-design-surface.ts", "checks/validation/business/design/lib/worthiness-mechanical.ts");
    const browser = classifyToolingValidationImport("tooling/browser-proof.ts", "checks/validation/business/design/design-acceptance.ts");
    assert(grade?.kind === "allowed-consumer", "grade-design-surface.ts must be classified, not skipped");
    assert(browser?.kind === "allowed-consumer", "browser-proof.ts must be classified, not skipped");
    const kernel = classifyToolingValidationImport("kernel/session/executor.ts", "checks/validation/business/process/required-table-section.ts");
    assert(kernel === undefined, "runtime kernel imports must not use the tooling classification");
  });

  harness.check("architecture: a scoped allow-edge does not cover a second kernel import", () => {
    const root = harness.makeTempDir("architecture-boundary-scoped");
    mkdirSync(path.join(root, "kernel/session"), { recursive: true });
    mkdirSync(path.join(root, "adapters"), { recursive: true });
    mkdirSync(path.join(root, "checks/validation/business/process"), { recursive: true });
    writeFileSync(path.join(root, "checks/validation/business/process/required-table-section.ts"), "export function inspectRenderedH2Section(): void {}\n");
    writeFileSync(
      path.join(root, "kernel/session/executor.ts"),
      'import { inspectRenderedH2Section } from "../../checks/validation/business/process/required-table-section.js";\nexport const run = inspectRenderedH2Section;\n',
    );
    writeFileSync(
      path.join(root, "adapters/new-violation.ts"),
      'import { inspectRenderedH2Section } from "../checks/validation/business/process/required-table-section.js";\nexport const extra = inspectRenderedH2Section;\n',
    );
    const issues = collectArchitectureIssues({
      repoRoot: root,
      allowEdges: new Set(["kernel/session/executor.ts:1"]),
    });
    const codes = issues.map((item) => item.code);
    assert(codes.includes(ARCH02_RULE), `expected ${ARCH02_RULE}, got ${codes.join(",")}`);
    const files = issues.map((item) => item.file ?? "");
    assert(
      files.some((file) => file.includes("adapters/new-violation.ts:1")),
      `expected the new adapter edge, got ${files.join(",")}`,
    );
    assert(!files.some((file) => file.includes("kernel/session/executor.ts:1")), "the scoped exception must not re-report the allowed executor edge");
  });

  harness.check("architecture: kernel must not import a provider-native DTO module", () => {
    const root = harness.makeTempDir("architecture-boundary-provider");
    mkdirSync(path.join(root, "kernel/engine"), { recursive: true });
    mkdirSync(path.join(root, "adapters/providers/revenuecat"), { recursive: true });
    writeFileSync(path.join(root, "adapters/providers/revenuecat/cli-operations.ts"), "export type NativeArgv = string[];\n");
    writeFileSync(
      path.join(root, "kernel/engine/policy.ts"),
      'import type { NativeArgv } from "../../adapters/providers/revenuecat/cli-operations.js";\nexport type Leaked = NativeArgv;\n',
    );
    const issues = collectArchitectureIssues({ repoRoot: root });
    assert(
      issues.some((item) => item.code === PROVIDER_BOUNDARY_RULE),
      `expected ${PROVIDER_BOUNDARY_RULE}, got ${issues.map((item) => item.code).join(",")}`,
    );
  });
}
