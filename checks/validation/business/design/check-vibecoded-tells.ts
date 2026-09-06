#!/usr/bin/env node
/**
 * check-vibecoded-tells.ts — the mechanically checkable subset of the vibecoded-tells list.
 *
 * knowledge/design/vibecoded-tells.md names the surface smells that make a page read as
 * unedited AI output. Most rows need judgment (the audit pass owns those); this gate catches
 * the greppable subset over landing/web-surface source, mirroring how no-slop-rules.ts
 * enforces the mechanical subset of the writing standard.
 *
 * Two severity tiers, from the reference's own scoring rule. Errors are the never-earned or
 * trust-tier hits: a default icon pack import, and a site-shaped landing with no terms or
 * privacy link. Warnings are Tier 2 default tells — each one is a demand for a derivation
 * row in DESIGN.md, not an automatic removal order, so a warning must stay visible
 * without blocking the build. Each code is reported once per file to keep output bounded.
 *
 * The shipped section library (examples/workspace/business/growth/landing/) is deliberately clean of
 * every pattern here: it is aesthetic-neutral and token-driven, so a hit in a generated
 * business repo always traces to a per-launch choice, never to the template.
 *
 * npm script: check:vibecoded-tells
 * Usage: tsx checks/validation/business/design/check-vibecoded-tells.ts --root /path/to/business
 *        tsx checks/validation/business/design/check-vibecoded-tells.ts --root /path/to/webapp --scan-roots src
 *
 * --scan-roots (comma-separated, relative to --root) replaces the default business-layout
 * scan roots for repositories that keep their web surface elsewhere, such as a single-app
 * repository with a src/ directory. Naming roots explicitly asserts that surface exists there: a named root that is
 * missing or holds no scannable source fails the gate, where the default roots keep their
 * exit-0 "no web-surface source in scope" pass for business repos that have no web surface.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";
import { analyzeLegalNavigation } from "./lib/legal-navigation.js";
import { ALL_EXTENSIONS, MARKUP_EXTENSIONS, TELLS } from "./lib/vibecode-tells.js";

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--root"], key: "root" },
  { flags: ["--scan-roots"], key: "scanRoots", kind: "string", strict: true },
]);
const root = path.resolve(flagString(flags, "root") ?? ".");
const realRoot = existsSync(root) ? realpathSync(root) : root;

const issues: Issue[] = [];

/** Web-surface directories the reference governs, relative to the business root. */
const DEFAULT_SCAN_ROOTS = ["growth/landing", "growth/funnel", "web"];

const explicitScanRoots = flagString(flags, "scanRoots")
  ?.split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);
if (explicitScanRoots !== undefined && explicitScanRoots.length === 0) {
  issues.push(issue("error", "vibecode.scan_roots_invalid", "--scan-roots was passed but names no directories."));
}
const hasExplicitScanRoots = (explicitScanRoots?.length ?? 0) > 0;
const scanRoots = hasExplicitScanRoots ? explicitScanRoots! : DEFAULT_SCAN_ROOTS;

const IGNORED_SCAN_DIRECTORIES = new Set([".git", "node_modules", ".next", "dist", "build", "DerivedData", ".expo", ".turbo", "coverage"]);

let scannedAnything = false;
const explicitFiles: string[] = [];
const explicitSiteRoots: string[] = [];

for (const scanRoot of scanRoots) {
  const absoluteScanRoot = path.resolve(root, scanRoot);
  if (hasExplicitScanRoots && !isWithinRoot(absoluteScanRoot, root)) {
    issues.push(
      issue(
        "error",
        "vibecode.scan_root_outside_root",
        `--scan-roots names ${scanRoot}, which resolves outside --root. Explicit scan roots must stay inside the application root.`,
        scanRoot,
      ),
    );
    continue;
  }
  if (!existsSync(absoluteScanRoot)) {
    // An explicitly named root is a claim that surface lives there; a miss is a broken
    // invocation or a moved layout, and either way exit 0 would be a false clean.
    if (hasExplicitScanRoots) {
      issues.push(
        issue(
          "error",
          "vibecode.scan_root_missing",
          `--scan-roots names ${scanRoot}, but ${scanRoot}/ does not exist under the root. Fix the invocation or the layout; an explicit scan root never passes silently.`,
          scanRoot,
        ),
      );
    }
    continue;
  }

  const resolvedScanRoot = realpathSync(absoluteScanRoot);
  if (!isWithinRoot(resolvedScanRoot, realRoot)) {
    issues.push(
      issue(
        "error",
        "vibecode.scan_root_outside_root",
        hasExplicitScanRoots
          ? `--scan-roots names ${scanRoot}, which resolves through a symlink outside --root. Explicit scan roots must stay inside the application root.`
          : `Default scan root ${scanRoot} resolves through a symlink outside --root. Default scan roots must stay inside the application root.`,
        scanRoot,
      ),
    );
    continue;
  }
  if (!statSync(resolvedScanRoot).isDirectory()) {
    if (hasExplicitScanRoots) {
      issues.push(
        issue(
          "error",
          "vibecode.scan_root_not_directory",
          `--scan-roots names ${scanRoot}, but that path is not a directory. Point the flag at a complete source directory.`,
          scanRoot,
        ),
      );
    }
    continue;
  }
  if (hasExplicitScanRoots) explicitSiteRoots.push(resolvedScanRoot);

  const collection = collectContainedFiles(resolvedScanRoot, realRoot, ALL_EXTENSIONS);
  const files = collection.files;
  if (collection.truncated) {
    issues.push(
      issue(
        "error",
        "vibecode.scan_roots_file_limit",
        hasExplicitScanRoots
          ? `--scan-roots names ${scanRoot}, which contains more than 5,000 scannable files. The validator refuses to report a partial clean result; narrow the explicit roots or split the check into complete surfaces.`
          : `Default scan root ${scanRoot} contains more than 5,000 scannable files. The validator refuses to report a partial clean result; narrow the surface or split it into complete scan roots.`,
        scanRoot,
      ),
    );
  }
  if (collection.ignoredLinkAuditTruncated) {
    issues.push(
      issue(
        "error",
        "vibecode.scan_roots_link_audit_limit",
        hasExplicitScanRoots
          ? `--scan-roots names ${scanRoot}, whose ignored directories contain more than 100,000 entries. The validator refuses to skip those files without completing the symlink-containment audit; narrow the explicit root or remove the oversized ignored subtree.`
          : `Default scan root ${scanRoot} has ignored directories with more than 100,000 entries. The validator refuses to skip those files without completing the symlink-containment audit; narrow the surface or remove the oversized ignored subtree.`,
        scanRoot,
      ),
    );
  }
  for (const invalidLink of collection.invalidLinks) {
    issues.push(
      issue(
        "error",
        "vibecode.scan_root_outside_root",
        hasExplicitScanRoots
          ? `--scan-roots includes ${path.relative(realRoot, invalidLink)}, a symlink that does not resolve inside --root. Explicit scan roots cannot consume linked source outside the application root.`
          : `Default scan root ${scanRoot} includes ${path.relative(realRoot, invalidLink)}, a symlink that does not resolve inside --root. Default scan roots cannot consume linked source outside the application root.`,
        path.relative(realRoot, invalidLink),
      ),
    );
  }
  if (files.length > 0) scannedAnything = true;
  if (hasExplicitScanRoots) {
    explicitFiles.push(...files);
    if (files.length === 0) {
      issues.push(
        issue(
          "error",
          "vibecode.scan_roots_no_source",
          `--scan-roots names ${scanRoot}, but ${scanRoot}/ contains no scannable web-surface source. Point the flag at the directory that holds the surface.`,
          scanRoot,
        ),
      );
    }
  }

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const extension = path.extname(file);
    const relative = path.relative(root, file);
    for (const tell of TELLS) {
      if (!tell.extensions.has(extension)) continue;
      if (!tell.detect(source)) continue;
      issues.push(issue(tell.severity, tell.code, tell.message, relative));
    }
  }

  if (!hasExplicitScanRoots) checkLegalLinks([resolvedScanRoot], scanRoot, files);
}

if (hasExplicitScanRoots && explicitFiles.length > 0) checkLegalLinks([realRoot, ...explicitSiteRoots], explicitScanRoots!.join(", "), explicitFiles);

function isWithinRoot(candidate: string, expectedRoot: string): boolean {
  const relative = path.relative(expectedRoot, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function collectContainedFiles(
  scanRoot: string,
  expectedRoot: string,
  extensions: Set<string>,
  maxFiles = 5000,
  maxIgnoredEntries = 100_000,
): { files: string[]; invalidLinks: string[]; truncated: boolean; ignoredLinkAuditTruncated: boolean } {
  const files = new Set<string>();
  const invalidLinks = new Set<string>();
  const visitedDirectories = new Set<string>();
  const auditedIgnoredDirectories = new Set<string>();
  let truncated = false;
  let ignoredEntriesAudited = 0;
  let ignoredLinkAuditTruncated = false;

  function addFile(file: string): void {
    if (files.has(file)) return;
    if (files.size >= maxFiles) {
      truncated = true;
      return;
    }
    files.add(file);
  }

  function auditIgnoredDirectory(directory: string): void {
    if (ignoredLinkAuditTruncated) return;
    const realDirectory = realpathSync(directory);
    if (auditedIgnoredDirectories.has(realDirectory)) return;
    auditedIgnoredDirectories.add(realDirectory);

    for (const entry of readdirSync(realDirectory, { withFileTypes: true })) {
      if (ignoredEntriesAudited >= maxIgnoredEntries) {
        ignoredLinkAuditTruncated = true;
        return;
      }
      ignoredEntriesAudited += 1;
      const entryPath = path.join(realDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        let resolvedEntry: string;
        try {
          resolvedEntry = realpathSync(entryPath);
        } catch {
          invalidLinks.add(entryPath);
          continue;
        }
        if (!isWithinRoot(resolvedEntry, expectedRoot)) {
          invalidLinks.add(entryPath);
          continue;
        }
        if (statSync(resolvedEntry).isDirectory()) auditIgnoredDirectory(resolvedEntry);
      } else if (entry.isDirectory()) {
        auditIgnoredDirectory(entryPath);
      }
      // Ordinary files under an ignored directory are intentionally not added to files.
    }
  }

  function visit(directory: string): void {
    const realDirectory = realpathSync(directory);
    if (visitedDirectories.has(realDirectory)) return;
    visitedDirectories.add(realDirectory);

    for (const entry of readdirSync(realDirectory, { withFileTypes: true })) {
      const entryPath = path.join(realDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        let resolvedEntry: string;
        try {
          resolvedEntry = realpathSync(entryPath);
        } catch {
          invalidLinks.add(entryPath);
          continue;
        }
        if (!isWithinRoot(resolvedEntry, expectedRoot)) {
          invalidLinks.add(entryPath);
          continue;
        }
        const target = statSync(resolvedEntry);
        if (IGNORED_SCAN_DIRECTORIES.has(entry.name)) {
          if (target.isDirectory()) auditIgnoredDirectory(resolvedEntry);
          continue;
        }
        if (target.isDirectory()) visit(resolvedEntry);
        else if (target.isFile()) {
          const aliasExtension = path.extname(entry.name);
          if (extensions.has(aliasExtension)) addFile(entryPath);
          else if (extensions.has(path.extname(resolvedEntry))) addFile(resolvedEntry);
        }
      } else if (IGNORED_SCAN_DIRECTORIES.has(entry.name) && entry.isDirectory()) {
        auditIgnoredDirectory(entryPath);
        continue;
      } else if (IGNORED_SCAN_DIRECTORIES.has(entry.name)) {
        continue;
      } else if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
        addFile(entryPath);
      }
    }
  }

  visit(scanRoot);
  return { files: [...files], invalidLinks: [...invalidLinks], truncated, ignoredLinkAuditTruncated };
}

/**
 * Terms/privacy links are required only once the landing is site-shaped — a deployable page,
 * not the bare section component library. The site-shape signals mirror
 * check-landing-funnel.ts so the two gates agree on when a landing "exists".
 */
function checkLegalLinks(absoluteScanRoots: string[], scanRoot: string, files: string[]): void {
  const siteRoots = [...new Set(absoluteScanRoots)];
  const siteShaped = siteRoots.some(
    (siteRoot) =>
      entryExists(path.join(siteRoot, "index.html")) ||
      existsSync(path.join(siteRoot, "package.json")) ||
      existsSync(path.join(siteRoot, "app")) ||
      existsSync(path.join(siteRoot, "pages")),
  );
  if (!siteShaped) return;

  const markup = files.filter((file) => MARKUP_EXTENSIONS.has(path.extname(file)));
  for (const siteRoot of siteRoots) {
    const rootIndexPath = path.join(siteRoot, "index.html");
    if (!entryExists(rootIndexPath)) continue;
    let rootIndex: string;
    try {
      rootIndex = realpathSync(rootIndexPath);
    } catch {
      issues.push(
        issue(
          "error",
          "vibecode.legal_markup_invalid",
          `The application index does not resolve to readable markup. Remove the dangling link or point it at a file inside --root.`,
          path.relative(realRoot, rootIndexPath),
        ),
      );
      rootIndex = "";
    }
    if (rootIndex && !isWithinRoot(rootIndex, realRoot)) {
      issues.push(
        issue(
          "error",
          "vibecode.legal_markup_outside_root",
          `The application index resolves outside --root. The legal-link check does not read markup outside the application root.`,
          path.relative(realRoot, rootIndexPath),
        ),
      );
    } else if (rootIndex && !statSync(rootIndex).isFile()) {
      issues.push(
        issue(
          "error",
          "vibecode.legal_markup_invalid",
          `The application index is not a file. Point index.html at readable markup inside --root.`,
          path.relative(realRoot, rootIndexPath),
        ),
      );
    } else if (rootIndex && !markup.includes(rootIndex)) {
      markup.push(rootIndex);
    }
  }
  const legalNavigation = analyzeLegalNavigation(markup, { cwd: realRoot });
  for (const failure of legalNavigation.parseFailures) {
    const relativeFile = path.relative(realRoot, failure.file);
    issues.push(
      issue(
        "error",
        "vibecode.legal_markup_invalid",
        `The legal-link analyzer could not parse ${relativeFile}. Fix the markup before this check can pass: ${failure.message}`,
        relativeFile,
      ),
    );
  }
  const hasTerms = legalNavigation.hasTerms;
  const hasPrivacy = legalNavigation.hasPrivacy;
  for (const [present, name, artifact] of [
    [hasTerms, "terms", "trust/TERMS.md"],
    [hasPrivacy, "privacy", "trust/PRIVACY.md"],
  ] as const) {
    if (present) continue;
    issues.push(
      issue(
        "error",
        "vibecode.legal_links_missing",
        `Site-shaped landing under ${scanRoot}/ links no ${name} page. A missing ${name} link is a Tier 1 trust breaker; publish ${artifact} and link it from the footer.`,
        scanRoot,
      ),
    );
  }
}

function entryExists(target: string): boolean {
  try {
    lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

const title = scannedAnything ? "Vibecoded tells: mechanical smell scan" : "Vibecoded tells: mechanical smell scan (no web-surface source in scope)";
reportAndExit(title, issues);
