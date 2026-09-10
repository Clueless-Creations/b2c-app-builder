/**
 * The MCP `instructions` string handed to every client at initialize.
 *
 * It lives in its own module rather than in worker.ts because the Workers runtime requires every
 * named export of the entry module to be a function or ExportedHandler — exporting a string there
 * fails at startup with "Incorrect type for map entry", before any request is served. A sibling
 * module keeps the value importable by hosted/knowledge-mcp/test/worker.test.ts, which pins it.
 *
 * Content rules, in case a future edit shortens it back:
 *
 *  - Name the whole route, not the first call. A client that installed nothing else receives this
 *    string and the four tool descriptions, and nothing else. Stopping at "start with b2c_catalog"
 *    leaves the reader to guess that b2c_workflow and route.expand exist at all.
 *  - Name the compound case. `catalog()` keeps only workflows matching every query term whenever
 *    any workflow does, so a request naming two jobs can return one of them on a one-result page
 *    that reads exactly like a confident answer. Telling the reader to search each part is the
 *    cheapest available defence against that.
 *  - Keep "does not do" and "cannot see" separate. The first is this service's boundary; the
 *    second is ARCH-11's unknown-not-ready rule, and it is the honest answer to "where is this
 *    founder in the graph?" — which this service cannot answer and must not appear to.
 */
export const HOSTED_INSTRUCTIONS =
  "B2C App Builder provides read-only, versioned knowledge for consumer-app work. " +
  "Find the workflow for the goal with b2c_catalog or b2c_knowledge_search, load it with b2c_workflow, " +
  "then expand its authored instructions through route.expand and retrieve the exact sections it names with b2c_knowledge_get. " +
  "A request that names two jobs usually spans two workflows: search for each part rather than trusting a single narrow result page. " +
  "These tools do not access local files, plan a workspace, approve actions, or execute applications. " +
  "They also observe nothing about this founder: whether a prerequisite workflow was ever run, whether an artifact exists, " +
  "and whether a provider account is connected are unknown here, not done and not undone. " +
  "Report such a prerequisite as unverified through this connection, and name where it can be checked. " +
  "This connection is hosted knowledge (b2c-hosted). It cannot access local files or run a local business. " +
  "Connect the local builder as b2c-local for workspace planning and execution. " +
  "A leftover b2c-app-builder client name is ambiguous until the handshake is read.";
