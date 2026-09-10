#!/usr/bin/env node
/**
 * Prints the hosted identity pair from the generated bundle the Worker ships.
 * Reads catalog/generated/hosted-knowledge.json. Does not rebuild or re-hash it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HOSTED_VERSION_BUNDLE_PATH = "catalog/generated/hosted-knowledge.json";

export function readHostedVersionPair(skillRoot: string): { engineVersion: string; bundleSha256: string } {
  const target = path.join(skillRoot, HOSTED_VERSION_BUNDLE_PATH);
  const parsed: unknown = JSON.parse(readFileSync(target, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${HOSTED_VERSION_BUNDLE_PATH} must be a JSON object.`);
  }
  const record = parsed as { engineVersion?: unknown; bundleSha256?: unknown };
  if (typeof record.engineVersion !== "string" || !record.engineVersion.trim()) {
    throw new Error(`${HOSTED_VERSION_BUNDLE_PATH} is missing engineVersion.`);
  }
  if (typeof record.bundleSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(record.bundleSha256)) {
    throw new Error(`${HOSTED_VERSION_BUNDLE_PATH} is missing bundleSha256.`);
  }
  return { engineVersion: record.engineVersion, bundleSha256: record.bundleSha256 };
}

function main(argv: string[]): number {
  let skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--skill-root" && argv[index + 1] && !argv[index + 1]!.startsWith("--")) {
      skillRoot = path.resolve(argv[++index]!);
      continue;
    }
    throw new Error("Usage: print-hosted-version.ts [--skill-root <directory>]");
  }
  const pair = readHostedVersionPair(skillRoot);
  process.stdout.write(`${pair.engineVersion} ${pair.bundleSha256}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Hosted version print failed.");
    process.exitCode = 1;
  }
}
