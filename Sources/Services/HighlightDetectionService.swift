import Foundation
import AVFoundation
import Vision
import CoreImage
import os.log

actor HighlightDetectionService {
    static let shared = HighlightDetectionService()

    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "Detection")
    // Reuse a single CIContext instead of creating one per frame — CIContext is expensive to create.
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

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

        // Chunked processing: reduce sample density for long videos (>5 min)
        let isLongVideo = totalSeconds > 300
        if isLongVideo {
            logger.info("Long video detected (\(Int(totalSeconds))s) — using chunked processing")
        }

        // Low battery check — reduce quality gracefully
        if await CrashReporting.isLowBattery {
            logger.warning("Low battery — using reduced analysis quality")
        }

        // Pass 1: Vision — Motion analysis (0-20%)
        progressHandler(0.02)
        let motionScores = await analyzeMotion(asset: asset, totalSeconds: totalSeconds) { phase in
            progressHandler(0.02 + phase * 0.18)
        }

        // Pass 2: Vision — Face detection (20-35%)
        progressHandler(0.20)
        let faceScores = await analyzeFaces(asset: asset, totalSeconds: totalSeconds) { phase in
            progressHandler(0.20 + phase * 0.15)
        }

        // Pass 3: Vision — Saliency / Scene (35-50%)
        progressHandler(0.35)
        let sceneScores = await analyzeScenes(asset: asset, totalSeconds: totalSeconds) { phase in
            progressHandler(0.35 + phase * 0.15)
        }

        // Pass 4: CoreML — Video-text similarity (50-65%)
        progressHandler(0.50)
        var coreMLScores: [Double] = []
        if !prompt.isEmpty {
            do {
                try await CoreMLDetectionService.shared.loadModel()
                coreMLScores = await CoreMLDetectionService.shared.scoreFrames(
                    asset: asset,
                    prompt: prompt,
                    sampleCount: min(Int(totalSeconds), 30)
                ) { phase in
                    progressHandler(0.50 + phase * 0.15)
                }
            } catch {
                // CoreML unavailable — continue without
            }
        }

        // Pass 5: Semantic fusion (65-80%)
        progressHandler(0.65)
        let semanticScores = computeSemanticScores(
            motionScores: motionScores,
            faceScores: faceScores,
            sceneScores: sceneScores,
            coreMLScores: coreMLScores,
            prompt: prompt,
            totalSeconds: totalSeconds
        )
        progressHandler(0.80)

        // Pass 6: Build candidate segments (80-85%)
        var segments = buildSegments(
            from: semanticScores,
            totalSeconds: totalSeconds,
            prompt: prompt
        )
        progressHandler(0.85)

        // Pass 7: Claude Vision refinement for low-confidence segments (85-98%)
        // Only use Cloud AI on Wi-Fi and when not low battery
        let avgConfidenceBefore = segments.isEmpty ? 0 : segments.map(\.confidenceScore).reduce(0, +) / Double(segments.count)
        let shouldUseCloudAI = await NetworkMonitor.shared.shouldUseCloudAI
        let isLowBattery = await CrashReporting.isLowBattery
        if avgConfidenceBefore < Constants.claudeAPIConfidenceThreshold,
           await ClaudeVisionService.shared.isAvailable,
           shouldUseCloudAI,
           !isLowBattery {
            segments = await refineWithClaudeVision(
                segments: segments,
                asset: asset,
                prompt: prompt,
                totalSeconds: totalSeconds
            ) { phase in
                progressHandler(0.85 + phase * 0.13)
            }
        }
        progressHandler(1.0)

        let avgConfidence = segments.isEmpty ? 0 : segments.map(\.confidenceScore).reduce(0, +) / Double(segments.count)

        return DetectionResult(
            segments: segments,
            overallConfidence: avgConfidence
        )
    }

    // MARK: - Claude Vision Refinement

    private func refineWithClaudeVision(
        segments: [HighlightSegment],
        asset: AVURLAsset,
        prompt: String,
        totalSeconds: Double,
        progressHandler: @Sendable (Double) -> Void
    ) async -> [HighlightSegment] {
        // Build candidate context with full segment boundaries for Claude
        let candidates = segments.map {
            ClaudeVisionService.CandidateSegment(
                midpoint: $0.startSeconds + $0.duration / 2,
                start: $0.startSeconds,
                end: $0.endSeconds
            )
        }

        do {
            let scored = try await ClaudeVisionService.shared.scoreHighlights(
                asset: asset,
                prompt: prompt,
                candidates: candidates
            ) { phase in
                progressHandler(phase)
            }

            // Merge Claude scores with 1:1 matching — each score maps to exactly
            // one segment, matched by closest candidate midpoint. This prevents
            // a single segment from absorbing multiple labels when segments are
            // close together in time.
            var refined = segments
            let candidateMidpoints = candidates.map(\.midpoint)
            var matchedIndices: Set<Int> = []

            for scoredItem in scored {
                // Find the closest unmatched candidate midpoint
                var bestIdx: Int?
                var bestDist = Double.infinity
                for (i, ts) in candidateMidpoints.enumerated() where !matchedIndices.contains(i) {
                    let dist = abs(ts - scoredItem.seconds)
                    if dist < bestDist && dist < 5 {
                        bestDist = dist
                        bestIdx = i
                    }
                }

                guard let idx = bestIdx else { continue }
                matchedIndices.insert(idx)

                // Blend: 60% Claude score + 40% original
                let blended = scoredItem.score * 0.6 + refined[idx].confidenceScore * 0.4
                refined[idx].confidenceScore = blended
                if !refined[idx].detectionSources.contains(.claudeVision) {
                    refined[idx].detectionSources.append(.claudeVision)
                }
                if !scoredItem.reason.isEmpty {
                    refined[idx].label = scoredItem.reason
                }

                // Apply AI-suggested trim points if provided and valid
                if let sugStart = scoredItem.suggestedStart,
                   let sugEnd = scoredItem.suggestedEnd,
                   sugEnd > sugStart,
                   sugStart >= 0,
                   sugEnd <= totalSeconds {
                    let sugDuration = sugEnd - sugStart
                    // Only accept if within allowed duration range
                    if sugDuration >= Constants.minClipDuration && sugDuration <= Constants.maxClipDuration {
                        refined[idx].aiSuggestedStart = CMTime(seconds: sugStart, preferredTimescale: 600)
                        refined[idx].aiSuggestedEnd = CMTime(seconds: sugEnd, preferredTimescale: 600)
                    }
                }
            }

            return refined
        } catch {
            return segments
        }
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

            guard let pixelBuffer = ciContext.createPixelBuffer(from: ciImage) else {
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
        coreMLScores: [Double] = [],
        prompt: String,
        totalSeconds: Double
    ) -> [Double] {
        let allCounts = [motionScores.count, faceScores.count, sceneScores.count, coreMLScores.count]
        let maxCount = allCounts.max() ?? 1
        guard maxCount > 0 else { return [0.5] }

        var combined = [Double](repeating: 0, count: maxCount)
        let weights = promptBasedWeights(for: prompt)
        let hasCoreML = !coreMLScores.isEmpty

        for i in 0..<maxCount {
            let motionIdx = i * motionScores.count / maxCount
            let faceIdx = i * faceScores.count / maxCount
            let sceneIdx = i * sceneScores.count / maxCount

            let motion = motionScores.indices.contains(motionIdx) ? motionScores[motionIdx] : 0
            let face = faceScores.indices.contains(faceIdx) ? faceScores[faceIdx] : 0
            let scene = sceneScores.indices.contains(sceneIdx) ? sceneScores[sceneIdx] : 0

            var score = motion * weights.motion + face * weights.face + scene * weights.scene

            if hasCoreML {
                let mlIdx = i * coreMLScores.count / maxCount
                let mlScore = coreMLScores.indices.contains(mlIdx) ? coreMLScores[mlIdx] : 0
                // Blend: 70% Vision + 30% CoreML when available
                score = score * 0.7 + mlScore * 0.3
            }

            combined[i] = score
        }

        return combined
    }

    private struct DetectionWeights: Sendable {
        let motion: Double
        let face: Double
        let scene: Double

        /// Content-aware continuation threshold ratio (0.0–1.0).
        /// Scenic content → lower threshold = wider clips to capture slow pans.
        /// Action content → higher threshold = tighter clips around the burst.
        var continuationRatio: Double {
            if scene >= 0.5 { return 0.3 }     // Scenic: expand more (30% of peak)
            if motion >= 0.45 { return 0.5 }    // Action: stay tight (50% of peak)
            return 0.4                           // Balanced: 40% of peak
        }
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
        let weights = promptBasedWeights(for: prompt)
        let continuationRatio = weights.continuationRatio

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

            // Score-based boundary expansion: walk outward from the peak in
            // both directions while the score stays above a continuation threshold.
            // This produces clips whose duration naturally matches the content —
            // high-action stretches get longer clips, brief moments get shorter ones.
            let continuationThreshold = peak.score * continuationRatio

            var leftIdx = peak.index
            while leftIdx > 0 && scores[leftIdx - 1] >= continuationThreshold {
                leftIdx -= 1
            }
            var rightIdx = peak.index
            while rightIdx < scores.count - 1 && scores[rightIdx + 1] >= continuationThreshold {
                rightIdx += 1
            }

            var startSec = Double(leftIdx) * interval
            var endSec = Double(rightIdx + 1) * interval
            var rawDuration = endSec - startSec

            // Enforce min/max clip duration
            if rawDuration < Constants.minClipDuration {
                // Center-expand to minimum
                let deficit = Constants.minClipDuration - rawDuration
                startSec = max(0, startSec - deficit / 2)
                endSec = min(totalSeconds, endSec + deficit / 2)
            } else if rawDuration > Constants.maxClipDuration {
                // Shrink to max, keeping the peak centered
                let peakTimeSec = Double(peak.index) * interval
                startSec = max(0, peakTimeSec - Constants.maxClipDuration / 2)
                endSec = min(totalSeconds, peakTimeSec + Constants.maxClipDuration / 2)
            }

            // Clamp to video bounds
            startSec = max(0, startSec)
            endSec = min(totalSeconds, endSec)
            let candidateDuration = endSec - startSec

            // Drop if >50% of this clip overlaps an existing segment.
            let overlapsExisting = candidateDuration > 0 && segments.contains { existing in
                let overlapStart = max(existing.startSeconds, startSec)
                let overlapEnd = min(existing.startSeconds + existing.duration, endSec)
                let overlap = max(0, overlapEnd - overlapStart)
                return overlap / candidateDuration > 0.5
            }
            guard !overlapsExisting else { continue }

            // Mark used indices
            let startIdx = max(0, Int(startSec / interval))
            let endIdx = min(Int(endSec / interval), scores.count - 1)
            if startIdx <= endIdx {
                for idx in startIdx...endIdx {
                    usedIndices.insert(idx)
                }
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
            // Use score-based expansion for the fallback too
            let continuationThreshold = scores[bestIdx] * continuationRatio
            var leftIdx = bestIdx
            while leftIdx > 0 && scores[leftIdx - 1] >= continuationThreshold {
                leftIdx -= 1
            }
            var rightIdx = bestIdx
            while rightIdx < scores.count - 1 && scores[rightIdx + 1] >= continuationThreshold {
                rightIdx += 1
            }

            var startSec = Double(leftIdx) * interval
            var endSec = Double(rightIdx + 1) * interval

            // Enforce minimum duration
            if endSec - startSec < Constants.minClipDuration {
                let deficit = Constants.minClipDuration - (endSec - startSec)
                startSec = max(0, startSec - deficit / 2)
                endSec = min(totalSeconds, endSec + deficit / 2)
            }

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
        // When Claude Vision is available, it will override this with a
        // content-specific label via scoredItem.reason. This is the fallback
        // for on-device-only detection.
        if !prompt.isEmpty {
            let weights = promptBasedWeights(for: prompt)
            let prefix: String
            if weights.motion >= 0.45 {
                prefix = score >= 0.8 ? "Peak Action" : "Action"
            } else if weights.face >= 0.45 {
                prefix = score >= 0.8 ? "Best Reaction" : "Key Moment"
            } else if weights.scene >= 0.5 {
                prefix = score >= 0.8 ? "Stunning View" : "Scenic"
            } else {
                prefix = score >= 0.8 ? "Top Highlight" : "Highlight"
            }
            // Append user intent if it adds context
            let shortPrompt = String(prompt.prefix(20)).capitalized
            return "\(prefix) — \(shortPrompt)"
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
