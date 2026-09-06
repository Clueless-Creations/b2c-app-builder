import XCTest
@testable import Tuck

private final class MemoryPersistence: TripPersistence {
    var trips: [Trip] = []
    var previous: [Trip] = []
    var writes = 0
    var shouldFail = false
    var hasBackup: Bool { writes > 1 }
    func load() throws -> (trips: [Trip], recovered: Bool) { (trips, false) }
    func save(_ next: [Trip]) throws {
        guard !shouldFail else { throw StorageFailure.cannotSave }
        _ = try TripEnvelope(trips: next).validated()
        previous = trips; trips = next; writes += 1
    }
    func restoreBackup() throws -> [Trip] { guard !shouldFail else { throw StorageFailure.cannotSave }; trips = previous; return previous }
    func erase() throws { guard !shouldFail else { throw StorageFailure.cannotSave }; trips = []; previous = [] }
}

final class TripStoreTests: XCTestCase {
    func testTripPresetTailorsQuantitiesAndObjectsWithoutDuplicateIdentity() throws {
        let coast = Trip.make(name: "  Comporta  ", nights: 5, kind: .coast)
        XCTAssertEqual(coast.name, "Comporta")
        XCTAssertEqual(coast.items.first(where: { $0.objectID == "tshirt" })?.quantity, 6)
        XCTAssertTrue(coast.items.contains { $0.objectID == "hat" })
        XCTAssertEqual(Set(coast.items.map(\.id)).count, coast.items.count)
        let work = Trip.make(name: "Copenhagen", nights: 2, kind: .work)
        XCTAssertTrue(work.items.contains { $0.name == "Laptop & its charger" })
        XCTAssertFalse(work.items.contains { $0.objectID == "hat" })
        XCTAssertFalse(Trip(name: "Empty", nights: 1, kind: .city, items: []).isComplete)
    }

    @MainActor func testPackCommandIsIdempotentAndUndoRestoresDurableState() throws {
        let persistence = MemoryPersistence()
        let store = TripStore(persistence: persistence)
        let tripID = try XCTUnwrap(store.createTrip(name: "Lisbon", nights: 3, kind: .city))
        let itemID = try XCTUnwrap(store.trip(tripID)?.items.first?.id)
        XCTAssertTrue(store.setPacked(tripID: tripID, itemID: itemID, packed: true))
        XCTAssertEqual(store.trip(tripID)?.packedCount, 1)
        let writes = persistence.writes
        XCTAssertFalse(store.setPacked(tripID: tripID, itemID: itemID, packed: true))
        XCTAssertEqual(persistence.writes, writes)
        XCTAssertTrue(store.undo())
        XCTAssertEqual(store.trip(tripID)?.packedCount, 0)
        XCTAssertEqual(persistence.trips.first?.packedCount, 0)
        XCTAssertNil(store.undoLabel)
    }

    @MainActor func testFailedSavePreservesCurrentStateAndPreviousUndo() throws {
        let persistence = MemoryPersistence()
        let store = TripStore(persistence: persistence)
        let id = try XCTUnwrap(store.createTrip(name: "Lisbon", nights: 3, kind: .city))
        let before = store.trips
        persistence.shouldFail = true
        XCTAssertFalse(store.setPacked(tripID: id, itemID: before[0].items[0].id, packed: true))
        XCTAssertEqual(store.trips, before)
        XCTAssertEqual(persistence.trips, before)
        XCTAssertEqual(store.undoLabel, "Trip created")
        XCTAssertEqual(store.message?.title, "That change wasn’t saved")
    }

    @MainActor func testDuplicateIsFreshAndOriginalRemainsPacked() throws {
        let store = TripStore(persistence: MemoryPersistence())
        let id = try XCTUnwrap(store.createTrip(name: "Porto", nights: 2, kind: .coast))
        let original = try XCTUnwrap(store.trip(id))
        for item in original.items { XCTAssertTrue(store.setPacked(tripID: id, itemID: item.id, packed: true)) }
        let duplicateID = try XCTUnwrap(store.duplicateTrip(id))
        let duplicate = try XCTUnwrap(store.trip(duplicateID))
        XCTAssertTrue(try XCTUnwrap(store.trip(id)).isComplete)
        XCTAssertEqual(duplicate.packedCount, 0)
        XCTAssertEqual(duplicate.items.map(\.name), original.items.map(\.name))
        XCTAssertTrue(Set(duplicate.items.map(\.id)).isDisjoint(with: original.items.map(\.id)))
    }

    @MainActor func testEditingTripPreservesPersonalizedItemsAndPackedState() throws {
        let store = TripStore(persistence: MemoryPersistence())
        let id = try XCTUnwrap(store.createTrip(name: "York", nights: 2, kind: .city))
        let item = PackingItem(objectID: "custom", name: "Camera battery", quantity: 2, category: .extras, isPacked: true)
        XCTAssertTrue(store.saveItem(item, tripID: id))
        let before = try XCTUnwrap(store.trip(id)).items
        XCTAssertTrue(store.updateTrip(id: id, name: "A longer York trip", nights: 5, kind: .outdoors))
        XCTAssertEqual(store.trip(id)?.items, before)
        XCTAssertTrue(store.deleteItem(item.id, tripID: id))
        XCTAssertTrue(store.undo())
        XCTAssertTrue(try XCTUnwrap(store.trip(id)).items.contains(item))
    }

    func testVersionedDiskRoundTripAndRecoveryFromCorruptPrimary() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let disk = FileTripPersistence(directory: directory)
        var trip = Trip.make(name: "Bath", nights: 2, kind: .city)
        try disk.save([trip])
        trip.items[0].isPacked = true
        try disk.save([trip])
        XCTAssertEqual(try disk.load().trips[0].packedCount, 1)
        try Data("malformed data".utf8).write(to: disk.primaryURL, options: .atomic)
        let recovered = try disk.load()
        XCTAssertTrue(recovered.recovered)
        XCTAssertEqual(recovered.trips[0].packedCount, 0)
        XCTAssertEqual(try disk.restoreBackup()[0].packedCount, 0)
        XCTAssertFalse(try disk.load().recovered)
    }

    @MainActor func testUnrecoverableStorageIsNotSilentlyOverwritten() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let disk = FileTripPersistence(directory: directory)
        let corrupt = Data("unreadable saved data".utf8)
        try corrupt.write(to: disk.primaryURL)
        let store = TripStore(persistence: disk)
        XCTAssertTrue(store.needsRecovery)
        XCTAssertNil(store.createTrip(name: "New", nights: 3, kind: .city))
        XCTAssertEqual(try Data(contentsOf: disk.primaryURL), corrupt)
    }

    @MainActor func testRecoveryImportWithoutValidBackupNeverOffersAnEmptyRestore() throws {
        let invalidBackup = Data("unreadable backup data".utf8)
        for backup in [Data?.none, invalidBackup] {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let disk = FileTripPersistence(directory: directory)
            let corruptPrimary = Data("unreadable primary data".utf8)
            try corruptPrimary.write(to: disk.primaryURL)
            if let backup { try backup.write(to: disk.backupURL) }

            let store = TripStore(persistence: disk)
            XCTAssertTrue(store.needsRecovery)
            XCTAssertFalse(store.hasBackup)
            let imported = Trip.make(name: "Recovered by import", nights: 2, kind: .city)
            XCTAssertTrue(store.importData(try FileTripPersistence.encode([imported])))

            XCTAssertFalse(store.needsRecovery)
            XCTAssertFalse(store.hasBackup, "An empty or invalid automatic backup must not become a restore point")
            XCTAssertNil(store.undoLabel, "The unreadable placeholder collection must not become an undo target")
            XCTAssertEqual(store.trips.map(\.id), [imported.id])
            XCTAssertEqual(store.message?.title, "Your trips are unpacked")
            XCTAssertTrue(store.message?.detail.contains("No previous valid collection is available to restore") == true)

            store.restoreBackup()
            XCTAssertEqual(store.message?.title, "No previous backup yet")
            XCTAssertEqual(store.trips.map(\.id), [imported.id])

            let relaunched = TripStore(persistence: FileTripPersistence(directory: directory))
            XCTAssertFalse(relaunched.needsRecovery)
            XCTAssertEqual(relaunched.trips.map(\.id), [imported.id])
            let recoveryRoot = directory.appendingPathComponent("Recovery", isDirectory: true)
            let snapshots = try FileManager.default.contentsOfDirectory(at: recoveryRoot, includingPropertiesForKeys: nil)
            XCTAssertEqual(snapshots.count, 1)
            XCTAssertEqual(try Data(contentsOf: snapshots[0].appendingPathComponent("trips.json")), corruptPrimary)
            if let backup {
                XCTAssertEqual(try Data(contentsOf: snapshots[0].appendingPathComponent("trips.backup.json")), backup)
            }
        }
    }

    @MainActor func testInvalidImportLeavesCurrentTripsAndUndoIntact() throws {
        let store = TripStore(persistence: MemoryPersistence())
        _ = store.createTrip(name: "Oxford", nights: 2, kind: .city)
        let before = store.trips
        XCTAssertFalse(store.importData(Data("{ not a backup }".utf8)))
        XCTAssertEqual(store.trips, before)
        XCTAssertEqual(store.undoLabel, "Trip created")
        let future = Data("{\"version\":2,\"trips\":[]}".utf8)
        XCTAssertFalse(store.importData(future))
        XCTAssertEqual(store.trips, before)
    }

    @MainActor func testValidatedImportReplacesCollectionAndUndoRestoresPreviousTrips() throws {
        let store = TripStore(persistence: MemoryPersistence())
        let id = try XCTUnwrap(store.createTrip(name: "Bristol", nights: 3, kind: .city))
        var old = try XCTUnwrap(store.trip(id)); old.name = "Old Bristol"; old.updatedAt = Date(timeIntervalSince1970: 1)
        let additional = Trip.make(name: "Cambridge", nights: 1, kind: .work)
        XCTAssertTrue(store.importData(try FileTripPersistence.encode([old, additional])))
        XCTAssertEqual(store.trips.map(\.id), [old.id, additional.id])
        XCTAssertEqual(store.trip(id)?.name, "Old Bristol")
        XCTAssertTrue(store.undo())
        XCTAssertEqual(store.trips.count, 1)
        XCTAssertEqual(store.trip(id)?.name, "Bristol")
    }

    @MainActor func testReplacementKeepsPreviousKnownGoodBackupAndRestoreSurvivesRelaunch() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let disk = FileTripPersistence(directory: directory)
        let store = TripStore(persistence: disk)
        let id = try XCTUnwrap(store.createTrip(name: "Before import", nights: 2, kind: .city))
        let itemID = try XCTUnwrap(store.trip(id)?.items.first?.id)
        XCTAssertTrue(store.setPacked(tripID: id, itemID: itemID, packed: true))
        let imported = Trip.make(name: "Imported trip", nights: 1, kind: .coast)
        XCTAssertTrue(store.importData(try FileTripPersistence.encode([imported])))
        XCTAssertEqual(store.trips.map(\.id), [imported.id])
        XCTAssertTrue(store.hasBackup)
        store.restoreBackup()
        let relaunched = TripStore(persistence: FileTripPersistence(directory: directory))
        XCTAssertEqual(relaunched.trips.map(\.id), [id])
        XCTAssertEqual(relaunched.trip(id)?.packedCount, 1)
        XCTAssertFalse(relaunched.needsRecovery)
    }

    @MainActor func testRecoveredDamagedBytesAndCompanionBackupSurviveSubsequentEdits() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let disk = FileTripPersistence(directory: directory)
        var trip = Trip.make(name: "Keep these trips", nights: 2, kind: .city)
        try disk.save([trip]); trip.items[0].isPacked = true; try disk.save([trip])
        let companion = try Data(contentsOf: disk.backupURL)
        let damaged = Data("original malformed bytes".utf8)
        try damaged.write(to: disk.primaryURL)
        let store = TripStore(persistence: disk)
        XCTAssertFalse(store.needsRecovery)
        XCTAssertTrue(store.updateTrip(id: trip.id, name: "Recovered and edited", nights: 2, kind: .city))
        XCTAssertTrue(store.updateTrip(id: trip.id, name: "Edited again", nights: 3, kind: .city))
        let snapshots = try FileManager.default.contentsOfDirectory(at: directory.appendingPathComponent("Recovery"), includingPropertiesForKeys: nil)
        XCTAssertEqual(snapshots.count, 1)
        XCTAssertEqual(try Data(contentsOf: snapshots[0].appendingPathComponent("trips.json")), damaged)
        XCTAssertEqual(try Data(contentsOf: snapshots[0].appendingPathComponent("trips.backup.json")), companion)
        XCTAssertEqual(try disk.load().trips[0].name, "Edited again")
    }

    func testExportNeverProducesAnOversizeUnimportableBackup() throws {
        let items = (0..<200).map { _ in PackingItem(objectID: String(repeating: "x", count: 60), name: String(repeating: "a", count: 80), category: .extras) }
        let trips = (0..<200).map { _ in Trip(name: "A fully customized trip", nights: 1, kind: .city, items: items) }
        XCTAssertThrowsError(try FileTripPersistence.encode(trips)) { error in
            XCTAssertEqual(error.localizedDescription, StorageFailure.tooLarge.localizedDescription)
        }
    }

    func testDuplicateIDsAndInvalidQuantitiesCannotEnterTheStore() throws {
        var trip = Trip.make(name: "Cambridge", nights: 1, kind: .city)
        trip.items.append(trip.items[0])
        XCTAssertThrowsError(try FileTripPersistence.encode([trip]))
        trip.items.removeLast(); trip.items[0].quantity = 0
        XCTAssertThrowsError(try FileTripPersistence.encode([trip]))
        XCTAssertThrowsError(try FileTripPersistence.decode(Data(repeating: 0, count: 5 * 1024 * 1024 + 1)))
    }

    @MainActor func testDeleteAllRemovesTripsAndAutomaticBackup() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let disk = FileTripPersistence(directory: directory)
        let store = TripStore(persistence: disk)
        let id = try XCTUnwrap(store.createTrip(name: "Brighton", nights: 2, kind: .coast))
        XCTAssertFalse(FileManager.default.fileExists(atPath: disk.backupURL.path), "A first save has no real previous collection to back up")
        let itemID = try XCTUnwrap(store.trip(id)?.items.first?.id)
        XCTAssertTrue(store.setPacked(tripID: id, itemID: itemID, packed: true))
        XCTAssertTrue(FileManager.default.fileExists(atPath: disk.backupURL.path))
        XCTAssertTrue(store.deleteAll())
        XCTAssertFalse(FileManager.default.fileExists(atPath: disk.primaryURL.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: disk.backupURL.path))
        XCTAssertTrue(try disk.load().trips.isEmpty)
    }
}
