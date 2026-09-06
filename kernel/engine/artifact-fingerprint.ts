import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** Internal artifact identity, including directory entries. Never follows symlinks or truncates. */
export function outputFingerprintPath(target: string): string {
  const hash = createHash("sha256");
  let entries = 0;
  let bytes = 0;
  const visit = (current: string, relative: string, depth: number): void => {
    if (++entries > 100_000 || depth > 64) throw new Error("artifact inventory exceeds traversal bounds");
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`artifact must contain only regular files and directories: ${relative}`);
    hash.update(`${relative}\0${stat.mode}\0${stat.size}\0`);
    if (stat.isDirectory()) {
      for (const name of readdirSync(current).sort()) visit(path.join(current, name), path.posix.join(relative, name), depth + 1);
    } else {
      bytes += stat.size;
      if (bytes > 512 * 1024 * 1024) throw new Error("artifact inventory exceeds 512 MiB");
      hash.update(readFileSync(current));
    }
  };
  visit(target, ".", 0);
  return hash.digest("hex");
}
