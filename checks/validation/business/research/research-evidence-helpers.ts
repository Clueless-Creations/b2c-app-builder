/**
 * Re-export of the shared evidence grammar (kernel/schema/evidence-grammar.ts) under the name the
 * research validators have always imported. The definitions moved into kernel/ so the runtime schema
 * layer can validate evidence documents without importing from validation/ — the runtime owns the
 * grammar; the validator owns the content-quality judgment that sits on top of it.
 */
export * from "../../../../kernel/schema/evidence-grammar.js";

/**
 * A narrative field is incomplete when it is itself a template marker, not
 * merely because it describes an unresolved or future action. This keeps
 * evidence uncertainty visible without treating ordinary prose as a blank.
 */
export function isPlaceholderOnly(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/^[`*_\s]+|[`*_\s]+$/gu, "")
    .replace(/[.!?:;]+$/gu, "")
    .trim();
  return /^(?:todo|tbd|pending|unverified|placeholder|replace with|to be filled|yyyy-mm-dd|<[^>]+>)$/i.test(normalized);
}
