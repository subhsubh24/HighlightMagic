import SwiftUI

struct PrimaryButton: View {
    let title: String
    var icon: String? = nil
    var isLoading: Bool = false
    var isDisabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .tint(.white)
                } else if let icon {
                    Image(systemName: icon)
                        .font(.body.bold())
                }
                Text(title)
                    .font(Theme.headline)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                isDisabled
                    ? AnyShapeStyle(Theme.surfaceLight)
                    : AnyShapeStyle(Theme.primaryGradient)
            )
            .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
            .shadow(color: isDisabled ? .clear : Theme.accent.opacity(0.3), radius: 10, y: 4)
        }
        .disabled(isDisabled || isLoading)
        .buttonStyle(.plain)
    }
}
