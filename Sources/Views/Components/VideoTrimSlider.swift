import SwiftUI
import CoreMedia
import AVFoundation

struct VideoTrimSlider: View {
    @Binding var trimStart: CMTime
    @Binding var trimEnd: CMTime
    let segmentStart: CMTime
    let segmentEnd: CMTime
    let thumbnails: [UIImage]
    var onSeek: ((CMTime) -> Void)?

    @State private var isDraggingStart = false
    @State private var isDraggingEnd = false
    @State private var isDraggingPlayhead = false
    @State private var playheadPosition: Double = 0

    private let handleWidth: CGFloat = 16
    private let sliderHeight: CGFloat = 56

    private var totalDuration: Double {
        max(CMTimeGetSeconds(segmentEnd) - CMTimeGetSeconds(segmentStart), 0.01)
    }

    private var startFraction: Double {
        (CMTimeGetSeconds(trimStart) - CMTimeGetSeconds(segmentStart)) / totalDuration
    }

    private var endFraction: Double {
        (CMTimeGetSeconds(trimEnd) - CMTimeGetSeconds(segmentStart)) / totalDuration
    }

    var body: some View {
        GeometryReader { geometry in
            let totalWidth = geometry.size.width
            let usableWidth = totalWidth - handleWidth * 2

            ZStack(alignment: .leading) {
                // Thumbnail strip
                thumbnailStrip(totalWidth: totalWidth)

                // Dimmed regions outside selection
                dimmedOverlay(totalWidth: totalWidth, usableWidth: usableWidth)

                // Selection border
                selectionBorder(totalWidth: totalWidth, usableWidth: usableWidth)

                // Left handle
                trimHandle(isLeft: true, totalWidth: totalWidth, usableWidth: usableWidth)

                // Right handle
                trimHandle(isLeft: false, totalWidth: totalWidth, usableWidth: usableWidth)

                // Playhead
                playheadIndicator(totalWidth: totalWidth, usableWidth: usableWidth)
            }
        }
        .frame(height: sliderHeight)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Video trim slider")
        .accessibilityValue("Start \(formatTime(CMTimeGetSeconds(trimStart))), End \(formatTime(CMTimeGetSeconds(trimEnd)))")
    }

    // MARK: - Thumbnail Strip

    @ViewBuilder
    private func thumbnailStrip(totalWidth: CGFloat) -> some View {
        if !thumbnails.isEmpty {
            HStack(spacing: 0) {
                ForEach(thumbnails.indices, id: \.self) { index in
                    Image(uiImage: thumbnails[index])
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(
                            width: totalWidth / CGFloat(thumbnails.count),
                            height: sliderHeight
                        )
                        .clipped()
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            RoundedRectangle(cornerRadius: 8)
                .fill(Theme.surfaceLight)
                .frame(height: sliderHeight)
        }
    }

    // MARK: - Dimmed Overlay

    private func dimmedOverlay(totalWidth: CGFloat, usableWidth: CGFloat) -> some View {
        ZStack(alignment: .leading) {
            // Left dim
            Rectangle()
                .fill(.black.opacity(0.55))
                .frame(width: max(handleWidth + startFraction * usableWidth, 0))
                .frame(height: sliderHeight)

            // Right dim
            Rectangle()
                .fill(.black.opacity(0.55))
                .frame(width: max(totalWidth - (handleWidth + endFraction * usableWidth), 0))
                .frame(height: sliderHeight)
                .offset(x: handleWidth + endFraction * usableWidth)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .allowsHitTesting(false)
    }

    // MARK: - Selection Border

    private func selectionBorder(totalWidth: CGFloat, usableWidth: CGFloat) -> some View {
        let startX = handleWidth + startFraction * usableWidth
        let endX = handleWidth + endFraction * usableWidth
        let width = max(endX - startX, 0)

        return RoundedRectangle(cornerRadius: 4)
            .stroke(Theme.accent, lineWidth: 2.5)
            .frame(width: width, height: sliderHeight)
            .offset(x: startX)
            .allowsHitTesting(false)
    }

    // MARK: - Handle

    private func trimHandle(isLeft: Bool, totalWidth: CGFloat, usableWidth: CGFloat) -> some View {
        let fraction = isLeft ? startFraction : endFraction
        let xOffset = isLeft
            ? fraction * usableWidth
            : handleWidth + fraction * usableWidth

        return RoundedRectangle(cornerRadius: 4)
            .fill(Theme.accent)
            .frame(width: handleWidth, height: sliderHeight)
            .overlay {
                RoundedRectangle(cornerRadius: 2)
                    .fill(.white)
                    .frame(width: 3, height: 20)
            }
            .offset(x: xOffset)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        let newFraction = clampFraction(
                            (value.location.x - handleWidth) / usableWidth,
                            isLeft: isLeft
                        )
                        let newSeconds = CMTimeGetSeconds(segmentStart) + newFraction * totalDuration
                        let newTime = CMTime(seconds: newSeconds, preferredTimescale: 600)

                        if isLeft {
                            trimStart = newTime
                            isDraggingStart = true
                        } else {
                            trimEnd = newTime
                            isDraggingEnd = true
                        }
                        onSeek?(newTime)
                    }
                    .onEnded { _ in
                        isDraggingStart = false
                        isDraggingEnd = false
                        enforceClipLimits()
                    }
            )
            .scaleEffect(
                (isLeft ? isDraggingStart : isDraggingEnd) ? 1.1 : 1.0,
                anchor: isLeft ? .leading : .trailing
            )
            .animation(.easeOut(duration: 0.15), value: isLeft ? isDraggingStart : isDraggingEnd)
    }

    // MARK: - Playhead

    private func playheadIndicator(totalWidth: CGFloat, usableWidth: CGFloat) -> some View {
        let startX = handleWidth + startFraction * usableWidth
        let endX = handleWidth + endFraction * usableWidth
        let selectionWidth = max(endX - startX, 1)
        let xPos = startX + playheadPosition * selectionWidth

        return Rectangle()
            .fill(.white)
            .frame(width: 2, height: sliderHeight + 8)
            .shadow(color: .black.opacity(0.3), radius: 2)
            .offset(x: xPos)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        isDraggingPlayhead = true
                        let fraction = (value.location.x - startX) / selectionWidth
                        playheadPosition = min(max(fraction, 0), 1)

                        let seekSeconds = CMTimeGetSeconds(trimStart)
                            + playheadPosition * (CMTimeGetSeconds(trimEnd) - CMTimeGetSeconds(trimStart))
                        let seekTime = CMTime(seconds: seekSeconds, preferredTimescale: 600)
                        onSeek?(seekTime)
                    }
                    .onEnded { _ in
                        isDraggingPlayhead = false
                    }
            )
            .allowsHitTesting(true)
    }

    // MARK: - Helpers

    private func clampFraction(_ fraction: Double, isLeft: Bool) -> Double {
        let minGap = Constants.minClipDuration / totalDuration
        if isLeft {
            return min(max(fraction, 0), endFraction - minGap)
        } else {
            return min(max(fraction, startFraction + minGap), 1.0)
        }
    }

    private func enforceClipLimits() {
        let currentDuration = CMTimeGetSeconds(trimEnd) - CMTimeGetSeconds(trimStart)
        if currentDuration > Constants.maxClipDuration {
            trimEnd = CMTime(
                seconds: CMTimeGetSeconds(trimStart) + Constants.maxClipDuration,
                preferredTimescale: 600
            )
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }
}
