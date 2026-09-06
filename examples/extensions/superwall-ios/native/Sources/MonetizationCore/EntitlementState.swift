import Foundation

/// Local integration state, not a provider receipt or business acceptance claim.
public struct EntitlementState {
  public enum PurchaseOutcome: Equatable { case purchased, cancelled, pending, failed }
  public struct Exposure: Equatable {
    public let assignmentID: String
    public let subjectID: String
    public let presentedAt: Date
  }
  public private(set) var subjectID: String
  public private(set) var generation = 0
  public private(set) var access = false
  public private(set) var exposure: Exposure?
  public private(set) var outcome: PurchaseOutcome?
  public private(set) var seenCallbacks = Set<String>()
  public private(set) var lastObservation: Date?
  public init(anonymousID: String) { self.subjectID = anonymousID }
  public mutating func present(assignmentID: String, owner: String, now: Date) throws {
    guard owner == "superwall", !assignmentID.isEmpty else { throw Refusal.assignmentOwner }
    exposure = Exposure(assignmentID: assignmentID, subjectID: subjectID, presentedAt: now)
  }
  /// Preserve anonymous exposure for an explicit identity join; invalidate prior access immediately.
  public mutating func identify(_ id: String) throws {
    guard !id.isEmpty else { throw Refusal.identity }
    subjectID = id; generation += 1; access = false; lastObservation = nil; outcome = nil
  }
  public mutating func logout(anonymousID: String) throws {
    try identify(anonymousID); exposure = nil; seenCallbacks.removeAll()
  }
  public mutating func purchaseCallback(id: String, result: PurchaseOutcome, generation expected: Int) {
    guard expected == generation, seenCallbacks.insert(id).inserted else { return }
    outcome = result
    // A completed purchase or restore never grants access; only RevenueCat entitlement readback does.
  }
  public mutating func observeEntitlement(subject: String, generation expected: Int, active: Bool,
                                         observedAt: Date, now: Date, authority: String) throws {
    guard authority == "revenuecat" else { throw Refusal.entitlementOwner }
    guard subject == subjectID, expected == generation else { throw Refusal.identity }
    guard observedAt <= now, now.timeIntervalSince(observedAt) <= 60,
          lastObservation.map({ observedAt >= $0 }) ?? true else { access = false; throw Refusal.stale }
    lastObservation = observedAt; access = active
  }
  public enum SubscriptionProjection: Equatable { case unknown, inactive, active }
  public func subscriptionProjection(now: Date) -> SubscriptionProjection {
    guard let observed = lastObservation, observed <= now,
          now.timeIntervalSince(observed) < 60 else { return .unknown }
    return access ? .active : .inactive
  }
  public func hasCurrentAccess(now: Date) -> Bool {
    subscriptionProjection(now: now) == .active
  }
  public enum Refusal: Error { case assignmentOwner, entitlementOwner, identity, stale }
}
