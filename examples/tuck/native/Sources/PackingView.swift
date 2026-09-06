import SwiftUI

private enum PackingFilter: String, CaseIterable, Identifiable {
    case remaining, packed
    var id: String { rawValue }
}

struct PackingView: View {
    @EnvironmentObject private var store: TripStore
    @Environment(\.dismiss) private var dismiss
    @EffectiveReducedMotion private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    let tripID: UUID
    var onOpenTrip: (UUID) -> Void = { _ in }
    @State private var filter: PackingFilter = .remaining
    @AppStorage(TuckPreferences.packingListKey) private var prefersList = false
    @State private var bagTargeted = false
    @State private var addItem = false
    @State private var editingItem: PackingItem?
    @State private var editingTrip = false
    @State private var deletingTrip = false
    private var usesList: Bool { prefersList || typeSize.isAccessibilitySize }
    private var usesStackedMetadata: Bool { typeSize >= .xxLarge }

    var body: some View {
        Group {
            if let trip = store.trip(tripID) { content(trip) }
            else {
                VStack(spacing: 20) {
                    Text("This bag’s been\nput away.").font(TuckTheme.editorial()).multilineTextAlignment(.center)
                    Button("Back to my trips") { dismiss() }.buttonStyle(TuckButtonStyle()).padding(.horizontal, 24)
                }.frame(maxWidth: .infinity, maxHeight: .infinity).background(TuckTheme.canvas)
            }
        }
        .foregroundStyle(TuckTheme.ink)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(TuckTheme.canvas, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { dismiss() } label: { Label("Trips", systemImage: "chevron.left").font(.subheadline.weight(.semibold)).frame(minHeight: 44) }
                    .foregroundStyle(TuckTheme.ink).accessibilityIdentifier("backToTrips")
            }
            ToolbarItem(placement: .topBarTrailing) {
                if let trip = store.trip(tripID) {
                    Menu {
                        Button("Edit trip details", systemImage: "pencil") { editingTrip = true }.accessibilityIdentifier("editTrip")
                        Button("Pack this trip again", systemImage: "arrow.counterclockwise") { duplicate() }
                        ShareLink(item: trip.shareText) { Label("Share packing list", systemImage: "square.and.arrow.up") }.accessibilityIdentifier("shareTrip")
                        Button(trip.isArchived ? "Bring trip back" : "Put trip away", systemImage: "archivebox") { store.setArchived(tripID, archived: !trip.isArchived) }
                        Button("Delete trip", systemImage: "trash", role: .destructive) { deletingTrip = true }
                    } label: { Image(systemName: "ellipsis").font(.system(size: 20, weight: .bold)).frame(width: 44, height: 44) }
                        .foregroundStyle(TuckTheme.ink).accessibilityLabel("Trip options").accessibilityIdentifier("tripMenu")
                }
            }
        }
        .sheet(isPresented: $addItem) { ItemEditor(tripID: tripID).environmentObject(store) }
        .sheet(item: $editingItem) { item in ItemEditor(tripID: tripID, item: item).environmentObject(store) }
        .sheet(isPresented: $editingTrip) { if let trip = store.trip(tripID) { TripEditor(trip: trip).environmentObject(store) } }
        .storeAlerts(store, enabled: !addItem && editingItem == nil && !editingTrip)
        .confirmationDialog("Delete this trip?", isPresented: $deletingTrip, titleVisibility: .visible) {
            Button("Delete trip", role: .destructive) { if store.deleteTrip(tripID) { dismiss() } }
            Button("Keep trip", role: .cancel) {}
        } message: { Text("You can undo this from your trip collection until your next change.") }
    }

    private func content(_ trip: Trip) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    tripHeading(trip)
                    if trip.isComplete && filter == .remaining { completion(trip) }
                    else if trip.items.isEmpty { emptyPackingList }
                    else {
                        filterBar(trip)
                        let visible = trip.items.filter { $0.isPacked == (filter == .packed) }
                        if visible.isEmpty { emptyFilter }
                        else {
                            ForEach(ItemCategory.allCases) { category in
                                let items = visible.filter { $0.category == category }
                                if !items.isEmpty { itemGroup(category, items: items) }
                            }
                        }
                    }
                    if !trip.items.isEmpty {
                        Button { addItem = true } label: {
                            HStack {
                                Image(systemName: "plus").font(.body.bold())
                                if typeSize.isAccessibilitySize {
                                    Text("Add one more thing").font(.body.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                                } else {
                                    Text("One more thing").font(.body.weight(.semibold)); Spacer()
                                    Text("Add item").font(.footnote).foregroundStyle(TuckTheme.muted)
                                }
                            }
                                .padding(.vertical, 18)
                        }.foregroundStyle(TuckTheme.ink).accessibilityIdentifier("addItem")
                        StitchLine()
                    }
                }.padding(.horizontal, 24).padding(.top, 8).padding(.bottom, 25).frame(maxWidth: 660).frame(maxWidth: .infinity)
                    .animation(reduceMotion ? nil : TuckTheme.settle, value: trip.items)
            }
            .clipped()
            VStack(spacing: 0) {
                if trip.isComplete && filter == .remaining { UndoBar() }
                else { bagDock(trip) }
            }.background(TuckTheme.canvas.ignoresSafeArea(edges: .bottom))
        }
        .background(TuckTheme.canvas)
        .accessibilityElement(children: .contain).accessibilityIdentifier("packingTable")
    }

    private func tripHeading(_ trip: Trip) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            let metadataLayout = usesStackedMetadata
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 3))
                : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 9))
            metadataLayout {
                Text(trip.kind.shortTitle)
                    .font(.system(.subheadline, design: .monospaced).weight(.bold)).tracking(1.2)
                    .fixedSize(horizontal: false, vertical: true)
                Text("/ \(trip.nightLabel.uppercased())")
                    .font(.system(.subheadline, design: .monospaced).weight(.semibold)).tracking(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                if trip.isArchived {
                    Text("PUT AWAY").font(.system(.subheadline, design: .monospaced).weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(6).background(TuckTheme.jade.opacity(0.3), in: Capsule())
                }
                Text(usesStackedMetadata ? "\(trip.packedCount) of \(trip.items.count) packed" : "\(trip.packedCount)/\(trip.items.count)")
                    .font(.system(.subheadline, design: .monospaced).weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: usesStackedMetadata ? .leading : .trailing)
                    .accessibilityLabel("\(trip.packedCount) of \(trip.items.count) packed")
                    .accessibilityIdentifier("packingProgress")
            }
            .foregroundStyle(TuckTheme.ink)
            .accessibilityElement(children: .contain)
            Text(trip.name)
                .font(TuckTheme.editorial(35)).tracking(-0.9)
                .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("packingTripTitle")
            Capsule().fill(TuckTheme.seam)
                .overlay(alignment: .leading) {
                    Capsule().fill(TuckTheme.orange)
                        .scaleEffect(x: min(1, max(0, trip.progress)), anchor: .leading)
                }
                .frame(height: 3).accessibilityHidden(true).animation(reduceMotion ? nil : TuckTheme.settle, value: trip.packedCount)
        }
    }

    private func filterBar(_ trip: Trip) -> some View {
        HStack(spacing: 10) {
            let filterLayout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
                : AnyLayout(HStackLayout(spacing: 2))
            filterLayout {
                filterButton("To pack", count: trip.remainingCount, value: .remaining)
                filterButton("Packed", count: trip.packedCount, value: .packed)
            }.padding(2).background(TuckTheme.paper, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(TuckTheme.seam, lineWidth: 1))
                .frame(maxWidth: typeSize.isAccessibilitySize ? .infinity : nil, alignment: .leading)
                .accessibilityElement(children: .contain).accessibilityIdentifier("packingFilter")
            Spacer(minLength: 0)
            if !typeSize.isAccessibilitySize {
                Button { prefersList.toggle(); TuckTheme.selection() } label: {
                    Image(systemName: usesList ? "square.grid.2x2" : "list.bullet").font(.system(size: 17, weight: .medium)).frame(width: 44, height: 44)
                }.foregroundStyle(TuckTheme.ink).accessibilityLabel(usesList ? "Show grid view" : "Show list view").accessibilityIdentifier("toggleList")
            }
        }
    }
    private func filterButton(_ title: String, count: Int, value: PackingFilter) -> some View {
        Button { filter = value; TuckTheme.selection() } label: {
            HStack(spacing: 6) {
                Text(title).font(.subheadline.weight(.semibold))
                Text("\(count)").font(.system(.subheadline, design: .monospaced).weight(.medium))
            }.foregroundStyle(TuckTheme.ink)
                .padding(.horizontal, 12).frame(minHeight: 44)
                .frame(maxWidth: typeSize.isAccessibilitySize ? .infinity : nil, alignment: .leading)
                .background(filter == value ? TuckTheme.canvas : .clear, in: RoundedRectangle(cornerRadius: 7))
                .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(filter == value ? TuckTheme.ink : .clear, lineWidth: 2))
                .contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityAddTraits(filter == value ? .isSelected : []).accessibilityIdentifier("filter-\(value.rawValue)")
    }

    private func itemGroup(_ category: ItemCategory, items: [PackingItem]) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 2) {
                    Text(category.title)
                        .font(TuckTheme.editorial(20, relativeTo: .title3)).tracking(-0.25)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(items.count) \(items.count == 1 ? "item" : "items")")
                        .font(.caption.weight(.semibold)).foregroundStyle(TuckTheme.ink)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
            } else {
                HStack(alignment: .firstTextBaseline) {
                    Text(category.title).font(TuckTheme.editorial(20, relativeTo: .title3)).tracking(-0.25)
                    Spacer()
                    Text(String(format: "%02d", items.count))
                        .font(.system(.subheadline, design: .monospaced).weight(.semibold)).foregroundStyle(TuckTheme.ink)
                }.accessibilityAddTraits(.isHeader)
            }
            LazyVGrid(columns: itemColumns, alignment: .leading, spacing: usesList ? 0 : 17) {
                ForEach(items) { item in packingItem(item) }
            }
        }.padding(.top, 3)
    }

    private var itemColumns: [GridItem] {
        usesList
            ? [GridItem(.flexible())]
            : [GridItem(.flexible(), spacing: 18), GridItem(.flexible(), spacing: 18)]
    }

    @ViewBuilder private func packingItem(_ item: PackingItem) -> some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 0) {
                Button { toggle(item) } label: {
                    accessibilityListItemLabel(item)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(item.name), quantity \(item.quantity), \(item.isPacked ? "packed" : "not packed")")
                .accessibilityHint(item.isPacked ? "Double tap to unpack" : "Double tap to pack")
                .accessibilityIdentifier("packingItem-\(item.id.uuidString)")
                .draggable(item.id.uuidString) { ObjectArt(id: item.objectID).frame(width: 105, height: 105).padding(12).background(TuckTheme.canvas, in: RoundedRectangle(cornerRadius: 15)) }
                Button { editingItem = item } label: {
                    Label("Edit item", systemImage: "pencil")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(TuckTheme.muted)
                .accessibilityLabel("Edit \(item.name)")
                .accessibilityIdentifier("editItem-\(item.id.uuidString)")
            }
            .overlay(alignment: .bottom) { StitchLine() }
        } else {
            let controlLayout = usesList
                ? AnyLayout(HStackLayout(spacing: 5))
                : AnyLayout(ZStackLayout(alignment: .topTrailing))
            controlLayout {
                Button { toggle(item) } label: {
                    if usesList {
                        listItemLabel(item)
                    } else {
                        tableItemLabel(item)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(item.name), quantity \(item.quantity), \(item.isPacked ? "packed" : "not packed")")
                .accessibilityHint(item.isPacked ? "Double tap to unpack" : "Double tap to pack")
                .accessibilityIdentifier("packingItem-\(item.id.uuidString)")
                .draggable(item.id.uuidString) { ObjectArt(id: item.objectID).frame(width: 105, height: 105).padding(12).background(TuckTheme.canvas, in: RoundedRectangle(cornerRadius: 15)) }
                Button { editingItem = item } label: {
                    Image(systemName: usesList ? "pencil" : "ellipsis")
                        .font(.system(size: usesList ? 14 : 15, weight: .semibold)).foregroundStyle(TuckTheme.muted)
                        .frame(width: 44, height: usesList ? 52 : 44).contentShape(Rectangle())
                }.buttonStyle(.plain).offset(x: usesList ? 0 : 8, y: usesList ? 0 : -8)
                    .accessibilityLabel("Edit \(item.name)").accessibilityIdentifier("editItem-\(item.id.uuidString)")
            }
            .padding(.horizontal, usesList ? 0 : 2)
            .overlay(alignment: .bottom) { if usesList { StitchLine() } }
        }
    }

    private func tableItemLabel(_ item: PackingItem) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            ZStack(alignment: .bottomTrailing) {
                Ellipse().fill(TuckTheme.seam.opacity(0.18)).frame(width: 96, height: 9).frame(maxWidth: .infinity).offset(y: -6)
                ObjectArt(id: item.objectID).frame(height: 111).frame(maxWidth: .infinity)
                    .rotationEffect(.degrees(rotation(item.objectID)))
                if item.quantity > 1 {
                    Text("×\(item.quantity)").font(.system(.caption, design: .monospaced).weight(.semibold))
                        .foregroundStyle(TuckTheme.ink).padding(.horizontal, 7).padding(.vertical, 5)
                        .background(TuckTheme.paper, in: Capsule()).padding(.bottom, 2)
                        .accessibilityIdentifier("packingGridItemQuantity-\(item.id.uuidString)").accessibilityHidden(true)
                }
            }.frame(height: 116)
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(item.name).font(.system(.subheadline, design: .rounded).weight(.semibold)).multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("packingGridItemName-\(item.id.uuidString)").accessibilityHidden(true)
                if item.isPacked { Image(systemName: "checkmark.circle.fill").font(.caption).accessibilityHidden(true) }
            }.foregroundStyle(TuckTheme.ink).frame(maxWidth: .infinity, minHeight: 38, alignment: .topLeading)
        }.contentShape(Rectangle())
    }

    private func listItemLabel(_ item: PackingItem) -> some View {
        HStack(spacing: 13) {
            ObjectArt(id: item.objectID).frame(width: 53, height: 53)
            VStack(alignment: .leading, spacing: 5) {
                Text(item.name).font(.body.weight(.semibold)).multilineTextAlignment(.leading)
                    .dynamicTypeSize(.xSmall ... .accessibility5)
                    .accessibilityIdentifier("packingItemName-\(item.id.uuidString)")
                Text("Bring \(item.quantity)").font(.footnote).foregroundStyle(TuckTheme.muted)
                    .dynamicTypeSize(.xSmall ... .accessibility5)
                    .accessibilityIdentifier("packingItemQuantity-\(item.id.uuidString)")
            }.layoutPriority(1)
            Spacer(minLength: 4)
            checkmark(item.isPacked)
        }.frame(maxWidth: .infinity, minHeight: 78).contentShape(Rectangle())
    }

    private func accessibilityListItemLabel(_ item: PackingItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 16) {
                ObjectArt(id: item.objectID).frame(width: 58, height: 58)
                Spacer(minLength: 16)
                checkmark(item.isPacked)
            }
            VStack(alignment: .leading, spacing: 5) {
                Text(item.name)
                    .font(.body.weight(.semibold))
                    .multilineTextAlignment(.leading)
                    .lineLimit(nil)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("packingItemName-\(item.id.uuidString)")
                Text("Bring \(item.quantity)")
                    .font(.footnote)
                    .foregroundStyle(TuckTheme.muted)
                    .lineLimit(nil)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("packingItemQuantity-\(item.id.uuidString)")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)
        }
        .frame(maxWidth: .infinity, minHeight: 132, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func checkmark(_ checked: Bool) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6).fill(checked ? TuckTheme.ink : TuckTheme.paper)
            RoundedRectangle(cornerRadius: 6).strokeBorder(checked ? TuckTheme.ink : TuckTheme.seam, lineWidth: 1.2)
            if checked { Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(TuckTheme.canvas) }
        }.frame(width: 27, height: 27).accessibilityHidden(true)
    }

    private func bagDock(_ trip: Trip) -> some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(bagTargeted ? "Drop to pack" : "Bag: \(trip.packedCount) packed")
                            .font(.headline.weight(.bold))
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Tap items to pack or unpack.")
                            .font(.body).foregroundStyle(TuckTheme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Packing bag. \(trip.packedCount) items packed. Double-tap an item to pack or unpack it.")
                    undoButton
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(spacing: 10) {
                    BagIllustration(open: true, highlighted: bagTargeted).frame(width: 68, height: 68)
                        .scaleEffect(bagTargeted && !reduceMotion ? 1.06 : 1)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(bagTargeted ? "Tuck it in." : "Your bag · \(trip.packedCount) packed")
                            .font(TuckTheme.editorial(17, relativeTo: .body)).fixedSize(horizontal: false, vertical: true)
                        Text(usesList ? "Tap to pack or unpack." : "Tap to pack. Hold to drag.")
                            .font(.caption).foregroundStyle(TuckTheme.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Packing bag. \(trip.packedCount) items packed. Double-tap an item to pack or unpack it.")
                    Spacer(minLength: 0)
                    undoButton
                }
            }
        }
        .padding(.horizontal, 24).padding(.vertical, typeSize.isAccessibilitySize ? 12 : 2)
        .frame(maxWidth: .infinity)
        .background(TuckTheme.paper)
        .overlay(alignment: .top) { StitchLine(color: bagTargeted ? TuckTheme.orange : TuckTheme.seam) }
        .dropDestination(for: String.self) { ids, _ in
            var didPack = false
            for text in ids {
                if let id = UUID(uuidString: text), changePacked(id, packed: true) { didPack = true }
            }
            return didPack
        } isTargeted: { targeted in bagTargeted = targeted }
        .animation(reduceMotion ? nil : TuckTheme.settle, value: bagTargeted)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("packingBagDropTarget")
    }

    @ViewBuilder private var undoButton: some View {
        if let label = store.undoLabel {
            Button { _ = store.undo(); TuckTheme.selection() } label: {
                Text("Undo").font(.subheadline.weight(.semibold))
                    .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
            }.foregroundStyle(TuckTheme.ink)
                .accessibilityLabel("Undo \(label.lowercased())").accessibilityIdentifier("undoAction")
        }
    }

    private func completion(_ trip: Trip) -> some View {
        VStack(spacing: 19) {
            BagIllustration(open: false).frame(width: 215, height: 215)
            Text("All tucked in.").font(TuckTheme.editorial(36)).tracking(-0.9)
            Text("The little things are taken care of.\n\(trip.name) is waiting.").font(.body).foregroundStyle(TuckTheme.muted).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            ShareLink(item: trip.shareText) { Label("Share my packing list", systemImage: "square.and.arrow.up") }
                .buttonStyle(TuckButtonStyle()).accessibilityIdentifier("shareCompleted")
            Button("Review what’s in the bag") { filter = .packed }.font(.subheadline.weight(.semibold)).frame(minHeight: 44).accessibilityIdentifier("reviewPacked")
            Button("Make a fresh list for next time") { duplicate() }.font(.subheadline).frame(minHeight: 44).foregroundStyle(TuckTheme.muted).accessibilityIdentifier("packAgain")
        }.frame(maxWidth: .infinity).padding(.vertical, 8).accessibilityElement(children: .contain).accessibilityIdentifier("completeBag")
    }
    private var emptyPackingList: some View {
        VStack(spacing: 15) {
            ObjectArt(id: "custom").frame(width: 105, height: 105)
            Text("Travel light.\nStart with one thing.").font(TuckTheme.editorial(29)).multilineTextAlignment(.center)
            Text("Add what you need. Your list is yours to make.").font(.body).foregroundStyle(TuckTheme.muted).multilineTextAlignment(.center)
            Button("Add the first item") { addItem = true }.buttonStyle(TuckButtonStyle()).accessibilityIdentifier("addItem")
        }.frame(maxWidth: .infinity).padding(.vertical, 35).accessibilityElement(children: .contain).accessibilityIdentifier("emptyPackingList")
    }
    private var emptyFilter: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Nothing in the bag. Yet.").font(TuckTheme.editorial(27))
            Text("Head to To pack and tap the first thing you’re bringing.").font(.body).foregroundStyle(TuckTheme.muted)
            Button("Show things to pack") { filter = .remaining }.font(.body.weight(.semibold)).frame(minHeight: 44)
        }.padding(.vertical, 40).accessibilityElement(children: .contain).accessibilityIdentifier("emptyPackedFilter")
    }
    private func toggle(_ item: PackingItem) {
        _ = changePacked(item.id, packed: !item.isPacked)
    }
    private func changePacked(_ itemID: UUID, packed: Bool) -> Bool {
        guard let item = store.trip(tripID)?.items.first(where: { $0.id == itemID }), store.setPacked(tripID: tripID, itemID: itemID, packed: packed) else { return false }
        if packed { TuckTheme.packed() } else { TuckTheme.selection() }
        if let trip = store.trip(tripID) { TuckTheme.announce("\(item.name) \(packed ? "packed" : "unpacked"). \(trip.remainingCount) items left to pack.") }
        return true
    }
    private func duplicate() { if let id = store.duplicateTrip(tripID) { onOpenTrip(id) } }
    private func rotation(_ value: String) -> Double { Double(value.utf8.reduce(0) { $0 + Int($1) } % 9 - 4) }
}
