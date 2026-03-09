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
