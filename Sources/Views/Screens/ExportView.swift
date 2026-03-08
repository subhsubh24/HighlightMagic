import SwiftUI
import UIKit

struct ExportView: View {
    @Environment(AppState.self) private var appState
    let clipID: EditedClip.ID

    @State private var exportState: ExportState = .idle
    @State private var exportProgress: Double = 0
    @State private var exportedURL: URL?
    @State private var showShareSheet = false
    @State private var showPaywall = false
    @State private var showConfetti = false
    @State private var addWatermark = true

    private var clip: EditedClip? {
        appState.generatedClips.first { $0.id == clipID }
    }

    private var exportPhaseText: String {
        switch exportProgress {
        case 0..<0.08: "Detecting beats..."
        case 0.08..<0.12: "Building velocity curves..."
        case 0.12..<0.22: "Composing video timeline..."
        case 0.22..<0.30: "Mixing audio tracks..."
        case 0.30..<0.35: "Creating seamless loop..."
        case 0.35..<0.60: "Applying filters & effects..."
        case 0.60..<0.65: "Adding overlays & captions..."
        default: "Rendering final export..."
        }
    }

    var body: some View {
        ZStack {
            Theme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                switch exportState {
                case .idle:
                    idleContent
                case .exporting:
                    exportingContent
                case .completed:
                    completedContent
                case .failed(let error):
                    failedContent(error)
                }

                Spacer()
            }
            .padding(Constants.Layout.padding)

            // Confetti overlay
            if showConfetti {
                ConfettiView()
                    .ignoresSafeArea()
            }
        }
        .navigationTitle("Export")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showShareSheet) {
            if let url = exportedURL {
                ShareSheet(items: [url])
            }
        }
        .sheet(isPresented: $showPaywall) {
            PaywallView()
        }
        .onAppear {
            // Pro users get watermark off by default; free users always get it
            if appState.isProUser {
                addWatermark = false
            }
        }
    }

    // MARK: - State Views

    @ViewBuilder
    private var idleContent: some View {
        VStack(spacing: 20) {
            Image(systemName: "square.and.arrow.up.circle")
                .font(.system(size: 64))
                .foregroundStyle(Theme.primaryGradient)

            Text("Ready to Export")
                .font(Theme.title)
                .foregroundStyle(.white)

            if let clip {
                VStack(spacing: 6) {
                    InfoRow(label: "Duration", value: "\(Int(clip.duration))s")
                    InfoRow(label: "Format", value: "MP4 \u{2022} 1080\u{00D7}1920")
                    InfoRow(label: "Filter", value: clip.selectedFilter.rawValue)
                    if let music = clip.selectedMusicTrack {
                        InfoRow(label: "Music", value: "\(music.name) (\(music.bpm) BPM)")
                    }

                    // Viral edit features summary
                    if clip.viralConfig.beatSyncEnabled {
                        InfoRow(label: "Beat Sync", value: "On")
                    }
                    if clip.viralConfig.velocityStyle != .none {
                        InfoRow(label: "Velocity", value: clip.viralConfig.velocityStyle.rawValue)
                    }
                    if clip.viralConfig.seamlessLoopEnabled {
                        InfoRow(label: "Loop", value: "Seamless")
                    }
                    if clip.viralConfig.kineticCaptionStyle != .none {
                        InfoRow(label: "Caption FX", value: clip.viralConfig.kineticCaptionStyle.rawValue)
                    }

                    // Premium effects summary
                    if !clip.selectedPremiumEffects.isEmpty {
                        let effectNames = clip.selectedPremiumEffects.map(\.name).joined(separator: ", ")
                        InfoRow(label: "Effects", value: effectNames)
                    }
                    if clip.cinematicGrade != .none {
                        InfoRow(label: "Grade", value: clip.cinematicGrade.rawValue)
                    }

                    // AI production features
                    if clip.aiMusicData != nil {
                        InfoRow(label: "AI Music", value: "Generated")
                    }
                    if clip.voiceoverData != nil {
                        InfoRow(label: "Voiceover", value: "Generated")
                    }
                    if clip.sfxData != nil {
                        InfoRow(label: "SFX", value: "Generated")
                    }
                    if clip.introVideoURL != nil {
                        InfoRow(label: "Intro Card", value: "AI Generated")
                    }
                    if clip.outroVideoURL != nil {
                        InfoRow(label: "Outro Card", value: "AI Generated")
                    }
                    if clip.styleTransferURL != nil {
                        InfoRow(label: "Style Transfer", value: "Applied")
                    }

                    // Watermark toggle
                    if appState.isProUser {
                        HStack {
                            Text("Watermark")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.textTertiary)
                            Spacer()
                            Toggle("", isOn: $addWatermark)
                                .labelsHidden()
                                .tint(Theme.accent)
                        }
                    } else {
                        InfoRow(label: "Watermark", value: "Included (Free tier)")
                    }
                }
                .padding()
                .glassCard()
            }

            PrimaryButton(title: "Export Now", icon: "arrow.down.circle") {
                Task { await startExport() }
            }
        }
    }

    @ViewBuilder
    private var exportingContent: some View {
        VStack(spacing: 24) {
            ProgressView(value: exportProgress)
                .tint(Theme.accent)
                .scaleEffect(y: 2.5)
                .padding(.horizontal, 32)

            Text("Exporting... \(Int(exportProgress * 100))%")
                .font(Theme.headline)
                .foregroundStyle(.white)
                .contentTransition(.numericText())

            Text(exportPhaseText)
                .font(Theme.body)
                .foregroundStyle(Theme.textSecondary)
                .contentTransition(.interpolate)
                .animation(.easeInOut(duration: 0.3), value: exportPhaseText)
        }
    }

    @ViewBuilder
    private var completedContent: some View {
        VStack(spacing: 24) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.green)
                .transition(.scale.combined(with: .opacity))

            Text("Export Complete!")
                .font(Theme.title)
                .foregroundStyle(.white)

            Text("Your highlight is ready to share")
                .font(Theme.body)
                .foregroundStyle(Theme.textSecondary)

            VStack(spacing: 12) {
                PrimaryButton(title: "Share", icon: "square.and.arrow.up") {
                    Analytics.exportShared()
                    showShareSheet = true
                }

                Button {
                    appState.clearSession()
                    appState.navigationPath = NavigationPath()
                } label: {
                    Text("Done")
                        .font(Theme.headline)
                        .foregroundStyle(Theme.textSecondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                }
                .buttonStyle(ScaleButtonStyle())

                Text("Made with Highlight Magic")
                    .font(.caption2)
                    .foregroundStyle(Theme.textTertiary)
                    .padding(.top, 4)
            }
        }
    }

    private func failedContent(_ error: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.circle")
                .font(.system(size: 56))
                .foregroundStyle(.red)

            Text("Export Failed")
                .font(Theme.title)
                .foregroundStyle(.white)

            Text(error)
                .font(Theme.body)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)

            PrimaryButton(title: "Try Again") {
                Task { await startExport() }
            }
        }
    }

    // MARK: - Export Logic

    private func startExport() async {
        // Check free tier limits
        if !appState.isProUser && !appState.canExportFree {
            showPaywall = true
            return
        }

        guard let clip, let video = appState.selectedVideo else {
            exportState = .failed("Could not load clip or video. Please go back and try again.")
            HapticFeedback.error()
            return
        }

        exportState = .exporting
        exportProgress = 0
        showConfetti = false
        let exportStartTime = Date.now

        // Pro users can toggle watermark; free users always get watermark
        let shouldWatermark = appState.isProUser ? addWatermark : true

        let config = ExportService.ExportConfig(
            sourceURL: video.sourceURL,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd,
            filter: clip.selectedFilter,
            captionText: clip.captionText,
            captionStyle: clip.captionStyle,
            musicTrack: clip.selectedMusicTrack,
            addWatermark: shouldWatermark,
            outputSize: ExportService.ExportConfig.defaultSize,
            viralConfig: clip.viralConfig,
            cinematicGrade: clip.cinematicGrade,
            premiumEffects: clip.selectedPremiumEffects,
            aiEffectConfig: clip.aiEffectConfig,
            aiMusicData: clip.aiMusicData,
            voiceoverData: clip.voiceoverData,
            sfxData: clip.sfxData,
            introVideoURL: clip.introVideoURL,
            outroVideoURL: clip.outroVideoURL,
            styleTransferURL: clip.styleTransferURL
        )

        Analytics.exportStarted(
            filter: clip.selectedFilter.rawValue,
            hasMusic: clip.selectedMusicTrack != nil,
            hasCaption: !clip.captionText.isEmpty,
            viralConfig: clip.viralConfig
        )

        do {
            let url = try await ExportService.shared.exportClip(config: config) { progress in
                Task { @MainActor in
                    exportProgress = progress
                }
            }
            exportedURL = url
            appState.incrementExportCount()
            exportState = .completed
            HapticFeedback.success()
            showConfetti = true
            Analytics.exportCompleted(
                durationMs: Int(Date.now.timeIntervalSince(exportStartTime) * 1000)
            )
        } catch {
            exportState = .failed(error.localizedDescription)
            HapticFeedback.error()
            Analytics.exportFailed(error: error.localizedDescription)
        }
    }
}

// MARK: - Supporting Types

private enum ExportState {
    case idle
    case exporting
    case completed
    case failed(String)
}

struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(Theme.caption)
                .foregroundStyle(Theme.textTertiary)
            Spacer()
            Text(value)
                .font(Theme.caption)
                .foregroundStyle(.white)
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
