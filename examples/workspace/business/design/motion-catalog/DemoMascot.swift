// DemoMascot.swift
// Motion pattern: mascot animations that spark joy.
// Mechanic mined from the 60fps.design catalog entry for the Duolingo mascot
// family (catalog eng 855) — a small creature with a handful of discrete
// emotion states, each with its own idle/ambient behavior and its own
// transition-in choreography (breathing, blinking, a bounce-and-sparkle
// celebration, a determined lean, a sleepy float). Only the MECHANIC is
// reused here: state-driven ambient loops + one-shot celebration bursts on
// a small original character. "Sprout" — a rounded-capsule leaf-creature — is
// original Bloom-garden artwork, drawn entirely from SwiftUI shapes below.
// No Duolingo asset, silhouette, or color is referenced or reproduced.
//
// Every app-driven duration/spring reads DesignTokens.Motion or PremiumMotion
// — no ad-hoc seconds in animation or scheduling code. Ambient loops (idle
// breathing/sway/blink schedule, the sleepy z-float) pace inside the
// 0.6-1.2s band via durationReveal multiples, per the shared motion
// contract. Reduce Motion collapses every decorative loop and one-shot burst
// to a static settle (see `enter(_:)` and each overlay view's onAppear
// guard); pose changes still cross-fade via a plain, non-bouncing curve.

import SwiftUI

// MARK: - Screen

struct DemoMascotView: View {
    @State private var emotion: DemoMascotEmotion = .idle

    var body: some View {
        VStack(spacing: LabTheme.spaceLg) {
            VStack(spacing: LabTheme.spaceSm) {
                Text("Meet Sprout")
                    .font(.display(30))
                    .foregroundStyle(LabTheme.text)
                Text("Pick a mood — watch Sprout's idle breathing, joyful bounce, focused glow, or sleepy float.")
                    .font(.body(14))
                    .foregroundStyle(LabTheme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LabTheme.spaceLg)
            }
            .padding(.top, LabTheme.spaceLg)

            Spacer(minLength: LabTheme.spaceLg)

            DemoMascotSproutView(emotion: emotion)
                .frame(height: 260)

            Spacer(minLength: LabTheme.spaceLg)

            DemoMascotEmotionPicker(emotion: $emotion)
                .padding(.horizontal, LabTheme.spaceLg)
                .padding(.bottom, LabTheme.spaceLg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LabTheme.background)
    }
}

// MARK: - Emotion model + picker

private enum DemoMascotEmotion: CaseIterable {
    case idle, joy, focus, sleepy

    var label: String {
        switch self {
        case .idle: return "Idle"
        case .joy: return "Joy"
        case .focus: return "Focus"
        case .sleepy: return "Sleepy"
        }
    }

    var symbol: String {
        switch self {
        case .idle: return "leaf"
        case .joy: return "star.fill"
        case .focus: return "scope"
        case .sleepy: return "moon.zzz.fill"
        }
    }
}

private struct DemoMascotEmotionPicker: View {
    @Binding var emotion: DemoMascotEmotion

    var body: some View {
        HStack(spacing: LabTheme.spaceSm) {
            ForEach(DemoMascotEmotion.allCases, id: \.self) { option in
                Button {
                    emotion = option
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: option.symbol)
                            .font(.body(16, weight: .semibold))
                        Text(option.label)
                            .font(.body(12, weight: .semibold))
                    }
                    .foregroundStyle(emotion == option ? .white : LabTheme.muted)
                    .frame(maxWidth: .infinity)
                    .frame(height: 58)
                    .background(
                        RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
                            .fill(emotion == option ? LabTheme.primary : LabTheme.surface)
                            .overlay(
                                RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
                                    .strokeBorder(LabTheme.border, lineWidth: emotion == option ? 0 : 1)
                            )
                    )
                }
                .buttonStyle(PremiumPressStyle(haptic: nil))
            }
        }
        .premiumAnimation(PremiumMotion.standard, value: emotion)
        // Joy's entry already confirms with success feedback; stacking the
        // selection tick under it would double-pulse one tap.
        .sensoryFeedback(.selection, trigger: emotion) { _, entered in
            entered != .joy
        }
    }
}

// MARK: - Sprout

/// Drives Sprout's pose + ambient loops from the current `emotion`. Every
/// transition runs inside `.task(id: emotion)`, so SwiftUI cancels whatever
/// the previous state was doing the instant the user picks a new one — state
/// transitions are always interruptible by construction, not by bookkeeping.
private struct DemoMascotTaskKey: Hashable {
    let emotion: DemoMascotEmotion
    let reduced: Bool
}

private struct DemoMascotSproutView: View {
    let emotion: DemoMascotEmotion
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Idle-only ambient motion. Reset to baseline whenever any other state
    // is entered (see `enter(_:)`), which is what stops the loop — a
    // repeating animation keeps replaying until its driving value is
    // reassigned outside of an animation context.
    @State private var ambientBreatheScale: CGFloat = 1
    @State private var ambientLeafSway: Double = -4
    @State private var eyeBlinkScale: CGFloat = 1
    /// Success feedback fires on ENTERING joy only — a Bool trigger would
    /// also fire when leaving it (any change fires sensoryFeedback).
    @State private var joyEntryCount = 0
    @State private var lastEmotion: DemoMascotEmotion?

    // Persistent per-state pose.
    @State private var poseLean: Double = 0
    @State private var eyeScaleY: CGFloat = 1
    @State private var eyeHappyOpacity: Double = 0

    // Joy-only one-shot transients (shared with the body/leaf, so they live
    // here rather than in a structurally-mounted overlay).
    @State private var poseLeafSpin: Double = 0
    @State private var poseBounceOffset: CGFloat = 0

    private let hopHeight: CGFloat = 22
    /// Ambient cadence: durationReveal * 2 = 1.2s, the top of the app's
    /// 0.6-1.2s ambient-loop band. Breathing, the leaf sway, and the blink
    /// schedule all share this one cycle length.
    private let ambientCycle = DesignTokens.Motion.durationReveal * 2
    private let leafSwayPhaseDelay = DesignTokens.Motion.stagger * 2

    var body: some View {
        ZStack {
            if emotion == .focus {
                // .id(reduceMotion): a Reduce Motion flip recreates the
                // overlay so its onAppear re-evaluates — a repeatForever
                // started before the flip would otherwise loop on.
                DemoMascotFocusGlowView()
                    .id(reduceMotion)
            }

            sproutBody

            if emotion == .joy {
                DemoMascotSparkleBurstView()
                    .id(reduceMotion)
            }

            if emotion == .sleepy {
                DemoMascotSleepyZView()
                    .id(reduceMotion)
                    .offset(y: -96)
            }
        }
        .sensoryFeedback(for: .success, trigger: joyEntryCount)
        // Reduce Motion joins the task identity: toggling it mid-mood must
        // cancel a running ambient loop (or start one), which a bare
        // `emotion` id cannot see. Joy feedback still keys off the emotion
        // CHANGE so an RM toggle inside joy does not re-fire it.
        .task(id: DemoMascotTaskKey(emotion: emotion, reduced: reduceMotion)) {
            if emotion == .joy && lastEmotion != .joy { joyEntryCount += 1 }
            lastEmotion = emotion
            await enter(emotion)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sprout, currently \(emotion.label.lowercased())")
    }

    // MARK: Body drawing

    private var sproutBody: some View {
        ZStack(alignment: .top) {
            capsuleBody
            leaf
                .offset(y: -14)
        }
        .rotationEffect(.degrees(poseLean), anchor: .bottom)
        .scaleEffect(ambientBreatheScale)
        .offset(y: poseBounceOffset)
    }

    private var leaf: some View {
        DemoMascotLeafShape()
            .fill(
                LinearGradient(
                    colors: [LabTheme.primary, LabTheme.primary.opacity(0.75)],
                    startPoint: .top, endPoint: .bottom
                )
            )
            .frame(width: 22, height: 30)
            .rotationEffect(.degrees(ambientLeafSway + poseLeafSpin))
            .accessibilityHidden(true)
    }

    private var capsuleBody: some View {
        Capsule()
            .fill(
                LinearGradient(
                    colors: [LabTheme.primary, LabTheme.primary.opacity(0.82)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            .frame(width: 148, height: 176)
            .overlay(alignment: .top) {
                eyesRow.padding(.top, 46)
            }
            .overlay(alignment: .bottom) {
                feet.padding(.bottom, 14)
            }
            .accessibilityHidden(true)
    }

    private var feet: some View {
        HStack(spacing: 28) {
            Capsule().fill(LabTheme.primary.opacity(0.65)).frame(width: 26, height: 14)
            Capsule().fill(LabTheme.primary.opacity(0.65)).frame(width: 26, height: 14)
        }
    }

    private var eyesRow: some View {
        HStack(spacing: 24) {
            eye
            eye
        }
    }

    private var eye: some View {
        ZStack {
            ZStack {
                Circle().fill(.white).frame(width: 34, height: 34)
                Circle().fill(LabTheme.text).frame(width: 14, height: 14)
            }
            .scaleEffect(x: 1, y: eyeScaleY * eyeBlinkScale, anchor: .center)
            .opacity(1 - eyeHappyOpacity)

            DemoMascotHappyEyeShape()
                .stroke(LabTheme.text, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: 26, height: 13)
                .opacity(eyeHappyOpacity)
        }
        .frame(width: 34, height: 34)
    }

    // MARK: Sequencing

    /// Settles the shared pose to the target emotion, then (full-motion only)
    /// runs that state's own choreography. Runs fresh on every `emotion`
    /// change because it lives inside `.task(id: emotion)`.
    @MainActor
    private func enter(_ emotion: DemoMascotEmotion) async {
        withTransaction(Transaction(animation: nil)) {
            ambientBreatheScale = 1
            ambientLeafSway = -4
            eyeBlinkScale = 1
            poseLeafSpin = 0
            poseBounceOffset = 0
        }

        switch emotion {
        case .idle:
            setPose(lean: 0, eyeScaleY: 1, happy: false, curve: reduceMotion ? nil : PremiumMotion.standard)
            guard !reduceMotion else { return }
            await runIdleAmbient()
        case .joy:
            setPose(lean: 0, eyeScaleY: 1, happy: true, curve: reduceMotion ? nil : PremiumMotion.standard)
            guard !reduceMotion else { return }
            await runJoyBounce()
        case .focus:
            setPose(
                lean: -6, eyeScaleY: 0.45, happy: false,
                curve: reduceMotion ? nil : Animation.emphasized(duration: DesignTokens.Motion.durationBase)
            )
        case .sleepy:
            setPose(lean: 4, eyeScaleY: 0.08, happy: false, curve: reduceMotion ? nil : PremiumMotion.standard)
        }
    }

    private func setPose(lean: Double, eyeScaleY: CGFloat, happy: Bool, curve: Animation?) {
        guard let curve else {
            poseLean = lean
            self.eyeScaleY = eyeScaleY
            eyeHappyOpacity = happy ? 1 : 0
            return
        }
        withAnimation(curve) {
            poseLean = lean
            self.eyeScaleY = eyeScaleY
            eyeHappyOpacity = happy ? 1 : 0
        }
    }

    /// Idle: ambient breathing + a phase-offset leaf sway, both looping on
    /// `ambientCycle`, plus a blink every cycle (eyelid scaleY on the fast
    /// token). All three stop the moment `enter(_:)` resets their driving
    /// values for a different state.
    @MainActor
    private func runIdleAmbient() async {
        withAnimation(Animation.easeInOut(duration: ambientCycle).repeatForever(autoreverses: true)) {
            ambientBreatheScale = 1.03
        }
        withAnimation(
            Animation.easeInOut(duration: ambientCycle)
                .repeatForever(autoreverses: true)
                .delay(leafSwayPhaseDelay)
        ) {
            ambientLeafSway = 4
        }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(ambientCycle))
            guard !Task.isCancelled else { break }
            withAnimation(.easeInOut(duration: DesignTokens.Motion.durationFast)) {
                eyeBlinkScale = 0.06
            }
            try? await Task.sleep(for: .seconds(DesignTokens.Motion.durationFast))
            guard !Task.isCancelled else { break }
            withAnimation(.easeInOut(duration: DesignTokens.Motion.durationFast)) {
                eyeBlinkScale = 1
            }
        }
    }

    /// Joy: a two-hop bounce on `poseBounceOffset` (celebrateLanding up, a
    /// reveal-beat hold, celebrateLanding back down) while the leaf spins
    /// once on the emphasized curve. The sparkle burst and success haptic
    /// are attached in `body` above.
    @MainActor
    private func runJoyBounce() async {
        withAnimation(Animation.emphasized(duration: DesignTokens.Motion.durationSlow)) {
            poseLeafSpin = 360
        }
        withAnimation(PremiumMotion.celebrateLanding) {
            poseBounceOffset = -hopHeight
        }
        try? await Task.sleep(for: .seconds(DesignTokens.Motion.durationReveal))
        guard !Task.isCancelled else { return }
        withAnimation(PremiumMotion.celebrateLanding) {
            poseBounceOffset = 0
        }
    }
}

// MARK: - One-shot overlay effects (structurally mounted, self-cleaning)

/// The 8-sparkle Joy burst. Mounted only while `emotion == .joy`, so every
/// appearance is a genuinely fresh single event — never a loop — and leaving
/// Joy simply unmounts it, no manual cancellation needed. Per-clone stagger
/// is capped at durationFast/8, matching the app's other particle-burst
/// recipe. LabTheme.accent is the hero's one sanctioned secondary color, used
/// only here.
private struct DemoMascotSparkleBurstView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var expanded = false
    private let sparkleCount = 8

    var body: some View {
        ZStack {
            ForEach(0..<sparkleCount, id: \.self) { index in
                let angle = (Double.pi * 2 / Double(sparkleCount)) * Double(index)
                DemoMascotSparkleShape()
                    .fill(LabTheme.accent)
                    .frame(width: 9, height: 9)
                    .offset(
                        x: expanded ? CGFloat(cos(angle)) * 92 : 0,
                        y: expanded ? CGFloat(sin(angle)) * 92 : 0
                    )
                    .opacity(expanded ? 0 : 1)
                    .animation(
                        Animation.emphasized(duration: DesignTokens.Motion.durationBase)
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

/// A single primary-tinted glow-ring pulse confirming Focus. Mounted only
/// while `emotion == .focus`; grows and fades exactly once — re-entering
/// Focus later remounts it for a fresh pulse, it never loops on its own.
private struct DemoMascotFocusGlowView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var ringScale: CGFloat = 1
    @State private var ringOpacity: Double = 0

    var body: some View {
        Circle()
            .stroke(LabTheme.primary, lineWidth: 3)
            .frame(width: 190, height: 190)
            .scaleEffect(ringScale)
            .opacity(ringOpacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .task {
                guard !reduceMotion else { return }
                withAnimation(Animation.emphasized(duration: DesignTokens.Motion.durationSlow)) {
                    ringScale = 1.4
                    ringOpacity = 0.35
                }
                try? await Task.sleep(for: .seconds(DesignTokens.Motion.durationSlow))
                guard !Task.isCancelled else { return }
                withAnimation(.easeOut(duration: DesignTokens.Motion.durationBase)) {
                    ringOpacity = 0
                }
            }
    }
}

/// Three "z" glyphs floating up and fading on loop while Sprout naps.
/// Mounted only while `emotion == .sleepy` — the loop is tied to this view's
/// own lifetime, so switching moods away mid-float needs no manual cleanup.
private struct DemoMascotSleepyZView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var floating = false
    /// durationReveal * 2 == durationCinematic; expressed via the reveal
    /// token per the recipe's "paced at durationCinematic via
    /// durationReveal*2" spec.
    private let cycle = DesignTokens.Motion.durationReveal * 2

    var body: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { index in
                Text("z")
                    .font(.display(13, weight: .semibold))
                    .foregroundStyle(LabTheme.primary.opacity(0.75))
                    .offset(
                        x: CGFloat(index) * 9 - 9,
                        y: floating ? -30 - CGFloat(index) * 5 : 0
                    )
                    .opacity(floating ? 0 : 0.9)
                    .animation(
                        Animation.easeOut(duration: cycle)
                            .repeatForever(autoreverses: false)
                            .delay(DesignTokens.Motion.stagger * Double(index + 1)),
                        value: floating
                    )
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear {
            guard !reduceMotion else { return }
            floating = true
        }
    }
}

// MARK: - Shapes (original Bloom-garden geometry, no borrowed assets)

/// A simple sprouting-leaf silhouette: two symmetric curves meeting at a
/// base point and a tip.
private struct DemoMascotLeafShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let h = rect.height
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addCurve(
            to: CGPoint(x: rect.midX, y: rect.minY),
            control1: CGPoint(x: rect.minX - w * 0.15, y: rect.maxY - h * 0.35),
            control2: CGPoint(x: rect.minX - w * 0.1, y: rect.minY + h * 0.1)
        )
        path.addCurve(
            to: CGPoint(x: rect.midX, y: rect.maxY),
            control1: CGPoint(x: rect.maxX + w * 0.1, y: rect.minY + h * 0.1),
            control2: CGPoint(x: rect.maxX + w * 0.15, y: rect.maxY - h * 0.35)
        )
        path.closeSubpath()
        return path
    }
}

/// An upward-arching stroke standing in for a happy, scrunched-closed eye.
private struct DemoMascotHappyEyeShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.maxY),
            control: CGPoint(x: rect.midX, y: rect.minY)
        )
        return path
    }
}

/// A tiny four-point sparkle diamond.
private struct DemoMascotSparkleShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.closeSubpath()
        return path
    }
}
