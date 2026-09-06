// DemoScrub.swift
// Recipe R5 — scrub-linked theming.
//
// A horizontal scrubber drives ONE shared 0-1 value (`scrub`). Nothing on
// screen owns an independent clock: the backdrop gradient, the big display
// readout's ink color, the icon tint, and the icon's soft glow radius are all
// pure functions of `scrub`. While the finger is down, `scrub` is set directly
// (1:1 tracking, zero easing) — only the release settle and the reduce-motion
// fallback read the shared motion tokens/presets, per the app's motion
// contract in DesignTokens.Motion / PremiumMotion.
//
// One saturated hero (LabTheme.primary) is used in exactly two places: the knob
// the user drags, and the glow that halos the icon at night. It fades to
// nothing by "day" and never appears in the backdrop (which is a desaturated,
// primary-derived dusk blending into the neutral cream LabTheme.background) or
// in the readout ink (white / warm off-white / LabTheme.text only) — so the
// hero never competes with the legible content it sits behind.

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct DemoScrubView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var scrub: Double = 0

    private static let demoScrubDetents: [Double] = [0, 0.25, 0.5, 0.75, 1.0]

    var body: some View {
        VStack(spacing: LabTheme.spaceLg) {
            Text("Scrub-Linked Theming")
                .font(.display(28))
                .foregroundStyle(LabTheme.text)

            Text("Drag the bar — one 0-1 value drives the backdrop, ink, icon, and glow together. Release to snap to the nearest of 5 stops.")
                .font(.body(14))
                .foregroundStyle(LabTheme.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, LabTheme.spaceLg)

            demoScrubSurface
                .frame(height: 340)
                .clipShape(RoundedRectangle(cornerRadius: LabTheme.radiusLg, style: .continuous))
                .padding(.horizontal, LabTheme.spaceLg)

            demoScrubTrack
                .padding(.horizontal, LabTheme.spaceLg)
                .padding(.top, LabTheme.spaceSm)

            Spacer(minLength: LabTheme.spaceLg)
        }
        .padding(.top, LabTheme.spaceXl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LabTheme.background)
    }

    // MARK: - Themed surface (background gradient + ink + icon + glow)

    private var demoScrubSurface: some View {
        ZStack {
            RoundedRectangle(cornerRadius: LabTheme.radiusLg, style: .continuous)
                .fill(demoScrubGradient)

            VStack(spacing: LabTheme.spaceMd) {
                ZStack {
                    if !reduceMotion {
                        Circle()
                            .fill(LabTheme.primary.opacity(0.55))
                            .frame(width: 132, height: 132)
                            .blur(radius: demoScrubGlowRadius)
                            .opacity(1 - scrub)
                    }
                    Image(systemName: demoScrubIsNight ? "moon.stars.fill" : "sun.max.fill")
                        .font(.system(size: 46, weight: .medium))
                        .foregroundStyle(demoScrubInk)
                        .accessibilityHidden(true)
                }

                Text(demoScrubIsNight ? "Tonight" : "Day \(demoScrubDetentIndex(scrub))")
                    .font(.display(40))
                    .foregroundStyle(demoScrubInk)
                    .contentTransition(.opacity)
                    .accessibilityHidden(true)
            }
        }
    }

    /// Deep, primary-derived dusk at scrub 0 blending into the neutral warm
    /// cream LabTheme.background/.surface at scrub 1 — both gradient stops read
    /// off the same shared value.
    private var demoScrubGradient: LinearGradient {
        LinearGradient(
            colors: [
                demoScrubMix(demoScrubMix(LabTheme.primary, .black, 0.38), LabTheme.background, scrub),
                demoScrubMix(demoScrubMix(LabTheme.primary, .black, 0.66), LabTheme.surface, scrub),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    /// White below the middle third, LabTheme.text above it, and — inside the
    /// middle third — a two-stage blend through a warm off-white so the exact
    /// crossing point is never pure white.
    private var demoScrubInk: Color {
        let warm = Color(red: 0.99, green: 0.95, blue: 0.88)
        let lowerThird = 1.0 / 3.0
        let upperThird = 2.0 / 3.0
        if scrub <= lowerThird {
            return .white
        } else if scrub >= upperThird {
            return LabTheme.text
        }
        let local = (scrub - lowerThird) / (upperThird - lowerThird)
        if local <= 0.5 {
            return demoScrubMix(.white, warm, local / 0.5)
        } else {
            return demoScrubMix(warm, LabTheme.text, (local - 0.5) / 0.5)
        }
    }

    /// Glow is strongest at "Tonight" and burns off by "Day 4"; Reduce Motion
    /// drops it outright (the surface omits the glow view entirely above).
    private var demoScrubGlowRadius: CGFloat {
        CGFloat((1 - scrub) * 30)
    }

    private var demoScrubIsNight: Bool {
        demoScrubDetentIndex(scrub) == 0
    }

    // MARK: - Scrubber (custom drag, 1:1 tracking)

    private var demoScrubTrack: some View {
        GeometryReader { geo in
            let width = max(geo.size.width, 1)
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(LabTheme.border.opacity(0.7))
                    .frame(width: width, height: 6)

                ForEach(Array(Self.demoScrubDetents.enumerated()), id: \.offset) { _, detent in
                    Circle()
                        .fill(LabTheme.border)
                        .frame(width: 4, height: 4)
                        .offset(x: CGFloat(detent) * width - 2, y: 15)
                }

                Circle()
                    .fill(LabTheme.primary)
                    .frame(width: 28, height: 28)
                    .shadow(color: LabTheme.text.opacity(0.18), radius: 4, y: 2)
                    .offset(x: CGFloat(scrub) * width - 14, y: 4)
            }
            .frame(width: width, height: 36)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        demoScrubHandleDrag(x: value.location.x, width: width)
                    }
                    .onEnded { value in
                        demoScrubHandleRelease(velocityX: value.velocity.width, width: width)
                    }
            )
        }
        .frame(height: 36)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Time of day scrubber")
        .accessibilityValue(demoScrubIsNight ? "Tonight" : "Day \(demoScrubDetentIndex(scrub))")
        // VoiceOver owns the drag gestures, so the scrubber must also be
        // adjustable: swipe up/down steps through the same detents the
        // release settle snaps to.
        .accessibilityAdjustableAction { direction in
            let index = demoScrubDetentIndex(scrub)
            let next: Int
            switch direction {
            case .increment: next = min(index + 1, Self.demoScrubDetents.count - 1)
            case .decrement: next = max(index - 1, 0)
            @unknown default: return
            }
            withAnimation(reduceMotion ? nil : PremiumMotion.standard) {
                scrub = Self.demoScrubDetents[next]
            }
        }
    }

    /// Finger owns the clock: the raw position maps straight to `scrub` with
    /// no animation wrapper. Only the discrete nearest-detent label crossing
    /// gets a confirming haptic.
    private func demoScrubHandleDrag(x: CGFloat, width: CGFloat) {
        let t = Double(min(max(x / width, 0), 1))
        let oldIndex = demoScrubDetentIndex(scrub)
        scrub = t
        let newIndex = demoScrubDetentIndex(scrub)
        if newIndex != oldIndex {
            Haptics.Event.selection.play()
        }
    }

    /// Release settles to the nearest detent on the standard preset's shape,
    /// seeded with the drag's own release velocity (every release settle
    /// receives the gesture's ending velocity — the benchmarks' handoff
    /// rule). Reduce Motion uses the shortest non-bouncing token instead.
    private func demoScrubHandleRelease(velocityX: CGFloat, width: CGFloat) {
        let target = Self.demoScrubDetents[demoScrubDetentIndex(scrub)]
        if reduceMotion {
            withAnimation(.easeOut(duration: DesignTokens.Motion.durationFast)) {
                scrub = target
            }
            return
        }
        // Signed handoff in scrub units: velocity toward the detent seeds the
        // spring positive, away seeds it negative, normalized by the travel.
        let travel = target - scrub
        let scrubVelocity = Double(velocityX / max(width, 1))
        let normalized = abs(travel) > 0.0005 ? min(max(scrubVelocity / travel, -6), 6) : 0
        withAnimation(
            .interpolatingSpring(
                duration: DesignTokens.Motion.durationBase,
                bounce: 0.12,
                initialVelocity: normalized
            )
        ) {
            scrub = target
        }
    }

    private func demoScrubDetentIndex(_ value: Double) -> Int {
        var bestIndex = 0
        var bestDistance = Double.greatestFiniteMagnitude
        for (index, detent) in Self.demoScrubDetents.enumerated() {
            let distance = abs(detent - value)
            if distance < bestDistance {
                bestDistance = distance
                bestIndex = index
            }
        }
        return bestIndex
    }

    /// Component-wise color lerp. Used for every derived hue in this file so
    /// the dusk backdrop, the ink crossover, and the glow all share one blend
    /// primitive instead of ad-hoc math scattered through the view code.
    private func demoScrubMix(_ from: Color, _ to: Color, _ t: Double) -> Color {
        let a = demoScrubComponents(of: from)
        let b = demoScrubComponents(of: to)
        return Color(
            red: a.r + (b.r - a.r) * t,
            green: a.g + (b.g - a.g) * t,
            blue: a.b + (b.b - a.b) * t,
            opacity: a.a + (b.a - a.a) * t
        )
    }

    private func demoScrubComponents(of color: Color) -> (r: Double, g: Double, b: Double, a: Double) {
        #if canImport(UIKit)
        let ui = UIColor(color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b), Double(a))
        #else
        return (0, 0, 0, 1)
        #endif
    }
}
