// DemoMeter.swift
// Catalog · meters — animated recovery meter / gauge (exemplar mechanics:
// Peak app's recovery meter arc, catalog eng 809; Google Health's blooming
// sequences, catalog eng 890). Mechanics only — the "Garden vitality" ring,
// serif readout, and coral bloom mark are our own Bloom-garden invention.
//
// A 270-degree arc gauge with 5 tick marks. "Recalculate" sweeps the arc and
// readout to a new random value together (PremiumMotion.emphasized), the
// crossed ticks light in a stagger cascade, and 7 mini sparkline bars re-roll
// alongside it. Crossing 80% for the first time fires an earned moment — one
// celebrateLanding pulse on the readout, a coral bloom dot at the arc tip, a
// success haptic. Below 80%, nothing extra happens: earned moments must be
// earned.

import SwiftUI

struct DemoMeterView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let tickValues: [Double] = [0, 25, 50, 75, 100]
    private let barCount = 7

    @State private var displayedValue: Double
    @State private var tickLit: [Bool]
    @State private var barValues: [CGFloat]
    @State private var pulseScale: CGFloat = 1
    @State private var bloomVisible = false
    @State private var contentOpacity: Double = 1
    /// Generation token: every recalculation invalidates the previous roll's
    /// delayed work, so a stale closure can never celebrate a value the
    /// current roll has already replaced.
    @State private var rollID = 0

    init() {
        let starting: Double = 62
        let ticks: [Double] = [0, 25, 50, 75, 100]
        _displayedValue = State(initialValue: starting)
        _tickLit = State(initialValue: ticks.map { $0 <= starting })
        _barValues = State(initialValue: (0..<7).map { _ in CGFloat.random(in: 0.3...0.75) })
    }

    var body: some View {
        VStack(spacing: LabTheme.spaceLg) {
            VStack(alignment: .leading, spacing: LabTheme.spaceSm) {
                Text("Garden vitality")
                    .font(.display(28))
                    .foregroundStyle(LabTheme.text)
                Text("Tap Recalculate — the arc sweeps, ticks catch up in sequence, and a bloom mark earns itself once vitality clears 80%.")
                    .font(.body(14))
                    .foregroundStyle(LabTheme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, LabTheme.spaceMd)

            Spacer(minLength: LabTheme.spaceSm)

            DemoMeterGauge(
                value: displayedValue,
                tickValues: tickValues,
                tickLit: tickLit,
                bloomVisible: bloomVisible,
                pulseScale: pulseScale
            )
            .opacity(contentOpacity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Garden vitality, \(Int(displayedValue.rounded())) percent")

            DemoMeterSparkline(values: barValues)
                .opacity(contentOpacity)
                .accessibilityHidden(true)

            Spacer()

            PrimaryCTA(title: "Recalculate", action: recalculate)
        }
        .padding(.horizontal, LabTheme.spaceLg)
        .padding(.bottom, LabTheme.spaceLg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LabTheme.background)
        // Navigating away invalidates the pending earned-moment callbacks —
        // a success haptic must never fire for a meter that is gone.
        .onDisappear { rollID += 1 }
        .onChange(of: reduceMotion) { _, _ in
            // A mid-roll flip cancels the scheduled cascades and squares the
            // ticks with the value the sweep already committed.
            rollID += 1
            withTransaction(Transaction(animation: nil)) {
                tickLit = tickValues.map { $0 <= displayedValue }
                pulseScale = 1
                contentOpacity = 1
            }
        }
    }

    // MARK: - Choreography

    /// Rolls a new vitality value and drives every dependent element from it.
    /// Every wait, spring, and cascade step below reads DesignTokens.Motion /
    /// PremiumMotion — nothing here is an ad-hoc literal.
    private func recalculate() {
        rollID += 1
        let generation = rollID
        // Square away any tick a cancelled cascade left stale before the new
        // one starts — the grid must agree with the committed value.
        withTransaction(Transaction(animation: nil)) {
            tickLit = tickValues.map { $0 <= displayedValue }
        }
        let previous = displayedValue
        // Span most of the tick range so multi-tick cascades actually occur
        // (a 55...95 roll could only ever flip the 75 tick).
        let newValue = Double.random(in: 15...95)
        let newBarValues = (0..<barCount).map { _ in CGFloat.random(in: 0.25...1.0) }
        let finalTickLit = tickValues.map { $0 <= newValue }
        // Crossing, not merely being above 80% — an already-high reading that
        // re-rolls to another high reading has not "earned" anything new.
        let willEarn = newValue >= 80 && previous < 80

        // analytics: when wiring into an app, track a recalculation event per
        // the analytics/ANALYTICS.md catalog with previous/new values and whether this
        // crossing is an earned moment (willEarn).

        if reduceMotion {
            // Cross-fade only: fade out, snap every value, fade back in. No
            // pulse, no cascade — the haptic is the one thing kept.
            withAnimation(.easeInOut(duration: DesignTokens.Motion.durationBase)) {
                contentOpacity = 0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.durationBase) {
                guard generation == rollID else { return }
                displayedValue = newValue
                tickLit = finalTickLit
                barValues = newBarValues
                pulseScale = 1
                bloomVisible = willEarn
                if willEarn { Haptics.Event.success.play() }
                withAnimation(.easeInOut(duration: DesignTokens.Motion.durationBase)) {
                    contentOpacity = 1
                }
            }
            return
        }

        // Arc + readout sweep together on the same animation.
        withAnimation(PremiumMotion.emphasized) {
            displayedValue = newValue
        }

        // Ticks the sweep passes light up (or dim) in stagger order, oldest
        // crossing first.
        let crossedIndices = demoMeterCrossedTickIndices(from: previous, to: newValue, tickValues: tickValues)
        for (order, index) in crossedIndices.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.stagger * Double(order)) {
                guard generation == rollID else { return }
                withAnimation(PremiumMotion.standard) {
                    tickLit[index] = finalTickLit[index]
                }
            }
        }

        // Sparkline re-rolls with the same stagger cascade.
        for index in 0..<barCount {
            DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.stagger * Double(index)) {
                guard generation == rollID else { return }
                withAnimation(PremiumMotion.standard) {
                    barValues[index] = newBarValues[index]
                }
            }
        }

        if willEarn {
            // Let the arc's emphasized sweep land first, then earn the moment.
            DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.durationSlow) {
                guard generation == rollID else { return }
                Haptics.Event.success.play()
                withAnimation(PremiumMotion.celebrateLanding) {
                    bloomVisible = true
                    pulseScale = 1.06
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.durationReveal) {
                    guard generation == rollID else { return }
                    withAnimation(PremiumMotion.celebrateLanding) {
                        pulseScale = 1.0
                    }
                }
            }
        } else {
            withAnimation(PremiumMotion.standard) {
                bloomVisible = false
                pulseScale = 1
            }
        }
    }
}

/// Ordered list of tick indices the sweep from `from` to `to` passes, closest
/// crossing first — ascending when the value climbs, descending when it
/// falls, so the lit/dim cascade always reads as following the arc's tip.
private func demoMeterCrossedTickIndices(from: Double, to: Double, tickValues: [Double]) -> [Int] {
    let lower = min(from, to)
    let upper = max(from, to)
    let crossed = tickValues.indices.filter { tickValues[$0] > lower && tickValues[$0] <= upper }
    return to >= from
        ? crossed.sorted { tickValues[$0] < tickValues[$1] }
        : crossed.sorted { tickValues[$0] > tickValues[$1] }
}

/// Point on the gauge's circle for a given 0...100 value, matching the same
/// start angle / arc fraction used to draw the track and fill so tick labels
/// and the bloom dot land exactly on the ring.
private func demoMeterPointOnRing(for value: Double, radius: CGFloat, startAngle: Double, arcFraction: CGFloat) -> CGSize {
    let fraction = value / 100
    let angleDegrees = startAngle + Double(arcFraction) * 360 * fraction
    let angleRadians = angleDegrees * .pi / 180
    let dx: Double = Foundation.cos(angleRadians)
    let dy: Double = Foundation.sin(angleRadians)
    return CGSize(width: radius * CGFloat(dx), height: radius * CGFloat(dy))
}

/// The 270-degree arc: neutral track, primary-filled progress, five tick
/// labels, the coral earned-bloom dot, and the serif percentage readout.
private struct DemoMeterGauge: View {
    let value: Double
    let tickValues: [Double]
    let tickLit: [Bool]
    let bloomVisible: Bool
    let pulseScale: CGFloat

    private let diameter: CGFloat = 250
    private let lineWidth: CGFloat = 20
    private let arcFraction: CGFloat = 0.75   // 270 of 360 degrees
    private let startAngle: Double = 135      // leaves a 90-degree gap at the bottom

    var body: some View {
        ZStack {
            Circle()
                .trim(from: 0, to: arcFraction)
                .stroke(LabTheme.border, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(startAngle))

            Circle()
                .trim(from: 0, to: arcFraction * CGFloat(value / 100))
                .stroke(LabTheme.primary, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(startAngle))

            ForEach(Array(tickValues.enumerated()), id: \.offset) { index, tickValue in
                DemoMeterTick(label: "\(Int(tickValue))", lit: tickLit[index])
                    .offset(demoMeterPointOnRing(
                        for: tickValue,
                        radius: diameter / 2 + 22,
                        startAngle: startAngle,
                        arcFraction: arcFraction
                    ))
            }

            if bloomVisible {
                Circle()
                    .fill(LabTheme.accent)
                    .frame(width: 14, height: 14)
                    .offset(demoMeterPointOnRing(
                        for: value,
                        radius: diameter / 2,
                        startAngle: startAngle,
                        arcFraction: arcFraction
                    ))
                    .shadow(color: LabTheme.accent.opacity(0.5), radius: 6)
                    .transition(.opacity.combined(with: .scale))
            }

            VStack(spacing: 2) {
                DemoMeterPercentText(value: value)
                    .scaleEffect(pulseScale)
                Text("vitality")
                    .font(.body(13, weight: .medium))
                    .foregroundStyle(LabTheme.muted)
            }
        }
        .frame(width: diameter, height: diameter)
        .padding(.horizontal, 22)
    }
}

/// A single tick label. Lit ticks read primary + semibold; unlit ticks recede
/// to the muted tone, so the "passing" cascade has real contrast to animate.
private struct DemoMeterTick: View {
    let label: String
    let lit: Bool

    var body: some View {
        Text(label)
            .font(.body(11, weight: lit ? .semibold : .regular))
            .foregroundStyle(lit ? LabTheme.primary : LabTheme.muted)
    }
}

/// Serif percentage readout. Conforming to `Animatable` lets SwiftUI
/// interpolate `value` frame-by-frame under the same `withAnimation` call
/// that drives the arc, so the digits genuinely count through the sweep;
/// `.numericText` layers the per-digit roll on top of that interpolation.
private struct DemoMeterPercentText: View, Animatable {
    var value: Double

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    var body: some View {
        Text("\(Int(value.rounded()))%")
            .font(.display(46))
            .foregroundStyle(LabTheme.text)
            .monospacedDigit()
            .contentTransition(.numericText(value: value))
    }
}

/// Seven mini bars under the gauge. Values are 0...1 fractions of the max
/// bar height; each bar's height animates independently in the stagger
/// cascade driven from `recalculate()`.
private struct DemoMeterSparkline: View {
    let values: [CGFloat]

    private let barWidth: CGFloat = 12
    private let maxHeight: CGFloat = 44

    var body: some View {
        HStack(alignment: .bottom, spacing: LabTheme.spaceSm) {
            ForEach(Array(values.enumerated()), id: \.offset) { _, level in
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(LabTheme.primary.opacity(0.55))
                    .frame(width: barWidth, height: max(4, maxHeight * level))
            }
        }
        .frame(height: maxHeight, alignment: .bottom)
    }
}
