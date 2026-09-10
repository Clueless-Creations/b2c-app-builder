import { createHash } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { boundedFileBytes } from "../lib/bounded-file.js";
import {
  FOUNDER_BRIEF_ARTIFACT,
  FOUNDER_BRIEF_MAX_BYTES,
  FOUNDER_CONSTRAINT_SLICE_MAX,
  LAUNCH_PROGRAM_ARTIFACT,
  type FounderBriefSourceIntent,
} from "../../contracts/public-api/contract.js";

export type FounderBriefRead =
  { ok: true; bytes: Buffer; text: string } | { ok: false; code: "missing" | "unreadable" | "oversized" | "not_utf8" | "empty"; byteLength?: number };

export function founderBriefSourceIntent(bytes: Buffer): FounderBriefSourceIntent {
  return {
    artifact: FOUNDER_BRIEF_ARTIFACT,
    characterCount: bytes.toString("utf8").length,
    byteLength: bytes.length,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    derivedView: LAUNCH_PROGRAM_ARTIFACT,
    derivedViewEmbedsSource: false,
  };
}

export function readFounderBriefFile(file: string): FounderBriefRead {
  let stat;
  try {
    stat = lstatSync(file);
  } catch (error) {
    return { ok: false, code: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable" };
  }
  if (!stat.isFile() || stat.isSymbolicLink()) return { ok: false, code: "unreadable" };
  if (stat.size > FOUNDER_BRIEF_MAX_BYTES) return { ok: false, code: "oversized", byteLength: stat.size };
  if (stat.size === 0) return { ok: false, code: "empty" };
  let bytes: Buffer;
  try {
    bytes = boundedFileBytes(file, FOUNDER_BRIEF_MAX_BYTES);
  } catch {
    return { ok: false, code: "unreadable" };
  }
  if (!isUtf8(bytes)) return { ok: false, code: "not_utf8" };
  const text = bytes.toString("utf8");
  if (text.length === 0) return { ok: false, code: "empty" };
  return { ok: true, bytes, text };
}

export function writeFounderIntake(input: { target: string; slug: string; mandate: string }): FounderBriefSourceIntent {
  const bytes = Buffer.from(input.mandate, "utf8");
  if (bytes.length > FOUNDER_BRIEF_MAX_BYTES) throw new Error("business.founder_brief_oversized");
  if (bytes.length === 0) throw new Error("business.founder_brief_empty");
  const sourceIntent = founderBriefSourceIntent(bytes);
  mkdirSync(path.join(input.target, "operations"), { recursive: true });
  writeFileSync(path.join(input.target, FOUNDER_BRIEF_ARTIFACT), bytes);
  writeFileSync(path.join(input.target, LAUNCH_PROGRAM_ARTIFACT), launchProgramProjection(input.slug, sourceIntent, input.mandate), "utf8");
  return sourceIntent;
}

/** Prefix of the canonical brief for derived surfaces. Short mandates travel whole; long briefs stay truncated. */
export function founderConstraintSlice(mandate: string): { slice: string; truncated: boolean } {
  if (mandate.length <= FOUNDER_CONSTRAINT_SLICE_MAX) return { slice: mandate, truncated: false };
  return { slice: `${mandate.slice(0, FOUNDER_CONSTRAINT_SLICE_MAX - 1)}…`, truncated: true };
}

function launchProgramProjection(slug: string, sourceIntent: FounderBriefSourceIntent, mandate: string): string {
  const { slice, truncated } = founderConstraintSlice(mandate);
  return [
    "# Complete consumer-business mandate",
    "",
    "Status: planning; no execution or external authority granted.",
    "",
    "## Mandate",
    `Canonical founder brief: \`${sourceIntent.artifact}\`.`,
    "That file is source intent and provenance. It is not accepted product or design truth.",
    "`product.yaml` and `DESIGN.md` remain the accepted authorities after acceptance.",
    "This derived record quotes a bounded founder-constraint slice. It is not the only mandate owner.",
    "",
    `- Characters: ${sourceIntent.characterCount}`,
    `- Bytes: ${sourceIntent.byteLength}`,
    `- Digest: ${sourceIntent.digest}`,
    "- Derived view embeds source: no",
    "",
    "## Founder constraints",
    "",
    `Provenance: \`${sourceIntent.artifact}\` (${sourceIntent.digest}, ${sourceIntent.characterCount} characters).`,
    truncated
      ? "This slice is truncated active context. Open the founder brief for the remainder."
      : "This slice is the complete founder brief.",
    "",
    slice,
    "",
    "## Scope",
    "Full accepted consumer business. A research pass or internal simulator preview is not completion.",
    "",
    "## Program",
    "workflow.orchestration.full-launch-program -> existing catalog dependencies -> workflow.orchestration.full-launch-closeout",
    "",
    "## Identity",
    `Workspace ID: ${slug}. This is a provisional research identity, not acceptance of a product name.`,
    "",
    "## Continuation",
    "Persist research as it is gathered. Independently review and accept the product, then initialize the existing complete-business recipe. Follow the active planner and evidence through closeout.",
    "",
    "## Authority",
    "Retain founder authority for protected actions. This document grants none. Missing authority is a named hold, never permission to remove required work.",
    "",
  ].join("\n");
}
