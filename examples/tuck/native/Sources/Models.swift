import Foundation

enum TripKind: String, Codable, CaseIterable, Identifiable {
    case city, coast, outdoors, work
    var id: String { rawValue }
    var title: String {
        switch self { case .city: return "City break"; case .coast: return "By the coast"; case .outdoors: return "Outdoors"; case .work: return "Work trip" }
    }
    var shortTitle: String {
        switch self { case .city: return "CITY BREAK"; case .coast: return "COASTAL DAYS"; case .outdoors: return "FRESH AIR"; case .work: return "ON THE CLOCK" }
    }
    var objectID: String {
        switch self { case .city: return "glasses"; case .coast: return "hat"; case .outdoors: return "bottle"; case .work: return "headphones" }
    }
}

enum ItemCategory: String, Codable, CaseIterable, Identifiable {
    case clothes, care, essentials, extras
    var id: String { rawValue }
    var title: String {
        switch self { case .clothes: return "What you’ll wear"; case .care: return "Freshen up"; case .essentials: return "Don’t leave without"; case .extras: return "Little comforts" }
    }
    var shortTitle: String {
        switch self { case .clothes: return "Clothes"; case .care: return "Personal care"; case .essentials: return "Essentials"; case .extras: return "Extras" }
    }
}

struct PackingItem: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var objectID: String
    var name: String
    var quantity: Int = 1
    var category: ItemCategory
    var isPacked: Bool = false
}

struct Trip: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var name: String
    var nights: Int
    var kind: TripKind
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    var isArchived: Bool = false
    var items: [PackingItem]

    var packedCount: Int { items.filter(\.isPacked).count }
    var remainingCount: Int { items.count - packedCount }
    var isComplete: Bool { !items.isEmpty && remainingCount == 0 }
    var progress: Double { items.isEmpty ? 0 : Double(packedCount) / Double(items.count) }
    var nightLabel: String { "\(nights) \(nights == 1 ? "night" : "nights")" }

    static func make(name: String, nights: Int, kind: TripKind) -> Trip {
        let clothes = min(nights + 1, 7)
        var items: [PackingItem] = [
            .init(objectID: "tshirt", name: "T-shirts", quantity: clothes, category: .clothes),
            .init(objectID: "pants", name: "Trousers", quantity: nights > 3 ? 2 : 1, category: .clothes),
            .init(objectID: "sweater", name: "A warm layer", category: .clothes),
            .init(objectID: "socks", name: "Socks & underwear", quantity: clothes, category: .clothes),
            .init(objectID: "shoes", name: "Everyday shoes", category: .clothes),
            .init(objectID: "washbag", name: "Wash bag", category: .care),
            .init(objectID: "toothbrush", name: "Toothbrush", category: .care),
            .init(objectID: "sunscreen", name: "Sunscreen", category: .care),
            .init(objectID: "passport", name: "ID & travel documents", category: .essentials),
            .init(objectID: "charger", name: "Phone charger", category: .essentials),
            .init(objectID: "bottle", name: "Water bottle", category: .essentials),
            .init(objectID: "headphones", name: "Headphones", category: .extras),
            .init(objectID: "book", name: "Something to read", category: .extras),
        ]
        if kind == .coast || kind == .outdoors {
            items.append(.init(objectID: "hat", name: "Sun hat", category: .clothes))
            items.append(.init(objectID: "glasses", name: "Sunglasses", category: .extras))
        }
        if kind == .work { items.append(.init(objectID: "custom", name: "Laptop & its charger", category: .essentials)) }
        return Trip(name: name.trimmingCharacters(in: .whitespacesAndNewlines), nights: nights, kind: kind, items: items)
    }

    var shareText: String {
        var lines = ["\(name) — \(nightLabel)", "\(packedCount) of \(items.count) packed", ""]
        for category in ItemCategory.allCases {
            let group = items.filter { $0.category == category }
            guard !group.isEmpty else { continue }
            lines.append(category.shortTitle)
            lines.append(contentsOf: group.map { "\($0.isPacked ? "[x]" : "[ ]") \($0.name)\($0.quantity > 1 ? " × \($0.quantity)" : "")" })
            lines.append("")
        }
        return lines.joined(separator: "\n")
    }
}

struct TripEnvelope: Codable, Equatable {
    let version: Int
    var trips: [Trip]
    init(trips: [Trip]) { version = 1; self.trips = trips }

    func validated() throws -> [Trip] {
        guard version == 1 else { throw StorageFailure.unsupportedVersion }
        guard trips.count <= 200, Set(trips.map(\.id)).count == trips.count else { throw StorageFailure.invalidData }
        for trip in trips {
            guard !trip.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, trip.name.count <= 60,
                  (1...30).contains(trip.nights), trip.items.count <= 200,
                  Set(trip.items.map(\.id)).count == trip.items.count else { throw StorageFailure.invalidData }
            for item in trip.items {
                guard !item.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, item.name.count <= 80,
                      (1...99).contains(item.quantity), item.objectID.count <= 60 else { throw StorageFailure.invalidData }
            }
        }
        return trips
    }
}

enum StorageFailure: LocalizedError {
    case invalidData, unsupportedVersion, tooLarge, cannotRead, cannotSave
    var errorDescription: String? {
        switch self {
        case .invalidData: return "This file isn’t a valid Tuck backup. Your current trips haven’t changed."
        case .unsupportedVersion: return "This backup comes from a newer version of Tuck. Your current trips haven’t changed."
        case .tooLarge: return "This file is too large to import. Choose a Tuck backup smaller than 5 MB."
        case .cannotRead: return "We couldn’t open your saved trips. Try restoring the previous backup, or import a backup you exported."
        case .cannotSave: return "We couldn’t save that change. Your previous packing list is safe. Free up some storage and try again."
        }
    }
}
