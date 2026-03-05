import SwiftUI

struct PremiumEffectsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedEffects: [PremiumEffect]
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
                                EffectCard(
                                    effect: effect,
                                    isSelected: selectedEffects.contains(effect)
                                ) {
                                    HapticFeedback.selection()
                                    toggleEffect(effect)
                                }
                            }
                        }
                        .padding(.horizontal, Constants.Layout.padding)
                    }

                    // Selected effects summary
                    if !selectedEffects.isEmpty {
                        HStack {
                            Text("\(selectedEffects.count) effect\(selectedEffects.count == 1 ? "" : "s") applied")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.textSecondary)
                            Spacer()
                            Button("Clear All") {
                                HapticFeedback.light()
                                selectedEffects.removeAll()
                            }
                            .font(Theme.caption)
                            .foregroundStyle(Theme.warning)
                        }
                        .padding(.horizontal, Constants.Layout.padding)
                        .padding(.bottom, 8)
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

    private func toggleEffect(_ effect: PremiumEffect) {
        if let index = selectedEffects.firstIndex(of: effect) {
            selectedEffects.remove(at: index)
        } else {
            // For LUTs: only one at a time (they replace each other)
            if effect.category == .lut {
                selectedEffects.removeAll { $0.category == .lut }
            }
            // For transitions: only one at a time
            if effect.category == .transition {
                selectedEffects.removeAll { $0.category == .transition }
            }
            selectedEffects.append(effect)
        }
    }
}

struct EffectCard: View {
    let effect: PremiumEffect
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Theme.surfaceLight)
                        .frame(height: 80)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(isSelected ? Theme.accent : .clear, lineWidth: 2)
                        )

                    VStack(spacing: 4) {
                        Image(systemName: effect.icon)
                            .font(.title2)
                            .foregroundStyle(isSelected ? Theme.accent : Theme.textSecondary)

                        if isSelected {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.caption2)
                                .foregroundStyle(Theme.accent)
                        }
                    }
                }

                Text(effect.name)
                    .font(.caption)
                    .foregroundStyle(isSelected ? Theme.accent : .white)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }
}
