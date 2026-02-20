import SwiftUI

struct SuggestionChip: View {
    let text: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(Theme.caption)
                .foregroundStyle(isSelected ? .white : Theme.textSecondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(isSelected ? AnyShapeStyle(Theme.primaryGradient) : AnyShapeStyle(Theme.surfaceColor))
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(isSelected ? Color.clear : Theme.surfaceLight, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}
