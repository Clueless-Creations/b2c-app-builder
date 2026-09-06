// DemoGesture.swift
// Gesture & Scroll Physics demo — the two-clocks rule: while a finger is down,
// motion is direct manipulation with zero animation curve (offset == translation,
// every frame); once the finger lifts, a single settle animation takes over,
// seeded with the gesture's own ending velocity so a throw and a nudge resolve
// differently. Recipe: references/motion-craft-benchmarks.md, "Gesture & Scroll
// Physics" — two clocks + velocity handoff + drag-to-dismiss.
//
// Every settle below reads DesignTokens.Motion / PremiumMotion; the only
// hand-typed numbers are gesture physics thresholds (the ~1000pt/s dismiss
// velocity, the 1/3-of-screen displacement divisor, the rotation-per-point
// tilt factor) — none of those are durations or springs.

import SwiftUI

/// Live state the bottom caption reports.
private enum DemoGesturePhase: Equatable {
    case tracking
    case thrown(vy: Double)
    case returned
}

/// Gesture-physics constants. Not motion tokens — these describe when a
/// release counts as a "throw," not how long anything animates.
private let demoGestureDismissVelocityThreshold: Double = 1000
private let demoGestureTiltPerPoint: Double = 18
private let demoGestureMaxTiltDegrees: Double = 10

/// An `Animatable` passthrough modifier that reports the *currently rendered*
/// value of an animating `CGSize` back out via a closure, every frame. SwiftUI
/// only exposes the target of a `withAnimation` change through `@State`; the
/// in-flight, interpolated value has to be read off `animatableData` the way a
/// `GeometryEffect` would. This is what makes "grab the card wherever it is"
/// possible: a new touch captures this live value instead of the far-away
/// final target of whatever settle was still running.
private struct DemoGestureLiveOffsetTracker: Animatable, ViewModifier {
    var animatableData: AnimatablePair<CGFloat, CGFloat>
    let onChange: (CGSize) -> Void

    init(offset: CGSize, onChange: @escaping (CGSize) -> Void) {
        animatableData = AnimatablePair(offset.width, offset.height)
        self.onChange = onChange
    }

    func body(content: Content) -> some View {
        let current = CGSize(width: animatableData.first, height: animatableData.second)
        // Deferred to the next runloop tick: mutating state synchronously
        // inside `body` is what SwiftUI's view-update-cycle warning guards
        // against.
        DispatchQueue.main.async { onChange(current) }
        return content
    }
}

/// The dismissible surface: a primary header strip + neutral body, echoing the
/// PlanCard visual language from Screens.swift without reusing its type.
private struct DemoGestureDismissCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: LabTheme.spaceSm) {
                Image(systemName: "calendar")
                    .font(.body(16, weight: .semibold))
                Text("This week's plan")
                    .font(.body(17, weight: .semibold))
                Spacer()
                Image(systemName: "hand.draw")
                    .font(.body(13))
                    .opacity(0.75)
            }
            .foregroundStyle(.white)
            .padding(LabTheme.spaceMd)
            .background(LabTheme.primary)

            VStack(alignment: .leading, spacing: LabTheme.spaceSm) {
                Text("Two minutes a day, every day.")
                    .font(.body(15, weight: .medium))
                    .foregroundStyle(LabTheme.text)
                Text("Drag to dismiss, or let go early and it settles back.")
                    .font(.body(13))
                    .foregroundStyle(LabTheme.muted)
            }
            .padding(LabTheme.spaceMd)
            .background(LabTheme.surface)
        }
        .frame(width: 260)
        .clipShape(RoundedRectangle(cornerRadius: LabTheme.radiusLg + 4, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LabTheme.radiusLg + 4, style: .continuous)
                .strokeBorder(LabTheme.border.opacity(0.7), lineWidth: 1)
        )
        .shadow(color: LabTheme.text.opacity(0.12), radius: 20, y: 10)
    }
}

struct DemoGestureView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The card's absolute position — set 1:1 from the finger while dragging,
    /// animated by a settle once the finger lifts.
    @State private var offset: CGSize = .zero
    /// Where the drag started from, captured from `liveOffset` at grab time so
    /// a mid-settle grab resumes from the visually-current spot, not zero.
    @State private var dragBaseOffset: CGSize = .zero
    /// The frame-accurate rendered offset, kept current by
    /// `DemoGestureLiveOffsetTracker` even while a settle animation is running.
    @State private var liveOffset: CGSize = .zero
    @State private var isDragging = false
    @State private var cardOpacity: Double = 1
    @State private var phase: DemoGesturePhase = .returned
    /// Bumped on every grab and every settle commit so a stale, already
    /// superseded `asyncAfter` callback can recognize it no longer owns the
    /// card's state and quietly no-op.
    @State private var gestureID = 0

    var body: some View {
        VStack(spacing: LabTheme.spaceLg) {
            VStack(spacing: LabTheme.spaceSm) {
                Text("Gesture & Scroll Physics")
                    .font(.display(28))
                    .foregroundStyle(LabTheme.text)
                    .multilineTextAlignment(.center)
                Text("Drag the card. A hard downward flick — or dragging past a third of the way down — throws it away carrying that speed; anything gentler springs back with no bounce. Grab it again mid-flight; it stays under your finger.")
                    .font(.body(14))
                    .foregroundStyle(LabTheme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LabTheme.spaceLg)
            }
            .padding(.top, LabTheme.spaceLg)

            GeometryReader { geo in
                DemoGestureDismissCard()
                    .offset(offset)
                    .rotationEffect(.degrees(reduceMotion ? 0 : tiltDegrees))
                    .opacity(cardOpacity)
                    .modifier(DemoGestureLiveOffsetTracker(offset: offset) { liveOffset = $0 })
                    // Hit target and gesture bind to the card itself — the
                    // instructions say drag the card, so empty stage space
                    // must not dismiss it.
                    .contentShape(Rectangle())
                    .gesture(dragGesture(in: geo))
                    // VoiceOver owns drag gestures, so the card exposes the
                    // same two outcomes as named actions.
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Practice card")
                    .accessibilityHint("Dismiss the card, or return it to center.")
                    .accessibilityAction(named: "Dismiss") { commitDismiss(velocity: .zero, in: geo) }
                    .accessibilityAction(named: "Return to center") { springBack(velocity: .zero) }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            }
            .clipped()

            Text(captionText)
                .font(.body(13, weight: .medium))
                .foregroundStyle(LabTheme.muted)
                .padding(.bottom, LabTheme.spaceLg)
                .contentTransition(.opacity)
                .premiumAnimation(PremiumMotion.standard, value: captionText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LabTheme.background)
    }

    private var tiltDegrees: Double {
        min(max(Double(offset.width) / demoGestureTiltPerPoint, -demoGestureMaxTiltDegrees), demoGestureMaxTiltDegrees)
    }

    private var captionText: String {
        switch phase {
        case .tracking: return "tracking"
        case .thrown(let vy): return "thrown (vy: \(Int(vy)) pt/s)"
        case .returned: return "returned"
        }
    }

    // MARK: - Gesture

    private func dragGesture(in geo: GeometryProxy) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if !isDragging {
                    isDragging = true
                    // A fresh grab always wins: invalidate any pending
                    // post-settle callback and make sure the card is visible
                    // even if it grabbed mid-fade.
                    gestureID += 1
                    dragBaseOffset = liveOffset
                    cardOpacity = 1
                }
                // Direct manipulation clock: zero easing — but travel away
                // from the commit direction rubber-bands past its free zone
                // (platform resistance ≈0.55, the constant the benchmarks
                // document). Downward is the dismiss direction and stays 1:1.
                let rawWidth = dragBaseOffset.width + value.translation.width
                let rawHeight = dragBaseOffset.height + value.translation.height
                offset = CGSize(
                    width: demoGestureRubberBand(rawWidth, freeTravel: geo.size.width / 4, maxExcess: geo.size.width / 5),
                    height: rawHeight >= 0
                        ? rawHeight
                        : demoGestureRubberBand(rawHeight, freeTravel: 48, maxExcess: geo.size.height / 6)
                )
                phase = .tracking
            }
            .onEnded { value in
                isDragging = false
                handleRelease(value, in: geo)
            }
    }

    private func handleRelease(_ value: DragGesture.Value, in geo: GeometryProxy) {
        let vy = Double(value.velocity.height)
        let dismissTravel = geo.size.height / 3
        let shouldDismiss = vy > demoGestureDismissVelocityThreshold || offset.height > dismissTravel
        if shouldDismiss {
            commitDismiss(velocity: value.velocity, in: geo)
        } else {
            springBack(velocity: value.velocity)
        }
    }

    /// Commit clock: the card exits carrying the throw's own speed, then
    /// cross-fades back in one cinematic beat later so the demo repeats.
    private func commitDismiss(velocity: CGSize, in geo: GeometryProxy) {
        Haptics.Event.impactLight.play()
        phase = .thrown(vy: Double(velocity.height))
        gestureID += 1
        let myGestureID = gestureID

        // A committed throw keeps its full vector: the exit target drifts
        // horizontally by the release vx over the exit window, and the spring
        // seeds from the velocity projected onto that travel — a diagonal
        // flick must not straighten out the moment the finger lifts.
        let target = CGSize(
            width: offset.width + velocity.width * CGFloat(DesignTokens.Motion.durationSlow),
            height: geo.size.height
        )
        let travel = CGSize(width: target.width - offset.width, height: target.height - offset.height)
        let travelLengthSquared = max(Double(travel.width * travel.width + travel.height * travel.height), 1)
        let normalizedVelocity = Double(velocity.width * travel.width + velocity.height * travel.height) / travelLengthSquared

        if reduceMotion {
            // Shortest non-bouncing settle; no decorative tilt (handled above).
            withAnimation(.easeOut(duration: DesignTokens.Motion.durationFast)) {
                offset = target
                cardOpacity = 0
            }
        } else {
            withAnimation(
                .interpolatingSpring(
                    duration: DesignTokens.Motion.durationSlow,
                    bounce: 0,
                    initialVelocity: normalizedVelocity
                )
            ) {
                offset = target
            }
            withAnimation(PremiumMotion.standard) {
                cardOpacity = 0
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + DesignTokens.Motion.durationCinematic) {
            guard myGestureID == gestureID else { return }
            offset = .zero
            cardOpacity = 0
            withAnimation(reduceMotion ? .easeOut(duration: DesignTokens.Motion.durationFast) : PremiumMotion.standard) {
                cardOpacity = 1
            }
            phase = .returned
        }
    }

    /// Failed-dismiss clock: overdamped, press-family timing, still seeded
    /// with the release velocity so the return inherits momentum — but a
    /// bounce here would read as mockery, so no overshoot.
    private func springBack(velocity: CGSize) {
        // Velocity handoff in full: project the release velocity onto the
        // travel vector back to center (signed — momentum away from center
        // seeds the spring negative), normalized by the travel distance the
        // way interpolatingSpring expects. A height-only scalar would drop a
        // sideways flick's momentum entirely.
        let travel = CGSize(width: -offset.width, height: -offset.height)
        let travelLengthSquared = max(Double(travel.width * travel.width + travel.height * travel.height), 1)
        let normalizedVelocity = Double(velocity.width * travel.width + velocity.height * travel.height) / travelLengthSquared

        if reduceMotion {
            withAnimation(.easeOut(duration: DesignTokens.Motion.durationFast)) {
                offset = .zero
            }
        } else {
            withAnimation(
                .interpolatingSpring(
                    duration: DesignTokens.Motion.durationFast,
                    bounce: -0.3,
                    initialVelocity: normalizedVelocity
                )
            ) {
                offset = .zero
            }
        }
        phase = .returned
    }
}

/// iOS-style rubber band: 1:1 inside `freeTravel`, then diminishing returns
/// asymptotically approaching `freeTravel + maxExcess`. The 0.55 factor is
/// the platform's classic scroll resistance constant (see the Gesture &
/// Scroll Physics section of motion-craft-benchmarks.md) — content dragged
/// past its bounds must follow the finger with resistance, never hard-stop.
private func demoGestureRubberBand(_ raw: CGFloat, freeTravel: CGFloat, maxExcess: CGFloat) -> CGFloat {
    let magnitude = abs(raw)
    guard magnitude > freeTravel else { return raw }
    let excess = magnitude - freeTravel
    let resisted = maxExcess * (1 - 1 / (excess * 0.55 / maxExcess + 1))
    return (raw < 0 ? -1 : 1) * (freeTravel + resisted)
}
