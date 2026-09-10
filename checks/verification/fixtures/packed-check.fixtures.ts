import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { inventoryCheckScripts, resolvePackedCheckCommand } from "../../../tooling/lib/packed-check.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

export function register(h: Harness): void {
  h.check("packed-check: remaining-tsx inventory matches authored check scripts", () => {
    const scripts = (JSON.parse(readFileSync(path.join(skillRoot, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    const inventory = inventoryCheckScripts(scripts);
    const compiled = inventory.filter((entry) => !entry.remainingTsx).map((entry) => entry.id);
    const remaining = inventory.filter((entry) => entry.remainingTsx);
    assert(compiled.join(",") === "check:credits", `compiled-eligible check scripts drifted: ${compiled.join(",")}`);
    assert(remaining.length > 0, "remaining-tsx inventory must still name the uncompiled checks graph");
    assert(
      remaining.every(
        (entry) =>
          entry.sourcePath === undefined ||
          entry.sourcePath.startsWith("checks/") ||
          entry.sourcePath === "tooling/render-hosted-bundle.ts" ||
          entry.sourcePath === "tooling/render-public-api.ts",
      ),
      "remaining-tsx entries must stay under checks/ or the not-yet-allowlisted tooling renderers",
    );
    assert(
      remaining.some((entry) => entry.id === "check:design-md" && entry.sourcePath === "checks/validation/business/design/check-design-md.ts"),
      "remaining-tsx inventory lost a representative checks/ gate",
    );
  });

  h.check("packed-check: check:credits prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-credits");
    mkdirSync(path.join(root, "tooling"), { recursive: true });
    mkdirSync(path.join(root, "dist", "tooling"), { recursive: true });
    writeFileSync(path.join(root, "dist", "tooling", "render-credits.js"), "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));");
    writeFileSync(path.join(root, "tooling/render-credits.ts"), 'console.error("source ts fallback should not run"); process.exit(9);');
    const command = resolvePackedCheckCommand(root, "tsx tooling/render-credits.ts --check", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "tooling", "render-credits.js"),
      "packed check:credits must exec dist/tooling/render-credits.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled credits launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--check --json", "compiled credits arguments changed");
    assert(
      resolvePackedCheckCommand(root, "tsx checks/validation/business/design/check-design-md.ts", []) === undefined,
      "an uncompiled checks/ gate must stay on the npm/tsx path",
    );
  });
}
