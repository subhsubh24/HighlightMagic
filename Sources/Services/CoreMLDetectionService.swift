import Foundation
import CoreML
import Vision
import AVFoundation
import CoreImage

actor CoreMLDetectionService {
    static let shared = CoreMLDetectionService()

    private var model: VNCoreMLModel?
    private var isModelLoaded = false

    private init() {}

    // MARK: - Model Loading

    func loadModel() async throws {
        guard !isModelLoaded else { return }

        // Attempt to load bundled CoreML model (MobileViCLIP or similar)
        // In production, replace with actual .mlmodel compiled asset
        if let modelURL = Bundle.main.url(
            forResource: "VideoHighlightModel",
            withExtension: "mlmodelc"
        ) {
            do {
                let mlModel = try MLModel(contentsOf: modelURL)
                model = try VNCoreMLModel(for: mlModel)
                isModelLoaded = true
            } catch {
                throw CoreMLError.modelLoadFailed(error.localizedDescription)
            }
        } else {
            // Fallback: use built-in Vision classifiers
            isModelLoaded = true
        }
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
