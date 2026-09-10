import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateDesignWorthiness } from "../../validation/business/design/check-design-worthiness.js";
import { checkUndeclaredProofColors } from "../../validation/business/design/lib/worthiness-mechanical.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

function seedWorkspace(harness: Harness, name: string): string {
  const root = harness.makeTempDir(name);
  mkdirSync(path.join(root, "studio/seed"), { recursive: true });
  cpSync(path.join(skillRoot, "examples/workspace/business/DESIGN.md"), path.join(root, "DESIGN.md"));
  const seed = JSON.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/studio/seed/business.json"), "utf8")) as {
    designRoom: { status: string };
    surfaces: { mobileApp: { platforms: string[]; screens: unknown[]; flows: unknown[] } };
  };
  seed.designRoom.status = "rendered";
  writeFileSync(path.join(root, "studio/seed/business.json"), `${JSON.stringify(seed, null, 2)}\n`, "utf8");
  return root;
}

function addHomeScreen(root: string, platforms: string[] = ["ios"]): void {
  const seedPath = path.join(root, "studio/seed/business.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
    surfaces: { mobileApp: { platforms: string[]; screens: unknown[] } };
  };
  seed.surfaces.mobileApp.platforms = platforms;
  seed.surfaces.mobileApp.screens = [{ id: "home", name: "Home", status: "draft" }];
  writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
}

function addNativeFlowRow(root: string): void {
  const contractPath = path.join(root, "DESIGN.md");
  const contract = readFileSync(contractPath, "utf8");
  writeFileSync(
    contractPath,
    contract.replace(
      "| Contrast             | Mechanical | Open   | WCAG AA is the floor.                                           |",
      "| Contrast             | Mechanical | Open   | WCAG AA is the floor.                                           |\n| Native flow semantics | Attested   | Open   | Stack presentation; return to Home; Back is not trapped.        |",
    ),
    "utf8",
  );
}

export function register(harness: Harness): void {
  harness.check("design-worthiness: native flow omissions cannot disappear when a native screen is selected", () => {
    const root = seedWorkspace(harness, "worthiness-native-missing");
    addHomeScreen(root);
    const issues = validateDesignWorthiness(root, { mechanicalOnly: true });
    assert(
      issues.some((item) => item.code === "worthiness.native_flow_semantics_missing"),
      `expected native-flow omission, got ${issues.map((item) => item.code).join(", ") || "none"}`,
    );
  });

  harness.check("design-worthiness: an attested native flow row records presentation, return, and back", () => {
    const root = seedWorkspace(harness, "worthiness-native-attested");
    addHomeScreen(root);
    addNativeFlowRow(root);
    const issues = validateDesignWorthiness(root, { mechanicalOnly: true });
    assert(
      !issues.some((item) => item.code === "worthiness.native_flow_semantics_missing"),
      `native-flow row should satisfy rule 10, got ${issues.map((item) => item.code).join(", ")}`,
    );
  });

  harness.check("design-worthiness: web-only work is not burdened with native Back semantics", () => {
    const root = seedWorkspace(harness, "worthiness-web-only");
    addHomeScreen(root, ["web"]);
    const issues = validateDesignWorthiness(root, { mechanicalOnly: true });
    assert(
      !issues.some((item) => item.code === "worthiness.native_flow_semantics_missing"),
      "web-only surfaces must not invent native Back",
    );
  });

  harness.check("design-worthiness: undeclared proof colors are mechanical anti-generic drift", () => {
    const tokens = { tokens: { color: { background: "#ffffff", text: "#111111", primary: "#0c7c59" } } };
    const root = harness.makeTempDir("worthiness-color-drift");
    const proofs = path.join(root, "design/proofs");
    mkdirSync(proofs, { recursive: true });
    writeFileSync(path.join(proofs, "home.html"), "<html><body style=\"color:#ff00aa\">Drift</body></html>\n", "utf8");
    const drifted = checkUndeclaredProofColors(root, tokens, proofs);
    assert(
      drifted.some((item) => item.code === "worthiness.anti_generic_undeclared_color"),
      "undeclared hex must fail rule 11",
    );
    writeFileSync(path.join(proofs, "home.html"), "<html><body style=\"color:#0c7c59\">Token</body></html>\n", "utf8");
    const aligned = checkUndeclaredProofColors(root, tokens, proofs);
    assert(
      !aligned.some((item) => item.code === "worthiness.anti_generic_undeclared_color"),
      "authored token colors are not drift",
    );
  });
}
