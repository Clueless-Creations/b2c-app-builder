import { boundedFileBytes } from "../../kernel/lib/bounded-file.js";
import { readFounderBriefFile, type FounderBriefRead } from "../../kernel/session/founder-brief.js";
import { readFileSync } from "node:fs";
import { resolveCallerPath } from "../../kernel/lib/cli.js";
import { z } from "zod";
import { compositionSchema, FOUNDER_BRIEF_MAX_BYTES, PUBLIC_OPERATIONS } from "../../contracts/public-api/contract.js";
import { compose, callPublicOperation, createBusinessOperation, failure } from "../../kernel/services/business.js";

const [command, ...argv] = process.argv.slice(2);
const operation = PUBLIC_OPERATIONS.find((item) => item.cli === command);
// CLI aliases name the same fields used by the request projection below.
const inputFieldForFlag: Readonly<Record<string, string>> = {
  workspace: "workspaceId",
  revision: "expectedRevision",
  request: "requestId",
  concurrency: "maxConcurrency",
  seconds: "wallClockSeconds",
  workflow: "workflowId",
  source: "sourcePath",
  dependencies: "dependencyDigests",
  packages: "packageDigests",
  preview: "previewDigest",
  experiment: "experimentId",
  "max-age": "maxAgeSeconds",
  "decision-id": "decisionId",
  "finding-ids": "findingIds",
  "runtime-observed": "runtimeObserved",
};
function usageFlag(flag: string): string {
  const schema = z.toJSONSchema(operation!.inputSchema, { io: "input" });
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const spelling = `--${flag} <value>`;
  return required.has(inputFieldForFlag[flag] ?? flag) ? spelling : `[${spelling}]`;
}
const usage = () =>
  [
    operation?.description,
    operation && !["business-status", "catalog", "compose"].includes(command ?? "")
      ? `Usage: b2c ${command} ${operation.flags
          .filter((flag) => flag !== "json")
          .map(usageFlag)
          .join(" ")} [--json]`
      : command === "business-status"
        ? "Usage: b2c business-status --workspace <registered-id> [--json]"
        : command === "catalog"
          ? "Usage: b2c catalog [--kind capability|provider|recipe] [--id namespace/name] [--json]"
          : "Usage: b2c compose --config <b2c.yaml|b2c.json> [--json] [--schema]",
    "JSON results use b2c/v1. Exit 0 means the request succeeded.",
  ].join("\n");
function founderBriefFileFailure(read: Extract<FounderBriefRead, { ok: false }>) {
  switch (read.code) {
    case "missing":
    case "unreadable":
      return failure(
        "INVALID_INPUT",
        "mandate-file is missing or unreadable. No state changed.",
        ["mandateFile"],
        "Pass a readable UTF-8 file to --mandate-file. No state changed.",
      );
    case "oversized":
      return failure(
        "INVALID_INPUT",
        `mandate-file is ${read.byteLength ?? FOUNDER_BRIEF_MAX_BYTES} bytes; file-backed intake supports ${FOUNDER_BRIEF_MAX_BYTES}. No state changed.`,
        ["mandateFile"],
        "Shorten the founder brief. Do not compress it by hand into --mandate.",
      );
    case "not_utf8":
      return failure(
        "INVALID_INPUT",
        "mandate-file is not valid UTF-8 text. No state changed.",
        ["mandateFile"],
        "Save the founder brief as UTF-8 text and retry --mandate-file.",
      );
    case "empty":
      return failure("INVALID_INPUT", "mandate-file is empty. No state changed.", ["mandateFile"], "Pass a non-empty founder brief to --mandate-file.");
    default: {
      const exhaustive: never = read.code;
      throw new Error(String(exhaustive));
    }
  }
}
function createBusinessFromFlags(flags: Map<string, string | true>) {
  if (flags.has("mandate") && flags.has("mandate-file"))
    return failure(
      "INVALID_INPUT",
      "mandate and mandate-file were both supplied. No state changed.",
      ["mandate", "mandateFile"],
      "Supply exactly one of --mandate or --mandate-file.",
    );
  const identity = {
    workspaceId: flags.get("workspace"),
    directory: typeof flags.get("directory") === "string" ? resolveCallerPath(flags.get("directory") as string) : undefined,
    name: flags.get("name"),
    hypothesis: flags.get("hypothesis"),
  };
  if (flags.has("mandate-file")) {
    const file = flags.get("mandate-file");
    if (typeof file !== "string") throw new Error("value");
    const loaded = readFounderBriefFile(resolveCallerPath(file));
    if (!loaded.ok) return founderBriefFileFailure(loaded);
    return createBusinessOperation({ ...identity, mandate: loaded.text }, { intake: "file" });
  }
  return createBusinessOperation({ ...identity, ...(flags.has("mandate") ? { mandate: flags.get("mandate") } : {}) });
}
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(usage());
  process.exit(0);
}
try {
  if (!operation) throw new Error("command");
  const flags = new Map<string, string | true>();
  const allowed: readonly string[] = operation.flags;
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!;
    const key = token.slice(2);
    if (!token.startsWith("--") || !allowed.includes(key) || flags.has(key)) throw new Error("flag");
    if (["json", "schema", "apply"].includes(key)) flags.set(key, true);
    else if (key === "runtime-observed") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) flags.set(key, true);
      else {
        index += 1;
        flags.set(key, value);
      }
    } else {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("value");
      flags.set(key, value);
    }
  }
  if (flags.has("apply")) {
    const result = compose({ mode: "apply" });
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  if (flags.has("schema")) {
    console.log(JSON.stringify(z.toJSONSchema(compositionSchema, { target: "draft-2020-12", io: "input" }), null, 2));
    process.exit(0);
  }
  let result;
  switch (operation.id) {
    case "business.research.lookup":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        query: JSON.parse(boundedFileBytes(resolveCallerPath(String(flags.get("query"))), 32000).toString("utf8")),
        maxAgeSeconds: Number(flags.get("max-age")),
      });
      break;
    case "business.research.record":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        expectedRevision: flags.get("revision"),
        observation: JSON.parse(boundedFileBytes(resolveCallerPath(String(flags.get("observation"))), 32000).toString("utf8")),
      });
      break;
    case "business.research.decision":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        expectedRevision: flags.get("revision"),
        decisionId: flags.get("decision-id"),
        verdict: flags.get("verdict"),
        rationale: flags.get("rationale"),
        findingIds: typeof flags.get("finding-ids") === "string" ? String(flags.get("finding-ids")).split(",").filter(Boolean) : [],
        apply: flags.has("apply"),
      });
      break;
    case "business.create":
      result = createBusinessFromFlags(flags);
      break;
    case "business.initialize":
      result = callPublicOperation(operation.id, { workspaceId: flags.get("workspace"), expectedRevision: flags.get("revision") });
      break;
    case "business.recover":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        expectedRevision: flags.get("revision"),
        requestId: flags.get("request"),
      });
      break;
    case "business.plan":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        ...(flags.has("concurrency") ? { maxConcurrency: Number(flags.get("concurrency")) } : {}),
      });
      break;
    case "business.evidence":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        ...(flags.has("workflow") ? { workflowId: flags.get("workflow") } : {}),
      });
      break;
    case "business.run":
      result = await callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        expectedRevision: flags.get("revision"),
        requestId: flags.get("request"),
        ...(flags.has("scope") ? { scope: String(flags.get("scope")).split(",") } : {}),
        ...(flags.has("seconds") ? { wallClockSeconds: Number(flags.get("seconds")) } : {}),
        ...(flags.has("concurrency") ? { maxConcurrency: Number(flags.get("concurrency")) } : {}),
        ...(flags.has("runtime-observed") ? { runtimeObserved: flags.get("runtime-observed") === true ? true : flags.get("runtime-observed") } : {}),
      });
      break;
    case "catalog.list":
      result = callPublicOperation(operation.id, Object.fromEntries([...flags].filter(([key]) => key !== "json")));
      break;
    case "composition.preview": {
      const file = flags.get("config");
      if (typeof file !== "string") throw new Error("config");
      const filename = resolveCallerPath(file);
      const { parseDocument } = await import("yaml");
      const text = readFileSync(filename, "utf8");
      if (Buffer.byteLength(text) > 64 * 1024) throw new Error("size");
      const document = parseDocument(text, { uniqueKeys: true });
      if (document.errors.length) throw new Error("parse");
      result = callPublicOperation(operation.id, { composition: document.toJS({ maxAliasCount: 0 }) });
      break;
    }
    case "packages.list":
      result = callPublicOperation(operation.id, { workspaceId: flags.get("workspace") });
      break;
    case "packages.import":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        sourcePath: typeof flags.get("source") === "string" ? resolveCallerPath(flags.get("source") as string) : undefined,
        dependencyDigests: typeof flags.get("dependencies") === "string" ? String(flags.get("dependencies")).split(",") : [],
      });
      break;
    case "composition.plan":
    case "composition.activate":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        packageDigests: typeof flags.get("packages") === "string" ? String(flags.get("packages")).split(",") : [],
        ...(operation.id === "composition.activate" ? { previewDigest: flags.get("preview") } : {}),
      });
      break;
    case "composition.recover":
      result = callPublicOperation(operation.id, { workspaceId: flags.get("workspace"), mode: flags.get("mode") });
      break;
    case "market.report":
      result = callPublicOperation(operation.id, { workspaceId: flags.get("workspace"), experimentId: flags.get("experiment") });
      break;
    case "business.status":
      result = callPublicOperation(operation.id, { workspaceId: flags.get("workspace") });
      break;
    default: {
      const exhaustive: never = operation;
      throw new Error(String(exhaustive));
    }
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} catch {
  console.log(JSON.stringify(failure("INVALID_INPUT", "Invalid command options or unreadable input. No state was changed.", [], usage()), null, 2));
  process.exitCode = 1;
}
