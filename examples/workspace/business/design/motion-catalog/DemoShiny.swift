// DemoShiny.swift
// Shiny / holographic card demo — mechanics mined from the Cofounder shiny
// card and the Pokemon-card sheen family (catalog eng 1249): a membership
// card tilts in 3D 1:1 with the finger while it's down, and every decorative
// effect on top — the diagonal foil sheen, the emblem's parallax, and the
// specular highlight — reads the exact same tilt vector that drives the
// rotation (R5 shared-scalar rule). Nothing here keeps its own clock except
// the idle ambient shimmer, which is explicitly a separate, non-interactive
// loop that pauses the moment a finger touches down.
//
// Every duration/spring below reads DesignTokens.Motion or PremiumMotion; the
// only hand-typed numbers are tilt-mapping geometry (max degrees, drag-to-
// tilt divisor, parallax/specular reach) — none of those are durations or
// springs.

import SwiftUI

/// Tilt-mapping geometry. Not motion tokens — these describe how far a drag
/// has to travel to reach full tilt, not how long anything animates.
private let demoShinyCardSize = CGSize(width: 320, height: 200)
private let demoShinyMaxTiltDegrees: Double = 12
private let demoShinyMaxDragPoints: CGFloat = 140
private let demoShinyParallaxMax: CGFloat = 6
private let demoShinySpecularRadius: CGFloat = 170

struct DemoShinyView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The one shared tilt vector, normalized to roughly -1...1 per axis.
    /// Rotation, sheen, parallax, and the specular highlight all derive their
    /// position from this single piece of state — nothing reads its own
    /// clock while the finger is down.
    @State private var tilt: CGSize = .zero
    /// The frame-accurate PRESENTED tilt, reported by the tracker below even
    /// while a release spring is mid-settle — a re-grab must resume from the
    /// card's visible pose, not from the already-committed zero target.
    @State private var liveTilt: CGSize = .zero
    @State private var grabBaseTilt: CGSize = .zero
    @State private var isDragging = false

    /// Real-time velocity tracking for the release settle, computed from
    /// actual elapsed wall-clock time between drag callbacks — physics
    /// input, not an animation duration.
    @State private var lastDragTime: Date?
    @State private var lastDragTranslation: CGSize = .zero
    @State private var releaseVelocity: CGSize = .zero

    var body: some View {
        VStack(spacing: LabTheme.spaceLg) {
            VStack(spacing: LabTheme.spaceSm) {
                Text("Founding Gardener Card")
                    .font(.display(28))
                    .foregroundStyle(LabTheme.text)
                    .multilineTextAlignment(.center)
                Text("Drag anywhere on the card to tilt it in 3D — the foil sheen, the leaf's parallax, and the highlight all ride the same finger-driven vector. Let go and it springs back flat.")
                    .font(.body(14))
                    .foregroundStyle(LabTheme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LabTheme.spaceLg)
            }
            .padding(.top, LabTheme.spaceLg)

            Spacer()

            card

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LabTheme.background)
    }

    /// Reduce Motion drops the tilt entirely: the benchmarks' gesture rules
    /// list tilt among the decorative side-effects of a gesture (parallax,
    /// tilt, glow) that Reduce Motion removes — this card's rotation is
    /// presentation, not the manipulated object itself.
    private var effectiveTilt: CGSize { reduceMotion ? .zero : tilt }

    // MARK: - Card

    private var card: some View {
        ZStack {
            cardBase
            cardContent
            holographicSheen
            if !reduceMotion && !isDragging {
                DemoShinyAmbientSheen()
            }
            specularHighlight
        }
        .frame(width: demoShinyCardSize.width, height: demoShinyCardSize.height)
        .clipShape(RoundedRectangle(cornerRadius: LabTheme.radiusLg + 6, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LabTheme.radiusLg + 6, style: .continuous)
                .strokeBorder(.white.opacity(0.18), lineWidth: 1)
        )
        .shadow(color: LabTheme.text.opacity(0.2), radius: 22, y: 12)
        // Two stacked rotations compose into one shared-vector 3D tilt; both
        // read `effectiveTilt`, so Reduce Motion drops the rocking along with
        // the other decorative riders.
        .rotation3DEffect(.degrees(effectiveTilt.height * -demoShinyMaxTiltDegrees), axis: (x: 1, y: 0, z: 0), perspective: 0.45)
        .rotation3DEffect(.degrees(effectiveTilt.width * demoShinyMaxTiltDegrees), axis: (x: 0, y: 1, z: 0), perspective: 0.45)
        .modifier(DemoShinyLiveTiltTracker(tilt: tilt) { liveTilt = $0 })
        .contentShape(RoundedRectangle(cornerRadius: LabTheme.radiusLg + 6, style: .continuous))
        .gesture(dragGesture)
    }

    private var cardBase: some View {
        RoundedRectangle(cornerRadius: LabTheme.radiusLg + 6, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [LabTheme.primary, LabTheme.primary.opacity(0.78)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
    }

    private var cardContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                emblem
                Spacer()
                Text("NO. 0001")
                    .font(.body(11, weight: .semibold))
                    .tracking(1.4)
                    .foregroundStyle(.white.opacity(0.7))
            }
            Spacer()
            VStack(alignment: .leading, spacing: 2) {
                Text("BLOOM")
                    .font(.display(14, weight: .semibold))
                    .tracking(2)
                    .foregroundStyle(.white.opacity(0.8))
                Text("Founding Gardener")
                    .font(.display(24, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .padding(LabTheme.spaceMd)
        .allowsHitTesting(false)
    }

    /// The card's emblem — parallaxed ~6pt opposite the tilt direction, the
    /// same shared vector driving everything else on the card.
    private var emblem: some View {
        Image(systemName: "leaf.fill")
            .font(.system(size: 30, weight: .medium))
            .foregroundStyle(.white)
            .offset(
                x: -effectiveTilt.width * demoShinyParallaxMax,
                y: -effectiveTilt.height * demoShinyParallaxMax
            )
    }

    /// Diagonal foil sheen whose start/end points migrate with the shared
    /// tilt vector — a stronger drag pushes the bright band further toward
    /// that edge, exactly the signal driving rotation/parallax/specular.
    private var holographicSheen: some View {
        let t = effectiveTilt
        return LinearGradient(
            colors: [.white.opacity(0), .white.opacity(0.4), .white.opacity(0)],
            startPoint: UnitPoint(x: 0.15 + t.width * 0.35, y: 0.0 + t.height * 0.3),
            endPoint: UnitPoint(x: 0.85 - t.width * 0.35, y: 1.0 - t.height * 0.3)
        )
        .blendMode(.plusLighter)
        .allowsHitTesting(false)
    }

    /// A directional specular point-light whose position tracks the shared
    /// tilt vector, as if a single overhead light were reflecting off foil.
    private var specularHighlight: some View {
        let t = effectiveTilt
        return RadialGradient(
            colors: [.white.opacity(0.45), .white.opacity(0)],
            center: .center,
            startRadius: 0,
            endRadius: demoShinySpecularRadius
        )
        .frame(width: demoShinySpecularRadius * 2, height: demoShinySpecularRadius * 2)
        .position(
            x: demoShinyCardSize.width * (0.5 + t.width * 0.55),
            y: demoShinyCardSize.height * (0.5 + t.height * 0.55)
        )
        .blendMode(.plusLighter)
        .allowsHitTesting(false)
    }

    // MARK: - Gesture

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if !isDragging {
                    isDragging = true
                    Haptics.Event.impactLight.play()
                    // Resume from the visible pose: pin the state to the
                    // presented value so the settle-in-flight never snaps flat.
                    grabBaseTilt = liveTilt
                    var t = Transaction()
                    t.disablesAnimations = true
                    withTransaction(t) { tilt = liveTilt }
                }

                let now = Date()
                if let previousTime = lastDragTime {
                    let dt = now.timeIntervalSince(previousTime)
                    if dt > 0.0001 {
                        releaseVelocity = CGSize(
                            width: (value.translation.width - lastDragTranslation.width) / CGFloat(dt),
                            height: (value.translation.height - lastDragTranslation.height) / CGFloat(dt)
                        )
                    }
                }
                lastDragTime = now
                lastDragTranslation = value.translation

                // Two-clocks rule: this write happens outside any
                // `withAnimation`, so rotation/sheen/parallax/specular all
                // track the finger with zero easing while it's down.
                let rawWidth = grabBaseTilt.width * demoShinyMaxDragPoints + value.translation.width
                let rawHeight = grabBaseTilt.height * demoShinyMaxDragPoints + value.translation.height
                let clampedWidth = min(max(rawWidth, -demoShinyMaxDragPoints), demoShinyMaxDragPoints)
                let clampedHeight = min(max(rawHeight, -demoShinyMaxDragPoints), demoShinyMaxDragPoints)
                tilt = CGSize(
                    width: clampedWidth / demoShinyMaxDragPoints,
                    height: clampedHeight / demoShinyMaxDragPoints
                )
            }
            .onEnded { value in
                isDragging = false
                // The gesture's own final velocity is authoritative — the
                // sampled estimate can hold a stale fast reading when the
                // finger pauses before lifting (no onChanged fires while
                // stationary).
                let velocityAtRelease = value.velocity
                lastDragTime = nil
                lastDragTranslation = .zero
                releaseVelocity = .zero

                // Decorative settle-back bounce collapses to an instant snap
                // under Reduce Motion (direct manipulation already happened
                // above; this is the choreographed part).
                withAnimation(reduceMotion ? nil : demoShinyReleaseAnimation(for: velocityAtRelease)) {
                    tilt = .zero
                }
            }
    }

    /// Settles the shared tilt vector back to flat, carrying the drag's real
    /// release velocity into the spring — PremiumMotion.standard's own shape
    /// (durationBase, bounce 0.12) extended with `initialVelocity` so a fast
    /// flick keeps drifting briefly before it settles, rather than snapping
    /// dead. A tap with no velocity reduces to that same standard shape.
    private func demoShinyReleaseAnimation(for velocity: CGSize) -> Animation {
        // Signed projection: the settle's travel runs from the current tilt
        // back to flat, so velocity toward flat seeds the spring positive and
        // a flick away from flat seeds it negative (the card keeps drifting
        // outward briefly before returning) — magnitude alone loses that.
        let travelPoints = CGSize(width: -tilt.width * demoShinyMaxDragPoints, height: -tilt.height * demoShinyMaxDragPoints)
        let travelLength = (travelPoints.width * travelPoints.width + travelPoints.height * travelPoints.height).squareRoot()
        guard travelLength > 0.5 else {
            return .interpolatingSpring(duration: DesignTokens.Motion.durationBase, bounce: 0.12, initialVelocity: 0)
        }
        let towardFlat = (velocity.width * travelPoints.width + velocity.height * travelPoints.height) / travelLength
        let normalized = Double(towardFlat / travelLength)
        let seededVelocity = min(max(normalized, -6), 6)
        return .interpolatingSpring(
            duration: DesignTokens.Motion.durationBase,
            bounce: 0.12,
            initialVelocity: seededVelocity
        )
    }
}

/// The idle discovery hint: a slow linear shimmer sweep, independent of the
/// tilt vector above, that invites a first touch. Paced at durationReveal * 2
/// per the ambient-loop band. Mounted only while `!isDragging && !reduceMotion`
/// by the parent, so a touch removes it (pausing the loop) and a release
/// remounts it fresh.
private struct DemoShinyAmbientSheen: View {
    @State private var phase: CGFloat = -1.3

    var body: some View {
        GeometryReader { geo in
            LinearGradient(
                colors: [.clear, .white.opacity(0.3), .clear],
                startPoint: .top, endPoint: .bottom
            )
            .rotationEffect(.degrees(18))
            .frame(width: geo.size.width * 0.5)
            .offset(x: geo.size.width * phase)
            .blendMode(.plusLighter)
        }
        .allowsHitTesting(false)
        .onAppear {
            phase = -1.3
            withAnimation(
                .linear(duration: DesignTokens.Motion.durationReveal * 2)
                    .repeatForever(autoreverses: false)
            ) {
                phase = 1.3
            }
        }
    }
}


/// Animatable passthrough reporting the currently PRESENTED tilt every frame,
/// so a mid-settle grab resumes from the visible pose (same pattern as
/// DemoGesture's live offset tracker).
private struct DemoShinyLiveTiltTracker: Animatable, ViewModifier {
    var animatableData: AnimatablePair<CGFloat, CGFloat>
    let onChange: (CGSize) -> Void

    init(tilt: CGSize, onChange: @escaping (CGSize) -> Void) {
        animatableData = AnimatablePair(tilt.width, tilt.height)
        self.onChange = onChange
    }

    func body(content: Content) -> some View {
        let current = CGSize(width: animatableData.first, height: animatableData.second)
        DispatchQueue.main.async { onChange(current) }
        return content
    }
}
