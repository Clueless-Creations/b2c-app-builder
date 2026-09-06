# Superwall and RevenueCat on iOS

This extension supplies three explicit native operations: paywall presentation,
purchase delegation and entitlement readback. Superwall owns presentation and
assignment. RevenueCat owns purchase, restore and access. The package uses the
existing extension snapshot, recipe resolver and catalog pack loader. It does not
register an execution route or grant authority to make a purchase.

The native package pins Superwall 4.16.3, RevenueCat 5.88.0 and transitive
Superscript 1.0.15. `native/Package.resolved` records exact source revisions;
`dependency-checksums.json` records the vendor's binary artifact checksum.
The snapshot includes the declarations, sources, tests and locks.

`native/Sources/MonetizationNative/RevenueCatController.swift` implements the
actual Superwall `PurchaseController` protocol. The host explicitly configures
SDKs using public keys supplied at runtime. No credentials, provider configuration
or automatic execution are included. The anonymous identity passed to the
controller must be a newly generated opaque app identity, never personal data.

Run portable state tests with:

```sh
swift test --package-path native --scratch-path /tmp/b2c-superwall-native
```

Those tests exercise anonymous exposure, sign-in, delayed entitlement,
cancellation, pending payment, error, restore/readback, duplicate callback and
logout. They compile the platform-neutral state owner; they do not compile the
iOS-only controller or contact either SDK's service. Read `local-proof.json` for
the separately recorded current SDK build result.

Provider observation normalization uses
`adapters/providers/superwall/measurement.ts`. It delegates identity joining and
amount deduplication to U16, preserving the anonymous exposure reference instead
of rewriting history. The native SDK does not manufacture a treatment assignment
or a price observation: an observed Superwall assignment must be supplied
explicitly. Real sandbox purchase and restore receipts, native device behavior,
and live readiness remain unobserved.

The standalone example declares namespaced operation contracts because the
first-party operation vocabulary is not an importable extension package yet.
It does not silently replace the default recipe or imply first-party bindings.

API sources checked against pinned release source:
[Superwall purchase-controller integration](https://superwall.com/docs/ios/guides/using-revenuecat),
[Superwall 4.16.3 PurchaseController](https://github.com/superwall/Superwall-iOS/blob/4.16.3/Sources/SuperwallKit/StoreKit/Purchase%20Controller/PurchaseController.swift),
and [RevenueCat integration identity requirements](https://www.revenuecat.com/docs/integrations/third-party-integrations/superwall).
