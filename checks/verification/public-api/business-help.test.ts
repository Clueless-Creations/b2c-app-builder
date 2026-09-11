import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
    "Usage: b2c business-create --workspace <value> --directory <value> --name <value> --hypothesis <value> [--mandate <value>] [--mandate-file <value>] [--json]",
  );
});

test("business initialization help requires the mapped revision flag", () => {
  assert.equal(help("business-initialize"), "Usage: b2c business-initialize --workspace <value> --revision <value> [--json]");
});

test("business plan and run help mark schema defaults and optional fields as optional", () => {
  assert.equal(help("business-plan"), "Usage: b2c business-plan --workspace <value> [--concurrency <value>] [--json]");
  assert.equal(
    help("business-run"),
    "Usage: b2c business-run --workspace <value> --revision <value> --request <value> [--scope <value>] [--seconds <value>] [--concurrency <value>] [--runtime-observed <value>] [--json]",
  );
});

function helpBody(command: string): string {
  const result = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), command, "--help"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("business plan, run, and evidence help keep delivery distinct from store submission", () => {
  const plan = helpBody("business-plan");
  const run = helpBody("business-run");
  const evidence = helpBody("business-evidence");
  assert.match(plan, /completion\.deliveryAccepted is current closeout evidence, not store submission or release/);
  assert.match(run, /A successful bounded session is not delivery/);
  assert.match(run, /Runtime proof still requires an explicit workspace observation/);
  assert.match(run, /liveLaunchProven stays false without provider-native proof/);
  assert.match(evidence, /liveLaunchProven stays false until separately granted provider-native proof/);
});

test("business guide keeps deliveryAccepted off store submission and live launch", () => {
  const guide = readFileSync(path.join(root, "docs/guides/build-a-business.md"), "utf8");
  assert.match(guide, /completion\.deliveryAccepted` means the selected closeout evidence is currently/);
  assert.match(guide, /does not imply store submission or production release/);
  assert.match(guide, /liveLaunchProven: false` is an explicit contract limit/);
});
