import type {
  AppReviewAuthHandoff,
  AppReviewAuthReadiness,
  AppReviewCapabilityReceipt,
  AppReviewWebSessionStatus,
} from "./types.js";

export interface RawWebAuthStatus {
  readonly authenticated?: boolean;
  readonly source?: string;
  readonly appleId?: string;
  readonly teamId?: string;
  readonly providerId?: number;
  readonly publicProviderId?: string;
  readonly expired?: boolean;
}

  const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PEM_PATTERN = /-----BEGIN [A-Z ]+-----/;
const SESSION_PATTERN = /session[_-]?token|Set-Cookie|asc_web_session/i;
const WEBHOOK_SECRET_PATTERN = /webhook[_-]?secret|hmac[_-]?secret|B2C_APP_BUILDER_ASC_WEBHOOK_SECRET/i;

export function containsSecretMaterial(text: string): boolean {
  return EMAIL_PATTERN.test(text) || PEM_PATTERN.test(text) || SESSION_PATTERN.test(text) || WEBHOOK_SECRET_PATTERN.test(text);
}

export function stripWebAuthSecrets(raw: RawWebAuthStatus | undefined): { authenticated: boolean; source?: string } | undefined {
  if (!raw) return undefined;
  return {
    authenticated: raw.authenticated === true,
    ...(typeof raw.source === "string" && raw.source.length > 0 ? { source: raw.source } : {}),
  };
}

export function emptyAuthReadiness(probedAt: string, publicApiReady: boolean): AppReviewAuthReadiness {
  return {
    publicApiReady,
    webSessionReady: false,
    webSessionStatus: "unknown",
    handoff: "none",
    probedAt,
  };
}

export function webSessionStatusFromProbe(raw: RawWebAuthStatus | undefined): AppReviewWebSessionStatus {
  if (!raw) return "unknown";
  if (raw.authenticated === true) return "resumable";
  if (raw.expired === true) return "expired";
  return "missing";
}

export function buildAuthReadiness(input: {
  readonly receipt: AppReviewCapabilityReceipt;
  readonly webAuth: RawWebAuthStatus | undefined;
  readonly packetNeeded: boolean;
  readonly probedAt: string;
}): AppReviewAuthReadiness {
  const publicApiReady = !input.receipt.failClosed;
  const webCommandsReady = !input.receipt.webSession.failClosed;
  const status = webCommandsReady ? webSessionStatusFromProbe(input.webAuth) : "unknown";
  const webSessionReady = webCommandsReady && status === "resumable";
  let handoff: AppReviewAuthHandoff = "none";
  if (!publicApiReady) {
    handoff = "public_api_required";
  } else if (input.packetNeeded && !webSessionReady) {
    handoff = "web_session_required";
  }
  return {
    publicApiReady,
    webSessionReady,
    webSessionStatus: status,
    handoff,
    probedAt: input.probedAt,
  };
}
