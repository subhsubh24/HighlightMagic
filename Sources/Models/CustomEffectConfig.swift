import Foundation

/// AI-generated effect configuration. Claude Vision analyzes video content and returns
/// either recommended presets (by name) or fully custom parameters that the renderer
/// interprets directly. This allows infinite effect variety while keeping the rendering
/// engine deterministic and GPU-accelerated.
struct CustomEffectConfig: Codable, Hashable, Sendable {

    // MARK: - Scene Understanding (informational, used for fallback heuristics)

    var sceneDescription: String?
    var mood: String?
    var dominantColors: [String]?
    var lighting: String? // "golden_hour", "overcast", "night", "indoor", "harsh", "soft"
    var energy: String? // "calm", "moderate", "high", "explosive"

    // MARK: - Preset Recommendations (AI picks from existing library)

    var recommendedFilter: String?
    var recommendedGrade: String?
    var recommendedLUT: String?
    var recommendedOverlays: [String]?
    var recommendedParticle: String?
    var recommendedTransition: String?
    var recommendedVelocityStyle: String?
    var recommendedKineticCaption: String?
    var recommendedMusicMood: String?

    // MARK: - Custom Parameters (AI generates novel values when no preset fits)

    var customGrade: CustomColorGrade?
    var customOverlay: CustomOverlay?
    var customParticle: CustomParticle?
    var customTransition: CustomTransition?

    /// Whether this config has any custom (non-preset) parameters that need special rendering.
    var hasCustomParameters: Bool {
        customGrade != nil || customOverlay != nil
            || customParticle != nil || customTransition != nil
    }
}

// MARK: - Custom Color Grade

/// Parameterized color grade built from CIFilter primitives.
/// All values are clamped to safe ranges by the renderer.
struct CustomColorGrade: Codable, Hashable, Sendable {
    var temperature: Double = 6500  // Kelvin: 2000–10000
    var tint: Double = 0            // -100 to 100
    var saturation: Double = 1.0    // 0.0 to 2.0
    var contrast: Double = 1.0      // 0.5 to 2.0
    var brightness: Double = 0.0    // -0.5 to 0.5
    var vibrance: Double = 0.0      // -1.0 to 1.0
    var exposure: Double = 0.0      // -2.0 to 2.0
    var hueShift: Double = 0.0      // radians: -π to π
    var fadeAmount: Double = 0.0    // 0.0 to 1.0 (lifted blacks)
    var sharpen: Double = 0.0       // 0.0 to 2.0
}

// MARK: - Custom Overlay

/// Parameterized overlay effect composited via CIFilter blending.
struct CustomOverlay: Codable, Hashable, Sendable {
    var type: OverlayType = .colorWash
    var color: String = "FF8C42"    // hex RGB
    var opacity: Double = 0.15      // 0.0 to 1.0
    var blendMode: BlendMode = .screen
    var intensity: Double = 1.0     // overall strength multiplier
    var gradientEndColor: String?   // for gradient type
    var vignetteRadius: Double = 2.0  // for vignette type
    var position: OverlayPosition = .center

    enum OverlayType: String, Codable, Hashable, Sendable {
        case colorWash
        case radialGradient
        case linearGradient
        case vignette
        case noise
    }

    enum BlendMode: String, Codable, Hashable, Sendable {
        case screen
        case overlay
        case multiply
        case softLight
        case addition
    }

    enum OverlayPosition: String, Codable, Hashable, Sendable {
        case center
        case topLeft
        case topRight
        case bottomLeft
        case bottomRight
    }
}

// MARK: - Custom Particle

/// Parameterized particle system built on CAEmitterLayer.
struct CustomParticle: Codable, Hashable, Sendable {
    var shape: ParticleShape = .circle
    var colors: [String] = ["FFFFFF"]  // hex RGB array
    var birthRate: Double = 5.0        // particles/sec
    var velocity: Double = 30.0        // points/sec
    var velocityRange: Double = 15.0
    var scale: Double = 0.04
    var scaleRange: Double = 0.02
    var lifetime: Double = 3.0         // seconds
    var direction: ParticleDirection = .random
    var spin: Double = 0.0             // radians/sec
    var spinRange: Double = 0.0
    var alphaSpeed: Double = -0.2
    var gravity: Double = 0.0          // y-acceleration, positive = down
    var xAcceleration: Double = 0.0
    var emitterPosition: EmitterPosition = .fullScreen

    enum ParticleShape: String, Codable, Hashable, Sendable {
        case circle
        case star
        case heart
        case square
        case diamond
        case ring
        case glow
    }

    enum ParticleDirection: String, Codable, Hashable, Sendable {
        case up
        case down
        case random
        case outward
    }

    enum EmitterPosition: String, Codable, Hashable, Sendable {
        case fullScreen   // rectangle emitter covering entire frame
        case top          // line emitter at top edge
        case bottom       // line emitter at bottom edge
        case lowerHalf    // rectangle emitter in lower 40%
        case center       // point emitter at center
    }
}

// MARK: - Custom Transition

/// Parameterized clip transition animation built on CAAnimation.
struct CustomTransition: Codable, Hashable, Sendable {
    var type: TransitionType = .fade
    var duration: Double = 0.35          // seconds
    var intensity: Double = 1.0          // scale factor for animation values
    var direction: TransitionDirection = .left

    enum TransitionType: String, Codable, Hashable, Sendable {
        case fade
        case zoom
        case slide
        case spin
        case flash
        case bounce
        case iris
    }

    enum TransitionDirection: String, Codable, Hashable, Sendable {
        case left
        case right
        case center
        case up
        case down
    }
}
