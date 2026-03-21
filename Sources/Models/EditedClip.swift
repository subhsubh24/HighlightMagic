import Foundation
import CoreMedia
import CoreImage

struct EditedClip: Identifiable, Hashable, Sendable {
    let id: UUID
    let sourceVideoID: UUID
    /// Which uploaded source file this clip came from (parity with web sourceFileId)
    var sourceFileId: String?
    var segment: HighlightSegment
    var trimStart: CMTime
    var trimEnd: CMTime
    /// Position in the final highlight tape (parity with web order field)
    var order: Int
    var selectedMusicTrack: MusicTrack?
    var captionText: String
    var captionStyle: CaptionStyle
    var selectedFilter: VideoFilter
    var viralConfig: ViralEditConfig
    var cinematicGrade: CinematicGrade
    var selectedPremiumEffects: [PremiumEffect]
    var aiEffectConfig: CustomEffectConfig?
    var exportURL: URL?

    // ── Per-clip style overrides (AI-decided, user-overridable — parity with web) ──
    var velocityPreset: VelocityEditService.VelocityStyle
    var transitionType: String?
    var transitionDuration: Double?
    var entryPunchScale: Double?
    var entryPunchDuration: Double?
    var kenBurnsIntensity: Double?
    /// Custom CSS filter string from AI (web parity — maps to CIFilter chain on iOS)
    var customFilterCSS: String?
    /// Per-clip original audio volume (0-1). Overrides plan-level clipAudioVolume.
    var clipAudioVolume: Double?
    /// Per-clip transition intensity (0-1). Scales the effect magnitude.
    var transitionIntensity: Double?
    /// Per-clip transition params — fine-tune the chosen transition type's internals.
    var transitionParams: TransitionParams?
    /// Per-clip caption exit animation type
    var captionExitAnimation: String?
    /// Per-clip beat pulse scale intensity (0-0.1)
    var beatPulseIntensity: Double?
    /// Per-clip beat flash overlay opacity (0-0.5)
    var beatFlashOpacity: Double?
    /// Per-clip beat flash threshold (0-1)
    var beatFlashThreshold: Double?
    /// Per-clip beat flash color as hex
    var beatFlashColor: String?
    /// Per-clip caption idle pulse intensity (0-1)
    var captionIdlePulse: Double?
    /// Per-clip caption glow spread multiplier (0.5-3)
    var customCaptionGlowSpread: Double?
    /// Per-clip audio bleed fade-in duration in seconds (0.01-0.3)
    var audioFadeIn: Double?
    /// Per-clip audio bleed fade-out duration in seconds (0.01-0.3)
    var audioFadeOut: Double?
    /// Per-clip caption animation intensity (0-1)
    var captionAnimationIntensity: Double?
    /// Per-clip light leak color as hex
    var lightLeakColor: String?
    /// Per-clip glitch colors as [primary, secondary] hex
    var glitchColors: [String]?
    /// Per-clip light leak opacity (0-1)
    var lightLeakOpacity: Double?
    /// Per-clip whip motion blur alpha (0-1)
    var whipMotionBlurAlpha: Double?

    // AI-generated audio (feature parity with web)
    /// AI-generated music data (MP3) from ElevenLabs, used instead of bundled music
    nonisolated(unsafe) var aiMusicData: Data?
    /// AI voiceover narration data (MP3) from ElevenLabs
    nonisolated(unsafe) var voiceoverData: Data?
    /// AI sound effect data (MP3) from ElevenLabs
    nonisolated(unsafe) var sfxData: Data?
    /// URL to AI-generated intro card video (from AtlasCloud)
    var introVideoURL: URL?
    /// URL to AI-generated outro card video (from AtlasCloud)
    var outroVideoURL: URL?
    /// URL to style-transferred video (from AtlasCloud Wan v2v)
    var styleTransferURL: URL?

    init(
        id: UUID = UUID(),
        sourceVideoID: UUID,
        sourceFileId: String? = nil,
        segment: HighlightSegment,
        trimStart: CMTime? = nil,
        trimEnd: CMTime? = nil,
        order: Int = 0,
        selectedMusicTrack: MusicTrack? = nil,
        captionText: String = "",
        captionStyle: CaptionStyle = .bold,
        selectedFilter: VideoFilter = .none,
        velocityPreset: VelocityEditService.VelocityStyle = .hero,
        viralConfig: ViralEditConfig = .default,
        cinematicGrade: CinematicGrade = .none,
        selectedPremiumEffects: [PremiumEffect] = [],
        aiEffectConfig: CustomEffectConfig? = nil
    ) {
        self.id = id
        self.sourceVideoID = sourceVideoID
        self.sourceFileId = sourceFileId
        self.segment = segment
        // Use AI-suggested trim points when available, falling back to detection boundaries
        self.trimStart = trimStart ?? segment.effectiveStartTime
        self.trimEnd = trimEnd ?? segment.effectiveEndTime
        self.order = order
        self.selectedMusicTrack = selectedMusicTrack
        self.captionText = captionText
        self.captionStyle = captionStyle
        self.selectedFilter = selectedFilter
        self.velocityPreset = velocityPreset
        self.viralConfig = viralConfig
        self.cinematicGrade = cinematicGrade
        self.selectedPremiumEffects = selectedPremiumEffects
        self.aiEffectConfig = aiEffectConfig
    }

    var duration: TimeInterval {
        CMTimeGetSeconds(trimEnd) - CMTimeGetSeconds(trimStart)
    }

    static func == (lhs: EditedClip, rhs: EditedClip) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

enum CaptionStyle: String, CaseIterable, Hashable, Sendable {
    case bold = "Bold"
    case minimal = "Minimal"
    case neon = "Neon"
    case classic = "Classic"

    var fontSize: CGFloat {
        switch self {
        case .bold: 28
        case .minimal: 20
        case .neon: 24
        case .classic: 22
        }
    }

    var fontWeight: String {
        switch self {
        case .bold: "Heavy"
        case .minimal: "Light"
        case .neon: "Bold"
        case .classic: "Regular"
        }
    }
}

enum VideoFilter: String, CaseIterable, Hashable, Sendable {
    case none = "None"
    case vibrant = "Vibrant"
    case warm = "Warm"
    case cool = "Cool"
    case noir = "Noir"
    case fade = "Fade"
    // Cinematic grades (Tier 3)
    case warmGlow = "Warm Glow"
    case tealOrange = "Teal & Orange"
    case moody = "Moody"
    case vintageFilm = "Vintage Film"
    case cleanAiry = "Clean Airy"

    var ciFilterName: String? {
        switch self {
        case .none: nil
        case .vibrant: "CIVibrance"
        case .warm: "CITemperatureAndTint"
        case .cool: "CITemperatureAndTint"
        case .noir: "CIPhotoEffectNoir"
        case .fade: "CIPhotoEffectFade"
        case .warmGlow: "CITemperatureAndTint"
        case .tealOrange: "CIVibrance"
        case .moody: "CIColorControls"
        case .vintageFilm: "CISepiaTone"
        case .cleanAiry: "CIExposureAdjust"
        }
    }

    var filterParameters: [String: Any] {
        switch self {
        case .none: [:]
        case .vibrant: ["inputAmount": 0.8]
        case .warm: ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 5000, y: 0)]
        case .cool: ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 8000, y: 0)]
        case .noir: [:]
        case .fade: [:]
        case .warmGlow: ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 4800, y: 0)]
        case .tealOrange: ["inputAmount": 0.6]
        case .moody: ["inputContrast": 1.3, "inputSaturation": 0.7, "inputBrightness": -0.05]
        case .vintageFilm: ["inputIntensity": 0.3]
        case .cleanAiry: ["inputEV": 0.4]
        }
    }

    var isCinematic: Bool {
        switch self {
        case .warmGlow, .tealOrange, .moody, .vintageFilm, .cleanAiry: true
        default: false
        }
    }
}

/// Per-clip transition parameter overrides — parity with web `transitionParams`.
struct TransitionParams: Hashable, Sendable {
    /// Zoom punch outgoing scale factor (default 0.25)
    var zoomOutScale: Double?
    /// Zoom punch incoming scale factor (default 0.18)
    var zoomInScale: Double?
    /// Glitch jitter amplitude in pixels (default 12)
    var glitchJitter: Double?
    /// Whip motion blur intensity/alpha (default 0.25)
    var motionBlurAlpha: Double?
    /// Soft zoom scale factor (default 0.04)
    var softZoomScale: Double?
}
