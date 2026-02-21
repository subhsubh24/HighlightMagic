import Foundation

struct HighlightTemplate: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let icon: String
    let description: String
    let suggestedFilter: VideoFilter
    let suggestedCaptionStyle: CaptionStyle
    let suggestedMusicMood: TrackMood
    let suggestedVelocityStyle: VelocityEditService.VelocityStyle
    let suggestedKineticCaption: KineticCaptionStyle
    let colorAccent: String // hex

    init(
        id: UUID = UUID(),
        name: String,
        icon: String,
        description: String,
        suggestedFilter: VideoFilter,
        suggestedCaptionStyle: CaptionStyle,
        suggestedMusicMood: TrackMood,
        suggestedVelocityStyle: VelocityEditService.VelocityStyle = .hero,
        suggestedKineticCaption: KineticCaptionStyle = .pop,
        colorAccent: String
    ) {
        self.id = id
        self.name = name
        self.icon = icon
        self.description = description
        self.suggestedFilter = suggestedFilter
        self.suggestedCaptionStyle = suggestedCaptionStyle
        self.suggestedMusicMood = suggestedMusicMood
        self.suggestedVelocityStyle = suggestedVelocityStyle
        self.suggestedKineticCaption = suggestedKineticCaption
        self.colorAccent = colorAccent
    }
}

struct TemplateLibrary {
    static let templates: [HighlightTemplate] = [
        HighlightTemplate(
            name: "Adventure",
            icon: "mountain.2.fill",
            description: "Epic outdoor moments with cinematic flair",
            suggestedFilter: .warmGlow,
            suggestedCaptionStyle: .bold,
            suggestedMusicMood: .epic,
            suggestedVelocityStyle: .hero,
            suggestedKineticCaption: .pop,
            colorAccent: "F59E0B"
        ),
        HighlightTemplate(
            name: "Foodie",
            icon: "fork.knife",
            description: "Warm, appetizing food highlights",
            suggestedFilter: .warm,
            suggestedCaptionStyle: .classic,
            suggestedMusicMood: .chill,
            suggestedVelocityStyle: .smooth,
            suggestedKineticCaption: .slide,
            colorAccent: "EF4444"
        ),
        HighlightTemplate(
            name: "Fitness",
            icon: "figure.run",
            description: "High-energy workout clips with beat-synced velocity",
            suggestedFilter: .cool,
            suggestedCaptionStyle: .bold,
            suggestedMusicMood: .energetic,
            suggestedVelocityStyle: .bullet,
            suggestedKineticCaption: .bounce,
            colorAccent: "10B981"
        ),
        HighlightTemplate(
            name: "Pet Vibes",
            icon: "pawprint.fill",
            description: "Adorable pet moments with fun energy",
            suggestedFilter: .vibrant,
            suggestedCaptionStyle: .neon,
            suggestedMusicMood: .fun,
            suggestedVelocityStyle: .montage,
            suggestedKineticCaption: .bounce,
            colorAccent: "F97316"
        ),
        HighlightTemplate(
            name: "Travel",
            icon: "airplane",
            description: "Cinematic travel memories with smooth velocity",
            suggestedFilter: .tealOrange,
            suggestedCaptionStyle: .minimal,
            suggestedMusicMood: .chill,
            suggestedVelocityStyle: .smooth,
            suggestedKineticCaption: .slide,
            colorAccent: "3B82F6"
        ),
        HighlightTemplate(
            name: "Daily Life",
            icon: "sun.max.fill",
            description: "Clean, minimal everyday moments",
            suggestedFilter: .cleanAiry,
            suggestedCaptionStyle: .minimal,
            suggestedMusicMood: .upbeat,
            suggestedVelocityStyle: .montage,
            suggestedKineticCaption: .typewriter,
            colorAccent: "8B5CF6"
        ),
        HighlightTemplate(
            name: "Gaming",
            icon: "gamecontroller.fill",
            description: "Bold, high-contrast gaming highlights with sharp cuts",
            suggestedFilter: .moody,
            suggestedCaptionStyle: .neon,
            suggestedMusicMood: .energetic,
            suggestedVelocityStyle: .bullet,
            suggestedKineticCaption: .pop,
            colorAccent: "06B6D4"
        ),
        HighlightTemplate(
            name: "Party",
            icon: "party.popper.fill",
            description: "Vibrant party clips with beat-drop velocity",
            suggestedFilter: .vibrant,
            suggestedCaptionStyle: .bold,
            suggestedMusicMood: .fun,
            suggestedVelocityStyle: .hero,
            suggestedKineticCaption: .pop,
            colorAccent: "EC4899"
        )
    ]
}
