import SwiftUI
import UniformTypeIdentifiers

struct TuckBackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw StorageFailure.invalidData }
        self.data = data
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct SettingsView: View {
    @EnvironmentObject private var store: TripStore
    @Environment(\.dismiss) private var dismiss
    @State private var exportPicker = false
    @State private var importPicker = false
    @State private var backup = TuckBackupDocument(data: Data())
    @State private var readingImport = false
    @State private var confirmRestore = false
    @State private var confirmDelete = false
    @State private var pendingImport: Data?
    @State private var importCount = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    HStack {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Keep the\ngood lists.").font(TuckTheme.editorial(39)).tracking(-1)
                            Text("Your trips, tucked away.").font(.body).foregroundStyle(TuckTheme.muted)
                        }
                        Spacer(minLength: 0)
                        ObjectArt(id: "book").frame(width: 97, height: 97).rotationEffect(.degrees(8))
                    }
                    VStack(alignment: .leading, spacing: 13) {
                        sectionLabel("SAVED ON THIS PHONE")
                        Text("\(store.trips.count) \(store.trips.count == 1 ? "trip" : "trips"). Ready offline.")
                            .font(.title3.weight(.semibold))
                        Text("No account to remember. No connection to wait for. Export a backup before switching phones or deleting the app.")
                            .font(.body).foregroundStyle(TuckTheme.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    StitchLine()
                    VStack(spacing: 0) {
                        settingsButton("Export a backup", detail: "Save all your trips as a Tuck file.", symbol: "square.and.arrow.up", id: "exportBackup") {
                            do { backup = TuckBackupDocument(data: try store.exportData()); exportPicker = true }
                            catch { store.message = StoreMessage(title: "Couldn’t make a backup", detail: error.localizedDescription) }
                        }.disabled(store.needsRecovery)
                        StitchLine()
                        settingsButton("Import a backup", detail: "Bring your lists to this phone.", symbol: "square.and.arrow.down", id: "importBackup") { importPicker = true }
                        StitchLine()
                        settingsButton("Restore previous save", detail: store.hasBackup ? "Go back to the last automatic backup." : "No previous save on this phone yet.", symbol: "arrow.uturn.backward", id: "restoreBackup") { confirmRestore = true }
                            .disabled(!store.hasBackup).opacity(store.hasBackup ? 1 : 0.5)
                        StitchLine()
                    }.disabled(readingImport)
                    if readingImport {
                        HStack(spacing: 13) { ProgressView().tint(TuckTheme.ink); Text("Opening your backup…").font(.body) }
                            .accessibilityElement(children: .combine).accessibilityIdentifier("importLoading")
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        sectionLabel("A FEW GOOD THINGS TO KNOW")
                        DisclosureGroup("What does a backup contain?") {
                            Text("Your trip names, trip details, packing items, and their packed state. Store the file somewhere you trust. Import replaces your collection after you confirm. When a valid saved collection exists before import, Restore previous save brings it back until your next change.")
                                .font(.subheadline).foregroundStyle(TuckTheme.muted).padding(.top, 10)
                        }.font(.body.weight(.semibold)).tint(TuckTheme.ink)
                        DisclosureGroup("What happens without internet?") {
                            Text("Everything you need to pack still works: create and edit trips, pack and unpack, undo, and reopen your lists. Sharing to another app follows that app’s connection requirements.")
                                .font(.subheadline).foregroundStyle(TuckTheme.muted).padding(.top, 10)
                        }.font(.body.weight(.semibold)).tint(TuckTheme.ink)
                    }
                    StitchLine()
                    Button("Delete all saved trips", role: .destructive) { confirmDelete = true }
                        .font(.body.weight(.medium)).frame(maxWidth: .infinity, minHeight: 48).accessibilityIdentifier("deleteAllTrips")
                    Text("TUCK · LEAVE WITH EVERYTHING")
                        .font(.system(size: 10, weight: .medium, design: .monospaced)).tracking(1.2).foregroundStyle(TuckTheme.muted)
                        .frame(maxWidth: .infinity).padding(.top, 8)
                }.padding(24).frame(maxWidth: 620).frame(maxWidth: .infinity)
            }.background(TuckTheme.canvas).foregroundStyle(TuckTheme.ink)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.font(.body.weight(.semibold)).foregroundStyle(TuckTheme.ink).accessibilityIdentifier("closeSettings") } }
                .navigationBarTitleDisplayMode(.inline)
                .fileExporter(isPresented: $exportPicker, document: backup, contentType: .json, defaultFilename: "Tuck trips") { result in
                    switch result {
                    case .success: store.message = StoreMessage(title: "Backup saved", detail: "Your trips are in the file you chose. Keep it somewhere safe so you can import it on another phone.")
                    case .failure(let error): store.message = StoreMessage(title: "Backup wasn’t exported", detail: error.localizedDescription)
                    }
                }
                .fileImporter(isPresented: $importPicker, allowedContentTypes: [.json], allowsMultipleSelection: false) { result in
                    switch result {
                    case .success(let urls): if let url = urls.first { openImport(url) }
                    case .failure(let error): store.message = StoreMessage(title: "Couldn’t open that file", detail: error.localizedDescription)
                    }
                }
                .confirmationDialog("Restore the previous save?", isPresented: $confirmRestore, titleVisibility: .visible) {
                    Button("Restore previous save") { store.restoreBackup() }
                    Button("Keep current trips", role: .cancel) {}
                } message: { Text("Your current list will be replaced by the previous automatic backup. Export the current trips first if you want to keep both.") }
                .confirmationDialog("Delete every saved trip?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete all trips and backup", role: .destructive) { _ = store.deleteAll() }
                    Button("Keep my trips", role: .cancel) {}
                } message: { Text("This removes the trips and automatic backup from this phone. It cannot be undone. Files you exported are not deleted.") }
                .confirmationDialog("Replace your trips with this backup?", isPresented: Binding(get: { pendingImport != nil }, set: { if !$0 { pendingImport = nil } }), titleVisibility: .visible) {
                    Button("Replace with \(importCount) \(importCount == 1 ? "trip" : "trips")", role: .destructive) { if let data = pendingImport { _ = store.importData(data) }; pendingImport = nil }
                    Button("Cancel", role: .cancel) { pendingImport = nil }
                } message: {
                    Text(store.needsRecovery
                         ? "This file replaces the collection Tuck could not read. Tuck keeps the unreadable saved files for recovery. Restore previous save is available only when a valid backup already exists."
                         : "This file replaces the collection on this phone. When a valid current saved collection exists, Tuck keeps it as the previous backup until your next change. Export it first if you want to keep both.")
                }
                .storeAlerts(store)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("dataSettings")
        }
    }

    private func settingsButton(_ title: String, detail: String, symbol: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 15) {
                Image(systemName: symbol).font(.system(size: 21, weight: .medium)).frame(width: 32)
                VStack(alignment: .leading, spacing: 6) {
                    Text(title).font(.body.weight(.semibold))
                    Text(detail).font(.footnote).foregroundStyle(TuckTheme.muted).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(TuckTheme.muted)
            }.padding(.vertical, 18).frame(minHeight: 80).contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityIdentifier(id)
    }
    private func sectionLabel(_ text: String) -> some View { Text(text).font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(1.1).foregroundStyle(TuckTheme.muted) }
    private func openImport(_ url: URL) {
        readingImport = true
        Task {
            do {
                let data = try await Task.detached(priority: .userInitiated) {
                    let granted = url.startAccessingSecurityScopedResource()
                    defer { if granted { url.stopAccessingSecurityScopedResource() } }
                    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
                    if let size = attributes[.size] as? NSNumber, size.intValue > FileTripPersistence.maximumBackupBytes { throw StorageFailure.tooLarge }
                    return try Data(contentsOf: url)
                }.value
                importCount = try FileTripPersistence.decode(data).count
                pendingImport = data
            } catch { store.message = StoreMessage(title: "Couldn’t import this file", detail: error.localizedDescription) }
            readingImport = false
        }
    }
}
