import { spawnSync } from "node:child_process";
import { registerCommand } from "../../../kernel/session/inspect.js";
import { assert, type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("registration command quotes Windows spaces and apostrophes with double quotes", () => {
    const target = "C:\\Business Files\\Owner's App";
    assert(registerCommand(target, "win32") === `cmd.exe: b2c workspaces register <id> "${target}"`, "cmd.exe must receive double-quoted path");
    assert(registerCommand("C:\\", "win32") === 'cmd.exe: b2c workspaces register <id> "C:\\\\"', "trailing backslash must not escape closing quote");
  });
  harness.check("Windows expansion characters require literal argument passing", () => {
    for (const target of ["C:\\%TEMP%", "C:\\!APP!"]) {
      const command = registerCommand(target, "win32");
      assert(!command.includes(target), "shell-expandable path must not be interpolated");
      assert(command.includes("one literal process argument"), "recovery must explain literal argument handling");
    }
  });
  if (process.platform !== "win32") {
    harness.check("POSIX registration path round-trips without shell expansion", () => {
      const target = "/tmp/Owner's App $HOME `echo expanded`";
      const quoted = registerCommand(target, "linux").split("<id> ")[1]!;
      const result = spawnSync("/bin/sh", ["-c", `printf '%s' ${quoted}`], { encoding: "utf8" });
      assert(result.status === 0 && result.stdout === target, "POSIX shell must preserve exact path bytes");
    });
  }
}
