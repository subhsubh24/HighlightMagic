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
    /// AI-decided default entry punch scale for clips (1.0-1.1)
    var defaultEntryPunchScale: Double?
    /// AI-decided default entry punch duration for clips (0-0.3s)
    var defaultEntryPunchDuration: Double?
    /// AI-decided default Ken Burns intensity for photo clips (0-0.08)
    var defaultKenBurnsIntensity: Double?

    // Timing & pacing
    var photoDisplayDuration: Double
    var loopCrossfadeDuration: Double
    var captionEntranceDuration: Double
    var captionExitDuration: Double
    /// Caption appear delay after cut in seconds (0 = instant, 0.12 = natural)
    var captionAppearDelay: Double
    /// AI-decided music ducking ratio during voiceover (0.1-0.6)
    var musicDuckRatio: Double
    /// Music duck attack time in seconds — how fast music fades down (0.05-1.0s)
    var musicDuckAttack: Double?
    /// Music duck release time in seconds — how fast music fades back up (0.1-2.0s)
    var musicDuckRelease: Double?
    /// Music fade-in duration at tape start (0-3s)
    var musicFadeInDuration: Double?
    /// Music fade-out duration at tape end (0-3s)
    var musicFadeOutDuration: Double?
    /// AI-decided beat-sync tolerance in ms (20-200ms)
    var beatSyncToleranceMs: Double
    /// AI-decided export bitrate in bps
    var exportBitrate: Int
    /// AI-decided neon transition colors as hex array
    var neonColors: [String]

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
    /// Vignette gradient hardness (0-1). 0 = smooth falloff, 0.5 = standard, 1 = sharp edge.
    var vignetteHardness: Double?

    /// Caption font size as fraction of canvas height (0.02 = small, 0.025 = default, 0.04 = large)
    var captionFontSize: Double?
    /// Caption vertical position as fraction of canvas height (0.5 = center, 0.89 = bottom)
    var captionVerticalPosition: Double?
    /// Caption drop shadow color
    var captionShadowColor: String?
    /// Caption drop shadow blur in pixels
    var captionShadowBlur: Double?

    /// Flash transition overlay opacity (0-1). Default 0.85.
    var flashOverlayAlpha: Double?
    /// Zoom punch flash overlay opacity (0-1). Default 0.35.
    var zoomPunchFlashAlpha: Double?
    /// Color flash overlay opacity (0-1). Default 0.65.
    var colorFlashAlpha: Double?
    /// Strobe flash count per transition (2-8). Default 4.
    var strobeFlashCount: Int?
    /// Strobe flash opacity (0-1). Default 0.9.
    var strobeFlashAlpha: Double?
    /// Light leak tint color as hex (default warm gold "#ffc864")
    var lightLeakColor: String?
    /// Glitch channel colors as [primary hex, secondary hex]
    var glitchColors: [String]?

    /// AI-decided watermark opacity (0.1-0.6)
    var watermarkOpacity: Double?
    /// Watermark font size as fraction of canvas height
    var watermarkFontSize: Double?
    /// Watermark vertical position as fraction of canvas height from bottom
    var watermarkYOffset: Double?
    /// Watermark text color as hex
    var watermarkColor: String?

    /// Exit deceleration speed multiplier (0.92 = heavy, 0.97 = subtle, 1.0 = none)
    var exitDecelSpeed: Double?
    /// Exit deceleration duration in seconds
    var exitDecelDuration: Double?
    /// Exit decel easing curve: 'quad' (default), 'cubic' (heavier), 'linear'
    var exitDecelEasing: String?
    /// Micro-settle scale on clip entry (1.0 = none, 1.004 = subtle, 1.01 = noticeable)
    var settleScale: Double?
    /// Micro-settle duration in seconds
    var settleDuration: Double?
    /// Micro-settle easing curve: 'cubic' (default), 'quad', 'expo', 'linear'
    var settleEasing: String?
    /// Default clip audio volume when music is present (0-1)
    var clipAudioVolume: Double?
    /// Warmth shift on the final clip
    var finalClipWarmth: FinalClipWarmth?

    /// Film stock — tape-level base post-processing applied uniformly under per-clip grades
    var filmStock: FilmStockPlan?

    /// Letterbox/pillarbox fill color as hex (default "black")
    var letterboxColor: String?

    /// Film grain block size in pixels (2 = fine cinematic, 4 = default, 8 = coarse retro)
    var grainBlockSize: Int?

    /// Caption exit animation type: "fade" (default), "pop", "slide", "dissolve"
    var captionExitAnimation: String?

    // ── Transition overlay fine-tuning ──

    /// Light leak gradient opacity peak (0-1). Default 0.35.
    var lightLeakOpacity: Double?
    /// Hard flash darken-phase duration as fraction of transition (0-0.5). Default 0.3.
    var hardFlashDarkenPhase: Double?
    /// Hard flash white-blast duration as fraction of transition. Default 0.25.
    var hardFlashBlastPhase: Double?
    /// Glitch scanline count (2-12). Default 6.
    var glitchScanlineCount: Int?
    /// Glitch channel band width as fraction (0.1-0.5). Default 0.34.
    var glitchBandWidth: Double?
    /// Whip motion blur line count (4-16). Default 8.
    var whipBlurLineCount: Int?
    /// Whip brightness overlay opacity (0-0.5). Default 0.15.
    var whipBrightnessAlpha: Double?
    /// Hard cut brightness bump opacity (0-0.3). Default 0.15.
    var hardCutBumpAlpha: Double?

    // ── Kinetic text fine-tuning ──

    /// Pop entrance start scale (0.1-0.8). Default 0.3.
    var captionPopStartScale: Double?
    /// Pop exit scale expansion (0.1-0.8). Default 0.3.
    var captionPopExitScale: Double?
    /// Slide exit distance in pixels (5-40). Default 20.
    var captionSlideExitDistance: Double?
    /// Fade exit vertical offset in pixels (-30 to 30). Default -10.
    var captionFadeExitOffset: Double?
    /// Flicker entrance speed multiplier (4-16). Default 8.
    var captionFlickerSpeed: Double?
    /// Pop idle pulse frequency in Hz (0.5-4). Default 1.5.
    var captionPopIdleFreq: Double?
    /// Flicker idle glow frequency in Hz (1-6). Default 3.
    var captionFlickerIdleFreq: Double?
    /// Bold caption font size multiplier (0.8-1.6). Default 1.2.
    var captionBoldSizeMultiplier: Double?
    /// Minimal caption font size multiplier (0.6-1.0). Default 0.9.
    var captionMinimalSizeMultiplier: Double?
    /// Pop easeOutBack overshoot constant (1.0-3.0). Default 1.70158.
    var captionPopOvershoot: Double?

    // ── Editing philosophy (AI articulates its vision before making choices) ──

    /// AI's high-level editing philosophy for this tape.
    var editingPhilosophy: EditingPhilosophy?

    /// Audio breath moments — planned silence dips at emotional peaks.
    var audioBreaths: [AudioBreath]?

    // Thumbnail
    var thumbnail: ThumbnailPlan?

    // Enhanced photo animation prompts (Claude improves user's vague instructions)
    var photoAnimationPrompts: [String: String]

    // Style transfer — AI-chosen visual post-processing look
    var styleTransfer: StyleTransferPlan?

    // Talking head intro — Claude writes the intro speech
    var talkingHeadSpeech: String?

    // MARK: - Nested Types

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
        /// Global fallback delay in seconds before voiceover starts (0-1s)
        var delaySec: Double

        struct Segment: Sendable {
            var clipIndex: Int
            var text: String
            /// Per-segment delay override (0-2s)
            var delaySec: Double?
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

    struct EditingPhilosophy: Sendable {
        /// The overall feel: raw & authentic, polished & cinematic, etc.
        var vibe: String?
        /// Pacing arc: escalation, double_peak, sine_wave, slow_build, etc.
        var paceProfile: String?
        /// How transitions should evolve across the tape
        var transitionArc: String?
        /// The foundational color grade the AI is building on
        var baseGrade: String?
    }

    struct AudioBreath: Sendable {
        /// Timestamp in seconds from tape start
        var time: Double
        /// Duration of the breath in seconds (0.3-1.0)
        var duration: Double
        /// How much to duck ALL audio (0 = full silence, 0.15 = whisper, 0.3 = subtle dip)
        var depth: Double
        /// Attack time in seconds — how fast audio dips (0.05-0.5). Default 0.1.
        var attack: Double?
        /// Release time in seconds — how fast audio recovers (0.1-1.0). Default 0.2.
        var release: Double?
    }

    struct StyleTransferPlan: Sendable {
        var prompt: String
        var strength: Double // 0.1-1.0
    }

    struct FinalClipWarmth: Sendable {
        var enabled: Bool
        var sepia: Double?
        var saturation: Double?
        var fadeIn: Double?
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
    /// Per-segment delay override — seconds after clip start before VO begins
    var delaySec: Double?
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
