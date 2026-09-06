import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Keep imported CLIs inert while accepting an installed client's symlink entrypoint. */
export function isMainModule(moduleUrl: string, entrypoint = process.argv[1]): boolean {
  if (!entrypoint) return false;
  try {
    return realpathSync(entrypoint) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
