import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registerWorkspace } from "../../../adapters/registry.js";
import { inspectWorkspace, EVIDENCE_EXCERPT_CAP, MARKER_BYTE_CAP } from "../../../kernel/session/inspect.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

/**
 * U1 fixtures: the pre-registration workspace inspector (KTD4). Every scenario below owns its own
 * isolated `B2C_APP_BUILDER_HOME` for the duration of one `harness.check` — `inspectWorkspace`
 * always consults the real registry resolution path, so a fixture that forgot to isolate it would
 * silently read whatever registry happens to live on the machine running the suite. Restoring the
 * previous value in `finally` keeps one check's isolation from leaking into the next.
 */

function withIsolatedHome<T>(home: string, fn: () => T): T {
  const previous = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = home;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = previous;
  }
}

export function register(harness: Harness): void {
  // --- 1. empty dir --------------------------------------------------------------------------

  harness.check("inspect: an empty, unregistered folder classifies as unregistered/unknown with no evidence, and never throws", () => {
    const dir = harness.makeTempDir("inspect-empty");
    const home = harness.makeTempDir("inspect-empty-home");
    withIsolatedHome(home, () => {
      const result = inspectWorkspace(dir);
      assert(result.ok, `expected ok:true for an empty existing folder, got ${JSON.stringify(result)}`);
      if (!result.ok) return;
      assert(result.registration.kind === "unregistered", `expected unregistered, got ${JSON.stringify(result.registration)}`);
      assert(result.productKind === "unknown", `expected productKind unknown for an empty folder, got ${result.productKind}`);
      assert(result.evidence.length === 0, `expected no evidence for an empty folder, got ${JSON.stringify(result.evidence)}`);
      assert(result.phase === "no-engagement", `expected no-engagement phase, got ${result.phase}`);
      assert(
        result.markers.every((marker) => marker.present === false),
        `expected every marker absent, got ${JSON.stringify(result.markers)}`,
      );
    });
  });

  // --- 2. symlinked marker --------------------------------------------------------------------

  harness.check("inspect: a symlinked PRODUCT.md pointing outside the folder is treated as absent — never read through the link", () => {
    const outside = harness.makeTempDir("inspect-symlink-outside");
    writeFileSync(path.join(outside, "secret.md"), "# Outside content that must never be read through a symlinked marker\n");
    const dir = harness.makeTempDir("inspect-symlink-target");
    symlinkSync(path.join(outside, "secret.md"), path.join(dir, "PRODUCT.md"));
    const home = harness.makeTempDir("inspect-symlink-home");
    withIsolatedHome(home, () => {
      const result = inspectWorkspace(dir);
      assert(result.ok, `expected ok:true, got ${JSON.stringify(result)}`);
      if (!result.ok) return;
      const productMdMarker = result.markers.find((marker) => marker.name === "PRODUCT.md");
      assert(productMdMarker?.present === false, `expected PRODUCT.md marker absent (symlinked), got ${JSON.stringify(productMdMarker)}`);
      assert(
        !result.evidence.some((signal) => signal.excerpt.includes("Outside content")),
        "a symlinked marker's target content must never surface as evidence",
      );
    });
  });

  // --- 3. unparseable and oversized package.json ----------------------------------------------

  harness.check("inspect: an unparseable package.json yields no productKind signal (absent for signal purposes) without throwing", () => {
    const dir = harness.makeTempDir("inspect-bad-json");
    writeFileSync(path.join(dir, "package.json"), "{ this is not valid json, apparel streetwear boutique");
    const home = harness.makeTempDir("inspect-bad-json-home");
    withIsolatedHome(home, () => {
      const result = inspectWorkspace(dir);
      assert(result.ok, `expected ok:true, got ${JSON.stringify(result)}`);
      if (!result.ok) return;
      assert(result.productKind === "unknown", `expected unknown for an unparseable package.json, got ${result.productKind}`);
      assert(
        !result.evidence.some((signal) => signal.source === "package.json"),
        `expected no package.json-derived evidence, got ${JSON.stringify(result.evidence)}`,
      );
    });
  });

  harness.check("inspect: a package.json larger than MARKER_BYTE_CAP is never read at all — absent for signal purposes, no throw", () => {
    const dir = harness.makeTempDir("inspect-huge-json");
    // Pad well past the cap with content that, if truncated and parsed, would still fail —
    // belt and suspenders: this fixture proves the module never reads past the cap in the first
    // place (the oversized branch short-circuits before any read call), not merely that a
    // truncated parse happens to fail.
    const padding = "x".repeat(MARKER_BYTE_CAP + 4096);
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "padded-app", description: `apparel streetwear ${padding}` }));
    const home = harness.makeTempDir("inspect-huge-json-home");
    withIsolatedHome(home, () => {
      const result = inspectWorkspace(dir);
      assert(result.ok, `expected ok:true, got ${JSON.stringify(result)}`);
      if (!result.ok) return;
      const marker = result.markers.find((entry) => entry.name === "package.json");
      assert(marker?.present === false, `expected package.json marker absent once past MARKER_BYTE_CAP, got ${JSON.stringify(marker)}`);
      assert(result.productKind === "unknown", `expected unknown, got ${result.productKind}`);
      assert(!result.evidence.some((signal) => signal.source === "package.json"), "an oversized package.json must never contribute evidence");
    });
  });

  // --- 4. EACCES on a marker -------------------------------------------------------------------

  harness.check("inspect: a marker file with no read permission (EACCES) is treated as absent, not a throw", () => {
    const dir = harness.makeTempDir("inspect-eacces");
    const target = path.join(dir, "README.md");
    writeFileSync(target, "# Unreadable on purpose\n");
    chmodSync(target, 0o000);
    const home = harness.makeTempDir("inspect-eacces-home");
    try {
      withIsolatedHome(home, () => {
        const result = inspectWorkspace(dir);
        assert(result.ok, `expected ok:true even with an unreadable marker, got ${JSON.stringify(result)}`);
        if (!result.ok) return;
        const marker = result.markers.find((entry) => entry.name === "README.md");
        assert(marker?.present === false, `expected README.md absent under EACCES, got ${JSON.stringify(marker)}`);
      });
    } finally {
      chmodSync(target, 0o644); // restore before the harness's own tempRoot cleanup
    }
  });

  // --- 5. subdirectory of a registered workspace ------------------------------------------------

  harness.check("inspect: a subdirectory of a registered workspace classifies as inside-registered with that workspace's id", () => {
    const home = harness.makeTempDir("inspect-inside-home");
    const workspace = harness.makeTempDir("inspect-inside-workspace");
    const subdir = path.join(workspace, "nested", "deeper");
    mkdirSync(subdir, { recursive: true });
    withIsolatedHome(home, () => {
      writeFileSync(path.join(workspace, "product.yaml"), readFileSync(path.join(skillRoot, "examples/workspace/business/product.yaml"), "utf8"));
      registerWorkspace("inspect-inside-fixture-ws", workspace);
      rmSync(path.join(workspace, "product.yaml"));
      const result = inspectWorkspace(subdir);
      assert(result.ok, `expected ok:true, got ${JSON.stringify(result)}`);
      if (!result.ok) return;
      assert(
        result.registration.kind === "inside-registered" && result.registration.id === "inspect-inside-fixture-ws",
        `expected inside-registered/inspect-inside-fixture-ws, got ${JSON.stringify(result.registration)}`,
      );
    });
  });

  // --- 6. registered path removed from disk -----------------------------------------------------

  harness.check("inspect: a registered workspace whose path was removed from disk classifies as registry-stale, never fresh-unregistered", () => {
    const home = harness.makeTempDir("inspect-stale-home");
    const workspace = harness.makeTempDir("inspect-stale-workspace");
    withIsolatedHome(home, () => {
      writeFileSync(path.join(workspace, "product.yaml"), readFileSync(path.join(skillRoot, "examples/workspace/business/product.yaml"), "utf8"));
      registerWorkspace("inspect-stale-fixture-ws", workspace);
      rmSync(path.join(workspace, "product.yaml"));
      rmSync(workspace, { recursive: true, force: true });
      const result = inspectWorkspace(workspace);
      assert(result.ok, `expected ok:true (a stale registered path is a successful classification, not an error), got ${JSON.stringify(result)}`);
      if (!result.ok) return;
      assert(
        result.registration.kind === "registry-stale" && result.registration.id === "inspect-stale-fixture-ws",
        `expected registry-stale/inspect-stale-fixture-ws, got ${JSON.stringify(result.registration)}`,
      );
    });
  });

  // --- 7. clothing-brand mismatch, and the KTD6 counter-case ------------------------------------

  harness.check("inspect: a clothing-brand folder with zero app signals classifies as mismatch, with bounded evidence excerpts", () => {
    const dir = harness.makeTempDir("inspect-clothing-mismatch");
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "drift-apparel-site",
        description: "Marketing site for an independent apparel and streetwear label",
        keywords: ["fashion", "boutique"],
      }),
    );
    writeFileSync(
      path.join(dir, "README.md"),
      `# Drift Apparel\n\nA denim and streetwear clothing collection drop, refreshed each season.\nSee the sizing chart before you order.\n${"\n".repeat(2)}` +
        Array.from({ length: 50 }, (_, index) => `Line ${index} of filler that must fall outside the first 40 lines and stays unread as a signal source.`).join(
          "\n",
        ),
    );
    const home = harness.makeTempDir("inspect-clothing-mismatch-home");
    withIsolatedHome(home, () => {
      const result = inspectWorkspace(dir);
      assert(result.ok, `expected ok:true, got ${JSON.stringify(result)}`);
      if (!result.ok) return;
      assert(
        result.productKind === "mismatch",
        `expected mismatch for a clothing brand with zero app signals, got ${result.productKind}: ${JSON.stringify(result.evidence)}`,
      );
      assert(!result.evidence.some((signal) => signal.kind === "consumer-app"), "expected zero consumer-app signals for the pure clothing-brand fixture");
      const independentForeignSources = new Set(
        result.evidence.filter((signal) => signal.kind === "foreign-product").map((signal) => `${signal.source}:${signal.field ?? ""}`),
      );
      assert(
        independentForeignSources.size >= 2,
        `expected at least two independent foreign-product signals, got ${JSON.stringify([...independentForeignSources])}`,
      );
      for (const signal of result.evidence) {
        assert(
          signal.excerpt.length <= EVIDENCE_EXCERPT_CAP + 1,
          `expected every evidence excerpt capped near ${EVIDENCE_EXCERPT_CAP} chars, got ${signal.excerpt.length}: "${signal.excerpt}"`,
        );
      }
    });
  });

  harness.check(
    "inspect: an apparel folder WITH a mobile-app-framework dependency classifies as consumer-app (KTD6 counter-case — vertical does not decide kind)",
    () => {
      const dir = harness.makeTempDir("inspect-clothing-consumer-app");
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({
          name: "drift-apparel-app",
          description: "Companion apparel and streetwear boutique app",
          keywords: ["fashion", "clothing"],
          dependencies: { "react-native": "^0.72.0", react: "^18.2.0" },
        }),
      );
      writeFileSync(path.join(dir, "README.md"), "# Drift Apparel App\n\nA clothing and streetwear companion app for the boutique.\n");
      const home = harness.makeTempDir("inspect-clothing-consumer-app-home");
      withIsolatedHome(home, () => {
        const result = inspectWorkspace(dir);
        assert(result.ok, `expected ok:true, got ${JSON.stringify(result)}`);
        if (!result.ok) return;
        assert(
          result.productKind === "consumer-app",
          `expected consumer-app once a mobile-app-framework dependency is present, regardless of apparel vocabulary, got ${result.productKind}: ${JSON.stringify(result.evidence)}`,
        );
      });
    },
  );

  // --- 8. half-scaffolded folder: phase reflects prior engagement -------------------------------

  harness.check("inspect: a half-scaffolded, unregistered folder (run/run-state.json present) reports an engaged phase, not no-engagement", () => {
    const dir = harness.makeTempDir("inspect-half-scaffolded");
    mkdirSync(path.join(dir, "run"), { recursive: true });
    writeFileSync(path.join(dir, "run", "run-state.json"), JSON.stringify({ runId: "run-fixture-1", updatedAt: "2026-08-05T00:00:00.000Z", nodes: {} }));
    const home = harness.makeTempDir("inspect-half-scaffolded-home");
    withIsolatedHome(home, () => {
      const result = inspectWorkspace(dir);
      assert(result.ok, `expected ok:true, got ${JSON.stringify(result)}`);
      if (!result.ok) return;
      assert(result.registration.kind === "unregistered", `expected unregistered (still pre-registration), got ${JSON.stringify(result.registration)}`);
      assert(result.phase !== "no-engagement", `expected a phase reflecting prior engagement, got ${result.phase}`);
      assert(result.phase === "engaged-with-run", `expected engaged-with-run for a valid run-state.json, got ${result.phase}`);
    });
  });

  // --- 9. cwd does not exist: typed error, distinct from empty-folder success -------------------

  harness.check(
    "inspect: a cwd that does not exist (and is not a stale registered path) returns a typed error, distinct from an empty folder's success",
    () => {
      const parent = harness.makeTempDir("inspect-missing-cwd-parent");
      const missing = path.join(parent, "does-not-exist");
      const home = harness.makeTempDir("inspect-missing-cwd-home");
      withIsolatedHome(home, () => {
        const result = inspectWorkspace(missing);
        assert(result.ok === false, `expected ok:false for a nonexistent cwd, got ${JSON.stringify(result)}`);
        if (result.ok) return;
        assert(result.code === "cwd_not_found", `expected code cwd_not_found, got ${JSON.stringify(result)}`);
        assert(result.message.length > 0, "expected a non-empty typed error message");
      });
    },
  );
}
