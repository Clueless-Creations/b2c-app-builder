import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";

/** Resolve from the package, including npm-hoisted dependencies, without consulting PATH. */
export function resolveTsxCli(packageRoot) {
  try {
    return createRequire(path.join(packageRoot, "package.json")).resolve("tsx/cli");
  } catch (cause) {
    throw new Error(
      "b2c.runtime_dependency_missing: Cannot resolve the installed tsx dependency. Reinstall b2c-app-builder (or run npm ci in a source checkout).",
      { cause },
    );
  }
}

/** Keep the selected Node runtime and stdio; distinguish launch failures from script exits. */
export function launchTypeScript(packageRoot, args, extraEnv = {}) {
  let cli;
  try {
    cli = resolveTsxCli(packageRoot);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: "inherit",
    cwd: packageRoot,
    env: { ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter), ...extraEnv },
  });
  if (result.error) console.error(`b2c.runtime_launch_failed: ${result.error.message}`);
  else if (result.signal) console.error(`b2c.runtime_terminated: ${result.signal}`);
  return result.status ?? 1;
}
