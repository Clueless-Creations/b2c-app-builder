// SYNTHETIC FIXTURE: not a real creator's repository
import XCTest
@testable import CardStack

final class CardStackTests: XCTestCase {
    func testTopCardHasNoOffsetAndBackCardsRecede() {
        XCTAssertEqual(cardStackOffset(index: 2, count: 3, spacing: 12), 0)
        XCTAssertEqual(cardStackOffset(index: 0, count: 3, spacing: 12), 24)
        XCTAssertEqual(cardStackScale(index: 2, count: 3), 1)
        XCTAssertEqual(cardStackScale(index: 0, count: 3), 0.94, accuracy: 0.0001)
        XCTAssertEqual(cardStackOffset(index: 5, count: 3, spacing: 12), 0)
    }
}
