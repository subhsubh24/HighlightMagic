import Foundation
import CoreMedia
import CoreImage

struct EditedClip: Identifiable, Hashable, Sendable {
    let id: UUID
    let sourceVideoID: UUID
    var segment: HighlightSegment
    var trimStart: CMTime
    var trimEnd: CMTime
    var selectedMusicTrack: MusicTrack?
    var captionText: String
    var captionStyle: CaptionStyle
    var selectedFilter: VideoFilter
    var viralConfig: ViralEditConfig
    var cinematicGrade: CinematicGrade
    var selectedPremiumEffects: [PremiumEffect]
    var exportURL: URL?

    init(
        id: UUID = UUID(),
        sourceVideoID: UUID,
        segment: HighlightSegment,
        trimStart: CMTime? = nil,
        trimEnd: CMTime? = nil,
        selectedMusicTrack: MusicTrack? = nil,
        captionText: String = "",
        captionStyle: CaptionStyle = .bold,
        selectedFilter: VideoFilter = .none,
        viralConfig: ViralEditConfig = .default,
        cinematicGrade: CinematicGrade = .none,
        selectedPremiumEffects: [PremiumEffect] = []
    ) {
        self.id = id
        self.sourceVideoID = sourceVideoID
        self.segment = segment
        self.trimStart = trimStart ?? segment.startTime
        self.trimEnd = trimEnd ?? segment.endTime
        self.selectedMusicTrack = selectedMusicTrack
        self.captionText = captionText
        self.captionStyle = captionStyle
        self.selectedFilter = selectedFilter
        self.viralConfig = viralConfig
        self.cinematicGrade = cinematicGrade
        self.selectedPremiumEffects = selectedPremiumEffects
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
