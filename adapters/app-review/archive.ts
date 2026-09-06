import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { parseInfoPlistScalarsFromBytes, requiredPlistIdentity } from "./plist.js";
import type { AppReviewArchiveInspection } from "./types.js";

function compiledInfoPlistPath(archivePath: string): string {
  const applicationsDirectory = path.join(archivePath, "Products", "Applications");
  if (!existsSync(applicationsDirectory)) {
    throw new Error("Archive is missing Products/Applications");
  }
  const infoPlists = readdirSync(applicationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
    .map((entry) => path.join(applicationsDirectory, entry.name, "Info.plist"))
    .filter((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (infoPlists.length !== 1) {
    throw new Error("Archive must contain exactly one compiled app Info.plist");
  }
  return infoPlists[0]!;
}

export function inspectBinaryArchive(input: {
  readonly workspaceRoot: string;
  readonly archiveRelativePath: string;
  readonly inspectedAt: string;
  readonly previousSha256?: string;
}): AppReviewArchiveInspection {
  const relative = input.archiveRelativePath.trim();
  if (!relative || relative.includes("..") || path.isAbsolute(relative) || !relative.endsWith(".xcarchive")) {
    throw new Error("App Review archive path must be a relative .xcarchive inside the consumer workspace");
  }
  const archivePath = path.join(input.workspaceRoot, relative);
  if (!existsSync(archivePath) || !statSync(archivePath).isDirectory()) {
    throw new Error("App Review archive does not exist");
  }
  const infoPlistPath = compiledInfoPlistPath(archivePath);
  const bytes = readFileSync(infoPlistPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (input.previousSha256 && input.previousSha256 === sha256) {
    throw new Error("App Review binary repair must inspect a new archive, not the previous artifact");
  }
  const identity = requiredPlistIdentity(parseInfoPlistScalarsFromBytes(bytes));
  if (!identity) {
    throw new Error("Compiled Info.plist must name bundle id, version, and build");
  }
  return {
    archiveRelativePath: relative,
    bundleId: identity.bundleId,
    marketingVersion: identity.marketingVersion,
    buildNumber: identity.buildNumber,
    infoPlistSha256: sha256,
    inspectedAt: input.inspectedAt,
  };
}
