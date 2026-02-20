import Foundation

struct HighlightTemplate: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let icon: String
    let description: String
    let suggestedFilter: VideoFilter
    let suggestedCaptionStyle: CaptionStyle
    let suggestedMusicMood: TrackMood
    let colorAccent: String // hex

    init(
        id: UUID = UUID(),
        name: String,
        icon: String,
        description: String,
        suggestedFilter: VideoFilter,
        suggestedCaptionStyle: CaptionStyle,
        suggestedMusicMood: TrackMood,
        colorAccent: String
    ) {
        self.id = id
        self.name = name
        self.icon = icon
        self.description = description
        self.suggestedFilter = suggestedFilter
        self.suggestedCaptionStyle = suggestedCaptionStyle
        self.suggestedMusicMood = suggestedMusicMood
        self.colorAccent = colorAccent
    }
}

struct TemplateLibrary {
    static let templates: [HighlightTemplate] = [
        HighlightTemplate(
            name: "Adventure",
            icon: "mountain.2.fill",
            description: "Epic outdoor moments with cinematic flair",
            suggestedFilter: .vibrant,
            suggestedCaptionStyle: .bold,
            suggestedMusicMood: .epic,
            colorAccent: "F59E0B"
        ),
        HighlightTemplate(
            name: "Foodie",
            icon: "fork.knife",
            description: "Warm, appetizing food highlights",
            suggestedFilter: .warm,
            suggestedCaptionStyle: .classic,
            suggestedMusicMood: .chill,
            colorAccent: "EF4444"
        ),
        HighlightTemplate(
            name: "Fitness",
            icon: "figure.run",
            description: "High-energy workout clips",
            suggestedFilter: .cool,
            suggestedCaptionStyle: .bold,
            suggestedMusicMood: .energetic,
            colorAccent: "10B981"
        ),
        HighlightTemplate(
            name: "Pet Vibes",
            icon: "pawprint.fill",
            description: "Adorable pet moments with fun energy",
            suggestedFilter: .vibrant,
            suggestedCaptionStyle: .neon,
            suggestedMusicMood: .fun,
            colorAccent: "F97316"
        ),
        HighlightTemplate(
            name: "Travel",
            icon: "airplane",
            description: "Beautiful travel memories with cinematic warmth",
            suggestedFilter: .warm,
            suggestedCaptionStyle: .minimal,
            suggestedMusicMood: .chill,
            colorAccent: "3B82F6"
        ),
        HighlightTemplate(
            name: "Daily Life",
            icon: "sun.max.fill",
            description: "Clean, minimal everyday moments",
            suggestedFilter: .none,
            suggestedCaptionStyle: .minimal,
            suggestedMusicMood: .upbeat,
            colorAccent: "8B5CF6"
        ),
        HighlightTemplate(
            name: "Gaming",
            icon: "gamecontroller.fill",
            description: "Bold, high-contrast gaming highlights",
            suggestedFilter: .noir,
            suggestedCaptionStyle: .neon,
            suggestedMusicMood: .energetic,
            colorAccent: "06B6D4"
        ),
        HighlightTemplate(
            name: "Party",
            icon: "party.popper.fill",
            description: "Vibrant party and celebration clips",
            suggestedFilter: .vibrant,
            suggestedCaptionStyle: .bold,
            suggestedMusicMood: .fun,
            colorAccent: "EC4899"
        )
    ]
}
