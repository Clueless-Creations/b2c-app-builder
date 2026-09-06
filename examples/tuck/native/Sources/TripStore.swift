import Foundation
import SwiftUI

protocol TripPersistence {
    var hasBackup: Bool { get }
    func load() throws -> (trips: [Trip], recovered: Bool)
    func save(_ trips: [Trip]) throws
    func restoreBackup() throws -> [Trip]
    func erase() throws
}

final class FileTripPersistence: TripPersistence {
    static let maximumBackupBytes = 5 * 1024 * 1024
    let directory: URL
    var failWrites = false
    var primaryURL: URL { directory.appendingPathComponent("trips.json") }
    var backupURL: URL { directory.appendingPathComponent("trips.backup.json") }
    var hasBackup: Bool { (try? read(backupURL)) != nil }
    private let files: FileManager

    init(directory: URL, files: FileManager = .default) { self.directory = directory; self.files = files }

    static func encode(_ trips: [Trip]) throws -> Data {
        _ = try TripEnvelope(trips: trips).validated()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(TripEnvelope(trips: trips))
        guard data.count <= maximumBackupBytes else { throw StorageFailure.tooLarge }
        return data
    }

    static func decode(_ data: Data) throws -> [Trip] {
        guard data.count <= maximumBackupBytes else { throw StorageFailure.tooLarge }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        do { return try decoder.decode(TripEnvelope.self, from: data).validated() }
        catch let error as StorageFailure { throw error }
        catch { throw StorageFailure.invalidData }
    }

    func load() throws -> (trips: [Trip], recovered: Bool) {
        guard files.fileExists(atPath: primaryURL.path) else {
            if files.fileExists(atPath: backupURL.path) { return (try read(backupURL), true) }
            return ([], false)
        }
        do { return (try read(primaryURL), false) }
        catch {
            if let trips = try? read(backupURL) { return (trips, true) }
            throw StorageFailure.cannotRead
        }
    }

    func save(_ trips: [Trip]) throws {
        guard !failWrites else { throw StorageFailure.cannotSave }
        let data = try Self.encode(trips)
        do {
            try files.createDirectory(at: directory, withIntermediateDirectories: true)
            try preserveRecoveryFiles()
            // Preserve only a valid previous snapshot. A corrupt primary never replaces a good backup.
            if let previous = try? Data(contentsOf: primaryURL), (try? Self.decode(previous)) != nil {
                try previous.write(to: backupURL, options: .atomic)
            }
            try data.write(to: primaryURL, options: .atomic)
        } catch { throw StorageFailure.cannotSave }
    }

    func restoreBackup() throws -> [Trip] {
        let trips = try read(backupURL)
        guard !failWrites else { throw StorageFailure.cannotSave }
        // Restoring writes only the primary so the known-good backup stays available.
        do {
            try preserveRecoveryFiles()
            try Self.encode(trips).write(to: primaryURL, options: .atomic)
        }
        catch { throw StorageFailure.cannotSave }
        return trips
    }

    func erase() throws {
        guard !failWrites else { throw StorageFailure.cannotSave }
        if files.fileExists(atPath: directory.path) { try files.removeItem(at: directory) }
    }

    private func read(_ url: URL) throws -> [Trip] {
        let attributes = try files.attributesOfItem(atPath: url.path)
        if let size = attributes[.size] as? NSNumber, size.intValue > Self.maximumBackupBytes { throw StorageFailure.tooLarge }
        return try Self.decode(Data(contentsOf: url))
    }

    private func preserveRecoveryFiles() throws {
        let existing = [primaryURL, backupURL].filter { files.fileExists(atPath: $0.path) }
        guard existing.contains(where: { (try? read($0)) == nil }) else { return }
        // Keep the damaged bytes and their companion snapshot before any repair. Later edits never rotate these copies.
        let recovery = directory.appendingPathComponent("Recovery", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true)
        try files.createDirectory(at: recovery, withIntermediateDirectories: true)
        for source in existing { try files.copyItem(at: source, to: recovery.appendingPathComponent(source.lastPathComponent)) }
    }
}

enum TuckPreferences {
    static var packingListKey: String { ProcessInfo.processInfo.arguments.contains("--uitesting") ? "UITesting.packingUsesList" : "packingUsesList" }
}

struct StoreMessage: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
}

@MainActor final class TripStore: ObservableObject {
    @Published private(set) var trips: [Trip] = []
    @Published private(set) var undoLabel: String?
    @Published var message: StoreMessage?
    @Published private(set) var needsRecovery = false
    private var undoTrips: [Trip]?
    private let persistence: TripPersistence

    init(persistence: TripPersistence) {
        self.persistence = persistence
        do {
            let result = try persistence.load()
            trips = result.trips
            if result.recovered { message = StoreMessage(title: "Your backup is here", detail: "We recovered your previous saved trips. Check the latest packing changes before you head out.") }
        } catch {
            needsRecovery = true
            message = StoreMessage(title: "Let’s recover your trips", detail: error.localizedDescription)
        }
    }

    convenience init() {
        let files = FileManager.default
        let base = files.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Tuck", isDirectory: true)
        let arguments = ProcessInfo.processInfo.arguments
        let directory = arguments.contains("--uitesting") ? base.appendingPathComponent("UITesting", isDirectory: true) : base
        if arguments.contains("--uitesting") && arguments.contains("--reset") {
            try? files.removeItem(at: directory)
            UserDefaults.standard.removeObject(forKey: TuckPreferences.packingListKey)
        }
        let disk = FileTripPersistence(directory: directory)
        disk.failWrites = arguments.contains("--uitesting") && arguments.contains("--save-failure")
        self.init(persistence: disk)
    }

    func trip(_ id: UUID) -> Trip? { trips.first { $0.id == id } }
    var hasBackup: Bool { persistence.hasBackup }

    @discardableResult func createTrip(name: String, nights: Int, kind: TripKind) -> UUID? {
        let trip = Trip.make(name: name, nights: nights, kind: kind)
        return commit("Trip created") { $0.insert(trip, at: 0) } ? trip.id : nil
    }

    @discardableResult func updateTrip(id: UUID, name: String, nights: Int, kind: TripKind) -> Bool {
        commit("Trip details changed") { trips in
            guard let index = trips.firstIndex(where: { $0.id == id }) else { return }
            trips[index].name = name.trimmingCharacters(in: .whitespacesAndNewlines)
            trips[index].nights = nights; trips[index].kind = kind; trips[index].updatedAt = Date()
        }
    }

    /// Every interaction path invokes the same state transition and durable write.
    @discardableResult func setPacked(tripID: UUID, itemID: UUID, packed: Bool) -> Bool {
        guard let trip = trip(tripID), let item = trip.items.first(where: { $0.id == itemID }), item.isPacked != packed else { return false }
        return commit(packed ? "\(item.name) packed" : "\(item.name) unpacked") { trips in
            guard let t = trips.firstIndex(where: { $0.id == tripID }), let i = trips[t].items.firstIndex(where: { $0.id == itemID }) else { return }
            trips[t].items[i].isPacked = packed; trips[t].updatedAt = Date()
        }
    }

    @discardableResult func saveItem(_ item: PackingItem, tripID: UUID) -> Bool {
        commit("Packing list updated") { trips in
            guard let index = trips.firstIndex(where: { $0.id == tripID }) else { return }
            if let itemIndex = trips[index].items.firstIndex(where: { $0.id == item.id }) { trips[index].items[itemIndex] = item }
            else { trips[index].items.append(item) }
            trips[index].updatedAt = Date()
        }
    }

    @discardableResult func deleteItem(_ itemID: UUID, tripID: UUID) -> Bool {
        commit("Item removed") { trips in
            guard let index = trips.firstIndex(where: { $0.id == tripID }) else { return }
            trips[index].items.removeAll { $0.id == itemID }; trips[index].updatedAt = Date()
        }
    }

    func duplicateTrip(_ tripID: UUID) -> UUID? {
        guard var copy = trip(tripID) else { return nil }
        copy.id = UUID(); copy.name = String(copy.name.prefix(49)) + " again"; copy.isArchived = false; copy.createdAt = Date(); copy.updatedAt = Date()
        copy.items = copy.items.map { item in var next = item; next.id = UUID(); next.isPacked = false; return next }
        return commit("Fresh packing list made") { $0.insert(copy, at: 0) } ? copy.id : nil
    }

    @discardableResult func setArchived(_ tripID: UUID, archived: Bool) -> Bool {
        commit(archived ? "Trip put away" : "Trip brought back") { trips in
            guard let index = trips.firstIndex(where: { $0.id == tripID }) else { return }
            trips[index].isArchived = archived
        }
    }

    @discardableResult func deleteTrip(_ tripID: UUID) -> Bool { commit("Trip deleted") { $0.removeAll { $0.id == tripID } } }

    @discardableResult func undo() -> Bool {
        guard let previous = undoTrips else { return false }
        do { try persistence.save(previous); trips = previous; undoTrips = nil; undoLabel = nil; return true }
        catch { message = StoreMessage(title: "Couldn’t undo yet", detail: error.localizedDescription); return false }
    }

    func dismissUndo() { undoTrips = nil; undoLabel = nil }

    func exportData() throws -> Data { try FileTripPersistence.encode(trips) }

    @discardableResult func importData(_ data: Data) -> Bool {
        do {
            let incoming = try FileTripPersistence.decode(data)
            let wasRecovering = needsRecovery
            try persistence.save(incoming)
            let canRestorePreviousSave = persistence.hasBackup
            undoTrips = wasRecovering ? nil : trips
            undoLabel = wasRecovering ? nil : "Backup imported"
            trips = incoming
            needsRecovery = false
            let importSummary = "Imported \(incoming.count) \(incoming.count == 1 ? "trip" : "trips")."
            let recoverySummary: String
            if canRestorePreviousSave {
                recoverySummary = "Your previous saved collection is available through Restore previous save until your next change."
            } else if wasRecovering {
                recoverySummary = "The unreadable saved files were kept for recovery. No previous valid collection is available to restore."
            } else {
                recoverySummary = "No previous saved collection is available to restore."
            }
            message = StoreMessage(title: "Your trips are unpacked", detail: "\(importSummary) \(recoverySummary)")
            return true
        } catch { message = StoreMessage(title: "Couldn’t import this file", detail: error.localizedDescription); return false }
    }

    func restoreBackup() {
        guard persistence.hasBackup else {
            message = StoreMessage(title: "No previous backup yet", detail: "No valid previous saved collection is available. Your current trips are unchanged.")
            return
        }
        do {
            trips = try persistence.restoreBackup(); needsRecovery = false; undoTrips = nil; undoLabel = nil
            message = StoreMessage(title: "Previous backup restored", detail: "Your trips are back. Check the latest packing changes before you head out.")
        } catch { message = StoreMessage(title: "Backup couldn’t be restored", detail: "We couldn’t read the previous backup. Your saved files have been kept. You can still import an exported Tuck backup.") }
    }

    @discardableResult func deleteAll() -> Bool {
        do { try persistence.erase(); trips = []; undoTrips = nil; undoLabel = nil; needsRecovery = false; return true }
        catch { message = StoreMessage(title: "Couldn’t clear your trips", detail: error.localizedDescription); return false }
    }

    private func commit(_ label: String, change: (inout [Trip]) -> Void) -> Bool {
        guard !needsRecovery else { message = StoreMessage(title: "Recover your trips first", detail: "Open Settings to import an exported backup or restore one when available. Your existing saved files have not been overwritten."); return false }
        var next = trips; change(&next)
        guard next != trips else { return false }
        do {
            try persistence.save(next)
            undoTrips = trips; undoLabel = label; trips = next
            return true
        } catch { message = StoreMessage(title: "That change wasn’t saved", detail: error.localizedDescription); return false }
    }
}
