// SYNTHETIC FIXTURE: an invented test file for batch intake tests. It is inventory, never executed.
import XCTest

final class CardStackTests: XCTestCase {
  func testLimit() {
    XCTAssertEqual(CardStack().limit, 3)
  }
}
