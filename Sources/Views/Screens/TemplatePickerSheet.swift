import SwiftUI

struct TemplatePickerSheet: View {
    let clipBinding: Binding<EditedClip>?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.backgroundGradient
                    .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Choose a style template to instantly apply a curated look.")
                            .font(Theme.body)
                            .foregroundStyle(Theme.textSecondary)

                        LazyVGrid(columns: [
                            GridItem(.flexible(), spacing: 12),
                            GridItem(.flexible(), spacing: 12)
                        ], spacing: 12) {
                            ForEach(TemplateLibrary.templates) { template in
                                TemplateCard(template: template) {
                                    applyTemplate(template)
                                    dismiss()
                                }
                            }
                        }
                    }
                    .padding(Constants.Layout.padding)
                }
            }
            .navigationTitle("Templates")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Theme.accent)
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func applyTemplate(_ template: HighlightTemplate) {
        guard let binding = clipBinding else { return }
        binding.wrappedValue.selectedFilter = template.suggestedFilter
        binding.wrappedValue.captionStyle = template.suggestedCaptionStyle
        if let track = MusicLibrary.suggestedTrackForTemplate(template) {
            binding.wrappedValue.selectedMusicTrack = track
        }
    }
}

struct TemplateCard: View {
    let template: HighlightTemplate
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(hex: template.colorAccent).opacity(0.6),
                                    Color(hex: template.colorAccent).opacity(0.2)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(height: 80)

                    Image(systemName: template.icon)
                        .font(.system(size: 28))
                        .foregroundStyle(.white)
                }

                VStack(spacing: 3) {
                    Text(template.name)
                        .font(Theme.headline)
                        .foregroundStyle(.white)

                    Text(template.description)
                        .font(.caption2)
                        .foregroundStyle(Theme.textTertiary)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(10)
            .background(Theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius)
                    .stroke(Theme.surfaceLight, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
