import SwiftUI

struct MusicPickerSheet: View {
    @Binding var selectedTrack: MusicTrack?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.backgroundGradient
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 12) {
                        // No music option
                        MusicTrackRow(
                            name: "No Music",
                            artist: "Original audio only",
                            mood: nil,
                            isSelected: selectedTrack == nil
                        ) {
                            selectedTrack = nil
                            dismiss()
                        }

                        ForEach(MusicLibrary.tracks) { track in
                            MusicTrackRow(
                                name: track.name,
                                artist: track.artist,
                                mood: track.mood,
                                isSelected: selectedTrack?.id == track.id
                            ) {
                                selectedTrack = track
                                dismiss()
                            }
                        }
                    }
                    .padding(Constants.Layout.padding)
                }
            }
            .navigationTitle("Choose Music")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Theme.accent)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

struct MusicTrackRow: View {
    let name: String
    let artist: String
    let mood: TrackMood?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                // Icon
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(moodColor.opacity(0.2))
                        .frame(width: 44, height: 44)

                    Image(systemName: mood != nil ? "music.note" : "speaker.slash")
                        .foregroundStyle(moodColor)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(Theme.headline)
                        .foregroundStyle(.white)

                    HStack(spacing: 6) {
                        Text(artist)
                            .font(Theme.caption)
                            .foregroundStyle(Theme.textTertiary)

                        if let mood {
                            Text(mood.rawValue)
                                .font(.caption2)
                                .foregroundStyle(moodColor)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(moodColor.opacity(0.15))
                                .clipShape(Capsule())
                        }
                    }
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Theme.accent)
                }
            }
            .padding(12)
            .background(isSelected ? Theme.accent.opacity(0.1) : Theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.smallCornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: Constants.Layout.smallCornerRadius)
                    .stroke(isSelected ? Theme.accent : Theme.surfaceLight, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var moodColor: Color {
        guard let mood else { return .gray }
        switch mood {
        case .upbeat: .orange
        case .chill: .blue
        case .epic: .red
        case .fun: .yellow
        case .energetic: .green
        }
    }
}
