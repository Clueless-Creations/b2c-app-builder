// DemoGrid.swift
// Recipe R1 — asynchronous-grid liveness (in-app ambient variant).
//
// A fixed 4-row x 3-column grid of rounded cells. Each cell periodically
// cross-fades its SF Symbol (a small garden set) on its own clock; exactly one
// cell at a time carries the saturated hero role (LabTheme.primary fill, white
// symbol) and that role hops from cell to cell on a steady cinematic beat.
// Positions and sizes never change — only opacity/scale/color animate.

import SwiftUI

// MARK: - Precomputed schedule

/// Swap schedule for the 12 cells, precomputed so that no two grid-adjacent
/// cells (sharing an edge) ever swap within 200ms of each other.
///
/// The grid graph is bipartite: color each cell by (row + col) % 2 and every
/// edge connects an even cell to an odd cell, never two cells of the same
/// parity. Even cells swap on the `durationReveal * 1.0` period (0.6s); odd
/// cells swap on `durationReveal * 2.0` (1.2s, == durationCinematic). That 2:1
/// ratio is deliberate — it is the ONLY pairing among the five listed variants
/// (1.0 / 1.25 / 1.5 / 1.75 / 2.0 x durationReveal) whose periods share a
/// large common factor. Every other pairing (e.g. 1.0 & 1.25, or 1.5 & 1.75)
/// has a much finer common "beat" — 0.15s or 0.3s once reduced to seconds —
/// which by pigeonhole guarantees some future swap pair lands under 200ms
/// apart no matter how the phases are chosen. Restricting adjacent cells to
/// the 0.6s/1.2s pair keeps the guarantee true for the life of the session,
/// not just for a sampled window.
///
/// Adjacency proof (holds for every non-negative integer k, m — not just a
/// sampled window):
///   even-cell swap times:  Te(k) = pe + k * 0.6, pe ∈ {0.00, 0.06}
///   odd-cell swap times:   To(m) = po + m * 1.2, po ∈ {0.30, 0.36}
///   To(m) - Te(k) ≡ (po - pe) mod 0.6, and po - pe ∈ {0.24, 0.30, 0.36}
/// Every achievable gap is therefore at least 0.24s from zero (and at least
/// 0.24s from 0.6), clear of the 0.2s guard band forever. Every grid edge is
/// even-odd (same-parity cells are never adjacent), so the per-cell phase
/// variants inside each parity class add visible clock independence — four
/// distinct clocks across the grid — without ever touching the guarantee.
private enum DemoGridSchedule {
    static let rows = 4
    static let columns = 3

    static let symbols = [
        "leaf.fill", "drop.fill", "sun.max.fill",
        "moon.fill", "sparkles", "book.fill",
    ]

    static let periodEven = DesignTokens.Motion.durationReveal * 1.0   // 0.6s
    static let periodOdd = DesignTokens.Motion.durationReveal * 2.0    // 1.2s
    /// Two phase variants per parity class (stagger multiples), alternated by
    /// row so neighbouring same-class cells run visibly different clocks.
    static let phasesEven: [Double] = [DesignTokens.Motion.stagger * 0, DesignTokens.Motion.stagger * 1] // 0.00s, 0.06s
    static let phasesOdd: [Double] = [DesignTokens.Motion.stagger * 5, DesignTokens.Motion.stagger * 6]  // 0.30s, 0.36s

    /// One row per grid row, values are column-major cell configs — the
    /// "static table" the recipe asks for, laid out so the checkerboard
    /// parity is readable at a glance next to the proof above:
    ///   row 0: even odd  even
    ///   row 1: odd  even odd
    ///   row 2: even odd  even
    ///   row 3: odd  even odd
    static let cells: [DemoGridCellConfig] = (0..<(rows * columns)).map { i in
        let r = i / columns
        let c = i % columns
        let isEven = (r + c) % 2 == 0
        let variant = r % 2
        return DemoGridCellConfig(
            index: i,
            period: isEven ? periodEven : periodOdd,
            phase: isEven ? phasesEven[variant] : phasesOdd[variant],
            initialSymbol: i % symbols.count
        )
    }
}

private struct DemoGridCellConfig {
    let index: Int
    let period: Double
    let phase: Double
    let initialSymbol: Int
}

private enum DemoGridMetrics {
    static let cellSize: CGFloat = 100
}

// MARK: - Screen

struct DemoGridView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var symbolTicks: [Int] = DemoGridSchedule.cells.map { $0.initialSymbol }
    @State private var heroIndex = 0
    @State private var swapTasks: [Task<Void, Never>] = []
    @State private var heroTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: LabTheme.spaceLg) {
            VStack(spacing: LabTheme.spaceSm) {
                Text("Grid liveness")
                    .font(.display(28))
                    .foregroundStyle(LabTheme.text)
                Text("Every cell swaps its icon on its own clock. Touching cells never swap together — watch the green hero hop instead.")
                    .font(.body(14))
                    .foregroundStyle(LabTheme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LabTheme.spaceLg)
            }
            .padding(.top, LabTheme.spaceLg)

            gridBody

            Spacer(minLength: LabTheme.spaceLg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LabTheme.background)
        .onAppear(perform: startIfNeeded)
        .onDisappear(perform: stopAll)
        // The accessibility shortcut can flip Reduce Motion while this screen
        // stays mounted — the clocks must stop or start with it.
        .onChange(of: reduceMotion) { _, reduced in
            if reduced {
                stopAll()
            } else {
                startIfNeeded()
            }
        }
    }

    private var gridBody: some View {
        VStack(spacing: LabTheme.spaceSm) {
            ForEach(0..<DemoGridSchedule.rows, id: \.self) { r in
                HStack(spacing: LabTheme.spaceSm) {
                    ForEach(0..<DemoGridSchedule.columns, id: \.self) { c in
                        let i = r * DemoGridSchedule.columns + c
                        DemoGridCellView(
                            symbolName: DemoGridSchedule.symbols[
                                symbolTicks[i] % DemoGridSchedule.symbols.count
                            ],
                            isHero: heroIndex == i
                        )
                    }
                }
            }
        }
    }

    private func startIfNeeded() {
        guard !reduceMotion else { return } // R1 Reduce Motion: static grid, one hero cell, no swaps.
        guard swapTasks.isEmpty else { return }

        for config in DemoGridSchedule.cells {
            let task = Task { @MainActor in
                try? await Task.sleep(for: .seconds(config.phase))
                while !Task.isCancelled {
                    withAnimation(PremiumMotion.standard) {
                        symbolTicks[config.index] += 1
                    }
                    try? await Task.sleep(for: .seconds(config.period))
                }
            }
            swapTasks.append(task)
        }

        // Hero role hops on the cinematic beat, in fixed cell order.
        heroTask = Task { @MainActor in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(DesignTokens.Motion.durationCinematic))
                // Cancellation lands as a thrown sleep; without this check the
                // loop would run one final animated hop after stopAll().
                if Task.isCancelled { return }
                withAnimation(PremiumMotion.standard) {
                    heroIndex = (heroIndex + 1) % DemoGridSchedule.cells.count
                }
            }
        }
    }

    private func stopAll() {
        swapTasks.forEach { $0.cancel() }
        swapTasks.removeAll()
        heroTask?.cancel()
        heroTask = nil
    }
}

/// A single grid cell: fixed size, fixed position in its row/column — only its
/// fill color and symbol cross-fade (scale 0.9->1 + opacity). `.id(symbolName)`
/// gives the SF Symbol a fresh identity on each swap so SwiftUI treats it as an
/// insertion/removal pair and applies the transition, instead of silently
/// re-rendering the same view in place.
private struct DemoGridCellView: View {
    let symbolName: String
    let isHero: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
                .fill(isHero ? LabTheme.primary : LabTheme.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: LabTheme.radiusMd, style: .continuous)
                        .strokeBorder(LabTheme.border, lineWidth: 1)
                )

            Image(systemName: symbolName)
                .font(.system(size: 22, weight: .medium))
                .foregroundStyle(isHero ? .white : LabTheme.muted)
                .id(symbolName)
                .transition(.scale(scale: 0.9).combined(with: .opacity))
        }
        .frame(width: DemoGridMetrics.cellSize, height: DemoGridMetrics.cellSize)
        .premiumAnimation(PremiumMotion.standard, value: isHero)
    }
}
