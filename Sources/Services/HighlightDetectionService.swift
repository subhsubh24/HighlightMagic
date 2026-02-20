import Foundation
import AVFoundation
import Vision
import CoreImage

actor HighlightDetectionService {
    static let shared = HighlightDetectionService()

    private init() {}

    struct DetectionResult: Sendable {
        var segments: [HighlightSegment]
        var overallConfidence: Double
    }

    // MARK: - Main Detection Pipeline

    func detectHighlights(
        in videoURL: URL,
        prompt: String,
        progressHandler: @Sendable (Double) -> Void
    ) async throws -> DetectionResult {
        let asset = AVURLAsset(url: videoURL)
        let duration = try await asset.load(.duration)
        let totalSeconds = CMTimeGetSeconds(duration)

        guard totalSeconds > 0 else {
            throw DetectionError.invalidVideo
        }

        // Phase 1: Motion analysis (0-30%)
        progressHandler(0.05)
        let motionScores = await analyzeMotion(asset: asset, totalSeconds: totalSeconds) { phase in
            progressHandler(0.05 + phase * 0.25)
        }

        // Phase 2: Face detection (30-50%)
        progressHandler(0.30)
        let faceScores = await analyzeFaces(asset: asset, totalSeconds: totalSeconds) { phase in
            progressHandler(0.30 + phase * 0.20)
        }

        // Phase 3: Scene classification (50-70%)
        progressHandler(0.50)
        let sceneScores = await analyzeScenes(asset: asset, totalSeconds: totalSeconds) { phase in
            progressHandler(0.50 + phase * 0.20)
        }

        // Phase 4: Prompt-based semantic scoring (70-90%)
        progressHandler(0.70)
        let semanticScores = computeSemanticScores(
            motionScores: motionScores,
            faceScores: faceScores,
            sceneScores: sceneScores,
            prompt: prompt,
            totalSeconds: totalSeconds
        )
        progressHandler(0.90)

        // Phase 5: Merge & rank segments (90-100%)
        let segments = buildSegments(
            from: semanticScores,
            totalSeconds: totalSeconds,
            prompt: prompt
        )
        progressHandler(1.0)

        let avgConfidence = segments.isEmpty ? 0 : segments.map(\.confidenceScore).reduce(0, +) / Double(segments.count)

        return DetectionResult(
            segments: segments,
            overallConfidence: avgConfidence
        )
    }

    // MARK: - Motion Analysis

    private func analyzeMotion(
        asset: AVURLAsset,
        totalSeconds: Double,
        progressHandler: @Sendable (Double) -> Void
    ) async -> [Double] {
        let sampleCount = min(Int(totalSeconds * 2), 120) // 2 samples/sec, max 120
        guard sampleCount > 1 else { return [0.5] }

        let interval = totalSeconds / Double(sampleCount)
        var scores = [Double](repeating: 0, count: sampleCount)

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 320, height: 320)

        var previousPixelBuffer: CVPixelBuffer?

        for i in 0..<sampleCount {
            let time = CMTime(seconds: interval * Double(i), preferredTimescale: 600)

            guard let cgImage = try? await generator.image(at: time).image else {
                continue
            }

            let ciImage = CIImage(cgImage: cgImage)
            let context = CIContext()

            guard let pixelBuffer = context.createPixelBuffer(from: ciImage) else {
                continue
            }

            if let prev = previousPixelBuffer {
                scores[i] = computeFrameDifference(prev, pixelBuffer)
            }

            previousPixelBuffer = pixelBuffer
            progressHandler(Double(i) / Double(sampleCount))
        }

        return normalizeScores(scores)
    }

    private func computeFrameDifference(_ buffer1: CVPixelBuffer, _ buffer2: CVPixelBuffer) -> Double {
        CVPixelBufferLockBaseAddress(buffer1, .readOnly)
        CVPixelBufferLockBaseAddress(buffer2, .readOnly)
        defer {
            CVPixelBufferUnlockBaseAddress(buffer1, .readOnly)
            CVPixelBufferUnlockBaseAddress(buffer2, .readOnly)
        }

        guard let base1 = CVPixelBufferGetBaseAddress(buffer1),
              let base2 = CVPixelBufferGetBaseAddress(buffer2) else {
            return 0
        }

        let byteCount = min(
            CVPixelBufferGetDataSize(buffer1),
            CVPixelBufferGetDataSize(buffer2)
        )
        let sampleStride = max(byteCount / 1000, 1) // Sample ~1000 pixels

        let ptr1 = base1.assumingMemoryBound(to: UInt8.self)
        let ptr2 = base2.assumingMemoryBound(to: UInt8.self)

        var totalDiff: Double = 0
        var sampleCount = 0

        for offset in stride(from: 0, to: byteCount, by: sampleStride) {
            let diff = abs(Int(ptr1[offset]) - Int(ptr2[offset]))
            totalDiff += Double(diff)
            sampleCount += 1
        }

        guard sampleCount > 0 else { return 0 }
        return totalDiff / Double(sampleCount) / 255.0
    }

    // MARK: - Face Detection

    private func analyzeFaces(
        asset: AVURLAsset,
        totalSeconds: Double,
        progressHandler: @Sendable (Double) -> Void
    ) async -> [Double] {
        let sampleCount = min(Int(totalSeconds), 60) // 1 sample/sec, max 60
        guard sampleCount > 0 else { return [0] }

        let interval = totalSeconds / Double(sampleCount)
        var scores = [Double](repeating: 0, count: sampleCount)

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 640, height: 640)

        for i in 0..<sampleCount {
            let time = CMTime(seconds: interval * Double(i), preferredTimescale: 600)

            guard let cgImage = try? await generator.image(at: time).image else {
                continue
            }

            let request = VNDetectFaceRectanglesRequest()
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

            do {
                try handler.perform([request])
                let faceCount = request.results?.count ?? 0
                let faceSizes = request.results?.map { $0.boundingBox.width * $0.boundingBox.height } ?? []
                let totalFaceArea = faceSizes.reduce(0, +)

                // Score based on face presence + prominence
                scores[i] = min(Double(faceCount) * 0.3 + Double(totalFaceArea) * 2.0, 1.0)
            } catch {
                scores[i] = 0
            }

            progressHandler(Double(i) / Double(sampleCount))
        }

        return normalizeScores(scores)
    }

    // MARK: - Scene Classification

    private func analyzeScenes(
        asset: AVURLAsset,
        totalSeconds: Double,
        progressHandler: @Sendable (Double) -> Void
    ) async -> [Double] {
        let sampleCount = min(Int(totalSeconds), 60)
        guard sampleCount > 0 else { return [0] }

        let interval = totalSeconds / Double(sampleCount)
        var scores = [Double](repeating: 0.3, count: sampleCount)

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 640, height: 640)

        for i in 0..<sampleCount {
            let time = CMTime(seconds: interval * Double(i), preferredTimescale: 600)

            guard let cgImage = try? await generator.image(at: time).image else {
                continue
            }

            // Use saliency detection as a scene interest proxy
            let saliencyRequest = VNGenerateAttentionBasedSaliencyImageRequest()
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

            do {
                try handler.perform([saliencyRequest])
                if let saliencyMap = saliencyRequest.results?.first {
                    let salientObjects = saliencyMap.salientObjects ?? []
                    let maxConfidence = salientObjects.map(\.confidence).max() ?? 0
                    scores[i] = Double(maxConfidence)
                }
            } catch {
                scores[i] = 0.3
            }

            progressHandler(Double(i) / Double(sampleCount))
        }

        return normalizeScores(scores)
    }

    // MARK: - Semantic Scoring

    private func computeSemanticScores(
        motionScores: [Double],
        faceScores: [Double],
        sceneScores: [Double],
        prompt: String,
        totalSeconds: Double
    ) -> [Double] {
        let maxCount = max(motionScores.count, max(faceScores.count, sceneScores.count))
        guard maxCount > 0 else { return [0.5] }

        var combined = [Double](repeating: 0, count: maxCount)

        // Determine weights based on prompt
        let weights = promptBasedWeights(for: prompt)

        for i in 0..<maxCount {
            let motionIdx = i * motionScores.count / maxCount
            let faceIdx = i * faceScores.count / maxCount
            let sceneIdx = i * sceneScores.count / maxCount

            let motion = motionScores.indices.contains(motionIdx) ? motionScores[motionIdx] : 0
            let face = faceScores.indices.contains(faceIdx) ? faceScores[faceIdx] : 0
            let scene = sceneScores.indices.contains(sceneIdx) ? sceneScores[sceneIdx] : 0

            combined[i] = motion * weights.motion + face * weights.face + scene * weights.scene
        }

        return combined
    }

    private struct DetectionWeights: Sendable {
        let motion: Double
        let face: Double
        let scene: Double
    }

    private func promptBasedWeights(for prompt: String) -> DetectionWeights {
        let lowered = prompt.lowercased()

        if lowered.contains("face") || lowered.contains("smile") || lowered.contains("reaction")
            || lowered.contains("family") || lowered.contains("baby") {
            return DetectionWeights(motion: 0.2, face: 0.5, scene: 0.3)
        }

        if lowered.contains("action") || lowered.contains("sport") || lowered.contains("jump")
            || lowered.contains("run") || lowered.contains("workout") || lowered.contains("dance") {
            return DetectionWeights(motion: 0.5, face: 0.2, scene: 0.3)
        }

        if lowered.contains("scenic") || lowered.contains("landscape") || lowered.contains("sunset")
            || lowered.contains("view") || lowered.contains("summit") || lowered.contains("peak") {
            return DetectionWeights(motion: 0.2, face: 0.2, scene: 0.6)
        }

        // Default balanced
        return DetectionWeights(motion: 0.35, face: 0.30, scene: 0.35)
    }

    // MARK: - Segment Building

    private func buildSegments(
        from scores: [Double],
        totalSeconds: Double,
        prompt: String
    ) -> [HighlightSegment] {
        guard !scores.isEmpty else { return [] }

        let interval = totalSeconds / Double(scores.count)

        // Find peaks above threshold
        let threshold = scores.sorted().dropLast(scores.count / 3).last ?? 0.3
        let effectiveThreshold = max(threshold, Constants.highlightConfidenceThreshold)

        var peaks: [(index: Int, score: Double)] = []

        for i in 0..<scores.count {
            guard scores[i] >= effectiveThreshold else { continue }

            let isLocalPeak: Bool
            if i == 0 {
                isLocalPeak = scores.count == 1 || scores[i] >= scores[i + 1]
            } else if i == scores.count - 1 {
                isLocalPeak = scores[i] >= scores[i - 1]
            } else {
                isLocalPeak = scores[i] >= scores[i - 1] && scores[i] >= scores[i + 1]
            }

            if isLocalPeak {
                peaks.append((i, scores[i]))
            }
        }

        // Sort by score, take top peaks
        peaks.sort { $0.score > $1.score }

        // Merge close peaks and build segments
        var segments: [HighlightSegment] = []
        var usedIndices: Set<Int> = []

        for peak in peaks.prefix(Constants.targetClipCount * 2) {
            guard !usedIndices.contains(peak.index) else { continue }

            // Expand around peak to form a clip
            let peakTimeSec = Double(peak.index) * interval
            let clipDuration = min(
                max(Constants.minClipDuration, 30.0),
                Constants.maxClipDuration
            )
            let halfClip = clipDuration / 2.0

            let startSec = max(0, peakTimeSec - halfClip)
            let endSec = min(totalSeconds, peakTimeSec + halfClip)

            // Mark used indices
            let startIdx = Int(startSec / interval)
            let endIdx = min(Int(endSec / interval), scores.count - 1)
            for idx in startIdx...endIdx {
                usedIndices.insert(idx)
            }

            let label = generateLabel(score: peak.score, prompt: prompt)

            segments.append(HighlightSegment(
                startTime: CMTime(seconds: startSec, preferredTimescale: 600),
                endTime: CMTime(seconds: endSec, preferredTimescale: 600),
                confidenceScore: peak.score,
                label: label,
                detectionSources: [.visionMotion, .visionFace, .visionScene]
            ))

            if segments.count >= Constants.targetClipCount { break }
        }

        // Sort by start time
        segments.sort { $0.startSeconds < $1.startSeconds }

        // If no segments found, create one from the best overall section
        if segments.isEmpty {
            let bestIdx = scores.enumerated().max(by: { $0.element < $1.element })?.offset ?? 0
            let peakTime = Double(bestIdx) * interval
            let startSec = max(0, peakTime - 15)
            let endSec = min(totalSeconds, peakTime + 15)

            segments.append(HighlightSegment(
                startTime: CMTime(seconds: startSec, preferredTimescale: 600),
                endTime: CMTime(seconds: endSec, preferredTimescale: 600),
                confidenceScore: scores[bestIdx],
                label: "Best Moment",
                detectionSources: [.visionMotion]
            ))
        }

        return segments
    }

    private func generateLabel(score: Double, prompt: String) -> String {
        if !prompt.isEmpty {
            return prompt.prefix(30).capitalized
        }

        switch score {
        case 0.8...: return "Peak Moment"
        case 0.6..<0.8: return "Key Highlight"
        default: return "Notable Scene"
        }
    }

    // MARK: - Utilities

    private func normalizeScores(_ scores: [Double]) -> [Double] {
        guard let maxVal = scores.max(), maxVal > 0 else { return scores }
        return scores.map { $0 / maxVal }
    }
}

extension CIContext {
    func createPixelBuffer(from ciImage: CIImage) -> CVPixelBuffer? {
        let width = Int(ciImage.extent.width)
        let height = Int(ciImage.extent.height)

        var pixelBuffer: CVPixelBuffer?
        let attrs: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
        ]

        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            width, height,
            kCVPixelFormatType_32BGRA,
            attrs as CFDictionary,
            &pixelBuffer
        )

        guard status == kCVReturnSuccess, let buffer = pixelBuffer else { return nil }
        render(ciImage, to: buffer)
        return buffer
    }
}

enum DetectionError: LocalizedError {
    case invalidVideo
    case analysisFailure(String)

    var errorDescription: String? {
        switch self {
        case .invalidVideo: "The video could not be analyzed."
        case .analysisFailure(let reason): "Analysis failed: \(reason)"
        }
    }
}
