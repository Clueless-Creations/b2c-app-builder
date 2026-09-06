// PremiumCraft.swift
//
// Drop-in SwiftUI building blocks for the "premium feel" details that separate
// apps that feel built by people who care from ones that feel cheap. None of
// these are flashy. That is the point — premium is the compounding effect of
// many small, invisible decisions: press feedback, restrained motion,
// disciplined haptics, keyboard behavior, and loading/empty states.
//
// Pairs with references/premium-mobile-craft.md (the cross-platform doctrine)
// and templates/ux-patterns/UX_PATTERNS.md (the per-surface contract).
//
// Targets the latest Swift / SwiftUI. APIs used here are iOS 17+ unless noted;
// iOS 26 Liquid Glass affordances are called out inline. All motion reads the
// shared, tokenized motion scale from DesignTokens.Motion (generated from
// DESIGN.md) so app and web stay consistent. Reduced Motion is
// honored everywhere; never block first paint on an animation.
//
// This file ships as native boilerplate. Do NOT import framer-motion / the
// `motion` web library here — that is web-surface only and would break the
// mobile binary (the skill's check:template-safety validator enforces this).

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Motion: springs derived from the shared token scale

/// Spring/easing presets built from `DesignTokens.Motion`. Keep every animated
/// transition on this scale instead of ad-hoc millisecond values. Standard UI
/// feedback lives in the 150-300ms band; anything longer starts to feel like
/// the app is showing off.
enum PremiumMotion {
    /// Snappy press / tap feedback (~120ms). Low bounce so it reads as a
    /// physical object responding, not a toy.
    static let press = Animation.spring(
        duration: DesignTokens.Motion.durationFast,
        bounce: 0.18
    )

    /// Default state-change spring (~220ms) for content appearing, sheets,
    /// reveals — motion that answers a question the user just asked.
    static let standard = Animation.spring(
        duration: DesignTokens.Motion.durationBase,
        bounce: 0.12
    )

    /// Larger, deliberate transitions (~360ms). Use sparingly.
    static let emphasized = Animation.spring(
        duration: DesignTokens.Motion.durationSlow,
        bounce: 0.1
    )

    /// Celebrate family, soft-settle end (~500ms, damping ≈0.7): one gentle
    /// overshoot — sheet-level reveals and the experience-card canon moments.
    /// Earned moments only; ordinary state changes stay on `standard`.
    static let celebrate = Animation.spring(
        duration: DesignTokens.Motion.durationCelebrate,
        bounce: 0.3
    )

    /// Celebrate family, visible-oscillation end (~500ms, damping ≈0.55): the
    /// object overshoots and reverses 1-2 times — R3 earned-object landings
    /// (motion-craft-benchmarks.md) only. Anything bouncier reads as a toy.
    static let celebrateLanding = Animation.spring(
        duration: DesignTokens.Motion.durationCelebrate,
        bounce: 0.45
    )
}

extension View {
    /// Applies a premium animation that automatically collapses to an instant
    /// change when the user has Reduce Motion enabled. Prefer this over a raw
    /// `.animation(...)` so every surface honors the accessibility setting.
    func premiumAnimation<V: Equatable>(
        _ animation: Animation = PremiumMotion.standard,
        value: V
    ) -> some View {
        modifier(PremiumAnimationModifier(animation: animation, value: value))
    }
}

private struct PremiumAnimationModifier<V: Equatable>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let animation: Animation
    let value: V

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : animation, value: value)
    }
}

// MARK: - 1. Press states & spring physics

/// A button style that gives every tap the 100ms of physical feedback premium
/// apps have: a small scale-down and subtle dim on press, with a spring back on
/// release, plus an optional confirming haptic. Reduce Motion keeps the haptic
/// and opacity cue but drops the scale transform.
///
/// On iOS 26 the system Liquid Glass styles (`.buttonStyle(.glass)` /
/// `.glassProminent`) give premium press feedback for free — prefer them for
/// system-shaped controls (toolbars, capsules, floating actions). Reach for
/// this style for custom/branded surfaces and for pre-iOS-26 users. Other
/// stacks implement the portable press contract through their native adapter.
struct PremiumPressStyle: ButtonStyle {
    var pressedScale: CGFloat = 0.97
    var pressedOpacity: Double = 0.92
    /// Haptics confirm a decision. Leave on for primary/destructive actions;
    /// turn off for low-stakes or repeated taps so haptics never become noise.
    var haptic: Haptics.Event? = .impactLight

    func makeBody(configuration: Configuration) -> some View {
        // @Environment is read inside a nested View, not on the style itself —
        // a ButtonStyle struct is not part of the view hierarchy, so reading
        // accessibilityReduceMotion directly on it would never update.
        PressableLabel(
            configuration: configuration,
            pressedScale: pressedScale,
            pressedOpacity: pressedOpacity,
            haptic: haptic
        )
    }

    private struct PressableLabel: View {
        let configuration: ButtonStyleConfiguration
        let pressedScale: CGFloat
        let pressedOpacity: Double
        let haptic: Haptics.Event?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            configuration.label
                .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? pressedScale : 1))
                .opacity(configuration.isPressed ? pressedOpacity : 1)
                .animation(reduceMotion ? nil : PremiumMotion.press, value: configuration.isPressed)
                .onChange(of: configuration.isPressed) { _, isPressed in
                    if isPressed, let haptic { haptic.play() }
                }
        }
    }
}

extension ButtonStyle where Self == PremiumPressStyle {
    /// `.buttonStyle(.premiumPress)` — physical press feedback for custom buttons.
    static var premiumPress: PremiumPressStyle { PremiumPressStyle() }
}

// MARK: - 3. Haptics

/// Semantic haptics. The rule: haptics confirm state changes and decisions —
/// not navigation, not scrolling, not idle taps. Used everywhere they become
/// noise and feel cheap; used for real acknowledgements they make the app feel
/// trustworthy and physical.
///
/// Prefer the declarative `.sensoryFeedback(_:trigger:)` modifier (see
/// `sensoryFeedback(for:trigger:)` below) for state-driven feedback. Use the
/// imperative `play()` for one-shot moments inside gesture/closure code where a
/// trigger value is awkward (e.g. a swipe-to-dismiss `onEnded`).
enum Haptics {
    enum Event {
        case selection            // a toggle flipped, a segment switched
        case impactLight          // a primary button press
        case impactMedium         // a more consequential confirmation
        case success              // a form submitted, a task completed
        case warning              // a guarded / reversible destructive action
        case error                // an action failed

        /// Declarative mapping for `.sensoryFeedback`.
        var feedback: SensoryFeedback {
            switch self {
            case .selection:    return .selection
            case .impactLight:  return .impact(weight: .light)
            case .impactMedium: return .impact(weight: .medium)
            case .success:      return .success
            case .warning:      return .warning
            case .error:        return .error
            }
        }

        /// Imperative one-shot. Safe to call from the main actor in closures.
        @MainActor func play() {
            #if canImport(UIKit) && !os(watchOS)
            switch self {
            case .selection:
                UISelectionFeedbackGenerator().selectionChanged()
            case .impactLight:
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            case .impactMedium:
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case .success:
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            case .warning:
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
            case .error:
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
            #endif
        }
    }
}

extension View {
    /// Declarative, state-driven haptic. Fires the mapped feedback whenever
    /// `trigger` changes — the premium way to confirm a state change without
    /// scattering generators through your view code.
    func sensoryFeedback<T: Equatable>(for event: Haptics.Event, trigger: T) -> some View {
        sensoryFeedback(event.feedback, trigger: trigger)
    }
}

// MARK: - 4. Keyboard behavior

/// Keyboard handling is where serious apps separate themselves. SwiftUI already
/// keeps the focused field above the keyboard via the safe area, so the job is
/// the rest: let users dismiss intentionally, keep submit reachable, and make
/// dismissal feel deliberate rather than jarring.
extension View {
    /// Interactive, drag-to-dismiss scrolling — the keyboard follows the
    /// user's finger as they swipe down a scroll view (iOS 16+). The premium
    /// default for any scrollable form or chat/prompt surface.
    func premiumInteractiveKeyboardDismiss() -> some View {
        scrollDismissesKeyboard(.interactively)
    }

    /// Tap-anywhere-to-dismiss for non-scrolling forms. Pass the binding that
    /// drives `@FocusState` so the field blurs on a background tap.
    func dismissKeyboardOnTap<F: Hashable>(_ focus: FocusState<F?>.Binding) -> some View {
        contentShape(Rectangle())
            .onTapGesture { focus.wrappedValue = nil }
    }

    /// A vertical pan that focuses on swipe-up and blurs on swipe-down, with a
    /// soft confirming haptic. Attach it to an input container.
    func swipeFocusGesture<F: Hashable>(
        _ focus: FocusState<F?>.Binding,
        focusValue: F,
        threshold: CGFloat = 48
    ) -> some View {
        gesture(
            DragGesture(minimumDistance: 12)
                .onEnded { value in
                    guard abs(value.translation.height) >= threshold else { return }
                    if value.translation.height < 0 {
                        focus.wrappedValue = focusValue   // swipe up → focus
                    } else {
                        focus.wrappedValue = nil          // swipe down → blur
                    }
                    Haptics.Event.impactLight.play()
                }
        )
    }
}

/// A "Done" key-row that keeps a dismiss control reachable above the keyboard.
/// Attach inside a `.toolbar { ... }` on the focused screen.
struct KeyboardDoneToolbar: ToolbarContent {
    let onDone: () -> Void
    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .keyboard) {
            Spacer()
            Button("Done", action: onDone)
        }
    }
}

// MARK: - 5. Loading & empty states

/// Skeleton + soft shimmer. Premium apps don't ask users to wait at a spinner;
/// they outline the shape of the content so it feels like it was always there.
/// Built on `.redacted(.placeholder)` so the real layout — and its size — is
/// preserved while loading, preventing the layout jumps cheap apps have.
/// Reduce Motion shows a static placeholder with no sweeping highlight.
struct ShimmerModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// When false (not loading) or under Reduce Motion, the sweep is skipped.
    var isActive: Bool = true
    @State private var phase: CGFloat = -1

    func body(content: Content) -> some View {
        if isActive && !reduceMotion {
            content
                .overlay { highlight }
                .mask(content)
                .onAppear {
                    // Ambient loop pacing rides the reveal token's 0.6-1.2s
                    // band (2x durationReveal), keeping every duration on the
                    // shared motion scale — no ad-hoc values, per the doctrine
                    // this file exists to enforce.
                    withAnimation(
                        .linear(duration: DesignTokens.Motion.durationReveal * 2)
                            .repeatForever(autoreverses: false)
                    ) {
                        phase = 2
                    }
                }
        } else {
            content
        }
    }

    private var highlight: some View {
        GeometryReader { geo in
            LinearGradient(
                colors: [.clear, .white.opacity(0.45), .clear],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: geo.size.width * 0.6)
            .offset(x: geo.size.width * phase)
            .blendMode(.plusLighter)
        }
        .allowsHitTesting(false)
    }
}

extension View {
    /// Marks a view as loading: redacts it as a placeholder and runs a soft
    /// shimmer over it (static under Reduce Motion). Toggle with your load state.
    func skeleton(_ isLoading: Bool) -> some View {
        redacted(reason: isLoading ? .placeholder : [])
            .modifier(ShimmerModifier(isActive: isLoading))
    }
}

/// An empty state is the first screen many users see. It should never be a
/// blank screen: explain what goes here, why it's empty, and the one next step.
struct EmptyStateView<Action: View>: View {
    let symbol: String          // SF Symbol name
    let title: String
    let message: String
    @ViewBuilder var action: () -> Action

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: symbol)
                .font(.system(size: 44, weight: .regular))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            action()
                .padding(.top, 4)
        }
        .frame(maxWidth: 320)
        .padding(24)
    }
}
