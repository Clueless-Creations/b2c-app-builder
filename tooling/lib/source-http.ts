/** Bounded source reads. Credentials are never attached to a source request. */
export interface SourceHttpOptions {
  fetch?: typeof globalThis.fetch;
  env?: Partial<Pick<NodeJS.ProcessEnv, "GH_TOKEN" | "GITHUB_TOKEN">>;
  timeoutMs?: number;
  maxBytes?: number;
}

export class SourceHttpError extends Error {
  constructor(
    readonly code: "invalid_url" | "request_failed" | "http_status" | "timeout" | "body_limit" | "invalid_text",
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "SourceHttpError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_BYTES = 10 * 1024 * 1024;

function invalidUrl(): never {
  throw new SourceHttpError("invalid_url", "Source must use a valid HTTPS URL without credentials or an unexpected private-content path.");
}

function sourceDestination(input: string): URL {
  let url: URL;
  try {
    if (typeof input !== "string" || input.length > 8192 || input !== input.trim() || /[\\\u0000-\u0020\u007f]/u.test(input)) invalidUrl();
    url = new URL(input);
  } catch {
    return invalidUrl();
  }
  if (url.protocol !== "https:" || url.username || url.password) invalidUrl();
  return url;
}

/** Do not print response errors or requested paths: either can contain credentials. */
export function sourceHttpFailure(error: unknown): string {
  return error instanceof SourceHttpError ? error.message : "Source request failed.";
}

export function redactSourceSecrets(value: string, env: SourceHttpOptions["env"] = process.env): string {
  let result = value;
  for (const raw of [env?.GH_TOKEN, env?.GITHUB_TOKEN]) {
    for (const token of new Set([raw, raw?.trim()])) {
      if (token) result = result.split(token).join("[redacted]").split(encodeURIComponent(token)).join("[redacted]");
    }
  }
  return result;
}

/** Keep source identity in reports while removing supplied credentials and token values. */
export function sourceReportUrl(input: string, env: SourceHttpOptions["env"] = process.env): string {
  let result: string;
  try {
    const url = new URL(input);
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const name of [...url.searchParams.keys()]) {
      if (/token|secret|key|password|signature|credential|authorization|code/iu.test(name)) url.searchParams.set(name, "[redacted]");
    }
    result = url.href;
  } catch {
    return "[invalid source URL]";
  }
  return redactSourceSecrets(result, env);
}

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.min(Math.floor(value!), maximum) : fallback;
}

function cancel(body: { cancel: () => Promise<unknown> } | undefined | null): void {
  try {
    void body?.cancel().catch(() => undefined);
  } catch {
    /* Cancellation must not replace a safe error. */
  }
}

export async function readSourceText(input: string, options: SourceHttpOptions = {}): Promise<{ text: string; httpStatus: 200 }> {
  const destination = sourceDestination(input);
  const headers: Record<string, string> = { "user-agent": "b2c-source-reader/1.0", accept: "text/html,application/json,text/plain,*/*" };
  const timeoutMs = bounded(options.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const maxBytes = bounded(options.maxBytes, DEFAULT_MAX_BYTES, MAX_BYTES);
  const deadlineAt = Date.now() + timeoutMs;
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = () => new SourceHttpError("timeout", "Source request exceeded its total deadline.");
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(timeoutError());
      controller.abort();
      cancel(reader);
    }, timeoutMs);
  });
  try {
    const request = (options.fetch ?? globalThis.fetch)(destination.href, { headers, redirect: "error", signal: controller.signal });
    // A non-cooperative fetch can resolve after the deadline. Discard its body too.
    void request.then(
      (response) => {
        if (timedOut) cancel(response.body);
      },
      () => undefined,
    );
    const response = await Promise.race([request, deadline]);
    // Never read or hash a denied, missing, partial, or redirected response body.
    if (response.status !== 200 || response.redirected) {
      cancel(response.body);
      const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : undefined;
      throw new SourceHttpError("http_status", status === undefined ? "Source returned an invalid HTTP status." : `Source returned HTTP ${status}.`, status);
    }
    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      cancel(response.body);
      throw new SourceHttpError("body_limit", "Source response exceeds its byte limit.", 200);
    }
    if (!response.body) return { text: "", httpStatus: 200 };
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0;
    let text = "";
    for (;;) {
      if (Date.now() >= deadlineAt) throw timeoutError();
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new SourceHttpError("body_limit", "Source response exceeds its byte limit.", 200);
      try {
        text += decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new SourceHttpError("invalid_text", "Source response is not valid UTF-8 text.", 200);
      }
    }
    try {
      text += decoder.decode();
    } catch {
      throw new SourceHttpError("invalid_text", "Source response is not valid UTF-8 text.", 200);
    }
    complete = true;
    return { text, httpStatus: 200 };
  } catch (error) {
    if (timedOut) throw timeoutError();
    if (error instanceof SourceHttpError) throw error;
    throw new SourceHttpError("request_failed", "HTTPS source request failed. Check access and the source address.");
  } finally {
    clearTimeout(timer);
    if (!complete) {
      controller.abort();
      cancel(reader);
    }
    try {
      reader?.releaseLock();
    } catch {
      /* An outstanding cancellation can retain its lock. */
    }
  }
}
