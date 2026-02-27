import SwiftUI
import AVFoundation

struct TemplatePickerSheet: View {
    let clipBinding: Binding<EditedClip>?
    @Environment(AppState.self) private var appState
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
        let clip = binding.wrappedValue

        // Apply template suggestions immediately for instant visual feedback
        binding.wrappedValue.selectedFilter = template.suggestedFilter
        binding.wrappedValue.captionStyle = template.suggestedCaptionStyle
        binding.wrappedValue.viralConfig.velocityStyle = template.suggestedVelocityStyle
        binding.wrappedValue.viralConfig.kineticCaptionStyle = template.suggestedKineticCaption
        if let track = MusicLibrary.suggestedTrackForTemplate(template) {
            binding.wrappedValue.selectedMusicTrack = track
        }

        // Re-run AI with template as context — AI refines the template choices
        // based on actual video content analysis
        Task {
            guard let video = appState.selectedVideo else { return }
            let asset = AVURLAsset(url: video.sourceURL)
            let timeRange = CMTimeRange(start: clip.trimStart, end: clip.trimEnd)

            let aiConfig = await AIEffectRecommendationService.shared.recommendEffects(
                for: asset,
                timeRange: timeRange,
                userPrompt: appState.userPrompt,
                template: template
            )

            await MainActor.run {
                guard let index = appState.generatedClips.firstIndex(where: { $0.id == clip.id }) else { return }
                appState.generatedClips[index].aiEffectConfig = aiConfig

                // AI recommendations override template defaults where AI has an opinion
                if let name = aiConfig.recommendedFilter,
                   let filter = VideoFilter.allCases.first(where: { $0.rawValue == name }) {
                    appState.generatedClips[index].selectedFilter = filter
                }
                if let name = aiConfig.recommendedCaptionStyle,
                   let style = CaptionStyle.allCases.first(where: { $0.rawValue == name }) {
                    appState.generatedClips[index].captionStyle = style
                }
                if let name = aiConfig.recommendedVelocityStyle,
                   let style = VelocityEditService.VelocityStyle.allCases.first(where: { $0.rawValue == name }) {
                    appState.generatedClips[index].viralConfig.velocityStyle = style
                }
                if let name = aiConfig.recommendedKineticCaption,
                   let style = KineticCaptionStyle.allCases.first(where: { $0.rawValue == name }) {
                    appState.generatedClips[index].viralConfig.kineticCaptionStyle = style
                }
                if let name = aiConfig.recommendedMusicMood,
                   let mood = TrackMood.allCases.first(where: { $0.rawValue == name }),
                   let track = MusicLibrary.tracksForMood(mood).first {
                    appState.generatedClips[index].selectedMusicTrack = track
                }

                // Premium effects
                var effects: [PremiumEffect] = []
                if let name = aiConfig.recommendedLUT,
                   let effect = PremiumEffectLibrary.effect(named: name) {
                    effects.append(effect)
                }
                if let name = aiConfig.recommendedParticle,
                   let effect = PremiumEffectLibrary.effect(named: name) {
                    effects.append(effect)
                }
                if let name = aiConfig.recommendedTransition,
                   let effect = PremiumEffectLibrary.effect(named: name) {
                    effects.append(effect)
                }
                if let overlayNames = aiConfig.recommendedOverlays {
                    for name in overlayNames {
                        if let effect = PremiumEffectLibrary.effect(named: name) {
                            effects.append(effect)
                        }
                    }
                }
                if !effects.isEmpty {
                    appState.generatedClips[index].selectedPremiumEffects = effects
                }

                if let name = aiConfig.recommendedGrade,
                   let grade = CinematicGrade.allCases.first(where: { $0.rawValue == name }) {
                    appState.generatedClips[index].cinematicGrade = grade
                }
            }
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
