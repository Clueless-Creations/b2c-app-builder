#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeCatalog } from "../catalog/index.js";
import { loadKnowledgePackages } from "../catalog/knowledge-packages.js";
import type { Catalog, CatalogKnowledgePackage } from "../catalog/types.js";
import { indexKnowledgeSections } from "../kernel/knowledge-service/sections.js";
import { codePointPrefix } from "../kernel/knowledge-service/service.js";
import {
  HOSTED_KNOWLEDGE_SCHEMA_VERSION,
  MAX_HOSTED_BUNDLE_BYTES,
  MAX_HOSTED_DOCUMENT_BYTES,
  MAX_HOSTED_REFERENCE_SUMMARY_LENGTH,
  type HostedKnowledgeBundle,
  type HostedKnowledgeDocument,
} from "../kernel/knowledge-service/types.js";
import { resolveSkillRoot } from "./lib/skill-root.js";

export const HOSTED_BUNDLE_RELATIVE_PATH = "catalog/generated/hosted-knowledge.json";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

const stableJson = (value: unknown): string => JSON.stringify(canonical(value));
const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function readBoundFile(skillRoot: string, binding: string, kind: "document" | "manifest"): { text: string; sha256: string } {
  const prefix = kind === "document" ? "knowledge/" : "catalog/knowledge/";
  const extension = kind === "document" ? /\.(?:md|ya?ml)$/u : /\.ya?ml$/u;
  if (
    !binding.startsWith(prefix) ||
    !extension.test(binding) ||
    binding.includes("\\") ||
    binding.includes("\0") ||
    path.isAbsolute(binding) ||
    path.posix.normalize(binding) !== binding
  ) {
    throw new Error(`hosted_bundle.binding_invalid: ${kind} must use a canonical catalog-bound path.`);
  }
  const root = realpathSync(skillRoot);
  const allowedRoot = realpathSync(path.join(root, prefix));
  const target = realpathSync(path.resolve(root, binding));
  // Check both the skill boundary and the content boundary after resolving symlinks.
  if (!inside(root, allowedRoot) || !inside(root, target) || !inside(allowedRoot, target)) {
    throw new Error(`hosted_bundle.binding_escape: ${kind} resolves outside its source directory.`);
  }
  const stat = statSync(target);
  const limit = kind === "document" ? MAX_HOSTED_DOCUMENT_BYTES : 64 * 1024;
  if (!stat.isFile() || stat.size > limit) throw new Error(`hosted_bundle.source_size: ${kind} is not a bounded regular file.`);
  const bytes = readFileSync(target);
  if (bytes.length > limit) throw new Error(`hosted_bundle.source_size: ${kind} exceeds its size limit.`);
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.includes("\0")) throw new Error(`hosted_bundle.source_encoding: ${kind} is not text.`);
  return { text, sha256: digest(bytes) };
}

/** Only this build-time module reads source files. The hosted service uses its output. */
export function buildHostedKnowledgeBundle(
  skillRoot: string,
  catalog: Catalog = composeCatalog(skillRoot),
  packages: readonly CatalogKnowledgePackage[] = loadKnowledgePackages(skillRoot),
): HostedKnowledgeBundle {
  const active = packages.filter((item) => item.lifecycle === "active").sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const references = new Map(catalog.references.map((reference) => [reference.id, reference]));
  const packageIds = new Set(active.map((item) => item.id));
  if (
    packageIds.size !== active.length ||
    references.size !== catalog.references.length ||
    references.size !== active.length ||
    catalog.references.some((reference) => reference.lifecycle !== "active" || !packageIds.has(reference.id))
  ) {
    throw new Error("hosted_bundle.active_graph_mismatch: catalog references must match active knowledge packages exactly.");
  }
  const documents: HostedKnowledgeDocument[] = active.map((item) => {
    const reference = references.get(item.id);
    if (!reference || reference.path !== item.path) throw new Error("hosted_bundle.binding_mismatch: the catalog and manifest paths differ.");
    const document = readBoundFile(skillRoot, item.path, "document");
    const manifest = readBoundFile(skillRoot, item.manifestPath, "manifest");
    const sourceMediaType = item.path.endsWith(".md") ? "text/markdown" : "application/yaml";
    // The active graph includes an authored YAML adjacency map. Preserve it as code,
    // with separate hashes for source bytes and the Markdown representation.
    const fenceLength = [...document.text.matchAll(/`+/gu)].reduce((length, match) => Math.max(length, match[0].length + 1), 3);
    const fence = "`".repeat(fenceLength);
    const markdown =
      sourceMediaType === "text/markdown" ? document.text : `${fence}yaml\n${document.text}${document.text.endsWith("\n") ? "" : "\n"}${fence}\n`;
    if (Buffer.byteLength(markdown, "utf8") > MAX_HOSTED_DOCUMENT_BYTES)
      throw new Error("hosted_bundle.source_size: rendered Markdown exceeds its size limit.");
    return {
      referenceId: item.id,
      markdown,
      // A strict code-point prefix of `markdown` above, generated once here (never at request
      // time) and hashed into bundleSha256 below along with everything else in `payload` — so a
      // regenerate is the only way a summary's bytes change.
      summary: codePointPrefix(markdown, MAX_HOSTED_REFERENCE_SUMMARY_LENGTH),
      contentSha256: digest(markdown),
      sections: indexKnowledgeSections(markdown),
      sourceMediaType,
      sourceSha256: document.sha256,
      manifestPath: item.manifestPath,
      manifestSha256: manifest.sha256,
    };
  });
  const payload = {
    schemaVersion: HOSTED_KNOWLEDGE_SCHEMA_VERSION,
    engineVersion: catalog.skillVersion,
    catalogSha256: digest(stableJson(catalog)),
    catalog: structuredClone(catalog),
    documents,
  };
  const bundle: HostedKnowledgeBundle = { ...payload, bundleSha256: digest(stableJson(payload)) };
  if (Buffer.byteLength(serializeHostedKnowledgeBundle(bundle), "utf8") > MAX_HOSTED_BUNDLE_BYTES) {
    throw new Error("hosted_bundle.bundle_size: the generated bundle exceeds its size limit.");
  }
  return bundle;
}

export function serializeHostedKnowledgeBundle(bundle: HostedKnowledgeBundle): string {
  return `${stableJson(bundle)}\n`;
}

export function hostedBundleIsCurrent(skillRoot: string, bundle: HostedKnowledgeBundle): boolean {
  const target = path.join(skillRoot, HOSTED_BUNDLE_RELATIVE_PATH);
  if (!existsSync(target)) return false;
  const root = realpathSync(skillRoot);
  if (!inside(root, realpathSync(target)) || lstatSync(target).isSymbolicLink() || statSync(target).size > MAX_HOSTED_BUNDLE_BYTES) return false;
  return readFileSync(target, "utf8") === serializeHostedKnowledgeBundle(bundle);
}

function writeBundle(skillRoot: string, bundle: HostedKnowledgeBundle): void {
  const root = realpathSync(skillRoot);
  const catalogRoot = realpathSync(path.join(root, "catalog"));
  if (!inside(root, catalogRoot)) throw new Error("hosted_bundle.output_escape: catalog resolves outside the skill.");
  const generatedRoot = path.join(catalogRoot, "generated");
  if (existsSync(generatedRoot) && lstatSync(generatedRoot).isSymbolicLink()) {
    throw new Error("hosted_bundle.output_escape: generated output must not use a symlink.");
  }
  mkdirSync(generatedRoot, { recursive: true });
  const target = path.join(generatedRoot, "hosted-knowledge.json");
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error("hosted_bundle.output_escape: generated output must not use a symlink.");
  writeFileSync(target, serializeHostedKnowledgeBundle(bundle), "utf8");
}

function main(argv: string[]): number {
  let skillRoot = resolveSkillRoot(import.meta.url);
  let check = false;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--check") check = true;
    // D1 (#32): the third reportAndExit outlier — this validator throws on any unrecognized
    // flag, so --json must be named here explicitly rather than falling through for free.
    else if (argv[index] === "--json") json = true;
    else if (argv[index] === "--skill-root" && argv[index + 1] && !argv[index + 1]!.startsWith("--")) skillRoot = path.resolve(argv[++index]!);
    else throw new Error("Usage: render-hosted-bundle.ts [--check] [--json] [--skill-root <directory>]");
  }
  const bundle = buildHostedKnowledgeBundle(skillRoot);
  if (check) {
    const current = hostedBundleIsCurrent(skillRoot, bundle);
    if (json) {
      const failures = current
        ? []
        : [{ severity: "error" as const, rule: "hosted_bundle.generated_drift", message: `${HOSTED_BUNDLE_RELATIVE_PATH} is stale` }];
      process.stdout.write(`${JSON.stringify({ pass: current, failures })}\n`);
      return current ? 0 : 1;
    }
    if (!current) {
      console.error(`ERROR hosted_bundle.generated_drift: ${HOSTED_BUNDLE_RELATIVE_PATH}`);
      return 1;
    }
    console.log(`Hosted knowledge bundle is current (${bundle.documents.length} active references, ${bundle.bundleSha256}).`);
  } else {
    writeBundle(skillRoot, bundle);
    console.log(`Wrote ${HOSTED_BUNDLE_RELATIVE_PATH} (${bundle.documents.length} active references, ${bundle.bundleSha256}).`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Hosted knowledge bundle generation failed.");
    process.exitCode = 1;
  }
}
