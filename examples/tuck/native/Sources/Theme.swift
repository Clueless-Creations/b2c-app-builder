import SwiftUI
import UIKit

enum TuckTheme {
    static let ink = Color(hex: "203A45")
    static let canvas = Color(hex: "F7F1E6")
    static let paper = Color(hex: "FFFDF7")
    static let orange = Color(hex: "D85A36")
    static let jade = Color(hex: "87A99A")
    static let lilac = Color(hex: "B7A9CD")
    static let muted = Color(hex: "596967")
    static let seam = Color(hex: "B5B7A7")
    static func editorial(_ size: CGFloat = 38, relativeTo style: Font.TextStyle = .largeTitle) -> Font {
        .custom("Fraunces-Bold", size: size, relativeTo: style)
    }
    static let settle = Animation.spring(response: 0.38, dampingFraction: 0.82)
    static func selection() { UISelectionFeedbackGenerator().selectionChanged() }
    static func packed() { UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.65) }
    static func announce(_ message: String) {
        if UIAccessibility.isVoiceOverRunning { UIAccessibility.post(notification: .announcement, argument: message) }
    }
}

struct TuckButtonStyle: ButtonStyle {
    @EffectiveReducedMotion private var reduceMotion
    var primary = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.body, design: .rounded).weight(.bold))
            .foregroundStyle(primary ? Color.white : TuckTheme.ink)
            .padding(.horizontal, 22).padding(.vertical, 17)
            .frame(maxWidth: .infinity, minHeight: 54)
            .background(primary ? TuckTheme.ink : TuckTheme.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(primary ? TuckTheme.ink : TuckTheme.seam, lineWidth: 1))
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.86 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct RoundTool: View {
    let symbol: String
    let label: String
    let identifier: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 18, weight: .semibold))
                .frame(width: 46, height: 46)
                .background(TuckTheme.paper, in: Circle())
                .overlay(Circle().strokeBorder(TuckTheme.seam, lineWidth: 1))
        }
        .foregroundStyle(TuckTheme.ink)
        .accessibilityLabel(label).accessibilityIdentifier(identifier)
    }
}

struct StitchLine: View {
    var color = TuckTheme.seam
    var body: some View {
        GeometryReader { geometry in
            Path { path in path.move(to: .zero); path.addLine(to: CGPoint(x: geometry.size.width, y: 0)) }
                .stroke(color, style: StrokeStyle(lineWidth: 1.2, lineCap: .round, dash: [3, 5]))
        }.frame(height: 1).accessibilityHidden(true)
    }
}

struct LuggageLabel: Shape {
    func path(in rect: CGRect) -> Path {
        let notch = min(23, rect.width * 0.075)
        return Path { p in
            p.move(to: CGPoint(x: notch, y: 0)); p.addLine(to: CGPoint(x: rect.width - 12, y: 0))
            p.addQuadCurve(to: CGPoint(x: rect.width, y: 12), control: CGPoint(x: rect.width, y: 0))
            p.addLine(to: CGPoint(x: rect.width, y: rect.height - 12))
            p.addQuadCurve(to: CGPoint(x: rect.width - 12, y: rect.height), control: CGPoint(x: rect.width, y: rect.height))
            p.addLine(to: CGPoint(x: notch, y: rect.height)); p.addLine(to: CGPoint(x: 0, y: rect.height * 0.5)); p.closeSubpath()
        }
    }
}

struct BagIllustration: View {
    var open = true
    var highlighted = false
    var body: some View {
        GeometryReader { geometry in
            let side = min(geometry.size.width, geometry.size.height)
            ZStack {
                Ellipse().fill(TuckTheme.ink.opacity(0.07))
                    .frame(width: side * 0.87, height: side * 0.08).offset(y: side * 0.39)
                ObjectArt(id: "bag").frame(width: side, height: side)
                if !open {
                    Capsule().fill(TuckTheme.ink).frame(width: side * 0.71, height: side * 0.12).offset(y: -side * 0.15)
                    Capsule().fill(TuckTheme.orange).frame(width: side * 0.64, height: 3).offset(y: -side * 0.16)
                }
                Text("tuck").font(.custom("Fraunces-Bold", size: side * 0.075))
                    .foregroundStyle(TuckTheme.canvas).offset(y: side * 0.18)
                if highlighted {
                    RoundedRectangle(cornerRadius: 25).stroke(TuckTheme.orange, style: StrokeStyle(lineWidth: 2, dash: [4, 5]))
                        .frame(width: side * 0.98, height: side * 0.9).offset(y: side * 0.025)
                }
            }.frame(width: geometry.size.width, height: geometry.size.height)
        }.accessibilityHidden(true)
    }
}

struct UndoBar: View {
    @EnvironmentObject private var store: TripStore
    var body: some View {
        if let label = store.undoLabel {
            HStack(spacing: 12) {
                Text(label).font(.subheadline).lineLimit(2)
                Spacer(minLength: 4)
                Button("Undo") { _ = store.undo(); TuckTheme.selection() }
                    .font(.subheadline.bold()).padding(.vertical, 12).accessibilityIdentifier("undoAction")
                Button { store.dismissUndo() } label: { Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).frame(width: 44, height: 44) }
                    .accessibilityLabel("Dismiss undo").accessibilityIdentifier("dismissUndo")
            }
            .foregroundStyle(TuckTheme.canvas)
            .padding(.leading, 18).padding(.trailing, 6)
            .background(TuckTheme.ink, in: RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 6)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("undoBanner")
        }
    }
}

private struct StoreAlerts: ViewModifier {
    @ObservedObject var store: TripStore
    let enabled: Bool
    func body(content: Content) -> some View {
        content.alert(item: Binding(get: { enabled ? store.message : nil }, set: { store.message = $0 })) { message in
            Alert(title: Text(message.title), message: Text(message.detail), dismissButton: .default(Text("Got it")))
        }
    }
}

extension View {
    func storeAlerts(_ store: TripStore, enabled: Bool = true) -> some View { modifier(StoreAlerts(store: store, enabled: enabled)) }
}
