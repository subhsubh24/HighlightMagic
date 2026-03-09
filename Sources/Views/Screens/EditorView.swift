import SwiftUI
import AVKit
import CoreMedia

struct EditorView: View {
    @Environment(AppState.self) private var appState
    let clipID: EditedClip.ID

    @State private var thumbnails: [UIImage] = []
    @State private var showMusicPicker = false
    @State private var showTemplatePicker = false
    @State private var showPremiumEffects = false
    @State private var seekTime: CMTime?

    private var clipIndex: Int? {
        appState.generatedClips.firstIndex(where: { $0.id == clipID })
    }

    private var clipBinding: Binding<EditedClip>? {
        guard clipIndex != nil else { return nil }
        return Binding(
            get: {
                guard let idx = appState.generatedClips.firstIndex(where: { $0.id == clipID }) else {
                    return appState.generatedClips[0]
                }
                return appState.generatedClips[idx]
            },
            set: { newValue in
                if let idx = appState.generatedClips.firstIndex(where: { $0.id == clipID }) {
                    appState.generatedClips[idx] = newValue
                }
            }
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

    private var trimStartBinding: Binding<CMTime> {
        Binding(
            get: { appState.generatedClips.first(where: { $0.id == clipID })?.trimStart ?? .zero },
            set: { newValue in
                if let index = appState.generatedClips.firstIndex(where: { $0.id == clipID }) {
                    appState.generatedClips[index].trimStart = newValue
                }
            }
        )
    }

    private var trimEndBinding: Binding<CMTime> {
        Binding(
            get: { appState.generatedClips.first(where: { $0.id == clipID })?.trimEnd ?? .zero },
            set: { newValue in
                if let index = appState.generatedClips.firstIndex(where: { $0.id == clipID }) {
                    appState.generatedClips[index].trimEnd = newValue
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

            if let clipBinding, let clip, let video = appState.selectedVideo {
                ScrollView {
                    VStack(spacing: 20) {
                        VideoPreviewPlayer(
                            videoURL: video.sourceURL,
                            trimStart: clip.trimStart,
                            trimEnd: clip.trimEnd
                        )

                        trimSection(clipBinding)
                        captionSection(clipBinding)
                        musicSection(clip)
                        aiAudioSection
                        aiProductionSection
                        viralEditSection(clipBinding)
                        filterSection(clipBinding)
                        premiumEffectsButton

                        PrimaryButton(title: "Export Clip", icon: "square.and.arrow.up") {
                            appState.navigationPath.append(AppScreen.export(clipID: clipID))
                        }
                        .padding(.top, 8)
                    }
                    .padding(Constants.Layout.padding)
                }
            } else {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 44))
                        .foregroundStyle(.orange)
                    Text("Clip not found")
                        .font(Theme.headline)
                        .foregroundStyle(.white)
                    Text("This clip may have been removed.")
                        .font(Theme.body)
                        .foregroundStyle(Theme.textSecondary)
                    Button {
                        appState.navigationPath.removeLast()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.left")
                            Text("Go Back")
                        }
                        .font(Theme.headline)
                        .foregroundStyle(Theme.accent)
                    }
                }
            }
        }
        .navigationTitle("Edit Clip")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showTemplatePicker = true } label: {
                    Image(systemName: "rectangle.stack.fill")
                        .foregroundStyle(Theme.accent)
                }
            }
        }
        .sheet(isPresented: $showMusicPicker) {
            MusicPickerSheet(selectedTrack: musicBinding, isProUser: appState.isProUser)
        }
        .sheet(isPresented: $showTemplatePicker) {
            TemplatePickerSheet(clipBinding: clipBinding)
        }
        .sheet(isPresented: $showPremiumEffects) {
            PremiumEffectsSheet(
                selectedEffects: Binding(
                    get: {
                        appState.generatedClips.first(where: { $0.id == clipID })?.selectedPremiumEffects ?? []
                    },
                    set: { newValue in
                        if let index = appState.generatedClips.firstIndex(where: { $0.id == clipID }) {
                            appState.generatedClips[index].selectedPremiumEffects = newValue
                        }
                    }
                )
            )
        }
        .task { await loadTimelineThumbnails() }
    }

    // MARK: - Sections

    private func trimSection(_ binding: Binding<EditedClip>) -> some View {
        EditorSection(title: "Trim", icon: "scissors") {
            VStack(spacing: 12) {
                VideoTrimSlider(
                    trimStart: trimStartBinding,
                    trimEnd: trimEndBinding,
                    segmentStart: binding.wrappedValue.segment.startTime,
                    segmentEnd: binding.wrappedValue.segment.endTime,
                    thumbnails: thumbnails
                ) { time in
                    seekTime = time
                }

                HStack {
                    Text(formatTime(CMTimeGetSeconds(binding.wrappedValue.trimStart)))
                        .font(Theme.caption)
                        .foregroundStyle(Theme.textTertiary)
                    Spacer()
                    Text("\(Int(binding.wrappedValue.duration))s")
                        .font(Theme.caption.bold())
                        .foregroundStyle(Theme.accent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Theme.accent.opacity(0.15))
                        .clipShape(Capsule())
                    Spacer()
                    Text(formatTime(CMTimeGetSeconds(binding.wrappedValue.trimEnd)))
                        .font(Theme.caption)
                        .foregroundStyle(Theme.textTertiary)
                }

                if binding.wrappedValue.duration > Constants.maxClipDuration {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption2)
                        Text("Max \(Int(Constants.maxClipDuration))s — trim to shorten")
                            .font(.caption2)
                    }
                    .foregroundStyle(.orange)
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

                HStack(spacing: 8) {
                    ForEach(CaptionStyle.allCases, id: \.self) { style in
                        CaptionStyleButton(
                            style: style,
                            isSelected: binding.wrappedValue.captionStyle == style
                        ) {
                            HapticFeedback.selection()
                            binding.wrappedValue.captionStyle = style
                        }
                    }
                }
            }
        }
    }

    private func musicSection(_ clip: EditedClip) -> some View {
        EditorSection(title: "Music", icon: "music.note") {
            Button { showMusicPicker = true } label: {
                HStack {
                    Image(systemName: clip.selectedMusicTrack != nil ? "music.note" : "plus.circle")
                        .foregroundStyle(Theme.accent)
                    Text(clip.selectedMusicTrack?.name ?? "Add Music")
                        .font(Theme.body)
                        .foregroundStyle(.white)

                    if let track = clip.selectedMusicTrack {
                        Text(track.mood.rawValue)
                            .font(.caption2)
                            .foregroundStyle(Theme.accent)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Theme.accent.opacity(0.15))
                            .clipShape(Capsule())
                    }

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

    /// AI Audio controls — toggles for AI music, voiceover, and SFX generation.
    /// Matches web platform's AI audio features.
    @ViewBuilder
    private var aiAudioSection: some View {
        EditorSection(title: "AI Audio", icon: "waveform.and.mic") {
            VStack(spacing: 14) {
                // AI Music toggle
                HStack {
                    Image(systemName: "music.note.list")
                        .foregroundStyle(Theme.accent)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("AI Music")
                            .font(Theme.body)
                            .foregroundStyle(.white)
                        Text("Generate custom background music")
                            .font(.caption2)
                            .foregroundStyle(Theme.textTertiary)
                    }
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { appState.aiMusicEnabled },
                        set: { appState.aiMusicEnabled = $0 }
                    ))
                        .labelsHidden()
                        .tint(Theme.accent)
                }

                Divider().overlay(Theme.surfaceLight)

                // AI Voiceover toggle
                HStack {
                    Image(systemName: "mic.fill")
                        .foregroundStyle(Theme.accent)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("AI Voiceover")
                            .font(Theme.body)
                            .foregroundStyle(.white)
                        Text("Auto-narrate each clip")
                            .font(.caption2)
                            .foregroundStyle(Theme.textTertiary)
                    }
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { appState.voiceoverEnabled },
                        set: { appState.voiceoverEnabled = $0 }
                    ))
                        .labelsHidden()
                        .tint(Theme.accent)
                }

                Divider().overlay(Theme.surfaceLight)

                // AI SFX toggle
                HStack {
                    Image(systemName: "speaker.wave.3.fill")
                        .foregroundStyle(Theme.accent)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Sound Effects")
                            .font(Theme.body)
                            .foregroundStyle(.white)
                        Text("Add transition whooshes & impacts")
                            .font(.caption2)
                            .foregroundStyle(Theme.textTertiary)
                    }
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { appState.sfxEnabled },
                        set: { appState.sfxEnabled = $0 }
                    ))
                        .labelsHidden()
                        .tint(Theme.accent)
                }
            }
        }
    }

    /// AI Production controls — intro/outro cards, voice cloning, stem separation, style transfer.
    /// Matches web platform's AI production pipeline features.
    @ViewBuilder
    private var aiProductionSection: some View {
        EditorSection(title: "AI Production", icon: "film.stack") {
            VStack(spacing: 14) {
                // Intro Card toggle
                aiToggleRow(
                    icon: "play.rectangle.fill",
                    title: "AI Intro Card",
                    subtitle: "Generate a text-to-video intro",
                    isOn: Binding(
                        get: { appState.introCardEnabled },
                        set: { appState.introCardEnabled = $0 }
                    )
                )

                if appState.introCardEnabled, let introCard = appState.introCard {
                    HStack(spacing: 8) {
                        statusBadge(for: introCard.status)
                    }
                    .padding(.leading, 30)
                }

                Divider().overlay(Theme.surfaceLight)

                // Outro Card toggle
                aiToggleRow(
                    icon: "stop.circle.fill",
                    title: "AI Outro Card",
                    subtitle: "Generate a text-to-video outro",
                    isOn: Binding(
                        get: { appState.outroCardEnabled },
                        set: { appState.outroCardEnabled = $0 }
                    )
                )

                if appState.outroCardEnabled, let outroCard = appState.outroCard {
                    HStack(spacing: 8) {
                        statusBadge(for: outroCard.status)
                    }
                    .padding(.leading, 30)
                }

                Divider().overlay(Theme.surfaceLight)

                // Voice Clone toggle
                aiToggleRow(
                    icon: "person.wave.2.fill",
                    title: "Voice Clone",
                    subtitle: "Clone your voice for narration",
                    isOn: Binding(
                        get: { appState.voiceCloneEnabled },
                        set: { appState.voiceCloneEnabled = $0 }
                    )
                )

                if appState.voiceCloneEnabled {
                    HStack(spacing: 8) {
                        statusBadge(for: appState.voiceCloneStatus)
                    }
                    .padding(.leading, 30)
                }

                Divider().overlay(Theme.surfaceLight)

                // Stem Separation toggle
                aiToggleRow(
                    icon: "waveform.path",
                    title: "Stem Separation",
                    subtitle: "Isolate instrumental from vocals",
                    isOn: Binding(
                        get: { appState.stemSeparationEnabled },
                        set: { appState.stemSeparationEnabled = $0 }
                    )
                )

                if appState.stemSeparationEnabled {
                    HStack(spacing: 8) {
                        statusBadge(for: appState.stemSeparationStatus)
                    }
                    .padding(.leading, 30)
                }

                Divider().overlay(Theme.surfaceLight)

                // Style Transfer prompt
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "paintpalette.fill")
                            .foregroundStyle(Theme.accent)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Style Transfer")
                                .font(Theme.body)
                                .foregroundStyle(.white)
                            Text("Apply a visual style to the whole clip")
                                .font(.caption2)
                                .foregroundStyle(Theme.textTertiary)
                        }
                    }
                    TextField("e.g. anime, watercolor, film noir...", text: Binding(
                        get: { appState.styleTransferPrompt },
                        set: { appState.styleTransferPrompt = $0 }
                    ))
                        .font(Theme.body)
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(Theme.surfaceLight)
                        .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.smallCornerRadius))
                }
            }
        }
    }

    private func aiToggleRow(icon: String, title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(Theme.accent)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.body)
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(Theme.textTertiary)
            }
            Spacer()
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(Theme.accent)
        }
    }

    @ViewBuilder
    private func statusBadge(for status: GenerationStatus) -> some View {
        switch status {
        case .idle:
            Text("Ready")
                .font(.caption2)
                .foregroundStyle(Theme.textTertiary)
        case .generating:
            HStack(spacing: 4) {
                ProgressView()
                    .scaleEffect(0.6)
                Text("Generating...")
                    .font(.caption2)
                    .foregroundStyle(Theme.accent)
            }
        case .done:
            HStack(spacing: 4) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.caption2)
                    .foregroundStyle(.green)
                Text("Done")
                    .font(.caption2)
                    .foregroundStyle(.green)
            }
        case .failed:
            HStack(spacing: 4) {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption2)
                    .foregroundStyle(.red)
                Text("Failed")
                    .font(.caption2)
                    .foregroundStyle(.red)
            }
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
                            HapticFeedback.selection()
                            binding.wrappedValue.selectedFilter = filter
                        }
                    }
                }
            }
        }
    }

    private func viralEditSection(_ binding: Binding<EditedClip>) -> some View {
        EditorSection(title: "Viral Edit", icon: "bolt.heart.fill") {
            VStack(spacing: 14) {
                // Beat Sync toggle
                HStack {
                    Image(systemName: "waveform.badge.music")
                        .foregroundStyle(Theme.accent)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Beat Sync")
                            .font(Theme.body)
                            .foregroundStyle(.white)
                        Text("Align cuts to music beats")
                            .font(.caption2)
                            .foregroundStyle(Theme.textTertiary)
                    }
                    Spacer()
                    Toggle("", isOn: binding.viralConfig.beatSyncEnabled)
                        .labelsHidden()
                        .tint(Theme.accent)
                }

                Divider().overlay(Theme.surfaceLight)

                // Velocity Style picker
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "gauge.with.dots.needle.67percent")
                            .foregroundStyle(Theme.accent)
                            .frame(width: 24)
                        Text("Velocity Style")
                            .font(Theme.body)
                            .foregroundStyle(.white)
                    }

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(VelocityEditService.VelocityStyle.allCases, id: \.self) { style in
                                VelocityStyleButton(
                                    style: style,
                                    isSelected: binding.wrappedValue.viralConfig.velocityStyle == style
                                ) {
                                    HapticFeedback.selection()
                                    binding.wrappedValue.viralConfig.velocityStyle = style
                                }
                            }
                        }
                    }
                }

                Divider().overlay(Theme.surfaceLight)

                // Seamless Loop toggle
                HStack {
                    Image(systemName: "repeat")
                        .foregroundStyle(Theme.accent)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Seamless Loop")
                            .font(Theme.body)
                            .foregroundStyle(.white)
                        Text("Smooth restart for higher watch time")
                            .font(.caption2)
                            .foregroundStyle(Theme.textTertiary)
                    }
                    Spacer()
                    Toggle("", isOn: binding.viralConfig.seamlessLoopEnabled)
                        .labelsHidden()
                        .tint(Theme.accent)
                }

                Divider().overlay(Theme.surfaceLight)

                // Kinetic Caption Style
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "textformat.abc.dottedunderline")
                            .foregroundStyle(Theme.accent)
                            .frame(width: 24)
                        Text("Caption Animation")
                            .font(Theme.body)
                            .foregroundStyle(.white)
                    }

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(KineticCaptionStyle.allCases, id: \.self) { style in
                                KineticStyleButton(
                                    style: style,
                                    isSelected: binding.wrappedValue.viralConfig.kineticCaptionStyle == style
                                ) {
                                    HapticFeedback.selection()
                                    binding.wrappedValue.viralConfig.kineticCaptionStyle = style
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var premiumEffectsButton: some View {
        Button {
            if appState.isProUser {
                showPremiumEffects = true
            } else {
                appState.navigationPath.append(AppScreen.paywall)
            }
        } label: {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(.yellow)
                Text("Premium Effects")
                    .font(Theme.headline)
                    .foregroundStyle(.white)
                if let clip, !clip.selectedPremiumEffects.isEmpty {
                    Text("\(clip.selectedPremiumEffects.count)")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.accent)
                        .clipShape(Capsule())
                }
                Spacer()
                if !appState.isProUser {
                    Text("PRO")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.primaryGradient)
                        .clipShape(Capsule())
                }
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(Theme.textTertiary)
            }
            .padding(14)
            .background(Theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius)
                    .stroke(
                        LinearGradient(
                            colors: [.yellow.opacity(0.3), .orange.opacity(0.3)],
                            startPoint: .leading,
                            endPoint: .trailing
                        ),
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private func loadTimelineThumbnails() async {
        guard let video = appState.selectedVideo else { return }
        thumbnails = await ThumbnailService.shared.timelineThumbnails(
            for: video.sourceURL,
            count: 10,
            size: CGSize(width: 60, height: 56)
        )
    }

    private func formatTime(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Reusable Editor Subcomponents

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
        case .warmGlow: Color.yellow.opacity(0.4)
        case .tealOrange: Color.teal.opacity(0.4)
        case .moody: Color(hex: "374151").opacity(0.6)
        case .vintageFilm: Color.brown.opacity(0.4)
        case .cleanAiry: Color(hex: "BAE6FD").opacity(0.3)
        }
    }
}

struct VelocityStyleButton: View {
    let style: VelocityEditService.VelocityStyle
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: style.icon)
                    .font(.body)
                    .foregroundStyle(isSelected ? .white : Theme.textSecondary)
                    .frame(width: 40, height: 40)
                    .background(isSelected ? AnyShapeStyle(Theme.primaryGradient) : AnyShapeStyle(Theme.surfaceLight))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                Text(style.rawValue)
                    .font(.caption2)
                    .foregroundStyle(isSelected ? Theme.accent : Theme.textTertiary)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }
}

struct KineticStyleButton: View {
    let style: KineticCaptionStyle
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: style.icon)
                    .font(.caption2)
                Text(style.rawValue)
                    .font(.caption.bold())
            }
            .foregroundStyle(isSelected ? .white : Theme.textSecondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? AnyShapeStyle(Theme.primaryGradient) : AnyShapeStyle(Theme.surfaceLight))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
