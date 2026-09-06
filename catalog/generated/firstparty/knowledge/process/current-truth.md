# Current Truth

Use this after a provider or store action returns an authoritative read-back.
Use this when reported status and readiness status must match reducer state.

The engine keeps one current-truth document. The reducer is the only writer.
The document is `state/current-truth.json`. Do not create it by hand.
Run `reconcile` after a successful provider or store action.
Do not change current-truth with a commit patch.

## Rules

A successful action with an authoritative read-back replaces the matching older blocker.
The replace happens in one reducer transaction. Historical evidence stays on file.

Expired evidence reopens the matching blocker. Missing evidence is not success.
An unrelated action cannot clear a blocker outside its affected graph.

A second reconcile with the same receipt and the same input hash is a no-op.
The input hash covers every persisted evidence field, including summary.
A later clock that expires a claim writes a new revision. It keeps the same receipt id.
Export views refresh expired claims from the clock. They do not write the document.

A reused evidence id must match the complete stored record. A different field is a conflict.

## Claim status

Founder-facing views name four statuses:

- Active
- Superseded
- Expired
- Unresolved

Do not use internal words in founder-facing copy.

Authority rank is provider read-back, then store receipt, then operator attestation, then derived projection.
Same authority, same time, and a different payload hash is a conflict. Fail closed.
An unparseable timestamp is unorderable. Fail closed.

## Checks

`check:agent-operations` compares the latest successful risky action with current truth.
A later observe, blocked, or failed entry does not hide that risky action.
It also compares every generated status view. Drift is a failure, not a warning.
