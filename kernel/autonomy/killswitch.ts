import type { ControlFile } from "../schema/types.js";
import { checkYield } from "../reducer/lock.js";
import type { DispatchHooks } from "../engine/dispatch.js";

export function isKillSwitchEngaged(control: ControlFile): boolean {
  return control.killSwitch.engaged;
}

export interface DispatchHooksDeps {
  /** Re-reads the control file from disk — never a cached copy — so a founder flipping the kill switch mid-run is observed at the very next call (R11). */
  readonly loadControl: () => ControlFile;
  readonly lockPath: string;
  readonly ownerSessionId: string;
}

/**
 * DispatchHooks factory (R11, R13): both checks re-derive their answer fresh on every call —
 * checkKillSwitch reads the control doc, checkCooperativeYield reads the lock file via U3's
 * checkYield — so revocation and interactive-yield requests take effect at the very next
 * dispatch-batch boundary, never a batch later.
 */
export function createDispatchHooks(deps: DispatchHooksDeps): DispatchHooks {
  return {
    checkKillSwitch: () => isKillSwitchEngaged(deps.loadControl()),
    checkCooperativeYield: () => checkYield(deps.lockPath, deps.ownerSessionId),
  };
}
