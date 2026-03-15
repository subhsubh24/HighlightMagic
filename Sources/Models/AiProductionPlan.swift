import Foundation

/// Claude's expanded plan output — drives the entire AI autopilot pipeline.
/// Matches web `AiProductionPlan` type for full platform parity.
struct AiProductionPlan: Sendable {
    // Intro/outro cards
    var intro: CardPlan?
    var outro: CardPlan?

    // Sound effects
    var sfx: [SfxPlan]

    // Voiceover
    var voiceover: VoiceoverPlan?

    // Music
    var musicPrompt: String
    var musicDurationMs: Int

    // Audio mix — AI-decided volume levels (0-1)
    var musicVolume: Double
    var sfxVolume: Double
    var voiceoverVolume: Double

    /// AI-decided default transition duration for clips
    var defaultTransitionDuration: Double

    // Timing & pacing
    var photoDisplayDuration: Double
    var loopCrossfadeDuration: Double
    var captionEntranceDuration: Double
    var captionExitDuration: Double
    var captionAppearDelay: Double

    // ── Post-processing fine-tuning (matches web) ──

    /// Beat pulse scale multiplier (0 = no pulse, 0.015 = subtle, 0.04 = pronounced)
    var beatPulseIntensity: Double?
    /// Beat flash overlay max opacity (0 = none, 0.12 = subtle, 0.3 = punchy)
    var beatFlashOpacity: Double?
    /// Beat intensity threshold for flash trigger (0-1). Lower = reacts to weaker beats.
    var beatFlashThreshold: Double?
    /// Beat flash overlay color as hex (default "white")
    var beatFlashColor: String?

    /// Film grain noise opacity (0 = none, 0.03 = subtle, 0.06 = heavy)
    var grainOpacity: Double?
    /// Vignette edge darkening intensity (0 = none, 0.15 = subtle, 0.3 = dramatic)
    var vignetteIntensity: Double?
    /// Vignette inner radius as fraction of outer (0.2 = tight, 0.45 = default, 0.7 = wide)
    var vignetteTightness: Double?

    /// Caption font size as fraction of canvas height (0.02 = small, 0.025 = default, 0.04 = large)
    var captionFontSize: Double?
    /// Caption vertical position as fraction of canvas height (0.5 = center, 0.89 = bottom)
    var captionVerticalPosition: Double?

    /// AI-decided watermark opacity (0.1-0.6)
    var watermarkOpacity: Double?

    /// Film stock — tape-level base post-processing applied uniformly under per-clip grades
    var filmStock: FilmStockPlan?

    /// Letterbox/pillarbox fill color as hex (default "black")
    var letterboxColor: String?

    // Thumbnail
    var thumbnail: ThumbnailPlan?

    struct CardPlan: Sendable {
        var text: String
        var stylePrompt: String
        var duration: Double
    }

    struct SfxPlan: Sendable {
        var clipIndex: Int
        var timing: SfxTiming
        var prompt: String
        var durationMs: Int

        enum SfxTiming: String, Sendable {
            case before, on, after
        }
    }

    struct VoiceoverPlan: Sendable {
        var enabled: Bool
        var segments: [Segment]
        var voiceCharacter: String
        var delaySec: Double

        struct Segment: Sendable {
            var clipIndex: Int
            var text: String
        }
    }

    struct FilmStockPlan: Sendable {
        /// Base grain opacity (0-0.08). Stacks with per-tape grainOpacity.
        var grain: Double
        /// Base warmth shift (0 = neutral, 0.05 = warm, -0.03 = cool)
        var warmth: Double
        /// Base contrast multiplier (0.9-1.2). Applied before per-clip filterCSS.
        var contrast: Double
        /// Faded/lifted blacks (0-0.1). 0 = true black, 0.05 = lifted matte look.
        var fadedBlacks: Double
    }

    struct ThumbnailPlan: Sendable {
        var sourceClipIndex: Int
        var frameTime: Double
        var stylePrompt: String
    }
}

/// Sound effect mapped to a specific clip — matches web `SfxTrack`.
struct SfxTrack: Sendable {
    var clipIndex: Int
    var timing: AiProductionPlan.SfxPlan.SfxTiming
    var prompt: String
    var durationMs: Int
    var audioData: Data?
    var status: GenerationStatus
}

/// Voiceover segment timed to a specific clip — matches web `VoiceoverSegment`.
struct VoiceoverSegment: Sendable {
    var clipIndex: Int
    var text: String
    var audioData: Data?
    /// Duration in seconds — 0 until audio is generated
    var duration: Double
    var status: GenerationStatus
}

/// Thumbnail generation result — matches web `GeneratedThumbnail`.
struct GeneratedThumbnail: Sendable {
    var sourceClipIndex: Int
    var frameTime: Double
    var stylePrompt: String
    var imageData: Data?
    var status: GenerationStatus
}

/// Talking head intro state — matches web `talkingHead`.
struct TalkingHeadState: Sendable {
    /// Source photo data
    var photoData: Data?
    /// Intro speech text (AI-generated or user-provided)
    var speechText: String?
    /// Generated video URL
    var videoUrl: URL?
    var status: GenerationStatus
}
