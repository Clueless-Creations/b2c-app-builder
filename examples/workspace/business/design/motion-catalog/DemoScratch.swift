// DemoScratch.swift
// Recipe R10 — scratch-card reward reveal (motion-craft-benchmarks.md).
//
// A foil card sits over a reward that is fully rendered on its own layer
// underneath from the first frame — legibility never depends on the erase
// math. Dragging a finger stamps jittered, torn-edge blobs into a low-res
// coverage grid (direct manipulation, no clock). Once roughly half the foil
// is cleared the whole sheet cross-fades away on the shared duration token,
// a success haptic confirms the win, and — after a beat — the card nudges up
// while a primary "Claim it" CTA fades in, one coordinated withAnimation.
// A visible "Reveal without scratching" button gives the same payoff to
// anyone who can't perform the drag gesture.

import SwiftUI

// MARK: - Tunables (file-scoped, not ad-hoc motion — these are geometry/
// thresholds, not durations; every duration below still reads DesignTokens).

private let demoScratchCardWidth: CGFloat = 320
private let demoScratchCardHeight: CGFloat = 180
private let demoScratchGridColumns = 22
private let demoScratchGridRows = 13
private let demoScratchBrushRadius: CGFloat = 24
private let demoScratchBlobPoints = 10
private let demoScratchRevealThreshold: CGFloat = 0.55
private let demoScratchStampSpacing: CGFloat = 10

// MARK: - Reward

/// The prize beneath the foil. Chosen at random per appearance so the payoff
/// is genuinely variable, the way a real scratch-card reward would be.
private enum DemoScratchReward: CaseIterable {
    case bonusDays
    case streakShield
    case goldenLeaf

    var label: String {
        switch self {
        case .bonusDays: return "3 bonus days"
        case .streakShield: return "Streak shield"
        case .goldenLeaf: return "Golden leaf"
        }
    }

    var symbol: String {
        switch self {
        case .bonusDays: return "calendar.badge.plus"
        case .streakShield: return "shield.checkerboard"
        case .goldenLeaf: return "leaf.fill"
        }
    }

    static func random() -> DemoScratchReward {
        allCases.randomElement() ?? .bonusDays
    }
}

/// The earned object. LabTheme.primary is the composition's one saturated hue —
/// concentrated on the reward glyph and label — while the card shell around
/// it stays neutral (LabTheme.surface). Rendered in full from the first frame,
/// directly beneath the foil layer, so the mask never has to "finish" for the
/// text to be correct.
private struct DemoScratchRewardContent: View {
    let reward: DemoScratchReward
    /// The prize must not leak through the screen reader before the foil is
    /// scratched — hidden from accessibility until the reveal commits.
    let revealed: Bool

    var body: some View {
        VStack(spacing: LabTheme.spaceSm) {
            Image(systemName: reward.symbol)
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(LabTheme.primary)
            Text("You won")
                .font(.body(13, weight: .medium))
                .foregroundStyle(LabTheme.muted)
            Text(reward.label)
                .font(.display(24))
                .foregroundStyle(LabTheme.primary)
                .multilineTextAlignment(.center)
        }
        .frame(width: demoScratchCardWidth, height: demoScratchCardHeight)
        .background(
            RoundedRectangle(cornerRadius: LabTheme.radiusLg, style: .continuous)
                .fill(LabTheme.surface)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Reward revealed: \(reward.label)")
        .accessibilityHidden(!revealed)
    }
}

// MARK: - Foil mask geometry

/// One scratch stamp: a center point plus a ring of noise-perturbed radii so
/// the rendered blob reads as torn foil rather than a clean circle.
private struct DemoScratchStamp {
    let center: CGPoint
    let jaggedOffsets: [CGFloat]
    let rotation: Double
}

/// Builds a lumpy, closed blob path through jittered points around `stamp`'s
/// center, connected with quadratic curves through their midpoints so the
/// silhouette is smooth-but-irregular instead of polygonal.
private func demoScratchBlobPath(for stamp: DemoScratchStamp) -> Path {
    let count = stamp.jaggedOffsets.count
    var points: [CGPoint] = []
    points.reserveCapacity(count)
    for i in 0..<count {
        let angle = (Double(i) / Double(count)) * (2 * .pi) + stamp.rotation
        let radius = demoScratchBrushRadius + stamp.jaggedOffsets[i]
        points.append(
            CGPoint(
                x: stamp.center.x + CGFloat(cos(angle)) * radius,
                y: stamp.center.y + CGFloat(sin(angle)) * radius
            )
        )
    }

    var path = Path()
    guard let first = points.first else { return path }
    func midpoint(_ a: CGPoint, _ b: CGPoint) -> CGPoint {
        CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
    }
    path.move(to: midpoint(points[count - 1], first))
    for i in 0..<count {
        let current = points[i]
        let next = points[(i + 1) % count]
        path.addQuadCurve(to: midpoint(current, next), control: current)
    }
    path.closeSubpath()
    return path
}

/// Foil shell: LabTheme.border-toned gradient plus a soft diagonal sheen, with
/// every stamped blob punched out via `.destinationOut` inside an isolated
/// layer so the blend mode never leaks onto the base fill.
private struct DemoScratchFoilCanvas: View {
    let stamps: [DemoScratchStamp]

    var body: some View {
        Canvas { context, size in
            let rect = CGRect(origin: .zero, size: size)
            context.clip(to: Path(roundedRect: rect, cornerRadius: LabTheme.radiusLg))

            context.drawLayer { layer in
                layer.fill(
                    Path(rect),
                    with: .linearGradient(
                        Gradient(colors: [LabTheme.border, LabTheme.border.opacity(0.72), LabTheme.muted.opacity(0.55)]),
                        startPoint: CGPoint(x: rect.minX, y: rect.minY),
                        endPoint: CGPoint(x: rect.maxX, y: rect.maxY)
                    )
                )
                // Subtle diagonal sheen sweep.
                layer.fill(
                    Path(rect),
                    with: .linearGradient(
                        Gradient(stops: [
                            .init(color: .white.opacity(0), location: 0.0),
                            .init(color: .white.opacity(0.3), location: 0.45),
                            .init(color: .white.opacity(0), location: 0.75),
                        ]),
                        startPoint: CGPoint(x: rect.minX, y: rect.maxY),
                        endPoint: CGPoint(x: rect.maxX, y: rect.minY)
                    )
                )

                layer.blendMode = .destinationOut
                for stamp in stamps {
                    layer.fill(demoScratchBlobPath(for: stamp), with: .color(.black))
                }
            }
        }
        .frame(width: demoScratchCardWidth, height: demoScratchCardHeight)
        .overlay(
            RoundedRectangle(cornerRadius: LabTheme.radiusLg, style: .continuous)
                .strokeBorder(LabTheme.border, lineWidth: 1)
        )
    }
}

// MARK: - Demo screen

struct DemoScratchView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var reward = DemoScratchReward.random()
    @State private var stamps: [DemoScratchStamp] = []
    @State private var scratchedGrid = Array(
        repeating: false,
        count: demoScratchGridColumns * demoScratchGridRows
    )
    @State private var scratchedFraction: CGFloat = 0
    @State private var revealed = false
    @State private var reflowed = false
    @State private var lastDragPoint: CGPoint?

    var body: some View {
        VStack(spacing: LabTheme.spaceLg) {
            VStack(spacing: LabTheme.spaceSm) {
                Text("Scratch card reveal")
                    .font(.display(28))
                    .foregroundStyle(LabTheme.text)
                Text("Drag a finger across the foil \u{2014} clear about half the card and the reward tears itself free.")
                    .font(.body(14))
                    .foregroundStyle(LabTheme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LabTheme.spaceLg)
            }
            .padding(.top, LabTheme.spaceXl)

            Spacer()

            cardStack
                .offset(y: (reflowed && !reduceMotion) ? -16 : 0)

            Spacer()

            VStack(spacing: LabTheme.spaceMd) {
                PrimaryCTA(title: "Claim it") {
                    // analytics: track "demo_scratch_claimed", ["reward": reward.label] per the analytics/ANALYTICS.md catalog when wiring into an app
                }
                .disabled(!reflowed)
                .cascade(visible: reflowed)

                Button("Reveal without scratching", action: demoScratchTriggerReveal)
                    .buttonStyle(PremiumPressStyle(haptic: nil))
                    .font(.body(15, weight: .medium))
                    .foregroundStyle(LabTheme.muted)
                    .disabled(revealed)
                    .opacity(revealed ? 0 : 1)
                    .premiumAnimation(PremiumMotion.standard, value: revealed)
            }
        }
        .padding(.horizontal, LabTheme.spaceLg)
        .padding(.bottom, LabTheme.spaceLg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LabTheme.background)
    }

    // MARK: - Card + gesture

    private var cardStack: some View {
        ZStack {
            DemoScratchRewardContent(reward: reward, revealed: revealed)

            DemoScratchFoilCanvas(stamps: stamps)
                .opacity(revealed ? 0 : 1)
                .allowsHitTesting(!revealed)
                .contentShape(Rectangle())
                .gesture(scratchGesture)
        }
        .frame(width: demoScratchCardWidth, height: demoScratchCardHeight)
        .accessibilityHint("Drag across the card to scratch it, or use the button below to reveal without scratching.")
    }

    private var scratchGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard !revealed else { return }
                if let last = lastDragPoint {
                    demoScratchStamp(from: last, to: value.location)
                } else {
                    demoScratchAddStamp(at: value.location)
                }
                lastDragPoint = value.location
            }
            .onEnded { _ in lastDragPoint = nil }
    }

    // MARK: - Scratch mechanics (finger-driven: no clock here by design)

    /// Fills in stamps along the segment between two drag samples so a fast
    /// swipe still reads as a continuous tear instead of leaving gaps.
    private func demoScratchStamp(from start: CGPoint, to end: CGPoint) {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let distance = (dx * dx + dy * dy).squareRoot()
        let steps = max(1, Int(distance / demoScratchStampSpacing))
        for step in 1...steps {
            guard !revealed else { return }
            let t = CGFloat(step) / CGFloat(steps)
            demoScratchAddStamp(at: CGPoint(x: start.x + dx * t, y: start.y + dy * t))
        }
    }

    private func demoScratchAddStamp(at point: CGPoint) {
        guard !revealed else { return }
        let jags: [CGFloat] = (0..<demoScratchBlobPoints).map { _ in
            let magnitude = CGFloat.random(in: 8...15)
            return Bool.random() ? magnitude : -magnitude
        }
        // Coverage first: re-scrubbing an already-cleared region draws
        // nothing new, so it must not grow the stamp array the Canvas
        // iterates every frame.
        guard demoScratchMarkGrid(around: point) else { return }
        stamps.append(
            DemoScratchStamp(center: point, jaggedOffsets: jags, rotation: Double.random(in: 0..<(2 * .pi)))
        )
        if scratchedFraction >= demoScratchRevealThreshold {
            demoScratchTriggerReveal()
        }
    }

    /// Approximates cleared foil area with a coarse coverage grid: cheap
    /// enough to update on every drag sample, and unaffected by how jagged
    /// the visual blob rendering is (that jitter is cosmetic only).
    @discardableResult
    private func demoScratchMarkGrid(around center: CGPoint) -> Bool {
        let cellWidth = demoScratchCardWidth / CGFloat(demoScratchGridColumns)
        let cellHeight = demoScratchCardHeight / CGFloat(demoScratchGridRows)
        let radiusSquared = demoScratchBrushRadius * demoScratchBrushRadius
        var changed = false
        for row in 0..<demoScratchGridRows {
            for col in 0..<demoScratchGridColumns {
                let index = row * demoScratchGridColumns + col
                if scratchedGrid[index] { continue }
                let point = CGPoint(
                    x: cellWidth * (CGFloat(col) + 0.5),
                    y: cellHeight * (CGFloat(row) + 0.5)
                )
                let dx = point.x - center.x
                let dy = point.y - center.y
                if dx * dx + dy * dy <= radiusSquared {
                    scratchedGrid[index] = true
                    changed = true
                }
            }
        }
        guard changed else { return false }
        let cleared = scratchedGrid.reduce(0) { $0 + ($1 ? 1 : 0) }
        scratchedFraction = CGFloat(cleared) / CGFloat(scratchedGrid.count)
        return true
    }

    // MARK: - Reveal + reflow (release settle: presets/tokens, not ad-hoc)

    /// Shared payoff path for both the scratch threshold and the accessible
    /// "reveal without scratching" button: cross-fade the foil away on the
    /// base duration token, confirm with a success haptic, then — after one
    /// base-duration beat — nudge the card up while the CTA fades in, both
    /// driven by a single `withAnimation` so the reflow reads as one motion.
    private func demoScratchTriggerReveal() {
        guard !revealed else { return }
        Haptics.Event.success.play()
        withAnimation(.easeInOut(duration: DesignTokens.Motion.durationBase)) {
            revealed = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.durationBase) {
            withAnimation(.easeOut(duration: DesignTokens.Motion.durationBase)) {
                reflowed = true
            }
        }
    }
}
