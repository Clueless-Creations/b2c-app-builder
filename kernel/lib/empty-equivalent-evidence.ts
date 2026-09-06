/**
 * Shared scalar normalization for evidence cells.
 *
 * Founder Waiver and taste-gate fields must not treat decorated
 * or spaced empty tokens as authored reasons. Keep the match on the whole
 * cell after decoration strip, not on a substring of a real sentence.
 */

const EMPTY_EQUIVALENT = /^(?:none|n\/a|n a|na|not applicable|unknown|no reason)$/iu;

export function normalizeEvidenceScalar(value: string): string {
  let text = value;
  for (let pass = 0; pass < 3; pass += 1) {
    text = text.replace(/`([^`\r\n]*)`/gu, "$1");
    text = text.replace(/\*\*([^*\r\n]*)\*\*/gu, "$1");
    text = text.replace(/__([^_\r\n]*)__/gu, "$1");
    text = text.replace(/(?<!\*)\*([^*\r\n]+)\*(?!\*)/gu, "$1");
    text = text.replace(/(?<!_)_([^_\r\n]+)_(?!_)/gu, "$1");
    text = text.replace(/~~([^~\r\n]+)~~/gu, "$1");
  }
  return text
    .replace(/[\u2018\u2019\u201C\u201D"'`]/gu, "")
    .replace(/[.:;!?()[\]{}]/gu, " ")
    .replace(/[—–-]+/gu, " ")
    .replace(/\s*\/\s*/gu, "/")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function isEmptyEquivalentEvidenceValue(value: string): boolean {
  const normalized = normalizeEvidenceScalar(value);
  if (normalized.length === 0) return true;
  return EMPTY_EQUIVALENT.test(normalized);
}
