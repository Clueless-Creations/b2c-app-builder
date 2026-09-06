# Landing behavior checks

Run from the repository root with Node.js 22:

```sh
node --test examples/tuck/tests/landing.test.mjs
```

The tests execute the actual `landing/app.js` with controlled storage and small DOM
sinks. They cover state, reload, table/list equivalence, pointer cancellation, import
validation and cancellation, backup swapping, malformed-save recovery, and failed
writes. They do not simulate browser layout, native button keyboard activation,
dialog focus restoration, accessibility APIs, or visual quality.

The harness uses Node's built-in test runner and VM. It adds no browser dependency.
Do not turn a passing test run into a browser or design acceptance receipt.

## Source-bound local test receipt

The current machine-generated receipt is `proof/tuck-local-test-proof.json`. It
records the exact recursive source manifests, test commands, toolchains, simulator,
times, counts, and output hashes for the current landing and native observations.
The receipt is machine-bound and intentionally ignored by Git; generate it locally
when you need source-bound evidence for the current checkout.

Run the landing suite with Node.js 22 and the full native scheme on an explicitly
assigned simulator. Keep the logs, DerivedData, and result bundle in ignored
`proof/runtime/`. Then regenerate the retained receipt from the repository root:

```sh
node \
  examples/tuck/tests/generate-test-proof.mjs \
  --simulator-id 403BC147-3C20-49C2-8F72-4F2252B02065
```

The generator requires Node.js 22. It refuses incomplete result counts, verifies
that the native result bundle names the requested simulator, and fingerprints the
native project, code, tests, assets, landing code and tests, and shared assets. It
does not run the tests or create a strict design-acceptance report.

The 2026-09-04 receipt records 12 landing tests passed with no failures or skips.
All 13 landing-bound source entries remain unchanged from that run. The full native
run passed all 25 tests with no failures or skips, including the unsuppressed
contrast audit for the repaired empty packed-filter state. A local test receipt is
execution evidence for those exact source bytes. It is not browser visual proof,
browser-runtime launch evidence, physical-device VoiceOver evidence, Android evidence,
or a release claim.

## Independent browser checks performed

On 2026-09-04, the behavior reviewer used a separate Chrome tab at
`http://localhost:4179/landing/`. The producer's `127.0.0.1` origin and viewport
were left unchanged. This was an exploratory run while repairs were in progress;
final acceptance must bind a frozen candidate to fresh runtime artifacts.

- Clicking a packing item retained focus on that item's replacement control.
  Space reversed its packed state. Enter also operated a focused packing control.
- Undo initially lost focus to the document. After the repair and reload, Undo
  restored the prior count and focused the stable packing region.
- Item removal initially lost focus after destroying the dialog opener. After
  repair, removing an item returned focus to `Add a thing`.
- Restore previous saved bag changed the visible list from five items to six,
  then back to five on the second restore. The previous version remained available;
  closing the dialog returned focus to the data-settings control.
- A tab-local injected primary-storage write failure left the checkbox and count
  unchanged and displayed the authored save error. The injection was removed.
- With the already-loaded tab placed offline, Enter packed the focused item and
  updated its count. Restoring networking and reloading preserved the saved state.
- With script execution disabled before reload, the page showed its semantic
  product explanation, static essentials, illustration, and working anchors.
  Inactive editing controls were hidden, and the footer used a truthful static
  label. Script execution was restored afterward.

No native simulator, provider, root visual-review tab, or application source was
changed by this reviewer. Test data remains only in the separate localhost origin.
