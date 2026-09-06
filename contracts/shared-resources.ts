/** Explicit identities for infrastructure shared across business workspaces. */
export type SharedResourceId = `device:${string}` | `provider-project:${string}`;

export function validateSharedResources(value: unknown): SharedResourceId[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (id) =>
        typeof id !== "string" ||
        !/^(?:device:[A-Za-z0-9][A-Za-z0-9._:/-]*|provider-project:[A-Za-z0-9][A-Za-z0-9._-]*:[A-Za-z0-9][A-Za-z0-9._:/-]*)$/.test(id) ||
        id.length > 512,
    )
  ) {
    throw new Error("shared_resources.invalid: use device:<identity> or provider-project:<provider>:<project> identifiers");
  }
  return [...new Set(value as SharedResourceId[])].sort();
}
