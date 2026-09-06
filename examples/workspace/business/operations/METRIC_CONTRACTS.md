# Metric Contracts

Status: authored reference contracts. Comparison stays refused until observations cite a mapped definition with matching currency, cohort, version, and maturity.

Structured source: `operations/metric-contracts.json`

The skill-shipped schema grades this file. The workspace copy of the schema is for local editing. Do not invent missing units, currency, or identity joins.

## Identity Boundary

Resolvable identity mappings stay in the app and provider data boundary. Observations store only an opaque subject reference plus app and environment. Anonymous-to-identified and restore maps must stay inside one app and environment. U22 owns authorized erasure. This file does not keep a reverse identity map.

## Definitions

Each row is a versioned metric definition. A later revision does not convert an earlier one.

| Definition          | Revision | Currency / treatment | Cohort / window                     | Applicability  |
| ------------------- | -------- | -------------------- | ----------------------------------- | -------------- |
| recognized_revenue  | 1        | USD gross            | weekly-new-subscribers / P7D mature | applies        |
| recognized_revenue  | 2        | EUR net              | weekly-new-subscribers / P7D mature | applies        |
| activation          | 1        | ratio                | weekly-new-users / P1D              | applies        |
| d7_retention        | 1        | ratio                | weekly-activated-users / P7D        | applies        |
| d30_retention       | 1        | ratio                | monthly-activated-users / P30D      | applies        |
| trial_starts        | 1        | count                | none                                | applies        |
| mrr                 | 1        | USD net              | none                                | applies        |
| churn               | 1        | ratio                | none                                | applies        |
| store_conversion    | 1        | ratio                | none                                | not applicable |
| crash_free_sessions | 1        | ratio                | none                                | not applicable |

No USD-to-EUR conversion is declared. Those revenue revisions are incomparable.

Each observation must report window maturity. An authored definition cannot prove that its observation window has elapsed. Contradictory cohort, units, cost treatment, or gross/net metadata refuses comparison. A declared directional currency conversion transforms the returned amount and retains its rate and timestamp; it does not reconcile metric revisions.

## Exposure Versus Assignment

An assignment record is not exposure. Count exposure only when the observation names `participationKind: exposure` and meets the experiment exposure rule.

## Experiments

| Experiment             | Assignment unit | Exposure rule             | Primary metric       |
| ---------------------- | --------------- | ------------------------- | -------------------- |
| paywall-copy-rewrite@1 | subject         | saw the paywall treatment | recognized_revenue@1 |

Insufficient sample or an immature window is inconclusive. It is not a winning treatment.

## Subject-Reference Coverage

To find observations for a subject, scan observation `subjectRef` values and apply session-scoped identity mappings, including chains of anonymous, identified, and restored references. Do not write a reverse identity map into receipts. U22 uses that coverage list for erasure.
