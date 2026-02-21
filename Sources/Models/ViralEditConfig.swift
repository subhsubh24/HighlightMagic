import Foundation

/// Configuration for viral-optimized video editing features.
/// Controls beat sync, velocity editing, seamless loops, and kinetic captions.
struct ViralEditConfig: Hashable, Sendable {
    var beatSyncEnabled: Bool
    var velocityStyle: VelocityEditService.VelocityStyle
    var seamlessLoopEnabled: Bool
    var kineticCaptionStyle: KineticCaptionStyle
    var hookFirstOrdering: Bool

    init(
        beatSyncEnabled: Bool = true,
        velocityStyle: VelocityEditService.VelocityStyle = .hero,
        seamlessLoopEnabled: Bool = true,
        kineticCaptionStyle: KineticCaptionStyle = .pop,
        hookFirstOrdering: Bool = true
    ) {
        self.beatSyncEnabled = beatSyncEnabled
        self.velocityStyle = velocityStyle
        self.seamlessLoopEnabled = seamlessLoopEnabled
        self.kineticCaptionStyle = kineticCaptionStyle
        self.hookFirstOrdering = hookFirstOrdering
    }

    static let `default` = ViralEditConfig()

    static let off = ViralEditConfig(
        beatSyncEnabled: false,
        velocityStyle: .none,
        seamlessLoopEnabled: false,
        kineticCaptionStyle: .none,
        hookFirstOrdering: false
    )
}

// MARK: - Kinetic Caption Styles

enum KineticCaptionStyle: String, CaseIterable, Hashable, Sendable {
    case none = "Static"
    case pop = "Pop"
    case bounce = "Bounce"
    case slide = "Slide"
    case typewriter = "Typewriter"

    var description: String {
        switch self {
        case .none: "No animation"
        case .pop: "Pops in with scale"
        case .bounce: "Bounces into view"
        case .slide: "Slides in from side"
        case .typewriter: "Types in letter by letter"
        }
    }

    var icon: String {
        switch self {
        case .none: "textformat"
        case .pop: "sparkle"
        case .bounce: "arrow.up.and.down"
        case .slide: "arrow.right"
        case .typewriter: "keyboard"
        }
    }
}

// MARK: - Cinematic Color Grades (Tier 3)

enum CinematicGrade: String, CaseIterable, Hashable, Sendable {
    case none = "None"
    case warmGlow = "Warm Glow"
    case tealOrange = "Teal & Orange"
    case moodyCinematic = "Moody"
    case vintageFilm = "Vintage Film"
    case cleanAiry = "Clean Airy"

    var description: String {
        switch self {
        case .none: "No color grade"
        case .warmGlow: "Golden hour warmth"
        case .tealOrange: "Cinematic blockbuster"
        case .moodyCinematic: "High contrast, desaturated"
        case .vintageFilm: "Film grain + faded blacks"
        case .cleanAiry: "Bright, lifted shadows"
        }
    }

    var icon: String {
        switch self {
        case .none: "circle"
        case .warmGlow: "sun.max.fill"
        case .tealOrange: "circle.lefthalf.filled"
        case .moodyCinematic: "moon.fill"
        case .vintageFilm: "film"
        case .cleanAiry: "cloud.sun.fill"
        }
    }

    var previewColor: (primary: String, secondary: String) {
        switch self {
        case .none: ("808080", "808080")
        case .warmGlow: ("F59E0B", "D97706")
        case .tealOrange: ("0D9488", "EA580C")
        case .moodyCinematic: ("374151", "1F2937")
        case .vintageFilm: ("A16207", "78716C")
        case .cleanAiry: ("BAE6FD", "E0F2FE")
        }
    }
}
