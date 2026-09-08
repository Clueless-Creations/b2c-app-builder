/**
 * The pre-registration workspace inspector (KTD4) — a second, bounded, read-only resolution path
 * for a folder that has not been registered yet.
 *
 * Registry resolution (`adapters/registry.ts`'s `resolveRegisteredWorkspace`) stays the only
 * path anything uses to act on a workspace. This module exists purely for orientation *before*
 * that registration happens, so `b2c_plan` and `b2c_status` can say something useful about a
 * founder's first, unregistered session instead of refusing it outright (R8: both surfaces call
 * this one classifier, so they cannot disagree about the same folder).
 *
 * Bounds, by construction (R2, R20):
 *   - Only the files named in MARKER_ALLOWLIST are ever read. Nothing else in the folder —
 *     no directory listing, no recursive walk — is touched.
 *   - A symlinked marker is refused (`lstat`-checked before any read) — never followed.
 *   - Scaffold identity uses the shared bounded registry reader (4 MiB per known marker).
 *   - Each evidence marker is capped at MARKER_BYTE_CAP bytes; a file over the cap is treated as absent
 *     rather than partially read.
 *   - Every excerpt returned to a caller is capped at EVIDENCE_EXCERPT_CAP characters — far below
 *     MARKER_BYTE_CAP — so evidence is bounded independently of the read cap, never a raw dump.
 *   - The registry itself is only ever consulted for an exact match (`resolveRegisteredWorkspace`)
 *     or a real-path containment check (`findContainingWorkspace`); the caller's `cwd` is never
 *     joined into a registry lookup or used to construct a new registry entry.
 *   - Nothing here writes, and nothing here is reachable from a write tool.
 *   - Marker names are matched exactly as the filesystem reports them (`package.json`,
 *     `PRODUCT.md`, `README.md`, …, this repository's own casing convention); a case-insensitive
 *     filesystem may resolve a differently-cased file onto the same marker, a case-sensitive one
 *     will not — that variance belongs to the filesystem, not to this module.
 */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { findContainingWorkspace, hasWorkspaceScaffold, loadRegistry, resolveRegisteredWorkspace } from "../../adapters/registry.js";

// --- marker allowlist (KTD4 step 3) -----------------------------------------------------------

/** Fixed allowlist: the inspector never reads any file outside this list. */
export const MARKER_ALLOWLIST = [
  "package.json",
  "PRODUCT.md",
  "README.md",
  "product.yaml",
  "catalog.json",
  "state/business-state.json",
  "run/run-state.json",
] as const;
export type MarkerName = (typeof MARKER_ALLOWLIST)[number];

/** Per-file read cap in bytes. An oversized marker is treated as absent — never partially read. */
export const MARKER_BYTE_CAP = 64 * 1024;

/** Evidence excerpt cap in characters — far below MARKER_BYTE_CAP by design (R2). */
export const EVIDENCE_EXCERPT_CAP = 120;

// --- output shape ------------------------------------------------------------------------------

export type ProductKind = "consumer-app" | "mismatch" | "unknown";

export interface EvidenceSignal {
  readonly kind: "consumer-app" | "foreign-product";
  readonly source: MarkerName;
  /** Which field within the source produced this signal (e.g. "description", "dependencies"). Absent for a whole-file text scan (README.md, PRODUCT.md). */
  readonly field?: string;
  /** Quoted, capped at EVIDENCE_EXCERPT_CAP — never a raw file dump. */
  readonly excerpt: string;
}

export interface MarkerReadout {
  readonly name: MarkerName;
  readonly present: boolean;
}

/**
 * "No prior B2C engagement" vs "engaged but unregistered" (KTD4 step 5), mirroring the file
 * signals `readWorkspaceStatus` (kernel/session/status.ts) uses for a registered workspace's
 * not_bootstrapped/no_run/run_state_unreadable/run states — without importing that reader, since
 * it also walks `digests/`, which sits outside MARKER_ALLOWLIST and would break the bounded-read
 * contract this module exists to hold.
 */
export type InspectorPhase = "no-engagement" | "engaged-no-run" | "engaged-run-unreadable" | "engaged-with-run";

export type RegistrationStatus =
  | { readonly kind: "unregistered"; readonly suggestedFix: string }
  | { readonly kind: "registered"; readonly id: string }
  | { readonly kind: "inside-registered"; readonly id: string }
  | { readonly kind: "registry-stale"; readonly id: string; readonly registeredPath: string; readonly suggestedFix: string };

export interface WorkspaceInspection {
  readonly cwd: string;
  readonly registration: RegistrationStatus;
  readonly productKind: ProductKind;
  readonly evidence: readonly EvidenceSignal[];
  readonly phase: InspectorPhase;
  readonly markers: readonly MarkerReadout[];
}

export interface InspectCwdNotFound {
  readonly ok: false;
  readonly code: "cwd_not_found";
  readonly message: string;
}

export type InspectResult = ({ readonly ok: true } & WorkspaceInspection) | InspectCwdNotFound;

// --- marker reads --------------------------------------------------------------------------

type MarkerRead = { readonly present: true; readonly content: string } | { readonly present: false };

function readMarker(root: string, name: MarkerName): MarkerRead {
  const target = path.join(root, name);
  let stat;
  try {
    stat = lstatSync(target);
  } catch {
    return { present: false }; // missing, or an unreadable ancestor — either way, absent
  }
  if (stat.isSymbolicLink()) return { present: false }; // never follow a symlinked marker (R2)
  if (!stat.isFile()) return { present: false };
  if (stat.size > MARKER_BYTE_CAP) return { present: false }; // oversized: never read at all
  try {
    return { present: true, content: readFileSync(target, "utf8") };
  } catch {
    return { present: false }; // EACCES and friends
  }
}

// --- productKind evidence (KTD6) ------------------------------------------------------------

// Deliberately small, literal vocabularies rather than a general classifier: KTD6 requires
// *positive* evidence for "mismatch" (an empty/ambiguous folder must stay "unknown"), so every
// term here is a word that, in a package.json field or a README/PRODUCT.md opening, is specific
// enough that a false hit is unlikely. Extend deliberately, not by inference.
const FOREIGN_PRODUCT_VOCABULARY = [
  "apparel",
  "clothing",
  "fashion",
  "boutique",
  "streetwear",
  "activewear",
  "footwear",
  "sizing chart",
  "denim",
  "collection drop",
];
const APP_PRODUCT_LANGUAGE = /\b(app store|play store|google play|ios app|android app|mobile app|download the app|our app)\b/i;
const APP_FRAMEWORK_DEPENDENCY_MARKERS = ["react-native", "expo", "capacitor", "cordova", "nativescript", "ionic"];
const FOREIGN_PLATFORM_DEPENDENCY_MARKERS = ["shopify", "woocommerce", "magento", "bigcommerce"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function capExcerpt(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  return collapsed.length > EVIDENCE_EXCERPT_CAP ? `${collapsed.slice(0, EVIDENCE_EXCERPT_CAP)}…` : collapsed;
}

function matchesVocabulary(text: string, vocabulary: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return vocabulary.some((term) => lower.includes(term));
}

function textFieldSignals(source: MarkerName, field: string | undefined, text: string): EvidenceSignal[] {
  if (!text.trim()) return [];
  const signals: EvidenceSignal[] = [];
  if (matchesVocabulary(text, FOREIGN_PRODUCT_VOCABULARY)) signals.push({ kind: "foreign-product", source, field, excerpt: capExcerpt(text) });
  if (APP_PRODUCT_LANGUAGE.test(text)) signals.push({ kind: "consumer-app", source, field, excerpt: capExcerpt(text) });
  return signals;
}

/** KTD6: package.json evidence is drawn only from name, description, keywords, and dependencies. */
function packageJsonSignals(content: string): EvidenceSignal[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return []; // unparseable: absent for signal purposes, never a throw
  }
  if (!isRecord(parsed)) return [];

  const signals: EvidenceSignal[] = [];
  const name = typeof parsed.name === "string" ? parsed.name : "";
  const description = typeof parsed.description === "string" ? parsed.description : "";
  const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.filter((entry): entry is string => typeof entry === "string") : [];

  signals.push(...textFieldSignals("package.json", "name", name));
  signals.push(...textFieldSignals("package.json", "description", description));
  signals.push(...textFieldSignals("package.json", "keywords", keywords.join(" ")));

  const dependencies = isRecord(parsed.dependencies) ? Object.keys(parsed.dependencies) : [];
  for (const dependency of dependencies) {
    const lower = dependency.toLowerCase();
    if (APP_FRAMEWORK_DEPENDENCY_MARKERS.some((marker) => lower.includes(marker))) {
      signals.push({ kind: "consumer-app", source: "package.json", field: "dependencies", excerpt: capExcerpt(dependency) });
    }
    if (FOREIGN_PLATFORM_DEPENDENCY_MARKERS.some((marker) => lower.includes(marker))) {
      signals.push({ kind: "foreign-product", source: "package.json", field: "dependencies", excerpt: capExcerpt(dependency) });
    }
  }
  return signals;
}

function firstLines(content: string, limit: number): string {
  return content.split(/\r?\n/).slice(0, limit).join("\n");
}

/**
 * KTD6: a closed three-state decision. Any consumer-app signal wins outright — vertical (e.g.
 * apparel vocabulary) never overrides an app-framework dependency or app/store language. Absent
 * that, "mismatch" requires at least two foreign-product signals from *independent* sources —
 * counted as distinct (source, field) pairs, so two hits inside the same package.json field don't
 * count twice. Anything short of that — including a completely evidence-free folder — is
 * "unknown", never a default "consumer-app" and never a wrong "mismatch".
 */
function decideProductKind(signals: readonly EvidenceSignal[]): ProductKind {
  if (signals.some((signal) => signal.kind === "consumer-app")) return "consumer-app";
  const independentForeignSources = new Set(
    signals.filter((signal) => signal.kind === "foreign-product").map((signal) => `${signal.source}:${signal.field ?? ""}`),
  );
  return independentForeignSources.size >= 2 ? "mismatch" : "unknown";
}

// --- phase (KTD4 step 5) ---------------------------------------------------------------------

function inferPhase(projectState: MarkerRead, runState: MarkerRead): InspectorPhase {
  if (runState.present) {
    try {
      const parsed: unknown = JSON.parse(runState.content);
      if (!isRecord(parsed)) throw new Error("run-state.json is not a JSON object");
      return "engaged-with-run";
    } catch {
      return "engaged-run-unreadable";
    }
  }
  if (projectState.present) return "engaged-no-run";
  return "no-engagement";
}

// --- registration probe (KTD4 step 2) ----------------------------------------------------------

export function registerCommand(target: string, platform: NodeJS.Platform = process.platform): string {
  // Windows cmd.exe treats single quotes as path characters. Double quotes preserve spaces
  // and apostrophes; double a trailing backslash so it cannot escape the closing quote.
  if (platform === "win32") {
    // cmd expands these even inside quotes. Keep exceptional paths out of shell text.
    if (/[%!"\r\n]/.test(target))
      return "b2c workspaces register <id> <path> (pass the workspace path as one literal process argument; it contains shell expansion characters)";
    return `cmd.exe: b2c workspaces register <id> "${target.replace(/\\+$/, (slashes) => slashes + slashes)}"`;
  }
  return `b2c workspaces register <id> '${target.replace(/'/g, "'\\''")}'`;
}

// --- entry point -------------------------------------------------------------------------------

/** Read-only classification of `cwd` against the registry and the fixed marker allowlist. Never writes, never follows a symlinked marker, never reads past MARKER_BYTE_CAP. */
export function inspectWorkspace(cwd: string): InspectResult {
  const absoluteCwd = path.resolve(cwd);
  const exact = resolveRegisteredWorkspace(absoluteCwd);

  let registration: RegistrationStatus;
  if (!("refused" in exact)) {
    // `resolveRegisteredWorkspace` matched `absoluteCwd` — and since a registered id can never
    // start with "/" (registry.ts's WORKSPACE_ID), an absolute path can only ever match through
    // its exact-path branch, never its id branch, so the entry below is guaranteed to exist.
    const registry = loadRegistry();
    const entry = registry.workspaces.find((workspace) => path.resolve(workspace.path) === absoluteCwd);
    const id = entry?.id ?? "unknown";
    registration = existsSync(absoluteCwd)
      ? { kind: "registered", id }
      : { kind: "registry-stale", id, registeredPath: absoluteCwd, suggestedFix: registerCommand(absoluteCwd) };
  } else if (!existsSync(absoluteCwd)) {
    // Not an exact registered match, and the folder itself does not exist: a typed error,
    // distinct from the empty-folder success case below and from registry-stale above (whose
    // path also doesn't exist, but which is still a *known* — just stale — registered address).
    return { ok: false, code: "cwd_not_found", message: `inspect.cwd_not_found: "${absoluteCwd}" does not exist` };
  } else {
    const containing = findContainingWorkspace(absoluteCwd);
    registration = containing
      ? { kind: "inside-registered", id: containing.id }
      : {
          kind: "unregistered",
          suggestedFix: hasWorkspaceScaffold(absoluteCwd)
            ? registerCommand(absoluteCwd)
            : 'b2c business-create --workspace <id> --directory <empty-directory> --name "<name>" --hypothesis "<hypothesis>"',
        };
  }

  // From here the folder either exists, or it is a stale registered path that was removed —
  // either way every marker read below naturally reports absent for a missing folder, so no
  // special-casing is needed for the stale-path case.
  const markerReads = new Map<MarkerName, MarkerRead>(MARKER_ALLOWLIST.map((name) => [name, readMarker(absoluteCwd, name)] as const));
  const markers: MarkerReadout[] = MARKER_ALLOWLIST.map((name) => ({ name, present: markerReads.get(name)!.present }));

  const evidence: EvidenceSignal[] = [];
  const packageJson = markerReads.get("package.json")!;
  if (packageJson.present) evidence.push(...packageJsonSignals(packageJson.content));
  for (const name of ["PRODUCT.md", "README.md"] as const) {
    const read = markerReads.get(name)!;
    if (read.present) evidence.push(...textFieldSignals(name, undefined, firstLines(read.content, 40)));
  }

  const productKind = decideProductKind(evidence);
  const phase = inferPhase(markerReads.get("state/business-state.json")!, markerReads.get("run/run-state.json")!);

  return { ok: true, cwd: absoluteCwd, registration, productKind, evidence, phase, markers };
}
