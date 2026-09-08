import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, truncateSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { loadDesignSystem, validateDesignMd, typographyDependencyPaths } from "../../../tooling/lib/design-md.js";
import { renderTokenOutputs } from "../../../tooling/promote-design-tokens.js";
import { spawnSync } from "node:child_process";
import { composeCatalog } from "../../../catalog/index.js";
import { toCatalogInput } from "../../../catalog/bridge.js";
import { loadDesignState, parseDesignCliArgs } from "../../../tooling/lib/design-state.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { skillRoot, type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("design foundation: strict substantive gate refuses removal while legacy base remains compatible", () => {
    const root = harness.makeTempDir("strict-foundation");
    const original = readFileSync(path.join(skillRoot, "examples/workspace/business/DESIGN.md"), "utf8");
    const match = original.match(/^---\n([\s\S]*?)\n---/)!;
    const data = parseYaml(match[1]!);
    const write = () => writeFileSync(path.join(root, "DESIGN.md"), original.replace(match[0], `---\n${stringifyYaml(data)}---`));
    const check = (strict: boolean) =>
      spawnSync(
        resolveTsxBin(skillRoot),
        [path.join(skillRoot, "checks/validation/business/design/check-design-md.ts"), "--root", root, ...(strict ? ["--require-foundation"] : [])],
        { cwd: skillRoot, encoding: "utf8" },
      );
    write();
    const valid = check(true);
    assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);
    delete data.foundation;
    write();
    assert.equal(check(false).status, 0, "removing foundation keeps legacy/base input compatibility");
    const removed = check(true);
    assert.notEqual(removed.status, 0);
    assert(removed.stdout.includes("design_md.foundation_required"));
    for (const role of Object.values(data.typography) as Record<string, unknown>[])
      for (const key of Object.keys(role)) if (!["fontFamily", "fontWeight"].includes(key)) delete role[key];
    write();
    assert.equal(check(false).status, 0, "original minimal legacy role remains valid");
    const absent = check(true);
    assert.notEqual(absent.status, 0);
    assert(absent.stdout.includes("design_md.foundation_required"));
  });
  harness.check("design foundation: focused legacy maintenance edits and renders without replacing exploration", () => {
    const root = harness.makeTempDir("legacy-focused-maintenance");
    cpSync(path.join(skillRoot, "examples/workspace/business"), root, { recursive: true });
    const contractPath = path.join(root, "DESIGN.md");
    const original = readFileSync(contractPath, "utf8");
    const match = original.match(/^---\n([\s\S]*?)\n---/)!;
    const data = parseYaml(match[1]!);
    delete data.foundation;
    const acceptedExploration = JSON.stringify(data.exploration);
    for (const role of Object.values(data.typography) as Record<string, unknown>[])
      for (const key of Object.keys(role)) if (!["fontFamily", "fontWeight"].includes(key)) delete role[key];
    // A bounded body-weight correction, not a new concept or foundation migration.
    data.typography.body.fontWeight = 500;
    const repaired = original.replace(match[0], `---\n${stringifyYaml(data)}---`);
    writeFileSync(contractPath, repaired);
    for (const [script, flags] of [
      ["checks/validation/business/design/check-design-md.ts", []],
      ["tooling/render-design-room.ts", ["--static-only"]],
      ["checks/validation/business/design/check-design-room-contract.ts", []],
    ] as const) {
      const result = spawnSync(resolveTsxBin(skillRoot), [path.join(skillRoot, script), "--root", root, ...flags], { cwd: skillRoot, encoding: "utf8" });
      assert.equal(result.status, 0, `${script}\n${result.stdout}\n${result.stderr}`);
    }
    assert.equal(readFileSync(contractPath, "utf8"), repaired);
    const after = loadDesignSystem(root).frontmatter!;
    assert.equal(JSON.stringify(after.exploration), acceptedExploration);
    assert.equal(after.foundation, undefined);
    // This verifies direct maintenance commands, not engine or independent acceptance.
  });
  harness.check("design foundation: metrics validate and propagate without inventing native units", () => {
    const root = harness.makeTempDir("foundation-metrics");
    const original = readFileSync(path.join(skillRoot, "examples/workspace/business/DESIGN.md"), "utf8");
    const match = original.match(/^---\n([\s\S]*?)\n---/)!;
    const data = parseYaml(match[1]!);
    const write = () => writeFileSync(path.join(root, "DESIGN.md"), original.replace(match[0], `---\n${stringifyYaml(data)}---`));
    data.typography.body.fontSize = "1.125rem";
    data.typography.body.lineHeight = 1.65;
    data.typography.body.letterSpacing = "0.01rem";
    data.typography.body.nativeSize = 18;
    data.typography.body.nativeTracking = 0.16;
    data.typography.body.fontWeight = 500;
    write();
    const design = loadDesignSystem(root);
    assert.deepEqual(design.issues, []);
    const outputs = renderTokenOutputs(design.tokens!);
    const dtcg = JSON.parse(outputs["tokens.json"]!);
    assert.deepEqual(dtcg.typography.body.$value, {
      fontFamily: ["system-ui", "sans-serif"],
      fontWeight: 500,
      fontSize: { value: 1.125, unit: "rem" },
      lineHeight: 1.65,
      letterSpacing: { value: 0.01, unit: "rem" },
    });
    assert(outputs["tokens.css"]!.includes("--font-body-size: 1.125rem;"));
    assert(outputs["DesignTokens.swift"]!.includes("bodySize: Double = 18"));
    assert(outputs["DesignTokens.swift"]!.includes("bodyTracking: Double = 0.16"));
    assert(outputs["design_tokens.dart"]!.includes('"body": "500"'));
    assert(outputs["design_tokens.dart"]!.includes('"body": 18.0'));
    assert(outputs["design_tokens.dart"]!.includes('"body": 0.16'));
    assert(outputs["design-tokens.ts"]!.includes('"size": "1.125rem"'));
    for (const [key, bad] of [
      ["fontSize", "0px"],
      ["fontSize", "12pt"],
      ["lineHeight", 0],
      ["letterSpacing", "normal"],
      ["nativeSize", undefined],
      ["fontWeight", 1001],
      ["resourceId", "absent"],
    ] as const) {
      const before = data.typography.body[key];
      data.typography.body[key] = bad;
      write();
      assert(
        loadDesignSystem(root).issues.some((finding) => finding.code === "design_md.typography_contract"),
        `${key}=${bad} must fail`,
      );
      data.typography.body[key] = before;
    }
    data.foundation.rationale[0].kind = "evidence";
    write();
    assert(loadDesignSystem(root).issues.some((finding) => finding.code === "design_md.foundation"));
    delete data.foundation;
    // Legacy DESIGN.md permits standard typography metrics without opting into new resource/native obligations.
    for (const role of Object.values(data.typography) as Record<string, unknown>[])
      for (const key of ["nativeSize", "nativeTracking", "fallbacks", "resourceId"]) delete role[key];
    write();
    const optionalLegacy = loadDesignSystem(root);
    assert.deepEqual(optionalLegacy.issues, []);
    assert.equal(JSON.parse(renderTokenOutputs(optionalLegacy.tokens!)["tokens.json"]!).typography.body.$type, undefined);
    for (const [color, components, alpha] of [
      ["#fff", [1, 1, 1], undefined],
      ["#000", [0, 0, 0], undefined],
      ["#f008", [1, 0, 0], 136 / 255],
      ["#00FF0080", [0, 1, 0], 128 / 255],
    ] as const) {
      optionalLegacy.tokens!.tokens.color.primary = color;
      const emitted = JSON.parse(renderTokenOutputs(optionalLegacy.tokens!)["tokens.json"]!).color.primary.$value;
      assert.deepEqual(emitted.components, components);
      assert.equal(emitted.alpha, alpha);
    }
    optionalLegacy.tokens!.tokens.color.primary = "unresolved-color";
    assert.throws(() => renderTokenOutputs(optionalLegacy.tokens!), /unsupported_color/, "unsupported colors must never silently become black");
    for (const role of Object.values(data.typography) as Record<string, unknown>[])
      for (const key of Object.keys(role)) if (!["fontFamily", "fontWeight"].includes(key)) delete role[key];
    write();
    const legacy = loadDesignSystem(root);
    assert.deepEqual(legacy.issues, []);
    const legacyDtcg = JSON.parse(renderTokenOutputs(legacy.tokens!)["tokens.json"]!);
    assert.equal(legacyDtcg.typography.body.$type, undefined, "legacy partial roles must not claim a complete typography composite");
    assert.equal(legacyDtcg.typography.body.fontWeight.$value, 500);
  });
  harness.check("design foundation: local font bytes, notices, traversal and stale promotion are checked", () => {
    const root = harness.makeTempDir("foundation-files");
    const original = readFileSync(path.join(skillRoot, "examples/workspace/business/DESIGN.md"), "utf8");
    const match = original.match(/^---\n([\s\S]*?)\n---/)!;
    const data = parseYaml(match[1]!);
    const resource = data.foundation.typographyResources[0];
    resource.mode = "local";
    resource.path = "font.bin";
    resource.licensePath = "FONT-NOTICE.txt";
    const bytes = Buffer.from("fixture bytes: hashing is not proof this font renders");
    resource.sha256 = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(path.join(root, "font.bin"), bytes);
    writeFileSync(path.join(root, "FONT-NOTICE.txt"), "Fixture notice; no real font redistributed.");
    const write = () => writeFileSync(path.join(root, "DESIGN.md"), original.replace(match[0], `---\n${stringifyYaml(data)}---`));
    write();
    assert.deepEqual(loadDesignSystem(root).issues, []);
    assert.deepEqual(typographyDependencyPaths(data), ["font.bin", "FONT-NOTICE.txt"]);
    truncateSync(path.join(root, "font.bin"), 128 * 1024 * 1024 + 1);
    assert(
      loadDesignSystem(root).issues.some((finding) => finding.message.includes("no larger than 134217728")),
      "oversized sparse font must be refused before reading bytes",
    );
    writeFileSync(path.join(root, "font.bin"), bytes);
    truncateSync(path.join(root, "FONT-NOTICE.txt"), 1024 * 1024 + 1);
    assert(
      loadDesignSystem(root).issues.some((finding) => finding.message.includes("no larger than 1048576")),
      "oversized notice must be refused before reading bytes",
    );
    writeFileSync(path.join(root, "FONT-NOTICE.txt"), "Fixture notice; no real font redistributed.");
    truncateSync(path.join(root, "DESIGN.md"), 1024 * 1024 + 1);
    assert(
      loadDesignSystem(root).issues.some((finding) => finding.code === "design_md.read_limit"),
      "oversized DESIGN must be refused before parsing",
    );
    write();

    writeFileSync(path.join(root, "font.bin"), "changed bytes");
    assert(loadDesignSystem(root).issues.some((finding) => finding.code === "design_md.typography_resource"));
    resource.path = "../outside.bin";
    write();
    assert(loadDesignSystem(root).issues.some((finding) => finding.code === "design_md.typography_resource"));
    const outside = path.join(harness.makeTempDir("outside-font"), "font.bin");
    writeFileSync(outside, bytes);
    symlinkSync(outside, path.join(root, "escape.bin"));
    resource.path = "escape.bin";
    write();
    assert(loadDesignSystem(root).issues.some((finding) => finding.code === "design_md.typography_resource"));
    resource.path = "font.bin";
    writeFileSync(path.join(root, "font.bin"), bytes);
    write();
    const design = loadDesignSystem(root);
    mkdirSync(path.join(root, "design/system"), { recursive: true });
    for (const [name, output] of Object.entries(renderTokenOutputs(design.tokens!))) writeFileSync(path.join(root, "design/system", name), output);
    const css = path.join(root, "design/system/tokens.css");
    writeFileSync(css, readFileSync(css, "utf8").replace("--font-body-weight: 400", "--font-body-weight: 900"));
    const check = spawnSync(resolveTsxBin(skillRoot), [path.join(skillRoot, "checks/validation/business/design/check-token-promotion.ts"), "--root", root], {
      cwd: skillRoot,
      encoding: "utf8",
    });
    assert.notEqual(check.status, 0, "retaining hash comment must not conceal mutated output");
    assert(check.stdout.includes("output_stale"));
    assert.equal(validateDesignMd(original).filter((finding) => finding.severity === "error").length, 0);
  });
  harness.check("design room: current state renders without mutating authored files", () => {
    const root = harness.makeTempDir("design-contract");
    mkdirSync(path.join(root, "studio/seed"), { recursive: true });
    const statePath = path.join(root, "studio/seed/business.json");
    cpSync(path.join(skillRoot, "surfaces/studio/seed/schema/business.empty.json"), statePath);
    cpSync(path.join(skillRoot, "examples/workspace/business/DESIGN.md"), path.join(root, "DESIGN.md"));
    const before = readFileSync(statePath);
    const design = readFileSync(path.join(root, "DESIGN.md"));
    const loaded = loadDesignState(parseDesignCliArgs(["--root", root]));
    assert.deepEqual(
      loaded.issues.filter((issue) => issue.severity === "error"),
      [],
    );
    const result = spawnSync(resolveTsxBin(skillRoot), [path.join(skillRoot, "tooling/render-design-room.ts"), "--root", root, "--static-only"], {
      cwd: skillRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert(readFileSync(path.join(root, "design/design-room.html"), "utf8").includes("Screens"));
    assert.deepEqual(readFileSync(statePath), before);
    assert.deepEqual(readFileSync(path.join(root, "DESIGN.md")), design);
    const invalid = { ...JSON.parse(before.toString()), unsupportedField: { panels: [] } };
    writeFileSync(statePath, JSON.stringify(invalid));
    const invalidBytes = readFileSync(statePath);
    assert(loadDesignState(parseDesignCliArgs(["--root", root])).issues.some((issue) => issue.code === "design_state.schema"));
    assert.deepEqual(readFileSync(statePath), invalidBytes);
  });
  harness.check("workflow catalog: runtime and app workflows preserve authored grouping", () => {
    const catalog = composeCatalog(skillRoot);
    const runtime = toCatalogInput(catalog);
    // Authored grouping is scoped to the onboarding review graph.
    const onboardingGraphNodes = runtime.workflows.filter(
      (workflow) => workflow.id.startsWith("workflow.experience.onboarding-system.onb-") || workflow.id === "workflow.experience.onboarding-conversion",
    );
    assert.equal(onboardingGraphNodes.length, 23, `expected 22 onb-NN nodes plus the terminal node, saw ${onboardingGraphNodes.length}`);
    assert(
      onboardingGraphNodes.every((workflow) => workflow.groupId === "onboarding-system"),
      "every onboarding graph node, including the id-breaking terminal node, must carry groupId onboarding-system",
    );
    const groupedWorkflows = runtime.workflows.filter((workflow) => workflow.groupId !== undefined);
    assert.equal(groupedWorkflows.length, 23, "groupId onboarding-system must be scoped to exactly the 23 onboarding graph nodes");
    assert(
      groupedWorkflows.every((workflow) => workflow.groupId === "onboarding-system"),
      "no workflow may carry a groupId other than onboarding-system",
    );
    for (const id of [
      "workflow.orchestration.session-continuity-resume",
      "workflow.orchestration.orient-scaffold-and-state-cockpit-upkeep",
      "workflow.process.provider-proof-verification",
      "workflow.process.change-cascade",
    ])
      assert(
        runtime.workflows.some((workflow) => workflow.id === id),
        `retained workflow missing: ${id}`,
      );
    for (const domain of ["domain.design", "domain.store", "domain.operations", "domain.engineering"]) {
      assert(
        runtime.workflows.some((workflow) => workflow.domainId === domain),
        `app-domain methods missing: ${domain}`,
      );
    }
    assert(
      runtime.workflows.every((workflow) => workflow.domainId !== "domain.machine"),
      "machine work remains excluded from dispatch",
    );
  });
}
