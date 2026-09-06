import path from "node:path";
import { readPackageResourceFile, readStoredSnapshot, type PackageDependency } from "../../kernel/composition/resources.js";
export const FIRSTPARTY_DIRECTORY = "catalog/generated/firstparty";
export function readSkillVersion(skillRoot: string): string {
  const parsed = JSON.parse(readPackageResourceFile(skillRoot, "skill-version.json").toString("utf8")) as { version?: string };
  if (!parsed.version) throw new Error("catalog.skill_version_missing");
  return parsed.version;
}
/** Reads only shipped verified bytes. No dependency on authoring or rendering. */
export function readFirstpartyPackage(skillRoot: string): PackageDependency {
  const pin = JSON.parse(readPackageResourceFile(skillRoot, "catalog/generated/firstparty-pin.json").toString("utf8")) as { digest?: string; version?: string };
  if (!pin.digest || pin.version !== readSkillVersion(skillRoot)) throw new Error("catalog.firstparty_pin_invalid");
  const directory = path.join(skillRoot, FIRSTPARTY_DIRECTORY);
  const snapshot = readStoredSnapshot(directory, pin.digest);
  if (snapshot.extension.version !== pin.version) throw new Error("catalog.firstparty_version_mismatch");
  return { directory, snapshot };
}
