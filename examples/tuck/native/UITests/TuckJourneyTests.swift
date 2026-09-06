import XCTest

final class TuckJourneyTests: XCTestCase {
    private var app: XCUIApplication!
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--reset"]
        app.launch()
    }

    func testCreatePackUndoAndRelaunch() throws {
        capture("trip-collection-empty")
        createTrip("Lisbon weekend")
        capture("packing-table-default")
        firstPackingItem.tap()
        XCTAssertTrue(app.staticTexts["packingProgress"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["packingProgress"].label.hasPrefix("1 of"))
        capture("packing-table-packed-one")
        app.buttons["undoAction"].tap()
        XCTAssertTrue(app.staticTexts["packingProgress"].label.hasPrefix("0 of"))
        firstPackingItem.tap()
        app.terminate()
        app.launchArguments = ["--uitesting"]
        app.launch()
        let trip = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "trip-")).firstMatch
        XCTAssertTrue(trip.waitForExistence(timeout: 5)); trip.tap()
        XCTAssertTrue(app.staticTexts["packingTripTitle"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["packingProgress"].label.hasPrefix("1 of"))
        capture("packing-table-relaunched")
    }

    func testAddAndEditPersonalItem() throws {
        createTrip("A few days away")
        reveal(app.buttons["addItem"])
        app.buttons["addItem"].tap()
        let field = app.textFields["itemName"]
        XCTAssertTrue(field.waitForExistence(timeout: 3)); field.tap(); field.typeText("Camera battery")
        capture("item-editor-personal-item")
        app.buttons["saveItem"].tap()
        XCTAssertTrue(app.staticTexts["packingTripTitle"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["packingProgress"].label.contains("of 14"))
        reveal(app.buttons.matching(NSPredicate(format: "label == %@", "Edit Camera battery")).firstMatch)
        app.buttons.matching(NSPredicate(format: "label == %@", "Edit Camera battery")).firstMatch.tap()
        XCTAssertEqual(app.textFields["itemName"].value as? String, "Camera battery")
        let name = app.textFields["itemName"]; name.tap()
        name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: "Camera battery".count) + "Spare camera battery")
        app.buttons["saveItem"].tap()
        XCTAssertTrue(app.staticTexts["Spare camera battery"].waitForExistence(timeout: 3))
    }

    func testCompleteAndDuplicateKeepsOriginal() throws {
        createTrip("Sunday by the sea")
        for _ in 0..<13 {
            let item = firstPackingItem
            XCTAssertTrue(item.waitForExistence(timeout: 3)); reveal(item); item.tap()
        }
        XCTAssertTrue(app.otherElements["completeBag"].waitForExistence(timeout: 4))
        capture("complete-bag")
        reveal(app.buttons["packAgain"]); app.buttons["packAgain"].tap()
        XCTAssertTrue(app.staticTexts["packingTripTitle"].waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["packingTripTitle"].label.hasSuffix("again"))
        XCTAssertTrue(app.staticTexts["packingProgress"].label.hasPrefix("0 of"))
        app.buttons["backToTrips"].tap()
        XCTAssertTrue(app.otherElements["completeBag"].waitForExistence(timeout: 3))
    }

    func testFailedSaveKeepsTripInput() throws {
        app.terminate()
        app.launchArguments = ["--uitesting", "--reset", "--save-failure"]
        app.launch()
        app.buttons["createTrip"].tap()
        let name = app.textFields["tripName"]
        XCTAssertTrue(name.waitForExistence(timeout: 3)); name.tap(); name.typeText("A trip worth keeping")
        app.buttons["saveTrip"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 3))
        capture("trip-editor-save-error")
        app.alerts.buttons["Got it"].tap()
        XCTAssertEqual(name.value as? String, "A trip worth keeping")
        XCTAssertTrue(app.buttons["saveTrip"].exists)
    }

    func testBackupOptionsAreAvailableWithoutAccount() throws {
        app.buttons["openSettings"].tap()
        XCTAssertTrue(app.buttons["exportBackup"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["importBackup"].exists)
        XCTAssertTrue(app.buttons["restoreBackup"].exists)
        capture("data-settings")
    }

    func testLargeTextKeepsPackingAndEditingAvailable() throws {
        app.terminate()
        app.launchArguments = ["--uitesting", "--reset", "--large-text"]
        app.launch()
        capture("trip-collection-large-text")
        createTrip("A slower weekend")
        XCTAssertFalse(app.buttons["toggleList"].exists, "Accessibility text sizes must use the full labeled list")
        reveal(firstPackingItem); firstPackingItem.tap()
        scrollToTop()
        XCTAssertTrue(app.staticTexts["packingProgress"].label.hasPrefix("1 of"))
        capture("packing-table-large-text")
        reveal(app.buttons["addItem"]); app.buttons["addItem"].tap()
        XCTAssertTrue(app.textFields["itemName"].waitForExistence(timeout: 3))
        capture("item-editor-large-text")
    }

    func testReducedMotionRetainsPackAndUndoBehavior() throws {
        app.terminate()
        app.launchArguments = ["--uitesting", "--reset", "--reduce-motion"]
        app.launch()
        capture("trip-collection-reduced-motion")
        createTrip("A quiet escape")
        firstPackingItem.tap()
        XCTAssertTrue(app.staticTexts["packingProgress"].label.hasPrefix("1 of"))
        capture("packing-table-reduced-motion-packed")
        app.buttons["undoAction"].tap()
        XCTAssertTrue(app.staticTexts["packingProgress"].label.hasPrefix("0 of"))
        capture("packing-table-reduced-motion-restored")
    }

    func testListViewRetainsPackingAndEditing() throws {
        createTrip("A labeled list")
        app.buttons["toggleList"].tap()
        XCTAssertTrue(firstPackingItem.waitForExistence(timeout: 3))
        firstPackingItem.tap()
        XCTAssertTrue(app.staticTexts["packingProgress"].label.hasPrefix("1 of"))
        capture("packing-list-default")
        let edit = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "editItem-")).firstMatch
        reveal(edit); edit.tap()
        XCTAssertTrue(app.textFields["itemName"].waitForExistence(timeout: 3))
        app.buttons["Cancel"].tap()
        XCTAssertTrue(firstPackingItem.waitForExistence(timeout: 3))
        scrollToTop()
        app.buttons["toggleList"].tap()
        XCTAssertTrue(firstPackingItem.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["packingProgress"].label.hasPrefix("1 of"))
    }

    func testPackingAccessibilityAudit() throws {
        createTrip("A well considered trip")
        continueAfterFailure = true
        defer { continueAfterFailure = false }
        try auditCurrentScreen("packing grid")
        capture("packing-grid-accessibility-audit")
        app.buttons["filter-packed"].tap()
        try auditCurrentScreen("empty packed filter")
        capture("packing-empty-filter-accessibility-audit")
        app.buttons["filter-remaining"].tap()
        app.buttons["toggleList"].tap()
        try auditCurrentScreen("packing list")
        capture("packing-list-accessibility-audit")
    }

    func testPackingListScalesAcrossEveryDynamicTypeSize() throws {
        createTrip("A type-tested trip")
        app.buttons["toggleList"].tap()
        let sizes = ["xSmall", "small", "medium", "large", "xLarge", "xxLarge", "xxxLarge", "accessibility1", "accessibility2", "accessibility3", "accessibility4", "accessibility5"]
        var nameHeights: [CGFloat] = []
        var quantityHeights: [CGFloat] = []
        var receipt: [String] = []

        for size in sizes {
            app.terminate()
            app.launchArguments = ["--uitesting", "--dynamic-type=\(size)"]
            app.launch()
            let trip = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "trip-")).firstMatch
            XCTAssertTrue(trip.waitForExistence(timeout: 4), "The saved trip must remain available at \(size)")
            trip.tap()

            let name = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "packingItemName-")).firstMatch
            let quantity = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "packingItemQuantity-")).firstMatch
            let packingControl = firstPackingItem
            reveal(packingControl)
            XCTAssertTrue(name.waitForExistence(timeout: 3), "The item name must render at \(size)")
            XCTAssertTrue(quantity.waitForExistence(timeout: 3), "The quantity must render at \(size)")
            XCTAssertTrue(packingControl.isHittable, "Packing must remain operable at \(size)")
            XCTAssertFalse(name.label.isEmpty)
            XCTAssertTrue(quantity.label.hasPrefix("Bring "))
            nameHeights.append(name.frame.height)
            quantityHeights.append(quantity.frame.height)
            receipt.append("\(size): name=\(name.frame.height), quantity=\(quantity.frame.height), control=\(packingControl.frame.height)")
            if size == "accessibility5" {
                let edit = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "editItem-")).firstMatch
                XCTAssertTrue(edit.exists, "Editing must remain available at the largest accessibility size")
                XCTAssertFalse(name.frame.intersects(edit.frame), "The full-width item name and edit action must not overlap")
                XCTAssertGreaterThanOrEqual(edit.frame.minY, name.frame.maxY, "The edit action must sit below the item’s full-width text lane")
                XCTAssertLessThan(name.frame.height, quantity.frame.height * 1.6, "The one-word item name must not break across lines at the largest accessibility size")

                let names = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "packingItemName-"))
                let quantities = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "packingItemQuantity-"))
                let edits = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "editItem-"))
                XCTAssertGreaterThanOrEqual(names.count, 2, "Two item rows must be available for the largest-text layout check")
                XCTAssertGreaterThanOrEqual(quantities.count, 2)
                XCTAssertGreaterThanOrEqual(edits.count, 2)
                if names.count >= 2, quantities.count >= 2, edits.count >= 2 {
                    let secondName = names.element(boundBy: 1)
                    let secondQuantity = quantities.element(boundBy: 1)
                    let secondEdit = edits.element(boundBy: 1)
                    reveal(secondEdit)
                    XCTAssertLessThan(secondName.frame.height, secondQuantity.frame.height * 1.6, "The second one-word item name must not break across lines at the largest accessibility size")
                    XCTAssertFalse(secondName.frame.intersects(secondEdit.frame))
                }
            }
            if size == sizes.first || size == sizes.last { capture("packing-list-dynamic-type-\(size)") }
        }

        for index in 1..<sizes.count {
            XCTAssertGreaterThanOrEqual(nameHeights[index] + 0.01, nameHeights[index - 1], "Item names must not shrink as Dynamic Type grows")
            XCTAssertGreaterThanOrEqual(quantityHeights[index] + 0.01, quantityHeights[index - 1], "Quantity captions must not shrink as Dynamic Type grows")
        }
        XCTAssertGreaterThan(nameHeights.last ?? 0, (nameHeights.first ?? 0) * 2, "Item names must materially scale across the full Dynamic Type range")
        XCTAssertGreaterThan(quantityHeights.last ?? 0, (quantityHeights.first ?? 0) * 2, "Quantity captions must materially scale across the full Dynamic Type range")
        XCTAssertGreaterThanOrEqual(Set(nameHeights.map { Int(($0 * 10).rounded()) }).count, 10)
        XCTAssertGreaterThanOrEqual(Set(quantityHeights.map { Int(($0 * 10).rounded()) }).count, 10)
        let detail = XCTAttachment(string: receipt.joined(separator: "\n"))
        detail.name = "packing-list-dynamic-type-receipt"
        detail.lifetime = .keepAlways
        add(detail)
    }

    private var firstPackingItem: XCUIElement { app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "packingItem-")).firstMatch }
    private func auditCurrentScreen(_ name: String) throws {
        try app.performAccessibilityAudit { issue in
            let elementDescription = issue.element?.debugDescription ?? "No element supplied by the audit"
            let detail = XCTAttachment(string: "\(issue.compactDescription)\n\(issue.detailedDescription)\n\(elementDescription)")
            detail.name = "\(name) accessibility issue"
            detail.lifetime = .keepAlways
            self.add(detail)
            if issue.auditType == .dynamicType,
               issue.element?.elementType == .staticText,
               let identifier = issue.element?.identifier,
               identifier.hasPrefix("packingItemName-") || identifier.hasPrefix("packingItemQuantity-") ||
               identifier.hasPrefix("packingGridItemName-") || identifier.hasPrefix("packingGridItemQuantity-") {
                return true
            }
            return false
        }
    }
    private func createTrip(_ name: String) {
        XCTAssertTrue(app.buttons["createTrip"].waitForExistence(timeout: 4)); reveal(app.buttons["createTrip"]); app.buttons["createTrip"].tap()
        let field = app.textFields["tripName"]
        XCTAssertTrue(field.waitForExistence(timeout: 3)); field.tap(); field.typeText(name)
        capture("trip-editor-filled")
        app.buttons["saveTrip"].tap()
        XCTAssertTrue(app.staticTexts["packingTripTitle"].waitForExistence(timeout: 4))
        XCTAssertEqual(app.staticTexts["packingTripTitle"].label, name)
    }
    private func reveal(_ element: XCUIElement) {
        for _ in 0..<12 {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
    }
    private func scrollToTop() {
        for _ in 0..<12 {
            if app.staticTexts["packingTripTitle"].isHittable { return }
            app.swipeDown()
        }
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
