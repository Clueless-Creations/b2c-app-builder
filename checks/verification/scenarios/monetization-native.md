# Native monetization composition proof

The reusable example lives in `examples/extensions/superwall-ios/`. Its selected
recipe compiles through the existing extension loader and catalog bridge into
three nodes. Purchase retains the spend action class. Android selection refuses.
No host operation route is registered by the package.

`monetization-native.fixtures.ts` proves package compilation and shared U16
identity/amount normalization. Native Swift tests prove the access state machine.
The separately recorded SDK build must include exact package lock, source,
toolchain and artifact identities before claiming iOS compilation. A successful
macOS Swift test does not compile code behind `#if os(iOS)`.

AE3 requires an anonymous Superwall treatment exposure, explicit sign-in join,
RevenueCat purchase result and current entitlement readback. Deterministic tests
cover these transitions and preserve the earlier exposure reference. Provider
sandbox receipts are a separate missing gate. Purchase cancellation, pending,
failure, duplicate callback, restore without entitlement, stale observation and
logout must never create access. Real device behavior and live readiness remain
unknown until authorized provider/native readback proves them.
