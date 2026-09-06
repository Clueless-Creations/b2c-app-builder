# Engineering Plan

Status: partial until Compound Engineering plan, work units, review, test, and proof artifacts are recorded.

Compound Engineering starter route: run or record a `ce-update` freshness check, use `ce-plan` for the implementation plan, use `ce-work` for bounded execution, and record whether `ce-brainstorm` was used or why product direction was already decisive enough to skip it.

When Compound Engineering is unavailable, record the fallback reason through the reducer in `state/business-state.json` and run the Standalone Engineering Loop from `knowledge/engineering/engineering-orchestration.md` instead — plan, bounded slices, adversarial review, test, proof — with the same evidence standard; a missing CE install never downgrades the readiness bar.

Builders type strings from `product/copy/COPY_DECK.md`, never from the spec: a work unit that reaches a screen with no deck rows stops and gets the rows authored first (`knowledge/words/conversion-copy.md`). Strings land in the externalized resource named in `engineering/TECH_SPEC.md` §Strings And Localization Readiness.

| Unit                   | Owner        | Files                                                      | Validator      | Proof                               |
| ---------------------- | ------------ | ---------------------------------------------------------- | -------------- | ----------------------------------- |
| first-value onboarding | orchestrator | product/ONBOARDING.md, product/copy/COPY_DECK.md, app flow | check:app-copy | engineering/PRODUCTION_READINESS.md |
