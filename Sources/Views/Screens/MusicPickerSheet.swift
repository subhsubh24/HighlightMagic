import SwiftUI

struct MusicPickerSheet: View {
    @Binding var selectedTrack: MusicTrack?
    @Environment(\.dismiss) private var dismiss
    @State private var selectedCategory: TrackCategory? = nil

    private var filteredTracks: [MusicTrack] {
        if let category = selectedCategory {
            return MusicLibrary.tracks.filter { $0.category == category }
        }
        return MusicLibrary.tracks
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.backgroundGradient
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    // Category filter
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            CategoryChip(name: "All", isSelected: selectedCategory == nil) {
                                selectedCategory = nil
                            }
                            ForEach(TrackCategory.allCases, id: \.self) { category in
                                CategoryChip(
                                    name: category.rawValue,
                                    isSelected: selectedCategory == category
                                ) {
                                    selectedCategory = category
                                }
                            }
                        }
                        .padding(.horizontal, Constants.Layout.padding)
                        .padding(.vertical, 8)
                    }

                    ScrollView {
                        VStack(spacing: 10) {
                            // No music option
                            MusicTrackRow(
                                name: "No Music",
                                artist: "Original audio only",
                                mood: nil,
                                isPremium: false,
                                isSelected: selectedTrack == nil
                            ) {
                                selectedTrack = nil
                                dismiss()
                            }

                            ForEach(filteredTracks) { track in
                                MusicTrackRow(
                                    name: track.name,
                                    artist: track.artist,
                                    mood: track.mood,
                                    isPremium: track.isPremium,
                                    isSelected: selectedTrack?.id == track.id
                                ) {
                                    selectedTrack = track
                                    dismiss()
                                }
                            }
                        }
                        .padding(.horizontal, Constants.Layout.padding)
                        .padding(.bottom, Constants.Layout.padding)
                    }
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

private struct CategoryChip: View {
    let name: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(name)
                .font(.caption.bold())
                .foregroundStyle(isSelected ? .white : Theme.textSecondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(isSelected ? AnyShapeStyle(Theme.primaryGradient) : AnyShapeStyle(Theme.surfaceColor))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct MusicTrackRow: View {
    let name: String
    let artist: String
    let mood: TrackMood?
    let isPremium: Bool
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(moodColor.opacity(0.2))
                        .frame(width: 44, height: 44)

                    Image(systemName: mood != nil ? "music.note" : "speaker.slash")
                        .foregroundStyle(moodColor)
                }

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(name)
                            .font(Theme.headline)
                            .foregroundStyle(.white)

                        if isPremium {
                            Text("PRO")
                                .font(.system(size: 8, weight: .heavy))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Theme.primaryGradient)
                                .clipShape(Capsule())
                        }
                    }

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
        case .dramatic: .purple
        case .funny: .pink
        }
    }
}
