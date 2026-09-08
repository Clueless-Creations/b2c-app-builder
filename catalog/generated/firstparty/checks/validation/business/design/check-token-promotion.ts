#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderTokenOutputs } from "../../../../tooling/promote-design-tokens.js";
import { hashDesignTokens, loadDesignSystem } from "../../../../tooling/lib/design-md.js";
import { issue, parseCliArgs, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const design = loadDesignSystem(args.root);
const issues: Issue[] = [...design.issues];

if (design.tokens) {
  const expectedHash = hashDesignTokens(design.tokens);
  const expectedOutputs = renderTokenOutputs(design.tokens);
  const outputDir = path.join(args.root, "design/system");
  const outputs = ["tokens.json", "tokens.css", "DesignTokens.swift", "design-tokens.ts", "design_tokens.dart"] as const;

  for (const name of outputs) {
    const filePath = path.join(outputDir, name);
    if (!existsSync(filePath)) {
      issues.push(issue("error", "token_promotion.output_missing", `Missing generated token output: design/system/${name}.`, `design/system/${name}`));
      continue;
    }
    const raw = readFileSync(filePath, "utf8");
    if (!raw.includes(expectedHash) || raw !== expectedOutputs[name]) {
      issues.push(
        issue("error", "token_promotion.output_stale", `design/system/${name} does not match the authored DESIGN.md token hash.`, `design/system/${name}`),
      );
    }
  }

  const jsonPath = path.join(outputDir, "tokens.json");
  if (existsSync(jsonPath)) {
    try {
      const dtcg = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
      if (dtcg.$schema !== "https://www.designtokens.org/schemas/2025.10/format.json") {
        issues.push(
          issue("error", "token_promotion.dtcg_schema", "design/system/tokens.json must declare the DTCG 2025.10 schema.", "design/system/tokens.json"),
        );
      }
      for (const group of ["color", "typography", "radius", "spacing", "motion"]) {
        if (!(group in dtcg))
          issues.push(issue("error", "token_promotion.dtcg_group_missing", `DTCG output must contain ${group}.`, "design/system/tokens.json"));
      }
    } catch (error) {
      issues.push(
        issue(
          "error",
          "token_promotion.dtcg_invalid",
          `design/system/tokens.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          "design/system/tokens.json",
        ),
      );
    }
  }

  const requiredNeedles: ReadonlyArray<readonly [string, string[]]> = [
    ["tokens.css", ["--color-primary", "--motion-duration-celebrate", "--space-md"]],
    ["DesignTokens.swift", ["enum DesignTokens", "enum Color", "enum Space", "durationCelebrate"]],
    ["design-tokens.ts", ["export const designTokens", '"color"', '"motion"']],
    ["design_tokens.dart", ["abstract final class DesignTokens", "motionMilliseconds", "motionEasing"]],
  ];
  for (const [name, needles] of requiredNeedles) {
    const filePath = path.join(outputDir, name);
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf8");
    for (const needle of needles) {
      if (!raw.includes(needle)) {
        issues.push(issue("error", "token_promotion.adapter_contract", `design/system/${name} must expose ${needle}.`, `design/system/${name}`));
      }
    }
  }
}

reportAndExit("Design token promotion check", issues);
