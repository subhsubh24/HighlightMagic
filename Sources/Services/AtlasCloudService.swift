import Foundation
import UIKit
import os.log

/// Atlas Cloud API client for iOS — provides photo animation (Kling i2v),
/// text-to-video (Wan 2.6), image upscaling, background removal, lip sync,
/// and style transfer via the unified Atlas Cloud endpoint.
///
/// Uses a submit → poll pattern matching the web platform's atlascloud.ts.
actor AtlasCloudService {
    static let shared = AtlasCloudService()

    private let apiBase = "https://api.atlascloud.ai/api/v1/model"
    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "AtlasCloud")

    // Polling config (matches web)
    private let pollIntervalSeconds: TimeInterval = 5
    private let pollTimeoutSeconds: TimeInterval = 300 // 5 minutes

    // Retry config for transient errors
    private let maxRetries = 3
    private let retryBaseSeconds: TimeInterval = 2
    private let fetchTimeoutSeconds: TimeInterval = 30

    private init() {}

    // MARK: - Model IDs (matches web MODELS object)

    enum Model: String, Sendable {
        /// Image-to-video (photo animation) — Kling v2.5 Turbo Pro
        case klingI2V = "kwaivgi/kling-v2.5-turbo-pro/image-to-video"
        /// Text-to-video — Wan 2.6 (Alibaba)
        case wanT2V = "alibaba/wan-2.6/text-to-video"
        /// Image upscaler
        case imageUpscaler = "atlascloud/image-upscaler"
        /// Background remover
        case bgRemover = "atlascloud/image-background-remover"
        /// Lip sync — Wan 2.2
        case wanLipSync = "alibaba/wan-2.2/lip-sync"
        /// Video-to-video style transfer — Wan 2.6
        case wanV2V = "alibaba/wan-2.6/video-to-video"
    }

    // MARK: - API Key Resolution

    private var apiKey: String? {
        if let envKey = ProcessInfo.processInfo.environment["ATLASCLOUD_API_KEY"],
           !envKey.isEmpty {
            return envKey
        }
        if let keychainKey = KeychainHelper.load(key: "atlascloud_api_key"),
           !keychainKey.isEmpty {
            return keychainKey
        }
        if let plistKey = Bundle.main.object(forInfoDictionaryKey: "ATLASCLOUD_API_KEY") as? String,
           !plistKey.isEmpty {
            return plistKey
        }
        return nil
    }

    var isAvailable: Bool { apiKey != nil }

    // MARK: - Error Types

    enum AtlasCloudError: LocalizedError {
        case noAPIKey
        case apiError(statusCode: Int, message: String)
        case noPredictionId
        case taskFailed(String)
        case taskTimedOut
        case noOutput

        var errorDescription: String? {
            switch self {
            case .noAPIKey:
                return "Atlas Cloud API key is not configured."
            case .apiError(let code, let message):
                return "Atlas Cloud API error (\(code)): \(message)"
            case .noPredictionId:
                return "Atlas Cloud returned no prediction ID."
            case .taskFailed(let message):
                return "Task failed: \(message)"
            case .taskTimedOut:
                return "Task timed out after 5 minutes."
            case .noOutput:
                return "Task completed but returned no output."
            }
        }
    }

    // MARK: - Result Types

    enum TaskStatus: String, Sendable {
        case processing, completed, failed
    }

    struct TaskPollResult: Sendable {
        let status: TaskStatus
        let outputUrl: String?
        let error: String?
    }

    // MARK: - Core Submit / Poll

    /// Submit a generation task. Returns the prediction ID for polling.
    func submitTask(
        model: Model,
        payload: [String: Any],
        endpoint: String = "generateVideo"
    ) async throws -> String {
        guard let apiKey else { throw AtlasCloudError.noAPIKey }

        var fullPayload = payload
        fullPayload["model"] = model.rawValue

        let requestBody = try JSONSerialization.data(withJSONObject: fullPayload)

        var lastError: Error = AtlasCloudError.noPredictionId
        for attempt in 0...maxRetries {
            if attempt > 0 {
                let delay = retryBaseSeconds * pow(2.0, Double(attempt - 1))
                logger.info("Retry \(attempt)/\(self.maxRetries) after \(Int(delay))s...")
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }

            do {
                var request = URLRequest(url: URL(string: "\(apiBase)/\(endpoint)")!)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
                request.timeoutInterval = fetchTimeoutSeconds
                request.httpBody = requestBody

                let (data, response) = try await URLSession.shared.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw AtlasCloudError.apiError(statusCode: 0, message: "Invalid response")
                }

                if httpResponse.statusCode != 200 {
                    let errorText = String(data: data, encoding: .utf8) ?? ""
                    let error = AtlasCloudError.apiError(statusCode: httpResponse.statusCode, message: errorText)
                    if [502, 503, 504].contains(httpResponse.statusCode), attempt < maxRetries {
                        logger.warning("Got \(httpResponse.statusCode), will retry...")
                        lastError = error
                        continue
                    }
                    throw error
                }

                guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let dataObj = json["data"] as? [String: Any],
                      let predictionId = dataObj["id"] as? String else {
                    throw AtlasCloudError.noPredictionId
                }

                logger.info("Submitted task: \(predictionId)")
                return predictionId
            } catch let error as AtlasCloudError {
                lastError = error
                if case .apiError(let code, _) = error, [502, 503, 504].contains(code), attempt < maxRetries {
                    continue
                }
                throw error
            } catch {
                lastError = error
                throw error
            }
        }

        throw lastError
    }

    /// Check the status of a prediction (single request, no loop).
    func checkTaskResult(predictionId: String) async throws -> TaskPollResult {
        guard let apiKey else { throw AtlasCloudError.noAPIKey }

        var request = URLRequest(url: URL(string: "\(apiBase)/prediction/\(predictionId)")!)
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = fetchTimeoutSeconds

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            let errorText = String(data: data, encoding: .utf8) ?? ""
            throw AtlasCloudError.apiError(statusCode: code, message: errorText)
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let predictionData = json["data"] as? [String: Any],
              let status = predictionData["status"] as? String else {
            throw AtlasCloudError.taskFailed("Invalid poll response")
        }

        logger.info("Prediction \(predictionId): status=\(status)")

        if status == "succeeded" || status == "completed" {
            guard let outputs = predictionData["outputs"] as? [String], let firstOutput = outputs.first else {
                return TaskPollResult(status: .failed, outputUrl: nil, error: "Task succeeded but no output URL")
            }
            return TaskPollResult(status: .completed, outputUrl: firstOutput, error: nil)
        }

        if status == "failed" || status == "canceled" {
            let error = predictionData["error"] as? String ?? "Unknown error"
            return TaskPollResult(status: .failed, outputUrl: nil, error: error)
        }

        return TaskPollResult(status: .processing, outputUrl: nil, error: nil)
    }

    /// Poll until task completes or times out. Returns output URL.
    func pollTaskResult(predictionId: String) async throws -> String {
        let deadline = Date().addingTimeInterval(pollTimeoutSeconds)

        while Date() < deadline {
            let result = try await checkTaskResult(predictionId: predictionId)

            switch result.status {
            case .completed:
                guard let url = result.outputUrl else { throw AtlasCloudError.noOutput }
                return url
            case .failed:
                throw AtlasCloudError.taskFailed(result.error ?? "Unknown error")
            case .processing:
                try await Task.sleep(nanoseconds: UInt64(pollIntervalSeconds * 1_000_000_000))
            }
        }

        throw AtlasCloudError.taskTimedOut
    }

    // MARK: - High-Level Convenience Functions

    /// Photo animation (Kling v2.5 Turbo Pro image-to-video).
    /// Accepts a UIImage, converts to base64, submits, and polls.
    func animatePhoto(
        image: UIImage,
        prompt: String,
        duration: Int = 5,
        progressHandler: (@Sendable (String) -> Void)? = nil
    ) async throws -> URL {
        guard let jpegData = image.jpegData(compressionQuality: 0.85) else {
            throw AtlasCloudError.taskFailed("Could not convert image to JPEG")
        }

        let base64 = jpegData.base64EncodedString()
        let clampedDuration = max(2, min(10, duration))

        progressHandler?("Submitting photo animation...")
        let predictionId = try await submitTask(
            model: .klingI2V,
            payload: [
                "image": base64,
                "prompt": prompt,
                "duration": clampedDuration,
                "cfg_scale": 0.5,
                "sound": false
            ]
        )

        progressHandler?("Generating animation...")
        let outputUrl = try await pollTaskResult(predictionId: predictionId)

        progressHandler?("Downloading result...")
        return try await downloadToTemp(urlString: outputUrl, fileExtension: "mp4")
    }

    /// Text-to-video generation (Wan 2.6). Used for AI intro/outro cards.
    func generateTextToVideo(
        prompt: String,
        duration: Int = 5
    ) async throws -> URL {
        let clampedDuration = max(2, min(10, duration))

        let predictionId = try await submitTask(
            model: .wanT2V,
            payload: [
                "prompt": prompt,
                "duration": clampedDuration
            ]
        )

        let outputUrl = try await pollTaskResult(predictionId: predictionId)
        return try await downloadToTemp(urlString: outputUrl, fileExtension: "mp4")
    }

    /// Image upscaler — enhances low-res photos before animation.
    func upscaleImage(image: UIImage) async throws -> UIImage {
        guard let jpegData = image.jpegData(compressionQuality: 0.9) else {
            throw AtlasCloudError.taskFailed("Could not convert image to JPEG")
        }

        let base64 = jpegData.base64EncodedString()
        let predictionId = try await submitTask(
            model: .imageUpscaler,
            payload: ["image": base64],
            endpoint: "generateImage"
        )

        let outputUrl = try await pollTaskResult(predictionId: predictionId)
        let localURL = try await downloadToTemp(urlString: outputUrl, fileExtension: "png")
        let data = try Data(contentsOf: localURL)
        try? FileManager.default.removeItem(at: localURL)

        guard let result = UIImage(data: data) else {
            throw AtlasCloudError.taskFailed("Could not decode upscaled image")
        }
        return result
    }

    /// Background removal — isolates subject.
    func removeBackground(image: UIImage) async throws -> UIImage {
        guard let jpegData = image.jpegData(compressionQuality: 0.9) else {
            throw AtlasCloudError.taskFailed("Could not convert image to JPEG")
        }

        let base64 = jpegData.base64EncodedString()
        let predictionId = try await submitTask(
            model: .bgRemover,
            payload: ["image": base64],
            endpoint: "generateImage"
        )

        let outputUrl = try await pollTaskResult(predictionId: predictionId)
        let localURL = try await downloadToTemp(urlString: outputUrl, fileExtension: "png")
        let data = try Data(contentsOf: localURL)
        try? FileManager.default.removeItem(at: localURL)

        guard let result = UIImage(data: data) else {
            throw AtlasCloudError.taskFailed("Could not decode processed image")
        }
        return result
    }

    /// Lip sync — generates a talking head video from a photo + audio.
    func generateLipSync(
        image: UIImage,
        audioData: Data,
        duration: Int = 5
    ) async throws -> URL {
        guard let jpegData = image.jpegData(compressionQuality: 0.85) else {
            throw AtlasCloudError.taskFailed("Could not convert image to JPEG")
        }

        let imageBase64 = jpegData.base64EncodedString()
        let audioBase64 = audioData.base64EncodedString()
        let clampedDuration = max(2, min(10, duration))

        let predictionId = try await submitTask(
            model: .wanLipSync,
            payload: [
                "image": imageBase64,
                "audio": audioBase64,
                "duration": clampedDuration
            ]
        )

        let outputUrl = try await pollTaskResult(predictionId: predictionId)
        return try await downloadToTemp(urlString: outputUrl, fileExtension: "mp4")
    }

    /// Style transfer — applies a visual style to a video.
    func applyStyleTransfer(
        videoURL: URL,
        stylePrompt: String,
        strength: Double = 0.5
    ) async throws -> URL {
        // Upload video to get a remote URL, or use the URL directly if already remote
        let videoUrlString: String
        if videoURL.isFileURL {
            let data = try Data(contentsOf: videoURL)
            videoUrlString = data.base64EncodedString()
        } else {
            videoUrlString = videoURL.absoluteString
        }

        let clampedStrength = max(0.1, min(1.0, strength))

        let predictionId = try await submitTask(
            model: .wanV2V,
            payload: [
                "video": videoUrlString,
                "prompt": stylePrompt,
                "strength": clampedStrength
            ]
        )

        let outputUrl = try await pollTaskResult(predictionId: predictionId)
        return try await downloadToTemp(urlString: outputUrl, fileExtension: "mp4")
    }

    // MARK: - Helpers

    /// Download a remote URL to a temporary local file.
    private func downloadToTemp(urlString: String, fileExtension: String) async throws -> URL {
        guard let url = URL(string: urlString) else {
            throw AtlasCloudError.taskFailed("Invalid output URL: \(urlString)")
        }

        let (data, response) = try await URLSession.shared.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw AtlasCloudError.taskFailed("Failed to download output")
        }

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).\(fileExtension)")
        try data.write(to: tempURL)

        logger.info("Downloaded to \(tempURL.lastPathComponent) (\(data.count) bytes)")
        return tempURL
    }
}
