// DemoBloom.swift
// Recipe R2 — two-phase celebration bloom (motion-craft-benchmarks.md).
//
// A single saturated hero (LabTheme.primary disc) sits center. "Finish week one"
// triggers an earned moment: the hero contracts, bursts into a scatter of
// miniature clone circles, holds, then the clones reconverge while the hero
// settles with a soft overshoot. One event, never a loop, button locked while
// it plays.

import SwiftUI

struct DemoBloomView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var isPlaying = false
    /// Generation token: a Reduce Motion flip mid-bloom invalidates every
    /// pending phase callback and the stage resets to rest instantly.
    @State private var bloomID = 0
    @State private var heroScale: CGFloat = 1
    @State private var scattered = false
    @State private var showCelebrationRing = false
    @State private var clones: [DemoBloomClone] = DemoBloomView.makeClones()

    private let contractedScale: CGFloat = 0.96

    var body: some View {
        VStack(spacing: LabTheme.spaceLg) {
            VStack(spacing: LabTheme.spaceSm) {
                Text("Celebration Bloom")
                    .font(.display(28))
                    .foregroundStyle(LabTheme.text)
                Text("Tap \u{201c}Finish week one\u{201d} \u{2014} the hero bursts into a ring of light, holds, then blooms back together.")
                    .font(.body(14))
                    .foregroundStyle(LabTheme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LabTheme.spaceLg)
            }
            .padding(.top, LabTheme.spaceXl)
            .onDisappear {
                // A pending phase must never play its haptic after the
                // screen is gone.
                bloomID += 1
            }
            .onChange(of: reduceMotion) { _, _ in
                // Mid-bloom accessibility flips cancel the run outright: the
                // pending phases are invalidated and the stage rests.
                bloomID += 1
                withTransaction(Transaction(animation: nil)) {
                    heroScale = 1
                    scattered = false
                    showCelebrationRing = false
                    isPlaying = false
                }
            }

            Spacer()

            heroComposition
                .frame(height: 320)

            Spacer()

            PrimaryCTA(title: "Finish week one", haptic: nil, action: trigger)
                .opacity(isPlaying ? 0.35 : 1)
                .disabled(isPlaying)
                .premiumAnimation(PremiumMotion.standard, value: isPlaying)
        }
        .padding(.horizontal, LabTheme.spaceLg)
        .padding(.bottom, LabTheme.spaceLg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LabTheme.background)
    }

    // MARK: - Composition

    private var heroComposition: some View {
        ZStack {
            if reduceMotion {
                // Reduce Motion: no scatter, just a static ring cross-fading
                // in behind the (never-moving) hero.
                Circle()
                    .stroke(LabTheme.primary.opacity(0.35), lineWidth: 10)
                    .frame(width: 190, height: 190)
                    .opacity(showCelebrationRing ? 1 : 0)
            } else {
                ForEach(clones) { clone in
                    Circle()
                        .fill(clone.isAccent ? LabTheme.accent.opacity(clone.opacity) : LabTheme.primary.opacity(clone.opacity))
                        .frame(width: clone.size, height: clone.size)
                        .scaleEffect(scattered ? 1 : 0.3)
                        .opacity(scattered ? 1 : 0)
                        .offset(x: scattered ? clone.dx : 0, y: scattered ? clone.dy : 0)
                        .animation(
                            PremiumMotion.celebrateLanding.delay(clone.delay),
                            value: scattered
                        )
                }
            }

            heroDisc
                .scaleEffect(heroScale)
        }
    }

    private var heroDisc: some View {
        Circle()
            .fill(LabTheme.primary)
            .frame(width: 120, height: 120)
            .overlay(
                Image(systemName: "leaf.fill")
                    .font(.system(size: 44, weight: .medium))
                    .foregroundStyle(.white)
            )
            .shadow(color: LabTheme.text.opacity(0.14), radius: 16, y: 6)
            .accessibilityHidden(true)
    }

    // MARK: - Choreography

    /// Drives the two-phase bloom: contract -> burst+haptic -> hold
    /// (durationCinematic) -> reconverge + hero settle (celebrate) -> rest.
    /// Every wait and spring below reads DesignTokens.Motion / PremiumMotion —
    /// nothing here is an ad-hoc literal.
    private func trigger() {
        guard !isPlaying else { return }
        isPlaying = true
        bloomID += 1
        let generation = bloomID

        if reduceMotion {
            withAnimation(PremiumMotion.standard) {
                showCelebrationRing = true
            }
            Haptics.Event.success.play()
            DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.durationCinematic) {
                guard generation == bloomID else { return }
                withAnimation(PremiumMotion.standard) {
                    showCelebrationRing = false
                }
                isPlaying = false
            }
            return
        }

        // Phase 1: contraction — anticipation before the burst.
        withAnimation(PremiumMotion.press) {
            heroScale = contractedScale
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.durationFast) {
            guard generation == bloomID else { return }
            // Phase 2: the burst — haptic fires exactly here, clones scatter.
            Haptics.Event.success.play()
            scattered = true

            DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.durationCinematic) {
                guard generation == bloomID else { return }
                // Reconverge + settle — one coordinated moment, then rest.
                scattered = false
                withAnimation(PremiumMotion.celebrate) {
                    heroScale = 1
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.durationReveal) {
                    guard generation == bloomID else { return }
                    isPlaying = false
                }
            }
        }
    }

    // MARK: - Clone generation

    private static func makeClones() -> [DemoBloomClone] {
        let count = 16
        let accentIndices: Set<Int> = [2, 6, 10, 13]
        return (0..<count).map { i in
            let baseAngle = (Double(i) / Double(count)) * 2 * Double.pi
            let angle = baseAngle + Double.random(in: -0.12...0.12)
            let distance = CGFloat.random(in: 110...150)
            let size = CGFloat.random(in: 10...18)
            let opacity = Double.random(in: 0.35...0.95)
            // At most durationFast/8 (~15ms) stagger per clone so 16 circles
            // read as one burst, not a sequence.
            let delay = DesignTokens.Motion.durationFast / 8 * Double(i)
            return DemoBloomClone(
                id: i,
                dx: CGFloat(cos(angle)) * distance,
                dy: CGFloat(sin(angle)) * distance,
                size: size,
                opacity: opacity,
                isAccent: accentIndices.contains(i),
                delay: delay
            )
        }
    }
}

/// One miniature clone circle in the burst. File-private and demo-prefixed to
/// avoid colliding with other demos in the same lab menu.
private struct DemoBloomClone: Identifiable {
    let id: Int
    let dx: CGFloat
    let dy: CGFloat
    let size: CGFloat
    let opacity: Double
    let isAccent: Bool
    let delay: Double
}
