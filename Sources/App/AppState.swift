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

    // ── Multi-file support (parity with web mediaFiles) ──
    var mediaFiles: [MediaItem] = []

    // ── Template & theme (parity with web) ──
    var selectedTemplate: HighlightTemplate?
    var detectedTheme: EditingTheme = .cinematic
    var contentSummary: String = ""

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

    // ── Viral export options (parity with web viralOptions) ──
    var viralBeatSyncEnabled: Bool = true
    var viralSeamlessLoopEnabled: Bool = false

    // ── Regeneration (parity with web regenerateFeedback) ──
    /// When set, detecting step skips scoring and re-runs planner with this feedback
    var regenerateFeedback: String?

    // AI feature toggles (feature parity with web platform)
    var aiMusicEnabled: Bool = false
    var voiceoverEnabled: Bool = false
    var sfxEnabled: Bool = false

    // AI music generation state (matches web aiMusic* fields)
    var aiMusicStatus: GenerationStatus = .idle
    nonisolated(unsafe) var aiMusicData: Data?
    var aiMusicPrompt: String = ""

    // AI production features (AtlasCloud + ElevenLabs)
    /// Combined intro/outro toggle (matches web introOutroEnabled)
    var introOutroEnabled: Bool = false
    var voiceCloneEnabled: Bool = false
    var stemSeparationEnabled: Bool = false
    var styleTransferPrompt: String = ""
    /// Style transfer strength (0.1-1.0) — parity with web
    var styleTransferStrength: Double?

    // ── Photo animation (parity with web) ──
    var animatePhotosEnabled: Bool = false
    var aiDecideAnimations: Bool = false

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

    // ── Validation loop (parity with web) ──
    var validationStatus: ValidationStatus = .idle

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
        // Reset multi-file
        mediaFiles = []
        // Reset template/theme
        selectedTemplate = nil
        detectedTheme = .cinematic
        contentSummary = ""
        // Reset viral options
        viralBeatSyncEnabled = true
        viralSeamlessLoopEnabled = false
        // Reset regeneration
        regenerateFeedback = nil
        // Reset AI feature toggles
        aiMusicEnabled = false
        voiceoverEnabled = false
        sfxEnabled = false
        introOutroEnabled = false
        voiceCloneEnabled = false
        stemSeparationEnabled = false
        styleTransferPrompt = ""
        styleTransferStrength = nil
        // Reset photo animation
        animatePhotosEnabled = false
        aiDecideAnimations = false
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
        // Reset validation
        validationStatus = .idle
        // Reset talking head
        talkingHead = nil
    }
}

// MARK: - Generation Status

enum GenerationStatus: String, Sendable {
    case idle
    case generating
    case completed
    case failed
}

// MARK: - Validation Status (parity with web ValidationStatus)

enum ValidationStatus: String, Sendable {
    case idle
    case validating
    case fixing
    case passed
}

// MARK: - Editing Theme (parity with web EditingTheme)

enum EditingTheme: String, CaseIterable, Sendable {
    case sports
    case cooking
    case travel
    case gaming
    case party
    case fitness
    case pets
    case vlog
    case wedding
    case cinematic
}

// MARK: - Media Item (parity with web MediaFile)

struct MediaItem: Identifiable, Hashable, Sendable {
    let id: UUID
    var url: URL
    var type: MediaType
    var duration: TimeInterval  // 0 for photos
    var name: String
    var thumbnailURL: URL?
    // Photo animation (Kling via Atlas Cloud)
    var animatePhoto: Bool
    var animationInstructions: String
    var animatedVideoUrl: URL?
    var animationStatus: AnimationStatus

    init(
        id: UUID = UUID(),
        url: URL,
        type: MediaType,
        duration: TimeInterval = 0,
        name: String = "",
        thumbnailURL: URL? = nil,
        animatePhoto: Bool = false,
        animationInstructions: String = "",
        animatedVideoUrl: URL? = nil,
        animationStatus: AnimationStatus = .idle
    ) {
        self.id = id
        self.url = url
        self.type = type
        self.duration = duration
        self.name = name
        self.thumbnailURL = thumbnailURL
        self.animatePhoto = animatePhoto
        self.animationInstructions = animationInstructions
        self.animatedVideoUrl = animatedVideoUrl
        self.animationStatus = animationStatus
    }
}

enum MediaType: String, Sendable {
    case video
    case photo
}

enum AnimationStatus: String, Sendable {
    case idle
    case generating
    case completed
    case failed
}

// MARK: - Validation Fixes (parity with web ValidationFixes)

struct ValidationFixes: Sendable {
    /// Partial clip updates by index
    var clipUpdates: [(clipIndex: Int, captionText: String?)]
    /// Clip indices to remove
    var clipRemovals: [Int]
    /// SFX prompts to regenerate
    var regenerateSfx: [(clipIndex: Int, prompt: String, durationMs: Int)]
    /// Music regeneration request
    var regenerateMusic: (prompt: String, durationMs: Int)?
    /// Voiceover segments to regenerate
    var regenerateVoiceover: [(clipIndex: Int, text: String)]?
    /// Intro card to regenerate
    var regenerateIntro: (text: String, stylePrompt: String, duration: Double)?
    /// Outro card to regenerate
    var regenerateOutro: (text: String, stylePrompt: String, duration: Double)?
    /// Partial plan updates
    var planUpdates: AiProductionPlan?

    static let empty = ValidationFixes(
        clipUpdates: [],
        clipRemovals: [],
        regenerateSfx: []
    )
}

/// Result of a single Haiku validation pass — parity with web ValidationResult
struct ValidationResult: Sendable {
    let passed: Bool
    let issues: [String]
    let fixes: ValidationFixes
}

// MARK: - App Screen

enum AppScreen: Hashable {
    case home
    case prompt
    case processing
    case results
    case editor(clipID: EditedClip.ID)
    case export(clipID: EditedClip.ID)
    case paywall
    case settings
    case onboarding
}
