/** D1 owns credentials, tenant membership, revocation and entitlement. */
import { AccessError, READ_SCOPE_LOOKUP_KEYS, type Principal } from "./auth.js";
import { tenantDbFromEnv, type AccountId } from "./db/tenant.js";
export interface Access {
  readonly principal: Principal;
  readonly accountId: AccountId;
}
async function withFailClosed(resolve: () => Promise<Access>): Promise<Access> {
  try {
    return await resolve();
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503);
  }
}
export async function resolveApiKeyAccess(env: Env, key: string): Promise<Access> {
  return withFailClosed(async () => {
    const db = tenantDbFromEnv(env);
    if (!db) throw new AccessError(503);
    const resolved = await db.resolveApiKeyPrincipal(key);
    await db.assertEntitledAny(resolved.accountId, READ_SCOPE_LOOKUP_KEYS);
    return resolved;
  });
}
/** Recheck every OAuth access and refresh against current credential and tenant state. */
export async function resolveGrantAccess(env: Env, props: unknown, now = Date.now()): Promise<Access> {
  return withFailClosed(async () => {
    const db = tenantDbFromEnv(env);
    if (!db) throw new AccessError(503);
    const resolved = await db.resolveGrantPrincipal(props, now);
    await db.assertEntitledAny(resolved.accountId, READ_SCOPE_LOOKUP_KEYS);
    return resolved;
  });
}
