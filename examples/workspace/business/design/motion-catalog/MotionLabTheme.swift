// MotionLabTheme.swift — motion-catalog exemplar pack
//
// The small binding layer every business repo writes once: DesignTokens hex
// strings and font families resolved into SwiftUI values. The exemplar demos
// read LabTheme so the pack compiles beside templates/design-system/
// (DesignTokens.swift + PremiumCraft.swift) without further wiring. In a real
// app repo this file usually merges into the app's existing theme layer —
// keep the names, replace the neutrals with the brand's own.

import SwiftUI

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

enum LabTheme {
    static let background = Color(hex: DesignTokens.Color.background)
    static let surface = Color(hex: DesignTokens.Color.surface)
    static let primary = Color(hex: DesignTokens.Color.primary)
    static let accent = Color(hex: DesignTokens.Color.accent)
    static let text = Color(hex: DesignTokens.Color.text)
    // Neutrals the token seed does not carry — replace with brand values.
    static let muted = Color(hex: "#686159")
    static let border = Color(hex: "#d8d0c3")

    static let radiusMd: CGFloat = 8
    static let radiusLg: CGFloat = 14

    static let spaceSm: CGFloat = 8
    static let spaceMd: CGFloat = 16
    static let spaceLg: CGFloat = 24
    static let spaceXl: CGFloat = 40
}

extension Font {
    /// Display face: the token family with a serif design fallback until the
    /// font files ship in the app bundle.
    static func display(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }
}
