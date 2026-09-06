/**
 * Adapter transport for the operating service (KTD11).
 *
 * Consumer boundary reports stay unchanged: this wrapper translates adapter input into the
 * shared operate() call and does not add fields to the adapter contract.
 */
export { operateFromAdapter } from "../kernel/session/operating-service.js";
export type { OperateInput, OperateReceipt } from "../kernel/session/operating-types.js";
