# 0006: Onboarding research, identity and measurement precede design acceptance

Status: accepted
Date: 2026-09-06
Authority: founder's explicit instruction to repair and merge onboarding research,
design, analytics, attribution and authentication coverage
Rules: ARCH-02, ARCH-03, ARCH-07, ARCH-09, ARCH-10, ARCH-11, ARCH-12
Related roadmap requirements: U9 selected context, U16 identity and measurement,
U18 complete-business verification

## Findings and decision

The existing onboarding graph already included research, identity and analytics.
Most packet gates checked length and placeholders, not concrete contracts. ONB-13
could run alongside identity/policy; ONB-18 could run before ONB-17; the global
design lock did not depend on the onboarding decisions. ONB-20 described isolation
but did not declare `reviewOf`. The analytics reference was not directly bound to
these onboarding producers.

Extend those existing nodes and the existing knowledge service. Add no scheduler,
state store or automatic provider installation. ONB-13 depends on identity, first
value and policy. Design lock depends on the selected onboarding architecture;
prototype acceptance depends on the actual screen/control contract. ONB-19 consumes
the instrumented prototype. ONB-20 declares its producer review dependencies.

Structured Foundation contract blocks belong to their existing ONB Markdown
packets. Prose still explains research and design. They join pinned guidance and
retained observations to app decisions, then to identity, consent, canonical events,
attribution and rendered behavior. Prototype and final runtime proof are declared
output artifacts and attach to existing engine verification. They do not replace
its live device/provider, authority or independent acceptance requirements.

## Boundaries

No account, no experiment and absent optional integrations remain explicit product
decisions, not a license to omit first-session observability. Analytics failure must
not block first value. No cross-user identity leakage, no invented attribution and
no tracking around denied consent. Proof uses synthetic minimized test subjects.
Contracts and referenced source changes invalidate old proof. A fixture trace only
proves the gate behavior; it does not establish a live app or provider execution.

Use the selected capability/provider context and existing artifact authorities.
These changes neither repair the old Porchwatch app nor repin another business.
Existing valid input artifacts can be reused in focused work; missing/stale required
foundations remain a visible obligation, not silently accepted legacy evidence.
