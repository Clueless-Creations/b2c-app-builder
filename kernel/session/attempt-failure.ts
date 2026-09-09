/**
 * Legible attempt failures (ARCH-11): a failed worker attempt keeps its raw error inside run state,
 * while operators and public evidence receive a stable classification and a sanitized summary.
 * Classification reads only the executor's own error prefixes; it never re-derives worker intent.
 */
export const attemptFailureCodes = [
  "worker.runtime_unavailable",
  "worker.exited",
  "worker.timeout",
  "worker.output_missing",
  "worker.scope_violation",
  "worker.receipt_rejected",
  "attempt.error",
] as const;
export type AttemptFailureCode = (typeof attemptFailureCodes)[number];

const RUNTIME_UNAVAILABLE = /(auth|log[ -]?in|api[_ -]?key|unauthori[sz]ed|credential|newer version|upgrade|not logged|ENOENT|not found|spawn|invalid_grant)/i;

export function classifyAttemptFailure(error: string | undefined): AttemptFailureCode {
  const text = error ?? "";
  if (!text.trim()) return "attempt.error";
  if (/exceeded \d+s TTL/.test(text)) return "worker.timeout";
  if (/declared output is missing|no path binding for declared output|required worker task artifact|output is unchanged from before dispatch/.test(text))
    return "worker.output_missing";
  if (/changed outside declared source\/output scope|task input inventory changed|read-only task input changed|binding\.verifier_mutated_workspace/.test(text))
    return "worker.scope_violation";
  if (/knowledge receipt rejected/.test(text)) return "worker.receipt_rejected";
  if (/worker exited \d+/.test(text)) return RUNTIME_UNAVAILABLE.test(text) ? "worker.runtime_unavailable" : "worker.exited";
  return "attempt.error";
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|rk|pk|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[^\s"'\\)]+/gi,
  /(?:api[_-]?key|token|secret|password)(\s*[=:]\s*)[^\s"'&]+/gi,
];

function redact(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, (match, separator?: string) => (separator ? `${match.slice(0, match.indexOf(separator))}${separator}[redacted]` : "[redacted]"));
    pattern.lastIndex = 0;
  }
  const home = process.env.HOME?.trim();
  if (home && home.length > 1) out = out.split(home).join("~");
  return out;
}

/** Public-boundary redaction: secrets, home paths, emails, control characters, and other host prefixes. */
export function redactSensitiveText(text: string): string {
  let out = redact(text);
  out = out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted]");
  out = out.replace(/\/(?:Users|home)\/[^\s"'\\]+/g, "~");
  return out;
}

/** One sanitized line: the executor prefix plus the most specific message the worker printed. */
export function summarizeAttemptFailure(error: string | undefined, maxLength = 240): string {
  const text = (error ?? "").trim();
  if (!text) return "The attempt failed without a recorded error.";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const head = lines[0] ?? text;
  const prefix = head.includes(":") && /worker exited|TTL|missing|changed|rejected/.test(head) ? head.slice(0, head.indexOf(":") + 1) : "";
  let specific = "";
  const messages = [...text.matchAll(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]!);
  if (messages.length) {
    const last = messages.at(-1)!;
    try {
      specific = String(JSON.parse(`"${last}"`));
    } catch {
      specific = last;
    }
    const nested = [...specific.matchAll(/\\?"message\\?"\s*:\s*\\?"((?:[^"\\]|\\.)*?)\\?"/g)].map((match) => match[1]!);
    if (nested.length) specific = nested.at(-1)!.replace(/\\"/g, '"');
  }
  const body = specific || head.slice(prefix.length).trim() || head;
  const summary = redact(`${prefix ? `${prefix} ` : ""}${body}`.replace(/\s+/g, " ").trim());
  return summary.length > maxLength ? `${summary.slice(0, maxLength - 1)}…` : summary;
}
