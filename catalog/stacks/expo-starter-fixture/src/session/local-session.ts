import { boundLocalCacheSeam, type PersistenceSeam } from "../persistence/seam";
import { EMPTY_LOCAL_AUTH, reduceLocalAuth, type LocalAuthEvent, type LocalAuthState } from "../capabilities/reducers";

const seam: PersistenceSeam = boundLocalCacheSeam();
let current: LocalAuthState = { ...EMPTY_LOCAL_AUTH };

export function currentLocalSession(): LocalAuthState {
  return current;
}

export async function applyLocalSessionEvent(
  event: LocalAuthEvent,
  extra?: { incomingUserId?: string; callbackTrusted?: boolean },
): Promise<LocalAuthState> {
  const reduced = reduceLocalAuth({ event, current, incomingUserId: extra?.incomingUserId, callbackTrusted: extra?.callbackTrusted });
  current = reduced.next;
  await seam.persist(current);
  return current;
}

export async function restoreLocalSession(): Promise<LocalAuthState> {
  const stored = await seam.restore();
  if (stored && typeof stored === "object") current = stored as LocalAuthState;
  return current;
}
