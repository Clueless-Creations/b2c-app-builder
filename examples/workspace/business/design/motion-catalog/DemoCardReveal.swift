// DemoCardReveal.swift — motion-catalog exemplar pack
//
// Full-screen earned-object unboxing (catalog family: card reveals; mechanics
// frame-read from the 60fps.design catalog, content original). The DECLARATIVE
// choreography mode: a six-beat async runner where every beat is a
// `withAnimation(PremiumMotion.*)` on the token scale — reach for this mode
// when the scene has one focal object and a fixed beat order.
//
//   1. word-cascade headline (150–200ms steps, R4's cascade band)
//   2. package materializes (gray→ink + scale settle, standard spring)
//   3. yaw flip through the edge-on sliver (emphasized tween, no overshoot)
//   4. four flaps unfold origami-style (celebrate spring, 2× stagger apart)
//   5. inner card hero moment (celebrateLanding + sheen sweep + success haptic)
//   6. copy + CTA reflow — only after the hero settles (R8/R10 discipline)
//
// Asset placeholders (regenerate per business, e.g. via the Higgsfield routing
// in design-visual-system.md, then add to the app's asset catalog):
//   "card-foil" — subtle foil/texture for the inner card face
//   "card-emblem" — the earned object, background removed
// Reduce Motion: the runner collapses to a single cross-fade to the settled
// state. Replay is a first-class control so reviewers can loop the moment.

import SwiftUI

struct DemoCardRevealView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var wordsShown = 0
    @State private var packageIn = false
    @State private var flipProgress: Double = 0 // 0 closed-front, 1 lying open-side-up
    @State private var flapOpen = [false, false, false, false]
    @State private var heroLanded = false
    @State private var sheenPhase: CGFloat = -0.6
    @State private var reflowIn = false
    /// Reduce Motion only: the one animated value — the settled scene fades in.
    @State private var settledFade = false
    @State private var runToken = 0

    private let words = ["Your streak,", "minted", "in a", "card."]

    // Beat pacing — every interval is a token expression, never a bare number.
    private let cascadeStep = (DesignTokens.Motion.durationFast + DesignTokens.Motion.durationBase) / 2 // 170ms, inside R4's 150–200ms band
    private let leadIn = DesignTokens.Motion.durationSlow - DesignTokens.Motion.stagger // 300ms
    private let beatHold = DesignTokens.Motion.durationCelebrate // 500ms rest between beats
    private let longHold = DesignTokens.Motion.durationReveal + DesignTokens.Motion.durationBase // 820ms before/after the flip

    var body: some View {
        VStack(spacing: 0) {
            headline
                .padding(.top, LabTheme.spaceXl)
                .padding(.horizontal, LabTheme.spaceXl)

            Spacer()

            package
                .frame(height: 360)

            Spacer()

            reflowFooter
                .padding(.bottom, LabTheme.spaceXl)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .opacity(reduceMotion && !settledFade ? 0 : 1)
        .background(LabTheme.background.ignoresSafeArea())
        .navigationTitle("Card reveal")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Replay") { runToken += 1 }
                    .buttonStyle(.premiumPress)
            }
        }
        .sensoryFeedback(for: .success, trigger: heroLanded)
        .task(id: runToken) { await run() }
    }

    // MARK: beats

    private func run() async {
        resetStates()

        if reduceMotion {
            // Reduce Motion = a cross-fade to the settled state, nothing
            // spatial: every choreography value jumps instantly inside a
            // no-animation transaction, and only the whole-scene opacity
            // animates.
            var t = Transaction()
            t.disablesAnimations = true
            withTransaction(t) {
                wordsShown = words.count
                packageIn = true
                flipProgress = 1
                flapOpen = [true, true, true, true]
                heroLanded = true
                reflowIn = true
            }
            withAnimation(.easeInOut(duration: DesignTokens.Motion.durationSlow)) {
                settledFade = true
            }
            return
        }

        // Cancellation contract: Replay bumps `runToken`, SwiftUI cancels
        // this task, and the FIRST cancelled sleep exits the runner — a
        // cancelled runner must never keep mutating the stage the new
        // runner just reset.
        do {
            try await sleep(leadIn)
            for i in 1...words.count {
                withAnimation(PremiumMotion.standard) { wordsShown = i }
                try await sleep(cascadeStep)
            }

            try await sleep(beatHold)
            withAnimation(PremiumMotion.standard) { packageIn = true }

            try await sleep(longHold)
            withAnimation(.emphasized(duration: DesignTokens.Motion.durationReveal)) {
                flipProgress = 1
            }

            try await sleep(longHold)
            for i in 0..<4 {
                withAnimation(PremiumMotion.celebrate) { flapOpen[i] = true }
                try await sleep(DesignTokens.Motion.stagger * 2)
            }

            try await sleep(beatHold)
            withAnimation(PremiumMotion.celebrateLanding) { heroLanded = true }
            withAnimation(.emphasized(duration: DesignTokens.Motion.durationReveal)) {
                sheenPhase = 1.6
            }

            try await sleep(DesignTokens.Motion.durationCelebrate + cascadeStep)
            withAnimation(.emphasized(duration: cascadeStep)) { reflowIn = true }
        } catch {
            return // cancelled — the replacement runner owns the stage now
        }
    }

    private func resetStates() {
        var t = Transaction()
        t.disablesAnimations = true
        withTransaction(t) {
            wordsShown = 0
            packageIn = false
            flipProgress = 0
            flapOpen = [false, false, false, false]
            heroLanded = false
            sheenPhase = -0.6
            reflowIn = false
            settledFade = false
        }
    }

    private func sleep(_ seconds: Double) async throws {
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    // MARK: pieces

    private var headline: some View {
        HStack(spacing: 8) {
            ForEach(words.indices, id: \.self) { i in
                Text(words[i])
                    .font(.body(26, weight: .semibold))
                    .foregroundStyle(LabTheme.text)
                    .opacity(i < wordsShown ? 1 : 0)
                    .blur(radius: i < wordsShown ? 0 : 6)
                    .offset(y: i < wordsShown ? 0 : 8)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var package: some View {
        // Cross layout: base + inner card in the middle, four flaps hinged on
        // the base edges. Closed = flaps folded flat over the base; open =
        // swung just past flat, with the celebrate spring's overshoot doing
        // the paper flex. The whole package flips via two rotation effects.
        let baseW: CGFloat = 250
        let baseH: CGFloat = 160

        return ZStack {
            innerCard(width: baseW - 76, height: baseH - 52)

            flap(edge: .leading, size: CGSize(width: baseW / 2, height: baseH), open: flapOpen[0])
                .offset(x: -baseW / 4)
            flap(edge: .trailing, size: CGSize(width: baseW / 2, height: baseH), open: flapOpen[1])
                .offset(x: baseW / 4)
            flap(edge: .top, size: CGSize(width: baseW, height: baseH / 2), open: flapOpen[2])
                .offset(y: -baseH / 4)
            flap(edge: .bottom, size: CGSize(width: baseW, height: baseH / 2), open: flapOpen[3])
                .offset(y: baseH / 4)

            // printed outer face — covers the closed stack, hands off to the
            // flaps the moment the first one opens
            RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
                .fill(Color(hex: "#171d1a"))
                .overlay {
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(.white.opacity(0.28))
                }
                .frame(width: baseW, height: baseH)
                .opacity(flapOpen[0] ? 0 : 1)
        }
        .frame(width: baseW, height: baseH)
        .background(
            RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
                .fill(Color(hex: "#141a17"))
        )
        .rotation3DEffect(.degrees(flipProgress * 180), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
        .rotation3DEffect(.degrees(flipProgress * 48), axis: (x: 1, y: 0, z: 0), perspective: 0.4)
        .scaleEffect((packageIn ? 1 : 0.94) * (1 + 0.08 * flipProgress))
        .saturation(packageIn ? 1 : 0)
        .opacity(packageIn ? 1 : 0)
    }

    private func innerCard(width: CGFloat, height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
            .fill(Color(hex: "#0e3d2d"))
            .overlay {
                Image("card-foil")
                    .resizable()
                    .scaledToFill()
                    .opacity(0.24)
            }
            .overlay {
                VStack(spacing: 4) {
                    Image("card-emblem")
                        .resizable()
                        .scaledToFit()
                        .frame(height: height * 0.52)
                    Text("FOUNDER · Nº 001")
                        .font(.display(9, weight: .semibold))
                        .kerning(2.5)
                        .foregroundStyle(.white.opacity(0.9))
                }
            }
            .overlay {
                // sheen sweep — one pass, riding the hero beat
                GeometryReader { geo in
                    LinearGradient(
                        colors: [.clear, .white.opacity(0.35), .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: geo.size.width * 0.5)
                    .offset(x: geo.size.width * sheenPhase)
                    .blendMode(.plusLighter)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
                    .strokeBorder(.white.opacity(0.22), lineWidth: 1)
            }
            .frame(width: width, height: height)
            .scaleEffect(heroLanded ? 1.12 : 1)
            // The mirror trick: the package container ends at rotationY 180°,
            // so the card pre-mirrors itself to read correctly after the flip.
            .scaleEffect(x: -1)
    }

    private enum FlapEdge { case leading, trailing, top, bottom }

    private func flap(edge: FlapEdge, size: CGSize, open: Bool) -> some View {
        // 0° = folded flat over the base (closed, covering); 194° = swung
        // outward just past flat — the celebrate spring overshoots past 194°
        // for the paper flex, exactly like the box's real-world physics.
        let angle: Double = open ? 194 : 0
        let axis: (CGFloat, CGFloat, CGFloat)
        let anchor: UnitPoint
        switch edge {
        case .leading: axis = (0, 1, 0); anchor = .leading
        case .trailing: axis = (0, -1, 0); anchor = .trailing
        case .top: axis = (-1, 0, 0); anchor = .top
        case .bottom: axis = (1, 0, 0); anchor = .bottom
        }
        return RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
            .fill(Color(hex: open ? "#1c2420" : "#101511"))
            .frame(width: size.width, height: size.height)
            .rotation3DEffect(
                .degrees(angle),
                axis: (x: axis.0, y: axis.1, z: axis.2),
                anchor: anchor,
                perspective: 0.5
            )
    }

    private var reflowFooter: some View {
        VStack(spacing: LabTheme.spaceSm + 4) {
            Text("Founding member card · limited run")
                .font(.body(13))
                .foregroundStyle(LabTheme.muted)
            Button {
                Haptics.Event.impactLight.play()
            } label: {
                Text("Claim yours")
                    .font(.body(16, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, LabTheme.spaceXl)
                    .padding(.vertical, 14)
                    .background(Capsule().fill(LabTheme.primary))
            }
            .buttonStyle(.premiumPress)
        }
        .opacity(reflowIn ? 1 : 0)
        .offset(y: reflowIn ? 0 : 16)
    }
}
