import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function help(command: string): string {
  const result = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), command, "--help"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\n").find((line) => line.startsWith("Usage:"))!;
}

test("business creation help requires identity and hypothesis but permits omitted mandate", () => {
  assert.equal(
    help("business-create"),
    "Usage: b2c business-create --workspace <value> --directory <value> --name <value> --hypothesis <value> [--mandate <value>] [--json]",
  );
});

test("business initialization help requires the mapped revision flag", () => {
  assert.equal(help("business-initialize"), "Usage: b2c business-initialize --workspace <value> --revision <value> [--json]");
});

test("business plan and run help mark schema defaults and optional fields as optional", () => {
  assert.equal(help("business-plan"), "Usage: b2c business-plan --workspace <value> [--concurrency <value>] [--json]");
  assert.equal(
    help("business-run"),
    "Usage: b2c business-run --workspace <value> --revision <value> --request <value> [--scope <value>] [--seconds <value>] [--concurrency <value>] [--json]",
  );
});
