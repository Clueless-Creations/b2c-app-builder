import SwiftUI

@main struct TuckApp: App {
    @StateObject private var store = TripStore()
    var body: some Scene {
        WindowGroup {
            HomeView()
                .environmentObject(store)
                .modifier(AccessibilityTestConfiguration())
                .tint(TuckTheme.ink)
                .preferredColorScheme(.light)
        }
    }
}
