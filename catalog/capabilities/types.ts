/**
 * Reusable capability definitions. Distinct from `context.*` role knowledge bundles (KTD3, R26).
 */
export type CapabilityId = `capability.${string}`;

export interface CapabilityDefinition {
  id: CapabilityId;
  title: string;
  applicability: string;
  requiredFacts: string[];
  authority: string[];
  readiness: string[];
  inputs: string[];
  outputs: string[];
  effects: string[];
  evidence: string[];
  expectedOutcome: string;
  contextSelectors: string[];
  exclusions: string[];
  extensionSlots: string[];
}

export function isCapabilityId(value: string): value is CapabilityId {
  return /^capability\.[a-z][a-z0-9-]*$/.test(value);
}
