import { assert, type Harness } from "./_harness.js";
import { classifyAttemptFailure, summarizeAttemptFailure } from "../../../kernel/session/attempt-failure.js";

const CODEX_STDERR = [
  'codex worker exited 1: eon.tech/.well-known/oauth-protected-resource/mcp\\"" })',
  '2026-09-05T20:20:22.050487Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\\"60fps\\"" })',
  '{"type":"error","message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The \'gpt-6-astra\' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.\\"}}"}',
].join("\n");

export function register(harness: Harness): void {
  harness.check("attempt failure: executor error prefixes classify to stable reason codes", () => {
    assert(classifyAttemptFailure(CODEX_STDERR) === "worker.runtime_unavailable", "an auth or version failure classifies as runtime unavailable");
    assert(classifyAttemptFailure("claude worker exited 2: segmentation fault") === "worker.exited", "an unexplained non-zero exit stays worker.exited");
    assert(classifyAttemptFailure("codex worker exceeded 300s TTL") === "worker.timeout", "TTL expiry classifies as timeout");
    assert(
      classifyAttemptFailure("worker exited successfully but declared output is missing: research/RESEARCH.md") === "worker.output_missing",
      "a missing declared output classifies as output_missing",
    );
    assert(
      classifyAttemptFailure("workspace changed outside declared source/output scope: control/control.json") === "worker.scope_violation",
      "an undeclared workspace change classifies as scope_violation",
    );
    assert(classifyAttemptFailure("worker knowledge receipt rejected: missing reference") === "worker.receipt_rejected", "a rejected receipt classifies");
    assert(classifyAttemptFailure(undefined) === "attempt.error" && classifyAttemptFailure("") === "attempt.error", "an absent error is attempt.error");
  });

  harness.check("attempt failure: the summary is one sanitized line that keeps the worker's most specific message", () => {
    const summary = summarizeAttemptFailure(CODEX_STDERR);
    assert(!summary.includes("\n"), "summary must be a single line");
    assert(summary.startsWith("codex worker exited 1:"), `summary must keep the executor prefix: ${summary}`);
    assert(summary.includes("requires a newer version of Codex"), `summary must surface the model/version message: ${summary}`);
    assert(summary.length <= 240, "summary must be capped");
    const redacted = summarizeAttemptFailure(
      'claude worker exited 1: Authorization: Bearer sk-abcdefghijklmnop1234 api_key=abc123secret\n{"message":"token rejected"}',
    );
    assert(!redacted.includes("sk-abcdefghijklmnop1234") && !redacted.includes("abc123secret"), `secrets must be redacted: ${redacted}`);
    assert(summarizeAttemptFailure(undefined) === "The attempt failed without a recorded error.", "an absent error has a fixed summary");
  });
}
