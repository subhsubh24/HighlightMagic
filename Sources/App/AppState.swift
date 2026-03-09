import SwiftUI

@Observable
final class AppState {
    var navigationPath = NavigationPath()
    var selectedVideo: VideoItem?
    var userPrompt: String = ""
    var creativeDirection: String = ""
    var detectedHighlights: [HighlightSegment] = []
    var generatedClips: [EditedClip] = []
    var currentScreen: AppScreen = .home
    var isProcessing = false
    var processingProgress: Double = 0
    var errorMessage: String?

    /// Stored property so @Observable can track mutations and trigger SwiftUI updates.
    /// Synced to UserDefaults on write and loaded from UserDefaults on init.
    var exportsUsedThisMonth: Int {
        didSet { UserDefaults.standard.set(exportsUsedThisMonth, forKey: "exportsUsedThisMonth") }
    }

    /// Stored property synced to UserDefaults. See `exportsUsedThisMonth`.
    var lastExportResetDate: Date {
        didSet { UserDefaults.standard.set(lastExportResetDate, forKey: "lastExportResetDate") }
    }

    var isProUser: Bool = false

    // AI feature toggles (feature parity with web platform)
    var aiMusicEnabled: Bool = false
    var voiceoverEnabled: Bool = false
    var sfxEnabled: Bool = false

    // AI music generation state (matches web aiMusic* fields)
    var aiMusicStatus: GenerationStatus = .idle
    nonisolated(unsafe) var aiMusicData: Data?
    var aiMusicPrompt: String = ""

    // AI production features (AtlasCloud + ElevenLabs)
    var introCardEnabled: Bool = false
    var outroCardEnabled: Bool = false
    var voiceCloneEnabled: Bool = false
    var stemSeparationEnabled: Bool = false
    var styleTransferPrompt: String = ""

    // ── AI Production pipeline state (matches web) ──

    /// Claude's expanded creative plan — drives all downstream generation
    var aiProductionPlan: AiProductionPlan?

    // Intro/outro video cards (Atlas Cloud T2V) — matches web introCard/outroCard
    var introCard: GeneratedCard?
    var outroCard: GeneratedCard?

    // Sound effects (ElevenLabs SFX v2) — matches web sfxTracks/sfxStatus
    var sfxTracks: [SfxTrack] = []
    var sfxStatus: GenerationStatus = .idle

    // Voiceover segments (ElevenLabs TTS v3) — matches web voiceoverSegments/voiceoverStatus
    var voiceoverSegments: [VoiceoverSegment] = []
    var voiceoverStatus: GenerationStatus = .idle

    // Auto-generated thumbnail — matches web thumbnail
    var thumbnail: GeneratedThumbnail?

    // Audio transcript from Scribe — matches web audioTranscript
    var audioTranscript: String?

    // Voice cloning state
    var voiceSampleData: Data?
    var clonedVoiceId: String?
    var voiceCloneStatus: GenerationStatus = .idle

    // Stem separation state
    var instrumentalMusicData: Data?
    var stemSeparationStatus: GenerationStatus = .idle

    // Talking head intro — matches web talkingHead
    var talkingHead: TalkingHeadState?

    var canExportFree: Bool {
        exportsUsedThisMonth < Constants.freeExportLimit
    }

    init() {
        self.exportsUsedThisMonth = UserDefaults.standard.integer(forKey: "exportsUsedThisMonth")
        self.lastExportResetDate = UserDefaults.standard.object(forKey: "lastExportResetDate") as? Date ?? .distantPast
        resetExportsIfNewMonth()
    }

    func resetExportsIfNewMonth() {
        let calendar = Calendar.current
        guard !calendar.isDate(lastExportResetDate, equalTo: .now, toGranularity: .month) else { return }
        exportsUsedThisMonth = 0
        lastExportResetDate = .now
    }

    func incrementExportCount() {
        resetExportsIfNewMonth()
        exportsUsedThisMonth += 1
    }

    func clearSession() {
        selectedVideo = nil
        userPrompt = ""
        creativeDirection = ""
        detectedHighlights = []
        generatedClips = []
        isProcessing = false
        processingProgress = 0
        errorMessage = nil
        // Reset AI feature toggles
        aiMusicEnabled = false
        voiceoverEnabled = false
        sfxEnabled = false
        introCardEnabled = false
        outroCardEnabled = false
        voiceCloneEnabled = false
        stemSeparationEnabled = false
        styleTransferPrompt = ""
        // Reset AI music generation state
        aiMusicStatus = .idle
        aiMusicData = nil
        aiMusicPrompt = ""
        // Reset AI production pipeline state
        aiProductionPlan = nil
        introCard = nil
        outroCard = nil
        sfxTracks = []
        sfxStatus = .idle
        voiceoverSegments = []
        voiceoverStatus = .idle
        thumbnail = nil
        audioTranscript = nil
        // Reset voice cloning
        voiceSampleData = nil
        clonedVoiceId = nil
        voiceCloneStatus = .idle
        // Reset stem separation
        instrumentalMusicData = nil
        stemSeparationStatus = .idle
        // Reset talking head
        talkingHead = nil
    }
}

enum GenerationStatus: String, Sendable {
    case idle
    case generating
    case done
    case failed
}

enum AppScreen: Hashable {
    case home
    case prompt
    case processing
    case results
    case editor(clipID: EditedClip.ID)
    case export(clipID: EditedClip.ID)
    case paywall
    case settings
}
