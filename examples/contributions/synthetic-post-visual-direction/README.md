# Synthetic post to candidate method

This example shows what the contribution path does with one public post. A labeled synthetic post claims a visual-direction heuristic. The path turns that post into a traceable candidate with a source record, a rights decision, an existing owner, a counterexample, and open uncertainties. The candidate stays a proposal. It does not become universal guidance, it adds no provider, and it adds no top-level skill.

Every file here is a fixture. The post is invented. The author name "Synthetic Designer" is a placeholder for a real creator whose identity a real intake would preserve in the same way.

## Files

| File                              | Role                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `source/post.md`                  | The synthetic post. Its first line labels it as a fixture. The author line stays with the text.            |
| `contribution.yaml`               | The reviewed manifest in the `b2c.contribution/v1` contract, snake_case on disk.                           |
| `ADOPTION_MAP.md`                 | The human reading of that manifest: source, owners, units, dispositions, evaluation, uncertainties.        |
| `candidate/critique-heuristic.md` | The candidate method in our own words, labeled draft. It is outside `knowledge/` and no workflow loads it. |

## What the manifest decides

- The post has no license statement, so its rights status is `unknown`. The unit cites the idea and adapts no expression. The derivation relationship is `informed`.
- The idea lands on an existing owner, `reference.design.audience-derived-identity`, as a selected method. It never becomes an always-on rule.
- A second unit is an original counterexample: a monochrome data-dense dashboard where color is the only encoding of state. The naive rule fails there, so the candidate names that limit.
- The post's popularity count and its unsourced completion figure stay in `uncertainties`. Neither one is evidence.

## Re-run the intake

The committed `contribution.yaml` is the reviewed manifest. The CLI produces a first draft from the same post:

```bash
b2c contribute plan --source examples/contributions/synthetic-post-visual-direction/source/post.md --goal "improve the visual-direction critique method" --synthetic
```

Without `--target` the plan is a dry run and writes nothing. Then check and preview the committed root:

```bash
b2c contribute check --target examples/contributions/synthetic-post-visual-direction
b2c contribute preview --target examples/contributions/synthetic-post-visual-direction
```

Intake reads the post as data. It runs nothing from the source and it fetches nothing.

## What the proofs cover

`checks/verification/fixtures/contribution-runtime-context.fixtures.ts` (suite `contribution-runtime-context`) validates this manifest against the frozen contract, recomputes the post digest, confirms the candidate is absent from the knowledge packages and from the shipped hosted bundle, confirms the named owners exist and are active, checks that `ADOPTION_MAP.md` agrees with the manifest, and runs `b2c contribute check`, `b2c contribute preview`, and a `b2c contribute plan` dry run on this root.
