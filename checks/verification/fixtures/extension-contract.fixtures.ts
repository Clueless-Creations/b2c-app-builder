import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { stringify } from "yaml";
import { validateExtension, validateExtensionClosure, type Extension } from "../../../contracts/extensions/contract.js";
import {
  inspectPackage,
  snapshotPackage,
  verifySnapshot,
  resolveSnapshotResource,
  readSnapshotResource,
  type PackageSnapshot,
} from "../../../kernel/composition/resources.js";
import { assert, type Harness } from "./_harness.js";

function packageDefinition(namespace = "sample"): Extension {
  return {
    apiVersion: "b2c.extension/v1",
    id: `${namespace}/package`,
    version: "1.0.0",
    hostApiVersion: "b2c/v1",
    title: "Sample",
    dependencies: [],
    imports: [],
    resources: [
      { id: `${namespace}/schema`, path: "contracts/result.json", kind: "schema", mediaType: "application/json" },
      { id: `${namespace}/adapter`, path: "adapter.mjs", kind: "adapter", mediaType: "text/javascript" },
    ],
    capabilities: [
      {
        id: `${namespace}/capability`,
        version: "1.0.0",
        title: "Sample capability",
        knowledge: [],
        operations: [
          {
            id: `${namespace}/operation`,
            title: "Run",
            inputSchema: `${namespace}/schema`,
            outputSchema: `${namespace}/schema`,
            evidenceSchema: `${namespace}/schema`,
            effect: "draft",
            acceptance: ["Artifact exists"],
          },
        ],
      },
    ],
    implementations: [
      {
        id: `${namespace}/implementation`,
        version: "1.0.0",
        operation: `${namespace}/operation`,
        targets: [{ platform: "host", runtime: "node22" }],
        mode: "command",
        entrypoint: `${namespace}/adapter`,
        sdkRange: "^1.0.0",
        limitations: [],
        knowledge: [],
        connectionRequired: false,
        maturity: "implemented",
      },
    ],
    recipes: [
      {
        id: `${namespace}/recipe`,
        version: "1.0.0",
        title: "Build",
        workflows: ["workflow.sample"],
        operations: [{ operation: `${namespace}/operation`, implementation: `${namespace}/implementation`, required: true, workflowIds: ["workflow.sample"] }],
        policy: { maxRepairAttempts: 2, independentReview: true },
      },
    ],
  };
}
function refused(action: () => unknown, description: string): void {
  let rejected = false;
  try {
    action();
  } catch {
    rejected = true;
  }
  assert(rejected, description);
}
function author(root: string, definition: Extension): void {
  mkdirSync(path.join(root, "contracts"), { recursive: true });
  writeFileSync(path.join(root, "extension.yaml"), stringify(definition));
  writeFileSync(path.join(root, "contracts/result.json"), '{"type":"object"}\n');
  writeFileSync(path.join(root, "adapter.mjs"), 'throw new Error("inspection must never execute package code");\n');
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function digest(snapshot: Pick<PackageSnapshot, "files" | "dependencies">): string {
  return `sha256:${createHash("sha256")
    .update(canonical({ files: snapshot.files, dependencies: snapshot.dependencies }))
    .digest("hex")}`;
}
export function register(harness: Harness): void {
  harness.check("extensions: strict metadata rejects unknown fields, duplicate identities, versions, reserved and escaping resources", () => {
    const valid = packageDefinition();
    validateExtension(valid);
    refused(() => validateExtension({ ...valid, installHook: "run" }), "unknown fields accepted");
    refused(() => validateExtension({ ...valid, version: "latest" }), "floating version accepted");
    refused(
      () =>
        validateExtension({
          ...valid,
          dependencies: [
            { id: "other/package", version: "1.0.0" },
            { id: "other/package", version: "2.0.0" },
          ],
        }),
      "conflicting dependency versions accepted",
    );
    refused(() => validateExtension({ ...valid, resources: [...valid.resources, valid.resources[0]] }), "duplicate export accepted");
    for (const resourcePath of ["../escape", "/absolute", "a/../b", "a\\b", "snapshot.json", "extension.yaml"]) {
      refused(
        () => validateExtension({ ...valid, resources: [{ ...valid.resources[0], path: resourcePath }, valid.resources[1]] }),
        `unsafe path accepted: ${resourcePath}`,
      );
    }
  });
  harness.check("extensions: imported export kinds and implementation coverage are validated against the exact dependency", () => {
    const owner = packageDefinition("owner");
    const consumer = packageDefinition("consumer");
    consumer.dependencies = [{ id: owner.id, version: owner.version }];
    consumer.imports = [{ package: consumer.dependencies[0]!, exports: ["owner/adapter", "owner/implementation", "owner/operation"] }];
    consumer.capabilities[0]!.operations[0]!.inputSchema = "owner/adapter";
    validateExtension(consumer);
    refused(() => validateExtensionClosure(consumer, [owner]), "adapter accepted as imported schema");
    consumer.capabilities[0]!.operations[0]!.inputSchema = "consumer/schema";
    consumer.recipes[0]!.operations[0]!.implementation = "owner/implementation";
    refused(() => validateExtensionClosure(consumer, [owner]), "implementation accepted for a different operation");
    consumer.recipes[0]!.operations[0]!.operation = "owner/operation";
    validateExtensionClosure(consumer, [owner]);
  });
  harness.check("extensions: metadata inspection never executes code and every declared byte changes the snapshot pin", () => {
    const root = harness.makeTempDir("extension-source");
    author(root, packageDefinition());
    const before = inspectPackage(root);
    assert(Object.isFrozen(before) && Object.isFrozen(before.extension), "snapshot metadata must be immutable");
    writeFileSync(path.join(root, "adapter.mjs"), "export const changed = true;\n");
    const after = inspectPackage(root);
    assert(before.digest !== after.digest, "adapter content not hashed");
    writeFileSync(path.join(root, "contracts/result.json"), '{"type":"string"}');
    assert(inspectPackage(root).digest !== after.digest, "schema content not hashed");
  });
  harness.check("extensions: parent and file symlinks fail before a package snapshot is created", () => {
    const root = harness.makeTempDir("extension-links");
    const outside = harness.makeTempDir("extension-outside");
    author(root, packageDefinition());
    writeFileSync(path.join(outside, "secret.json"), "outside");
    symlinkSync(outside, path.join(root, "linked"));
    const definition = packageDefinition();
    definition.resources[0]!.path = "linked/secret.json";
    writeFileSync(path.join(root, "extension.yaml"), stringify(definition));
    refused(() => inspectPackage(root), "parent directory symlink accepted");
    symlinkSync(path.join(outside, "secret.json"), path.join(root, "file-link"));
    definition.resources[0]!.path = "file-link";
    writeFileSync(path.join(root, "extension.yaml"), stringify(definition));
    refused(() => inspectPackage(root), "file symlink accepted");
  });
  harness.check("extensions: a parent-directory swap between validation and opening is refused", () => {
    const root = harness.makeTempDir("extension-race-source");
    const outside = harness.makeTempDir("extension-race-outside");
    author(root, packageDefinition());
    writeFileSync(path.join(outside, "result.json"), "outside package bytes");
    const originalOpen = fs.openSync;
    let swapped = false;
    fs.openSync = (file, flags, mode) => {
      if (!swapped && String(file) === path.join(fs.realpathSync(root), "contracts/result.json")) {
        swapped = true;
        fs.renameSync(path.join(root, "contracts"), path.join(root, "contracts-saved"));
        symlinkSync(outside, path.join(root, "contracts"));
      }
      return originalOpen(file, flags, mode);
    };
    syncBuiltinESMExports();
    try {
      refused(() => inspectPackage(root), "directory race escaped the opened inode check");
      assert(swapped, "race test never intercepted the resource open");
    } finally {
      fs.openSync = originalOpen;
      syncBuiltinESMExports();
    }
  });

  harness.check("extensions: snapshot verification refuses omitted and changed resource bytes", () => {
    const root = harness.makeTempDir("extension-pinned-source");
    const store = harness.makeTempDir("extension-pinned-store");
    author(root, packageDefinition());
    const snapshot = snapshotPackage(root, store);
    const directory = path.join(store, snapshot.digest.slice(7));
    verifySnapshot(directory, snapshot);
    assert(resolveSnapshotResource(directory, snapshot, "sample/adapter") === path.join(directory, "adapter.mjs"), "resource resolution failed");
    const files = { ...snapshot.files };
    delete files["adapter.mjs"];
    const omitted = { ...snapshot, files, digest: digest({ files, dependencies: snapshot.dependencies }) };
    refused(() => verifySnapshot(directory, omitted), "unhashed adapter accepted");
    chmodSync(path.join(directory, "adapter.mjs"), 0o644);
    writeFileSync(path.join(directory, "adapter.mjs"), "tampered");
    refused(() => resolveSnapshotResource(directory, snapshot, "sample/adapter"), "changed pinned adapter resolved");
  });
  harness.check("extensions: dependency closure copies across stores and is reverified on resolution", () => {
    const dependencySource = harness.makeTempDir("extension-dependency-source");
    const dependencyStore = harness.makeTempDir("extension-dependency-store");
    author(dependencySource, packageDefinition("owner"));
    const dependency = snapshotPackage(dependencySource, dependencyStore);
    const dependencyDirectory = path.join(dependencyStore, dependency.digest.slice(7));
    const root = harness.makeTempDir("extension-dependent-source");
    const store = harness.makeTempDir("extension-dependent-store");
    const definition = packageDefinition("consumer");
    definition.dependencies = [{ id: "owner/package", version: "1.0.0" }];
    definition.imports = [{ package: { ...definition.dependencies[0]! }, exports: ["owner/schema"] }];
    author(root, definition);
    const snapshot = snapshotPackage(root, store, [{ directory: dependencyDirectory, snapshot: dependency }]);
    const directory = path.join(store, snapshot.digest.slice(7));
    verifySnapshot(directory, snapshot);
    assert(readSnapshotResource(directory, snapshot, "owner/schema").toString("utf8").includes("object"), "imported pinned resource did not resolve");
    const copied = path.join(store, dependency.digest.slice(7), "adapter.mjs");
    assert(readFileSync(copied, "utf8").includes("inspection must never"), "dependency closure was not copied");
    chmodSync(copied, 0o644);
    writeFileSync(copied, "changed dependency");
    refused(() => verifySnapshot(directory, snapshot), "modified dependency closure accepted");
  });
}
