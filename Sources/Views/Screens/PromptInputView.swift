import SwiftUI

struct PromptInputView: View {
    @Environment(AppState.self) private var appState
    @State private var thumbnailImage: UIImage?
    @FocusState private var isPromptFocused: Bool

    private let suggestions = [
        "Best moments",
        "Funny reactions",
        "Epic scenery",
        "Action highlights",
        "Cute pets",
        "Cooking wins"
    ]

    var body: some View {
        @Bindable var state = appState

        ZStack {
            Theme.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    // Video preview thumbnail
                    if let image = thumbnailImage {
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(height: 200)
                            .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
                            .overlay(
                                RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius)
                                    .stroke(Theme.surfaceLight, lineWidth: 1)
                            )
                            .overlay(alignment: .bottomTrailing) {
                                if let video = appState.selectedVideo {
                                    Text(video.formattedDuration)
                                        .font(Theme.caption)
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(.black.opacity(0.6))
                                        .clipShape(Capsule())
                                        .padding(12)
                                }
                            }
                    } else {
                        RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius)
                            .fill(Theme.surfaceColor)
                            .frame(height: 200)
                            .overlay {
                                ProgressView()
                                    .tint(.white)
                            }
                    }

                    // Prompt section
                    VStack(alignment: .leading, spacing: 12) {
                        Text("What should we look for?")
                            .font(Theme.title)
                            .foregroundStyle(.white)

                        Text("Describe the highlights you want, or skip for auto-detect")
                            .font(Theme.body)
                            .foregroundStyle(Theme.textSecondary)

                        TextField("e.g., hiking summit peak, funny cooking fails...", text: $state.userPrompt)
                            .font(Theme.body)
                            .foregroundStyle(.white)
                            .padding()
                            .background(Theme.surfaceColor)
                            .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.smallCornerRadius))
                            .overlay(
                                RoundedRectangle(cornerRadius: Constants.Layout.smallCornerRadius)
                                    .stroke(Theme.surfaceLight, lineWidth: 1)
                            )
                            .focused($isPromptFocused)
                    }

                    // Quick suggestions
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Quick picks")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.textTertiary)

                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 8) {
                            ForEach(suggestions, id: \.self) { suggestion in
                                SuggestionChip(
                                    text: suggestion,
                                    isSelected: appState.userPrompt == suggestion
                                ) {
                                    appState.userPrompt = suggestion
                                }
                            }
                        }
                    }

                    Spacer(minLength: 24)

                    // Action buttons
                    VStack(spacing: 12) {
                        PrimaryButton(title: "Find Highlights") {
                            isPromptFocused = false
                            appState.navigationPath.append(AppScreen.processing)
                        }

                        Button("Skip — Auto-detect") {
                            appState.userPrompt = ""
                            isPromptFocused = false
                            appState.navigationPath.append(AppScreen.processing)
                        }
                        .font(Theme.body)
                        .foregroundStyle(Theme.textSecondary)
                    }
                }
                .padding(Constants.Layout.padding)
            }
        }
        .navigationTitle("Describe Highlights")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadThumbnail() }
    }

    private func loadThumbnail() async {
        guard let video = appState.selectedVideo else { return }
        thumbnailImage = await ThumbnailService.shared.thumbnail(
            for: video.sourceURL,
            at: video.thumbnailTime,
            size: CGSize(width: 720, height: 400)
        )
    }
}
