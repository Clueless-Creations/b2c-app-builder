// MotionLabIndex.swift — motion-catalog exemplar pack
//
// Index screen for the pack: one row per exemplar, each naming the recipe or
// catalog family it implements. Drop this into a debug build (or a hidden
// developer screen) to preview every pattern on-device before adapting one —
// reviewers grade motion from a running surface, never from prose.

import SwiftUI

private struct MotionLabEntry: Identifiable {
    let id: String
    let tag: String
    let title: String
    let detail: String
    let symbol: String
}

struct MotionLabIndex: View {
    private let entries: [MotionLabEntry] = [
        MotionLabEntry(id: "cardreveal", tag: "Baseline A", title: "Card reveal unboxing", detail: "Word cascade, origami unfold, hero card", symbol: "shippingbox"),
        MotionLabEntry(id: "spherecloud", tag: "Baseline B", title: "Sphere cloud dive", detail: "Burst, orbit, camera dive, hero landing", symbol: "globe"),
        MotionLabEntry(id: "mascot", tag: "Catalog · mascots", title: "Mascot moods", detail: "Emotion states, ambient breathing, joy burst", symbol: "face.smiling"),
        MotionLabEntry(id: "treasure", tag: "Catalog · variable reward", title: "Reward pouch", detail: "Anticipation wiggle, R3 reward landing", symbol: "gift"),
        MotionLabEntry(id: "bloom", tag: "R2", title: "Celebration bloom", detail: "Contract, burst, hold, reconverge", symbol: "sparkles"),
        MotionLabEntry(id: "scratch", tag: "R10", title: "Scratch-card reveal", detail: "Torn-foil mask, finger-owned clock", symbol: "hand.draw"),
        MotionLabEntry(id: "meter", tag: "Catalog · meters", title: "Vitality gauge", detail: "Counting arc, earned pulse past 80%", symbol: "gauge.with.needle"),
        MotionLabEntry(id: "shiny", tag: "Catalog · shiny card", title: "Holo tilt card", detail: "Tilt-driven holographic sheen", symbol: "creditcard"),
        MotionLabEntry(id: "scrub", tag: "R5", title: "Scrub theming", detail: "One scalar re-themes the surface", symbol: "slider.horizontal.3"),
        MotionLabEntry(id: "gesture", tag: "Physics", title: "Throwable card", detail: "1:1 tracking, velocity handoff", symbol: "hand.point.up.left"),
        MotionLabEntry(id: "extrude", tag: "R6", title: "Week in 3D", detail: "Extrude + camera turn together", symbol: "cube"),
        MotionLabEntry(id: "grid", tag: "R1", title: "Living grid", detail: "Out-of-phase swaps, zero reflow", symbol: "square.grid.3x3"),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: LabTheme.spaceLg) {
                    VStack(alignment: .leading, spacing: LabTheme.spaceSm) {
                        Text("Motion Lab")
                            .font(.display(32))
                            .foregroundStyle(LabTheme.text)
                        Text("Every pattern rides the shipped token scale. Mechanics from the 60fps.design catalog; nothing borrowed but the physics.")
                            .font(.body(15))
                            .foregroundStyle(LabTheme.muted)
                    }
                    .padding(.top, LabTheme.spaceMd)

                    VStack(spacing: LabTheme.spaceSm + 4) {
                        ForEach(entries) { entry in
                            NavigationLink(value: entry.id) {
                                rowLabel(entry: entry)
                            }
                            .buttonStyle(PremiumPressStyle(haptic: nil))
                        }
                    }
                }
                .padding(.horizontal, LabTheme.spaceLg)
                .padding(.bottom, LabTheme.spaceXl)
            }
            .background(LabTheme.background.ignoresSafeArea())
            .navigationDestination(for: String.self) { id in
                destination(for: id)
                    .background(LabTheme.background.ignoresSafeArea())
            }
        }
    }

    @ViewBuilder
    private func destination(for id: String) -> some View {
        switch id {
        case "cardreveal": DemoCardRevealView()
        case "spherecloud": DemoSphereCloudView()
        case "mascot": DemoMascotView()
        case "treasure": DemoTreasureView()
        case "bloom": DemoBloomView()
        case "scratch": DemoScratchView()
        case "meter": DemoMeterView()
        case "shiny": DemoShinyView()
        case "scrub": DemoScrubView()
        case "gesture": DemoGestureView()
        case "extrude": DemoExtrudeView()
        case "grid": DemoGridView()
        default: EmptyView()
        }
    }

    private func rowLabel(entry: MotionLabEntry) -> some View {
        HStack(spacing: LabTheme.spaceMd) {
            Image(systemName: entry.symbol)
                .font(.body(20, weight: .medium))
                .foregroundStyle(LabTheme.primary)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.tag.uppercased())
                    .font(.body(11, weight: .semibold))
                    .foregroundStyle(LabTheme.muted)
                Text(entry.title)
                    .font(.body(17, weight: .semibold))
                    .foregroundStyle(LabTheme.text)
                Text(entry.detail)
                    .font(.body(13))
                    .foregroundStyle(LabTheme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.body(14, weight: .semibold))
                .foregroundStyle(LabTheme.border)
        }
        .padding(LabTheme.spaceMd)
        .background(
            RoundedRectangle(cornerRadius: LabTheme.radiusLg, style: .continuous)
                .fill(LabTheme.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: LabTheme.radiusLg, style: .continuous)
                        .strokeBorder(LabTheme.border, lineWidth: 1)
                )
        )
        .contentShape(Rectangle())
    }
}
