import { createRequire } from "node:module";
import { existsSync } from "node:fs";
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

/** Compiled twin of a package-relative `.ts` script, when `npm run build` (or prepack) has emitted it. */
export function resolveCompiledScript(packageRoot, scriptPath) {
  if (typeof scriptPath !== "string" || scriptPath.length === 0) return undefined;
  const absolute = path.isAbsolute(scriptPath) ? scriptPath : path.join(packageRoot, scriptPath);
  const relative = path.relative(packageRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  const posix = relative.split(path.sep).join("/");
  if (posix.startsWith("dist/") && posix.endsWith(".js") && existsSync(absolute)) return absolute;
  if (posix.endsWith(".ts")) {
    const compiled = path.join(packageRoot, "dist", `${posix.slice(0, -3)}.js`);
    if (existsSync(compiled)) return compiled;
  }
  return undefined;
}

/** Node argv after `process.execPath`: compiled JS when present, otherwise the tsx CLI plus the original args. */
export function resolveRuntimeNodeArgs(packageRoot, args) {
  const compiled = resolveCompiledScript(packageRoot, args[0]);
  if (compiled) return [compiled, ...args.slice(1)];
  return [resolveTsxCli(packageRoot), ...args];
}

/** Keep the selected Node runtime and stdio; distinguish launch failures from script exits. */
export function launchTypeScript(packageRoot, args, extraEnv = {}) {
  let nodeArgs;
  try {
    nodeArgs = resolveRuntimeNodeArgs(packageRoot, args);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  const result = spawnSync(process.execPath, nodeArgs, {
    stdio: "inherit",
    cwd: packageRoot,
    env: { ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter), ...extraEnv },
  });
  if (result.error) console.error(`b2c.runtime_launch_failed: ${result.error.message}`);
  else if (result.signal) console.error(`b2c.runtime_terminated: ${result.signal}`);
  return result.status ?? 1;
}
