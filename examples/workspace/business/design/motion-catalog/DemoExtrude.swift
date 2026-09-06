// DemoExtrude.swift
// Recipe R6 — data-driven 3D extrusion + camera turn (SwiftUI approximation,
// motion-craft-benchmarks.md).
//
// A "Your week in minutes" stat card: 7 neutral-track bars whose foreground
// fill maps to a data value (8-12 units, scaled to pt). "Lift" triggers one
// coordinated move — bars extrude from flat to their heights while the whole
// card turns toward the viewer on a single spring — so scale and rotation
// read as one object turning, not two separate effects. Collapse plays a
// brief off-axis wobble before the reverse, so it never reads as a symmetric
// rewind of the lift.

import SwiftUI

struct DemoExtrudeView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var lifted = false
    /// One-way trigger: success confirms the LIFT completing, never the
    /// lowering — the state Bool would fire feedback on both transitions.
    @State private var liftCount = 0
    /// Generation token: a new Lift or Lower invalidates the previous
    /// transition's delayed wobble callback, so rapid taps cannot leave a
    /// stale closure re-lowering the card after a newer lift.
    @State private var transitionID = 0
    @State private var wobbleDegrees: Double = 0

    private let bars: [DemoExtrudeBarDatum] = [
        .init(day: "Mon", minutes: 9),
        .init(day: "Tue", minutes: 11),
        .init(day: "Wed", minutes: 8),
        .init(day: "Thu", minutes: 12),
        .init(day: "Fri", minutes: 10),
        .init(day: "Sat", minutes: 9),
        .init(day: "Sun", minutes: 11),
    ]

    private var maxMinutes: Int {
        bars.map(\.minutes).max() ?? 0
    }

    var body: some View {
        VStack(spacing: LabTheme.spaceLg) {
            VStack(spacing: LabTheme.spaceSm) {
                Text("Extrude & Turn")
                    .font(.display(28))
                    .foregroundStyle(LabTheme.text)
                Text("Tap \u{201c}Lift\u{201d} \u{2014} the bars rise and the card turns toward you as one move. Tap again for a wobble, then it settles flat.")
                    .font(.body(14))
                    .foregroundStyle(LabTheme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LabTheme.spaceLg)
            }
            .padding(.top, LabTheme.spaceXl)

            Spacer()

            ZStack {
                shadowLayer
                cardLayer
            }
            .frame(height: 260)
            .sensoryFeedback(for: .success, trigger: liftCount)

            Spacer()

            // Lift's confirmation is the success feedback at the landing —
            // the CTA's own press haptic would stack a second, earlier pulse
            // on the same tap. Lower keeps the plain press haptic.
            PrimaryCTA(title: lifted ? "Lower" : "Lift", haptic: lifted ? .impactLight : nil, action: toggleLift)
                .padding(.horizontal, LabTheme.spaceLg)
        }
        .padding(.bottom, LabTheme.spaceLg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LabTheme.background)
    }

    // MARK: - Composition

    /// Soft elliptical contact shadow — only reads while the card is up in
    /// the air. Opacity is tied to the same `lifted` state and rides
    /// whichever transaction flips it, so it appears/fades in lockstep with
    /// the extrude/settle rather than on its own timer.
    private var shadowLayer: some View {
        Ellipse()
            .fill(LabTheme.text.opacity(0.16))
            .frame(width: 190, height: 26)
            .blur(radius: 14)
            .offset(y: 108)
            .opacity(lifted ? 1 : 0)
    }

    @ViewBuilder
    private var cardLayer: some View {
        if reduceMotion {
            // Reduce Motion: a true cross-fade between two static end
            // pictures — flat/ungrown at 0deg, extruded/grown at 32deg.
            // Neither rotation ever animates through intermediate angles;
            // only the opacity dissolve between the two layers animates.
            ZStack {
                DemoExtrudeStatCard(bars: bars, maxMinutes: maxMinutes, barGrowth: 0.02)
                    .rotation3DEffect(.degrees(0), axis: (x: 1, y: 0, z: 0.3), perspective: 0.5)
                    .opacity(lifted ? 0 : 1)
                    .accessibilityHidden(lifted) // opacity 0 still reads to VoiceOver
                DemoExtrudeStatCard(bars: bars, maxMinutes: maxMinutes, barGrowth: 1)
                    .rotation3DEffect(.degrees(32), axis: (x: 1, y: 0, z: 0.3), perspective: 0.5)
                    .opacity(lifted ? 1 : 0)
                    .accessibilityHidden(!lifted)
            }
        } else {
            DemoExtrudeStatCard(bars: bars, maxMinutes: maxMinutes, barGrowth: lifted ? 1 : 0.02)
                // Off-axis wobble kick, composed under the main isometric
                // tilt so a collapse never reads as the lift in reverse.
                .rotation3DEffect(.degrees(wobbleDegrees), axis: (x: 0, y: 0, z: 1))
                .rotation3DEffect(.degrees(lifted ? 32 : 0), axis: (x: 1, y: 0, z: 0.3), perspective: 0.5)
        }
    }

    // MARK: - Choreography

    private func toggleLift() {
        transitionID += 1
        if reduceMotion {
            if !lifted { liftCount += 1 }
            withAnimation(.easeInOut(duration: DesignTokens.Motion.durationBase)) {
                lifted.toggle()
            }
            return
        }

        if lifted {
            collapse()
        } else {
            // Extrude and camera turn complete together: one spring drives
            // both the bar growth and the card's rotation.
            liftCount += 1
            withAnimation(PremiumMotion.celebrate) {
                lifted = true
            }
        }
    }

    /// Brief off-axis wobble (durationFast band), then the reverse —
    /// deliberately asymmetric with the lift rather than a symmetric rewind.
    private func collapse() {
        let generation = transitionID
        withAnimation(PremiumMotion.press) {
            wobbleDegrees = -9
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.durationFast) {
            guard generation == transitionID else { return }
            withAnimation(PremiumMotion.press) {
                wobbleDegrees = 0
            }
            withAnimation(PremiumMotion.celebrate) {
                lifted = false
            }
        }
    }
}

/// One day's data point. File-private and demo-prefixed to avoid colliding
/// with other demos in the same lab menu.
private struct DemoExtrudeBarDatum: Identifiable {
    let id = UUID()
    let day: String
    let minutes: Int
}

/// The stat card itself: header + 7 bars. Purely presentational — no
/// internal state or animation — so the same view can be driven either by a
/// single animated `barGrowth` (normal motion) or rendered twice at fixed
/// end-state values and cross-faded (Reduce Motion).
private struct DemoExtrudeStatCard: View {
    let bars: [DemoExtrudeBarDatum]
    let maxMinutes: Int
    let barGrowth: CGFloat

    private let pointsPerMinute: CGFloat = 9
    private var trackHeight: CGFloat { CGFloat(maxMinutes) * pointsPerMinute }

    var body: some View {
        VStack(alignment: .leading, spacing: LabTheme.spaceMd) {
            HStack {
                Text("Your week in minutes")
                    .font(.body(15, weight: .semibold))
                    .foregroundStyle(LabTheme.text)
                Spacer()
                Image(systemName: "cube.transparent")
                    .foregroundStyle(LabTheme.muted)
            }
            HStack(alignment: .bottom, spacing: LabTheme.spaceSm) {
                ForEach(bars) { datum in
                    DemoExtrudeBarColumn(
                        datum: datum,
                        isHero: datum.minutes == maxMinutes,
                        trackHeight: trackHeight,
                        barGrowth: barGrowth,
                        pointsPerMinute: pointsPerMinute
                    )
                }
            }
        }
        .padding(LabTheme.spaceLg)
        .frame(width: 300)
        .background(
            RoundedRectangle(cornerRadius: LabTheme.radiusLg, style: .continuous)
                .fill(LabTheme.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: LabTheme.radiusLg, style: .continuous)
                        .strokeBorder(LabTheme.border.opacity(0.6), lineWidth: 1)
                )
        )
        .shadow(color: LabTheme.text.opacity(0.08), radius: 14, y: 6)
    }
}

/// A single bar: neutral background track (the "0" baseline) plus a
/// foreground fill scaled to the data value. Every bar is LabTheme.border
/// except the max-value bar, which is the single saturated LabTheme.primary
/// hero of the composition.
private struct DemoExtrudeBarColumn: View {
    let datum: DemoExtrudeBarDatum
    let isHero: Bool
    let trackHeight: CGFloat
    let barGrowth: CGFloat
    let pointsPerMinute: CGFloat

    private var fillHeight: CGFloat {
        max(CGFloat(datum.minutes) * pointsPerMinute * barGrowth, 2)
    }

    var body: some View {
        column
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(datum.day), \(datum.minutes) minutes")
    }

    private var column: some View {
        VStack(spacing: LabTheme.spaceSm) {
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(LabTheme.border.opacity(0.3))
                    .frame(height: trackHeight)
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(isHero ? LabTheme.primary : LabTheme.border)
                    .frame(height: fillHeight)
            }
            .frame(width: 20)
            Text(datum.day)
                .font(.body(11, weight: .medium))
                .foregroundStyle(LabTheme.muted)
        }
    }
}
