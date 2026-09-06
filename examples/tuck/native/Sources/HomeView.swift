import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: TripStore
    @State private var path: [UUID] = []
    @State private var creating = false
    @State private var settings = false
    @State private var showArchived = false
    @State private var deleting: Trip?
    private var visibleTrips: [Trip] { store.trips.filter { $0.isArchived == showArchived } }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    header
                    if store.needsRecovery { recovery }
                    else if store.trips.isEmpty { emptyCollection }
                    else { collection }
                }
                .padding(.horizontal, 24).padding(.top, 18).padding(.bottom, 24)
                .frame(maxWidth: 660)
                .frame(maxWidth: .infinity)
            }
            .background(TuckTheme.canvas)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    UndoBar()
                    if !store.trips.isEmpty && !store.needsRecovery {
                        Button { creating = true } label: { Label("Plan another trip", systemImage: "plus") }
                            .buttonStyle(TuckButtonStyle()).accessibilityIdentifier("createTrip")
                            .padding(.horizontal, 24).padding(.top, 10).padding(.bottom, 12)
                    }
                }.background(TuckTheme.canvas)
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: UUID.self) { id in PackingView(tripID: id, onOpenTrip: { path.append($0) }) }
            .sheet(isPresented: $creating) {
                TripEditor { id in creating = false; path.append(id) }.environmentObject(store)
            }
            .sheet(isPresented: $settings) { SettingsView().environmentObject(store) }
            .storeAlerts(store, enabled: !creating && !settings && path.isEmpty)
            .confirmationDialog("Delete \(deleting?.name ?? "this trip")?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
                Button("Delete trip", role: .destructive) { if let trip = deleting { store.deleteTrip(trip.id) }; deleting = nil }
                Button("Keep trip", role: .cancel) { deleting = nil }
            } message: { Text("You can undo this until your next change.") }
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("tuck").font(TuckTheme.editorial(48)).tracking(-2).accessibilityLabel("Tuck")
                Text("A little less to remember.").font(.subheadline).foregroundStyle(TuckTheme.muted)
            }
            Spacer()
            RoundTool(symbol: "gearshape", label: "Settings and backups", identifier: "openSettings") { settings = true }
        }.foregroundStyle(TuckTheme.ink)
    }

    private var emptyCollection: some View {
        VStack(spacing: 22) {
            ZStack {
                Circle().fill(TuckTheme.jade.opacity(0.17)).frame(width: 246, height: 246)
                ObjectArt(id: "hat").frame(width: 110, height: 110).rotationEffect(.degrees(-18)).offset(x: -101, y: -80)
                ObjectArt(id: "glasses").frame(width: 96, height: 96).rotationEffect(.degrees(15)).offset(x: 98, y: -52)
                ObjectArt(id: "book").frame(width: 95, height: 95).rotationEffect(.degrees(17)).offset(x: 84, y: 69)
                BagIllustration(open: true).frame(width: 235, height: 214).offset(y: 12)
            }.frame(height: 292).padding(.top, 14)
            VStack(spacing: 12) {
                Text("A bag for\nwherever’s next.").font(TuckTheme.editorial(37)).tracking(-1).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                Text("Make a packing list in a moment.\nKeep the little things out of your head.")
                    .font(.body).foregroundStyle(TuckTheme.muted).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
            Button("Plan a trip") { creating = true }.buttonStyle(TuckButtonStyle()).accessibilityIdentifier("createTrip")
            Text("YOUR LISTS. ON YOUR PHONE. OFFLINE.")
                .font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(1.3).foregroundStyle(TuckTheme.muted)
        }.foregroundStyle(TuckTheme.ink).accessibilityElement(children: .contain).accessibilityIdentifier("emptyCollection")
    }

    private var collection: some View {
        VStack(alignment: .leading, spacing: 23) {
            HStack(alignment: .lastTextBaseline) {
                Text(showArchived ? "Trips well taken." : "Where to next?").font(TuckTheme.editorial(32)).tracking(-0.8)
                Spacer(minLength: 8)
            }
            Picker("Trips", selection: $showArchived) { Text("Coming up").tag(false); Text("Put away").tag(true) }
                .pickerStyle(.segmented).accessibilityIdentifier("tripCollectionFilter")
            if visibleTrips.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text(showArchived ? "No trips put away yet." : "Room for another adventure.").font(.title3.bold())
                    Text(showArchived ? "Archive a trip when you get home. Its packing list will be ready to use again." : "Plan something new, or bring a past trip back from Put away.").font(.body).foregroundStyle(TuckTheme.muted)
                }.padding(.vertical, 36).accessibilityElement(children: .contain).accessibilityIdentifier("filteredCollectionEmpty")
            }
            ForEach(visibleTrips) { trip in
                NavigationLink(value: trip.id) { tripLabel(trip) }
                    .buttonStyle(.plain).accessibilityIdentifier("trip-\(trip.id.uuidString)")
                    .accessibilityLabel("\(trip.name), \(trip.nightLabel), \(trip.packedCount) of \(trip.items.count) packed")
                    .contextMenu {
                        Button("Pack this trip again", systemImage: "arrow.counterclockwise") { if let id = store.duplicateTrip(trip.id) { path.append(id) } }
                        Button(trip.isArchived ? "Bring trip back" : "Put trip away", systemImage: "archivebox") { store.setArchived(trip.id, archived: !trip.isArchived) }
                        Button("Delete trip", systemImage: "trash", role: .destructive) { deleting = trip }
                    }
            }
            if !visibleTrips.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.shield").font(.caption)
                    Text("Saved here, ready anywhere.").font(.footnote)
                }.foregroundStyle(TuckTheme.muted).frame(maxWidth: .infinity).padding(.top, 6)
            }
        }.foregroundStyle(TuckTheme.ink)
    }

    private func tripLabel(_ trip: Trip) -> some View {
        HStack(spacing: 15) {
            Circle().fill(TuckTheme.canvas).frame(width: 10, height: 10).overlay(Circle().stroke(TuckTheme.seam, lineWidth: 1)).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 10) {
                Text(trip.kind.shortTitle).font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(1.7).foregroundStyle(TuckTheme.muted)
                Text(trip.name).font(TuckTheme.editorial(28)).tracking(-0.5).lineLimit(2)
                HStack(spacing: 7) {
                    Text(trip.nightLabel)
                    Text("·")
                    Text(trip.isComplete ? "All tucked in" : "\(trip.remainingCount) things to pack")
                }.font(.footnote).foregroundStyle(TuckTheme.muted)
            }
            Spacer(minLength: 0)
            ObjectArt(id: trip.kind.objectID).frame(width: 66, height: 66).rotationEffect(.degrees(8))
        }
        .padding(.leading, 15).padding(.trailing, 19).padding(.vertical, 25)
        .background(LuggageLabel().fill(TuckTheme.paper))
        .overlay(LuggageLabel().stroke(TuckTheme.seam, lineWidth: 1))
    }

    private var recovery: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Your trips need\na little care.").font(TuckTheme.editorial(36))
            Text("Your saved files are still here. Restore the previous backup or import one you exported before making more changes.").foregroundStyle(TuckTheme.muted)
            Button("Open recovery options") { settings = true }.buttonStyle(TuckButtonStyle()).accessibilityIdentifier("openRecovery")
        }.padding(.top, 50).accessibilityElement(children: .contain).accessibilityIdentifier("storageRecovery")
    }
}
