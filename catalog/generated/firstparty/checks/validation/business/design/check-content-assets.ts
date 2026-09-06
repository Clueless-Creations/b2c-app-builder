#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  asArray,
  asString,
  getPath,
  isRecord,
  issue,
  loadProjectState,
  missingPhraseCode,
  parseCliArgs,
  readText,
  reportAndExit,
} from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;

function firstExistingText(candidates: string[]): { relativePath: string; text: string } | undefined {
  for (const candidate of candidates) {
    const text = readText(args.root, candidate);
    if (text) {
      return { relativePath: candidate, text };
    }
  }
  return undefined;
}

function existsAny(candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(path.join(args.root, candidate)));
}

function includes(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

function hasFallbackApproval(text: string): boolean {
  return /\b(founder approval|founder-approved|approved fallback|fallback approved|blocked waiting for access|stop for founder approval|requires founder approval)\b/i.test(
    text,
  );
}

function hasLicenseStatus(text: string): boolean {
  return /\b(remotion license|license status|commercial use|company license|license eligibility|founder approval before commercial)\b/i.test(text);
}

function parseManifest(relativePath: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(issue("error", "content_assets.manifest.invalid_json", `content asset manifest is invalid JSON: ${message}`, relativePath));
    return undefined;
  }
}

function manifestAssets(manifest: unknown): unknown[] {
  if (Array.isArray(manifest)) {
    return manifest;
  }
  if (isRecord(manifest)) {
    return asArray(manifest.assets);
  }
  return [];
}

function requireStringField(asset: Record<string, unknown>, field: string, index: number, file: string): void {
  if (!asString(asset[field])?.trim()) {
    issues.push(issue("error", `content_assets.manifest.assets.${index}.${field}.missing`, `Manifest asset ${index} must include ${field}.`, file));
  }
}

function requireArrayField(asset: Record<string, unknown>, field: string, index: number, file: string): void {
  const values = asArray(asset[field])
    .map(asString)
    .filter((item): item is string => Boolean(item?.trim()));
  if (values.length === 0) {
    issues.push(issue("error", `content_assets.manifest.assets.${index}.${field}.missing`, `Manifest asset ${index} must include non-empty ${field}.`, file));
  }
}

function maybeRequireDoneOutputs(asset: Record<string, unknown>, index: number, file: string): void {
  const status = asString(asset.status)?.toLowerCase();
  if (!status || !["done", "ready", "production", "approved"].includes(status)) {
    return;
  }
  for (const output of asArray(asset.outputs)
    .map(asString)
    .filter((item): item is string => Boolean(item?.trim()))) {
    if (/^[a-z]+:/i.test(output) || output.startsWith("#")) {
      continue;
    }
    if (!existsSync(path.join(args.root, output))) {
      issues.push(
        issue(
          "error",
          `content_assets.manifest.assets.${index}.output_missing`,
          `Manifest asset ${index} is marked ${status} but output path does not exist: ${output}.`,
          file,
        ),
      );
    }
  }
}

const contentStatus = state ? asString(getPath(state, "lanes.content_assets.status"))?.toLowerCase() : undefined;
const skip = contentStatus === "not_needed" || contentStatus === "deferred";
const markdown = firstExistingText(["CONTENT_ASSETS.md", "growth/content-assets/CONTENT_ASSETS.md"]);
const htmlPath = existsAny(["content-assets.html", "growth/content-assets/content-assets.html"]);
const manifestText = firstExistingText(["growth/content-assets/manifest.json", "manifest.json"]);

if (!skip && !markdown) {
  issues.push(
    issue(
      "error",
      "content_assets.markdown_missing",
      "CONTENT_ASSETS.md is required when rendered/generated launch content assets are in scope.",
      "CONTENT_ASSETS.md",
    ),
  );
}

if (markdown) {
  const requiredPhrases = [
    "Route Matrix",
    "Higgsfield",
    "Remotion",
    "Founder approval",
    "License status",
    "Source Inputs",
    "Composition Manifest",
    "Render Commands",
    "Claim Review",
    "Output Registry",
    "Public Use Gates",
  ];
  for (const phrase of requiredPhrases) {
    if (!includes(markdown.text, phrase)) {
      issues.push(issue("error", missingPhraseCode("content_assets", phrase), `CONTENT_ASSETS.md should include ${phrase}.`, markdown.relativePath));
    }
  }

  const impliesHiggsfieldFallback =
    /\b(higgsfield unavailable|higgsfield missing|higgsfield blocked|no higgsfield|higgsfield fallback|replace higgsfield|replacing higgsfield|remotion fallback|fallback from higgsfield)\b/i.test(
      markdown.text,
    );
  if (impliesHiggsfieldFallback && !hasFallbackApproval(markdown.text)) {
    issues.push(
      issue(
        "error",
        "content_assets.higgsfield_fallback_unapproved",
        "Higgsfield fallback language is present, but founder approval or blocked-access state is not recorded.",
        markdown.relativePath,
      ),
    );
  }

  if (/\bremotion\b/i.test(markdown.text) && !hasLicenseStatus(markdown.text)) {
    issues.push(
      issue(
        "error",
        "content_assets.remotion_license_unchecked",
        "Remotion is present, but license status or commercial-use approval is not recorded.",
        markdown.relativePath,
      ),
    );
  }

  if (/\b(TODO|TBD|unknown|placeholder)\b/i.test(markdown.text) && /\b(status:\s*done|launch-ready|complete|production-ready)\b/i.test(markdown.text)) {
    issues.push(
      issue(
        "error",
        "content_assets.placeholder_complete",
        "CONTENT_ASSETS.md cannot claim done/complete while placeholder language remains.",
        markdown.relativePath,
      ),
    );
  }
}

if (!skip && !htmlPath) {
  issues.push(
    issue("warning", "content_assets.html_missing", "content-assets.html should render the media route and output proof board.", "content-assets.html"),
  );
}

if (!skip && !manifestText) {
  issues.push(
    issue(
      "error",
      "content_assets.manifest_missing",
      "growth/content-assets/manifest.json is required to make rendered/generated asset outputs machine-readable.",
      "growth/content-assets/manifest.json",
    ),
  );
}

if (manifestText) {
  const parsed = parseManifest(manifestText.relativePath, manifestText.text);
  const assets = manifestAssets(parsed);
  if (isRecord(parsed) && "assets" in parsed && !Array.isArray(parsed.assets)) {
    issues.push(issue("error", "content_assets.manifest.assets.invalid", "manifest.assets must be an array.", manifestText.relativePath));
  }
  if (assets.length === 0 && contentStatus === "succeeded") {
    issues.push(
      issue("error", "content_assets.manifest.assets.empty_done", "content asset lane is done but manifest contains no assets.", manifestText.relativePath),
    );
  }

  for (const [index, asset] of assets.entries()) {
    if (!isRecord(asset)) {
      issues.push(issue("error", `content_assets.manifest.assets.${index}.invalid`, `Manifest asset ${index} must be an object.`, manifestText.relativePath));
      continue;
    }

    for (const field of ["asset_id", "surface", "route", "status", "license_status"]) {
      requireStringField(asset, field, index, manifestText.relativePath);
    }
    for (const field of ["inputs", "outputs", "truth_constraints", "approvals"]) {
      requireArrayField(asset, field, index, manifestText.relativePath);
    }

    const assetStatus = asString(asset.status)?.toLowerCase() ?? "";
    const digestRequired =
      ["done", "ready", "production", "approved"].includes(assetStatus) ||
      Boolean(asString(asset.source_job_id)?.trim()) ||
      asArray(asset.outputs)
        .map(asString)
        .filter((value): value is string => Boolean(value?.trim()))
        .some((output) => /^[a-z][a-z0-9+.-]*:\/\//i.test(output) || (!/^[a-z]+:/i.test(output) && existsSync(path.join(args.root, output))));
    const inputDigests = isRecord(asset.input_digests) ? asset.input_digests : {};
    for (const input of asArray(asset.inputs)
      .map(asString)
      .filter((value): value is string => Boolean(value?.trim()))) {
      if (!digestRequired) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(input) || input.startsWith("#")) continue;
      const absoluteInput = path.join(args.root, input);
      if (!existsSync(absoluteInput)) {
        issues.push(
          issue(
            "error",
            `content_assets.manifest.assets.${index}.input_missing`,
            `Manifest asset ${index} input does not exist: ${input}.`,
            manifestText.relativePath,
          ),
        );
        continue;
      }
      const expectedDigest = createHash("sha256").update(readFileSync(absoluteInput)).digest("hex");
      const recordedDigest = asString(inputDigests[input]);
      if (!recordedDigest) {
        issues.push(
          issue(
            "error",
            `content_assets.manifest.assets.${index}.input_digest.missing`,
            `Manifest asset ${index} must record input_digests["${input}"] so later design, copy, feature, or price changes make the generated output stale deterministically.`,
            manifestText.relativePath,
          ),
        );
      } else if (recordedDigest !== expectedDigest) {
        issues.push(
          issue(
            "error",
            `content_assets.manifest.assets.${index}.input_digest.stale`,
            `Manifest asset ${index} was generated from a stale digest for ${input}. Regenerate it and mark the previous output superseded.`,
            manifestText.relativePath,
          ),
        );
      }
    }

    const route = asString(asset.route)?.toLowerCase();
    if (route === "remotion") {
      requireStringField(asset, "composition_id", index, manifestText.relativePath);
      requireStringField(asset, "dimensions", index, manifestText.relativePath);
      requireStringField(asset, "render_proof", index, manifestText.relativePath);
      const renderProof = asString(asset.render_proof) ?? "";
      if (!/\bremotion\b/i.test(renderProof)) {
        issues.push(
          issue(
            "error",
            `content_assets.manifest.assets.${index}.render_proof.not_remotion`,
            `Manifest asset ${index} uses Remotion but render_proof does not include a Remotion render/still command.`,
            manifestText.relativePath,
          ),
        );
      }
      if (!hasLicenseStatus(asString(asset.license_status) ?? "")) {
        issues.push(
          issue(
            "error",
            `content_assets.manifest.assets.${index}.license_status.unchecked`,
            `Manifest asset ${index} uses Remotion but license_status does not record Remotion commercial-use status.`,
            manifestText.relativePath,
          ),
        );
      }
    }

    // UGC-family assets (Marketing Studio ugc/ugc_how_to/ugc_unboxing/product_review
    // modes, or the Recipe 7 Seedance believable-person path) carry gates the
    // knowledge layer alone cannot enforce: a script that survived the judge panel
    // (ugc-creator-engine.md, Script Bank And Judge Panel) and a passing human
    // believability result before any done-tier status. asset_id is excluded from
    // the signal on purpose — a name like "founder-ugc-ad" is not a mode claim.
    // Provider text alone cannot be trusted either: a Recipe 7 route such as
    // seedance_2_5 carries no "ugc" token, so every generated-video asset must
    // classify itself via asset_kind. Silence is not a classification.
    const renderProofText = asString(asset.render_proof) ?? "";
    const assetKind = asString(asset.asset_kind)?.trim().toLowerCase() ?? "";
    const looksUgc = /\bugc(?:_how_to|_unboxing)?\b|\bproduct_review\b/i.test([route, asString(asset.mode) ?? "", renderProofText, assetKind].join(" "));
    const KNOWN_VIDEO_ASSET_KINDS = ["ugc", "product_ad", "b_roll", "demo", "app_preview"];
    const isGeneratedVideo = /\bseedance|marketing_studio|cinema_studio|\bveo\b/i.test(`${route} ${renderProofText}`);

    // The brief requirement keys on generation, not on one provider's name: a
    // bare seedance_2_5 route generates just as much UI-bearing video as a
    // higgsfield_* route does.
    if ((route && (route.includes("higgsfield") || route.includes("marketing_studio"))) || isGeneratedVideo) {
      const promptBrief = asString(asset.prompt_brief) ?? "";
      if (!promptBrief.trim()) {
        issues.push(
          issue(
            "error",
            `content_assets.manifest.assets.${index}.prompt_brief.missing`,
            `Manifest asset ${index} uses a generated-media route but records no prompt_brief carrying the DESIGN.md tokens used for generation. Generating without the DESIGN.md brief is a named failure mode.`,
            manifestText.relativePath,
          ),
        );
      } else if (!/design\.md|design system|design token|palette|typography/i.test(promptBrief)) {
        issues.push(
          issue(
            "warning",
            `content_assets.manifest.assets.${index}.prompt_brief.no_design_reference`,
            `Manifest asset ${index} prompt_brief should reference the DESIGN.md tokens (palette, typography, banned aesthetics) carried into the generation prompt.`,
            manifestText.relativePath,
          ),
        );
      }
    }
    if (isGeneratedVideo && !KNOWN_VIDEO_ASSET_KINDS.includes(assetKind)) {
      issues.push(
        issue(
          "error",
          `content_assets.manifest.assets.${index}.asset_kind.missing_for_generated_video`,
          `Manifest asset ${index} is a generated video but declares no recognized asset_kind (one of: ${KNOWN_VIDEO_ASSET_KINDS.join(", ")}). "ugc" activates the script/judge/believability gates; a believable-person clip must not hide behind a provider route name.`,
          manifestText.relativePath,
        ),
      );
    }
    if (assetKind === "ugc" || looksUgc) {
      const ugcStatus = asString(asset.status)?.toLowerCase() ?? "";
      const ugcDoneTier = ["done", "ready", "production", "approved"].includes(ugcStatus);
      // Generation evidence activates the gate even at draft status — otherwise a
      // planned template entry and a spent clip look identical. Evidence is an
      // output file on disk, a remote output URL, or a provider job id: a
      // provider-backed generation spends credits before any file is downloaded.
      const generationOccurred =
        Boolean((asString(asset.source_job_id) ?? "").trim()) ||
        asArray(asset.outputs)
          .map(asString)
          .filter((item): item is string => Boolean(item?.trim()))
          .some(
            (output) =>
              /^[a-z][a-z0-9+.-]*:\/\//i.test(output) || (!/^[a-z]+:/i.test(output) && !output.startsWith("#") && existsSync(path.join(args.root, output))),
          );
      const scriptGateActive = ugcDoneTier || generationOccurred;
      const scriptGateReason = ugcDoneTier ? `status "${ugcStatus}"` : "generated output on disk";
      const scriptId = (asString(asset.script_id) ?? "").trim();
      if (!scriptId) {
        issues.push(
          issue(
            "error",
            `content_assets.manifest.assets.${index}.script_id.missing_for_ugc`,
            `Manifest asset ${index} is a UGC-family generation but records no script_id pointing into ugc/script-bank.md. UGC generation without a judged script is a named failure mode.`,
            manifestText.relativePath,
          ),
        );
      } else {
        // script_id must resolve to a durable script-bank row: `<path>#<format-id>`.
        // A nonempty string that names no recorded script is not a script gate, and
        // a token found in an unrelated file is not a script bank.
        const hashIndex = scriptId.indexOf("#");
        const bankFile = hashIndex >= 0 ? scriptId.slice(0, hashIndex).trim() : "";
        const anchorToken =
          hashIndex >= 0
            ? (scriptId
                .slice(hashIndex + 1)
                .trim()
                .split(/\s+/)[0] ?? "")
            : "";
        if (!bankFile || !anchorToken) {
          issues.push(
            issue(
              "error",
              `content_assets.manifest.assets.${index}.script_id.unparseable`,
              `Manifest asset ${index} script_id must be "<script-bank path>#<format-id>" (example: ugc/script-bank.md#FMT-001), got: ${scriptId}.`,
              manifestText.relativePath,
            ),
          );
        } else if (!/script-bank\.md$/i.test(bankFile)) {
          issues.push(
            issue(
              "error",
              `content_assets.manifest.assets.${index}.script_id.bank_not_script_bank`,
              `Manifest asset ${index} script_id points at ${bankFile}, which is not a script-bank.md file. A format id found in an unrelated file is not a recorded script.`,
              manifestText.relativePath,
            ),
          );
        } else {
          // The bank must live inside the audited workspace: a traversal path or a
          // symlink pointing at another checkout would make the audit depend on
          // host files outside this business.
          const lexicalRoot = path.resolve(args.root);
          const lexicalBank = path.resolve(args.root, bankFile);
          const insideLexically = lexicalBank === lexicalRoot || lexicalBank.startsWith(lexicalRoot + path.sep);
          if (!insideLexically) {
            issues.push(
              issue(
                "error",
                `content_assets.manifest.assets.${index}.script_id.bank_outside_workspace`,
                `Manifest asset ${index} script_id resolves outside the audited workspace: ${bankFile}. The script bank must live inside this business.`,
                manifestText.relativePath,
              ),
            );
          } else if (!existsSync(lexicalBank)) {
            issues.push(
              issue(
                "error",
                `content_assets.manifest.assets.${index}.script_id.bank_missing`,
                `Manifest asset ${index} script_id points at ${bankFile}, but that script bank does not exist. Record the judged script before generation spend.`,
                manifestText.relativePath,
              ),
            );
          } else {
            const realRoot = realpathSync(lexicalRoot);
            const realBank = realpathSync(lexicalBank);
            if (!(realBank === realRoot || realBank.startsWith(realRoot + path.sep))) {
              issues.push(
                issue(
                  "error",
                  `content_assets.manifest.assets.${index}.script_id.bank_outside_workspace`,
                  `Manifest asset ${index} script_id resolves outside the audited workspace via a symlink: ${bankFile}. The script bank must live inside this business.`,
                  manifestText.relativePath,
                ),
              );
            } else {
              // The row is the durable evidence: the Format ID cell must equal the
              // id, and once the asset reaches a done-tier status OR generation
              // has already happened, the row itself must hold a surviving,
              // non-placeholder script — a resolvable pointer to a pending
              // template row is not a script gate either.
              const bankRow = (readText(args.root, bankFile) ?? "").split(/\r?\n/).find((line) => {
                if (!line.trimStart().startsWith("|")) {
                  return false;
                }
                return (line.split("|")[1] ?? "").trim() === anchorToken;
              });
              if (!bankRow) {
                issues.push(
                  issue(
                    "error",
                    `content_assets.manifest.assets.${index}.script_id.anchor_unrecorded`,
                    `Manifest asset ${index} script_id names ${anchorToken}, but ${bankFile} has no table row whose Format ID cell is ${anchorToken}. The script bank row is the durable evidence the panel ran.`,
                    manifestText.relativePath,
                  ),
                );
              } else if (scriptGateActive) {
                const cells = bankRow.split("|").map((cell) => cell.trim());
                const hookCell = cells[2] ?? "";
                const scriptCell = cells[3] ?? "";
                const rowVerdict = cells[4] ?? "";
                if (!hookCell || !scriptCell || /\breplace with\b/i.test(`${hookCell} ${scriptCell}`)) {
                  issues.push(
                    issue(
                      "error",
                      `content_assets.manifest.assets.${index}.script_id.row_placeholder`,
                      `Manifest asset ${index} has ${scriptGateReason} but the referenced ${anchorToken} row still holds placeholder hook/script text. The panel runs before generation spend; record the real surviving script.`,
                      manifestText.relativePath,
                    ),
                  );
                } else if (!/^(passed|survived)\b/i.test(rowVerdict)) {
                  issues.push(
                    issue(
                      "error",
                      `content_assets.manifest.assets.${index}.script_id.row_not_passing`,
                      `Manifest asset ${index} has ${scriptGateReason} but the ${anchorToken} row's Judge verdict cell does not start with "passed" or "survived". The bank row and the manifest verdict must agree.`,
                      manifestText.relativePath,
                    ),
                  );
                }
              }
            }
          }
        }
      }
      const judgeVerdict = asString(asset.judge_verdict) ?? "";
      if (!judgeVerdict.trim()) {
        issues.push(
          issue(
            "error",
            `content_assets.manifest.assets.${index}.judge_verdict.missing_for_ugc`,
            `Manifest asset ${index} is a UGC-family generation but records no judge_verdict. The script must survive the judge panel (ugc-creator-engine.md) before generation spend; record "passed — <detail>" or "survived — <detail>".`,
            manifestText.relativePath,
          ),
        );
      } else if (/\b(failed|rejected)\b/i.test(judgeVerdict)) {
        issues.push(
          issue(
            "error",
            `content_assets.manifest.assets.${index}.judge_verdict.failed`,
            `Manifest asset ${index} records a failing judge_verdict. A script that failed the panel does not generate; this asset should not exist. Kill the asset or re-run the panel on a rewrite.`,
            manifestText.relativePath,
          ),
        );
      }
      if (scriptGateActive) {
        // Prefix parse, not substring search: "not passed — ..." must not read as
        // a pass. Active at done-tier statuses AND once generation has happened —
        // the panel runs before spend, so a spent draft needs a passing verdict too.
        if (!/^\s*(passed|survived)\b/i.test(judgeVerdict)) {
          issues.push(
            issue(
              "error",
              `content_assets.manifest.assets.${index}.judge_verdict.not_passing`,
              `Manifest asset ${index} has ${scriptGateReason} but judge_verdict does not start with "passed" or "survived". The panel verdict comes before generation spend; record "passed — <detail>" or "survived — <detail>".`,
              manifestText.relativePath,
            ),
          );
        }
      }
      if (ugcDoneTier) {
        const believability = asString(asset.believability) ?? "";
        if (!believability.trim() || /\bpending\b/i.test(believability)) {
          issues.push(
            issue(
              "error",
              `content_assets.manifest.assets.${index}.believability.missing_for_ugc`,
              `Manifest asset ${index} has status "${ugcStatus}" but records no completed believability result. One real human who did not make the clip must watch it before a done-tier status (UGC Realism Prompt Structure, Recipe 7).`,
              manifestText.relativePath,
            ),
          );
        } else if (/\bfailed\b/i.test(believability)) {
          issues.push(
            issue(
              "error",
              `content_assets.manifest.assets.${index}.believability.failed`,
              `Manifest asset ${index} has status "${ugcStatus}" but the believability result records a failure. A clip identified as AI or as an ad goes back to the judge panel, not to a done-tier status.`,
              manifestText.relativePath,
            ),
          );
        } else if (!/^\s*passed\b/i.test(believability)) {
          issues.push(
            issue(
              "error",
              `content_assets.manifest.assets.${index}.believability.not_passing`,
              `Manifest asset ${index} has status "${ugcStatus}" but the believability result does not start with "passed". Record "passed — <detail>" or "failed — <detail>"; completion alone is not a pass, and a negated pass is not a pass.`,
              manifestText.relativePath,
            ),
          );
        }
      }
    }

    maybeRequireDoneOutputs(asset, index, manifestText.relativePath);
  }
}

reportAndExit("Content assets packet check", issues);
