import Foundation
import AVFoundation
import Accelerate

/// Detects beat positions in an audio track using onset detection via spectral flux.
/// Returns beat timestamps that can be used to align clip cuts and velocity changes.
actor BeatSyncService {
    static let shared = BeatSyncService()

    private init() {}

    struct BeatMap: Sendable {
        let bpm: Double
        let beatTimes: [Double]       // seconds of each detected beat
        let strongBeats: [Double]     // subset: downbeats / emphasized beats
        let beatInterval: Double      // seconds between beats (60/bpm)

        /// Returns the nearest beat time to a given timestamp
        func nearestBeat(to time: Double) -> Double {
            beatTimes.min(by: { abs($0 - time) < abs($1 - time) }) ?? time
        }

        /// Returns beat times within a time range
        func beats(in range: ClosedRange<Double>) -> [Double] {
            beatTimes.filter { range.contains($0) }
        }

        /// Returns strong beats within a time range
        func strongBeats(in range: ClosedRange<Double>) -> [Double] {
            strongBeats.filter { range.contains($0) }
        }
    }

    // MARK: - Beat Detection from Music Track

    func detectBeats(from musicTrack: MusicTrack) async throws -> BeatMap {
        guard let url = musicTrack.bundleURL else {
            // Fallback: generate synthetic beats from known BPM
            return syntheticBeatMap(bpm: Double(musicTrack.bpm), duration: musicTrack.durationSeconds)
        }
        return try await detectBeats(from: url, knownBPM: Double(musicTrack.bpm))
    }

    func detectBeats(from audioURL: URL, knownBPM: Double? = nil) async throws -> BeatMap {
        let asset = AVURLAsset(url: audioURL)
        let duration = try await CMTimeGetSeconds(asset.load(.duration))

        guard duration > 0, duration.isFinite else {
            throw BeatSyncError.invalidAudio
        }

        // Try to read audio samples for onset detection
        if let pcmData = try? await readAudioSamples(from: asset) {
            let onsets = detectOnsets(samples: pcmData.samples, sampleRate: pcmData.sampleRate)
            let bpm = knownBPM ?? estimateBPM(onsets: onsets, sampleRate: pcmData.sampleRate)
            let beatTimes = quantizeOnsets(onsets: onsets, bpm: bpm, sampleRate: pcmData.sampleRate, duration: duration)
            let strongBeats = identifyStrongBeats(beatTimes: beatTimes, bpm: bpm)

            return BeatMap(
                bpm: bpm,
                beatTimes: beatTimes,
                strongBeats: strongBeats,
                beatInterval: 60.0 / bpm
            )
        }

        // Fallback: synthetic beats from known or estimated BPM
        let bpm = knownBPM ?? 120.0
        return syntheticBeatMap(bpm: bpm, duration: duration)
    }

    // MARK: - Audio Sample Reading

    private struct PCMData {
        let samples: [Float]
        let sampleRate: Double
    }

    private func readAudioSamples(from asset: AVURLAsset) async throws -> PCMData {
        guard let audioTrack = try await asset.loadTracks(withMediaType: .audio).first else {
            throw BeatSyncError.noAudioTrack
        }

        let reader = try AVAssetReader(asset: asset)
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
            AVSampleRateKey: 22050,       // Downsample for faster processing
            AVNumberOfChannelsKey: 1       // Mono for analysis
        ]

        let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: outputSettings)
        reader.add(output)
        reader.startReading()

        var allSamples: [Float] = []

        while let sampleBuffer = output.copyNextSampleBuffer() {
            guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { continue }

            var length = 0
            var dataPointer: UnsafeMutablePointer<Int8>?
            CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer)

            if let data = dataPointer {
                let floatCount = length / MemoryLayout<Float>.size
                // Use memcpy instead of withMemoryRebound to avoid undefined behavior
                // when CMBlockBuffer data pointer is not 4-byte aligned for Float.
                var floatArray = [Float](repeating: 0, count: floatCount)
                memcpy(&floatArray, data, length)
                allSamples.append(contentsOf: floatArray)
            }
        }

        guard !allSamples.isEmpty else {
            throw BeatSyncError.noAudioData
        }

        return PCMData(samples: allSamples, sampleRate: 22050)
    }

    // MARK: - Onset Detection via Spectral Flux

    private func detectOnsets(samples: [Float], sampleRate: Double) -> [Int] {
        let hopSize = 512
        let frameSize = 1024
        let frameCount = (samples.count - frameSize) / hopSize

        guard frameCount > 1 else { return [] }

        // Compute energy per frame
        var energies = [Float](repeating: 0, count: frameCount)

        for i in 0..<frameCount {
            let offset = i * hopSize
            let end = min(offset + frameSize, samples.count)
            let frameSlice = Array(samples[offset..<end])

            var energy: Float = 0
            vDSP_svesq(frameSlice, 1, &energy, vDSP_Length(frameSlice.count))
            energies[i] = energy / Float(frameSlice.count)
        }

        // Compute spectral flux (positive differences in energy)
        var flux = [Float](repeating: 0, count: frameCount)
        for i in 1..<frameCount {
            let diff = energies[i] - energies[i - 1]
            flux[i] = max(0, diff)
        }

        // Adaptive threshold: local mean + factor * local stddev
        let windowSize = max(Int(sampleRate / Double(hopSize) * 0.5), 3) // ~0.5 second window
        var onsets: [Int] = []

        for i in 0..<frameCount {
            let start = max(0, i - windowSize / 2)
            let end = min(frameCount, i + windowSize / 2 + 1)
            let window = Array(flux[start..<end])

            var mean: Float = 0
            vDSP_meanv(window, 1, &mean, vDSP_Length(window.count))

            var variance: Float = 0
            for val in window {
                variance += (val - mean) * (val - mean)
            }
            variance /= Float(window.count)
            let stddev = sqrt(variance)

            let threshold = mean + 1.5 * stddev

            if flux[i] > threshold && flux[i] > 0.001 {
                // Check it's a local maximum
                let isLocalMax = (i == 0 || flux[i] >= flux[i - 1]) &&
                                 (i == frameCount - 1 || flux[i] >= flux[i + 1])
                if isLocalMax {
                    onsets.append(i)
                }
            }
        }

        // Remove onsets too close together (< 200ms apart)
        let minGapFrames = Int(0.2 * sampleRate / Double(hopSize))
        var filtered: [Int] = []
        for onset in onsets {
            if let last = filtered.last, onset - last < minGapFrames {
                continue
            }
            filtered.append(onset)
        }

        return filtered
    }

    // MARK: - BPM Estimation

    private func estimateBPM(onsets: [Int], sampleRate: Double) -> Double {
        guard onsets.count >= 2 else { return 120.0 }

        let hopSize = 512
        let intervals = zip(onsets.dropFirst(), onsets).map {
            Double($0 - $1) * Double(hopSize) / sampleRate
        }

        guard !intervals.isEmpty else { return 120.0 }

        // Median interval — filter to positive values only to prevent negative
        // medians from unsorted onsets causing infinite loops in BPM normalization.
        let positiveIntervals = intervals.filter { $0 > 0.01 }
        guard !positiveIntervals.isEmpty else { return 120.0 }

        let sorted = positiveIntervals.sorted()
        let median = sorted[sorted.count / 2]

        var bpm = 60.0 / median

        // Normalize to common range (60-180 BPM) with iteration cap to prevent
        // infinite loops from extreme values (near-zero or infinity).
        var iterations = 0
        while bpm < 60 && iterations < 20 { bpm *= 2; iterations += 1 }
        iterations = 0
        while bpm > 180 && iterations < 20 { bpm /= 2; iterations += 1 }

        // Clamp to valid range as final safety net
        return min(max(bpm, 60), 180)
    }

    // MARK: - Onset Quantization to Beat Grid

    private func quantizeOnsets(onsets: [Int], bpm: Double, sampleRate: Double, duration: Double) -> [Double] {
        let beatInterval = 60.0 / bpm
        let hopSize = 512

        // Generate a quantized beat grid
        var beatTimes: [Double] = []
        var time = 0.0

        // Find the first strong onset to align the grid
        let firstOnsetTime: Double
        if let first = onsets.first {
            firstOnsetTime = Double(first) * Double(hopSize) / sampleRate
        } else {
            firstOnsetTime = 0
        }

        // Align grid start to nearest beat before first onset
        let gridOffset = firstOnsetTime.truncatingRemainder(dividingBy: beatInterval)
        time = gridOffset

        while time < duration {
            beatTimes.append(time)
            time += beatInterval
        }

        return beatTimes
    }

    // MARK: - Strong Beat Identification

    private func identifyStrongBeats(beatTimes: [Double], bpm: Double) -> [Double] {
        // Strong beats are every 4th beat (downbeat of each measure in 4/4 time)
        // Also include every 2nd beat for half-time feel
        var strong: [Double] = []
        for (index, time) in beatTimes.enumerated() {
            if index % 4 == 0 {
                strong.append(time)
            }
        }
        return strong
    }

    // MARK: - Synthetic Beat Map

    func syntheticBeatMap(bpm: Double, duration: Double) -> BeatMap {
        // Guard against zero/negative BPM which would produce infinite interval
        // or negative interval causing an infinite loop.
        let safeBPM = bpm > 0 ? bpm : 120.0
        // Guard against non-finite or non-positive duration which would cause
        // an infinite loop (infinity) or empty/degenerate result (NaN/negative).
        let safeDuration = duration.isFinite && duration > 0 ? duration : 60.0
        let interval = 60.0 / safeBPM
        var beats: [Double] = []
        var time = 0.0

        while time < safeDuration {
            beats.append(time)
            time += interval
        }

        let strong = beats.enumerated()
            .filter { $0.offset % 4 == 0 }
            .map(\.element)

        return BeatMap(
            bpm: safeBPM,
            beatTimes: beats,
            strongBeats: strong,
            beatInterval: interval
        )
    }
}

enum BeatSyncError: LocalizedError {
    case invalidAudio
    case noAudioTrack
    case noAudioData

    var errorDescription: String? {
        switch self {
        case .invalidAudio: "The audio file could not be read."
        case .noAudioTrack: "No audio track found."
        case .noAudioData: "Could not extract audio samples."
        }
    }
}
