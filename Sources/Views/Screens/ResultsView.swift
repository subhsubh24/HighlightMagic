import SwiftUI
import AVFoundation

struct ResultsView: View {
    @Environment(AppState.self) private var appState
    @State private var thumbnails: [UUID: UIImage] = [:]
    @State private var selectedTemplate: HighlightTemplate?

    var body: some View {
        ZStack {
            Theme.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    if appState.generatedClips.isEmpty {
                        // Empty state
                        VStack(spacing: 16) {
                            Image(systemName: "video.slash")
                                .font(.system(size: 56))
                                .foregroundStyle(Theme.textTertiary)

                            Text("No Highlights Found")
                                .font(Theme.title)
                                .foregroundStyle(.white)

                            Text("Try a different video or adjust your prompt to help the AI find the best moments.")
                                .font(Theme.body)
                                .foregroundStyle(Theme.textSecondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 24)

                            PrimaryButton(title: "Try Again", icon: "arrow.counterclockwise") {
                                appState.clearSession()
                                appState.navigationPath = NavigationPath()
                            }
                            .padding(.top, 8)
                        }
                        .padding(.top, 60)
                    } else {
                        // Header
                        VStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 44))
                                .foregroundStyle(.green)

                            Text("Found \(appState.generatedClips.count) Highlights")
                                .font(Theme.title)
                                .foregroundStyle(.white)
                                .contentTransition(.numericText())

                            Text("Apply a template or tap clips to edit individually")
                                .font(Theme.body)
                                .foregroundStyle(Theme.textSecondary)
                                .multilineTextAlignment(.center)
                        }
                        .padding(.top, 8)
                        .accessibilityElement(children: .combine)

                        // Template carousel
                        templateCarousel

                        // Clip cards
                        ForEach(appState.generatedClips) { clip in
                            ClipCard(
                                clip: clip,
                                thumbnail: thumbnails[clip.id]
                            ) {
                                appState.navigationPath.append(AppScreen.editor(clipID: clip.id))
                            }
                            .accessibilityLabel("Highlight: \(clip.segment.label), \(Int(clip.duration)) seconds")
                            .accessibilityHint("Double tap to edit this clip")
                        }

                        // Start over
                        Button {
                            appState.clearSession()
                            appState.navigationPath = NavigationPath()
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "arrow.counterclockwise")
                                Text("Start Over")
                            }
                            .font(Theme.body)
                            .foregroundStyle(Theme.textSecondary)
                            .padding(.top, 16)
                        }
                    }}
                .padding(Constants.Layout.padding)
            }
        }
        .navigationTitle("Your Highlights")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .task { await loadThumbnails() }
    }

    // MARK: - Template Carousel

    @ViewBuilder
    private var templateCarousel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Quick Style")
                .font(Theme.headline)
                .foregroundStyle(.white)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(TemplateLibrary.templates) { template in
                        MiniTemplateCard(
                            template: template,
                            isSelected: selectedTemplate?.id == template.id
                        ) {
                            HapticFeedback.selection()
                            withAnimation(Theme.springAnimation) {
                                selectedTemplate = template
                                applyTemplateToAllClips(template)
                            }
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(Theme.surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
    }

    /// Re-runs AI effect recommendations with the template as context,
    /// merging template preferences with per-clip AI analysis.
    private func applyTemplateToAllClips(_ template: HighlightTemplate) {
        Task {
            guard let video = appState.selectedVideo else { return }
            let asset = AVURLAsset(url: video.sourceURL)

            // Snapshot clip IDs to iterate — the array may be mutated during awaits.
            let clipSnapshots = appState.generatedClips.map { (id: $0.id, trimStart: $0.trimStart, trimEnd: $0.trimEnd) }

            for snapshot in clipSnapshots {
                let timeRange = CMTimeRange(start: snapshot.trimStart, end: snapshot.trimEnd)

                let aiConfig = await AIEffectRecommendationService.shared.recommendEffects(
                    for: asset,
                    timeRange: timeRange,
                    userPrompt: appState.userPrompt,
                    template: template
                )

                await MainActor.run {
                    // Find current index by ID to avoid stale index crash
                    guard let index = appState.generatedClips.firstIndex(where: { $0.id == snapshot.id }) else { return }
                    applyAIConfig(aiConfig, to: index, fallbackTemplate: template)
                }
            }
        }
    }

    @MainActor
    private func applyAIConfig(
        _ aiConfig: CustomEffectConfig,
        to index: Int,
        fallbackTemplate template: HighlightTemplate
    ) {
        appState.generatedClips[index].aiEffectConfig = aiConfig

        // Filter
        if let name = aiConfig.recommendedFilter,
           let filter = VideoFilter.allCases.first(where: { $0.rawValue == name }) {
            appState.generatedClips[index].selectedFilter = filter
        } else {
            appState.generatedClips[index].selectedFilter = template.suggestedFilter
        }

        // Caption style
        if let name = aiConfig.recommendedCaptionStyle,
           let style = CaptionStyle.allCases.first(where: { $0.rawValue == name }) {
            appState.generatedClips[index].captionStyle = style
        } else {
            appState.generatedClips[index].captionStyle = template.suggestedCaptionStyle
        }

        // Velocity
        if let name = aiConfig.recommendedVelocityStyle,
           let style = VelocityEditService.VelocityStyle.allCases.first(where: { $0.rawValue == name }) {
            appState.generatedClips[index].viralConfig.velocityStyle = style
        } else {
            appState.generatedClips[index].viralConfig.velocityStyle = template.suggestedVelocityStyle
        }

        // Kinetic caption
        if let name = aiConfig.recommendedKineticCaption,
           let style = KineticCaptionStyle.allCases.first(where: { $0.rawValue == name }) {
            appState.generatedClips[index].viralConfig.kineticCaptionStyle = style
        } else {
            appState.generatedClips[index].viralConfig.kineticCaptionStyle = template.suggestedKineticCaption
        }

        // Music
        if let name = aiConfig.recommendedMusicMood,
           let mood = TrackMood.allCases.first(where: { $0.rawValue == name }),
           let track = MusicLibrary.tracksForMood(mood).first {
            appState.generatedClips[index].selectedMusicTrack = track
        } else if let track = MusicLibrary.suggestedTrackForTemplate(template) {
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

        // Cinematic grade
        if let name = aiConfig.recommendedGrade,
           let grade = CinematicGrade.allCases.first(where: { $0.rawValue == name }) {
            appState.generatedClips[index].cinematicGrade = grade
        }
    }

    private func loadThumbnails() async {
        guard let video = appState.selectedVideo else { return }
        for clip in appState.generatedClips {
            let image = await ThumbnailService.shared.thumbnail(
                for: video.sourceURL,
                at: clip.segment.startTime,
                size: CGSize(width: 540, height: 960)
            )
            if let image {
                thumbnails[clip.id] = image
            }
        }
    }
}

struct MiniTemplateCard: View {
    let template: HighlightTemplate
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(hex: template.colorAccent),
                                    Color(hex: template.colorAccent).opacity(0.5)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 48, height: 48)
                        .overlay(
                            Circle()
                                .stroke(isSelected ? .white : .clear, lineWidth: 2)
                        )

                    Image(systemName: template.icon)
                        .font(.body)
                        .foregroundStyle(.white)
                }

                Text(template.name)
                    .font(.caption2)
                    .foregroundStyle(isSelected ? .white : Theme.textSecondary)
                    .lineLimit(1)
            }
            .frame(width: 64)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Template: \(template.name)")
    }
}
