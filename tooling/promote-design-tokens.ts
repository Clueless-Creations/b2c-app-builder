#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hashDesignTokens, loadDesignSystem, type PortableDesignTokens } from "./lib/design-md.js";
import { parseCliArgs, reportAndExit, type Issue } from "./lib/launch-state.js";

export function renderTokenOutputs(tokens: PortableDesignTokens): Record<string, string> {
  const hash = hashDesignTokens(tokens);
  return {
    "tokens.json": `${JSON.stringify(renderDtcg(tokens, hash), null, 2)}\n`,
    "tokens.css": renderCss(tokens, hash),
    "DesignTokens.swift": renderSwift(tokens, hash),
    "design-tokens.ts": renderTypeScript(tokens, hash),
    "design_tokens.dart": renderDart(tokens, hash),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseCliArgs(process.argv.slice(2));
  const design = loadDesignSystem(args.root);
  const issues: Issue[] = [...design.issues];
  if (design.tokens && !issues.some((finding) => finding.severity === "error")) {
    const outputDir = path.join(args.root, "design/system");
    mkdirSync(outputDir, { recursive: true });
    for (const [name, output] of Object.entries(renderTokenOutputs(design.tokens))) writeFileSync(path.join(outputDir, name), output, "utf8");
    console.log(`Promoted DESIGN.md tokens to ${path.relative(args.root, outputDir)} with hash ${hashDesignTokens(design.tokens)}`);
  }
  reportAndExit("Design token promotion", issues);
}

function renderDtcg(tokens: PortableDesignTokens, tokenHash: string): Record<string, unknown> {
  const dimensions = (values: Record<string, string | number>) =>
    Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { $value: dimensionValue(value) }]));
  const colors = Object.fromEntries(Object.entries(tokens.tokens.color).map(([name, value]) => [name, { $value: dtcgColor(value) }]));
  const typography = Object.fromEntries(
    Object.entries(tokens.tokens.font).map(([name, value]) => [
      name,
      value.size !== undefined && value.lineHeight !== undefined && value.letterSpacing !== undefined
        ? {
            $type: "typography",
            $value: {
              fontFamily: [value.family, ...(value.fallbacks ?? [])],
              fontWeight: Number(value.weight),
              fontSize: dimensionValue(value.size),
              lineHeight: value.lineHeight,
              letterSpacing: dimensionValue(value.letterSpacing),
            },
          }
        : { fontFamily: { $type: "fontFamily", $value: value.family }, fontWeight: { $type: "fontWeight", $value: Number(value.weight) || value.weight } },
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
    if (value.size !== undefined) {
      lines.push(`  --font-${kebab(name)}-size: ${value.size};`);
      lines.push(`  --font-${kebab(name)}-line-height: ${value.lineHeight};`);
      lines.push(`  --font-${kebab(name)}-letter-spacing: ${value.letterSpacing};`);
      lines.push(`  --font-${kebab(name)}-fallbacks: ${(value.fallbacks ?? []).join(", ")};`);
    }
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
    if (value.size !== undefined) {
      lines.push(`    static let ${identifier(name)}Size: Double = ${value.nativeSize}`);
      lines.push(`    static let ${identifier(name)}LineHeight: Double = ${value.lineHeight}`);
      lines.push(`    static let ${identifier(name)}Tracking: Double = ${value.nativeTracking}`);
      lines.push(`    static let ${identifier(name)}Fallbacks = ${JSON.stringify(value.fallbacks)}`);
    }
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
    `  static const fontWeight = <String, String>${dartMap(Object.fromEntries(Object.entries(tokens.tokens.font).map(([name, value]) => [name, String(value.weight)])), (value) => JSON.stringify(value))};`,
    ...["nativeSize", "lineHeight", "nativeTracking"].map(
      (field) =>
        `  static const ${field} = <String, double>${dartMap(
          Object.fromEntries(
            Object.entries(tokens.tokens.font)
              .filter(([, value]) => value.size !== undefined)
              .map(([name, value]) => [name, value[field as keyof typeof value]]),
          ),
          (value) => dartDouble(Number(value)),
        )};`,
    ),
    `  static const fontFallbacks = <String, List<String>>${dartMap(
      Object.fromEntries(
        Object.entries(tokens.tokens.font)
          .filter(([, value]) => value.fallbacks !== undefined)
          .map(([name, value]) => [name, value.fallbacks]),
      ),
      (value) => JSON.stringify(value),
    )};`,
    `  static const radius = <String, double>${radius};`,
    `  static const space = <String, double>${space};`,
    `  static const motionMilliseconds = <String, int>${durations};`,
    `  static const motionEasing = <String, String>${easing};`,
    "}",
    "",
  ].join("\n");
}

function dtcgColor(color: string): Record<string, unknown> {
  const match = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) throw new Error(`token_promotion.unsupported_color: ${color}; use an explicit 3, 4, 6, or 8 digit hexadecimal color for portable export.`);
  const input = match[1]!;
  const expanded = input.length <= 4 ? [...input].map((digit) => digit + digit).join("") : input;
  const value = expanded.slice(0, 6).toLowerCase();
  const components = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6), 16) / 255 : undefined;
  return {
    colorSpace: "srgb",
    components: components.map((component) => Number(component.toFixed(4))),
    ...(alpha === undefined ? {} : { alpha }),
    hex: `#${value}`,
  };
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
