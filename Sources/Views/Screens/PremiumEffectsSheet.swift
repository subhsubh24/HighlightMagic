import SwiftUI

struct PremiumEffectsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedCategory: EffectCategory = .lut

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.backgroundGradient
                    .ignoresSafeArea()

                VStack(spacing: 16) {
                    // Category picker
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(EffectCategory.allCases, id: \.self) { category in
                                Button {
                                    selectedCategory = category
                                } label: {
                                    Text(category.rawValue)
                                        .font(Theme.caption)
                                        .foregroundStyle(
                                            selectedCategory == category ? .white : Theme.textSecondary
                                        )
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                        .background(
                                            selectedCategory == category
                                                ? AnyShapeStyle(Theme.primaryGradient)
                                                : AnyShapeStyle(Theme.surfaceColor)
                                        )
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, Constants.Layout.padding)
                    }

                    // Effects grid
                    ScrollView {
                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 16) {
                            ForEach(PremiumEffectLibrary.effects(for: selectedCategory)) { effect in
                                EffectCard(effect: effect)
                            }
                        }
                        .padding(.horizontal, Constants.Layout.padding)
                    }
                }
            }
            .navigationTitle("Premium Effects")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Theme.accent)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

struct EffectCard: View {
    let effect: PremiumEffect

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Theme.surfaceLight)
                    .frame(height: 80)

                Image(systemName: effect.icon)
                    .font(.title2)
                    .foregroundStyle(Theme.accent)
            }

            Text(effect.name)
                .font(.caption)
                .foregroundStyle(.white)
                .lineLimit(1)
        }
    }
}
