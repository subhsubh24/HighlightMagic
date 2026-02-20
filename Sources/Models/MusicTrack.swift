import Foundation

struct MusicTrack: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let fileName: String
    let fileExtension: String
    let artist: String
    let mood: TrackMood
    let category: TrackCategory
    let bpm: Int
    let durationSeconds: Double
    let isPremium: Bool

    init(
        id: UUID = UUID(),
        name: String,
        fileName: String,
        fileExtension: String = "mp3",
        artist: String,
        mood: TrackMood,
        category: TrackCategory = .general,
        bpm: Int,
        durationSeconds: Double,
        isPremium: Bool = false
    ) {
        self.id = id
        self.name = name
        self.fileName = fileName
        self.fileExtension = fileExtension
        self.artist = artist
        self.mood = mood
        self.category = category
        self.bpm = bpm
        self.durationSeconds = durationSeconds
        self.isPremium = isPremium
    }

    var bundleURL: URL? {
        Bundle.main.url(forResource: fileName, withExtension: fileExtension)
    }
}

enum TrackMood: String, CaseIterable, Hashable, Sendable {
    case upbeat = "Upbeat"
    case chill = "Chill"
    case epic = "Epic"
    case fun = "Fun"
    case energetic = "Energetic"
    case dramatic = "Dramatic"
    case funny = "Funny"
}

enum TrackCategory: String, CaseIterable, Hashable, Sendable {
    case general = "General"
    case adventure = "Adventure"
    case lifestyle = "Lifestyle"
    case sports = "Sports"
    case party = "Party"
    case cinematic = "Cinematic"
}

struct MusicLibrary {
    static let tracks: [MusicTrack] = [
        // Free tier tracks
        MusicTrack(name: "Summer Vibes", fileName: "summer_vibes", artist: "Royalty Free", mood: .upbeat, category: .lifestyle, bpm: 120, durationSeconds: 60),
        MusicTrack(name: "Golden Hour", fileName: "golden_hour", artist: "Royalty Free", mood: .chill, category: .lifestyle, bpm: 90, durationSeconds: 60),
        MusicTrack(name: "Peak Moment", fileName: "peak_moment", artist: "Royalty Free", mood: .epic, category: .adventure, bpm: 140, durationSeconds: 60),
        MusicTrack(name: "Happy Days", fileName: "happy_days", artist: "Royalty Free", mood: .fun, category: .general, bpm: 110, durationSeconds: 60),
        MusicTrack(name: "Power Up", fileName: "power_up", artist: "Royalty Free", mood: .energetic, category: .sports, bpm: 150, durationSeconds: 60),
        // Premium tracks
        MusicTrack(name: "Neon Nights", fileName: "neon_nights", artist: "Royalty Free", mood: .energetic, category: .party, bpm: 128, durationSeconds: 60, isPremium: true),
        MusicTrack(name: "Ocean Breeze", fileName: "ocean_breeze", artist: "Royalty Free", mood: .chill, category: .lifestyle, bpm: 85, durationSeconds: 60, isPremium: true),
        MusicTrack(name: "Victory Lap", fileName: "victory_lap", artist: "Royalty Free", mood: .epic, category: .sports, bpm: 145, durationSeconds: 60, isPremium: true),
        MusicTrack(name: "Silly Walk", fileName: "silly_walk", artist: "Royalty Free", mood: .funny, category: .general, bpm: 100, durationSeconds: 60, isPremium: true),
        MusicTrack(name: "Campfire Stories", fileName: "campfire_stories", artist: "Royalty Free", mood: .chill, category: .adventure, bpm: 80, durationSeconds: 60, isPremium: true),
        MusicTrack(name: "Dance Floor", fileName: "dance_floor", artist: "Royalty Free", mood: .energetic, category: .party, bpm: 130, durationSeconds: 60, isPremium: true),
        MusicTrack(name: "Cinematic Rise", fileName: "cinematic_rise", artist: "Royalty Free", mood: .dramatic, category: .cinematic, bpm: 100, durationSeconds: 60, isPremium: true),
        MusicTrack(name: "Morning Run", fileName: "morning_run", artist: "Royalty Free", mood: .upbeat, category: .sports, bpm: 135, durationSeconds: 60, isPremium: true),
        MusicTrack(name: "Cozy Afternoon", fileName: "cozy_afternoon", artist: "Royalty Free", mood: .chill, category: .lifestyle, bpm: 75, durationSeconds: 60, isPremium: true),
    ]

    static var freeTracks: [MusicTrack] { tracks.filter { !$0.isPremium } }
    static var premiumTracks: [MusicTrack] { tracks.filter { $0.isPremium } }

    static func tracksForMood(_ mood: TrackMood) -> [MusicTrack] {
        tracks.filter { $0.mood == mood }
    }

    static func tracksForCategory(_ category: TrackCategory) -> [MusicTrack] {
        tracks.filter { $0.category == category }
    }

    static func availableTracks(isPro: Bool) -> [MusicTrack] {
        isPro ? tracks : freeTracks
    }

    static func suggestedTrack(for prompt: String) -> MusicTrack? {
        let lowered = prompt.lowercased()
        if lowered.contains("epic") || lowered.contains("summit") || lowered.contains("peak") || lowered.contains("mountain") {
            return tracks.first { $0.mood == .epic }
        } else if lowered.contains("chill") || lowered.contains("relax") || lowered.contains("sunset") {
            return tracks.first { $0.mood == .chill }
        } else if lowered.contains("fun") || lowered.contains("funny") || lowered.contains("party") {
            return tracks.first { $0.mood == .fun }
        } else if lowered.contains("workout") || lowered.contains("gym") || lowered.contains("run") {
            return tracks.first { $0.mood == .energetic }
        } else if lowered.contains("cinematic") || lowered.contains("dramatic") || lowered.contains("movie") {
            return tracks.first { $0.mood == .dramatic }
        }
        return tracks.first { $0.mood == .upbeat }
    }

    static func suggestedTrackForTemplate(_ template: HighlightTemplate) -> MusicTrack? {
        tracks.first { $0.mood == template.suggestedMusicMood }
    }
}
