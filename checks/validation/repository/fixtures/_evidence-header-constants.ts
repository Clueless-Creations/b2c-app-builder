/**
 * Standalone subprocess entrypoint: print check-research-evidence.ts's exported table-header
 * constants as JSON on one marker line.
 *
 * check-research-evidence.ts is a script with side-effecting top-level code (it reads a
 * workspace and calls reportAndExit as soon as it is imported, regardless of who imports it) —
 * exactly like every other validator in this repo, and exactly why runFixture() always execs it
 * as a child process rather than importing it in-process. This file exists so
 * evidence-schema.fixtures.ts can read its exported header constants the same isolated way,
 * mirroring the _source-http-checks.ts subprocess-marker-line technique used elsewhere in this
 * fixture suite. The child's own exit code is irrelevant here — only the marker line matters.
 */
import {
  CATEGORY_REVENUE_HEADERS,
  DISTRIBUTION_FIRST_HEADERS,
  DISTRIBUTION_PROOF_HEADERS,
  OFFER_TEST_HEADERS,
  SIGNAL_CORPUS_HEADERS,
  SOURCE_LEDGER_HEADERS,
  TRANSB2C_APP_BUILDER_DEMO_HEADERS,
  VERDICT_HEADERS,
} from "../../business/research/check-research-evidence.js";

export const EVIDENCE_HEADER_CONSTANTS_MARKER = "EVIDENCE_HEADER_CONSTANTS_JSON:";

console.log(
  `${EVIDENCE_HEADER_CONSTANTS_MARKER}${JSON.stringify({
    CATEGORY_REVENUE_HEADERS,
    DISTRIBUTION_FIRST_HEADERS,
    DISTRIBUTION_PROOF_HEADERS,
    OFFER_TEST_HEADERS,
    SIGNAL_CORPUS_HEADERS,
    SOURCE_LEDGER_HEADERS,
    TRANSB2C_APP_BUILDER_DEMO_HEADERS,
    VERDICT_HEADERS,
  })}`,
);
