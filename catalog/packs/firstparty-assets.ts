import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Authored source trees copied as data. This grants no install or execution authority. */
export const FIRSTPARTY_ASSET_TREES = [
  "surfaces/starters/ai-chat-companion",
  "surfaces/starters/habit-tracker",
  "surfaces/starters/photo-ai-media",
  "surfaces/starters/social-network",
  "surfaces/ui-library/components",
] as const;
const ignored = new Set(["node_modules", ".git", ".next", ".build", "build", "dist", "out", ".vercel", "test-results", "playwright-report"]);
const excluded = (name: string) =>
  ignored.has(name) || name === "next-env.d.ts" || name.endsWith(".tsbuildinfo") || (name !== ".env.example" && (name === ".env" || name.startsWith(".env.")));
const allowed = ["knowledge/", "examples/workspace/", ...FIRSTPARTY_ASSET_TREES.map((entry) => `${entry}/`)];

/** Preserve relative links and exact bytes inside the package, including linked template assets. */
export function firstpartyAssetClosure(root: string, initial: readonly string[]): string[] {
  const queued: string[] = [];
  const seen = new Set(initial);
  const added = new Set<string>();
  const checked = (relative: string) => {
    if (!allowed.some((prefix) => relative.startsWith(prefix) || relative === prefix.slice(0, -1)))
      throw new Error(`firstparty.asset_outside_source_trees:${relative}`);
    let current = root;
    if (lstatSync(current).isSymbolicLink()) throw new Error("firstparty.asset_symlink_root");
    for (const segment of relative.split("/")) {
      if (!segment || segment === "." || segment === ".." || excluded(segment)) throw new Error(`firstparty.asset_unsafe_path:${relative}`);
      current = path.join(current, segment);
      if (lstatSync(current).isSymbolicLink()) throw new Error(`firstparty.asset_symlink:${relative}`);
    }
    return current;
  };
  const add = (relative: string): void => {
    const absolute = checked(relative),
      stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      for (const child of readdirSync(absolute).sort()) if (!excluded(child)) add(`${relative}/${child}`);
    } else {
      if (!stat.isFile()) throw new Error(`firstparty.asset_not_file:${relative}`);
      if (!seen.has(relative)) {
        seen.add(relative);
        added.add(relative);
        queued.push(relative);
      }
    }
  };
  for (const tree of FIRSTPARTY_ASSET_TREES) add(tree);
  queued.push(...initial.filter((relative) => relative.endsWith(".md")));
  while (queued.length) {
    const relative = queued.shift()!;
    if (!relative.endsWith(".md")) continue;
    const text = readFileSync(checked(relative), "utf8");
    for (const match of text.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
      const href = match[1]!.trim().split("#")[0]!;
      if (!href || /^[a-z]+:/i.test(href)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), href)).replace(/\/$/, "");
      add(target);
    }
  }
  return [...added].sort();
}
