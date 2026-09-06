// SYNTHETIC FIXTURE: not a real creator's repository
// CardStack: a small SwiftUI view that fans a stack of cards with soft layered shadows.
import SwiftUI

/// Vertical offset of one card in a stack. Card `count - 1` sits on top with no offset.
public func cardStackOffset(index: Int, count: Int, spacing: CGFloat) -> CGFloat {
    guard count > 0, index >= 0, index < count else { return 0 }
    return CGFloat(count - 1 - index) * spacing
}

/// Scale of one card in a stack. Cards further back shrink by three percent per step.
public func cardStackScale(index: Int, count: Int) -> CGFloat {
    guard count > 0, index >= 0, index < count else { return 1 }
    return 1 - CGFloat(count - 1 - index) * 0.03
}

public struct CardStack<Content: View>: View {
    public let count: Int
    public let spacing: CGFloat
    private let content: (Int) -> Content

    public init(count: Int, spacing: CGFloat = 12, @ViewBuilder content: @escaping (Int) -> Content) {
        self.count = max(count, 0)
        self.spacing = spacing
        self.content = content
    }

    public var body: some View {
        ZStack {
            ForEach(0..<count, id: \.self) { index in
                content(index)
                    .frame(maxWidth: .infinity)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(.systemBackground)))
                    .shadow(color: .black.opacity(0.08), radius: 2, y: 1)
                    .shadow(color: .black.opacity(0.12), radius: 12, y: 8)
                    .scaleEffect(cardStackScale(index: index, count: count))
                    .offset(y: cardStackOffset(index: index, count: count, spacing: spacing))
                    .zIndex(Double(index))
            }
        }
    }
}
