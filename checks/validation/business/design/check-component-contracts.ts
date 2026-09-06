#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { loadDesignSystem } from "../../../../tooling/lib/design-md.js";
import { asArray, asString, isRecord, issue, parseCliArgs, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const issues: Issue[] = [];
const libraryRoot = path.join(args.root, "surfaces", "ui-library");
const componentIndexPath = path.join(libraryRoot, "component-index.json");
const componentsPath = path.join(libraryRoot, "components");
const adaptersPath = path.join(libraryRoot, "adapters");
const authoredDesignRoot = path.join(args.root, "examples/workspace/business");
const idPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const slugPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const tokenPattern = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/;
const symbolPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const implementationMaturities = new Set(["implemented", "verified", "stable"]);

function relative(filePath: string): string {
  return path.relative(args.root, filePath) || ".";
}

function readJson(filePath: string): unknown {
  if (!existsSync(filePath)) {
    issues.push(issue("error", "component_contract.file_missing", `Missing ${relative(filePath)}.`, relative(filePath)));
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(issue("error", "component_contract.invalid_json", `${relative(filePath)} is invalid JSON: ${message}`, relative(filePath)));
    return undefined;
  }
}

function readContract(filePath: string): { metadata: Record<string, unknown>; body: string } | undefined {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    issues.push(issue("error", "component_contract.file_missing", `Missing ${relative(filePath)}.`, relative(filePath)));
    return undefined;
  }
  const markdown = readFileSync(filePath, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(markdown);
  if (!match) {
    issues.push(issue("error", "component_contract.front_matter_missing", "Component contracts must start with YAML front matter.", relative(filePath)));
    return undefined;
  }
  try {
    const metadata = parseYaml(match[1] ?? "") as unknown;
    if (!isRecord(metadata)) {
      issues.push(issue("error", "component_contract.front_matter_invalid", "Component front matter must be an object.", relative(filePath)));
      return undefined;
    }
    return { metadata, body: match[2] ?? "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(issue("error", "component_contract.front_matter_invalid", `Component front matter is invalid YAML: ${message}`, relative(filePath)));
    return undefined;
  }
}

function requireText(record: Record<string, unknown>, field: string, code: string, file: string): string | undefined {
  const value = asString(record[field])?.trim();
  if (!value) {
    issues.push(issue("error", `${code}.${field}_missing`, `${field} must be a non-empty string.`, file));
  }
  return value;
}

function requireStringList(
  record: Record<string, unknown>,
  field: string,
  code: string,
  file: string,
  options: { allowEmpty?: boolean; pattern?: RegExp } = {},
): string[] {
  const raw = record[field];
  if (!Array.isArray(raw)) {
    issues.push(issue("error", `${code}.${field}_invalid`, `${field} must be an array.`, file));
    return [];
  }
  const values: string[] = [];
  for (const [index, item] of raw.entries()) {
    const value = asString(item)?.trim();
    if (!value) {
      issues.push(issue("error", `${code}.${field}.${index}_invalid`, `${field}[${index}] must be a non-empty string.`, file));
      continue;
    }
    if (options.pattern && !options.pattern.test(value)) {
      issues.push(issue("error", `${code}.${field}.${index}_format`, `${field}[${index}] has an invalid identifier: ${value}.`, file));
    }
    values.push(value);
  }
  if (!options.allowEmpty && values.length === 0) {
    issues.push(issue("error", `${code}.${field}_empty`, `${field} must include at least one value.`, file));
  }
  if (new Set(values).size !== values.length) {
    issues.push(issue("error", `${code}.${field}_duplicate`, `${field} must not contain duplicate values.`, file));
  }
  return values;
}

function flattenTokenIds(value: unknown, prefix = ""): string[] {
  if (!isRecord(value)) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) => flattenTokenIds(child, prefix ? `${prefix}.${key}` : key));
}

function knownTokenIds(): Set<string> {
  const design = loadDesignSystem(authoredDesignRoot);
  issues.push(...design.issues);
  if (!design.tokens) {
    issues.push(
      issue(
        "error",
        "component_contract.tokens_invalid",
        "examples/workspace/business/DESIGN.md must define valid authored design tokens.",
        "examples/workspace/business/DESIGN.md",
      ),
    );
    return new Set();
  }
  return new Set(flattenTokenIds(design.tokens.tokens));
}

function validatePortableFile(value: unknown, code: string, file: string): string | undefined {
  const relativePath = asString(value)?.trim();
  if (!relativePath) {
    issues.push(issue("error", `${code}.missing`, "A repository-relative file path is required.", file));
    return undefined;
  }
  const normalized = path.posix.normalize(relativePath);
  const unsafe =
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized !== relativePath ||
    relativePath.endsWith("/") ||
    relativePath.includes("?") ||
    relativePath.includes("#");
  if (unsafe) {
    issues.push(issue("error", `${code}.not_portable`, `Path must be a normalized repository-relative file path: ${relativePath}.`, file));
    return undefined;
  }
  const absolutePath = path.resolve(args.root, relativePath);
  const rootRelativePath = path.relative(args.root, absolutePath);
  const outsideRoot = rootRelativePath === ".." || rootRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelativePath);
  if (outsideRoot || !existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    issues.push(issue("error", `${code}.not_file`, `Path must resolve to an existing file: ${relativePath}.`, file));
    return undefined;
  }
  return absolutePath;
}

function hasSymbol(source: string, symbol: string): boolean {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(source);
}

const tokenIds = knownTokenIds();
const contractIds = new Set<string>();
const componentIndex = readJson(componentIndexPath);
if (!isRecord(componentIndex)) {
  issues.push(issue("error", "component_contract.index_invalid", "component-index.json must contain an object.", relative(componentIndexPath)));
} else {
  if (componentIndex.schemaVersion !== "1.0.0") {
    issues.push(issue("error", "component_contract.index_schema_version", "schemaVersion must be 1.0.0.", relative(componentIndexPath)));
  }
  const indexedComponents = asArray(componentIndex.components);
  if (indexedComponents.length === 0) {
    issues.push(issue("error", "component_contract.index_empty", "component-index.json must route to at least one contract.", relative(componentIndexPath)));
  }
  const indexedPaths = new Set<string>();
  for (const [index, entry] of indexedComponents.entries()) {
    const code = `component_contract.components.${index}`;
    if (!isRecord(entry)) {
      issues.push(issue("error", `${code}.index_entry_invalid`, `components[${index}] must be an object.`, relative(componentIndexPath)));
      continue;
    }
    const id = requireText(entry, "id", code, relative(componentIndexPath));
    const indexedPath = requireText(entry, "path", code, relative(componentIndexPath));
    if (id) {
      if (!idPattern.test(id)) issues.push(issue("error", `${code}.id_format`, `Invalid component id: ${id}.`, relative(componentIndexPath)));
      if (contractIds.has(id)) issues.push(issue("error", `${code}.id_duplicate`, `Duplicate component id: ${id}.`, relative(componentIndexPath)));
      contractIds.add(id);
    }
    if (!id || !indexedPath) continue;
    const expectedPath = `components/${id}.md`;
    if (indexedPath !== expectedPath) {
      issues.push(issue("error", `${code}.path_mismatch`, `Component ${id} must use ${expectedPath}.`, relative(componentIndexPath)));
      continue;
    }
    if (indexedPaths.has(indexedPath)) {
      issues.push(issue("error", `${code}.path_duplicate`, `Duplicate component path: ${indexedPath}.`, relative(componentIndexPath)));
    }
    indexedPaths.add(indexedPath);
    const contractPath = path.join(libraryRoot, indexedPath);
    const contract = readContract(contractPath);
    if (!contract) continue;
    const item = contract.metadata;
    const contractFile = relative(contractPath);
    if (item.schemaVersion !== "1.0.0") {
      issues.push(issue("error", `${code}.schema_version`, "schemaVersion must be 1.0.0.", contractFile));
    }
    const contractId = requireText(item, "id", code, contractFile);
    if (contractId !== id) {
      issues.push(issue("error", `${code}.indexed_id_mismatch`, `Indexed id ${id} does not match contract id ${contractId ?? "missing"}.`, contractFile));
    }
    const name = requireText(item, "name", code, contractFile);
    requireText(item, "purpose", code, contractFile);
    const category = requireText(item, "category", code, contractFile);
    if (category && !slugPattern.test(category)) {
      issues.push(issue("error", `${code}.category_format`, `Invalid category slug: ${category}.`, contractFile));
    }
    const maturity = requireText(item, "maturity", code, contractFile);
    if (maturity && maturity !== "specified") {
      issues.push(
        issue("error", `${code}.maturity_invalid`, "Shared contracts must remain specified. Native maturity belongs in adapter manifests.", contractFile),
      );
    }
    requireStringList(item, "states", code, contractFile, { pattern: slugPattern });
    requireStringList(item, "requirements", code, contractFile);
    requireStringList(item, "accessibility", code, contractFile);
    const referencedTokens = requireStringList(item, "tokenIds", code, contractFile, { allowEmpty: true, pattern: tokenPattern });
    for (const tokenId of referencedTokens) {
      if (!tokenIds.has(tokenId)) {
        issues.push(issue("error", `${code}.token_unknown`, `Unknown token id: ${tokenId}.`, contractFile));
      }
    }
    if (name && !contract.body.trimStart().startsWith(`# ${name}`)) {
      issues.push(issue("error", `${code}.title_mismatch`, `Contract body must start with # ${name}.`, contractFile));
    }
  }
  if (existsSync(componentsPath) && statSync(componentsPath).isDirectory()) {
    for (const name of readdirSync(componentsPath).filter((value) => value.endsWith(".md"))) {
      const componentPath = `components/${name}`;
      if (!indexedPaths.has(componentPath)) {
        issues.push(
          issue("error", "component_contract.unindexed", `Component contract is not in component-index.json: ${componentPath}.`, relative(componentIndexPath)),
        );
      }
    }
  } else {
    issues.push(issue("error", "component_contract.directory_missing", "surfaces/ui-library/components must exist.", relative(componentsPath)));
  }
}

if (!existsSync(adaptersPath) || !statSync(adaptersPath).isDirectory()) {
  issues.push(issue("error", "component_adapter.directory_missing", "surfaces/ui-library/adapters must exist.", relative(adaptersPath)));
} else {
  const manifestNames = readdirSync(adaptersPath)
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (manifestNames.length === 0) {
    issues.push(
      issue("error", "component_adapter.manifests_empty", "surfaces/ui-library/adapters must contain at least one adapter manifest.", relative(adaptersPath)),
    );
  }
  const adapterIds = new Set<string>();
  for (const manifestName of manifestNames) {
    const manifestPath = path.join(adaptersPath, manifestName);
    const manifestFile = relative(manifestPath);
    const manifest = readJson(manifestPath);
    if (!isRecord(manifest)) {
      issues.push(issue("error", "component_adapter.document_invalid", `${manifestFile} must contain an object.`, manifestFile));
      continue;
    }
    if (manifest.schemaVersion !== "1.0.0") {
      issues.push(issue("error", "component_adapter.schema_version", "schemaVersion must be 1.0.0.", manifestFile));
    }
    if (!isRecord(manifest.adapter)) {
      issues.push(issue("error", "component_adapter.identity_invalid", "adapter must be an object.", manifestFile));
      continue;
    }
    const adapterId = requireText(manifest.adapter, "id", "component_adapter", manifestFile);
    const stack = requireText(manifest.adapter, "stack", "component_adapter", manifestFile);
    const language = requireText(manifest.adapter, "language", "component_adapter", manifestFile);
    requireText(manifest.adapter, "displayName", "component_adapter", manifestFile);
    for (const [field, value] of [
      ["id", adapterId],
      ["stack", stack],
      ["language", language],
    ] as const) {
      if (value && !slugPattern.test(value)) {
        issues.push(issue("error", `component_adapter.${field}_format`, `${field} must be a lowercase slug: ${value}.`, manifestFile));
      }
    }
    if (adapterId) {
      if (adapterId !== path.basename(manifestName, ".json")) {
        issues.push(issue("error", "component_adapter.filename_mismatch", `Adapter ${adapterId} must use adapters/${adapterId}.json.`, manifestFile));
      }
      if (adapterIds.has(adapterId)) {
        issues.push(issue("error", "component_adapter.id_duplicate", `Duplicate adapter id: ${adapterId}.`, manifestFile));
      }
      adapterIds.add(adapterId);
    }

    const implementations = asArray(manifest.implementations);
    if (implementations.length === 0) {
      issues.push(issue("error", "component_adapter.implementations_empty", "implementations must include real native source.", manifestFile));
    }
    const implementedContracts = new Set<string>();
    for (const [index, item] of implementations.entries()) {
      const code = `component_adapter.implementations.${index}`;
      if (!isRecord(item)) {
        issues.push(issue("error", `${code}.invalid`, `implementations[${index}] must be an object.`, manifestFile));
        continue;
      }
      const contractId = requireText(item, "contractId", code, manifestFile);
      if (contractId) {
        if (!contractIds.has(contractId)) {
          issues.push(issue("error", `${code}.contract_unknown`, `Unknown component contract: ${contractId}.`, manifestFile));
        }
        if (implementedContracts.has(contractId)) {
          issues.push(issue("error", `${code}.contract_duplicate`, `Adapter repeats component contract: ${contractId}.`, manifestFile));
        }
        implementedContracts.add(contractId);
      }
      const maturity = requireText(item, "maturity", code, manifestFile);
      if (maturity && !implementationMaturities.has(maturity)) {
        issues.push(issue("error", `${code}.maturity_invalid`, `Unsupported implementation maturity: ${maturity}.`, manifestFile));
      }
      if (!isRecord(item.source)) {
        issues.push(issue("error", `${code}.source_invalid`, "source must be an object.", manifestFile));
      } else {
        const sourcePath = validatePortableFile(item.source.path, `${code}.source_path`, manifestFile);
        const symbols = requireStringList(item.source, "symbols", `${code}.source`, manifestFile, { pattern: symbolPattern });
        if (sourcePath) {
          const source = readFileSync(sourcePath, "utf8");
          for (const symbol of symbols) {
            if (!hasSymbol(source, symbol)) {
              issues.push(issue("error", `${code}.symbol_missing`, `Source does not contain symbol ${symbol}.`, manifestFile));
            }
          }
        }
      }
      if (item.previewPath !== undefined) {
        validatePortableFile(item.previewPath, `${code}.preview_path`, manifestFile);
      }
      if (!Array.isArray(item.proof)) {
        issues.push(issue("error", `${code}.proof_invalid`, "proof must be an array.", manifestFile));
        continue;
      }
      if ((maturity === "verified" || maturity === "stable") && item.proof.length === 0) {
        issues.push(issue("error", `${code}.proof_required`, `${maturity} implementations require at least one proof file.`, manifestFile));
      }
      for (const [proofIndex, proof] of item.proof.entries()) {
        if (!isRecord(proof)) {
          issues.push(issue("error", `${code}.proof.${proofIndex}_invalid`, `proof[${proofIndex}] must be an object.`, manifestFile));
          continue;
        }
        const kind = requireText(proof, "kind", `${code}.proof.${proofIndex}`, manifestFile);
        if (kind && !slugPattern.test(kind)) {
          issues.push(issue("error", `${code}.proof.${proofIndex}.kind_format`, `Invalid proof kind: ${kind}.`, manifestFile));
        }
        validatePortableFile(proof.path, `${code}.proof.${proofIndex}.path`, manifestFile);
      }
    }
  }
}

reportAndExit("Portable component contract check", issues);
