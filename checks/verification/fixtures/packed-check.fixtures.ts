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
    assert(
      compiled.join(",") ===
        "check:agent-entrypoints,check:catalog,check:credits,check:gates-layout,check:graph-foundations,check:hosted-bundle,check:hub-spoke,check:learning-grounding,check:operating-graph,check:pack-composition,check:package-parity,check:public-api,check:validator-docs",
      `compiled-eligible check scripts drifted: ${compiled.join(",")}`,
    );
    assert(remaining.length > 0, "remaining-tsx inventory must still name the uncompiled checks graph");
    assert(
      remaining.every((entry) => entry.sourcePath === undefined || entry.sourcePath.startsWith("checks/")),
      "remaining-tsx entries must stay under the uncompiled checks/ graph",
    );
    assert(
      !remaining.some((entry) => entry.id === "check:agent-entrypoints"),
      "check:agent-entrypoints must leave remaining-tsx once its compiled twin is eligible",
    );
    assert(!remaining.some((entry) => entry.id === "check:catalog"), "check:catalog must leave remaining-tsx once its compiled twin is eligible");
    assert(!remaining.some((entry) => entry.id === "check:gates-layout"), "check:gates-layout must leave remaining-tsx once its compiled twin is eligible");
    assert(
      !remaining.some((entry) => entry.id === "check:graph-foundations"),
      "check:graph-foundations must leave remaining-tsx once its compiled twin is eligible",
    );
    assert(!remaining.some((entry) => entry.id === "check:hub-spoke"), "check:hub-spoke must leave remaining-tsx once its compiled twin is eligible");
    assert(
      !remaining.some((entry) => entry.id === "check:learning-grounding"),
      "check:learning-grounding must leave remaining-tsx once its compiled twin is eligible",
    );
    assert(
      !remaining.some((entry) => entry.id === "check:operating-graph"),
      "check:operating-graph must leave remaining-tsx once its compiled twin is eligible",
    );
    assert(
      !remaining.some((entry) => entry.id === "check:pack-composition"),
      "check:pack-composition must leave remaining-tsx once its compiled twin is eligible",
    );
    assert(!remaining.some((entry) => entry.id === "check:package-parity"), "check:package-parity must leave remaining-tsx once its compiled twin is eligible");
    assert(
      !remaining.some((entry) => entry.id === "check:validator-docs"),
      "check:validator-docs must leave remaining-tsx once its compiled twin is eligible",
    );
    assert(remaining.length === 118, `remaining-tsx count drifted: ${remaining.length}`);
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

  h.check("packed-check: check:hosted-bundle prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-hosted-bundle");
    mkdirSync(path.join(root, "tooling"), { recursive: true });
    mkdirSync(path.join(root, "dist", "tooling"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "tooling", "render-hosted-bundle.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(path.join(root, "tooling/render-hosted-bundle.ts"), 'console.error("source ts fallback should not run"); process.exit(9);');
    const command = resolvePackedCheckCommand(root, "tsx tooling/render-hosted-bundle.ts --check", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "tooling", "render-hosted-bundle.js"),
      "packed check:hosted-bundle must exec dist/tooling/render-hosted-bundle.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled hosted-bundle launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--check --json", "compiled hosted-bundle arguments changed");
    const source = readFileSync(path.join(skillRoot, "tooling/render-hosted-bundle.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "hosted bundle default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:public-api prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-public-api");
    mkdirSync(path.join(root, "tooling"), { recursive: true });
    mkdirSync(path.join(root, "dist", "tooling"), { recursive: true });
    writeFileSync(path.join(root, "dist", "tooling", "render-public-api.js"), "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));");
    writeFileSync(path.join(root, "tooling/render-public-api.ts"), 'console.error("source ts fallback should not run"); process.exit(9);');
    const command = resolvePackedCheckCommand(root, "tsx tooling/render-public-api.ts --check", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "tooling", "render-public-api.js"),
      "packed check:public-api must exec dist/tooling/render-public-api.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled public-api launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--check --json", "compiled public-api arguments changed");
    const source = readFileSync(path.join(skillRoot, "tooling/render-public-api.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "public API default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:catalog prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-catalog");
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    mkdirSync(path.join(root, "dist", "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "checks/validation/repository/check-catalog.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(path.join(root, "checks/validation/repository/check-catalog.ts"), 'console.error("source ts fallback should not run"); process.exit(9);');
    const command = resolvePackedCheckCommand(root, "tsx checks/validation/repository/check-catalog.ts", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "checks/validation/repository/check-catalog.js"),
      "packed check:catalog must exec dist/checks/validation/repository/check-catalog.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled catalog launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--json", "compiled catalog arguments changed");
    const source = readFileSync(path.join(skillRoot, "checks/validation/repository/check-catalog.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "catalog check default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:hub-spoke prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-hub-spoke");
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    mkdirSync(path.join(root, "dist", "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "checks/validation/repository/check-hub-spoke.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(path.join(root, "checks/validation/repository/check-hub-spoke.ts"), 'console.error("source ts fallback should not run"); process.exit(9);');
    const command = resolvePackedCheckCommand(root, "tsx checks/validation/repository/check-hub-spoke.ts", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "checks/validation/repository/check-hub-spoke.js"),
      "packed check:hub-spoke must exec dist/checks/validation/repository/check-hub-spoke.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled hub-spoke launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--json", "compiled hub-spoke arguments changed");
    const source = readFileSync(path.join(skillRoot, "checks/validation/repository/check-hub-spoke.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "hub-spoke check default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:gates-layout prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-gates-layout");
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    mkdirSync(path.join(root, "dist", "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "checks/validation/repository/check-gates-layout.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(
      path.join(root, "checks/validation/repository/check-gates-layout.ts"),
      'console.error("source ts fallback should not run"); process.exit(9);',
    );
    const command = resolvePackedCheckCommand(root, "tsx checks/validation/repository/check-gates-layout.ts --skill-root .", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "checks/validation/repository/check-gates-layout.js"),
      "packed check:gates-layout must exec dist/checks/validation/repository/check-gates-layout.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled gates-layout launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--skill-root . --json", "compiled gates-layout arguments changed");
    const source = readFileSync(path.join(skillRoot, "checks/validation/repository/check-gates-layout.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "gates-layout check default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:graph-foundations prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-graph-foundations");
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    mkdirSync(path.join(root, "dist", "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "checks/validation/repository/check-graph-foundations.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(
      path.join(root, "checks/validation/repository/check-graph-foundations.ts"),
      'console.error("source ts fallback should not run"); process.exit(9);',
    );
    const command = resolvePackedCheckCommand(root, "tsx checks/validation/repository/check-graph-foundations.ts --skill-root .", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "checks/validation/repository/check-graph-foundations.js"),
      "packed check:graph-foundations must exec dist/checks/validation/repository/check-graph-foundations.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled graph-foundations launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--skill-root . --json", "compiled graph-foundations arguments changed");
    const source = readFileSync(path.join(skillRoot, "checks/validation/repository/check-graph-foundations.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "graph-foundations check default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:learning-grounding prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-learning-grounding");
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    mkdirSync(path.join(root, "dist", "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "checks/validation/repository/check-learning-grounding.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(
      path.join(root, "checks/validation/repository/check-learning-grounding.ts"),
      'console.error("source ts fallback should not run"); process.exit(9);',
    );
    const command = resolvePackedCheckCommand(root, "tsx checks/validation/repository/check-learning-grounding.ts --skill-root .", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "checks/validation/repository/check-learning-grounding.js"),
      "packed check:learning-grounding must exec dist/checks/validation/repository/check-learning-grounding.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled learning-grounding launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--skill-root . --json", "compiled learning-grounding arguments changed");
    const source = readFileSync(path.join(skillRoot, "checks/validation/repository/check-learning-grounding.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "learning-grounding check default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:operating-graph prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-operating-graph");
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    mkdirSync(path.join(root, "dist", "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "checks/validation/repository/check-operating-graph.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(
      path.join(root, "checks/validation/repository/check-operating-graph.ts"),
      'console.error("source ts fallback should not run"); process.exit(9);',
    );
    const command = resolvePackedCheckCommand(root, "tsx checks/validation/repository/check-operating-graph.ts --skill-root .", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "checks/validation/repository/check-operating-graph.js"),
      "packed check:operating-graph must exec dist/checks/validation/repository/check-operating-graph.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled operating-graph launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--skill-root . --json", "compiled operating-graph arguments changed");
    const source = readFileSync(path.join(skillRoot, "checks/validation/repository/check-operating-graph.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "operating-graph check default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:pack-composition prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-pack-composition");
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    mkdirSync(path.join(root, "dist", "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "checks/validation/repository/check-pack-composition.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(
      path.join(root, "checks/validation/repository/check-pack-composition.ts"),
      'console.error("source ts fallback should not run"); process.exit(9);',
    );
    const command = resolvePackedCheckCommand(root, "tsx checks/validation/repository/check-pack-composition.ts --skill-root .", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "checks/validation/repository/check-pack-composition.js"),
      "packed check:pack-composition must exec dist/checks/validation/repository/check-pack-composition.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled pack-composition launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--skill-root . --json", "compiled pack-composition arguments changed");
    const source = readFileSync(path.join(skillRoot, "checks/validation/repository/check-pack-composition.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "pack-composition check default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:package-parity prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-package-parity");
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    mkdirSync(path.join(root, "dist", "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "checks/validation/repository/check-package-parity.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(
      path.join(root, "checks/validation/repository/check-package-parity.ts"),
      'console.error("source ts fallback should not run"); process.exit(9);',
    );
    const command = resolvePackedCheckCommand(root, "tsx checks/validation/repository/check-package-parity.ts --repo-root . --skill-root .", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "checks/validation/repository/check-package-parity.js"),
      "packed check:package-parity must exec dist/checks/validation/repository/check-package-parity.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled package-parity launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--repo-root . --skill-root . --json", "compiled package-parity arguments changed");
    const source = readFileSync(path.join(skillRoot, "checks/validation/repository/check-package-parity.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "package-parity check default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:agent-entrypoints prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-agent-entrypoints");
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    mkdirSync(path.join(root, "dist", "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "checks/validation/repository/check-agent-entrypoints.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(
      path.join(root, "checks/validation/repository/check-agent-entrypoints.ts"),
      'console.error("source ts fallback should not run"); process.exit(9);',
    );
    const command = resolvePackedCheckCommand(root, "tsx checks/validation/repository/check-agent-entrypoints.ts --repo-root .", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "checks/validation/repository/check-agent-entrypoints.js"),
      "packed check:agent-entrypoints must exec dist/checks/validation/repository/check-agent-entrypoints.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled agent-entrypoints launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--repo-root . --json", "compiled agent-entrypoints arguments changed");
    const source = readFileSync(path.join(skillRoot, "checks/validation/repository/check-agent-entrypoints.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "agent-entrypoints check default skill root must walk from compiled dist");
  });

  h.check("packed-check: check:validator-docs prefers compiled dist without tsx", () => {
    const root = h.makeTempDir("packed-check-validator-docs");
    mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
    mkdirSync(path.join(root, "dist", "checks/validation/repository"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "checks/validation/repository/check-validator-docs.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(
      path.join(root, "checks/validation/repository/check-validator-docs.ts"),
      'console.error("source ts fallback should not run"); process.exit(9);',
    );
    const command = resolvePackedCheckCommand(root, "tsx checks/validation/repository/check-validator-docs.ts --repo-root .", ["--json"]);
    assert(
      command?.executable === process.execPath && command.args[0] === path.join(root, "dist", "checks/validation/repository/check-validator-docs.js"),
      "packed check:validator-docs must exec dist/checks/validation/repository/check-validator-docs.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled validator-docs launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--repo-root . --json", "compiled validator-docs arguments changed");
    const source = readFileSync(path.join(skillRoot, "checks/validation/repository/check-validator-docs.ts"), "utf8");
    assert(source.includes("resolveSkillRoot(import.meta.url)"), "validator-docs check default skill root must walk from compiled dist");
  });
}
