import Foundation
import AVFoundation
import os.log

/// ElevenLabs API client for iOS — provides TTS voiceover, AI music generation,
/// sound effects, audio transcription (Scribe), voice cloning, and stem separation.
///
/// Matches the web platform's ElevenLabs integration to achieve feature parity.
/// Server-side API key is resolved from environment, Keychain, or Info.plist.
actor ElevenLabsService {
    static let shared = ElevenLabsService()

    private let apiBase = "https://api.elevenlabs.io/v1"
    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "ElevenLabs")

    private init() {}

    // MARK: - API Key Resolution

    private var apiKey: String? {
        if let envKey = ProcessInfo.processInfo.environment["ELEVENLABS_API_KEY"],
           !envKey.isEmpty {
            return envKey
        }
        if let keychainKey = KeychainHelper.load(key: "elevenlabs_api_key"),
           !keychainKey.isEmpty {
            return keychainKey
        }
        if let plistKey = Bundle.main.object(forInfoDictionaryKey: "ELEVENLABS_API_KEY") as? String,
           !plistKey.isEmpty {
            return plistKey
        }
        return nil
    }

    var isAvailable: Bool { apiKey != nil }

    // MARK: - Error Types

    enum ElevenLabsError: LocalizedError {
        case noAPIKey
        case apiError(statusCode: Int, message: String)
        case emptyResponse
        case invalidData(String)

        var errorDescription: String? {
            switch self {
            case .noAPIKey:
                return "ElevenLabs API key is not configured."
            case .apiError(let code, let message):
                return "ElevenLabs API error (\(code)): \(message)"
            case .emptyResponse:
                return "Empty response from ElevenLabs."
            case .invalidData(let reason):
                return "Invalid data: \(reason)"
            }
        }
    }

    // MARK: - Voice Map (matches web)

    /// Pre-mapped voice characters → ElevenLabs voice IDs.
    /// Matches web/src/lib/elevenlabs-tts.ts VOICE_MAP.
    private static let voiceMap: [String: String] = [
        // Male voices
        "male-broadcaster-hype": "pNInz6obpgDQGcFmaJgB",     // Adam — deep, energetic
        "male-narrator-warm": "VR6AewLTigWG4xSOukaG",        // Arnold — warm, authoritative
        "male-young-energetic": "ErXwobaYiN019PkySvjV",       // Antoni — young, dynamic
        // Female voices
        "female-narrator-warm": "EXAVITQu4vr4xnSDxMaL",      // Bella — warm, engaging
        "female-broadcaster-hype": "MF3mGyEYCl7XYWbV9V6O",    // Emily — energetic, clear
        "female-young-energetic": "jBpfAIEiAdjNBVLkP4cg",     // Jessie — bright, punchy
    ]

    private static let defaultVoiceId = "pNInz6obpgDQGcFmaJgB" // Adam

    static func resolveVoiceId(_ voiceCharacter: String) -> String {
        voiceMap[voiceCharacter] ?? defaultVoiceId
    }

    // MARK: - Result Types

    struct AudioResult: Sendable {
        let status: ResultStatus
        let audioData: Data?
        let estimatedDuration: Double?
        let error: String?

        enum ResultStatus: Sendable {
            case completed, failed
        }
    }

    struct TranscriptWord: Sendable {
        let text: String
        let start: Double  // seconds
        let end: Double    // seconds
        let confidence: Double
    }

    struct TranscriptSegment: Sendable {
        let text: String
        let start: Double  // seconds
        let end: Double    // seconds
        let words: [TranscriptWord]
    }

    struct ScribeResult: Sendable {
        let status: AudioResult.ResultStatus
        let text: String?
        let segments: [TranscriptSegment]
        let language: String?
        let error: String?
    }

    struct VoiceCloneResult: Sendable {
        let status: AudioResult.ResultStatus
        let voiceId: String?
        let error: String?
    }

    struct StemSeparationResult: Sendable {
        let status: AudioResult.ResultStatus
        /// Instrumental track data (vocals removed)
        let instrumentalData: Data?
        let error: String?
    }

    // MARK: - TTS Voiceover

    /// Generate a single voiceover segment using ElevenLabs TTS.
    /// Returns MP3 audio data. Matches web elevenlabs-tts.ts.
    func generateVoiceover(
        text: String,
        voiceCharacter: String = "male-broadcaster-hype"
    ) async -> AudioResult {
        guard let apiKey else {
            return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: ElevenLabsError.noAPIKey.localizedDescription)
        }

        let voiceId = Self.resolveVoiceId(voiceCharacter)
        logger.info("Generating TTS: \"\(text.prefix(80))\" (voice: \(voiceCharacter) → \(voiceId))")

        do {
            let url = URL(string: "\(apiBase)/text-to-speech/\(voiceId)")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")
            request.timeoutInterval = 30

            let body: [String: Any] = [
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "output_format": "mp3_44100_64",
                "voice_settings": [
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "style": 0.5,
                    "use_speaker_boost": true
                ]
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: "Invalid response")
            }

            guard httpResponse.statusCode == 200 else {
                let errorText = String(data: data, encoding: .utf8) ?? ""
                logger.error("TTS API error (\(httpResponse.statusCode)): \(errorText)")
                return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: "TTS API error (\(httpResponse.statusCode))")
            }

            guard !data.isEmpty else {
                return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: "Empty audio response")
            }

            // MP3 64kbps ≈ 8KB/s
            let estimatedDuration = Double(data.count) / 8_000.0
            logger.info("Generated \(data.count) bytes (~\(Int(estimatedDuration))s)")

            return AudioResult(status: .completed, audioData: data, estimatedDuration: estimatedDuration, error: nil)
        } catch {
            logger.error("TTS request failed: \(error.localizedDescription)")
            return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: error.localizedDescription)
        }
    }

    /// Generate multiple voiceover segments sequentially.
    func generateVoiceovers(
        segments: [(text: String, clipIndex: Int)],
        voiceCharacter: String = "male-broadcaster-hype"
    ) async -> [(clipIndex: Int, result: AudioResult)] {
        var results: [(clipIndex: Int, result: AudioResult)] = []
        for segment in segments {
            let result = await generateVoiceover(text: segment.text, voiceCharacter: voiceCharacter)
            results.append((clipIndex: segment.clipIndex, result: result))
        }
        return results
    }

    // MARK: - AI Music Generation

    /// Generate music using ElevenLabs Eleven Music.
    /// Matches web elevenlabs-music.ts. Returns MP3 data.
    func generateMusic(
        prompt: String,
        durationMs: Int = 60_000
    ) async -> AudioResult {
        guard let apiKey else {
            return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: ElevenLabsError.noAPIKey.localizedDescription)
        }

        let clampedDuration = max(3_000, min(durationMs, 300_000))
        logger.info("Generating music: \"\(prompt.prefix(80))\" (\(clampedDuration)ms)")

        do {
            let url = URL(string: "\(apiBase)/music/compose")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")
            request.timeoutInterval = 120 // Music generation can take 30-60s

            let body: [String: Any] = [
                "prompt": prompt,
                "music_length_ms": clampedDuration,
                "output_format": "mp3_44100_128"
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                let errorText = String(data: data, encoding: .utf8) ?? ""
                logger.error("Music API error (\(code)): \(errorText)")
                return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: "Music API error (\(code))")
            }

            guard !data.isEmpty else {
                return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: "Empty music response")
            }

            // MP3 128kbps ≈ 16KB/s
            let estimatedDuration = Double(data.count) / 16_000.0
            logger.info("Generated music: \(data.count) bytes (~\(Int(estimatedDuration))s)")

            return AudioResult(status: .completed, audioData: data, estimatedDuration: estimatedDuration, error: nil)
        } catch {
            logger.error("Music request failed: \(error.localizedDescription)")
            return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: error.localizedDescription)
        }
    }

    // MARK: - Sound Effects

    /// Generate a sound effect from a text prompt.
    /// Matches web elevenlabs-sfx.ts. Returns MP3 data.
    func generateSoundEffect(
        prompt: String,
        durationMs: Int = 2_000
    ) async -> AudioResult {
        guard let apiKey else {
            return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: ElevenLabsError.noAPIKey.localizedDescription)
        }

        let clampedDuration = max(500, min(durationMs, 10_000))
        logger.info("Generating SFX: \"\(prompt.prefix(80))\" (\(clampedDuration)ms)")

        do {
            let url = URL(string: "\(apiBase)/sound-generation")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")
            request.timeoutInterval = 30

            let body: [String: Any] = [
                "text": prompt,
                "duration_seconds": Double(clampedDuration) / 1000.0
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: "SFX API error (\(code))")
            }

            guard !data.isEmpty else {
                return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: "Empty SFX response")
            }

            let estimatedDuration = Double(data.count) / 16_000.0
            logger.info("Generated SFX: \(data.count) bytes (~\(Int(estimatedDuration))s)")
            return AudioResult(status: .completed, audioData: data, estimatedDuration: estimatedDuration, error: nil)
        } catch {
            return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: error.localizedDescription)
        }
    }

    /// Generate multiple sound effects in parallel.
    func generateSoundEffectBatch(
        requests: [(prompt: String, durationMs: Int)]
    ) async -> [AudioResult] {
        await withTaskGroup(of: (Int, AudioResult).self) { group in
            for (index, req) in requests.enumerated() {
                group.addTask {
                    let result = await self.generateSoundEffect(prompt: req.prompt, durationMs: req.durationMs)
                    return (index, result)
                }
            }
            var results = [(Int, AudioResult)]()
            for await result in group {
                results.append(result)
            }
            return results.sorted(by: { $0.0 < $1.0 }).map(\.1)
        }
    }

    // MARK: - Scribe (Speech-to-Text)

    /// Transcribe audio using ElevenLabs Scribe v1.
    /// Matches web elevenlabs-scribe.ts. Returns word-level timestamps.
    func transcribeAudio(
        audioData: Data,
        fileName: String = "audio.mp3"
    ) async -> ScribeResult {
        guard let apiKey else {
            return ScribeResult(status: .failed, text: nil, segments: [], language: nil, error: ElevenLabsError.noAPIKey.localizedDescription)
        }

        logger.info("Transcribing \"\(fileName)\" (\(audioData.count) bytes)")

        do {
            let boundary = UUID().uuidString
            let url = URL(string: "\(apiBase)/speech-to-text")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")
            request.timeoutInterval = 60

            var body = Data()
            // file field
            body.appendMultipart(boundary: boundary, name: "file", filename: fileName, mimeType: "audio/mpeg", data: audioData)
            // model_id field
            body.appendMultipartField(boundary: boundary, name: "model_id", value: "scribe_v1")
            // timestamps_granularity field
            body.appendMultipartField(boundary: boundary, name: "timestamps_granularity", value: "word")
            body.append("--\(boundary)--\r\n".data(using: .utf8)!)

            request.httpBody = body

            let (responseData, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                let errorText = String(data: responseData, encoding: .utf8) ?? ""
                logger.error("Scribe API error (\(code)): \(errorText)")
                return ScribeResult(status: .failed, text: nil, segments: [], language: nil, error: "Scribe API error (\(code))")
            }

            guard let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any] else {
                return ScribeResult(status: .failed, text: nil, segments: [], language: nil, error: "Invalid JSON response")
            }

            // Parse word-level timing, group into segments (split on pauses > 1s)
            var segments: [TranscriptSegment] = []
            if let words = json["words"] as? [[String: Any]] {
                var currentWords: [TranscriptWord] = []
                for word in words {
                    let w = TranscriptWord(
                        text: word["text"] as? String ?? "",
                        start: word["start"] as? Double ?? 0,
                        end: word["end"] as? Double ?? 0,
                        confidence: word["confidence"] as? Double ?? 1.0
                    )
                    if let lastEnd = currentWords.last?.end, w.start - lastEnd > 1.0 {
                        // Gap > 1 second — start new segment
                        let segText = currentWords.map(\.text).joined(separator: " ")
                        segments.append(TranscriptSegment(
                            text: segText,
                            start: currentWords[0].start,
                            end: currentWords[currentWords.count - 1].end,
                            words: currentWords
                        ))
                        currentWords = []
                    }
                    currentWords.append(w)
                }
                if !currentWords.isEmpty {
                    let segText = currentWords.map(\.text).joined(separator: " ")
                    segments.append(TranscriptSegment(
                        text: segText,
                        start: currentWords[0].start,
                        end: currentWords[currentWords.count - 1].end,
                        words: currentWords
                    ))
                }
            }

            let fullText = (json["text"] as? String) ?? segments.map(\.text).joined(separator: " ")
            let language = json["language_code"] as? String

            logger.info("Transcribed: \(segments.count) segments, \(fullText.count) chars, language=\(language ?? "unknown")")

            return ScribeResult(status: .completed, text: fullText, segments: segments, language: language, error: nil)
        } catch {
            return ScribeResult(status: .failed, text: nil, segments: [], language: nil, error: error.localizedDescription)
        }
    }

    /// Extract audio from a video asset and transcribe it.
    func transcribeVideoAudio(asset: AVURLAsset) async -> ScribeResult {
        do {
            let audioData = try await extractAudioData(from: asset)
            return await transcribeAudio(audioData: audioData, fileName: "video-audio.m4a")
        } catch {
            return ScribeResult(status: .failed, text: nil, segments: [], language: nil, error: "Audio extraction failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Voice Cloning

    /// Create an Instant Voice Clone from an audio sample.
    /// Matches web elevenlabs-voice-clone.ts. Returns a voice ID for TTS.
    func createVoiceClone(
        audioData: Data,
        name: String = "My Voice",
        fileName: String = "voice-sample.mp3"
    ) async -> VoiceCloneResult {
        guard let apiKey else {
            return VoiceCloneResult(status: .failed, voiceId: nil, error: ElevenLabsError.noAPIKey.localizedDescription)
        }

        logger.info("Creating voice clone \"\(name)\" from \(fileName) (\(audioData.count) bytes)")

        do {
            let boundary = UUID().uuidString
            let url = URL(string: "\(apiBase)/voices/add")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")
            request.timeoutInterval = 30

            var body = Data()
            body.appendMultipart(boundary: boundary, name: "files", filename: fileName, mimeType: "audio/mpeg", data: audioData)
            body.appendMultipartField(boundary: boundary, name: "name", value: name)
            body.appendMultipartField(boundary: boundary, name: "description", value: "Voice clone for highlight tape narration")
            body.append("--\(boundary)--\r\n".data(using: .utf8)!)

            request.httpBody = body

            let (responseData, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                return VoiceCloneResult(status: .failed, voiceId: nil, error: "Voice cloning failed (\(code))")
            }

            guard let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
                  let voiceId = json["voice_id"] as? String else {
                return VoiceCloneResult(status: .failed, voiceId: nil, error: "No voice ID returned")
            }

            logger.info("Clone created: \(voiceId)")
            return VoiceCloneResult(status: .completed, voiceId: voiceId, error: nil)
        } catch {
            return VoiceCloneResult(status: .failed, voiceId: nil, error: error.localizedDescription)
        }
    }

    /// Delete a cloned voice (cleanup after export).
    func deleteVoiceClone(voiceId: String) async {
        guard let apiKey else { return }
        do {
            var request = URLRequest(url: URL(string: "\(apiBase)/voices/\(voiceId)")!)
            request.httpMethod = "DELETE"
            request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")
            _ = try await URLSession.shared.data(for: request)
            logger.info("Deleted clone: \(voiceId)")
        } catch {
            logger.warning("Failed to delete clone \(voiceId): \(error.localizedDescription)")
        }
    }

    /// Generate voiceover using a cloned voice ID (bypasses voice map).
    func generateWithClonedVoice(text: String, voiceId: String) async -> AudioResult {
        guard let apiKey else {
            return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: ElevenLabsError.noAPIKey.localizedDescription)
        }

        logger.info("Generating TTS with clone \(voiceId): \"\(text.prefix(80))\"")

        do {
            let url = URL(string: "\(apiBase)/text-to-speech/\(voiceId)")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")
            request.timeoutInterval = 30

            let body: [String: Any] = [
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "output_format": "mp3_44100_64",
                "voice_settings": [
                    "stability": 0.5,
                    "similarity_boost": 0.85,
                    "style": 0.3,
                    "use_speaker_boost": true
                ]
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: "TTS with cloned voice failed (\(code))")
            }

            guard !data.isEmpty else {
                return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: "Empty audio response")
            }

            let estimatedDuration = Double(data.count) / 8_000.0
            return AudioResult(status: .completed, audioData: data, estimatedDuration: estimatedDuration, error: nil)
        } catch {
            return AudioResult(status: .failed, audioData: nil, estimatedDuration: nil, error: error.localizedDescription)
        }
    }

    // MARK: - Stem Separation

    /// Separate audio into stems (isolate instrumental track).
    /// Matches web elevenlabs-stems.ts.
    func separateStems(
        audioData: Data,
        fileName: String = "music.mp3"
    ) async -> StemSeparationResult {
        guard let apiKey else {
            return StemSeparationResult(status: .failed, instrumentalData: nil, error: ElevenLabsError.noAPIKey.localizedDescription)
        }

        logger.info("Separating stems from \"\(fileName)\" (\(audioData.count) bytes)")

        do {
            let boundary = UUID().uuidString
            let url = URL(string: "\(apiBase)/audio-isolation")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")
            request.timeoutInterval = 60

            var body = Data()
            body.appendMultipart(boundary: boundary, name: "audio", filename: fileName, mimeType: "audio/mpeg", data: audioData)
            body.append("--\(boundary)--\r\n".data(using: .utf8)!)

            request.httpBody = body

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                return StemSeparationResult(status: .failed, instrumentalData: nil, error: "Stem separation failed (\(code))")
            }

            guard !data.isEmpty else {
                return StemSeparationResult(status: .failed, instrumentalData: nil, error: "Empty response from stem separation")
            }

            logger.info("Separated stems: instrumental=\(data.count) bytes")
            return StemSeparationResult(status: .completed, instrumentalData: data, error: nil)
        } catch {
            return StemSeparationResult(status: .failed, instrumentalData: nil, error: error.localizedDescription)
        }
    }

    // MARK: - Helpers

    /// Extract audio track from a video asset as M4A data.
    private func extractAudioData(from asset: AVURLAsset) async throws -> Data {
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).m4a")

        guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            throw ElevenLabsError.invalidData("Cannot create audio export session")
        }

        exportSession.outputURL = tempURL
        exportSession.outputFileType = .m4a

        await exportSession.export()

        guard exportSession.status == .completed else {
            throw ElevenLabsError.invalidData("Audio export failed: \(exportSession.error?.localizedDescription ?? "unknown")")
        }

        let data = try Data(contentsOf: tempURL)
        try? FileManager.default.removeItem(at: tempURL)
        return data
    }
}

// MARK: - Data Multipart Helpers

extension Data {
    mutating func appendMultipart(boundary: String, name: String, filename: String, mimeType: String, data: Data) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
    }

    mutating func appendMultipartField(boundary: String, name: String, value: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        append("\(value)\r\n".data(using: .utf8)!)
    }
}
