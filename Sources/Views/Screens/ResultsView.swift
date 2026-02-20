import SwiftUI

struct ResultsView: View {
    @Environment(AppState.self) private var appState
    @State private var thumbnails: [UUID: UIImage] = [:]

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

                        Text("Tap to edit, then export your favorites")
                            .font(Theme.body)
                            .foregroundStyle(Theme.textSecondary)
                    }
                    .padding(.top, 8)

                    // Clip cards
                    ForEach(appState.generatedClips) { clip in
                        ClipCard(
                            clip: clip,
                            thumbnail: thumbnails[clip.id]
                        ) {
                            appState.navigationPath.append(AppScreen.editor(clipID: clip.id))
                        }
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
