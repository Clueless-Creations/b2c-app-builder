import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { loadSnapshotPacks } from "../../../catalog/packs/snapshots.js";
import { validateExtension, type Extension } from "../../../contracts/extensions/contract.js";
import { mobileObservationSchema } from "../../../contracts/mobile-operation.js";
import { readSnapshotResource, resolveSnapshotResource, snapshotPackage, type PackageSnapshot } from "../../../kernel/composition/resources.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

/**
 * Proof 6: a screenshot compositor wrapped as a contribution package. The package composes,
 * exports, and validates; it never captures and never uploads. Every composed asset carries
 * provenance that links it to its source captures, and the mobile observation contract refuses
 * it as capture evidence. The tuck showcase captures are the approved fixture app; the suite
 * reads them and never modifies them.
 */
const PACKAGE_ID = "store-screenshot-compose/package";
const PACKAGE_DIR = path.join(skillRoot, "examples/extensions/store-screenshot-compose");
const SHOWCASE_DIR = path.join(skillRoot, "examples/tuck/showcase");
const NOW = "2026-09-05T00:00:00Z";
const COMPOSED_AT = new Date(NOW).toISOString();
const REFUSAL = "never uploads and never captures";
const OPERATION_EFFECTS: Record<string, string> = {
  "store-screenshot-compose/marketing-screenshots.compose-layout": "draft",
  "store-screenshot-compose/marketing-screenshots.export-localized": "draft",
  "store-screenshot-compose/marketing-screenshots.validate-deliverables": "observe",
};

interface ShowcaseEntry {
  file: string;
  sha256: string;
  width: number;
  height: number;
  surface: string;
  sourceFingerprint: string | null;
}
interface CaptureEntry {
  captureId: string;
  path: string;
  sha256: string;
  width: number;
  height: number;
  device: string;
  sourceFingerprint: string | null;
}
interface ComposedFrom {
  captureId: string;
  path: string;
  sha256: string;
  width: number;
  height: number;
  device: string;
  sourceFingerprint: string;
}
interface ProvenanceOutput {
  path: string;
  width: number;
  height: number;
  well: string;
  sha256: string;
  composedFrom: ComposedFrom[];
}
interface Provenance {
  kind: string;
  notCaptureEvidence: boolean;
  source: string;
  composedAt: string;
  template: { path: string; sha256: string };
  tool: { name: string; version: string };
  locale: string;
  outputs: ProvenanceOutput[];
  fonts: Array<{ family: string; license: string }>;
}
interface Failure {
  code: string;
  message: string;
  captureId?: string;
  path?: string;
  field?: string;
}
interface Report {
  ok?: boolean;
  refused?: boolean;
  code?: string;
  mode?: string;
  message?: string;
  failures?: Failure[];
  warnings?: string[];
  checked?: Array<{ dir: string; outputs: number; captures: number }>;
  locales?: Array<{ locale: string; dir: string; outputs: number }>;
}
interface Wells {
  partial: boolean;
  wells: Array<{ id: string; width: number; height: number }>;
}
interface Copy {
  locales: Record<string, { headlines: Record<string, string> }>;
}
interface Context {
  extension: Extension;
  snapshot: PackageSnapshot;
  snapshotDir: string;
  adapter: string;
  template: string;
  wellsPath: string;
  wells: Wells;
  copyPath: string;
  copy: Copy;
  capturesDir: string;
  manifestPath: string;
  captures: CaptureEntry[];
  composedDir: string;
  provenance: Provenance;
}

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const escapeXml = (text: string): string => text.replace(/[&<>"']/gu, (char) => XML_ESCAPES[char] ?? char);
const captureIdOf = (file: string): string => file.replace(/\.[a-z]+$/u, "");

function readShowcase(): ShowcaseEntry[] {
  const manifest = readJson<{ kind: string; screenshots: ShowcaseEntry[] }>(path.join(SHOWCASE_DIR, "manifest.json"));
  assert(manifest.kind === "example-screenshot-provenance", `unexpected showcase manifest kind ${manifest.kind}`);
  assert(manifest.screenshots.length >= 6, `showcase manifest lists ${manifest.screenshots.length} captures; expected the six tuck captures`);
  return manifest.screenshots;
}

function writeCaptureManifest(file: string, captures: CaptureEntry[]): void {
  writeFileSync(file, `${JSON.stringify({ kind: "capture-manifest", captures }, null, 2)}\n`, "utf8");
}

/** Run the pinned adapter through node directly. No shell, no PATH lookup, no network. */
function runAdapter(adapter: string, args: string[], cwd: string): { status: number | null; stdout: string; stderr: string; report: Report } {
  const result = spawnSync(process.execPath, [adapter, ...args], { cwd, encoding: "utf8", timeout: 60_000 });
  let report: Report = {};
  try {
    report = JSON.parse(result.stdout) as Report;
  } catch {
    report = {};
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

type ComposeInputs = Pick<Context, "manifestPath" | "template" | "wellsPath" | "copyPath">;

function composeArgs(context: ComposeInputs, locale: string, out: string): string[] {
  return [
    "compose",
    "--captures",
    context.manifestPath,
    "--template",
    context.template,
    "--wells",
    context.wellsPath,
    "--locale",
    locale,
    "--copy",
    context.copyPath,
    "--now",
    NOW,
    "--out",
    out,
  ];
}

function validateArgs(composed: string, wells: string): string[] {
  return ["validate", "--composed", composed, "--wells", wells];
}

function failureCodes(report: Report): string[] {
  return (report.failures ?? []).map((failure) => failure.code);
}

export function register(harness: Harness): void {
  const state: Partial<Context> = {};
  const need = <K extends keyof Context>(key: K): Context[K] => {
    const value = state[key];
    assert(value !== undefined, `${key} was not prepared; an earlier case failed`);
    return value as Context[K];
  };
  const inputs = (): ComposeInputs => ({
    manifestPath: need("manifestPath"),
    template: need("template"),
    wellsPath: need("wellsPath"),
    copyPath: need("copyPath"),
  });
  // Every report the adapter prints is checked against the schema the package declares for that
  // operation, so a drift between compose.mjs and extension.yaml fails here rather than at a host.
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  ajv.addFormat("date-time", { type: "string", validate: (value: string) => !Number.isNaN(Date.parse(value)) });
  const compiled = new Map<string, ReturnType<Ajv2020["compile"]>>();
  const assertSchema = (label: string, resourceId: string, document: unknown): void => {
    let validate = compiled.get(resourceId);
    if (!validate) {
      validate = ajv.compile(JSON.parse(readSnapshotResource(need("snapshotDir"), need("snapshot"), resourceId).toString("utf8")) as object);
      compiled.set(resourceId, validate);
    }
    assert(validate(document), `${label} does not satisfy ${resourceId}: ${JSON.stringify(validate.errors)}`);
  };

  harness.check("screenshot-compose: tuck showcase manifest hashes match the capture bytes", () => {
    const showcase = readShowcase();
    const capturesDir = harness.makeTempDir("screenshot-compose-captures");
    const captures: CaptureEntry[] = [];
    for (const entry of showcase) {
      const source = path.join(SHOWCASE_DIR, entry.file);
      assert(existsSync(source), `showcase capture ${entry.file} is missing`);
      const bytes = readFileSync(source);
      const actual = sha256(bytes);
      assert(actual === entry.sha256, `showcase manifest records ${entry.sha256} for ${entry.file} but the bytes hash to ${actual}`);
      copyFileSync(source, path.join(capturesDir, entry.file));
      captures.push({
        captureId: captureIdOf(entry.file),
        path: entry.file,
        sha256: entry.sha256,
        width: entry.width,
        height: entry.height,
        device: entry.surface,
        sourceFingerprint: entry.sourceFingerprint,
      });
    }
    assert(
      captures.every((capture) => capture.sourceFingerprint === null),
      "the tuck showcase README says no source fingerprint was retained; the manifest disagrees",
    );
    const manifestPath = path.join(capturesDir, "captures.json");
    writeCaptureManifest(manifestPath, captures);
    state.capturesDir = capturesDir;
    state.manifestPath = manifestPath;
    state.captures = captures;
  });

  harness.check("screenshot-compose: package validates, snapshots, and pins compose.mjs as the command entrypoint", () => {
    const extension = validateExtension(parseYaml(readFileSync(path.join(PACKAGE_DIR, "extension.yaml"), "utf8")));
    assert(extension.id === PACKAGE_ID, `unexpected package id ${extension.id}`);
    assert(extension.implementations.length === 3, `expected three implementations, found ${extension.implementations.length}`);
    for (const implementation of extension.implementations) {
      assert(implementation.mode === "command", `${implementation.id} is ${implementation.mode}, expected command`);
      assert(implementation.entrypoint === "store-screenshot-compose/compose-adapter", `${implementation.id} entrypoint is ${implementation.entrypoint}`);
      assert(
        implementation.limitations.some((limitation) => /never launches an app or captures pixels/u.test(limitation)),
        `${implementation.id} does not state the no-capture limitation`,
      );
      assert(
        implementation.limitations.some((limitation) => /No store upload/u.test(limitation)),
        `${implementation.id} does not state the no-upload limitation`,
      );
    }
    const operations = new Map(
      extension.capabilities.flatMap((capability) => capability.operations.map((operation) => [operation.id, operation.effect] as const)),
    );
    for (const [id, effect] of Object.entries(OPERATION_EFFECTS)) {
      assert(operations.get(id) === effect, `${id} declares effect ${operations.get(id)}, expected ${effect}`);
    }
    assert(operations.size === 3, `expected exactly three operations, found ${operations.size}`);
    const store = harness.makeTempDir("screenshot-compose-store");
    const snapshot = snapshotPackage(PACKAGE_DIR, store);
    const snapshotDir = path.join(store, snapshot.digest.slice(7));
    const adapter = resolveSnapshotResource(snapshotDir, snapshot, "store-screenshot-compose/compose-adapter");
    assert(adapter.endsWith("compose.mjs") && existsSync(adapter), `adapter entrypoint did not resolve to compose.mjs: ${adapter}`);
    assert(
      sha256(readFileSync(adapter)) === sha256(readFileSync(path.join(PACKAGE_DIR, "compose.mjs"))),
      "snapshotted adapter bytes differ from the authored adapter",
    );
    const packs = loadSnapshotPacks([{ directory: snapshotDir, snapshot }]);
    assert(packs.length === 1, `expected one catalog pack, found ${packs.length}`);
    const pack = packs[0]!;
    assert(pack.workflows.length === 3, `expected three workflows, found ${pack.workflows.length}`);
    const recipe = extension.recipes[0];
    assert(recipe !== undefined, "package declares no recipe");
    for (const binding of recipe.operations) {
      const workflowId = binding.workflowIds[0];
      const workflow = pack.workflows.find((entry) => entry.id === workflowId);
      assert(workflow !== undefined, `${binding.operation} binds ${workflowId}, which pack.yaml does not declare`);
      assert(
        workflow.actionClass === operations.get(binding.operation),
        `${workflow.id} has action class ${workflow.actionClass}; its operation declares effect ${operations.get(binding.operation)}`,
      );
    }
    const role = pack.roles?.[0];
    assert(role !== undefined && Object.keys(role.promptResources ?? {}).includes("compositor.md"), "role prompt is not pinned to compositor.md");
    state.extension = extension;
    state.snapshot = snapshot;
    state.snapshotDir = snapshotDir;
    state.adapter = adapter;
    state.template = resolveSnapshotResource(snapshotDir, snapshot, "store-screenshot-compose/device-well-template");
    state.wellsPath = resolveSnapshotResource(snapshotDir, snapshot, "store-screenshot-compose/wells");
    state.wells = readJson<Wells>(state.wellsPath);
    state.copyPath = resolveSnapshotResource(snapshotDir, snapshot, "store-screenshot-compose/copy-sample");
    state.copy = readJson<Copy>(state.copyPath);
    assert(state.wells.partial === true, "wells.json must stay marked partial: no exact store well size is citable from repository knowledge");
  });

  harness.check("screenshot-compose: the adapter uses Node built-ins only and never spawns, fetches, or reads the clock", () => {
    const source = readSnapshotResource(need("snapshotDir"), need("snapshot"), "store-screenshot-compose/compose-adapter").toString("utf8");
    const specifiers = [...source.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gmu)].map((match) => match[1] ?? "");
    assert(specifiers.length > 0, "adapter declares no imports; the static guard would be vacuous");
    const forbidden = new Set([
      "node:child_process",
      "node:net",
      "node:http",
      "node:https",
      "node:http2",
      "node:dns",
      "node:tls",
      "node:dgram",
      "node:worker_threads",
      "node:vm",
    ]);
    for (const specifier of specifiers) {
      assert(specifier.startsWith("node:"), `adapter imports a package that is not a Node built-in: ${specifier}`);
      assert(!forbidden.has(specifier), `adapter imports ${specifier}, which can spawn, connect, or execute code`);
    }
    for (const pattern of [/\brequire\(/u, /\bimport\(/u, /\bfetch\(/u, /Date\.now\(/u, /new Date\(\)/u, /child_process/u]) {
      assert(!pattern.test(source), `adapter source matches ${pattern}; it must stay static, offline, and clock-free`);
    }
  });

  harness.check("screenshot-compose: compose writes one SVG per capture with provenance that links each source capture", () => {
    const captures = need("captures");
    const composedDir = path.join(harness.tempRoot, "screenshot-compose-composed");
    const run = runAdapter(need("adapter"), composeArgs(inputs(), "en-US", composedDir), harness.tempRoot);
    assert(run.status === 0, `compose exited ${run.status}: ${run.stderr}\n${run.stdout}`);
    assert(run.report.ok === true && run.report.mode === "compose", `unexpected compose report: ${run.stdout}`);
    assertSchema("compose report", "store-screenshot-compose/compose-layout-output", run.report);
    assert(
      (run.report.warnings ?? []).some((warning) => /partial/u.test(warning)),
      "compose report does not repeat the partial wells warning",
    );
    const provenance = readJson<Provenance>(path.join(composedDir, "provenance.json"));
    assert(provenance.kind === "composed-marketing-asset", `provenance kind is ${provenance.kind}`);
    assert(provenance.notCaptureEvidence === true, "provenance does not declare notCaptureEvidence");
    assert(provenance.source === "composited", `provenance source is ${provenance.source}`);
    assert(provenance.composedAt === COMPOSED_AT, `composedAt ${provenance.composedAt} does not come from --now ${NOW}`);
    assert(provenance.locale === "en-US", `provenance locale is ${provenance.locale}`);
    assert(
      provenance.tool.name === "store-screenshot-compose" && provenance.tool.version === need("extension").version,
      "provenance tool does not match the package version",
    );
    assert(provenance.template.sha256 === sha256(readFileSync(need("template"))), "provenance template sha256 does not match the pinned template");
    assert(provenance.outputs.length === captures.length, `expected ${captures.length} outputs, found ${provenance.outputs.length}`);
    const wells = need("wells").wells;
    const headlines = need("copy").locales["en-US"]?.headlines ?? {};
    for (const output of provenance.outputs) {
      const file = path.join(composedDir, output.path);
      assert(existsSync(file), `output ${output.path} was not written`);
      const svg = readFileSync(file, "utf8");
      assert(sha256(svg) === output.sha256, `output ${output.path} bytes do not match the recorded sha256`);
      assert(
        wells.some((well) => well.id === output.well && well.width === output.width && well.height === output.height),
        `output ${output.path} is ${output.width}x${output.height} in well ${output.well}, which is not in wells.json`,
      );
      assert(
        new RegExp(`<svg\\b[^>]*\\swidth="${output.width}"[^>]*\\sheight="${output.height}"`, "u").test(svg),
        `SVG header of ${output.path} disagrees with the declared size`,
      );
      assert(output.composedFrom.length === 1, `output ${output.path} composes ${output.composedFrom.length} captures`);
      const source = output.composedFrom[0]!;
      const capture = captures.find((entry) => entry.captureId === source.captureId);
      assert(capture !== undefined, `output ${output.path} names unknown capture ${source.captureId}`);
      assert(source.sha256 === capture.sha256, `composedFrom sha256 for ${source.captureId} differs from the showcase hash`);
      assert(
        source.sourceFingerprint === "unknown",
        `composedFrom.sourceFingerprint for ${source.captureId} is ${source.sourceFingerprint}; the tuck captures have none, so it must stay unknown`,
      );
      assert(svg.includes(`href="${escapeXml(source.path)}"`), `SVG ${output.path} does not reference its source capture ${source.path}`);
      const linked = path.resolve(composedDir, source.path);
      assert(existsSync(linked) && sha256(readFileSync(linked)) === capture.sha256, `SVG ${output.path} links ${source.path}, which is missing or changed`);
      assert(svg.includes(escapeXml(headlines[source.captureId] ?? "")), `SVG ${output.path} lacks the en-US headline for ${source.captureId}`);
      assert(svg.includes('data-not-capture-evidence="true"'), `SVG ${output.path} does not mark itself as non-evidence`);
    }
    assertSchema("provenance.json", "store-screenshot-compose/provenance-evidence", provenance);
    const again = path.join(harness.tempRoot, "screenshot-compose-composed-again");
    const rerun = runAdapter(need("adapter"), composeArgs(inputs(), "en-US", again), harness.tempRoot);
    assert(rerun.status === 0, `second compose exited ${rerun.status}: ${rerun.stderr}`);
    for (const name of [...provenance.outputs.map((output) => output.path), "provenance.json"]) {
      assert(
        readFileSync(path.join(composedDir, name)).equals(readFileSync(path.join(again, name))),
        `${name} differs between two runs with the same inputs and --now`,
      );
    }
    state.composedDir = composedDir;
    state.provenance = provenance;
  });

  harness.check("screenshot-compose: validate passes on intact deliverables and repeats the partial wells warning", () => {
    const run = runAdapter(need("adapter"), validateArgs(need("composedDir"), need("wellsPath")), harness.tempRoot);
    assert(run.status === 0, `validate exited ${run.status}: ${run.stderr}\n${run.stdout}`);
    assert(run.report.ok === true && failureCodes(run.report).length === 0, `validate reported failures: ${run.stdout}`);
    assertSchema("validate report", "store-screenshot-compose/validate-deliverables-output", run.report);
    assert(
      run.report.checked?.length === 1 && run.report.checked[0]?.outputs === need("captures").length,
      `validate did not check every output: ${run.stdout}`,
    );
    assert(
      (run.report.warnings ?? []).some((warning) => /partial/u.test(warning)),
      "validate report does not repeat the partial wells warning",
    );
  });

  harness.check("screenshot-compose: validate fails closed on a corrupted capture and names the sha mismatch", () => {
    const capturesDir = path.join(harness.tempRoot, "screenshot-compose-captures-corrupt");
    cpSync(need("capturesDir"), capturesDir, { recursive: true });
    const manifestPath = path.join(capturesDir, "captures.json");
    const composedDir = path.join(harness.tempRoot, "screenshot-compose-composed-corrupt");
    const compose = runAdapter(need("adapter"), composeArgs({ ...inputs(), manifestPath }, "en-US", composedDir), harness.tempRoot);
    assert(compose.status === 0, `compose exited ${compose.status}: ${compose.stderr}`);
    const corrupted = path.join(capturesDir, "native-home.png");
    const declared = need("captures").find((capture) => capture.captureId === "native-home")?.sha256;
    assert(declared !== undefined, "native-home is not in the capture manifest");
    appendFileSync(corrupted, Buffer.from([0x00]));
    assert(sha256(readFileSync(corrupted)) !== declared, "appending a byte did not change the capture hash");
    const run = runAdapter(need("adapter"), validateArgs(composedDir, need("wellsPath")), harness.tempRoot);
    assert(run.status === 1, `validate exited ${run.status} on a corrupted capture; expected 1\n${run.stdout}`);
    assert(run.report.ok === false, "validate reported ok on a corrupted capture");
    const mismatch = (run.report.failures ?? []).find((failure) => failure.code === "capture-sha-mismatch");
    assert(mismatch !== undefined, `validate did not report capture-sha-mismatch: ${failureCodes(run.report).join(", ")}`);
    assert(mismatch.captureId === "native-home" && mismatch.message.includes(declared), "sha mismatch report does not name the capture and its declared hash");
    assertSchema("validate failure report", "store-screenshot-compose/validate-deliverables-output", run.report);
    const recompose = runAdapter(
      need("adapter"),
      composeArgs({ ...inputs(), manifestPath }, "en-US", path.join(harness.tempRoot, "screenshot-compose-never-written")),
      harness.tempRoot,
    );
    assert(recompose.status === 1 && recompose.report.code === "capture-sha-mismatch", `compose accepted a corrupted capture: ${recompose.stdout}`);
    assert(!existsSync(path.join(harness.tempRoot, "screenshot-compose-never-written")), "compose wrote output from a capture that failed its hash check");
  });

  harness.check("screenshot-compose: validate fails when provenance.json is missing or incomplete", () => {
    const missingDir = path.join(harness.tempRoot, "screenshot-compose-no-provenance");
    cpSync(need("composedDir"), missingDir, { recursive: true });
    rmSync(path.join(missingDir, "provenance.json"));
    const missing = runAdapter(need("adapter"), validateArgs(missingDir, need("wellsPath")), harness.tempRoot);
    assert(missing.status === 1 && missing.report.ok === false, `validate exited ${missing.status} without provenance; expected 1\n${missing.stdout}`);
    assert(
      failureCodes(missing.report).includes("provenance-missing"),
      `validate did not report provenance-missing: ${failureCodes(missing.report).join(", ")}`,
    );
    const incompleteDir = path.join(harness.tempRoot, "screenshot-compose-incomplete-provenance");
    cpSync(need("composedDir"), incompleteDir, { recursive: true });
    const stripped: Partial<Provenance> = { ...need("provenance") };
    delete stripped.notCaptureEvidence;
    writeFileSync(path.join(incompleteDir, "provenance.json"), JSON.stringify(stripped, null, 2), "utf8");
    const incomplete = runAdapter(need("adapter"), validateArgs(incompleteDir, need("wellsPath")), harness.tempRoot);
    assert(incomplete.status === 1, `validate exited ${incomplete.status} on incomplete provenance; expected 1`);
    assert(
      (incomplete.report.failures ?? []).some((failure) => failure.code === "provenance-field-missing" && failure.field === "notCaptureEvidence"),
      `validate did not name the missing notCaptureEvidence field: ${incomplete.stdout}`,
    );
  });

  harness.check("screenshot-compose: validate fails on a wrong dimension and on changed output bytes", () => {
    const dimsDir = path.join(harness.tempRoot, "screenshot-compose-wrong-dims");
    cpSync(need("composedDir"), dimsDir, { recursive: true });
    const edited = readJson<Provenance>(path.join(dimsDir, "provenance.json"));
    const first = edited.outputs[0];
    assert(first !== undefined, "provenance has no outputs");
    first.width += 1;
    writeFileSync(path.join(dimsDir, "provenance.json"), JSON.stringify(edited, null, 2), "utf8");
    const dims = runAdapter(need("adapter"), validateArgs(dimsDir, need("wellsPath")), harness.tempRoot);
    assert(dims.status === 1 && dims.report.ok === false, `validate exited ${dims.status} on a wrong dimension; expected 1\n${dims.stdout}`);
    const codes = failureCodes(dims.report);
    assert(codes.includes("well-mismatch") && codes.includes("output-dimension-mismatch"), `validate did not report the wrong dimension: ${codes.join(", ")}`);
    const bytesDir = path.join(harness.tempRoot, "screenshot-compose-changed-svg");
    cpSync(need("composedDir"), bytesDir, { recursive: true });
    const svgPath = path.join(bytesDir, first.path);
    writeFileSync(svgPath, readFileSync(svgPath, "utf8").replace(`width="${first.width - 1}"`, `width="${first.width}"`), "utf8");
    const bytes = runAdapter(need("adapter"), validateArgs(bytesDir, need("wellsPath")), harness.tempRoot);
    assert(bytes.status === 1, `validate exited ${bytes.status} on changed output bytes; expected 1`);
    const byteCodes = failureCodes(bytes.report);
    assert(
      byteCodes.includes("output-sha-mismatch") && byteCodes.includes("output-dimension-mismatch"),
      `validate did not report the changed SVG: ${byteCodes.join(", ")}`,
    );
  });

  harness.check("screenshot-compose: --upload and --capture are refused with exit 2 and nothing is written", () => {
    const refusedOut = path.join(harness.tempRoot, "screenshot-compose-refused-out");
    const attempts: string[][] = [
      [...composeArgs(inputs(), "en-US", refusedOut), "--upload"],
      ["upload", "--composed", need("composedDir")],
      ["capture", "--out", refusedOut],
      [...validateArgs(need("composedDir"), need("wellsPath")), "--capture=1"],
    ];
    for (const args of attempts) {
      const run = runAdapter(need("adapter"), args, harness.tempRoot);
      assert(run.status === 2, `${args.join(" ")} exited ${run.status}; expected 2`);
      assert(run.report.refused === true && run.report.ok === false, `${args.join(" ")} did not return a JSON refusal: ${run.stdout}`);
      assert(run.stderr.includes(REFUSAL) && (run.report.message ?? "").includes(REFUSAL), `${args.join(" ")} did not print the refusal text`);
    }
    assert(!existsSync(refusedOut), "a refused invocation wrote output");
  });

  harness.check("screenshot-compose: export duplicates the deliverables per locale from copy and each locale validates", () => {
    const composedDir = need("composedDir");
    const copy = need("copy");
    const run = runAdapter(need("adapter"), ["export", "--composed", composedDir, "--locales", "en-US,es-ES", "--copy", need("copyPath")], harness.tempRoot);
    assert(run.status === 0, `export exited ${run.status}: ${run.stderr}\n${run.stdout}`);
    assert(run.report.ok === true && run.report.locales?.map((entry) => entry.locale).join(",") === "en-US,es-ES", `unexpected export report: ${run.stdout}`);
    assertSchema("export report", "store-screenshot-compose/export-localized-output", run.report);
    for (const locale of ["en-US", "es-ES"]) {
      const dir = path.join(composedDir, "locales", locale);
      const provenance = readJson<Provenance>(path.join(dir, "provenance.json"));
      assert(provenance.locale === locale && provenance.composedAt === COMPOSED_AT, `${locale} provenance carries the wrong locale or time`);
      assert(provenance.notCaptureEvidence === true && provenance.source === "composited", `${locale} provenance dropped the non-evidence markers`);
      assert(provenance.outputs.length === need("captures").length, `${locale} has ${provenance.outputs.length} outputs`);
      for (const output of provenance.outputs) {
        const svg = readFileSync(path.join(dir, output.path), "utf8");
        const source = output.composedFrom[0]!;
        const headline = copy.locales[locale]?.headlines[source.captureId];
        assert(headline !== undefined && svg.includes(escapeXml(headline)), `${locale} SVG ${output.path} lacks its localized headline`);
        const linked = path.resolve(dir, source.path);
        assert(existsSync(linked) && sha256(readFileSync(linked)) === source.sha256, `${locale} SVG ${output.path} links a capture that is missing or changed`);
        assert(source.sourceFingerprint === "unknown", `${locale} export changed the source fingerprint of ${source.captureId}`);
      }
    }
    const english = readFileSync(path.join(composedDir, "locales/en-US/native-home.en-US.svg"), "utf8");
    const spanish = readFileSync(path.join(composedDir, "locales/es-ES/native-home.es-ES.svg"), "utf8");
    assert(english !== spanish && spanish.includes('lang="es-ES"'), "locale exports are not distinct");
    const validated = runAdapter(need("adapter"), validateArgs(composedDir, need("wellsPath")), harness.tempRoot);
    assert(validated.status === 0 && validated.report.checked?.length === 3, `validate did not pass the base and both locale directories: ${validated.stdout}`);
    const direct = runAdapter(need("adapter"), validateArgs(path.join(composedDir, "locales/es-ES"), need("wellsPath")), harness.tempRoot);
    assert(direct.status === 0 && direct.report.ok === true, `validate failed on the es-ES directory alone: ${direct.stdout}`);
    const unsupported = runAdapter(need("adapter"), ["export", "--composed", composedDir, "--locales", "fr-FR", "--copy", need("copyPath")], harness.tempRoot);
    assert(
      unsupported.status === 1 && unsupported.report.code === "copy-missing",
      `export without fr-FR copy exited ${unsupported.status}: ${unsupported.stdout}`,
    );
    assert(!existsSync(path.join(composedDir, "locales/fr-FR")), "export wrote a locale that has no copy");
  });

  harness.check("screenshot-compose: compose refuses captures whose bytes or declared dimensions disagree with the manifest", () => {
    const captures = need("captures");
    const badShaDir = path.join(harness.tempRoot, "screenshot-compose-bad-sha");
    mkdirSync(badShaDir, { recursive: true });
    const badSha = captures.map((capture, index) => (index === 0 ? { ...capture, sha256: "0".repeat(64) } : capture));
    const badShaManifest = path.join(badShaDir, "captures.json");
    writeCaptureManifest(
      badShaManifest,
      badSha.map((capture) => ({ ...capture, path: path.relative(badShaDir, path.join(need("capturesDir"), capture.path)) })),
    );
    const sha = runAdapter(need("adapter"), composeArgs({ ...inputs(), manifestPath: badShaManifest }, "en-US", path.join(badShaDir, "out")), harness.tempRoot);
    assert(sha.status === 1 && sha.report.code === "capture-sha-mismatch", `compose accepted a manifest with a wrong hash: ${sha.stdout}`);
    assert(!existsSync(path.join(badShaDir, "out")), "compose wrote output after a hash mismatch");
    const badDimsDir = path.join(harness.tempRoot, "screenshot-compose-bad-dims");
    mkdirSync(badDimsDir, { recursive: true });
    const badDims = captures.map((capture, index) => (index === 0 ? { ...capture, width: capture.width + 1 } : capture));
    const badDimsManifest = path.join(badDimsDir, "captures.json");
    writeCaptureManifest(
      badDimsManifest,
      badDims.map((capture) => ({ ...capture, path: path.relative(badDimsDir, path.join(need("capturesDir"), capture.path)) })),
    );
    const dims = runAdapter(
      need("adapter"),
      composeArgs({ ...inputs(), manifestPath: badDimsManifest }, "en-US", path.join(badDimsDir, "out")),
      harness.tempRoot,
    );
    assert(
      dims.status === 1 && dims.report.code === "capture-dimension-mismatch",
      `compose accepted a manifest whose dimensions disagree with the pixels: ${dims.stdout}`,
    );
    assert(!existsSync(path.join(badDimsDir, "out")), "compose wrote output after a dimension mismatch");
  });

  harness.check("screenshot-compose: a composed output cannot pass as capture evidence while a genuine capture record can", () => {
    const provenance = need("provenance");
    const composed = provenance.outputs.find((output) => output.composedFrom[0]?.captureId === "native-home");
    assert(composed !== undefined, "no composed output for native-home");
    const capture = need("captures").find((entry) => entry.captureId === "native-home");
    assert(capture !== undefined, "native-home is not in the capture manifest");
    const target = {
      platform: "ios",
      deviceKind: "simulator",
      deviceId: "fixture-simulator",
      osVersion: "26.0",
      locale: "en-US",
      appId: "tuck.fixture",
      buildId: "fixture-build",
      artifactSha256: sha256("fixture-artifact"),
    };
    const base = {
      providerId: "b2c/host-native-mobile",
      operation: "b2c/mobile-app-operation.capture-screenshot",
      target,
      executionId: "fixture-execution",
      observedAt: COMPOSED_AT,
      source: "fixture",
      completion: "completed",
      observations: ["fixture capture of the native home state"],
      actionsCompleted: 0,
    };
    const fromComposed = mobileObservationSchema.safeParse({
      ...base,
      capture: {
        artifactId: composed.path,
        sha256: composed.sha256,
        mimeType: "image/png",
        width: composed.width,
        height: composed.height,
        stateId: "native-home",
        source: provenance.source,
      },
    });
    assert(!fromComposed.success, "a composed output was accepted as a mobile capture observation");
    assert(
      fromComposed.error.issues.some((issue) => issue.path.join(".") === "capture.source"),
      `the rejection did not point at capture.source: ${JSON.stringify(fromComposed.error.issues.map((issue) => issue.path.join(".")))}`,
    );
    const svgMime = mobileObservationSchema.safeParse({
      ...base,
      capture: {
        artifactId: composed.path,
        sha256: composed.sha256,
        mimeType: "image/svg+xml",
        width: composed.width,
        height: composed.height,
        stateId: "native-home",
        source: "app-pixels",
      },
    });
    assert(
      !svgMime.success && svgMime.error.issues.some((issue) => issue.path.join(".") === "capture.mimeType"),
      "an SVG deliverable relabeled as app-pixels was accepted",
    );
    const genuine = mobileObservationSchema.safeParse({
      ...base,
      capture: {
        artifactId: "artifact.native-home-raw",
        sha256: capture.sha256,
        mimeType: "image/png",
        width: capture.width,
        height: capture.height,
        stateId: "native-home",
        source: "app-pixels",
      },
    });
    assert(genuine.success, `a genuine capture record failed to parse: ${genuine.success ? "" : JSON.stringify(genuine.error.issues)}`);
    const captureProvenance = genuine.data.capture;
    assert(captureProvenance !== undefined, "genuine observation lost its capture record");
    assert((provenance as unknown) !== (captureProvenance as unknown), "composed and capture provenance are the same object");
    assert(captureProvenance.source === "app-pixels", `capture provenance source is ${captureProvenance.source}`);
    assert(provenance.source === "composited", `composed provenance source is ${provenance.source}`);
    assert(new Set<string>([captureProvenance.source, provenance.source]).size === 2, "capture and composed provenance share a source value");
    assert(
      provenance.kind === "composed-marketing-asset" && !("kind" in captureProvenance) && !("notCaptureEvidence" in captureProvenance),
      "capture provenance carries the composed asset's kind markers",
    );
    assert(
      captureProvenance.sha256 === capture.sha256 && composed.sha256 !== capture.sha256,
      "the composed output hashes to the raw capture; it is not a distinct artifact",
    );
    assert(
      provenance.outputs.every((output) => output.composedFrom.every((source) => source.sourceFingerprint === "unknown")),
      "a composedFrom entry claims a source fingerprint the tuck captures never had",
    );
  });

  harness.check("screenshot-compose: examples/tuck/showcase is unchanged after the suite", () => {
    for (const entry of readShowcase()) {
      const actual = sha256(readFileSync(path.join(SHOWCASE_DIR, entry.file)));
      assert(actual === entry.sha256, `${entry.file} changed during the suite: ${actual}`);
    }
    assert(
      !existsSync(path.join(SHOWCASE_DIR, "captures.json")) && !existsSync(path.join(SHOWCASE_DIR, "provenance.json")),
      "the suite wrote into examples/tuck/showcase",
    );
  });
}
