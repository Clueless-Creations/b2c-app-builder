#!/usr/bin/env node
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import path from "node:path";
import { FOUNDER_TRUST_MAX_BYTES, FounderTrustStoreError, installFounderTrustStore, trustedFounderKeyFromBase64Url } from "../engine/founder-trust-store.js";

interface ParsedArgs {
  readonly command?: string;
  readonly apply: boolean;
  readonly publicKeyFile?: string;
  readonly trustFile?: string;
}

function usage(code: number): never {
  const message = [
    "Usage: b2c founder-key install --public-key-file <canonical-base64url-text-file> [--trust-file <absolute>] [--apply]",
    "",
    "Installs only an Ed25519 public key. The command is a dry run until --apply is present.",
    "The public-key file must contain one canonical unpadded base64url line and no private key.",
  ].join("\n");
  console[code === 0 ? "log" : "error"](message);
  process.exit(code);
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const command = argv[0];
  if (command === "--help" || command === "-h" || command === "help") usage(0);
  let apply = false;
  let publicKeyFile: string | undefined;
  let trustFile: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--apply") {
      if (apply) usage(1);
      apply = true;
      continue;
    }
    if (token === "--public-key-file" || token === "--trust-file") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) usage(1);
      if (token === "--public-key-file") {
        if (publicKeyFile !== undefined) usage(1);
        publicKeyFile = value;
      } else {
        if (trustFile !== undefined) usage(1);
        trustFile = value;
      }
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") usage(0);
    usage(1);
  }
  return { command, apply, publicKeyFile, trustFile };
}

function callerPath(value: string): string {
  const caller = process.env.B2C_APP_BUILDER_CALLER_CWD?.trim() || process.cwd();
  return path.resolve(caller, value);
}

function readCanonicalPublicKeyFile(inputPath: string): string {
  const absolute = callerPath(inputPath);
  const pathStat = lstatSync(absolute);
  if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.size <= 0 || pathStat.size > FOUNDER_TRUST_MAX_BYTES) {
    throw new FounderTrustStoreError("founder_trust_key_invalid", "--public-key-file must be a bounded regular file and cannot be a symbolic link");
  }
  let descriptor: number | undefined;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== pathStat.dev || opened.ino !== pathStat.ino || opened.size !== pathStat.size) {
      throw new FounderTrustStoreError("founder_trust_key_invalid", "--public-key-file changed before it could be read");
    }
    const bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count === 0) throw new FounderTrustStoreError("founder_trust_key_invalid", "--public-key-file ended before its recorded size");
      offset += count;
    }
    const raw = bytes.toString("utf8");
    if (!raw.endsWith("\n") || raw.endsWith("\n\n") || raw.includes("\r")) {
      throw new FounderTrustStoreError("founder_trust_key_invalid", "--public-key-file must contain one canonical base64url line ending in LF");
    }
    const encoded = raw.slice(0, -1);
    trustedFounderKeyFromBase64Url(encoded);
    return encoded;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.command !== "install" || !args.publicKeyFile) usage(1);
  if (args.trustFile !== undefined && !path.isAbsolute(args.trustFile)) {
    throw new FounderTrustStoreError("founder_trust_path_invalid", "--trust-file must be absolute");
  }
  const result = installFounderTrustStore({
    publicKeyBase64Url: readCanonicalPublicKeyFile(args.publicKeyFile),
    trustFile: args.trustFile,
    apply: args.apply,
  });
  if (result.status === "dry_run") {
    console.log(`WOULD_INSTALL founder-key keyId=${result.keyId} trustFile=${result.canonicalTrustPath}`);
    console.log("NEXT rerun with --apply after reviewing this path and key id; the installed file hash includes its apply-time installedAt");
    return;
  }
  const verb = result.status === "installed" ? "INSTALLED" : "ALREADY_INSTALLED";
  console.log(`${verb} founder-key keyId=${result.keyId} trustFile=${result.canonicalTrustPath} sha256=${result.trustFileSha256}`);
}

try {
  main();
} catch (error) {
  const code = error instanceof FounderTrustStoreError ? error.code : "founder_trust_io_invalid";
  console.error(`ISSUE founder-key.${code}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
