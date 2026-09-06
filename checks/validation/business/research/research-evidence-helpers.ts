/**
 * Re-export of the shared evidence grammar (kernel/schema/evidence-grammar.ts) under the name the
 * research validators have always imported. The definitions moved into kernel/ so the runtime schema
 * layer can validate evidence documents without importing from validation/ — the runtime owns the
 * grammar; the validator owns the content-quality judgment that sits on top of it.
 */
export * from "../../../../kernel/schema/evidence-grammar.js";
