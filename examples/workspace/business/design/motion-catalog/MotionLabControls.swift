// MotionLabControls.swift — motion-catalog exemplar pack
//
// The two shared controls the exemplars reuse. Both encode contract details
// the demos should not restate: the CTA carries press physics and the
// haptics-confirm-decisions rule; the cascade modifier is the content-arrival
// lane (fade + 8pt rise) with its Reduce Motion collapse built in.

import SwiftUI

struct PrimaryCTA: View {
    let title: String
    /// Haptics confirm decisions, not navigation: CTAs that commit a real
    /// choice keep the default; pure step-advance CTAs pass nil.
    var haptic: Haptics.Event? = .impactLight
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.body(17, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(
                    RoundedRectangle(cornerRadius: LabTheme.radiusLg, style: .continuous)
                        .fill(LabTheme.primary)
                )
        }
        .buttonStyle(PremiumPressStyle(haptic: haptic))
    }
}

/// Text-cascade arrival: fade + 8pt rise on PremiumMotion.standard. Under
/// Reduce Motion the rise is dropped and only opacity changes.
private struct CascadeModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let visible: Bool
    func body(content: Content) -> some View {
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible || reduceMotion ? 0 : 8)
    }
}

extension View {
    func cascade(visible: Bool) -> some View {
        modifier(CascadeModifier(visible: visible))
    }
}
