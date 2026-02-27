import SwiftUI
import AVKit
import CoreMedia

struct VideoPreviewPlayer: View {
    let videoURL: URL
    let trimStart: CMTime
    let trimEnd: CMTime
    @State private var player: AVPlayer?
    @State private var isPlaying = false
    @State private var timeObserverToken: Any?

    var body: some View {
        ZStack {
            if let player {
                VideoPlayer(player: player)
                    .disabled(true) // Disable default controls
                    .overlay(alignment: .bottom) {
                        playbackControls
                    }
            } else {
                RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius)
                    .fill(Theme.surfaceColor)
                    .overlay { ProgressView().tint(.white) }
            }
        }
        .frame(height: 420)
        .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
        .overlay(
            RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius)
                .stroke(Theme.surfaceLight, lineWidth: 1)
        )
        .task { await setupPlayer() }
        .onDisappear { cleanup() }
    }

    private var playbackControls: some View {
        HStack(spacing: 24) {
            // Replay
            Button {
                Task { await seekTo(trimStart) }
            } label: {
                Image(systemName: "backward.end.fill")
                    .font(.body)
                    .foregroundStyle(.white)
            }

            // Play/Pause
            Button {
                togglePlayback()
            } label: {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
            }

            // Skip to end
            Button {
                Task {
                    let nearEnd = CMTime(
                        seconds: max(CMTimeGetSeconds(trimEnd) - 2, CMTimeGetSeconds(trimStart)),
                        preferredTimescale: 600
                    )
                    await seekTo(nearEnd)
                }
            } label: {
                Image(systemName: "forward.end.fill")
                    .font(.body)
                    .foregroundStyle(.white)
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 24)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .padding(.bottom, 16)
    }

    func seekToTime(_ time: CMTime) {
        Task {
            await seekTo(time)
        }
    }

    private func setupPlayer() async {
        let playerItem = AVPlayerItem(url: videoURL)
        let newPlayer = AVPlayer(playerItem: playerItem)
        newPlayer.actionAtItemEnd = .pause

        await newPlayer.seek(to: trimStart, toleranceBefore: .zero, toleranceAfter: .zero)

        // Add boundary observer to stop at trim end
        let boundary = [NSValue(time: trimEnd)]
        let token = newPlayer.addBoundaryTimeObserver(
            forTimes: boundary,
            queue: .main
        ) { [weak newPlayer] in
            newPlayer?.pause()
            Task { @MainActor in
                isPlaying = false
            }
        }
        timeObserverToken = token
        player = newPlayer
    }

    private func togglePlayback() {
        guard let player else { return }
        if isPlaying {
            player.pause()
            isPlaying = false
        } else {
            let currentTime = player.currentTime()
            if CMTimeCompare(currentTime, trimEnd) >= 0 {
                Task {
                    await player.seek(to: trimStart, toleranceBefore: .zero, toleranceAfter: .zero)
                    player.play()
                    isPlaying = true
                }
            } else {
                player.play()
                isPlaying = true
            }
        }
    }

    private func seekTo(_ time: CMTime) async {
        guard let player else { return }
        player.pause()
        isPlaying = false
        await player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
    }

    private func cleanup() {
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
        }
        player?.pause()
        player = nil
    }
}
