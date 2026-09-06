# Launch Retro

Status: not_started until launch +7 days; refreshed at day 30 and day 90.

The retro is how this launch improves the next one. Findings here feed `state/business-state.json` failure cards, `operations/FAILURE_CARDS.md`, and — for skill-level misses — LaunchBench scenario candidates against the launch skill itself. Keep entries concrete: artifact paths, dates, and what a future agent should do differently.

## Retro Window

Due dates count from `lanes.post_launch_ops.live_since` (launch +7/+30/+90, one week of grace). `check:post-launch` flags a day-30 or day-90 checkpoint that is still uncompleted past its due date — an untouched row is how the kill-or-scale question gets dodged, not a neutral state.

| Checkpoint     | Date | Completed by |
| -------------- | ---- | ------------ |
| Launch +7 days |      |              |
| Day 30         |      |              |
| Day 90         |      |              |

## Lane Usage

For every lane in `state/business-state.json`: used fully / used partially / skipped — with the reason and whether the skip was correct in hindsight.

| Lane | Used | Skip/partial reason | Right call? |
| ---- | ---- | ------------------- | ----------- |

## Stalls And Blockers

Where did the launch lose the most time? Founder gates that sat unanswered, tool access that blocked lanes, agent misses, rework loops.

| Stall | Days lost | Root cause | Prevention |
| ----- | --------- | ---------- | ---------- |

## Surprises

What happened that no reference predicted — store review outcomes, channel performance, pricing reactions, retention shape.

## Failure Card Candidates

Misses that should become durable failure cards or LaunchBench scenarios so they are caught mechanically next time.

| Miss | Failure card or LaunchBench candidate | Filed? |
| ---- | ------------------------------------- | ------ |

## Kill, Hold, Or Scale

The whole-app verdict, per `post-launch-operations.md` §9. The agent fills the evidence columns from RevenueCat, PostHog cohorts, the paid-UA baseline, and the weekly log; the verdict itself is the founder's decision, recorded here and through the reducer in `state/business-state.json` (`lanes.post_launch_ops.kill_or_scale_decision`). A checkpoint that passes with these columns empty is the zombie-app failure mode.

| Checkpoint | MRR trend (4 wks) | Retention trend (D7/D30 cohorts) | CAC:LTV or payback | Founder hrs/wk | Verdict (Scale / Hold / Fix / Kill) | Rationale |
| ---------- | ----------------- | -------------------------------- | ------------------ | -------------- | ----------------------------------- | --------- |
| Day 30     |                   |                                  |                    |                |                                     |           |
| Day 90     |                   |                                  |                    |                |                                     |           |

## Next-Launch Changes

The three highest-value changes for the next launch (or the next 90 days of this one).
