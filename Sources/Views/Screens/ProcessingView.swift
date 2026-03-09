import SwiftUI
import AVFoundation

struct ProcessingView: View {
    @Environment(AppState.self) private var appState
    @State private var progress: Double = 0
    @State private var statusText = "Preparing video..."
    @State private var hasError = false
    @State private var errorMessage = ""
    @State private var pulseScale: CGFloat = 1.0

    private var phaseText: String {
        switch progress {
        case 0..<0.05: "Preparing video..."
        case 0.05..<0.20: "Pass 1: Analyzing motion..."
        case 0.20..<0.35: "Pass 2: Detecting faces..."
        case 0.35..<0.50: "Pass 3: Classifying scenes..."
        case 0.50..<0.65: "Pass 4: ML model scoring..."
        case 0.65..<0.80: "Pass 5: Semantic fusion..."
        case 0.80..<0.85: "Building highlight segments..."
        case 0.85..<0.98: "Pass 6: AI refinement..."
        case 0.98..<1.0: "Generating clips..."
        default: "Complete!"
        }
    }

    var body: some View {
        ZStack {
            Theme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 40) {
                Spacer()

                // Animated icon
                ZStack {
                    Circle()
                        .fill(Theme.accent.opacity(0.15))
                        .frame(width: 140, height: 140)
                        .scaleEffect(pulseScale)

                    Circle()
                        .fill(Theme.accent.opacity(0.25))
                        .frame(width: 100, height: 100)

                    Image(systemName: "wand.and.stars")
                        .font(.system(size: 40))
                        .foregroundStyle(Theme.primaryGradient)
                }
                .onAppear {
                    withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                        pulseScale = 1.15
                    }
                }

                // Progress info
                VStack(spacing: 16) {
                    Text(phaseText)
                        .font(Theme.headline)
                        .foregroundStyle(.white)
                        .contentTransition(.interpolate)
                        .animation(Theme.smoothAnimation, value: phaseText)

                    ProgressView(value: progress)
                        .tint(Theme.accent)
                        .scaleEffect(y: 2)
                        .padding(.horizontal, 40)

                    Text("\(Int(progress * 100))%")
                        .font(Theme.caption)
                        .foregroundStyle(Theme.textTertiary)
                        .contentTransition(.numericText())

                    if !appState.userPrompt.isEmpty {
                        HStack(spacing: 6) {
                            Image(systemName: "text.quote")
                                .font(.caption2)
                            Text("\"\(appState.userPrompt)\"")
                                .font(Theme.caption)
                        }
                        .foregroundStyle(Theme.textTertiary)
                        .padding(.top, 8)
                    }
                }

                Spacer()
                Spacer()
            }
            .padding(Constants.Layout.padding)
        }
        .navigationBarBackButtonHidden(true)
        .alert("Detection Error", isPresented: $hasError) {
            Button("Go Back") {
                appState.navigationPath.removeLast()
            }
        } message: {
            Text(errorMessage)
        }
        .task { await runDetection() }
    }

    private func runDetection() async {
        guard let video = appState.selectedVideo else {
            errorMessage = "No video selected."
            hasError = true
            return
        }

        let startTime = Date.now
        Analytics.detectionStarted(prompt: appState.userPrompt)

        do {
            let result = try await HighlightDetectionService.shared.detectHighlights(
                in: video.sourceURL,
                prompt: appState.userPrompt,
                creativeDirection: appState.creativeDirection
            ) { newProgress in
                Task { @MainActor in
                    withAnimation(.easeOut(duration: 0.2)) {
                        progress = newProgress
                    }
                }
            }

            appState.detectedHighlights = result.segments

            // Generate clips with AI-powered effect recommendations.
            // Pass Opus-planned configs when available to skip legacy Sonnet re-planning.
            let clips = await ClipGenerationService.shared.generateClips(
                from: video,
                segments: result.segments,
                userPrompt: appState.userPrompt,
                sourceURL: video.sourceURL,
                precomputedConfigs: result.perClipConfigs
            )
            appState.generatedClips = clips

            // AI audio generation (feature parity with web platform)
            if await ElevenLabsService.shared.isAvailable {
                await generateAIAudio(for: clips)
            }

            // AI production features (AtlasCloud: intro/outro, style transfer)
            if await AtlasCloudService.shared.isAvailable {
                await generateAIProduction(for: clips)
            }

            // Voice cloning & stem separation (ElevenLabs)
            if await ElevenLabsService.shared.isAvailable {
                await generateAdvancedAudio(for: clips)
            }

            let durationMs = Int(Date.now.timeIntervalSince(startTime) * 1000)
            let avgConf = result.segments.isEmpty ? 0 :
                result.segments.map(\.confidenceScore).reduce(0, +) / Double(result.segments.count)
            Analytics.detectionCompleted(
                segmentCount: result.segments.count,
                avgConfidence: avgConf,
                durationMs: durationMs
            )

            // Navigate to results
            appState.navigationPath.append(AppScreen.results)
        } catch {
            errorMessage = error.localizedDescription
            hasError = true
        }
    }

    /// Generate AI music, voiceover, and SFX for clips when enabled.
    /// Runs after detection completes, before navigating to results.
    private func generateAIAudio(for clips: [EditedClip]) async {
        // AI Music — generate one track for the whole tape
        if appState.aiMusicEnabled {
            let totalDuration = clips.reduce(0.0) { $0 + $1.duration }
            let musicPrompt = appState.userPrompt.isEmpty
                ? "upbeat energetic highlight reel background music"
                : "background music for: \(appState.userPrompt)"
            let result = await ElevenLabsService.shared.generateMusic(
                prompt: musicPrompt,
                durationMs: Int(totalDuration * 1000)
            )
            if case .completed = result.status, let data = result.audioData {
                await MainActor.run {
                    for i in appState.generatedClips.indices {
                        appState.generatedClips[i].aiMusicData = data
                    }
                }
            }
        }

        // AI Voiceover — generate per-clip narration
        if appState.voiceoverEnabled {
            let segments = clips.enumerated().map { (i, clip) in
                (text: clip.captionText.isEmpty ? clip.segment.label : clip.captionText, clipIndex: i)
            }
            let results = await ElevenLabsService.shared.generateVoiceovers(segments: segments)
            await MainActor.run {
                for (clipIndex, result) in results {
                    if case .completed = result.status, let data = result.audioData,
                       clipIndex < appState.generatedClips.count {
                        appState.generatedClips[clipIndex].voiceoverData = data
                    }
                }
            }
        }

        // AI SFX — generate transition sound for each clip
        if appState.sfxEnabled {
            let requests = clips.map { _ in (prompt: "cinematic whoosh transition", durationMs: 1500) }
            let results = await ElevenLabsService.shared.generateSoundEffectBatch(requests: requests)
            await MainActor.run {
                for (i, result) in results.enumerated() where i < appState.generatedClips.count {
                    if case .completed = result.status, let data = result.audioData {
                        appState.generatedClips[i].sfxData = data
                    }
                }
            }
        }
    }

    /// Generate AI production assets: intro/outro cards and style transfer.
    /// Uses AtlasCloudService (Kling i2v, Wan 2.6 T2V, Wan v2v).
    private func generateAIProduction(for clips: [EditedClip]) async {
        // Intro card — generate a text-to-video intro
        if appState.introCardEnabled {
            let introPrompt = appState.userPrompt.isEmpty
                ? "cinematic highlight reel intro with glowing text"
                : "intro card for: \(appState.userPrompt)"
            await MainActor.run {
                appState.introCard = GeneratedCard(
                    text: introPrompt, stylePrompt: introPrompt, duration: 3, status: .generating
                )
            }
            do {
                let introURL = try await AtlasCloudService.shared.generateTextToVideo(
                    prompt: introPrompt,
                    duration: 3
                )
                await MainActor.run {
                    appState.introCard?.videoUrl = introURL
                    appState.introCard?.status = .done
                    for i in appState.generatedClips.indices {
                        appState.generatedClips[i].introVideoURL = introURL
                    }
                }
            } catch {
                await MainActor.run {
                    appState.introCard?.status = .failed
                }
            }
        }

        // Outro card — generate a text-to-video outro
        if appState.outroCardEnabled {
            let outroPrompt = appState.userPrompt.isEmpty
                ? "cinematic outro card with subscribe and follow call to action"
                : "outro card for: \(appState.userPrompt)"
            await MainActor.run {
                appState.outroCard = GeneratedCard(
                    text: outroPrompt, stylePrompt: outroPrompt, duration: 3, status: .generating
                )
            }
            do {
                let outroURL = try await AtlasCloudService.shared.generateTextToVideo(
                    prompt: outroPrompt,
                    duration: 3
                )
                await MainActor.run {
                    appState.outroCard?.videoUrl = outroURL
                    appState.outroCard?.status = .done
                    for i in appState.generatedClips.indices {
                        appState.generatedClips[i].outroVideoURL = outroURL
                    }
                }
            } catch {
                await MainActor.run {
                    appState.outroCard?.status = .failed
                }
            }
        }

        // Style transfer — apply visual style to each clip
        if !appState.styleTransferPrompt.isEmpty, let video = appState.selectedVideo {
            do {
                let styledURL = try await AtlasCloudService.shared.applyStyleTransfer(
                    videoURL: video.sourceURL,
                    stylePrompt: appState.styleTransferPrompt
                )
                await MainActor.run {
                    for i in appState.generatedClips.indices {
                        appState.generatedClips[i].styleTransferURL = styledURL
                    }
                }
            } catch {
                // Non-fatal — continue without style transfer
            }
        }
    }

    /// Generate advanced audio features: voice cloning and stem separation.
    private func generateAdvancedAudio(for clips: [EditedClip]) async {
        // Voice cloning — create a clone from the video's audio, then use it for voiceover
        if appState.voiceCloneEnabled, let video = appState.selectedVideo {
            await MainActor.run { appState.voiceCloneStatus = .generating }
            do {
                // Extract audio data from the video for voice cloning
                let audioData = try Data(contentsOf: video.sourceURL)
                let cloneResult = await ElevenLabsService.shared.createVoiceClone(
                    audioData: audioData,
                    name: "User Voice",
                    fileName: video.sourceURL.lastPathComponent
                )
                guard case .completed = cloneResult.status, let voiceId = cloneResult.voiceId else {
                    await MainActor.run { appState.voiceCloneStatus = .failed }
                    return
                }
                await MainActor.run {
                    appState.clonedVoiceId = voiceId
                    appState.voiceCloneStatus = .done
                }

                // If voiceover is also enabled, regenerate using the cloned voice
                if appState.voiceoverEnabled {
                    for (i, clip) in clips.enumerated() {
                        let text = clip.captionText.isEmpty ? clip.segment.label : clip.captionText
                        let result = await ElevenLabsService.shared.generateWithClonedVoice(
                            text: text,
                            voiceId: voiceId
                        )
                        if case .completed = result.status, let data = result.audioData {
                            await MainActor.run {
                                if i < appState.generatedClips.count {
                                    appState.generatedClips[i].voiceoverData = data
                                }
                            }
                        }
                    }
                }
            } catch {
                await MainActor.run { appState.voiceCloneStatus = .failed }
            }
        }

        // Stem separation — isolate instrumental track from AI-generated music
        if appState.stemSeparationEnabled, let musicData = clips.first?.aiMusicData {
            await MainActor.run { appState.stemSeparationStatus = .generating }
            let stemResult = await ElevenLabsService.shared.separateStems(audioData: musicData)
            if case .completed = stemResult.status, let instrumental = stemResult.instrumentalData {
                await MainActor.run {
                    appState.instrumentalMusicData = instrumental
                    appState.stemSeparationStatus = .done
                    // Replace AI music with instrumental-only version
                    for i in appState.generatedClips.indices {
                        appState.generatedClips[i].aiMusicData = instrumental
                    }
                }
            } else {
                await MainActor.run { appState.stemSeparationStatus = .failed }
            }
        }
    }
}
