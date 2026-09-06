# Commitment Funnel

Use this before locking the first-session screen sequence.
The first two minutes dominate trial starts.
A quiz plus a hard paywall is not a complete funnel.

Load `onboarding-conversion.md` for the ONB graph.
Load `paywall-pricing-and-experiments.md` for experiment engines.
Load `paywall-goal-headline.md` after quiz or goals collect a goal.
Load experience ethics guidance before a pledge, signature, or hold-to-confirm.

## Contents

- 1. Required Sequence
- 2. Quality Metrics
- 3. Ethics Vetoes
- 4. Outputs
- 5. Common Failure Modes

## 1. Required Sequence

Record a Commitment Funnel table in `product/ONBOARDING.md`.

The table must name these steps in order:

1. welcome
2. quiz or goals
3. micro-commitment
4. personalized insight
5. hard paywall

Welcome names the job.
Quiz or goals collect useful answers only.
Micro-commitment is a pledge, plan accept, or hold-to-confirm with a skip path.
Personalized insight is a Held Value Reveal, not a vitamin claim.
Hard paywall follows the insight.

Do not skip to a feature tour after the quiz.

`check:onboarding-graph` reads this table.

## 2. Quality Metrics

Record a Funnel Quality Metrics table in `product/ONBOARDING.md`.

The table must name:

- onboarding complete
- install-to-trial
- trial-to-paid
- per-step drop-off
- refund rate

Trial starts alone cannot mark the lane done.
A high refund rate after a hard paywall is a quality fail.

Route tests through RevenueCat Experiments.

## 3. Ethics Vetoes

These patterns fail closed:

- pledge or signature with no skip path
- hold-to-confirm that looks like a system dialog
- fake download counts or fake scarcity on the paywall
- a progress animation over no real computation

Record the veto and the skip path in the Commitment Funnel table.

## 4. Outputs

- Commitment Funnel table in `product/ONBOARDING.md`
- Funnel Quality Metrics table in `product/ONBOARDING.md`
- experiment rows for timing and plan mix in `revenue/REVENUE_OPS.md`

## 5. Common Failure Modes

- Quiz then paywall with no insight
- Micro-commitment with no skip path
- Done criteria that ignore refund rate
- Feature-depth onboarding in the first two minutes
