import Foundation

struct MusicTrack: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let fileName: String
    let fileExtension: String
    let artist: String
    let mood: TrackMood
    let bpm: Int
    let durationSeconds: Double

    init(
        id: UUID = UUID(),
        name: String,
        fileName: String,
        fileExtension: String = "mp3",
        artist: String,
        mood: TrackMood,
        bpm: Int,
        durationSeconds: Double
    ) {
        self.id = id
        self.name = name
        self.fileName = fileName
        self.fileExtension = fileExtension
        self.artist = artist
        self.mood = mood
        self.bpm = bpm
        self.durationSeconds = durationSeconds
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
}

struct MusicLibrary {
    static let tracks: [MusicTrack] = [
        MusicTrack(
            name: "Summer Vibes",
            fileName: "summer_vibes",
            artist: "Royalty Free",
            mood: .upbeat,
            bpm: 120,
            durationSeconds: 60
        ),
        MusicTrack(
            name: "Golden Hour",
            fileName: "golden_hour",
            artist: "Royalty Free",
            mood: .chill,
            bpm: 90,
            durationSeconds: 60
        ),
        MusicTrack(
            name: "Peak Moment",
            fileName: "peak_moment",
            artist: "Royalty Free",
            mood: .epic,
            bpm: 140,
            durationSeconds: 60
        ),
        MusicTrack(
            name: "Happy Days",
            fileName: "happy_days",
            artist: "Royalty Free",
            mood: .fun,
            bpm: 110,
            durationSeconds: 60
        ),
        MusicTrack(
            name: "Power Up",
            fileName: "power_up",
            artist: "Royalty Free",
            mood: .energetic,
            bpm: 150,
            durationSeconds: 60
        )
    ]

    static func tracksForMood(_ mood: TrackMood) -> [MusicTrack] {
        tracks.filter { $0.mood == mood }
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
        }
        return tracks.first { $0.mood == .upbeat }
    }
}
