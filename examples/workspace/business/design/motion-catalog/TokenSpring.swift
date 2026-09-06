// TokenSpring.swift — motion-catalog exemplar pack
//
// Closed-form evaluation of the shipped PremiumMotion springs, for surfaces
// that are choreographed procedurally (TimelineView/Canvas scenes) rather
// than through `withAnimation`. Uses Apple's documented
// spring(duration:bounce:) physics — mass 1, stiffness (2π/d)², damping
// (1−bounce)·4π/d — so a procedural scene and a
// `withAnimation(PremiumMotion.celebrate)` transition land on IDENTICAL
// curves. Never hand-type spring constants in a scene; evaluate one of these
// presets.
//
// Canon note: templates/design-system/PremiumCraft.swift is the canonical
// preset layer. The duration members below read DesignTokens.Motion directly;
// the bounce values restate the PremiumCraft presets (press 0.18,
// standard 0.12, emphasized 0.10, celebrate 0.30, celebrateLanding 0.45).
// If PremiumCraft changes a bounce, change it here in the same commit.

import Foundation
import SwiftUI

struct TokenSpring {
    let omega: Double // natural frequency ω = 2π / duration
    let zeta: Double  // damping fraction ζ = 1 − bounce

    init(duration: Double, bounce: Double) {
        omega = 2 * .pi / duration
        zeta = 1 - bounce
    }

    /// 0→1 progress at time `t` seconds after the spring starts (0 before).
    /// Underdamped closed form; ζ ≥ 1 falls back to the critically damped form.
    func progress(at t: Double) -> Double {
        guard t > 0 else { return 0 }
        if zeta < 1 {
            let wd = omega * (1 - zeta * zeta).squareRoot()
            let decay = exp(-zeta * omega * t)
            let phase = wd * t
            return 1 - decay * (cos(phase) + (zeta * omega / wd) * sin(phase))
        }
        let decay = exp(-omega * t)
        return 1 - decay * (1 + omega * t)
    }

    /// Instantaneous velocity of `progress` (1/s) — drives velocity-scaled
    /// effects like R7 motion blur, which must vanish at rest.
    func velocity(at t: Double) -> Double {
        guard t > 0 else { return 0 }
        let dt = 1.0 / 240
        return (progress(at: t + dt) - progress(at: t)) / dt
    }

    // The shipped preset scale (mirrors PremiumCraft.swift / DesignTokens.Motion).
    static let press = TokenSpring(duration: DesignTokens.Motion.durationFast, bounce: 0.18)
    static let standard = TokenSpring(duration: DesignTokens.Motion.durationBase, bounce: 0.12)
    static let emphasized = TokenSpring(duration: DesignTokens.Motion.durationSlow, bounce: 0.10)
    static let celebrate = TokenSpring(duration: DesignTokens.Motion.durationCelebrate, bounce: 0.30)
    static let celebrateLanding = TokenSpring(duration: DesignTokens.Motion.durationCelebrate, bounce: 0.45)
}

/// The easingEmphasis cubic-bezier (0.16, 1, 0.3, 1) evaluated numerically —
/// for procedural tweens that must match the declarative
/// `Animation.emphasized(duration:)` below.
enum TokenEase {
    static func emphasis(_ x: Double) -> Double {
        let t = min(max(x, 0), 1)
        // Newton-solve the bezier x(t) for the parameter, then evaluate y.
        var u = t
        for _ in 0..<6 {
            let x0 = bezier(u, 0.16, 0.3) - t
            let dx = bezierDerivative(u, 0.16, 0.3)
            if abs(dx) < 1e-6 { break }
            u -= x0 / dx
            u = min(max(u, 0), 1)
        }
        return bezier(u, 1, 1)
    }

    private static func bezier(_ t: Double, _ p1: Double, _ p2: Double) -> Double {
        let mt = 1 - t
        return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t
    }

    private static func bezierDerivative(_ t: Double, _ p1: Double, _ p2: Double) -> Double {
        let mt = 1 - t
        return 3 * mt * mt * p1 + 6 * mt * t * (p2 - p1) + 3 * t * t * (1 - p2)
    }
}

extension Animation {
    /// DesignTokens.Motion.easingEmphasis ("cubic-bezier(0.16, 1, 0.3, 1)")
    /// in SwiftUI form — the token ships the CSS string, so this is the one
    /// place its control points exist as Doubles on the declarative side.
    static func emphasized(duration: Double) -> Animation {
        .timingCurve(0.16, 1, 0.3, 1, duration: duration)
    }
}
