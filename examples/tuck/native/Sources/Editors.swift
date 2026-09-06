import SwiftUI

struct TripEditor: View {
    @EnvironmentObject private var store: TripStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    private let existing: Trip?
    private let onSave: (UUID) -> Void
    @State private var name: String
    @State private var nights: Int
    @State private var kind: TripKind
    @FocusState private var nameFocused: Bool

    init(trip: Trip? = nil, onSave: @escaping (UUID) -> Void = { _ in }) {
        existing = trip; self.onSave = onSave
        _name = State(initialValue: trip?.name ?? "")
        _nights = State(initialValue: trip?.nights ?? 3)
        _kind = State(initialValue: trip?.kind ?? .city)
    }
    private var valid: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && name.count <= 60 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 30) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(existing == nil ? "Where are\nwe off to?" : "A change\nof plans?")
                            .font(TuckTheme.editorial(40)).tracking(-1).fixedSize(horizontal: false, vertical: true)
                        Text(existing == nil ? "A few details. A little less to remember." : "Your packing list stays just how you made it.")
                            .font(.body).foregroundStyle(TuckTheme.muted)
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        fieldLabel("NAME YOUR TRIP")
                        TextField("A weekend in Lisbon", text: $name)
                            .font(TuckTheme.editorial(25)).textInputAutocapitalization(.words)
                            .submitLabel(.done).focused($nameFocused).onSubmit { nameFocused = false }
                            .accessibilityIdentifier("tripName")
                            .padding(.vertical, 12)
                        StitchLine(color: name.count > 60 ? TuckTheme.orange : TuckTheme.ink)
                        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { Text("Give your trip a name to make its list.").font(.footnote).foregroundStyle(TuckTheme.muted).accessibilityIdentifier("tripNameHelp") }
                        if name.count > 60 { Text("Keep the trip name under 60 characters.").font(.footnote).foregroundStyle(TuckTheme.ink).accessibilityIdentifier("tripNameError") }
                    }
                    HStack {
                        VStack(alignment: .leading, spacing: 8) { fieldLabel("TIME AWAY"); Text("\(nights) \(nights == 1 ? "night" : "nights")").font(TuckTheme.editorial(28)) }
                        Spacer()
                        Stepper("Nights away", value: $nights, in: 1...30).labelsHidden()
                            .accessibilityIdentifier("tripNights").accessibilityValue("\(nights) nights")
                    }
                    VStack(alignment: .leading, spacing: 15) {
                        fieldLabel("WHAT KIND OF GETAWAY?")
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: typeSize.isAccessibilitySize ? 1 : 2), spacing: 12) {
                            ForEach(TripKind.allCases) { option in
                                Button {
                                    kind = option; TuckTheme.selection()
                                } label: {
                                    HStack(spacing: 7) {
                                        ObjectArt(id: option.objectID).frame(width: 42, height: 42)
                                        Text(option.title).font(.system(.subheadline, design: .rounded).weight(.semibold)).multilineTextAlignment(.leading)
                                        Spacer(minLength: 0)
                                    }.padding(11).frame(maxWidth: .infinity, minHeight: 76)
                                        .background(kind == option ? TuckTheme.jade.opacity(0.25) : TuckTheme.paper, in: RoundedRectangle(cornerRadius: 12))
                                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(kind == option ? TuckTheme.ink : TuckTheme.seam, lineWidth: kind == option ? 1.5 : 1))
                                }.buttonStyle(.plain).accessibilityLabel(option.title).accessibilityAddTraits(kind == option ? .isSelected : [])
                                    .accessibilityIdentifier("tripKind-\(option.rawValue)")
                            }
                        }.accessibilityElement(children: .contain).accessibilityIdentifier("tripKind")
                    }
                    if existing == nil {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "pencil.tip").padding(.top, 2)
                            Text("We’ll start you with the everyday essentials. Add, change, or leave out anything to make it yours.")
                        }.font(.footnote).foregroundStyle(TuckTheme.muted)
                    }
                }.padding(24).frame(maxWidth: 600).frame(maxWidth: .infinity)
            }
            .background(TuckTheme.canvas).foregroundStyle(TuckTheme.ink)
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) {
                Button(existing == nil ? "Make my packing list" : "Save trip details", action: save)
                    .buttonStyle(TuckButtonStyle()).disabled(!valid).opacity(valid ? 1 : 0.45)
                    .accessibilityIdentifier("saveTrip").padding(24).background(TuckTheme.canvas)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.foregroundStyle(TuckTheme.ink).accessibilityIdentifier("cancelTrip") }
            }
            .navigationBarTitleDisplayMode(.inline)
            .storeAlerts(store)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("tripEditor")
        }
    }
    private func save() {
        guard valid else { return }
        if let existing {
            if store.updateTrip(id: existing.id, name: name, nights: nights, kind: kind) { onSave(existing.id); dismiss() }
        } else if let id = store.createTrip(name: name, nights: nights, kind: kind) { onSave(id); dismiss() }
    }
    private func fieldLabel(_ text: String) -> some View { Text(text).font(.system(size: 11, weight: .bold, design: .monospaced)).tracking(1.2).foregroundStyle(TuckTheme.muted) }
}

struct ItemEditor: View {
    @EnvironmentObject private var store: TripStore
    @Environment(\.dismiss) private var dismiss
    let tripID: UUID
    private let existing: PackingItem?
    @State private var name: String
    @State private var quantity: Int
    @State private var category: ItemCategory
    @State private var objectID: String
    @State private var confirmDelete = false
    @FocusState private var nameFocused: Bool
    private let objects = ["tshirt", "pants", "sweater", "socks", "shoes", "washbag", "toothbrush", "bottle", "passport", "charger", "headphones", "sunscreen", "glasses", "hat", "book", "custom"]

    init(tripID: UUID, item: PackingItem? = nil) {
        self.tripID = tripID; existing = item
        _name = State(initialValue: item?.name ?? "")
        _quantity = State(initialValue: item?.quantity ?? 1)
        _category = State(initialValue: item?.category ?? .extras)
        _objectID = State(initialValue: item?.objectID ?? "custom")
    }
    private var valid: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && name.count <= 80 }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 27) {
                    HStack(alignment: .center) {
                        Text(existing == nil ? "One more\nlittle thing." : "Make it\nyours.").font(TuckTheme.editorial(35)).tracking(-0.8)
                        Spacer()
                        ObjectArt(id: objectID).frame(width: 105, height: 105).rotationEffect(.degrees(7))
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("WHAT’S COMING WITH YOU?").font(.system(size: 11, weight: .bold, design: .monospaced)).tracking(1)
                        TextField("Your favourite little thing", text: $name).font(.title3.weight(.medium))
                            .focused($nameFocused).submitLabel(.done).onSubmit { nameFocused = false }
                            .padding(.vertical, 14).accessibilityIdentifier("itemName")
                        StitchLine()
                        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { Text("Name the thing you want to remember.").font(.footnote).foregroundStyle(TuckTheme.muted).accessibilityIdentifier("itemNameHelp") }
                        if name.count > 80 { Text("Keep the name under 80 characters.").font(.footnote).foregroundStyle(TuckTheme.ink).accessibilityIdentifier("itemNameError") }
                    }
                    HStack {
                        Text("How many?").font(.body.weight(.semibold)); Spacer()
                        Text("\(quantity)").font(TuckTheme.editorial(29)).monospacedDigit().frame(minWidth: 36)
                        Stepper("Quantity", value: $quantity, in: 1...99).labelsHidden().accessibilityIdentifier("itemQuantity").accessibilityValue("\(quantity)")
                    }
                    HStack {
                        Text("Keep it with").font(.body.weight(.semibold)); Spacer()
                        Picker("Category", selection: $category) { ForEach(ItemCategory.allCases) { Text($0.shortTitle).tag($0) } }
                            .pickerStyle(.menu).tint(TuckTheme.ink).accessibilityIdentifier("itemCategory")
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("PICK ITS SHAPE").font(.system(size: 11, weight: .bold, design: .monospaced)).tracking(1)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 62))], spacing: 10) {
                            ForEach(objects, id: \.self) { object in
                                Button { objectID = object; TuckTheme.selection() } label: {
                                    ObjectArt(id: object).frame(width: 52, height: 52).padding(5)
                                        .background(objectID == object ? TuckTheme.jade.opacity(0.3) : TuckTheme.paper, in: RoundedRectangle(cornerRadius: 10))
                                        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(objectID == object ? TuckTheme.ink : TuckTheme.seam, lineWidth: 1))
                                }.buttonStyle(.plain).accessibilityLabel(ObjectLibrary.shared.object(object)?.label ?? "Luggage label")
                                    .accessibilityAddTraits(objectID == object ? .isSelected : []).accessibilityIdentifier("itemObject-\(object)")
                            }
                        }.accessibilityElement(children: .contain).accessibilityIdentifier("itemObject")
                    }
                    if existing != nil {
                        Button("Leave this item out", role: .destructive) { confirmDelete = true }
                            .font(.body.weight(.medium)).frame(maxWidth: .infinity, minHeight: 48).accessibilityIdentifier("deleteItem")
                    }
                }.padding(24).frame(maxWidth: 600).frame(maxWidth: .infinity)
            }.background(TuckTheme.canvas).foregroundStyle(TuckTheme.ink).scrollDismissesKeyboard(.interactively)
                .safeAreaInset(edge: .bottom) {
                    Button(existing == nil ? "Add to my list" : "Save item") {
                        var item = existing ?? PackingItem(objectID: objectID, name: name, category: category)
                        item.name = name.trimmingCharacters(in: .whitespacesAndNewlines); item.quantity = quantity; item.category = category; item.objectID = objectID
                        if store.saveItem(item, tripID: tripID) { dismiss() }
                    }.buttonStyle(TuckButtonStyle()).disabled(!valid).opacity(valid ? 1 : 0.45)
                        .accessibilityIdentifier("saveItem").padding(24).background(TuckTheme.canvas)
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.foregroundStyle(TuckTheme.ink) }
                }
                .confirmationDialog("Leave this item out?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Remove item", role: .destructive) { if let existing, store.deleteItem(existing.id, tripID: tripID) { dismiss() } }
                    Button("Keep it", role: .cancel) {}
                } message: { Text("You can undo this until your next change.") }
                .storeAlerts(store)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("itemEditor")
        }
    }
}
