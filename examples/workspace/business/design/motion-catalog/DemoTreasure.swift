// DemoTreasure.swift
// Motion pattern: variable-reward chest.
// Mechanic mined from the 60fps.design catalog entry for Duolingo's mega
// treasure chest (catalog eng 711) and the scratch-card family's R10 bright
// line — the reward must be genuinely variable, never the same twice in a
// row by design. Only the MECHANIC is reused here: anticipation-before-payoff,
// a single flying reward, a particle puff, and a settle-and-label reflow. The
// pouch, drawstring, and reward glyphs below are original Bloom-garden
// artwork (seed pouch, not a chest; no mascot, no borrowed iconography).
//
// Every app-driven duration here reads DesignTokens.Motion / PremiumMotion —
// no ad-hoc seconds in animation or scheduling code.

import SwiftUI

struct DemoTreasureView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var isBusy = false

    // Pouch anticipation
    @State private var pouchRotation: Double = 0     // z-axis wiggle, degrees
    @State private var pouchSquashY: CGFloat = 1     // vertical squash scale
    @State private var flapOpenDegrees: Double = 0   // rotation3D x-axis, lid

    // Reward
    @State private var reward: DemoTreasureRewardKind? = nil
    @State private var rewardVisible = false   // opacity (both branches)
    @State private var rewardLanded = false    // scale/rotation settle
    /// Success feedback fires per completed landing, never on the reset that
    /// flips `rewardLanded` back to false at the start of the next opening.
    @State private var rewardLandCount = 0
    @State private var rewardSharp = false     // blur clears
    @State private var labelVisible = false

    // Particle puff
    @State private var particlesActive = false
    @State private var particleBurstID = 0
    @State private var particles: [DemoTreasureParticle] = []
    @State private var sequenceTask: Task<Void, Never>? = nil

    var body: some View {
        ZStack {
            LabTheme.background.ignoresSafeArea()

            VStack(spacing: LabTheme.spaceLg) {
                VStack(spacing: LabTheme.spaceSm) {
                    Text("Today's Pouch")
                        .font(.display(28))
                        .foregroundStyle(LabTheme.text)
                    Text("Tap the pouch, or the button below — the seed inside is a genuine surprise every time.")
                        .font(.body(14))
                        .foregroundStyle(LabTheme.muted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, LabTheme.spaceLg)
                }
                .padding(.top, LabTheme.spaceLg)

                Spacer()

                treasureComposition

                Spacer()

                PrimaryCTA(title: "Open today's pouch", haptic: nil, action: trigger)
                    .disabled(isBusy)
                    .opacity(isBusy ? 0.45 : 1)
                    .premiumAnimation(PremiumMotion.standard, value: isBusy)
            }
            .padding(.horizontal, LabTheme.spaceLg)
            .padding(.bottom, LabTheme.spaceLg)
        }
        .onChange(of: reduceMotion) { _, _ in
            // Flip mid-open: cancel the running choreography and rest the
            // stage instantly — the one-time branch choice must not play on
            // under the new setting.
            sequenceTask?.cancel()
            let landedByCancel = isBusy && reward != nil
            withTransaction(Transaction(animation: nil)) {
                pouchRotation = 0
                pouchSquashY = 1
                flapOpenDegrees = 0
                rewardVisible = reward != nil
                rewardLanded = reward != nil
                rewardSharp = reward != nil
                labelVisible = reward != nil
                particlesActive = false
                isBusy = false
            }
            // The settle above IS the landing for an interrupted opening —
            // the win still gets its one success confirmation.
            if landedByCancel { rewardLandCount += 1 }
        }
    }

    // MARK: - Composition

    private var treasureComposition: some View {
        ZStack {
            pouchAssembly
                .contentShape(Rectangle())
                .onTapGesture(perform: trigger)

            if particlesActive {
                DemoTreasureParticleBurstView(particles: particles)
                    .id(particleBurstID)
                    .offset(y: -84)
            }

            if let reward {
                DemoTreasureRewardBadge(kind: reward)
                    .scaleEffect(reduceMotion ? 1 : (rewardLanded ? 1 : 0.25))
                    .rotationEffect(.degrees(reduceMotion ? 0 : (rewardLanded ? 0 : 24)))
                    .blur(radius: reduceMotion ? 0 : (rewardSharp ? 0 : 6))
                    .opacity(rewardVisible ? 1 : 0)
                    .offset(y: -168)
            }
        }
        // Mounted from first render: a modifier on the conditional badge
        // would mount with the counter already advanced on the first
        // reduced-motion win and observe no change.
        .sensoryFeedback(for: .success, trigger: rewardLandCount)
        .frame(height: 320)
        .overlay(alignment: .bottom) {
            rewardLabel
        }
    }

    private var rewardLabel: some View {
        Group {
            if let reward {
                Text("\(reward.title) — \(reward.caption)")
                    .font(.body(14, weight: .semibold))
                    .foregroundStyle(LabTheme.text)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LabTheme.spaceLg)
            }
        }
        .opacity(labelVisible ? 1 : 0)
        // Opacity alone does not remove the mounted label from the
        // accessibility tree — the prize must not be hearable mid-flight.
        .accessibilityHidden(!labelVisible)
    }

    private var pouchAssembly: some View {
        ZStack {
            Ellipse()
                .fill(LabTheme.text.opacity(0.14))
                .frame(width: 150, height: 22)
                .blur(radius: 10)
                .offset(y: 106)

            DemoTreasurePouchShape()
                .fill(
                    LinearGradient(
                        colors: [LabTheme.primary, LabTheme.primary.opacity(0.85)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
                .frame(width: 172, height: 196)

            // Drawstring gather + knot, drawn with plain shapes.
            VStack(spacing: 4) {
                Capsule()
                    .fill(LabTheme.primary.opacity(0.4))
                    .frame(width: 76, height: 5)
                Capsule()
                    .fill(LabTheme.background.opacity(0.5))
                    .frame(width: 20, height: 10)
            }
            .offset(y: -82)
            .accessibilityHidden(true)

            RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
                .fill(LabTheme.primary.opacity(0.92))
                .overlay(
                    RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
                        .strokeBorder(LabTheme.background.opacity(0.3), lineWidth: 1)
                )
                .frame(width: 100, height: 44)
                .offset(y: -80)
                .rotation3DEffect(
                    .degrees(flapOpenDegrees),
                    axis: (x: 1, y: 0, z: 0),
                    anchor: .top,
                    perspective: 0.6
                )
                .accessibilityHidden(true)
        }
        .scaleEffect(x: 1, y: pouchSquashY, anchor: .bottom)
        .rotationEffect(.degrees(pouchRotation))
        .accessibilityLabel("Today's seed pouch")
    }

    // MARK: - Sequencing

    private func trigger() {
        guard !isBusy else { return }
        isBusy = true
        // Variable reward means variable: never re-deal the reward already
        // on display (the card's "never the same twice" bright line).
        let pool = DemoTreasureRewardKind.allCases.filter { $0 != reward }
        let chosen = pool.randomElement() ?? .goldenLeaf
        sequenceTask = Task { @MainActor in
            // Cancellation contract: a Reduce Motion flip mid-sequence cancels
            // this task at the first cancelled sleep (sleeps propagate).
            do {
                if reduceMotion {
                    try await runReducedSequence(chosen)
                } else {
                    try await runFullSequence(chosen)
                }
            } catch {}
            isBusy = false
        }
    }

    /// Full-motion path: anticipation wiggle+squash, flap opens with a
    /// particle puff, the reward flies in and lands (R3 overshoot-and-settle),
    /// then a coordinated no-bounce reflow settles the pouch and reveals the
    /// label.
    @MainActor
    private func runFullSequence(_ chosen: DemoTreasureRewardKind) async throws {
        if reward != nil {
            withAnimation(.easeOut(duration: DesignTokens.Motion.durationFast)) {
                rewardVisible = false
                labelVisible = false
            }
            try await Task.sleep(for: .seconds(DesignTokens.Motion.durationFast))
        }

        reward = chosen
        rewardVisible = false
        rewardLanded = false
        rewardSharp = false
        flapOpenDegrees = 0
        pouchSquashY = 1
        particlesActive = false

        // 1. Anticipation: tight wiggle (two cycles) + 4% squash before payoff.
        pouchRotation = -3
        withAnimation(
            .easeInOut(duration: DesignTokens.Motion.durationFast)
                .repeatCount(4, autoreverses: true)
        ) {
            pouchRotation = 3
        }
        withAnimation(PremiumMotion.press) {
            pouchSquashY = 0.96
        }
        try await Task.sleep(for: .seconds(DesignTokens.Motion.durationFast * 2))
        withAnimation(PremiumMotion.press) {
            pouchSquashY = 1
        }
        try await Task.sleep(for: .seconds(DesignTokens.Motion.durationFast * 2))
        withAnimation(.easeOut(duration: DesignTokens.Motion.durationFast)) {
            pouchRotation = 0
        }

        // 2. Payoff: flap opens, particles puff once, the reward flies up
        // small+blurred from the pouch mouth and lands with an oscillating
        // overshoot (celebrateLanding). Blur clears on the fast phase only so
        // the landing itself is tack-sharp.
        particles = DemoTreasureParticle.makeBurst()
        particleBurstID += 1
        withAnimation(PremiumMotion.celebrate) {
            flapOpenDegrees = -110
        }
        particlesActive = true
        rewardVisible = true
        withAnimation(PremiumMotion.celebrateLanding) {
            rewardLanded = true
            rewardLandCount += 1
        }
        withAnimation(.easeOut(duration: DesignTokens.Motion.durationBase)) {
            rewardSharp = true
        }

        // 3. Hold one cinematic beat once the reveal window closes.
        try await Task.sleep(
            for: .seconds(DesignTokens.Motion.durationReveal + DesignTokens.Motion.durationCinematic)
        )

        // 4. Coordinated reflow: label fades in as the pouch settles closed,
        // both on the same no-bounce curve.
        withAnimation(.easeOut(duration: DesignTokens.Motion.durationBase)) {
            labelVisible = true
            flapOpenDegrees = 0
        }
        try await Task.sleep(for: .seconds(DesignTokens.Motion.durationBase))
        particlesActive = false
    }

    /// Reduce Motion path: the pouch never moves and no particles puff. The
    /// reward is a true cross-fade (scale/rotation/blur pinned to their
    /// settled values above), and the success haptic still confirms the win.
    @MainActor
    private func runReducedSequence(_ chosen: DemoTreasureRewardKind) async throws {
        if reward != nil {
            withAnimation(.easeInOut(duration: DesignTokens.Motion.durationBase)) {
                rewardVisible = false
                labelVisible = false
            }
            try await Task.sleep(for: .seconds(DesignTokens.Motion.durationBase))
        }

        reward = chosen
        rewardLanded = false
        rewardSharp = true
        flapOpenDegrees = 0
        pouchSquashY = 1
        pouchRotation = 0
        particlesActive = false

        withAnimation(.easeInOut(duration: DesignTokens.Motion.durationBase)) {
            rewardVisible = true
            rewardLanded = true
            rewardLandCount += 1
        }
        try await Task.sleep(for: .seconds(DesignTokens.Motion.durationBase))
        withAnimation(.easeInOut(duration: DesignTokens.Motion.durationBase)) {
            labelVisible = true
        }
        try await Task.sleep(for: .seconds(DesignTokens.Motion.durationBase))
    }
}

// MARK: - Pouch silhouette

/// A drawstring seed pouch: a gathered neck widening into a rounded sack.
/// Original Bloom-garden geometry, not a borrowed chest/mascot asset.
private struct DemoTreasurePouchShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let h = rect.height
        let neckHalf = w * 0.27
        let midY = rect.minY + h * 0.42

        var path = Path()
        path.move(to: CGPoint(x: rect.midX - neckHalf, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.midX + neckHalf, y: rect.minY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: midY),
            control: CGPoint(x: rect.maxX, y: rect.minY + h * 0.08)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.midX, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.maxY)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.minX, y: midY),
            control: CGPoint(x: rect.minX, y: rect.maxY)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.midX - neckHalf, y: rect.minY),
            control: CGPoint(x: rect.minX, y: rect.minY + h * 0.08)
        )
        path.closeSubpath()
        return path
    }
}

// MARK: - Reward kinds (variable reward set)

private enum DemoTreasureRewardKind: CaseIterable {
    case goldenLeaf
    case rainCharm
    case streakShield

    var symbol: String {
        switch self {
        case .goldenLeaf: return "leaf.fill"
        case .rainCharm: return "drop.fill"
        case .streakShield: return "shield.fill"
        }
    }

    var title: String {
        switch self {
        case .goldenLeaf: return "Golden Leaf"
        case .rainCharm: return "Rain Charm"
        case .streakShield: return "Streak Shield"
        }
    }

    var caption: String {
        switch self {
        case .goldenLeaf: return "+1 day streak armor"
        case .rainCharm: return "waters a day you miss"
        case .streakShield: return "shields one skipped day"
        }
    }

    /// Golden Leaf carries the composition's one permitted secondary accent.
    /// Rain Charm is a blue-tinted blend off the primary hue. Streak Shield
    /// stays neutral white-on-primary, matching the hero-card convention
    /// already used for the onboarding hero glyph.
    var glyphTint: Color {
        switch self {
        case .goldenLeaf: return LabTheme.accent
        case .rainCharm: return Color(hex: "#3f8fae")
        case .streakShield: return .white
        }
    }
}

private struct DemoTreasureRewardBadge: View {
    let kind: DemoTreasureRewardKind

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: LabTheme.radiusLg, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [LabTheme.primary, LabTheme.primary.opacity(0.82)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                .frame(width: 108, height: 108)
            Image(systemName: kind.symbol)
                .font(.system(size: 46, weight: .medium))
                .foregroundStyle(kind.glyphTint)
        }
        .shadow(color: LabTheme.text.opacity(0.18), radius: 14, y: 6)
        .accessibilityHidden(true)
    }
}

// MARK: - Particle puff

private struct DemoTreasureParticle: Identifiable {
    let id = UUID()
    let angle: Double     // radians, biased upward/outward from the pouch mouth
    let distance: CGFloat
    let scale: CGFloat

    static func makeBurst(count: Int = 12) -> [DemoTreasureParticle] {
        (0..<count).map { index in
            let baseAngle = (Double.pi * 2 / Double(count)) * Double(index)
            let jitter = Double.random(in: -0.3...0.3)
            return DemoTreasureParticle(
                angle: baseAngle + jitter,
                distance: CGFloat.random(in: 26...46),
                scale: CGFloat.random(in: 0.55...1.0)
            )
        }
    }
}

/// A single burst, self-starting on appear so it never sits idle on screen:
/// mounted only for the moment of the puff, then removed. Each clone's
/// stagger is capped at durationFast/8 as the recipe requires, and every
/// clone fades within one durationReveal beat.
private struct DemoTreasureParticleBurstView: View {
    let particles: [DemoTreasureParticle]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var expanded = false

    var body: some View {
        ZStack {
            ForEach(Array(particles.enumerated()), id: \.element.id) { index, particle in
                Circle()
                    .fill(LabTheme.muted.opacity(0.55))
                    .frame(width: 5 * particle.scale, height: 5 * particle.scale)
                    .offset(
                        x: expanded ? CGFloat(cos(particle.angle)) * particle.distance : 0,
                        y: expanded ? CGFloat(sin(particle.angle)) * particle.distance : 0
                    )
                    .opacity(expanded ? 0 : 1)
                    .animation(
                        .easeOut(duration: DesignTokens.Motion.durationReveal)
                            .delay(Double(index) * (DesignTokens.Motion.durationFast / 8)),
                        value: expanded
                    )
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear {
            guard !reduceMotion else { return }
            expanded = true
        }
    }
}
