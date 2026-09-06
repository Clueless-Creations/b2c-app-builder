import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateSourceAccess } from "../../../contracts/source-access.js";
import {
  snapshotSourceAccess,
  verifySourceAccess,
  snapshotTaskInputs,
  verifyTaskInputs,
  snapshotWorkspaceChanges,
  verifyWorkspaceChanges,
} from "../../../kernel/session/input-inventory.js";
import { fingerprintAppSource } from "../../../kernel/engine/source-fingerprint.js";
import { assert, type Harness } from "./_harness.js";

function refuses(action: () => unknown): boolean {
  try {
    action();
    return false;
  } catch {
    return true;
  }
}
export function register(harness: Harness): void {
  harness.check("source access refuses protected state, traversal and symlink destinations", () => {
    const root = mkdtempSync(path.join(tmpdir(), "b2c-source-"));
    try {
      for (const target of [
        "operations",
        "../escape",
        "run/result.json",
        "control/grants.json",
        ".git/config",
        "AGENTS.md",
        "b2c.yaml",
        "/etc/passwd",
        "app/../control",
        "app\\escape",
      ])
        assert(
          refuses(() => validateSourceAccess([{ path: target, access: "update" }])),
          `accepted ${target}`,
        );
      symlinkSync(tmpdir(), path.join(root, "outside"));
      assert(
        refuses(() => snapshotSourceAccess(root, [{ path: "outside/new-file", access: "create" }])),
        "followed symlink",
      );
      assert(
        refuses(() => snapshotSourceAccess(root, [{ path: "new-file", access: "create" }], root)),
        "allowed builder write",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  harness.check("source updates change declared source while accepted task input remains immutable", () => {
    const root = mkdtempSync(path.join(tmpdir(), "b2c-source-"));
    try {
      mkdirSync(path.join(root, "native"));
      writeFileSync(path.join(root, "native/App.swift"), "before");
      writeFileSync(path.join(root, "PRODUCT.md"), "accepted scope");
      const claims = [{ path: "native", access: "update" as const }];
      const source = snapshotSourceAccess(root, claims);
      const input = snapshotTaskInputs(root, ["native", "PRODUCT.md"]);
      writeFileSync(path.join(root, "native/App.swift"), "after");
      writeFileSync(path.join(root, "native/New.swift"), "new source");
      assert(verifyTaskInputs(root, input, [], claims).length === 0, "declared source update rejected");
      assert(verifySourceAccess(root, source).length === 0, "source access rejected");
      writeFileSync(path.join(root, "PRODUCT.md"), "silently changed scope");
      assert(
        verifyTaskInputs(root, input, [], claims).some((message) => message.includes("PRODUCT.md")),
        "accepted input change escaped",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  harness.check("source directory claims refuse nested symlinks before and after execution", () => {
    const root = harness.makeTempDir("source-tree-links");
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src/app.ts"), "app");
    const claims = [{ path: "src", access: "update" as const }];
    const before = snapshotSourceAccess(root, claims);
    symlinkSync(tmpdir(), path.join(root, "src/link"));
    assert(
      refuses(() => snapshotSourceAccess(root, claims)),
      "nested source link accepted before execution",
    );
    assert(verifySourceAccess(root, before).length > 0, "nested source link accepted after execution");
  });
  harness.check("explicit source scope detects undeclared persistent edits and allows only claimed writes and outputs", () => {
    const root = harness.makeTempDir("source-scope");
    mkdirSync(path.join(root, "src"));
    mkdirSync(path.join(root, "control"));
    writeFileSync(path.join(root, "src/app.ts"), "before");
    writeFileSync(path.join(root, "control/grants.json"), "protected");
    writeFileSync(path.join(root, "outside.txt"), "outside");
    const before = snapshotWorkspaceChanges(root);
    const claims = [{ path: "src", access: "update" as const }];
    writeFileSync(path.join(root, "src/app.ts"), "after");
    mkdirSync(path.join(root, "reports"));
    writeFileSync(path.join(root, "reports/accepted.md"), "report");
    assert(verifyWorkspaceChanges(root, before, claims, ["reports/accepted.md"]).length === 0, "declared scope failed");
    writeFileSync(path.join(root, "outside.txt"), "changed");
    writeFileSync(path.join(root, "control/grants.json"), "changed");
    const failures = verifyWorkspaceChanges(root, before, claims, ["reports/accepted.md"]);
    assert(
      failures.some((entry) => entry.includes("outside.txt")) && failures.some((entry) => entry.includes("control/grants.json")),
      "undeclared writes escaped inventory",
    );
  });
  harness.check("native and landing source changes invalidate the source fingerprint", () => {
    const root = mkdtempSync(path.join(tmpdir(), "b2c-source-"));
    try {
      mkdirSync(path.join(root, "native"));
      mkdirSync(path.join(root, "landing"));
      writeFileSync(path.join(root, "native/App.swift"), "one");
      const first = fingerprintAppSource(root);
      writeFileSync(path.join(root, "native/App.swift"), "two");
      const second = fingerprintAppSource(root);
      assert(first !== second, "native omitted");
      writeFileSync(path.join(root, "landing/index.html"), "landing");
      assert(second !== fingerprintAppSource(root), "landing omitted");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
