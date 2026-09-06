# Market experiment reports

A market experiment compares independent business hypotheses. It is an exploratory
comparison, not a randomized within-app test and not authority to change allocation.

Author `marketExperiments` in the owning workspace's existing
`operations/metric-contracts.json`. Each versioned definition names registered
workspace IDs, app and environment boundaries, hypotheses, treatments, allocation
records, exact metric versions, observation window, decision horizon, founder
decision references and versioned comparability criteria. See
`kernel/schema/market-experiment.schema.json` for the contract.

Each participant refers to three existing operating observations: primary outcome,
actual cost and cohort evidence. They remain in reducer-owned
`state/business-state.json` under `operatingModel`. The cohort observation's value
uses `b2c.market-cohort/v1`: app/environment, observed or synthetic origin, assignment
unit, allocation record, eligible/exposed/joined counts, attribution, acquisition
shares, and window maturity. No subject identities are copied into the report.

An observation must be accepted at its exact revision. Its acceptance event records
`observationId` and `observationRevision`. Corrections append a new observation with
`supersedes` pointing to the previous observation, then receive new acceptance.
They never mutate an existing observation or automatically inherit its acceptance.
The report follows an unambiguous correction chain and retains source references.

```typescript
import { readMarketExperimentReport } from "../../kernel/session/market-experiment.js";

const report = readMarketExperimentReport({
  workspaceId: "founder-business",
  experimentId: "market.retention",
  now: "2026-09-05T12:00:00.000Z",
});
```

The reader resolves only registry-listed workspaces and rejects aliases that name
one directory as multiple businesses. It reads each workspace's current operating
records and metric definitions. Missing, invalid, unaccepted, stale or immature
records remain named degraded rows. It refuses comparison across mismatched metric
bytes, currency, windows, assignment, identity coverage or acquisition mix. Actual
costs and known attribution are required. Synthetic and observed groups never mix.

Report digests bind the authored experiment and current evidence basis. A late refund,
corrected identity mapping, revised definition or source correction changes the
report basis or makes a row degraded. Old observations and receipts remain intact.
Comparable additive outcomes may be summed; rates and metrics with denominators are
not summed. Reports do not rank businesses, authorize spend, change founder decisions
or claim a live launch.

This is a read-only report service. Public CLI/MCP experiment selectors and a real
ten-business measurement milestone require integration and observed evidence; local
fixture results do not establish that milestone.
