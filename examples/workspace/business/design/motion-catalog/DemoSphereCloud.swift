// DemoSphereCloud.swift — motion-catalog exemplar pack
//
// Full-screen content-cloud onboarding (mechanics frame-read from the
// 60fps.design catalog, content original). The PROCEDURAL choreography mode:
// when dozens of elements share one 3D scene, a TimelineView + Canvas scene
// is the right tool — and every curve still rides the token scale via
// TokenSpring, the closed-form evaluation of the shipped PremiumMotion
// presets (identical physics to withAnimation).
//
//   1. dusk-gradient stage, center glass pill, static bottom chrome
//   2. cards burst from the pill into a 3D ellipsoid cloud
//      (per-card TokenSpring.celebrate, ≤15ms stagger per R2)
//   3. one orbit clock rotates the whole cloud — nothing desyncs (R5 rule)
//   4. the camera dives through the cloud (emphasized ease); cards fly past
//      with scale-proportional blur (R7: blur only while fast)
//   5. one hero card stays: TokenSpring.celebrateLanding, sharp at rest (R3)
//
// R8 note: the cloud's mixed-color cards are user CONTENT (saved items), not
// chrome — the content-vs-chrome scope note in motion-craft-benchmarks.md R8
// covers this composition. Chrome (title, copy, CTA) stays still throughout.
//
// Asset placeholders (regenerate per business, then add to the asset
// catalog): "cloud-item-1" … "cloud-item-7" (content thumbnails),
// "hero-emblem" (the collected object), "card-foil" (hero card texture).
// Reduce Motion: pill cross-fades to the landed hero. Replay is first-class.

import SwiftUI

struct DemoSphereCloudView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var startDate = Date()
    /// One-shot landing latch: the underdamped spring crosses 1.0 on every
    /// positive oscillation, so the success trigger fires only on the FIRST
    /// crossing per run and Replay re-arms it without firing.
    @State private var heroDidLand = false
    @State private var heroLandCount = 0

    private static let cardCount = 30
    private static let sphereRadius: CGFloat = 150
    private static let perspective: CGFloat = 480

    private struct CardSpec {
        let dir: SIMD3<Double>
        let size: CGFloat
        let imageName: String? // nil → color chip
        let chip: Color
        let wobblePhase: Double
        let delay: Double
    }

    private static let images = [
        "cloud-item-1", "cloud-item-2", "cloud-item-3", "cloud-item-4",
        "cloud-item-5", "cloud-item-6", "cloud-item-7",
    ]

    private static let cards: [CardSpec] = {
        let golden = Double.pi * (3 - 5.0.squareRoot())
        var rng = SeededRandom(seed: 0xB100)
        return (0..<cardCount).map { i in
            let y = 1 - (Double(i) / Double(cardCount - 1)) * 2
            let rad = (1 - y * y).squareRoot()
            let theta = golden * Double(i)
            let chips: [Color] = [LabTheme.primary, LabTheme.accent, Color(hex: "#c9a227"), LabTheme.surface]
            return CardSpec(
                dir: SIMD3(cos(theta) * rad, y * 0.8, sin(theta) * rad),
                size: 34 + CGFloat(rng.next() * 26),
                imageName: rng.next() < 0.55 ? images[i % images.count] : nil,
                chip: chips[i % chips.count],
                wobblePhase: rng.next() * .pi * 2,
                delay: burstLead + Double(i) * cardStagger
            )
        }
    }()

    // Beat anchors (seconds) — every interval is a token expression.
    private static let burstLead = DesignTokens.Motion.durationCelebrate / 2 // 250ms
    private static let cardStagger = DesignTokens.Motion.stagger / 5 // 12ms — ≤15ms per R2's burst rule
    private static let diveStart = DesignTokens.Motion.durationCinematic * 2 + DesignTokens.Motion.durationFast // ~2.5s of burst + orbit
    private static let diveDuration = DesignTokens.Motion.durationReveal * 1.5 // 900ms camera travel
    private static let heroStart = diveStart + DesignTokens.Motion.durationCelebrate / 2

    var body: some View {
        ZStack {
            stage

            if reduceMotion {
                reducedContent
            } else {
                TimelineView(.animation) { timeline in
                    let t = timeline.date.timeIntervalSince(startDate)
                    // Explicit ZStack: a bare ViewBuilder tuple here does NOT
                    // guarantee overlay layout — without it the hero drifted
                    // into the bottom chrome.
                    ZStack {
                        cloudCanvas(t: t)
                        heroCard(t: t)
                        pill(opacity: pillOpacity(t: t))
                    }
                }
            }

            chrome
        }
        .background(LabTheme.background.ignoresSafeArea())
        .navigationTitle("Sphere cloud")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Replay") {
                    startDate = Date()
                    heroDidLand = false // re-arm; feedback fires at the landing
                }
                .buttonStyle(.premiumPress)
            }
        }
        .sensoryFeedback(for: .success, trigger: heroLandCount)
    }

    // MARK: scene pieces

    private var stage: some View {
        // Dusk ramp built from the brand palette: deep pine → brand green →
        // sage → sand → the accent's warm end. Swap stops for the brand's own.
        LinearGradient(
            stops: [
                .init(color: Color(hex: "#08211a"), location: 0),
                .init(color: Color(hex: "#14584a"), location: 0.3),
                .init(color: Color(hex: "#7fae8f"), location: 0.56),
                .init(color: Color(hex: "#f0dfc0"), location: 0.78),
                .init(color: Color(hex: "#ff8a68"), location: 0.94),
                .init(color: LabTheme.accent, location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    private func cloudCanvas(t: Double) -> some View {
        Canvas { context, size in
            let cx = size.width / 2
            let cy = size.height * 0.4
            let orbit = t * 0.38 // rad/s — the ONE cloud clock
            let dive = TokenEase.emphasis(max(0, t - Self.diveStart) / Self.diveDuration)
            let cameraZ = dive * (Self.perspective + 260)

            struct Projected {
                let spec: CardSpec
                let x: CGFloat
                let y: CGFloat
                let scale: CGFloat
                let z: CGFloat
                let opacity: Double
                let blur: Double
            }

            var projected: [Projected] = []
            for spec in Self.cards {
                let burst = TokenSpring.celebrate.progress(at: t - spec.delay)
                if burst < 0.02 { continue } // invisible until its spring starts
                let r = Double(Self.sphereRadius) * burst
                let x0 = spec.dir.x * r
                let z0 = spec.dir.z * r
                let x = x0 * cos(orbit) - z0 * sin(orbit)
                let zOrbit = x0 * sin(orbit) + z0 * cos(orbit)
                let y = spec.dir.y * r + sin(t * 1.1 + spec.wobblePhase) * 3
                let z = CGFloat(zOrbit) + cameraZ
                if z > Self.perspective * 0.94 { continue } // passed the camera
                let s = Self.perspective / (Self.perspective - z)
                let opacity = depthFade(z: z)
                let blur = dive > 0 ? min(6, max(0, (s - 1.7) * 3)) : 0
                projected.append(Projected(
                    spec: spec,
                    x: cx + CGFloat(x) * s,
                    y: cy + CGFloat(y) * s,
                    scale: s,
                    z: z,
                    opacity: opacity * min(1, burst * 4),
                    blur: blur
                ))
            }

            for p in projected.sorted(by: { $0.z < $1.z }) {
                let side = p.spec.size * p.scale
                let rect = CGRect(x: p.x - side / 2, y: p.y - side / 2, width: side, height: side)
                var layer = context
                layer.opacity = p.opacity
                if p.blur > 0.3 { layer.addFilter(.blur(radius: p.blur)) }
                let shape = Path(roundedRect: rect, cornerRadius: 6 * p.scale)
                if let name = p.spec.imageName {
                    layer.clip(to: shape)
                    layer.draw(Image(name), in: rect)
                } else {
                    layer.fill(shape, with: .color(p.spec.chip))
                    let line = CGRect(
                        x: rect.minX + side * 0.18,
                        y: rect.minY + side * 0.3,
                        width: side * 0.5,
                        height: max(2, side * 0.07)
                    )
                    layer.fill(
                        Path(roundedRect: line, cornerRadius: 2),
                        with: .color(Color(hex: "#161512").opacity(0.3))
                    )
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func depthFade(z: CGFloat) -> Double {
        let r = Self.sphereRadius
        if z < -r { return 0.4 }
        let mid = Self.perspective * 0.55
        let far = Self.perspective * 0.94
        if z <= mid {
            return 0.4 + 0.6 * Double((z + r) / (mid + r))
        }
        return max(0, Double(1 - (z - mid) / (far - mid)))
    }

    private func heroCard(t: Double) -> some View {
        let p = TokenSpring.celebrateLanding.progress(at: t - Self.heroStart)
        let velocity = TokenSpring.celebrateLanding.velocity(at: t - Self.heroStart)
        let scale = 0.26 + 0.74 * p
        let visible = t > Self.diveStart
        return heroFace
            .scaleEffect(max(0.01, scale))
            .rotationEffect(.degrees((1 - p) * -6 + p * sin(t * 1.1) * 1.2))
            .blur(radius: min(6, abs(velocity) * 1.4)) // velocity-scaled, 0 at rest (R7)
            .opacity(visible ? min(1, p * 3) : 0)
            .offset(y: -130)
            .onChange(of: p > 1.0) { _, crossed in
                if crossed && !heroDidLand {
                    heroDidLand = true
                    heroLandCount += 1
                }
            }
    }

    private var heroFace: some View {
        VStack(spacing: 10) {
            Image("hero-emblem")
                .resizable()
                .scaledToFit()
                .frame(height: 150)
            Text("Day 21 · collected")
                .font(.display(17, weight: .semibold))
                .foregroundStyle(.white.opacity(0.95))
        }
        .padding(28)
        .background {
            RoundedRectangle(cornerRadius: LabTheme.radiusLg + 2, style: .continuous)
                .fill(Color(hex: "#0e3d2d"))
                .overlay {
                    Image("card-foil")
                        .resizable()
                        .scaledToFill()
                        .opacity(0.2)
                        .clipShape(RoundedRectangle(cornerRadius: LabTheme.radiusLg + 2, style: .continuous))
                }
                .overlay {
                    RoundedRectangle(cornerRadius: LabTheme.radiusLg + 2, style: .continuous)
                        .strokeBorder(.white.opacity(0.3), lineWidth: 1)
                }
                .shadow(color: Color(hex: "#081410").opacity(0.45), radius: 30, y: 18)
        }
    }

    private func pill(opacity: Double) -> some View {
        Text("Everything you saved")
            .font(.body(15))
            .foregroundStyle(.white.opacity(0.85))
            .padding(.horizontal, 28)
            .padding(.vertical, 14)
            .background {
                Capsule()
                    .fill(Color(hex: "#0a1a15").opacity(0.55))
                    .overlay(Capsule().strokeBorder(.white.opacity(0.25), lineWidth: 1))
            }
            .offset(y: -110)
            .opacity(opacity)
    }

    private func pillOpacity(t: Double) -> Double {
        let dive = TokenEase.emphasis(max(0, t - Self.diveStart) / Self.diveDuration)
        return max(0, 1 - dive * 2.5)
    }

    private var reducedContent: some View {
        // Reduce Motion: no TimelineView at all — the landed end state only.
        ZStack {
            heroFace.offset(y: -130)
        }
        .transition(.opacity)
    }

    private var chrome: some View {
        VStack(spacing: LabTheme.spaceSm) {
            Spacer()
            Text("Every moment, self-organised")
                .font(.display(22, weight: .semibold))
                .foregroundStyle(.white.opacity(0.96))
            Text("Check-ins are tagged and arranged into collections automatically.")
                .font(.body(13))
                .foregroundStyle(.white.opacity(0.72))
                .multilineTextAlignment(.center)
                .padding(.horizontal, LabTheme.spaceXl)
            Button {
                Haptics.Event.impactLight.play()
            } label: {
                Text("Continue")
                    .font(.body(16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(Capsule().fill(LabTheme.primary))
            }
            .buttonStyle(.premiumPress)
            .padding(.horizontal, LabTheme.spaceLg)
            .padding(.top, LabTheme.spaceSm)
        }
        .padding(.bottom, LabTheme.spaceLg)
    }
}

/// Tiny deterministic PRNG so the cloud layout is stable run-to-run — the
/// native mirror of the web lane's seeded `random()` discipline.
private struct SeededRandom {
    private var state: UInt64
    init(seed: UInt64) { state = seed &* 0x9E3779B97F4A7C15 }
    mutating func next() -> Double {
        state ^= state << 13
        state ^= state >> 7
        state ^= state << 17
        return Double(state % 100_000) / 100_000
    }
}
