/**
 * Redact Expo/EAS secrets from argv and captured process text before any public projection.
 */

const SECRET_FLAGS = new Set([
  "--password",
  "--apple-id-password",
  "--key",
  "--private-key",
  "--api-key",
  "--token",
  "--secret",
  "--keystore-password",
  "--key-password",
]);

export function redactExpoArgv(argv: readonly string[]): string[] {
  const redacted: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]!;
    const flag = current.split("=")[0] ?? current;
    if (SECRET_FLAGS.has(flag) || flag.startsWith("--password") || flag.endsWith("-password") || flag.endsWith("-token")) {
      redacted.push(current.includes("=") ? `${flag}=<redacted>` : current);
      if (!current.includes("=") && argv[index + 1] !== undefined) {
        redacted.push("<redacted>");
        index += 1;
      }
      continue;
    }
    redacted.push(current);
  }
  return redacted;
}

export function sanitizeExpoProcessText(text: string): string {
  return text
    .replace(/EXPO_TOKEN=\S+/g, "EXPO_TOKEN=<redacted>")
    .replace(/Bearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/access_token=[^&\s]+/gi, "access_token=<redacted>")
    .replace(/token=[^&\s]+/gi, "token=<redacted>")
    .replace(/password=[^&\s]+/gi, "password=<redacted>")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "<redacted-private-key>");
}

export function envHasSecretValue(env: Readonly<Record<string, string>>, secret: string): boolean {
  return Object.entries(env).some(([, value]) => value === secret);
}

export function argvContainsSecret(argv: readonly string[], secret: string): boolean {
  return argv.some((argument) => argument.includes(secret));
}
