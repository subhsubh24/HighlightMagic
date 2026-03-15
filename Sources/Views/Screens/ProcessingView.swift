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

            // Store AI production plan from Opus for downstream generation (SFX, music, intro/outro, post-processing)
            if let plan = result.productionPlan {
                appState.aiProductionPlan = plan
            }

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

            // AI validation pass — Haiku reviews the assembled tape for quality issues.
            // Mirrors web platform's /api/validate endpoint. Fail-open: errors skip validation.
            if await TapeValidationService.shared.isAvailable {
                let validationResult = await TapeValidationService.shared.validateTape(
                    clips: appState.generatedClips,
                    plan: appState.aiProductionPlan,
                    contentSummary: appState.creativeDirection.isEmpty ? appState.userPrompt : appState.creativeDirection,
                    sourceURL: video.sourceURL
                )
                if !validationResult.passed {
                    await applyValidationFixes(validationResult.fixes)
                }
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
    /// Updates app-level status fields to match web's aiMusicStatus/sfxStatus/voiceoverStatus.
    private func generateAIAudio(for clips: [EditedClip]) async {
        // AI Music — generate one track for the whole tape
        if appState.aiMusicEnabled {
            await MainActor.run { appState.aiMusicStatus = .generating }
            let totalDuration = clips.reduce(0.0) { $0 + $1.duration }
            let musicPrompt = appState.aiProductionPlan?.musicPrompt
                ?? deriveMusicPrompt(from: clips, userPrompt: appState.userPrompt)
            await MainActor.run { appState.aiMusicPrompt = musicPrompt }
            let result = await ElevenLabsService.shared.generateMusic(
                prompt: musicPrompt,
                durationMs: appState.aiProductionPlan?.musicDurationMs ?? Int(totalDuration * 1000)
            )
            if case .completed = result.status, let data = result.audioData {
                await MainActor.run {
                    appState.aiMusicStatus = .done
                    appState.aiMusicData = data
                    for i in appState.generatedClips.indices {
                        appState.generatedClips[i].aiMusicData = data
                    }
                }
            } else {
                await MainActor.run { appState.aiMusicStatus = .failed }
            }
        }

        // AI Voiceover — generate per-clip narration
        if appState.voiceoverEnabled {
            await MainActor.run { appState.voiceoverStatus = .generating }
            let segments = clips.enumerated().map { (i, clip) in
                (text: clip.captionText.isEmpty ? clip.segment.label : clip.captionText, clipIndex: i)
            }
            let results = await ElevenLabsService.shared.generateVoiceovers(segments: segments)
            let anyFailed = results.contains { _, result in result.status != .completed }
            await MainActor.run {
                for (clipIndex, result) in results {
                    if case .completed = result.status, let data = result.audioData,
                       clipIndex < appState.generatedClips.count {
                        appState.generatedClips[clipIndex].voiceoverData = data
                    }
                }
                appState.voiceoverStatus = anyFailed ? .failed : .done
            }
        }

        // AI SFX — use per-clip prompts from AI production plan when available
        if appState.sfxEnabled {
            await MainActor.run { appState.sfxStatus = .generating }
            let sfxPlan = appState.aiProductionPlan?.sfx ?? []
            let requests: [(prompt: String, durationMs: Int)] = clips.enumerated().map { i, clip in
                // Use AI-planned SFX for this clip if available, otherwise derive from clip context
                if let planned = sfxPlan.first(where: { $0.clipIndex == i }) {
                    return (prompt: planned.prompt, durationMs: planned.durationMs)
                }
                // Derive a contextual SFX prompt from the clip's mood/label rather than a generic one
                let label = clip.segment.label.lowercased()
                let mood = clip.aiEffectConfig?.mood ?? clip.aiEffectConfig?.energy ?? "moderate"
                let sfxPrompt: String
                switch mood {
                case "calm", "romantic", "warm":
                    sfxPrompt = "soft ambient transition swoosh"
                case "explosive", "high":
                    sfxPrompt = "punchy impact hit transition"
                case "dramatic", "moody":
                    sfxPrompt = "deep cinematic bass transition"
                default:
                    // Use the clip label to inform the SFX when possible
                    if label.isEmpty || label == "ai clip" {
                        sfxPrompt = "smooth cinematic transition swoosh"
                    } else {
                        sfxPrompt = "transition sound effect for \(label)"
                    }
                }
                return (prompt: sfxPrompt, durationMs: 1500)
            }
            let results = await ElevenLabsService.shared.generateSoundEffectBatch(requests: requests)
            let anyFailed = results.contains { _, result in result.status != .completed }
            await MainActor.run {
                for (i, result) in results.enumerated() where i < appState.generatedClips.count {
                    if case .completed = result.status, let data = result.audioData {
                        appState.generatedClips[i].sfxData = data
                    }
                }
                appState.sfxStatus = anyFailed ? .failed : .done
            }
        }
    }

    /// Generate AI production assets: intro/outro cards and style transfer.
    /// Uses AtlasCloudService (Kling i2v, Wan 2.6 T2V, Wan v2v).
    /// Matches web platform's intro/outro pipeline: content-aware prompts, 9:16 aspect ratio,
    /// and AI-decided durations from the production plan.
    private func generateAIProduction(for clips: [EditedClip]) async {
        // Derive duration from AI production plan (3-5s range, matching web), fallback to 4s
        let introDuration = appState.aiProductionPlan?.intro?.duration ?? 4
        let outroDuration = appState.aiProductionPlan?.outro?.duration ?? 4

        // Intro card — generate a 9:16 portrait text-to-video intro (matches web)
        if appState.introCardEnabled {
            // Use AI production plan text/style when available, matching web's Claude-generated prompts
            let introText = appState.aiProductionPlan?.intro?.text
                ?? (appState.creativeDirection.isEmpty ? "Highlights" : truncateToWordBoundary(appState.creativeDirection, maxLength: 30))
            let introStylePrompt = appState.aiProductionPlan?.intro?.stylePrompt
                ?? (appState.userPrompt.isEmpty
                    ? "cinematic highlight reel intro, bold glowing text on dark background, portrait 9:16"
                    : "cinematic intro card for: \(appState.userPrompt), bold text, dark background, portrait 9:16")
            let clampedIntroDur = max(3, min(5, Int(introDuration)))

            await MainActor.run {
                appState.introCard = GeneratedCard(
                    text: introText, stylePrompt: introStylePrompt,
                    duration: Double(clampedIntroDur), status: .generating
                )
            }
            do {
                let introURL = try await AtlasCloudService.shared.generateTextToVideo(
                    prompt: introStylePrompt,
                    duration: clampedIntroDur,
                    aspectRatio: "9:16"
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

        // Outro card — generate a 9:16 portrait text-to-video outro (matches web)
        if appState.outroCardEnabled {
            let outroText = appState.aiProductionPlan?.outro?.text
                ?? "Follow for more"
            let outroStylePrompt = appState.aiProductionPlan?.outro?.stylePrompt
                ?? (appState.userPrompt.isEmpty
                    ? "cinematic outro card, subscribe and follow call to action, bold text, dark background, portrait 9:16"
                    : "cinematic outro card for: \(appState.userPrompt), call to action text, dark background, portrait 9:16")
            let clampedOutroDur = max(3, min(5, Int(outroDuration)))

            await MainActor.run {
                appState.outroCard = GeneratedCard(
                    text: outroText, stylePrompt: outroStylePrompt,
                    duration: Double(clampedOutroDur), status: .generating
                )
            }
            do {
                let outroURL = try await AtlasCloudService.shared.generateTextToVideo(
                    prompt: outroStylePrompt,
                    duration: clampedOutroDur,
                    aspectRatio: "9:16"
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

    /// Apply validation fixes from the Haiku QA pass.
    /// Mirrors web platform's validation-fixes.ts: caption rewrites, clip removals, SFX regeneration.
    private func applyValidationFixes(_ fixes: TapeValidationService.ValidationFixes) async {
        await MainActor.run {
            // Caption rewrites — free fix, apply immediately
            for update in fixes.clipUpdates {
                guard update.clipIndex < appState.generatedClips.count else { continue }
                if let newCaption = update.captionText {
                    appState.generatedClips[update.clipIndex].captionText = newCaption
                }
            }

            // Clip removals — remove from highest index first to preserve indices
            let sortedRemovals = fixes.clipRemovals.sorted(by: >)
            for idx in sortedRemovals {
                guard idx < appState.generatedClips.count else { continue }
                appState.generatedClips.remove(at: idx)
            }
        }

        // SFX regeneration — re-generate specific clips with corrected prompts
        if !fixes.regenerateSfx.isEmpty, await ElevenLabsService.shared.isAvailable {
            let requests = fixes.regenerateSfx.map { fix in
                (prompt: fix.prompt, durationMs: fix.durationMs)
            }
            let results = await ElevenLabsService.shared.generateSoundEffectBatch(requests: requests)
            await MainActor.run {
                for (i, result) in results.enumerated() {
                    guard i < fixes.regenerateSfx.count else { break }
                    let clipIndex = fixes.regenerateSfx[i].clipIndex
                    if case .completed = result.status, let data = result.audioData,
                       clipIndex < appState.generatedClips.count {
                        appState.generatedClips[clipIndex].sfxData = data
                    }
                }
            }
        }
    }

    /// Truncate text at a word boundary so intro/outro cards don't cut mid-word.
    private func truncateToWordBoundary(_ text: String, maxLength: Int) -> String {
        guard text.count > maxLength else { return text }
        let trimmed = text.prefix(maxLength)
        // Find last space within the truncated range
        if let lastSpace = trimmed.lastIndex(of: " ") {
            return String(trimmed[trimmed.startIndex..<lastSpace])
        }
        // No spaces found — use the first word of the original text
        return text.split(separator: " ").first.map(String.init) ?? String(trimmed)
    }

    /// Derive a mood-aware music prompt from clip configs and user intent.
    /// Falls back to energy-based descriptions instead of a generic "upbeat energetic" prompt.
    private func deriveMusicPrompt(from clips: [EditedClip], userPrompt: String) -> String {
        // If user gave a prompt, use it as the base
        if !userPrompt.isEmpty {
            return "background music for: \(userPrompt)"
        }

        // Derive mood from the majority of clip configs
        let moods = clips.compactMap { $0.aiEffectConfig?.mood }
        let energies = clips.compactMap { $0.aiEffectConfig?.energy }
        let dominantMood = moods.isEmpty ? nil : Dictionary(grouping: moods, by: { $0 }).max(by: { $0.value.count < $1.value.count })?.key
        let dominantEnergy = energies.isEmpty ? nil : Dictionary(grouping: energies, by: { $0 }).max(by: { $0.value.count < $1.value.count })?.key

        switch (dominantMood, dominantEnergy) {
        case ("calm", _), ("romantic", _), ("warm", _):
            return "smooth mellow background music, relaxed and warm vibes"
        case ("dramatic", _), ("moody", _):
            return "cinematic atmospheric background music, building tension"
        case ("epic", _):
            return "epic orchestral background music, soaring and triumphant"
        case ("playful", _):
            return "fun lighthearted background music, playful and catchy"
        case (_, "explosive"):
            return "high energy intense background music, driving beat"
        case (_, "high"):
            return "energetic upbeat background music, strong rhythm"
        case (_, "calm"):
            return "gentle ambient background music, soft and peaceful"
        default:
            return "highlight reel background music matching the content mood"
        }
    }
}
