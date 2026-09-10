/**
 * Independent provider-conformance provenance (#110).
 *
 * Reuses existing upstream/source identity. A fixture names the native contract it
 * proves. It does not invent a second support registry. Adapter-generated samples are
 * wiring evidence, not independent native evidence.
 */

export const PROVIDER_TRANSPORTS = ["cli", "api", "mcp", "sdk", "service"] as const;
export type ProviderTransport = (typeof PROVIDER_TRANSPORTS)[number];

export const CONFORMANCE_EVIDENCE_KINDS = [
  "actual-capture",
  "official-example",
  "upstream-source-test",
  "deliberately-altered-negative",
  "adapter-generated",
] as const;
export type ConformanceEvidenceKind = (typeof CONFORMANCE_EVIDENCE_KINDS)[number];

export const CONFORMANCE_ESTABLISHES = [
  "request-shape",
  "response-shape",
  "error",
  "pagination",
  "effect",
  "protocol-validity",
  "completeness-claim",
] as const;
export type ConformanceEstablishes = (typeof CONFORMANCE_ESTABLISHES)[number];

export interface ProviderConformanceProvenance {
  readonly provider: string;
  readonly transport: ProviderTransport;
  readonly reviewedVersion: string;
  readonly reviewedRevision: string | "unknown";
  readonly sourceSelector: string;
  readonly nativeOperation: string;
  readonly canonicalOperation: string | "none";
  readonly evidenceKind: ConformanceEvidenceKind;
  readonly establishes: readonly ConformanceEstablishes[];
  readonly coverageLimits: string;
  readonly sample: unknown;
}

export function isIndependentEvidence(kind: ConformanceEvidenceKind): boolean {
  switch (kind) {
    case "actual-capture":
    case "official-example":
    case "upstream-source-test":
    case "deliberately-altered-negative":
      return true;
    case "adapter-generated":
      return false;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function describeConformanceCoverage(record: ProviderConformanceProvenance): string {
  return `${record.provider} ${record.nativeOperation} via ${record.transport} at ${record.reviewedVersion}: ${record.establishes.join(", ")}. Limits: ${record.coverageLimits}`;
}

/**
 * A sample file that names encoder/decoder helpers is not independent native evidence.
 * Mentioning a reviewed upstream path or pin is allowed.
 */
export function adapterGeneratedMentions(sampleSource: string, adapterSymbols: readonly string[]): readonly string[] {
  return adapterSymbols.filter((symbol) => sampleSource.includes(symbol));
}
