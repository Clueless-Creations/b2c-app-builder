import SwiftUI

private struct TestReducedMotionKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var tuckTestReducedMotion: Bool {
        get { self[TestReducedMotionKey.self] }
        set { self[TestReducedMotionKey.self] = newValue }
    }
}

@propertyWrapper struct EffectiveReducedMotion: DynamicProperty {
    @Environment(\.accessibilityReduceMotion) private var systemReducedMotion
    @Environment(\.tuckTestReducedMotion) private var testReducedMotion
    var wrappedValue: Bool { systemReducedMotion || testReducedMotion }
}

struct AccessibilityTestConfiguration: ViewModifier {
    @ViewBuilder func body(content: Content) -> some View {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--uitesting"), let requestedSize = requestedDynamicTypeSize(arguments) {
            content
                .environment(\.dynamicTypeSize, requestedSize)
                .environment(\.tuckTestReducedMotion, arguments.contains("--reduce-motion"))
        } else if arguments.contains("--uitesting") && arguments.contains("--reduce-motion") {
            content.environment(\.tuckTestReducedMotion, true)
        } else { content }
        #else
        content
        #endif
    }

    private func requestedDynamicTypeSize(_ arguments: [String]) -> DynamicTypeSize? {
        if arguments.contains("--large-text") { return .accessibility3 }
        guard let argument = arguments.first(where: { $0.hasPrefix("--dynamic-type=") }) else { return nil }
        switch argument.replacingOccurrences(of: "--dynamic-type=", with: "") {
        case "xSmall": return .xSmall
        case "small": return .small
        case "medium": return .medium
        case "large": return .large
        case "xLarge": return .xLarge
        case "xxLarge": return .xxLarge
        case "xxxLarge": return .xxxLarge
        case "accessibility1": return .accessibility1
        case "accessibility2": return .accessibility2
        case "accessibility3": return .accessibility3
        case "accessibility4": return .accessibility4
        case "accessibility5": return .accessibility5
        default: return nil
        }
    }
}
