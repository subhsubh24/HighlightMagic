import SwiftUI

struct ClipCard: View {
    let clip: EditedClip
    let thumbnail: UIImage?
    let onTap: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            onTap()
        } label: {
            VStack(spacing: 0) {
                // Thumbnail
                ZStack {
                    if let thumbnail {
                        Image(uiImage: thumbnail)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(height: 180)
                            .clipped()
                    } else {
                        Rectangle()
                            .fill(Theme.surfaceLight)
                            .frame(height: 180)
                            .overlay {
                                Image(systemName: "film")
                                    .font(.title)
                                    .foregroundStyle(Theme.textTertiary)
                            }
                    }

                    // Play icon overlay
                    Circle()
                        .fill(.ultraThinMaterial)
                        .frame(width: 48, height: 48)
                        .overlay {
                            Image(systemName: "play.fill")
                                .foregroundStyle(.white)
                                .font(.body)
                        }

                    // Duration badge
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            Text(formatDuration(clip.duration))
                                .font(.caption2.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(.black.opacity(0.6))
                                .clipShape(Capsule())
                        }
                    }
                    .padding(10)
                }

                // Info row
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(clip.segment.label)
                            .font(Theme.headline)
                            .foregroundStyle(.white)
                            .lineLimit(1)

                        Text(clip.segment.timeRangeDescription)
                            .font(Theme.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }

                    Spacer()

                    // Confidence indicator
                    ConfidenceBadge(score: clip.segment.confidenceScore)

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(Theme.textTertiary)
                }
                .padding(14)
                .background(Theme.surfaceColor)
            }
            .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius)
                    .stroke(Theme.surfaceLight, lineWidth: 1)
            )
        }
        .buttonStyle(ScaleButtonStyle())
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let s = Int(seconds)
        return "\(s)s"
    }
}

struct ConfidenceBadge: View {
    let score: Double

    private var color: Color {
        switch score {
        case 0.8...: .green
        case 0.6..<0.8: .yellow
        default: .orange
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text("\(Int(score * 100))%")
                .font(.caption2.bold())
                .foregroundStyle(color)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.15))
        .clipShape(Capsule())
    }
}
