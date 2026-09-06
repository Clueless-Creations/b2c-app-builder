#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { asArray, asString, getPath, issue, loadProjectState, parseCliArgs, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const argv = process.argv.slice(2);
const args = parseCliArgs(argv);
const skillRoot = path.resolve(flagValue("--skill-root") ?? path.resolve(import.meta.dirname, ".."));
const contractOnly = argv.includes("--contract-only");
const proofWorkflow = argv.includes("--proof-workflow");
const issues: Issue[] = [];

validateStoredContract();

if (!contractOnly) {
  const loaded = loadProjectState(args);
  issues.push(...loaded.issues);
  validateProjectProof(loaded.state);
}

reportAndExit("MobAI contract and proof check", issues);

function validateStoredContract(): void {
  const relative = "knowledge/engineering/mobai-toolbelt.md";
  const fullPath = path.join(skillRoot, relative);
  if (!existsSync(fullPath)) {
    issues.push(issue("error", "mobai.contract.reference_missing", "knowledge/engineering/mobai-toolbelt.md is required.", relative));
    return;
  }
  const text = readFileSync(fullPath, "utf8");
  const requirements: Array<[string, string[], string]> = [
    ["versions", ["Desktop app", "2.5.1", "MCP server", "2.5.0", "Standalone CLI package", "2.1.1"], "Keep desktop, MCP, and CLI versions as separate tracks."],
    [
      "release_source",
      ["https://github.com/MobAI-App/releases/releases/tag/v2.5.1", "Release v2.5.1"],
      "Cite the sparse official desktop release instead of inventing notes.",
    ],
    ["mcp_source", ["414f858ae60babeab16a45cb9364addb87498abe"], "Cite the official MCP capability commit."],
    [
      "artifact_provenance",
      [
        "https://github.com/MobAI-App/releases/releases/tag/v2.5.0",
        "2c0cec8c853d577101bf26d29ecbe6d6b606c98e6400802fed164783751df7da",
        "9dcab97b8ffa2bc6dc763a795c6fe995c2455a142f1b79728f43fa30314af22d",
      ],
      "Record the official comparison baseline and checksums for artifact-derived desktop patch claims.",
    ],
    ["tiers", ["Free", "Plus", "Pro", "one device"], "Document the free and paid tier boundary."],
    ["cli", ["mobai version", "mobai test <file>", "mobai debug", "mobai siri", "mobai long-press"], "Document commands verified from current CLI help."],
    ["repeat", ["repeat", "max_iterations", "repeat_index", "times", "while", "until", "condition"], "Document bounded repeat semantics."],
    [
      "scripts",
      ["run_script", "eval_script", "no filesystem", "no `require`", "never place secrets", "allowlisted test/staging endpoints"],
      "Document host-script isolation and secret safety.",
    ],
    ["healing", ["AI healing", "Review the diff", "require the rerun"], "Require human diff review and a passing rerun for healed flows."],
    [
      "desktop_patch",
      ["LongPressDevice", "artifact-derived inference", "Android device-port-forwarding"],
      "Label artifact-derived desktop patch behavior as inference.",
    ],
    ["ci", ["https://github.com/MobAI-App/mobai-ci"], "Route CI guidance through the official MobAI CI repository."],
  ];
  const lower = text.toLowerCase();
  for (const [id, terms, message] of requirements) {
    if (terms.some((term) => !lower.includes(term.toLowerCase()))) {
      issues.push(issue("error", `mobai.contract.${id}_missing`, message, relative));
    }
  }

  for (const file of markdownFiles(skillRoot)) {
    const fileText = readFileSync(file, "utf8");
    const lines = fileText.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!.trim();
      if (/^(?:\$\s*)?mobai --version\s*$/.test(line) || /^[-*]\s+`mobai --version`[.!]?$/i.test(line)) {
        issues.push(
          issue(
            "error",
            "mobai.contract.invalid_version_command",
            "Executable guidance must use `mobai version`; `mobai --version` is not valid on the verified CLI contract.",
            `${path.relative(skillRoot, file)}:${index + 1}`,
          ),
        );
      }
    }
  }
}

function validateProjectProof(state: unknown): void {
  const readiness = existingText(["engineering/PRODUCTION_READINESS.md", "engineering/engineering/PRODUCTION_READINESS.md"]);
  const engineeringStatus = asString(getPath(state, "lanes.engineering.status"))?.toLowerCase();
  if (engineeringStatus !== "succeeded" && !proofWorkflow) return;
  if (!readiness) {
    issues.push(
      issue(
        "error",
        "mobai.proof.readiness_missing",
        proofWorkflow
          ? "The native proof workflow needs engineering/PRODUCTION_READINESS.md before it can accept Android or mixed-platform evidence."
          : "Done engineering needs engineering/PRODUCTION_READINESS.md.",
        "engineering/PRODUCTION_READINESS.md",
      ),
    );
    return;
  }

  const section = sectionText(readiness.text, "MobAI Cross-Platform Proof");
  const readinessClaimsMobai = /MobAI\s+(?:E2E|proof|Testing Mode|cross-platform)/i.test(readiness.text);
  if (!section && readinessClaimsMobai) {
    issues.push(
      issue(
        "error",
        "mobai.proof.section_missing",
        "A done engineering lane that claims MobAI proof needs a MobAI Cross-Platform Proof section.",
        readiness.relativePath,
      ),
    );
    return;
  }
  if (!section) {
    // Deleting the section used to skip validatePlatformMatrix entirely, so an
    // Android-in-scope launch whose only device evidence came from an iOS-only
    // route (the in-app simulator, XcodeBuildMCP) passed with no Android proof
    // and no recorded decision. Cross-platform scope has to be answered, even
    // if the answer is a dated "not needed".
    const platforms = asArray(getPath(state, "project.platforms"))
      .map((item) => asString(item)?.toLowerCase())
      .filter(Boolean);
    const androidBundleId = asString(getPath(state, "project.bundleIds.android"))?.trim();
    if (platforms.includes("android") || androidBundleId) {
      issues.push(
        issue(
          "error",
          "mobai.proof.cross_platform_section_missing",
          "Android is in scope and engineering is done, but engineering/PRODUCTION_READINESS.md has no MobAI Cross-Platform Proof section. An iOS-only route cannot prove Android: record the Android evidence, or a dated blocked/not-needed tier with the replacement coverage.",
          readiness.relativePath,
        ),
      );
    }
    return;
  }

  const selectedTier = field(section, "Selected tier");
  const tierCategory = selectedTier?.match(/^\s*(free|plus|pro|blocked|not needed|not_needed)\b/i)?.[1]?.toLowerCase();
  if (tierCategory && /^(?:blocked|not needed|not_needed)$/.test(tierCategory)) {
    if (!/20\d{2}-\d{2}-\d{2}/.test(selectedTier ?? "") || !/[:;-]\s*\S+/.test(selectedTier ?? "")) {
      issues.push(
        issue(
          "error",
          "mobai.proof.tier_deferral_undated",
          "A blocked/not-needed MobAI route needs a dated reason and the replacement coverage or blocker.",
          readiness.relativePath,
        ),
      );
    }
    return;
  }
  validateVersionFields(section, readiness.relativePath);
  requireField(
    section,
    "Docs checked",
    /20\d{2}-\d{2}-\d{2}/,
    "mobai.proof.docs_date_missing",
    "Record the date current MobAI sources/help were checked.",
    readiness.relativePath,
  );
  requireField(
    section,
    "Selected tier",
    /\b(?:free|plus|pro)\b/i,
    "mobai.proof.tier_missing",
    "Record Free, Plus, or Pro for the proof run.",
    readiness.relativePath,
  );
  validateHealAndScriptAttestations(section, readiness.relativePath);
  validatePlatformMatrix(section, state, readiness.relativePath);
  validateProviderProof();
  validateTierApproval(selectedTier);
  validateMobFiles(section, readiness.relativePath);
}

function validateVersionFields(section: string, file: string): void {
  const desktop = field(section, "Desktop app");
  const mcp = field(section, "MCP server");
  const cli = field(section, "CLI package");
  for (const [label, value] of [
    ["Desktop app", desktop],
    ["MCP server", mcp],
    ["CLI package", cli],
  ] as const) {
    if (!value || !/\b\d+\.\d+\.\d+\b/.test(value) || /pending/i.test(value)) {
      issues.push(issue("error", "mobai.proof.component_version_missing", `${label} needs its independently verified semantic version.`, file));
    }
  }
  const values = [desktop, mcp, cli].map((value) => value?.match(/\b\d+\.\d+\.\d+\b/)?.[0]).filter(Boolean);
  if (values.length === 3 && new Set(values).size === 1 && values[0] === "2.5.1") {
    issues.push(
      issue(
        "error",
        "mobai.proof.component_versions_conflated",
        "Desktop, MCP, and CLI all claim 2.5.1, which contradicts the current verified MCP/CLI tracks; verify each component independently.",
        file,
      ),
    );
  }
}

function validateHealAndScriptAttestations(section: string, file: string): void {
  const healed = field(section, "AI-healed flow");
  if (!healed || /pending/i.test(healed)) {
    issues.push(issue("error", "mobai.proof.ai_heal_attestation_missing", "Record whether AI healing was used.", file));
  } else if (!/not used/i.test(healed) && !(/reviewed diff/i.test(healed) && /pass(?:ed|ing) rerun/i.test(healed) && hasExistingPath(healed))) {
    issues.push(
      issue("error", "mobai.proof.ai_heal_review_rerun_missing", "An AI-healed flow needs a reviewed diff, passing rerun, and existing evidence path.", file),
    );
  }

  const script = field(section, "Host-side script safety");
  if (!script || /pending/i.test(script)) {
    issues.push(issue("error", "mobai.proof.host_script_attestation_missing", "Record whether host-side scripting was used.", file));
  } else if (
    !/not used/i.test(script) &&
    !(/allowlist/i.test(script) && /no embedded secrets/i.test(script) && /cleanup/i.test(script) && /backend proof/i.test(script))
  ) {
    issues.push(
      issue(
        "error",
        "mobai.proof.host_script_safety_missing",
        "Host scripting needs an endpoint allowlist, no-embedded-secrets attestation, cleanup, and backend proof.",
        file,
      ),
    );
  }
}

function validatePlatformMatrix(section: string, state: unknown, file: string): void {
  const rows = markdownRows(section, "Platform");
  const platforms = asArray(getPath(state, "project.platforms"))
    .map((item) => asString(item)?.toLowerCase())
    .filter((item): item is string => Boolean(item));
  const expected = [
    platforms.some((item) => item === "ios" || item === "ipados") ? "ios" : undefined,
    platforms.includes("android") ? "android" : undefined,
  ].filter((item): item is string => Boolean(item));
  for (const platform of expected) {
    const row = rows.find((cells) => cells[0]?.toLowerCase() === platform);
    if (!row) {
      issues.push(issue("error", "mobai.proof.platform_row_missing", `${platform} support needs a MobAI proof row or dated blocker.`, file));
      continue;
    }
    const [_, device, flow, evidence, provider, result] = row;
    if (/^(?:blocked|not applicable|n-a)/i.test(result ?? "")) {
      if (!/20\d{2}-\d{2}-\d{2}/.test(result ?? "") || !/[:;-]\s*\S+/.test(result ?? "")) {
        issues.push(issue("error", "mobai.proof.platform_blocker_undated", `${platform} needs a dated non-trivial blocker.`, file));
      }
      continue;
    }
    if (!/pass(?:ed)?/i.test(result ?? "")) {
      issues.push(issue("error", "mobai.proof.platform_result_invalid", `${platform} must be Passed or a dated blocker.`, file));
    }
    if (!device || /pending/i.test(device)) issues.push(issue("error", "mobai.proof.device_missing", `${platform} needs device and OS details.`, file));
    if (!flow || !hasExistingPath(flow, ".mob")) issues.push(issue("error", "mobai.proof.flow_missing", `${platform} needs an existing .mob flow path.`, file));
    if (!evidence || !hasExistingPath(evidence))
      issues.push(issue("error", "mobai.proof.evidence_missing", `${platform} needs an existing evidence artifact.`, file));
    if (!provider || /pending/i.test(provider)) {
      issues.push(issue("error", "mobai.proof.provider_correlation_missing", `${platform} needs provider correlation or a concrete n-a reason.`, file));
    } else if (/^(?:n\/?a|n-a|none|not applicable)\b/i.test(provider)) {
      if (!/20\d{2}-\d{2}-\d{2}/.test(provider) || !/[:;-]\s*\S+/.test(provider)) {
        issues.push(
          issue(
            "error",
            "mobai.proof.provider_correlation_reason_missing",
            `${platform} provider correlation marked n-a needs a dated, non-trivial reason.`,
            file,
          ),
        );
      }
    } else if (!hasExistingPath(provider)) {
      issues.push(
        issue(
          "error",
          "mobai.proof.provider_correlation_evidence_missing",
          `${platform} provider correlation needs an existing evidence artifact or a dated n-a reason.`,
          file,
        ),
      );
    }
  }
}

function validateProviderProof(): void {
  const proof = existingText(["operations/PROVIDER_PROOF.md", "operations/operations/PROVIDER_PROOF.md"]);
  if (!proof) {
    issues.push(issue("error", "mobai.proof.provider_ledger_missing", "MobAI readiness needs operations/PROVIDER_PROOF.md.", "operations/PROVIDER_PROOF.md"));
    return;
  }
  const row = proof.text.split(/\r?\n/).find((line) => /^\|\s*MobAI\s*\|/i.test(line));
  if (!row) {
    issues.push(issue("error", "mobai.proof.provider_row_missing", "operations/PROVIDER_PROOF.md needs a MobAI row.", proof.relativePath));
    return;
  }
  const cells = splitRow(row);
  const evidenceCell = cells.at(-2) ?? "";
  if (!/captured|passed|verified/i.test(cells[1] ?? "") || !hasExistingPath(evidenceCell) || hasExistingPath(evidenceCell, ".mob")) {
    issues.push(
      issue(
        "error",
        "mobai.proof.provider_row_unproven",
        "The MobAI provider row needs a captured/passed status and an existing non-.mob output evidence path.",
        proof.relativePath,
      ),
    );
  }
}

function validateTierApproval(selectedTier?: string): void {
  if (!selectedTier || !/^\s*(?:plus|pro)\b/i.test(selectedTier)) return;
  const decisions = existingText(["strategy/TOOL_DECISIONS.md", "operations/strategy/TOOL_DECISIONS.md"]);
  const row = decisions?.text.split(/\r?\n/).find((line) => /^\|\s*MobAI\s*\|/i.test(line));
  if (!row || !/founder\s+(?:approved|confirmed)|approved paid|spend approved/i.test(row)) {
    issues.push(
      issue(
        "error",
        "mobai.proof.paid_tier_approval_missing",
        "MobAI Plus/Pro proof needs founder spend confirmation in strategy/TOOL_DECISIONS.md; Free does not.",
        decisions?.relativePath ?? "strategy/TOOL_DECISIONS.md",
      ),
    );
  }
}

function validateMobFiles(section: string, file: string): void {
  const paths = extractPathCandidates(section).filter((candidate) => candidate.toLowerCase().endsWith(".mob"));
  for (const relative of new Set(paths)) {
    const fullPath = safeProjectPath(relative);
    if (!fullPath || !existsSync(fullPath) || !statSync(fullPath).isFile()) continue;
    const text = readFileSync(fullPath, "utf8");
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (/\brepeat\s+(?:while|until|condition)\b/i.test(line) && !/\bmax(?:_iterations)?\s*[:=]/i.test(line)) {
        issues.push(
          issue(
            "error",
            "mobai.proof.repeat_unbounded",
            "Predicate/condition repeats need an explicit max/max_iterations below the engine default.",
            `${relative}:${index + 1}`,
          ),
        );
      }
      if (/\brepeat\s+\$\{[^}]+\}\s+times\b/i.test(line) && !/counted loop bound[^\n]*validated/i.test(section)) {
        issues.push(
          issue(
            "error",
            "mobai.proof.counted_repeat_bound_unverified",
            "Parameterized counted repeats need a recorded validated bound because the engine does not cap `times`.",
            `${relative}:${index + 1}`,
          ),
        );
      }
    }
    if (/^\s*(?:script|eval)\b/m.test(text)) {
      const scriptAttestation = field(section, "Host-side script safety") ?? "";
      if (/not used/i.test(scriptAttestation)) {
        issues.push(issue("error", "mobai.proof.host_script_attestation_false", `${relative} uses host scripting but readiness says it was not used.`, file));
      }
      if (hasEmbeddedSecret(text)) {
        issues.push(issue("error", "mobai.proof.host_script_secret", `${relative} appears to embed a credential in a compiled MobAI flow.`, relative));
      }
      for (const match of text.matchAll(/^\s*script\s+["']([^"']+)["']/gim)) {
        const referenced = match[1]!;
        if (path.isAbsolute(referenced) || referenced.split(/[\\/]/).includes("..")) {
          issues.push(issue("error", "mobai.proof.host_script_path_unsafe", `${relative} references a host script outside the flow directory.`, relative));
          continue;
        }
        const scriptRelative = path.join(path.dirname(relative), referenced);
        const scriptPath = safeProjectPath(scriptRelative);
        if (!scriptPath || !existsSync(scriptPath) || !statSync(scriptPath).isFile()) {
          issues.push(issue("error", "mobai.proof.host_script_file_missing", `${relative} references missing host script ${referenced}.`, relative));
          continue;
        }
        if (hasEmbeddedSecret(readFileSync(scriptPath, "utf8"))) {
          issues.push(
            issue(
              "error",
              "mobai.proof.host_script_secret",
              `${scriptRelative} appears to embed a credential that MobAI will compile into the flow.`,
              scriptRelative,
            ),
          );
        }
      }
    }
  }
}

function hasEmbeddedSecret(text: string): boolean {
  return /(?:api[_-]?key|access[_-]?token|token|authorization|password|passphrase|client[_-]?secret|private[_-]?key|secret)\s*[:=]\s*["'][^$\s][^"']{7,}["']/i.test(
    text,
  );
}

function existingText(candidates: string[]): { relativePath: string; text: string } | undefined {
  for (const candidate of candidates) {
    const fullPath = path.join(args.root, candidate);
    if (existsSync(fullPath) && statSync(fullPath).isFile()) return { relativePath: candidate, text: readFileSync(fullPath, "utf8") };
  }
  return undefined;
}

function sectionText(text: string, heading: string): string | undefined {
  const match = text.match(new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "im"));
  if (!match || match.index === undefined) return undefined;
  const tail = text.slice(match.index);
  const next = tail.slice(match[0].length).search(/^##\s+/m);
  return next < 0 ? tail : tail.slice(0, match[0].length + next);
}

function field(text: string, label: string): string | undefined {
  return text.match(new RegExp(`^-\\s*${escapeRegex(label)}\\s*:\\s*(.+)$`, "im"))?.[1]?.trim();
}

function requireField(text: string, label: string, pattern: RegExp, code: string, message: string, file: string): void {
  const value = field(text, label);
  if (!value || !pattern.test(value) || /pending/i.test(value)) issues.push(issue("error", code, message, file));
}

function markdownRows(text: string, firstHeader: string): string[][] {
  const lines = text.split(/\r?\n/);
  const header = lines.findIndex((line) => new RegExp(`^\\|\\s*${escapeRegex(firstHeader)}\\s*\\|`, "i").test(line));
  if (header < 0) return [];
  const rows: string[][] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.trim().startsWith("|")) break;
    rows.push(splitRow(line));
  }
  return rows;
}

function splitRow(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function hasExistingPath(text: string, extension?: string): boolean {
  return extractPathCandidates(text).some((candidate) => {
    if (extension && !candidate.toLowerCase().endsWith(extension)) return false;
    const fullPath = safeProjectPath(candidate);
    return Boolean(fullPath && existsSync(fullPath) && statSync(fullPath).isFile());
  });
}

function extractPathCandidates(text: string): string[] {
  const quoted = Array.from(text.matchAll(/`([^`]+\.(?:mob|md|json|log|png|jpe?g|mp4|mov|txt))`/gi)).map((match) => match[1]!);
  const plain = text.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.(?:mob|md|json|log|png|jpe?g|mp4|mov|txt)/gi) ?? [];
  return [...new Set([...quoted, ...plain])];
}

function safeProjectPath(relative: string): string | undefined {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) return undefined;
  return path.join(args.root, relative);
}

function markdownFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && /\.(?:md|yaml|yml)$/i.test(entry.name)) files.push(fullPath);
    }
  };
  visit(root);
  return files;
}

function flagValue(flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
