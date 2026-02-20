import SwiftUI
import AVKit
import CoreMedia

struct EditorView: View {
    @Environment(AppState.self) private var appState
    let clipID: EditedClip.ID

    @State private var player: AVPlayer?
    @State private var thumbnails: [UIImage] = []
    @State private var showMusicPicker = false
    @State private var showFilterPicker = false

    private var clipIndex: Int? {
        appState.generatedClips.firstIndex(where: { $0.id == clipID })
    }

    private var clipBinding: Binding<EditedClip>? {
        guard let index = clipIndex else { return nil }
        return Binding(
            get: { appState.generatedClips[index] },
            set: { appState.generatedClips[index] = $0 }
        )
    }

    private var musicBinding: Binding<MusicTrack?> {
        Binding(
            get: { appState.generatedClips.first(where: { $0.id == clipID })?.selectedMusicTrack },
            set: { newValue in
                if let index = appState.generatedClips.firstIndex(where: { $0.id == clipID }) {
                    appState.generatedClips[index].selectedMusicTrack = newValue
                }
            }
        )
    }

    private var clip: EditedClip? {
        appState.generatedClips.first { $0.id == clipID }
    }

    var body: some View {
        ZStack {
            Theme.backgroundGradient
                .ignoresSafeArea()

            if let clipBinding, let clip {
                ScrollView {
                    VStack(spacing: 20) {
                        // Video preview
                        videoPreviewSection

                        // Trim controls
                        trimSection(clipBinding)

                        // Caption
                        captionSection(clipBinding)

                        // Music
                        musicSection(clip)

                        // Filters
                        filterSection(clipBinding)

                        // Export button
                        PrimaryButton(title: "Export Clip", icon: "square.and.arrow.up") {
                            appState.navigationPath.append(AppScreen.export(clipID: clipID))
                        }
                        .padding(.top, 8)
                    }
                    .padding(Constants.Layout.padding)
                }
            } else {
                Text("Clip not found")
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .navigationTitle("Edit Clip")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showMusicPicker) {
            MusicPickerSheet(selectedTrack: musicBinding)
        }
        .task { await setupPlayer() }
        .task { await loadTimelineThumbnails() }
    }

    // MARK: - Sections

    @ViewBuilder
    private var videoPreviewSection: some View {
        if let player {
            VideoPlayer(player: player)
                .frame(height: 420)
                .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius)
                        .stroke(Theme.surfaceLight, lineWidth: 1)
                )
        } else {
            RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius)
                .fill(Theme.surfaceColor)
                .frame(height: 420)
                .overlay { ProgressView().tint(.white) }
        }
    }

    private func trimSection(_ binding: Binding<EditedClip>) -> some View {
        EditorSection(title: "Trim", icon: "scissors") {
            VStack(spacing: 12) {
                // Timeline thumbnails
                if !thumbnails.isEmpty {
                    HStack(spacing: 2) {
                        ForEach(thumbnails.indices, id: \.self) { index in
                            Image(uiImage: thumbnails[index])
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(height: 44)
                                .clipped()
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }

                HStack {
                    Text(formatTime(CMTimeGetSeconds(binding.wrappedValue.trimStart)))
                        .font(Theme.caption)
                        .foregroundStyle(Theme.textTertiary)
                    Spacer()
                    Text("\(Int(binding.wrappedValue.duration))s clip")
                        .font(Theme.caption)
                        .foregroundStyle(Theme.accent)
                    Spacer()
                    Text(formatTime(CMTimeGetSeconds(binding.wrappedValue.trimEnd)))
                        .font(Theme.caption)
                        .foregroundStyle(Theme.textTertiary)
                }
            }
        }
    }

    private func captionSection(_ binding: Binding<EditedClip>) -> some View {
        EditorSection(title: "Caption", icon: "textformat") {
            VStack(spacing: 12) {
                TextField("Add a caption...", text: binding.captionText)
                    .font(Theme.body)
                    .foregroundStyle(.white)
                    .padding(12)
                    .background(Theme.surfaceLight)
                    .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.smallCornerRadius))

                // Caption style picker
                HStack(spacing: 8) {
                    ForEach(CaptionStyle.allCases, id: \.self) { style in
                        CaptionStyleButton(
                            style: style,
                            isSelected: binding.wrappedValue.captionStyle == style
                        ) {
                            binding.wrappedValue.captionStyle = style
                        }
                    }
                }
            }
        }
    }

    private func musicSection(_ clip: EditedClip) -> some View {
        EditorSection(title: "Music", icon: "music.note") {
            Button {
                showMusicPicker = true
            } label: {
                HStack {
                    Image(systemName: clip.selectedMusicTrack != nil ? "music.note" : "plus.circle")
                        .foregroundStyle(Theme.accent)
                    Text(clip.selectedMusicTrack?.name ?? "Add Music")
                        .font(Theme.body)
                        .foregroundStyle(.white)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(Theme.textTertiary)
                }
                .padding(12)
                .background(Theme.surfaceLight)
                .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.smallCornerRadius))
            }
            .buttonStyle(.plain)
        }
    }

    private func filterSection(_ binding: Binding<EditedClip>) -> some View {
        EditorSection(title: "Filter", icon: "camera.filters") {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(VideoFilter.allCases, id: \.self) { filter in
                        FilterButton(
                            filter: filter,
                            isSelected: binding.wrappedValue.selectedFilter == filter
                        ) {
                            binding.wrappedValue.selectedFilter = filter
                        }
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private func setupPlayer() async {
        guard let video = appState.selectedVideo, let clip else { return }
        let playerItem = AVPlayerItem(url: video.sourceURL)
        let newPlayer = AVPlayer(playerItem: playerItem)
        await newPlayer.seek(to: clip.trimStart, toleranceBefore: .zero, toleranceAfter: .zero)
        player = newPlayer
    }

    private func loadTimelineThumbnails() async {
        guard let video = appState.selectedVideo else { return }
        thumbnails = await ThumbnailService.shared.timelineThumbnails(
            for: video.sourceURL,
            count: 8,
            size: CGSize(width: 60, height: 44)
        )
    }

    private func formatTime(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Editor Subcomponents

struct EditorSection<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.caption)
                    .foregroundStyle(Theme.accent)
                Text(title)
                    .font(Theme.headline)
                    .foregroundStyle(.white)
            }

            content
        }
        .padding(14)
        .background(Theme.surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
    }
}

struct CaptionStyleButton: View {
    let style: CaptionStyle
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(style.rawValue)
                .font(.caption.bold())
                .foregroundStyle(isSelected ? .white : Theme.textSecondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(isSelected ? AnyShapeStyle(Theme.primaryGradient) : AnyShapeStyle(Theme.surfaceLight))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct FilterButton: View {
    let filter: VideoFilter
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 8)
                    .fill(filterPreviewColor)
                    .frame(width: 56, height: 56)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(isSelected ? Theme.accent : .clear, lineWidth: 2)
                    )

                Text(filter.rawValue)
                    .font(.caption2)
                    .foregroundStyle(isSelected ? Theme.accent : Theme.textSecondary)
            }
        }
        .buttonStyle(.plain)
    }

    private var filterPreviewColor: Color {
        switch filter {
        case .none: Color.gray.opacity(0.3)
        case .vibrant: Color.purple.opacity(0.5)
        case .warm: Color.orange.opacity(0.4)
        case .cool: Color.blue.opacity(0.4)
        case .noir: Color.gray.opacity(0.6)
        case .fade: Color.white.opacity(0.2)
        }
    }
}
