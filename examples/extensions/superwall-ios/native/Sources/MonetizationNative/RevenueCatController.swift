#if os(iOS)
import Foundation
import StoreKit
import SuperwallKit
import RevenueCat
import MonetizationCore

/// iOS only. Call configure explicitly with host-supplied public keys; no keys or startup execution are included.
@MainActor
public final class RevenueCatController: PurchaseController {
  public private(set) var state: EntitlementState
  private let entitlementID: String
  private var observations: Task<Void, Never>?
  private var expiry: Task<Void, Never>?
  private var identityChange = false
  private var purchaseInFlight = false
  public var hasAccess: Bool { !identityChange && state.hasCurrentAccess(now: Date()) }
  public init(anonymousID: String, entitlementID: String) {
    self.state = EntitlementState(anonymousID: anonymousID)
    self.entitlementID = entitlementID
  }
  public func configure(revenueCatPublicKey: String, superwallPublicKey: String) {
    Purchases.configure(withAPIKey: revenueCatPublicKey, appUserID: state.subjectID)
    Superwall.configure(apiKey: superwallPublicKey, purchaseController: self)
    Superwall.shared.identify(userId: state.subjectID)
    Superwall.shared.subscriptionStatus = .unknown
    startObservations()
  }
  private func startObservations() {
    observations?.cancel()
    let generation = state.generation
    observations = Task { [weak self] in
      for await info in Purchases.shared.customerInfoStream {
        guard !Task.isCancelled, let self, self.state.generation == generation, !self.identityChange else { return }
        self.apply(info, generation: generation)
      }
    }
  }
  private func apply(_ info: RevenueCat.CustomerInfo, generation: Int) {
    let now = Date()
    let entitlements = info.entitlements.activeInCurrentEnvironment
    do {
      try state.observeEntitlement(subject: Purchases.shared.appUserID, generation: generation,
        active: entitlements[entitlementID] != nil, observedAt: info.requestDate, now: now, authority: "revenuecat")
      refreshSubscriptionProjection()
      expiry?.cancel()
      let delay = max(0, 60 - now.timeIntervalSince(info.requestDate))
      expiry = Task { [weak self] in
        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        guard !Task.isCancelled, let self, self.state.generation == generation else { return }
        self.refreshSubscriptionProjection()
      }
    } catch {
      Superwall.shared.subscriptionStatus = .unknown
    }
  }
  private func refreshSubscriptionProjection() {
    switch state.subscriptionProjection(now: Date()) {
    case .active: Superwall.shared.subscriptionStatus = .active([SuperwallKit.Entitlement(id: entitlementID)])
    case .inactive: Superwall.shared.subscriptionStatus = .inactive
    case .unknown: Superwall.shared.subscriptionStatus = .unknown
    }
  }
  public func signIn(accountID: String) async throws {
    guard !identityChange, !purchaseInFlight else { throw IntegrationError.identityTransition }
    identityChange = true; observations?.cancel()
    defer { identityChange = false; startObservations() }
    try state.identify(accountID)
    Superwall.shared.subscriptionStatus = .unknown
    let result = try await Purchases.shared.logIn(accountID)
    Superwall.shared.identify(userId: accountID)
    apply(result.customerInfo, generation: state.generation)
  }
  public func logout() async throws {
    guard !identityChange, !purchaseInFlight else { throw IntegrationError.identityTransition }
    identityChange = true; observations?.cancel()
    defer { identityChange = false; startObservations() }
    // Access is revoked before the asynchronous provider call; a failed logout cannot retain it.
    try state.logout(anonymousID: "pending-logout-" + UUID().uuidString)
    Superwall.shared.subscriptionStatus = .unknown
    let info = try await Purchases.shared.logOut()
    try state.logout(anonymousID: Purchases.shared.appUserID)
    Superwall.shared.reset()
    Superwall.shared.identify(userId: state.subjectID)
    apply(info, generation: state.generation)
  }
  /// Assignment is supplied by a separately observed Superwall placement result, never manufactured here.
  public func recordPresentation(assignmentID: String) throws {
    try state.present(assignmentID: assignmentID, owner: "superwall", now: Date())
  }
  public func present(placement: String) throws {
    guard !identityChange, Purchases.shared.appUserID == state.subjectID else { throw IntegrationError.identityTransition }
    refreshSubscriptionProjection()
    Superwall.shared.register(placement: placement)
  }
  public func purchase(product: SuperwallKit.StoreProduct) async -> PurchaseResult {
    guard !identityChange, !purchaseInFlight, Purchases.shared.appUserID == state.subjectID else { return .failed(IntegrationError.identityTransition) }
    purchaseInFlight = true
    defer { purchaseInFlight = false }
    let generation = state.generation
    let callbackID = UUID().uuidString
    do {
      guard let product = product.sk2Product else { throw IntegrationError.storeKit2Required }
      let result = try await Purchases.shared.purchase(product: RevenueCat.StoreProduct(sk2Product: product))
      guard generation == state.generation else { return .failed(IntegrationError.identityTransition) }
      state.purchaseCallback(id: callbackID, result: result.userCancelled ? .cancelled : .purchased, generation: generation)
      apply(result.customerInfo, generation: generation)
      return result.userCancelled ? .cancelled : .purchased
    } catch {
      let pending = (error as NSError).code == ErrorCode.paymentPendingError.rawValue
      state.purchaseCallback(id: callbackID, result: pending ? .pending : .failed, generation: generation)
      return pending ? .pending : .failed(error)
    }
  }
  public func restorePurchases() async -> RestorationResult {
    guard !identityChange, !purchaseInFlight, Purchases.shared.appUserID == state.subjectID else { return .failed(IntegrationError.identityTransition) }
    purchaseInFlight = true
    defer { purchaseInFlight = false }
    let generation = state.generation
    do {
      let info = try await Purchases.shared.restorePurchases()
      guard generation == state.generation else { throw IntegrationError.identityTransition }
      apply(info, generation: generation)
      return .restored
    } catch { return .failed(error) }
  }
  public enum IntegrationError: Error { case identityTransition, storeKit2Required }
}
#endif
