import SwiftUI

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
                    // Header
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(.green)

                        Text("Found \(appState.generatedClips.count) Highlights")
                            .font(Theme.title)
                            .foregroundStyle(.white)

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
                }
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
                            withAnimation(.spring(duration: 0.3)) {
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

    private func applyTemplateToAllClips(_ template: HighlightTemplate) {
        for i in appState.generatedClips.indices {
            appState.generatedClips[i].selectedFilter = template.suggestedFilter
            appState.generatedClips[i].captionStyle = template.suggestedCaptionStyle
            if let track = MusicLibrary.suggestedTrackForTemplate(template) {
                appState.generatedClips[i].selectedMusicTrack = track
            }
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
