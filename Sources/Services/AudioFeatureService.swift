import Foundation
import AVFoundation
import Accelerate

/// Extracts per-timestamp audio features from a video's audio track.
/// Matches the web platform's audio intelligence pipeline: energy, onset detection,
/// and frequency band analysis (bass/mid/treble) using Goertzel-style band filtering.
actor AudioFeatureService {
    static let shared = AudioFeatureService()

    private init() {}

    /// Audio features for a single timestamp, matching the web's MultiFrameInput fields.
    struct AudioFeatures: Sendable {
        let timestamp: Double        // seconds
        let audioEnergy: Double      // 0.0-1.0 normalized RMS energy
        let audioOnset: Double       // 0.0-1.0 energy delta (transient/beat strength)
        let audioBass: Double        // 0.0-1.0 energy ratio in bass band (20-300 Hz)
        let audioMid: Double         // 0.0-1.0 energy ratio in voice band (300-2000 Hz)
        let audioTreble: Double      // 0.0-1.0 energy ratio in treble band (2000-8000 Hz)
    }

    // MARK: - Public API

    /// Extract audio features at 1-second intervals from a video asset.
    /// Returns one AudioFeatures per second of video, matching the web's
    /// FRAME_SAMPLE_INTERVAL_SECONDS = 1.
    func extractFeatures(from asset: AVURLAsset) async throws -> [AudioFeatures] {
        let duration = try await CMTimeGetSeconds(asset.load(.duration))
        guard duration > 0, duration.isFinite else { return [] }

        // Read audio as mono 22050 Hz float PCM (matches BeatSyncService)
        let sampleRate: Double = 22050
        let pcmData = try await readMonoPCM(from: asset, sampleRate: sampleRate)
        guard !pcmData.isEmpty else { return [] }

        let samplesPerSecond = Int(sampleRate)
        let totalSeconds = Int(duration)
        guard totalSeconds > 0 else { return [] }

        // Compute per-second RMS energy
        var energies: [Double] = []
        for sec in 0..<totalSeconds {
            let startSample = sec * samplesPerSecond
            let endSample = min(startSample + samplesPerSecond, pcmData.count)
            guard startSample < pcmData.count else {
                energies.append(0)
                continue
            }
            let chunk = Array(pcmData[startSample..<endSample])
            energies.append(rmsEnergy(chunk))
        }

        // Normalize energies to 0-1
        let maxEnergy = energies.max() ?? 1
        let normalizedEnergies = maxEnergy > 0.0001
            ? energies.map { min($0 / maxEnergy, 1.0) }
            : energies.map { _ in 0.0 }

        // Compute onsets (energy deltas)
        var onsets: [Double] = [0]
        for i in 1..<normalizedEnergies.count {
            let delta = max(0, normalizedEnergies[i] - normalizedEnergies[i - 1])
            onsets.append(delta)
        }
        // Normalize onsets to 0-1
        let maxOnset = onsets.max() ?? 1
        let normalizedOnsets = maxOnset > 0.0001
            ? onsets.map { min($0 / maxOnset, 1.0) }
            : onsets.map { _ in 0.0 }

        // Compute per-second frequency band ratios
        var features: [AudioFeatures] = []
        for sec in 0..<totalSeconds {
            let startSample = sec * samplesPerSecond
            let endSample = min(startSample + samplesPerSecond, pcmData.count)
            guard startSample < pcmData.count else {
                features.append(AudioFeatures(
                    timestamp: Double(sec),
                    audioEnergy: 0, audioOnset: 0,
                    audioBass: 0.33, audioMid: 0.34, audioTreble: 0.33
                ))
                continue
            }

            let chunk = Array(pcmData[startSample..<endSample])
            let bands = frequencyBands(chunk, sampleRate: sampleRate)

            features.append(AudioFeatures(
                timestamp: Double(sec),
                audioEnergy: normalizedEnergies[sec],
                audioOnset: normalizedOnsets[sec],
                audioBass: bands.bass,
                audioMid: bands.mid,
                audioTreble: bands.treble
            ))
        }

        return features
    }

    // MARK: - PCM Reading

    private func readMonoPCM(from asset: AVURLAsset, sampleRate: Double) async throws -> [Float] {
        guard let audioTrack = try await asset.loadTracks(withMediaType: .audio).first else {
            return []
        }

        let reader = try AVAssetReader(asset: asset)
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: 1
        ]

        let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: outputSettings)
        reader.add(output)
        reader.startReading()

        var allSamples: [Float] = []
        while let sampleBuffer = output.copyNextSampleBuffer() {
            guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { continue }
            var length = 0
            var dataPointer: UnsafeMutablePointer<Int8>?
            CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil,
                                        totalLengthOut: &length, dataPointerOut: &dataPointer)
            if let data = dataPointer {
                let floatCount = length / MemoryLayout<Float>.size
                var floatArray = [Float](repeating: 0, count: floatCount)
                memcpy(&floatArray, data, length)
                allSamples.append(contentsOf: floatArray)
            }
        }

        return allSamples
    }

    // MARK: - RMS Energy

    private func rmsEnergy(_ samples: [Float]) -> Double {
        guard !samples.isEmpty else { return 0 }
        var sumSquares: Float = 0
        vDSP_svesq(samples, 1, &sumSquares, vDSP_Length(samples.count))
        return Double(sqrt(sumSquares / Float(samples.count)))
    }

    // MARK: - Frequency Band Analysis

    /// Compute energy ratios in bass (20-300 Hz), mid (300-2000 Hz), and treble (2000-8000 Hz)
    /// using FFT-based band energy estimation. Returns ratios that sum to ~1.0.
    private func frequencyBands(_ samples: [Float], sampleRate: Double) -> (bass: Double, mid: Double, treble: Double) {
        // Use a power-of-2 FFT size
        let fftSize = 2048
        guard samples.count >= fftSize else {
            return (bass: 0.33, mid: 0.34, treble: 0.33)
        }

        // Take the first fftSize samples (center of the chunk for better representation)
        let offset = max(0, (samples.count - fftSize) / 2)
        let window = Array(samples[offset..<(offset + fftSize)])

        // Apply Hann window
        var windowed = [Float](repeating: 0, count: fftSize)
        var hanningWindow = [Float](repeating: 0, count: fftSize)
        vDSP_hann_window(&hanningWindow, vDSP_Length(fftSize), Int32(vDSP_HANN_NORM))
        vDSP_vmul(window, 1, hanningWindow, 1, &windowed, 1, vDSP_Length(fftSize))

        // FFT setup
        let log2n = vDSP_Length(log2(Double(fftSize)))
        guard let fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else {
            return (bass: 0.33, mid: 0.34, treble: 0.33)
        }
        defer { vDSP_destroy_fftsetup(fftSetup) }

        // Pack into split complex
        let halfN = fftSize / 2
        var realPart = [Float](repeating: 0, count: halfN)
        var imagPart = [Float](repeating: 0, count: halfN)
        windowed.withUnsafeBufferPointer { ptr in
            ptr.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: halfN) { complexPtr in
                var splitComplex = DSPSplitComplex(realp: &realPart, imagp: &imagPart)
                vDSP_ctoz(complexPtr, 2, &splitComplex, 1, vDSP_Length(halfN))
            }
        }

        // Forward FFT
        var splitComplex = DSPSplitComplex(realp: &realPart, imagp: &imagPart)
        vDSP_fft_zrip(fftSetup, &splitComplex, 1, log2n, FFTDirection(kFFTDirection_Forward))

        // Compute magnitude squared
        var magnitudes = [Float](repeating: 0, count: halfN)
        vDSP_zvmags(&splitComplex, 1, &magnitudes, 1, vDSP_Length(halfN))

        // Frequency resolution: each bin = sampleRate / fftSize Hz
        let freqPerBin = sampleRate / Double(fftSize)

        // Band boundaries in bins
        let bassBinStart = max(1, Int(20.0 / freqPerBin))
        let bassBinEnd = Int(300.0 / freqPerBin)
        let midBinEnd = Int(2000.0 / freqPerBin)
        let trebleBinEnd = min(halfN - 1, Int(8000.0 / freqPerBin))

        // Sum energy in each band
        func bandEnergy(_ start: Int, _ end: Int) -> Double {
            guard start < end, end <= magnitudes.count else { return 0 }
            var sum: Float = 0
            vDSP_sve(Array(magnitudes[start..<end]), 1, &sum, vDSP_Length(end - start))
            return Double(sum)
        }

        let bassE = bandEnergy(bassBinStart, bassBinEnd)
        let midE = bandEnergy(bassBinEnd, midBinEnd)
        let trebleE = bandEnergy(midBinEnd, trebleBinEnd)

        let total = bassE + midE + trebleE
        guard total > 0.0001 else {
            return (bass: 0.33, mid: 0.34, treble: 0.33)
        }

        return (
            bass: bassE / total,
            mid: midE / total,
            treble: trebleE / total
        )
    }
}
