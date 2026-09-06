import XCTest
@testable import MonetizationCore
final class EntitlementStateTests: XCTestCase {
  let now = Date(timeIntervalSince1970: 1_800_000_000)
  func testAnonymousExposureSignInDelayedEntitlementAndRestore() throws {
    var state = EntitlementState(anonymousID: "anonymous-1")
    try state.present(assignmentID: "treatment-a", owner: "superwall", now: now)
    try state.identify("account-1")
    XCTAssertEqual(state.exposure?.subjectID, "anonymous-1")
    XCTAssertEqual(state.subjectID, "account-1")
    state.purchaseCallback(id: "transaction-1", result: .purchased, generation: state.generation)
    XCTAssertFalse(state.access)
    try state.observeEntitlement(subject: "account-1", generation: state.generation, active: true, observedAt: now, now: now, authority: "revenuecat")
    XCTAssertTrue(state.access)
    XCTAssertTrue(state.hasCurrentAccess(now: now))
    XCTAssertFalse(state.hasCurrentAccess(now: now.addingTimeInterval(61)))
    XCTAssertEqual(state.subscriptionProjection(now: now), .active)
    XCTAssertEqual(state.subscriptionProjection(now: now.addingTimeInterval(60)), .unknown)
    state.purchaseCallback(id: "transaction-1", result: .failed, generation: state.generation)
    XCTAssertEqual(state.outcome, .purchased)
    try state.logout(anonymousID: "anonymous-2")
    XCTAssertFalse(state.access); XCTAssertNil(state.exposure)
    try state.identify("account-1")
    XCTAssertFalse(state.access)
    try state.observeEntitlement(subject: "account-1", generation: state.generation, active: true, observedAt: now, now: now, authority: "revenuecat")
    XCTAssertTrue(state.access)
  }
  func testCancellationPendingErrorAndWrongOwnershipNeverGrant() throws {
    for result in [EntitlementState.PurchaseOutcome.cancelled, .pending, .failed, .purchased] {
      var state = EntitlementState(anonymousID: "a")
      state.purchaseCallback(id: "callback", result: result, generation: 0)
      XCTAssertFalse(state.access)
      XCTAssertThrowsError(try state.present(assignmentID: "assignment", owner: "revenuecat", now: now))
      XCTAssertThrowsError(try state.observeEntitlement(subject: "a", generation: 0, active: true, observedAt: now, now: now, authority: "superwall"))
    }
  }
  func testOldIdentityAndStaleReadbackRefused() throws {
    var state = EntitlementState(anonymousID: "a")
    try state.identify("b")
    state.purchaseCallback(id: "old", result: .purchased, generation: 0)
    XCTAssertNil(state.outcome)
    XCTAssertThrowsError(try state.observeEntitlement(subject: "a", generation: 0, active: true, observedAt: now, now: now, authority: "revenuecat"))
    XCTAssertThrowsError(try state.observeEntitlement(subject: "b", generation: 1, active: true, observedAt: now.addingTimeInterval(-61), now: now, authority: "revenuecat"))
    XCTAssertFalse(state.access)
  }
}
