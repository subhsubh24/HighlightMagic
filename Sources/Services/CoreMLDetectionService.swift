import Foundation
import CoreML
import Vision
import AVFoundation
import CoreImage
import os.log

actor CoreMLDetectionService {
    static let shared = CoreMLDetectionService()

    private var model: VNCoreMLModel?
    private var isModelLoaded = false
    private var loadAttempted = false
    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "CoreML")

    /// Supported model filenames in priority order (quantized first for smaller footprint)
    private let modelCandidates: [(resource: String, ext: String)] = [
        ("VideoHighlightModel_q8", "mlmodelc"),   // INT8 quantized (~25MB)
        ("VideoHighlightModel_q16", "mlmodelc"),   // FP16 quantized (~50MB)
        ("VideoHighlightModel", "mlmodelc"),        // Full precision fallback
        ("MobileViCLIP", "mlmodelc")                // Alternative architecture
    ]

    private init() {}

    // MARK: - Model Loading

    func loadModel() async throws {
        guard !isModelLoaded else { return }
        guard !loadAttempted else {
            // Already attempted and failed — use Vision fallback silently
            isModelLoaded = true
            return
        }
        loadAttempted = true

        // Try each model candidate in priority order
        for candidate in modelCandidates {
            if let modelURL = Bundle.main.url(
                forResource: candidate.resource,
                withExtension: candidate.ext
            ) {
                do {
                    let config = MLModelConfiguration()
                    config.computeUnits = .cpuAndNeuralEngine // Prefer ANE for efficiency

                    let mlModel = try MLModel(contentsOf: modelURL, configuration: config)
                    model = try VNCoreMLModel(for: mlModel)
                    isModelLoaded = true
                    logger.info("Loaded CoreML model: \(candidate.resource)")
                    return
                } catch {
                    logger.warning("Failed to load \(candidate.resource): \(error.localizedDescription)")
                    continue
                }
            }
        }

        // No bundled model found — gracefully fall back to Vision classifiers
        logger.info("No CoreML model bundled — using Vision classification fallback")
        isModelLoaded = true
    }

    // MARK: - Video-Text Similarity Scoring

    func scoreFrames(
        asset: AVURLAsset,
        prompt: String,
        sampleCount: Int = 30,
        progressHandler: @Sendable (Double) -> Void
    ) async -> [Double] {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 224, height: 224) // Standard ML input

        guard let duration = try? await asset.load(.duration) else { return [] }
        let totalSeconds = CMTimeGetSeconds(duration)
        guard totalSeconds > 0 else { return [] }

        let interval = totalSeconds / Double(sampleCount)
        var scores = [Double](repeating: 0.5, count: sampleCount)

        for i in 0..<sampleCount {
            let time = CMTime(seconds: interval * Double(i), preferredTimescale: 600)

            guard let cgImage = try? await generator.image(at: time).image else {
                continue
            }

            if let vncModel = model {
                // Use CoreML model for classification
                scores[i] = await classifyWithModel(
                    cgImage: cgImage,
                    model: vncModel,
                    prompt: prompt
                )
            } else {
                // Fallback: use Vision classification + keyword matching
                scores[i] = await classifyWithVision(
                    cgImage: cgImage,
                    prompt: prompt
                )
            }

            progressHandler(Double(i + 1) / Double(sampleCount))
        }

        return scores
    }

    // MARK: - CoreML Classification

    private func classifyWithModel(
        cgImage: CGImage,
        model: VNCoreMLModel,
        prompt: String
    ) async -> Double {
        await withCheckedContinuation { continuation in
            let request = VNCoreMLRequest(model: model) { request, _ in
                guard let results = request.results as? [VNClassificationObservation] else {
                    continuation.resume(returning: 0.5)
                    return
                }

                let promptWords = Set(prompt.lowercased().split(separator: " ").map(String.init))
                var bestScore: Double = 0

                for observation in results.prefix(10) {
                    let labelWords = Set(
                        observation.identifier.lowercased().split(separator: " ").map(String.init)
                    )
                    let overlap = promptWords.intersection(labelWords).count
                    let relevance = overlap > 0
                        ? Double(observation.confidence) * (1.0 + Double(overlap) * 0.3)
                        : Double(observation.confidence) * 0.3
                    bestScore = max(bestScore, min(relevance, 1.0))
                }

                continuation.resume(returning: bestScore)
            }

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(returning: 0.5)
            }
        }
    }

    // MARK: - Vision Fallback Classification

    private func classifyWithVision(
        cgImage: CGImage,
        prompt: String
    ) async -> Double {
        await withCheckedContinuation { continuation in
            let classifyRequest = VNClassifyImageRequest { request, _ in
                guard let results = request.results as? [VNClassificationObservation] else {
                    continuation.resume(returning: 0.5)
                    return
                }

                let promptWords = Set(prompt.lowercased().split(separator: " ").map(String.init))
                var score: Double = 0.3

                for observation in results.prefix(20) {
                    let label = observation.identifier.lowercased()
                    for word in promptWords {
                        if label.contains(word) {
                            score = max(score, Double(observation.confidence))
                        }
                    }
                }

                continuation.resume(returning: score)
            }

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([classifyRequest])
            } catch {
                continuation.resume(returning: 0.5)
            }
        }
    }
}

enum CoreMLError: LocalizedError {
    case modelLoadFailed(String)
    case predictionFailed

    var errorDescription: String? {
        switch self {
        case .modelLoadFailed(let msg): "Failed to load ML model: \(msg)"
        case .predictionFailed: "ML prediction failed."
        }
    }
}
