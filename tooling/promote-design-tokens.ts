#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashDesignTokens, loadDesignSystem, type PortableDesignTokens } from "./lib/design-md.js";
import { parseCliArgs, reportAndExit, type Issue } from "./lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const design = loadDesignSystem(args.root);
const issues: Issue[] = [...design.issues];

if (design.tokens) {
  const outputDir = path.join(args.root, "design/system");
  const tokenHash = hashDesignTokens(design.tokens);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "tokens.json"), `${JSON.stringify(renderDtcg(design.tokens, tokenHash), null, 2)}\n`, "utf8");
  writeFileSync(path.join(outputDir, "tokens.css"), renderCss(design.tokens, tokenHash), "utf8");
  writeFileSync(path.join(outputDir, "DesignTokens.swift"), renderSwift(design.tokens, tokenHash), "utf8");
  writeFileSync(path.join(outputDir, "design-tokens.ts"), renderTypeScript(design.tokens, tokenHash), "utf8");
  writeFileSync(path.join(outputDir, "design_tokens.dart"), renderDart(design.tokens, tokenHash), "utf8");
  console.log(`Promoted DESIGN.md tokens to ${path.relative(args.root, outputDir)} with hash ${tokenHash}`);
}

reportAndExit("Design token promotion", issues);

function renderDtcg(tokens: PortableDesignTokens, tokenHash: string): Record<string, unknown> {
  const dimensions = (values: Record<string, string | number>) =>
    Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { $value: dimensionValue(value) }]));
  const colors = Object.fromEntries(Object.entries(tokens.tokens.color).map(([name, value]) => [name, { $value: dtcgColor(value) }]));
  const typography = Object.fromEntries(
    Object.entries(tokens.tokens.font).map(([name, value]) => [
      name,
      { $type: "typography", $value: { fontFamily: value.family, fontWeight: Number(value.weight) || value.weight } },
    ]),
  );
  const motion = Object.fromEntries(
    Object.entries(tokens.tokens.motion).map(([name, value]) => {
      const easing = cubicBezier(value);
      return easing ? [name, { $type: "cubicBezier", $value: easing }] : [name, { $type: "duration", $value: durationValue(value) }];
    }),
  );
  return {
    $schema: "https://www.designtokens.org/schemas/2025.10/format.json",
    $description: "Generated from the authored DESIGN.md contract.",
    $extensions: { "com.b2c-app-builder": { source: "DESIGN.md", tokenHash } },
    color: { $type: "color", ...colors },
    typography,
    radius: { $type: "dimension", ...dimensions(tokens.tokens.radius) },
    spacing: { $type: "dimension", ...dimensions(tokens.tokens.space) },
    motion,
  };
}

function renderCss(tokens: PortableDesignTokens, tokenHash: string): string {
  const lines: string[] = [`/* source: DESIGN.md; design-token-hash: ${tokenHash} */`, ":root {"];
  for (const [group, values] of Object.entries({
    color: tokens.tokens.color,
    radius: tokens.tokens.radius,
    space: tokens.tokens.space,
    motion: tokens.tokens.motion,
  })) {
    for (const [name, value] of Object.entries(values)) lines.push(`  --${group}-${kebab(name)}: ${String(value)};`);
  }
  for (const [name, value] of Object.entries(tokens.tokens.font)) {
    lines.push(`  --font-${kebab(name)}: ${value.family};`);
    lines.push(`  --font-${kebab(name)}-weight: ${String(value.weight)};`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

function renderSwift(tokens: PortableDesignTokens, tokenHash: string): string {
  const lines = [`// source: DESIGN.md; design-token-hash: ${tokenHash}`, "import Foundation", "", "enum DesignTokens {"];
  lines.push("  enum Color {");
  for (const [name, value] of Object.entries(tokens.tokens.color)) lines.push(`    static let ${identifier(name)} = ${JSON.stringify(value)}`);
  lines.push("  }", "  enum Font {");
  for (const [name, value] of Object.entries(tokens.tokens.font)) {
    lines.push(`    static let ${identifier(name)}Family = ${JSON.stringify(value.family)}`);
    lines.push(`    static let ${identifier(name)}Weight = ${JSON.stringify(String(value.weight))}`);
  }
  lines.push("  }", "  enum Radius {");
  for (const [name, value] of Object.entries(tokens.tokens.radius)) lines.push(`    static let ${identifier(name)}: Double = ${pixelNumber(value)}`);
  lines.push("  }", "  enum Space {");
  for (const [name, value] of Object.entries(tokens.tokens.space)) lines.push(`    static let ${identifier(name)}: Double = ${pixelNumber(value)}`);
  lines.push("  }", "  enum Motion {");
  for (const [name, value] of Object.entries(tokens.tokens.motion)) {
    if (/ms$/i.test(value)) lines.push(`    static let ${identifier(name)}: Double = ${milliseconds(value) / 1000}`);
    else lines.push(`    static let ${identifier(name)} = ${JSON.stringify(value)}`);
  }
  lines.push("  }", "}", "");
  return lines.join("\n");
}

function renderTypeScript(tokens: PortableDesignTokens, tokenHash: string): string {
  const value = {
    color: tokens.tokens.color,
    font: tokens.tokens.font,
    radius: mapNumbers(tokens.tokens.radius, pixelNumber),
    space: mapNumbers(tokens.tokens.space, pixelNumber),
    motion: Object.fromEntries(
      Object.entries(tokens.tokens.motion).map(([name, raw]) => [name, /ms$/i.test(raw) ? milliseconds(raw) : (cubicBezier(raw) ?? raw)]),
    ),
  };
  return `// source: DESIGN.md; design-token-hash: ${tokenHash}\nexport const designTokens = ${JSON.stringify(value, null, 2)} as const;\n`;
}

function renderDart(tokens: PortableDesignTokens, tokenHash: string): string {
  const colors = dartMap(tokens.tokens.color, (value) => JSON.stringify(value));
  const fonts = dartMap(Object.fromEntries(Object.entries(tokens.tokens.font).map(([name, value]) => [name, value.family])), (value) => JSON.stringify(value));
  const radius = dartMap(tokens.tokens.radius, (value) => dartDouble(pixelNumber(String(value))));
  const space = dartMap(tokens.tokens.space, (value) => dartDouble(pixelNumber(String(value))));
  const durations = dartMap(Object.fromEntries(Object.entries(tokens.tokens.motion).filter(([, value]) => /ms$/i.test(value))), (value) =>
    String(milliseconds(String(value))),
  );
  const easing = dartMap(Object.fromEntries(Object.entries(tokens.tokens.motion).filter(([, value]) => !/ms$/i.test(value))), (value) => JSON.stringify(value));
  return [
    `// source: DESIGN.md; design-token-hash: ${tokenHash}`,
    "abstract final class DesignTokens {",
    `  static const color = <String, String>${colors};`,
    `  static const fontFamily = <String, String>${fonts};`,
    `  static const radius = <String, double>${radius};`,
    `  static const space = <String, double>${space};`,
    `  static const motionMilliseconds = <String, int>${durations};`,
    `  static const motionEasing = <String, String>${easing};`,
    "}",
    "",
  ].join("\n");
}

function dtcgColor(hex: string): Record<string, unknown> {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) return { colorSpace: "srgb", components: [0, 0, 0], hex };
  const value = match[1]!;
  const components = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  return { colorSpace: "srgb", components: components.map((component) => Number(component.toFixed(4))), hex: `#${value.toLowerCase()}` };
}

function dimensionValue(value: string | number): Record<string, unknown> {
  if (typeof value === "number") return { value, unit: "px" };
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)([a-z%]+)$/i);
  return match ? { value: Number(match[1]), unit: match[2] } : { value: Number(value) || 0, unit: "px" };
}

function durationValue(value: string): Record<string, unknown> {
  return { value: milliseconds(value), unit: "ms" };
}

function cubicBezier(value: string): number[] | undefined {
  const match = value.match(/^cubic-bezier\(([^)]+)\)$/i);
  if (!match) return undefined;
  const parts = match[1]!.split(",").map((part) => Number(part.trim()));
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : undefined;
}

function milliseconds(value: string): number {
  const parsed = Number.parseFloat(value.replace(/ms$/i, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pixelNumber(value: string | number): number {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(value.replace(/px$/i, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dartDouble(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function mapNumbers(values: Record<string, string | number>, convert: (value: string | number) => number): Record<string, number> {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, convert(value)]));
}

function dartMap(values: Record<string, unknown>, render: (value: unknown) => string): string {
  return `{${Object.entries(values)
    .map(([name, value]) => `${JSON.stringify(name)}: ${render(value)}`)
    .join(", ")}}`;
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function identifier(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_]/g, "_");
  return /^\d/.test(normalized) ? `token_${normalized}` : normalized;
}
