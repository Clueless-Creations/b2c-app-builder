import { writeProductFixture } from "./product-fixture.js";
import { composeCatalog } from "../../../catalog/index.js";
import { toCatalogInput } from "../../../catalog/bridge.js";
import { rmSync, cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import type { HostedKnowledgeBundle } from "../../../kernel/knowledge-service/types.js";

/**
 * The engine's MCP surface (entrypoints/mcp/server.ts): real client conversations over stdio — local
 * tools remain available after knowledge initialization fails, and normal startup proves the
 * handshake, tools/list, a real CLI call, and exit-code passthrough. Spawned as driver scripts (the shared
 * harness's `check` runs fn() synchronously; an in-harness async conversation would race
 * cleanup()). No network, no worker CLIs: the exercised tools are the dry-run bootstrap and a
 * refusal path.
 */
export function register(harness: Harness): void {
  for (const scenario of [
    { name: "missing", bundle: undefined },
    { name: "malformed", bundle: '{"private":"fixture-private-content",broken}' },
    { name: "service-invalid", bundle: '{"schemaVersion":"fixture-private-content"}' },
  ]) {
    harness.check(`mcp: ${scenario.name} knowledge bundle keeps all local tools available with one sanitized warning`, () => {
      const temp = harness.makeTempDir(`mcp-knowledge-${scenario.name}`);
      // Copy only the local server, so its derived skill root and bundle are isolated. Its
      // unchanged dependencies remain shared; the real generated bundle is never modified.
      cpSync(path.join(skillRoot, "entrypoints/mcp"), path.join(temp, "entrypoints/mcp"), { recursive: true });
      // The copied server.ts imports ../../kernel/engine/founder-decision-receipt.js at module load
      // time (DESIGN_TASTE_DELEGATION_APPROVAL_ID), unconditionally -- the same ERR_MODULE_NOT_FOUND
      // hazard as the session files below. Those layers are shared, unchanged, and never read the bundle.
      mkdirSync(path.join(temp, "kernel"), { recursive: true });
      for (const directory of ["engine", "knowledge-service", "lib", "services"]) {
        symlinkSync(path.join(skillRoot, "kernel", directory), path.join(temp, "kernel", directory), "junction");
      }
      mkdirSync(path.join(temp, "contracts"), { recursive: true });
      symlinkSync(path.join(skillRoot, "contracts", "public-api"), path.join(temp, "contracts", "public-api"), "junction");
      // ADR-0005: the copied server.ts imports ./contribute.js (the opt-in contributor surface) at
      // module load time, and that copied module imports ../../contracts/contribution and
      // ../../kernel/contribution -- the same ERR_MODULE_NOT_FOUND hazard as the layers above.
      // Registration itself stays off (no B2C_APP_BUILDER_MCP_CONTRIBUTOR), which this scenario's
      // exact tool list also proves.
      symlinkSync(path.join(skillRoot, "contracts", "contribution"), path.join(temp, "contracts", "contribution"), "junction");
      symlinkSync(path.join(skillRoot, "kernel", "contribution"), path.join(temp, "kernel", "contribution"), "junction");
      symlinkSync(path.join(skillRoot, "adapters"), path.join(temp, "adapters"), "junction");
      // The server uses the shared TypeScript launcher before registering any tools.
      // Share its library while leaving the isolated knowledge bundle unavailable.
      mkdirSync(path.join(temp, "tooling"), { recursive: true });
      symlinkSync(path.join(skillRoot, "tooling/lib"), path.join(temp, "tooling/lib"), "junction");
      mkdirSync(path.join(temp, "kernel/session"));
      symlinkSync(path.join(skillRoot, "kernel/session/status.ts"), path.join(temp, "kernel/session/status.ts"));
      symlinkSync(path.join(skillRoot, "kernel/session/inspect.ts"), path.join(temp, "kernel/session/inspect.ts"));
      symlinkSync(path.join(skillRoot, "kernel/session/founder-gate.ts"), path.join(temp, "kernel/session/founder-gate.ts"));
      // Doctor host summary is imported by the copied server at module load. Without this
      // symlink the isolated server dies before the unavailable-bundle warning can print.
      symlinkSync(path.join(skillRoot, "kernel/session/doctor-host.ts"), path.join(temp, "kernel/session/doctor-host.ts"));
      // U3: the copied server.ts now imports route-utterance.ts (b2c_plan's routing mode) at
      // module load time, unconditionally -- without this symlink the copied server fails to
      // start at all (ERR_MODULE_NOT_FOUND), well before any of this scenario's own assertions
      // run. route-utterance.ts's own imports (knowledge-service, ./inspect.js) are already
      // covered by the symlinks above.
      symlinkSync(path.join(skillRoot, "kernel/session/route-utterance.ts"), path.join(temp, "kernel/session/route-utterance.ts"));
      // U6: the copied server.ts now also imports stepper.ts (onboarding position on both
      // b2c_plan and b2c_status) at module load time, unconditionally -- same ERR_MODULE_NOT_FOUND
      // hazard as route-utterance.ts above. stepper.ts's own further imports (kernel/engine,
      // kernel/schema, ../../catalog/bridge.js, ...) need no symlinks of their own: Node resolves a
      // symlinked module to its real path, so its relative imports resolve against the real
      // skillRoot tree directly, never re-entering this temp copy.
      symlinkSync(path.join(skillRoot, "kernel/session/stepper.ts"), path.join(temp, "kernel/session/stepper.ts"));
      const nodeModules = existsSync(path.join(skillRoot, "node_modules"))
        ? path.join(skillRoot, "node_modules")
        : path.resolve(skillRoot, "../..", "node_modules");
      symlinkSync(nodeModules, path.join(temp, "node_modules"), "junction");
      writeFileSync(path.join(temp, "package.json"), JSON.stringify({ type: "module" }));
      mkdirSync(path.join(temp, "catalog/generated"), { recursive: true });
      if (scenario.bundle !== undefined) writeFileSync(path.join(temp, "catalog/generated/hosted-knowledge.json"), scenario.bundle);

      const workspace = path.join(temp, "business");
      const b2cAppBuilderHome = path.join(temp, "b2c-home");
      mkdirSync(workspace);
      mkdirSync(b2cAppBuilderHome);
      writeFileSync(
        path.join(b2cAppBuilderHome, "workspaces.json"),
        JSON.stringify({
          schemaVersion: "1.0.0",
          workspaces: [{ id: "fixture-business", path: workspace, registeredAt: "2026-08-27T00:00:00Z" }],
        }),
      );
      const driverPath = path.join(temp, "drive-unavailable-knowledge.mts");
      writeFileSync(
        driverPath,
        `
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: ${JSON.stringify(resolveTsxBin(skillRoot))},
  args: [${JSON.stringify(path.join(temp, "entrypoints/mcp/server.ts"))}],
  cwd: ${JSON.stringify(temp)},
  env: { ...process.env, B2C_APP_BUILDER_HOME: ${JSON.stringify(b2cAppBuilderHome)}, B2C_APP_BUILDER_MCP_WRITE: "1" },
  stderr: "pipe",
});
let stderr = "";
transport.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
const client = new Client({ name: "unavailable-knowledge-fixture", version: "0.0.0" });
try {
  await client.connect(transport);
  if (client.getServerVersion()?.name !== "b2c-app-builder") throw new Error("local server initialization failed");
  const receiptLine = (client.getInstructions() ?? "").split("Connection receipt: ")[1];
  if (!receiptLine) throw new Error("unavailable-knowledge handshake omitted connection receipt");
  const receipt = JSON.parse(receiptLine);
  if (receipt.mode !== "local_execution" || receipt.identity.recommended !== "b2c-local") throw new Error("unavailable-knowledge receipt identity");
  if (!receipt.identity.legacy?.includes("b2c-app-builder")) throw new Error("legacy local name missing from unavailable-knowledge receipt");
  if (receipt.observed?.knowledge !== "unavailable") throw new Error("unavailable-knowledge receipt must observe knowledge unavailable");
  if (receipt.observed?.writes !== "mcp_write_enabled") throw new Error("unavailable-knowledge receipt must observe write flag");
  const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
  const expected = ["b2c_research_lookup", "b2c_discover", "b2c_compose", "b2c_business_status", "b2c_packages", "b2c_composition_plan", "b2c_market_report", "b2c_business_plan", "b2c_business_evidence", "b2c_bootstrap", "b2c_plan", "b2c_run", "b2c_approvals", "b2c_verify", "b2c_schedule", "b2c_status", "b2c_operate"].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error("local tools changed: " + names.join(", "));
  const status = await client.callTool({ name: "b2c_status", arguments: { workspace: "fixture-business" } });
  if (status.isError || !status.content.some((entry) => entry.text?.includes("No durable run yet"))) throw new Error("local status must still work");
  const knowledge = await client.callTool({ name: "b2c_catalog", arguments: {} });
  if (!knowledge.isError) throw new Error("unavailable knowledge must not be callable");
} finally {
  await client.close();
}
if (stderr !== "b2c-app-builder-mcp: Knowledge tools are unavailable. The local knowledge bundle could not be loaded or validated. Workspace tools remain available.\\n") throw new Error("expected one static warning without bundle contents or paths");
console.log("mcp-unavailable-knowledge ok");
`,
      );
      const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 60_000 });
      assert(
        result.status === 0 && (result.stdout ?? "").includes("mcp-unavailable-knowledge ok"),
        `unavailable-knowledge driver failed (exit ${result.status}):\n${(result.stdout ?? "").slice(-400)}\n${(result.stderr ?? "").slice(-400)}`,
      );
    });
  }

  harness.check("mcp: initialize, tools/list, a real tool call, and exit-code passthrough over stdio", () => {
    const temp = harness.makeTempDir("mcp-conversation");
    const workspace = path.join(temp, "business");
    cpSync(path.join(skillRoot, "examples", "workspace", "business"), workspace, { recursive: true });
    writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(toCatalogInput(composeCatalog(skillRoot))));
    // A2: the server resolves workspaces ONLY through the registry. The fixture registers the
    // copy under its own B2C_APP_BUILDER_HOME and converses by id; raw paths must be refused.
    const b2cAppBuilderHome = path.join(temp, "b2c-home");
    const registered = spawnSync(resolveTsxBin(skillRoot), [path.join(skillRoot, "kernel/session/workspaces.ts"), "register", "fixture-business", workspace], {
      cwd: skillRoot,
      encoding: "utf8",
      env: { ...process.env, B2C_APP_BUILDER_HOME: b2cAppBuilderHome },
    });
    assert(registered.status === 0, `workspace registration failed: ${registered.stdout}\n${registered.stderr}`);
    const driverPath = path.join(temp, "drive-mcp.mts");
    const knowledgeService = createKnowledgeService(
      JSON.parse(readFileSync(path.join(skillRoot, "catalog/generated/hosted-knowledge.json"), "utf8")) as HostedKnowledgeBundle,
    );
    const expectedKnowledge = knowledgeService.search({ query: "privacy", limit: 2 });
    const driverSource = `
import { spawn } from "node:child_process";
import readline from "node:readline";

const server = spawn(${JSON.stringify(resolveTsxBin(skillRoot))}, [${JSON.stringify(path.join(skillRoot, "entrypoints/mcp/server.ts"))}], {
  cwd: ${JSON.stringify(skillRoot)},
  env: { ...process.env, B2C_APP_BUILDER_HOME: ${JSON.stringify(b2cAppBuilderHome)}, B2C_APP_BUILDER_MCP_WRITE: "1" },
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = readline.createInterface({ input: server.stdout });
const pending = new Map();
lines.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  } catch { /* non-JSON noise is not part of the protocol */ }
});
let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error("timeout waiting for " + method)), 120_000).unref?.();
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\\n");
  });
}
async function main() {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "fixture-driver", version: "0.0.0" },
  });
  if (init.result?.serverInfo?.name !== "b2c-app-builder") throw new Error("handshake: wrong server name: " + JSON.stringify(init.result?.serverInfo));
  const handshakeReceipt = JSON.parse(String(init.result?.instructions ?? "").split("Connection receipt: ")[1] ?? "null");
  if (handshakeReceipt?.mode !== "local_execution" || handshakeReceipt.identity?.recommended !== "b2c-local") throw new Error("handshake receipt identity");
  if (!handshakeReceipt.identity?.legacy?.includes("b2c-app-builder")) throw new Error("handshake omitted leftover local name");
  if (handshakeReceipt.observed?.knowledge !== "available") throw new Error("handshake must observe loaded knowledge");
  if (handshakeReceipt.observed?.writes !== "mcp_write_enabled") throw new Error("handshake must observe write-enabled MCP");
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\\n");

  const list = await request("tools/list", {});
  const names = (list.result?.tools ?? []).map((tool) => tool.name);
  for (const expected of ["b2c_bootstrap", "b2c_plan", "b2c_run", "b2c_approvals", "b2c_verify", "b2c_schedule", "b2c_status", "b2c_operate", "b2c_catalog", "b2c_workflow", "b2c_knowledge_search", "b2c_knowledge_get"]) {
    if (!names.includes(expected)) throw new Error("tools/list is missing " + expected + "; got " + names.join(", "));
  }

  const knowledge = await request("tools/call", { name: "b2c_knowledge_search", arguments: { query: "privacy", limit: 2 } });
  if (JSON.stringify(knowledge.result?.structuredContent) !== JSON.stringify(${JSON.stringify(expectedKnowledge)})) throw new Error("stdio knowledge result differs from the shared service");
  const invalidKnowledge = await request("tools/call", { name: "b2c_catalog", arguments: { path: "/tmp/private" } });
  if (!invalidKnowledge.error && !invalidKnowledge.result?.isError) throw new Error("knowledge tools must reject unknown path arguments");

  // U7 compact catalog (R14/R15/KTD10): the default page keeps the domains key present but
  // empty, adds an always-present domainCounts summary computed over every workflow (not just
  // the current page), and only returns full domain objects under include=domains, at any
  // offset. schemaVersion does not change for this shape change.
  const defaultCatalog = await request("tools/call", { name: "b2c_catalog", arguments: {} });
  const defaultCatalogResult = defaultCatalog.result?.structuredContent;
  if (!defaultCatalogResult || !Array.isArray(defaultCatalogResult.domains) || defaultCatalogResult.domains.length !== 0) {
    throw new Error("default catalog must keep domains present but empty, got: " + JSON.stringify(defaultCatalogResult && defaultCatalogResult.domains));
  }
  if (!Array.isArray(defaultCatalogResult.domainCounts) || defaultCatalogResult.domainCounts.length !== 15) {
    throw new Error("default catalog must always carry domainCounts for all 15 domains, got: " + (defaultCatalogResult.domainCounts && defaultCatalogResult.domainCounts.length));
  }
  const domainCountsTotal = defaultCatalogResult.domainCounts.reduce((sum, entry) => sum + entry.workflowCount, 0);
  if (domainCountsTotal !== defaultCatalogResult.counts.workflows) {
    throw new Error("domainCounts must sum to the total workflow count, got " + domainCountsTotal + " vs " + defaultCatalogResult.counts.workflows);
  }

  const includeDomains = await request("tools/call", { name: "b2c_catalog", arguments: { include: "domains", offset: 5 } });
  const includeDomainsResult = includeDomains.result?.structuredContent;
  if (!includeDomainsResult || includeDomainsResult.domains.length !== 15) {
    throw new Error("include=domains must return all 15 full domain objects at any offset, got: " + (includeDomainsResult && includeDomainsResult.domains.length));
  }
  if (typeof includeDomainsResult.domains[0]?.routeWhen !== "string" || typeof includeDomainsResult.domains[0]?.title !== "string") {
    throw new Error("include=domains must return full domain objects, not summaries");
  }

  const unknownInclude = await request("tools/call", { name: "b2c_catalog", arguments: { include: "everything" } });
  if (!unknownInclude.result?.isError) throw new Error("an unknown include value must be rejected");
  const unknownIncludeText = (unknownInclude.result?.content ?? []).map((entry) => entry.text).join("");
  if (unknownIncludeText.includes("everything")) throw new Error("the invalid include value must not be echoed back, got: " + unknownIncludeText.slice(0, 200));

  // Recorded against the shipped catalog (baseline commit 848ff0f, 2026-09-01): a schema-default
  // page (no query/domainId, limit=20) serialized at 11879 bytes carrying the full 15-domain
  // preamble, and 9549 bytes once that preamble was gated behind include=domains (the domain
  // array alone: 3077 -> 729 bytes; those figures are repeated in the b2c_catalog tool
  // description). The threshold below is recomputed from the live response instead of pinned to
  // those literals, so an unrelated catalog content edit later in this wave cannot make this
  // assertion flaky -- the invariant under test is the shape change, not today's exact byte count.
  const simulatedPreCompaction = Object.assign({}, defaultCatalogResult, { domains: includeDomainsResult.domains });
  delete simulatedPreCompaction.domainCounts;
  const defaultCatalogBytes = Buffer.byteLength(JSON.stringify(defaultCatalogResult), "utf8");
  const preCompactionBytes = Buffer.byteLength(JSON.stringify(simulatedPreCompaction), "utf8");
  if (defaultCatalogBytes >= preCompactionBytes * 0.9) {
    throw new Error("default catalog page did not shrink enough: " + defaultCatalogBytes + " bytes vs " + preCompactionBytes + " bytes pre-compaction");
  }

  const unregistered = await request("tools/call", { name: "b2c_plan", arguments: { workspace: "/tmp/not-registered-anywhere" } });
  if (!unregistered.result?.isError) throw new Error("an unregistered path must be refused: " + JSON.stringify(unregistered.result).slice(0, 200));
  const refusalText = (unregistered.result?.content ?? []).map((entry) => entry.text).join("");
  if (!refusalText.includes("not a registered workspace")) throw new Error("refusal must explain registration, got: " + refusalText.slice(0, 200));

  const noAuthority = await request("tools/call", { name: "b2c_approvals", arguments: { workspace: "fixture-business", approval: "workflow.x.approval.1", decision: "approved", session: "s-x" } });
  if (!noAuthority.result?.isError) throw new Error("deciding without asFounder must be refused");
  const authorityText = (noAuthority.result?.content ?? []).map((entry) => entry.text).join("");
  if (!authorityText.includes("founder-authority")) throw new Error("the asFounder refusal must name the rule, got: " + authorityText.slice(0, 200));

  const unsignedDesignTaste = await request("tools/call", {
    name: "b2c_approvals",
    arguments: {
      workspace: "fixture-business",
      designTaste: "pass",
      session: "s-unsigned-design",
      asFounder: true,
    },
  });
  if (!unsignedDesignTaste.result?.isError) throw new Error("asFounder without a signed receipt must not authorize design taste");
  const unsignedDesignText = (unsignedDesignTaste.result?.content ?? []).map((entry) => entry.text).join("");
  if (!unsignedDesignText.includes("approvals.signed_founder_receipt_required")) {
    throw new Error("the unsigned design refusal needs its typed reason code, got: " + unsignedDesignText.slice(0, 200));
  }

  const reservedDelegation = await request("tools/call", {
    name: "b2c_approvals",
    arguments: {
      workspace: "fixture-business",
      approval: "decision.design.taste.delegation",
      decision: "approved",
      session: "s-reserved",
      asFounder: true,
    },
  });
  if (!reservedDelegation.result?.isError) throw new Error("the generic MCP approval edge must reject the reserved design-taste delegation id");
  const reservedText = (reservedDelegation.result?.content ?? []).map((entry) => entry.text).join("");
  if (!reservedText.includes("approvals.reserved_design_taste_delegation")) {
    throw new Error("the reserved delegation refusal needs its typed reason code, got: " + reservedText.slice(0, 200));
  }

  const dryRun = await request("tools/call", { name: "b2c_bootstrap", arguments: { workspace: "fixture-business" } });
  const dryText = (dryRun.result?.content ?? []).map((entry) => entry.text).join("\\n");
  if (dryRun.result?.isError) throw new Error("dry-run bootstrap must not be an error: " + dryText.slice(-300));
  if (!dryText.includes("Dry run only")) throw new Error("dry-run bootstrap must return the real CLI's plan, got: " + dryText.slice(0, 300));

  const refused = await request("tools/call", { name: "b2c_approvals", arguments: { workspace: "fixture-business" } });
  if (!refused.result?.isError) throw new Error("a failing CLI must surface as isError: " + JSON.stringify(refused.result).slice(0, 300));
  const refusedText = (refused.result?.content ?? []).map((entry) => entry.text).join("\\n");
  if (!refusedText.includes("approve.no_run_state")) throw new Error("the underlying CLI's own error must reach the caller, got: " + refusedText.slice(0, 300));

  console.log("mcp-driver ok");
  server.kill();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); server.kill(); process.exit(1); });
`;
    writeFileSync(driverPath, driverSource, "utf8");
    const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 300_000 });
    assert(
      result.status === 0 && (result.stdout ?? "").includes("mcp-driver ok"),
      `mcp driver failed (exit ${result.status}):\n${(result.stdout ?? "").slice(-400)}\n${(result.stderr ?? "").slice(-400)}`,
    );
  });

  harness.check("mcp: b2c_plan grows a routing mode (utterance+cwd) while the workspace shape stays an untouched passthrough (U3)", () => {
    const temp = harness.makeTempDir("mcp-plan-route");
    const workspace = path.join(temp, "business");
    cpSync(path.join(skillRoot, "examples", "workspace", "business"), workspace, { recursive: true });
    rmSync(path.join(workspace, "state/business-state.json"));
    writeProductFixture(workspace, "MCP Fixture Business");

    // Bootstrap pins the current catalog so the read-only server can resolve a frontier.
    const bootstrapped = spawnSync(
      resolveTsxBin(skillRoot),
      [path.join(skillRoot, "kernel/session/bootstrap.ts"), "--workspace", workspace, "--apply", "--now", "2026-08-31T12:00:00.000Z"],
      { cwd: skillRoot, encoding: "utf8" },
    );
    assert(bootstrapped.status === 0, `bootstrap must exit 0 to seed the pinned catalog: ${bootstrapped.stdout}\n${bootstrapped.stderr}`);

    const b2cAppBuilderHome = path.join(temp, "b2c-home");
    const registered = spawnSync(resolveTsxBin(skillRoot), [path.join(skillRoot, "kernel/session/workspaces.ts"), "register", "fixture-business", workspace], {
      cwd: skillRoot,
      encoding: "utf8",
      env: { ...process.env, B2C_APP_BUILDER_HOME: b2cAppBuilderHome },
    });
    assert(registered.status === 0, `workspace registration failed: ${registered.stdout}\n${registered.stderr}`);

    // An unregistered, marker-bearing folder: never registered, read only through the shared
    // inspector routeUtterance already calls (R2/R20). App-store language gives it a clear
    // consumer-app productKind so it does not short-circuit before scoring.
    const markerDir = path.join(temp, "marker-app");
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(path.join(markerDir, "PRODUCT.md"), "# Marker App\n\nShips to the App Store and Google Play as a mobile app.\n");

    // The same clothing-brand evidence shape route-utterance.fixtures.ts's own scenario 7 pins,
    // so the productKind mismatch this scenario proves through MCP is the identical evidence the
    // module's own fixtures already prove it against directly.
    const clothingDir = path.join(temp, "clothing-mismatch");
    mkdirSync(clothingDir, { recursive: true });
    writeFileSync(
      path.join(clothingDir, "package.json"),
      JSON.stringify({
        name: "drift-apparel-site",
        description: "Marketing site for an independent apparel and streetwear label",
        keywords: ["fashion", "boutique"],
      }),
    );
    writeFileSync(
      path.join(clothingDir, "README.md"),
      "# Drift Apparel\n\nA denim and streetwear clothing collection drop, refreshed each season.\nSee the sizing chart before you order.\n",
    );

    // The R1 oracle for the {workspace} branch: the report the CLI planner prints for this exact
    // workspace, captured here and compared byte-for-byte to what the MCP passthrough returns.
    // This replaces an earlier pin of the literal plan-id hash and catalog version: both change on
    // every deliberate catalog edit or version bump (the plan id is a composition digest), so that
    // pin failed for reasons unrelated to the branch it guards. Equality with the CLI's own output
    // is the property R1 actually states — "byte-identical passthrough" — and it holds across
    // re-renders by construction.
    const cliPlan = spawnSync(resolveTsxBin(skillRoot), [path.join(skillRoot, "kernel/session/plan.ts"), "--workspace", workspace], {
      cwd: skillRoot,
      encoding: "utf8",
      env: { ...process.env, B2C_APP_BUILDER_HOME: b2cAppBuilderHome },
    });
    assert(cliPlan.status === 0, `the CLI planner must report for the fixture workspace: ${cliPlan.stdout}\n${cliPlan.stderr}`);
    const cliPlanText = (cliPlan.stdout ?? "").trimEnd();
    assert(cliPlanText.startsWith("Plan plan."), `unexpected CLI plan report head: ${cliPlanText.slice(0, 120)}`);

    const driverPath = path.join(temp, "drive-plan-route.mts");
    const driverSource = `
import { spawn } from "node:child_process";
import readline from "node:readline";

const server = spawn(${JSON.stringify(resolveTsxBin(skillRoot))}, [${JSON.stringify(path.join(skillRoot, "entrypoints/mcp/server.ts"))}], {
  cwd: ${JSON.stringify(skillRoot)},
  env: { ...process.env, B2C_APP_BUILDER_HOME: ${JSON.stringify(b2cAppBuilderHome)} },
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = readline.createInterface({ input: server.stdout });
const pending = new Map();
lines.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  } catch { /* non-JSON noise is not part of the protocol */ }
});
let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error("timeout waiting for " + method)), 120_000).unref?.();
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\\n");
  });
}
async function main() {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "plan-route-driver", version: "0.0.0" },
  });
  if (init.result?.serverInfo?.name !== "b2c-app-builder") throw new Error("handshake failed: " + JSON.stringify(init.result?.serverInfo));
  const readonlyReceipt = JSON.parse(String(init.result?.instructions ?? "").split("Connection receipt: ")[1] ?? "null");
  if (readonlyReceipt?.observed?.writes !== "mcp_readonly") throw new Error("read-only handshake must observe mcp_readonly, got " + readonlyReceipt?.observed?.writes);
  if (readonlyReceipt?.declares?.writes !== "cli_default") throw new Error("read-only handshake must still declare CLI writes");
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\\n");

  // A default (no B2C_APP_BUILDER_MCP_WRITE) server never registers a write tool at all (R2/R20)
  // -- b2c_plan's new routing mode changes nothing about that.
  const toolNames = (await request("tools/list", {})).result?.tools?.map((tool) => tool.name) ?? [];
  if (!toolNames.includes("b2c_plan")) throw new Error("b2c_plan must remain registered read-only: " + toolNames.join(", "));
  for (const writeTool of ["b2c_bootstrap", "b2c_run", "b2c_approvals", "b2c_verify", "b2c_schedule"]) {
    if (toolNames.includes(writeTool)) throw new Error("a read-only server must never register a write tool: " + toolNames.join(", "));
  }

  // --- 1. {workspace} regression guard (R1): b2c_plan's original request shape must return the
  // CLI planner's report for the same workspace byte-for-byte, with no structuredContent added.
  // The structural fragments below (captured from a fresh \`bootstrap --apply\`, no onboard, of
  // examples/workspace/business) pin the report's SHAPE; the plan-id hash and catalog version are
  // deliberately not pinned, because both move on every catalog edit. Update the fragments only
  // alongside a deliberate catalog or bootstrap change -- never to quietly paper over a real
  // regression in the workspace branch.
  const workspaceCall = await request("tools/call", { name: "b2c_plan", arguments: { workspace: "fixture-business" } });
  if (workspaceCall.result?.isError) throw new Error("the workspace call must not be an error: " + JSON.stringify(workspaceCall.result).slice(0, 400));
  if (workspaceCall.result?.structuredContent !== undefined) {
    throw new Error("the workspace branch must stay a plain passthrough with no structuredContent, got: " + JSON.stringify(workspaceCall.result.structuredContent).slice(0, 200));
  }
  const workspaceText = (workspaceCall.result?.content ?? []).map((entry) => entry.text).join("\\n");
  if (workspaceText.trimEnd() !== ${JSON.stringify(cliPlanText)}) {
    throw new Error("the workspace branch must be a byte-identical passthrough of the CLI planner's report for the same workspace (R1); MCP got:\\n" + workspaceText.slice(0, 400) + "\\nCLI: " + ${JSON.stringify(cliPlanText.slice(0, 400))});
  }
  const pinnedFragments = [
    "(catalog 2.0.0+",
    ": 100 steps, 0 done.",
    "This business has no work authority, so every business step below is parked.",
    "Ready now: 3 step(s), in 3 groups. Everything inside a group can run at the same time.",
    "Session continuity / resume  [run.orchestration.session-continuity-resume]",
    "Orient, scaffold & durable state upkeep  [run.orchestration.orient-scaffold-and-state-cockpit-upkeep]",
    "Compile the repository profile contract  [run.process.repository-profile-contract]",
    // 0.209.38: the full-launch program entry (founder approval) and closeout (scope answer) join
    // community-and-user-safety and generative-AI safety in the founder-decision bucket.
    "Parked on a founder decision (",
    "Parked because autonomy does not cover it (",
    // The implementation craft audit adds one dependent step to the design loop.
    "Waiting on earlier work (",
  ];
  for (const fragment of pinnedFragments) {
    if (!workspaceText.includes(fragment)) throw new Error("the workspace report drifted from its current initialized shape, missing: " + fragment + "\\ngot: " + workspaceText.slice(0, 500));
  }

  // --- 2. {utterance, cwd} on an unregistered, marker-bearing folder -> a routing outcome, never a write.
  const routed = await request("tools/call", { name: "b2c_plan", arguments: { utterance: "plan the app's onboarding flow", cwd: ${JSON.stringify(markerDir)} } });
  if (routed.result?.isError) throw new Error("a valid utterance+cwd call must not be an error: " + JSON.stringify(routed.result).slice(0, 400));
  const routedStructured = routed.result?.structuredContent;
  if (routedStructured?.kind !== "route") throw new Error('routing must carry structuredContent.kind === "route", got: ' + JSON.stringify(routedStructured).slice(0, 300));
  if (routedStructured.outcome?.kind !== "primary" && routedStructured.outcome?.kind !== "candidates") {
    throw new Error("an onboarding-shaped utterance against a plain marker folder must resolve to a primary or candidates, got: " + JSON.stringify(routedStructured.outcome).slice(0, 300));
  }
  if (!routedStructured.outcome.nextAgentAction) throw new Error("every routing outcome must carry a founder-facing nextAgentAction");

  // --- 3. both workspace and utterance -> a typed conflict error naming both fields.
  const conflict = await request("tools/call", { name: "b2c_plan", arguments: { workspace: "fixture-business", utterance: "plan the app's onboarding flow" } });
  if (!conflict.result?.isError) throw new Error("workspace + utterance together must be refused");
  const conflictText = (conflict.result?.content ?? []).map((entry) => entry.text).join("");
  if (!conflictText.includes("plan.request_conflict") || !conflictText.includes('"workspace"') || !conflictText.includes('"utterance"')) {
    throw new Error("the conflict refusal must name both request shapes, got: " + conflictText.slice(0, 300));
  }

  // --- 4. neither workspace nor utterance -> a typed error naming the two shapes.
  const required = await request("tools/call", { name: "b2c_plan", arguments: {} });
  if (!required.result?.isError) throw new Error("neither workspace nor utterance must be refused");
  const requiredText = (required.result?.content ?? []).map((entry) => entry.text).join("");
  if (!requiredText.includes("plan.request_required") || !requiredText.includes('"workspace"') || !requiredText.includes('"utterance"')) {
    throw new Error("the required-field refusal must name both request shapes, got: " + requiredText.slice(0, 300));
  }

  // --- 5. clothing-brand folder + utterance -> a productKind mismatch outcome, no primary, always a nextAgentAction.
  const mismatch = await request("tools/call", { name: "b2c_plan", arguments: { utterance: "plan the app's onboarding flow", cwd: ${JSON.stringify(clothingDir)} } });
  if (mismatch.result?.isError) throw new Error("a productKind mismatch is a routing outcome, not a tool error: " + JSON.stringify(mismatch.result).slice(0, 300));
  const mismatchOutcome = mismatch.result?.structuredContent?.outcome;
  if (mismatchOutcome?.kind !== "product_mismatch") throw new Error("a clothing-brand folder must short-circuit to product_mismatch, got: " + JSON.stringify(mismatchOutcome).slice(0, 300));
  if ("workflowId" in mismatchOutcome) throw new Error("product_mismatch must never carry a primary workflowId");
  if (!mismatchOutcome.nextAgentAction) throw new Error("product_mismatch must carry a founder-facing nextAgentAction");

  // --- 6. utterance without cwd -> a typed error (cwd is required alongside utterance over MCP,
  // unlike the CLI form, which leaves it optional the way routeUtterance itself does).
  const noCwd = await request("tools/call", { name: "b2c_plan", arguments: { utterance: "plan the app's onboarding flow" } });
  if (!noCwd.result?.isError) throw new Error("utterance without cwd must be refused over MCP");
  const noCwdText = (noCwd.result?.content ?? []).map((entry) => entry.text).join("");
  if (!noCwdText.includes("plan.cwd_required")) throw new Error("the missing-cwd refusal must name its reasonCode, got: " + noCwdText.slice(0, 300));

  console.log("mcp-plan-route ok");
  server.kill();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); server.kill(); process.exit(1); });
`;
    writeFileSync(driverPath, driverSource, "utf8");
    const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 300_000 });
    assert(
      result.status === 0 && (result.stdout ?? "").includes("mcp-plan-route ok"),
      `plan-route driver failed (exit ${result.status}):\n${(result.stdout ?? "").slice(-400)}\n${(result.stderr ?? "").slice(-400)}`,
    );
  });

  harness.check(
    'mcp: b2c_run grows a mode:"proof" (#36) that passes through to kernel/session/proof.ts with zero new tool names, while mode:"session" keeps requiring brief/session',
    () => {
      const temp = harness.makeTempDir("mcp-run-proof");
      const workspace = path.join(temp, "business");
      cpSync(path.join(skillRoot, "examples", "workspace", "business"), workspace, { recursive: true });
      rmSync(path.join(workspace, "state/business-state.json"));
      writeProductFixture(workspace, "MCP Fixture Business");
      const bootstrapped = spawnSync(
        resolveTsxBin(skillRoot),
        [path.join(skillRoot, "kernel/session/bootstrap.ts"), "--workspace", workspace, "--apply", "--now", "2026-09-01T12:00:00.000Z"],
        { cwd: skillRoot, encoding: "utf8" },
      );
      assert(bootstrapped.status === 0, `bootstrap must exit 0 to seed a valid business-state.json: ${bootstrapped.stdout}\n${bootstrapped.stderr}`);
      // The scripted device fixture explicitly selects iOS through the reducer; initialization grants no target by implication.
      const targetPatch = path.join(temp, "select-ios.json");
      writeFileSync(
        targetPatch,
        JSON.stringify({
          schemaVersion: "1.0.0",
          patchId: "mcp-fixture-select-ios",
          targetDoc: "business-state",
          reason: "Select the scripted iOS fixture target",
          authoredBy: "mcp-fixture",
          authoredAt: "2026-09-01T12:00:00.000Z",
          preconditions: [],
          ops: [{ op: "set", path: ["project", "platforms"], value: ["ios"] }],
          declaredOutputs: [["project", "platforms"]],
        }),
      );
      const selected = spawnSync(
        resolveTsxBin(skillRoot),
        [
          path.join(skillRoot, "kernel/reducer/cli.ts"),
          "commit",
          "--patch",
          targetPatch,
          "--file",
          path.join(workspace, "state/business-state.json"),
          "--manifest",
          path.join(workspace, "control/manifest.json"),
          "--audit",
          path.join(workspace, "control/audit.jsonl"),
          "--session",
          "mcp-fixture",
          "--founder-authority",
          "true",
        ],
        { cwd: skillRoot, encoding: "utf8" },
      );
      assert(selected.status === 0, `scripted target selection must pass the reducer: ${selected.stdout}\n${selected.stderr}`);

      const b2cAppBuilderHome = path.join(temp, "b2c-home");
      const registered = spawnSync(
        resolveTsxBin(skillRoot),
        [path.join(skillRoot, "kernel/session/workspaces.ts"), "register", "fixture-business", workspace],
        {
          cwd: skillRoot,
          encoding: "utf8",
          env: { ...process.env, B2C_APP_BUILDER_HOME: b2cAppBuilderHome },
        },
      );
      assert(registered.status === 0, `workspace registration failed: ${registered.stdout}\n${registered.stderr}`);

      const driverPath = path.join(temp, "drive-run-proof.mts");
      const driverSource = `
import { spawn } from "node:child_process";
import readline from "node:readline";

// B2C_DEVICE_PROOF_ADAPTER=fixture rides through runCli's inherited env (entrypoints/mcp/server.ts's
// runCli passes no explicit env, so the spawned proof.ts subprocess inherits THIS server
// process's own env) all the way down to the scripted fixture adapter — no real device or
// simulator is ever touched by this driver.
const server = spawn(${JSON.stringify(resolveTsxBin(skillRoot))}, [${JSON.stringify(path.join(skillRoot, "entrypoints/mcp/server.ts"))}], {
  cwd: ${JSON.stringify(skillRoot)},
  env: { ...process.env, B2C_APP_BUILDER_HOME: ${JSON.stringify(b2cAppBuilderHome)}, B2C_APP_BUILDER_MCP_WRITE: "1", B2C_DEVICE_PROOF_ADAPTER: "fixture" },
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = readline.createInterface({ input: server.stdout });
const pending = new Map();
lines.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  } catch { /* non-JSON noise is not part of the protocol */ }
});
let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error("timeout waiting for " + method)), 120_000).unref?.();
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\\n");
  });
}
async function main() {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "run-proof-driver", version: "0.0.0" },
  });
  if (init.result?.serverInfo?.name !== "b2c-app-builder") throw new Error("handshake failed: " + JSON.stringify(init.result?.serverInfo));
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\\n");

  const listedTools = (await request("tools/list", {})).result?.tools ?? [];
  const toolNames = listedTools.map((tool) => tool.name);
  const expectedNames = ["b2c_research_lookup", "b2c_discover", "b2c_compose", "b2c_business_status", "b2c_packages", "b2c_composition_plan", "b2c_market_report", "b2c_business_plan", "b2c_business_evidence", "b2c_bootstrap", "b2c_plan", "b2c_run", "b2c_approvals", "b2c_verify", "b2c_schedule", "b2c_status", "b2c_operate", "b2c_catalog", "b2c_workflow", "b2c_knowledge_search", "b2c_knowledge_get"];
  if (JSON.stringify([...toolNames].sort()) !== JSON.stringify([...expectedNames].sort())) {
    throw new Error("a proof mode on b2c_run must add zero new tool names, got: " + toolNames.join(", "));
  }
  const runTool = listedTools.find((tool) => tool.name === "b2c_run");
  const proofFields = runTool?.inputSchema?.properties ?? {};
  for (const field of ["platform", "device", "project", "scheme", "bundleId", "packageName", "appPath"]) {
    if (!(field in proofFields)) throw new Error("b2c_run proof schema is missing " + field);
  }
  if (
    !runTool?.description?.includes("proof/android-incomplete/") ||
    !runTool.description.includes("strict candidate/package/versionCode") ||
    !runTool.description.includes("top-level platform, target, and verificationScope") ||
    !runTool.description.includes("Each call proves one exact platform target")
  ) {
    throw new Error("b2c_run must describe its exact target, dynamic proof lanes, output identity, and Android's bounded strict-identity limit");
  }

  // --- mode: "proof" against the scripted fixture adapter -----------------------------------
  const proofCall = await request("tools/call", {
    name: "b2c_run",
    arguments: {
      workspace: "fixture-business",
      mode: "proof",
      platform: "ios",
      flow: "onboarding",
      device: "Fixture iPhone",
      project: "native/Fixture.xcodeproj",
      scheme: "Fixture",
      bundleId: "com.example.fixture",
    },
  });
  if (proofCall.result?.isError) throw new Error("a scripted all-passing proof call must not be an error: " + JSON.stringify(proofCall.result).slice(0, 400));
  const proofText = (proofCall.result?.content ?? []).map((entry) => entry.text).join("");
  const artifact = JSON.parse(proofText);
  if (artifact.rung !== "rung-2-xcodebuild") throw new Error("the bootstrapped reference workspace declares iOS, so mode:proof must select rung-2-xcodebuild, got: " + artifact.rung);
  if (artifact.verdict !== "passed" || artifact.failingStep !== undefined) throw new Error("an all-ok scripted flow must verdict passed with no failingStep, got: " + proofText.slice(0, 300));
  if (artifact.flow !== "onboarding") throw new Error("the artifact must record the requested flow, got: " + artifact.flow);
  if (artifact.platform !== "ios" || artifact.target !== "ios-simulator" || artifact.verificationScope !== "adapter-actions-only") {
    throw new Error("the proof artifact must expose its exact platform, target, and bounded verification scope, got: " + proofText.slice(0, 300));
  }
  if (!Array.isArray(artifact.steps) || artifact.steps.length === 0) throw new Error("the artifact must carry at least one step, got: " + proofText.slice(0, 300));

  const identifierConflict = await request("tools/call", {
    name: "b2c_run",
    arguments: {
      workspace: "fixture-business",
      mode: "proof",
      platform: "android",
      bundleId: "com.example.ios",
      packageName: "com.example.android",
    },
  });
  if (!identifierConflict.result?.isError) throw new Error("different bundleId/packageName values must be refused");
  const identifierConflictText = (identifierConflict.result?.content ?? []).map((entry) => entry.text).join("");
  if (!identifierConflictText.includes("run.proof_identifier_conflict")) {
    throw new Error("identifier conflict must carry its typed reason code, got: " + identifierConflictText.slice(0, 300));
  }

  const crossPlatformFields = await request("tools/call", {
    name: "b2c_run",
    arguments: {
      workspace: "fixture-business",
      mode: "proof",
      platform: "android",
      project: "native/Fixture.xcodeproj",
      packageName: "com.example.android",
    },
  });
  if (!crossPlatformFields.result?.isError) throw new Error("Android proof must refuse iOS-only target fields");
  const crossPlatformText = (crossPlatformFields.result?.content ?? []).map((entry) => entry.text).join("");
  if (!crossPlatformText.includes("run.proof_platform_fields")) {
    throw new Error("cross-platform proof fields must carry their typed reason code, got: " + crossPlatformText.slice(0, 300));
  }

  // --- mode: "session" (the default) still requires brief and session ------------------------
  const missingFields = await request("tools/call", { name: "b2c_run", arguments: { workspace: "fixture-business" } });
  if (!missingFields.result?.isError) throw new Error("mode session with no brief/session must be refused, not silently accepted");
  const missingFieldsText = (missingFields.result?.content ?? []).map((entry) => entry.text).join("");
  if (!missingFieldsText.includes("run.session_fields_required") || !missingFieldsText.includes('"brief"') || !missingFieldsText.includes('"session"')) {
    throw new Error("the missing-fields refusal must name its reasonCode and both required fields, got: " + missingFieldsText.slice(0, 300));
  }

  console.log("mcp-run-proof ok");
  server.kill();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); server.kill(); process.exit(1); });
`;
      writeFileSync(driverPath, driverSource, "utf8");
      const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 300_000 });
      assert(
        result.status === 0 && (result.stdout ?? "").includes("mcp-run-proof ok"),
        `run-proof driver failed (exit ${result.status}):\n${(result.stdout ?? "").slice(-400)}\n${(result.stderr ?? "").slice(-400)}`,
      );
    },
  );

  harness.check(
    "mcp: the local-only extended b2c_workflow tool merges workspaceState, gated on brief:true, agreeing with b2c_status for the same cwd (E1/#34)",
    () => {
      const temp = harness.makeTempDir("mcp-workflow-workspace");
      const workspace = path.join(temp, "business");
      cpSync(path.join(skillRoot, "examples", "workspace", "business"), workspace, { recursive: true });
      writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(toCatalogInput(composeCatalog(skillRoot))));
      const b2cAppBuilderHome = path.join(temp, "b2c-home");
      const registered = spawnSync(
        resolveTsxBin(skillRoot),
        [path.join(skillRoot, "kernel/session/workspaces.ts"), "register", "fixture-business", workspace],
        {
          cwd: skillRoot,
          encoding: "utf8",
          env: { ...process.env, B2C_APP_BUILDER_HOME: b2cAppBuilderHome },
        },
      );
      assert(registered.status === 0, `workspace registration failed: ${registered.stdout}\n${registered.stderr}`);

      // An unregistered, marker-bearing folder — never registered, so workspaceState must classify
      // it "unregistered" through the exact same shared inspector b2c_status's cwd mode uses.
      const markerDir = path.join(temp, "marker-app");
      mkdirSync(markerDir, { recursive: true });
      writeFileSync(path.join(markerDir, "PRODUCT.md"), "# Marker App\n\nShips to the App Store and Google Play as a mobile app.\n");

      const driverPath = path.join(temp, "drive-workflow-workspace.mts");
      const driverSource = `
import { spawn } from "node:child_process";
import readline from "node:readline";

const server = spawn(${JSON.stringify(resolveTsxBin(skillRoot))}, [${JSON.stringify(path.join(skillRoot, "entrypoints/mcp/server.ts"))}], {
  cwd: ${JSON.stringify(skillRoot)},
  env: { ...process.env, B2C_APP_BUILDER_HOME: ${JSON.stringify(b2cAppBuilderHome)} },
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = readline.createInterface({ input: server.stdout });
const pending = new Map();
lines.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  } catch { /* non-JSON noise is not part of the protocol */ }
});
let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error("timeout waiting for " + method)), 120_000).unref?.();
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\\n");
  });
}
async function main() {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "workflow-workspace-driver", version: "0.0.0" },
  });
  if (init.result?.serverInfo?.name !== "b2c-app-builder") throw new Error("handshake failed: " + JSON.stringify(init.result?.serverInfo));
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\\n");

  // tools/list must still show exactly one b2c_workflow — the local-only registration replaces
  // the shared one, never doubles it (zero net-new tool names).
  const toolNames = (await request("tools/list", {})).result?.tools?.map((tool) => tool.name) ?? [];
  if (toolNames.filter((name) => name === "b2c_workflow").length !== 1) throw new Error("expected exactly one b2c_workflow registration, got: " + toolNames.join(", "));

  const catalogResult = await request("tools/call", { name: "b2c_catalog", arguments: { limit: 1 } });
  const workflowId = catalogResult.result?.structuredContent?.workflows?.[0]?.id;
  if (!workflowId) throw new Error("could not discover a real workflowId from b2c_catalog: " + JSON.stringify(catalogResult.result).slice(0, 300));

  // --- 1. workspace without brief:true -> a typed refusal, before any workspace read.
  const noBrief = await request("tools/call", { name: "b2c_workflow", arguments: { workflowId, workspace: { cwd: ${JSON.stringify(markerDir)} } } });
  if (!noBrief.result?.isError) throw new Error("workspace without brief:true must be refused");
  const noBriefText = (noBrief.result?.content ?? []).map((entry) => entry.text).join("");
  if (!noBriefText.includes("workflow.workspace_requires_brief") || !noBriefText.includes('"workspace"') || !noBriefText.includes('"brief"')) {
    throw new Error("the refusal must name its reasonCode and both fields, got: " + noBriefText.slice(0, 300));
  }

  // --- 2. brief:true with no workspace -> dispatchBrief present, workspaceState:null, unchanged shared shape otherwise.
  const briefOnly = await request("tools/call", { name: "b2c_workflow", arguments: { workflowId, brief: true } });
  if (briefOnly.result?.isError) throw new Error("brief:true with no workspace must not be an error: " + JSON.stringify(briefOnly.result).slice(0, 300));
  const briefOnlyResult = briefOnly.result?.structuredContent;
  if (!briefOnlyResult?.dispatchBrief || briefOnlyResult.dispatchBrief.workflowId !== workflowId) throw new Error("dispatchBrief missing or wrong workflowId, got: " + JSON.stringify(briefOnlyResult?.dispatchBrief).slice(0, 300));
  if (briefOnlyResult.workspaceState !== null) throw new Error("workspaceState must be null when workspace is omitted, got: " + JSON.stringify(briefOnlyResult.workspaceState).slice(0, 200));
  if (briefOnlyResult.knowledgeBundle !== null) throw new Error("knowledgeBundle must stay null when include is omitted, even with brief:true");

  // --- 3. workspace + brief:true on the real registered workspace -> workspaceState agrees with b2c_status for the same cwd (R8).
  const statusForWorkspace = await request("tools/call", { name: "b2c_status", arguments: { cwd: ${JSON.stringify(workspace)} } });
  const withRegisteredWorkspace = await request("tools/call", { name: "b2c_workflow", arguments: { workflowId, brief: true, workspace: { cwd: ${JSON.stringify(workspace)} } } });
  if (withRegisteredWorkspace.result?.isError) throw new Error("a registered cwd must not be refused: " + JSON.stringify(withRegisteredWorkspace.result).slice(0, 300));
  const withRegisteredResult = withRegisteredWorkspace.result?.structuredContent;
  if (JSON.stringify(withRegisteredResult.workspaceState) !== JSON.stringify(statusForWorkspace.result?.structuredContent)) {
    throw new Error("workspaceState must equal b2c_status's own structuredContent for the same cwd, got:\\n" + JSON.stringify(withRegisteredResult.workspaceState).slice(0, 400) + "\\nvs:\\n" + JSON.stringify(statusForWorkspace.result?.structuredContent).slice(0, 400));
  }
  if (withRegisteredResult.workspaceState.kind !== "registered") throw new Error("expected kind:\\"registered\\", got: " + withRegisteredResult.workspaceState.kind);

  // --- 4. workspace on an unregistered, marker-bearing folder -> workspaceState degrades exactly like b2c_status does for the same cwd, no error.
  const unregisteredResponse = await request("tools/call", { name: "b2c_workflow", arguments: { workflowId, brief: true, workspace: { cwd: ${JSON.stringify(markerDir)} } } });
  if (unregisteredResponse.result?.isError) throw new Error("an unregistered folder is a degraded answer, not a tool error: " + JSON.stringify(unregisteredResponse.result).slice(0, 300));
  const unregisteredState = unregisteredResponse.result?.structuredContent?.workspaceState;
  if (unregisteredState?.kind !== "unregistered" || !unregisteredState.nextAgentAction) {
    throw new Error("expected an unregistered degraded workspaceState with nextAgentAction, got: " + JSON.stringify(unregisteredState).slice(0, 300));
  }

  console.log("mcp-workflow-workspace ok");
  server.kill();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); server.kill(); process.exit(1); });
`;
      writeFileSync(driverPath, driverSource, "utf8");
      const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 300_000 });
      assert(
        result.status === 0 && (result.stdout ?? "").includes("mcp-workflow-workspace ok"),
        `workflow-workspace driver failed (exit ${result.status}):\n${(result.stdout ?? "").slice(-400)}\n${(result.stderr ?? "").slice(-400)}`,
      );
    },
  );

  harness.check(
    "mcp: b2c_status's check field returns the identical verdict kernel/session/check.ts's CLI gives, for the same workspace and name (D1, #32)",
    () => {
      const temp = harness.makeTempDir("mcp-status-check");
      const workspace = path.join(temp, "business");
      cpSync(path.join(skillRoot, "examples", "workspace", "business"), workspace, { recursive: true });
      writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(toCatalogInput(composeCatalog(skillRoot))));
      // PRODUCT.md deliberately absent: a known, deterministic check:product-md failure (rule
      // PRODUCT_MD) that needs no other validator's fixture setup.
      rmSync(path.join(workspace, "PRODUCT.md"));

      const b2cAppBuilderHome = path.join(temp, "b2c-home");
      const registered = spawnSync(
        resolveTsxBin(skillRoot),
        [path.join(skillRoot, "kernel/session/workspaces.ts"), "register", "fixture-check-business", workspace],
        { cwd: skillRoot, encoding: "utf8", env: { ...process.env, B2C_APP_BUILDER_HOME: b2cAppBuilderHome } },
      );
      assert(registered.status === 0, `workspace registration failed: ${registered.stdout}\n${registered.stderr}`);

      // The R1-style oracle: kernel/session/check.ts's own --json verdict for this exact workspace
      // and name, captured directly (not through MCP) and compared field-for-field to what the MCP
      // facet returns below — the literal CLI/MCP parity proof D1 asks for.
      const cliCheck = spawnSync(
        resolveTsxBin(skillRoot),
        [path.join(skillRoot, "kernel/session/check.ts"), "product-md", "--workspace", workspace, "--json"],
        {
          cwd: skillRoot,
          encoding: "utf8",
        },
      );
      assert(cliCheck.status === 1, `the CLI check must fail against a workspace with no PRODUCT.md: ${cliCheck.stdout}\n${cliCheck.stderr}`);
      const cliParsed = JSON.parse((cliCheck.stdout ?? "").trim()) as { check: string; command: string; pass: boolean; failures: Array<{ rule: string }> };
      assert(
        cliParsed.pass === false && cliParsed.failures.some((failure) => failure.rule === "PRODUCT_MD"),
        `the CLI's own --json result did not carry the expected PRODUCT_MD failure: ${cliCheck.stdout}`,
      );

      // Hand-rolled JSON-RPC over stdio (no MCP SDK import): the driver file lives under the OS
      // temp root, which has no node_modules of its own, so an `@modelcontextprotocol/sdk` import
      // from here would fail to resolve — the same reason the sibling plan-route driver above
      // speaks the wire protocol directly instead of importing the Client.
      const driverPath = path.join(temp, "drive-status-check.mts");
      const driverSource = `
import { spawn } from "node:child_process";
import readline from "node:readline";

const server = spawn(${JSON.stringify(resolveTsxBin(skillRoot))}, [${JSON.stringify(path.join(skillRoot, "entrypoints/mcp/server.ts"))}], {
  cwd: ${JSON.stringify(skillRoot)},
  env: { ...process.env, B2C_APP_BUILDER_HOME: ${JSON.stringify(b2cAppBuilderHome)} },
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = readline.createInterface({ input: server.stdout });
const pending = new Map();
lines.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  } catch { /* non-JSON noise is not part of the protocol */ }
});
let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error("timeout waiting for " + method)), 60_000).unref?.();
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\\n");
  });
}
async function main() {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "status-check-driver", version: "0.0.0" },
  });
  if (init.result?.serverInfo?.name !== "b2c-app-builder") throw new Error("handshake failed: " + JSON.stringify(init.result?.serverInfo));
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\\n");

  // --- 1. {workspace, check} returns structuredContent.kind "check", matching the CLI's own
  // --json verdict for the identical workspace and name field-for-field. isError mirrors the
  // child gate's own exit code here, exactly like every other runCli-backed tool (server.ts's own
  // documented "Exit codes map to isError" rule) -- a failing check is real, actionable structured
  // content, not a broken tool call, so this scenario reads structuredContent, never isError, to
  // learn the gate's verdict.
  const checked = await request("tools/call", { name: "b2c_status", arguments: { workspace: "fixture-check-business", check: "product-md" } });
  const structured = checked.result?.structuredContent;
  if (structured?.kind !== "check") throw new Error('expected structuredContent.kind === "check", got: ' + JSON.stringify(structured).slice(0, 300));
  const expected = ${JSON.stringify(cliParsed)};
  if (structured.check !== expected.check || structured.command !== expected.command) {
    throw new Error("structuredContent must name the check and its command like the CLI does, got: " + JSON.stringify(structured).slice(0, 300));
  }
  if (structured.pass !== expected.pass || JSON.stringify(structured.failures) !== JSON.stringify(expected.failures)) {
    throw new Error(
      "the MCP verdict differs from the CLI's own --json verdict for the same workspace and name:\\nMCP: " +
        JSON.stringify(structured) +
        "\\nCLI: " +
        JSON.stringify(expected),
    );
  }

  // --- 2. check together with cwd is a typed conflict (reuses status.reference_conflict).
  const conflict = await request("tools/call", { name: "b2c_status", arguments: { cwd: "/tmp/wherever", check: "product-md" } });
  if (!conflict.result?.isError) throw new Error("check together with cwd must be refused");
  const conflictText = (conflict.result?.content ?? []).map((entry) => entry.text).join("");
  if (!conflictText.includes("status.reference_conflict")) throw new Error("the conflict refusal must name its reasonCode, got: " + conflictText.slice(0, 300));

  // --- 3. check without workspace is a typed error naming its own reasonCode.
  const noWorkspace = await request("tools/call", { name: "b2c_status", arguments: { check: "product-md" } });
  if (!noWorkspace.result?.isError) throw new Error("check without workspace must be refused");
  const noWorkspaceText = (noWorkspace.result?.content ?? []).map((entry) => entry.text).join("");
  if (!noWorkspaceText.includes("status.check_requires_workspace")) {
    throw new Error("the missing-workspace refusal must name its reasonCode, got: " + noWorkspaceText.slice(0, 300));
  }

  console.log("mcp-status-check ok");
  server.kill();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); server.kill(); process.exit(1); });
`;
      writeFileSync(driverPath, driverSource, "utf8");
      const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 120_000 });
      assert(
        result.status === 0 && (result.stdout ?? "").includes("mcp-status-check ok"),
        `status-check driver failed (exit ${result.status}):\n${(result.stdout ?? "").slice(-400)}\n${(result.stderr ?? "").slice(-400)}`,
      );
    },
  );
}
