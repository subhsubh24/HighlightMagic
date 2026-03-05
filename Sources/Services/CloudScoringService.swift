import Foundation
import AVFoundation
import UIKit
import os.log

/// Cloud-first highlight scoring using Claude Haiku for frame-by-frame analysis.
/// This replaces the on-device Vision Framework heuristics when an API key is available,
/// producing identical results to the web platform's scoring pipeline.
///
/// Pipeline: Extract 1 frame/sec → annotate with audio features → batch 35 frames to Haiku
/// → z-score normalize across batches → return scored frames.
actor CloudScoringService {
    static let shared = CloudScoringService()

    private let endpoint = "https://api.anthropic.com/v1/messages"
    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "CloudScoring")
    private let maxFramesPerBatch = 35  // Matches web: MAX_FRAMES_PER_BATCH = 35

    private init() {}

    private var apiKey: String? {
        if let envKey = ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"],
           !envKey.isEmpty, envKey.hasPrefix("sk-ant-") {
            return envKey
        }
        if let keychainKey = KeychainHelper.load(key: "claude_api_key"),
           !keychainKey.isEmpty, keychainKey.hasPrefix("sk-ant-") {
            return keychainKey
        }
        if let plistKey = Bundle.main.object(forInfoDictionaryKey: "ANTHROPIC_API_KEY") as? String,
           !plistKey.isEmpty, plistKey.hasPrefix("sk-ant-") {
            return plistKey
        }
        return nil
    }

    var isAvailable: Bool { apiKey != nil }

    // MARK: - Types

    struct ScoredFrame: Sendable {
        let timestamp: Double
        let score: Double           // 0.0-1.0
        let label: String
        let narrativeRole: String?  // HOOK | HERO | REACTION | RHYTHM | CLOSER
    }

    struct AnnotatedFrame: Sendable {
        let timestamp: Double
        let base64: String
        let audioEnergy: Double?
        let audioOnset: Double?
        let audioBass: Double?
        let audioMid: Double?
        let audioTreble: Double?
    }

    // MARK: - Public API

    /// Score all frames in a video using Claude Haiku, matching the web's scoring pipeline.
    /// Extracts 1 frame/sec, sends in batches of 35 to Haiku, z-score normalizes results.
    func scoreFrames(
        asset: AVURLAsset,
        audioFeatures: [AudioFeatureService.AudioFeatures],
        templateName: String? = nil,
        progressHandler: @Sendable (Double) -> Void
    ) async throws -> [ScoredFrame] {
        guard let apiKey else {
            throw ClaudeVisionError.noAPIKey
        }

        let duration = try await CMTimeGetSeconds(asset.load(.duration))
        guard duration > 0 else { return [] }

        // Extract 1 frame per second (matches web FRAME_SAMPLE_INTERVAL_SECONDS = 1)
        let frameCount = Int(duration)
        guard frameCount > 0 else { return [] }

        progressHandler(0.02)

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 512, height: 512)

        // Build audio feature lookup
        let audioLookup = Dictionary(audioFeatures.map { (Int($0.timestamp), $0) },
                                      uniquingKeysWith: { first, _ in first })

        // Extract frames with audio annotations
        var frames: [AnnotatedFrame] = []
        for sec in 0..<frameCount {
            let time = CMTime(seconds: Double(sec), preferredTimescale: 600)
            guard let cgImage = try? await generator.image(at: time).image else { continue }
            let uiImage = UIImage(cgImage: cgImage)
            guard let jpegData = uiImage.jpegData(compressionQuality: 0.6) else { continue }

            let audio = audioLookup[sec]
            frames.append(AnnotatedFrame(
                timestamp: Double(sec),
                base64: jpegData.base64EncodedString(),
                audioEnergy: audio?.audioEnergy,
                audioOnset: audio?.audioOnset,
                audioBass: audio?.audioBass,
                audioMid: audio?.audioMid,
                audioTreble: audio?.audioTreble
            ))

            if sec % 10 == 0 {
                progressHandler(0.02 + Double(sec) / Double(frameCount) * 0.18)
            }
        }

        guard !frames.isEmpty else { return [] }
        progressHandler(0.20)

        // Build batches
        var batches: [[AnnotatedFrame]] = []
        for i in stride(from: 0, to: frames.count, by: maxFramesPerBatch) {
            let end = min(i + maxFramesPerBatch, frames.count)
            batches.append(Array(frames[i..<end]))
        }

        // Gap 3: Score batches concurrently (up to 5 at once) — matches web's concurrent scoring.
        // Web does 5 concurrent batches with staggered 200ms starts.
        let maxConcurrent = 5
        var allScored: [ScoredFrame] = []
        let batchCount = batches.count

        // Process batches in concurrent groups
        for groupStart in stride(from: 0, to: batchCount, by: maxConcurrent) {
            let groupEnd = min(groupStart + maxConcurrent, batchCount)
            let groupBatches = Array(batches[groupStart..<groupEnd])

            let groupResults = try await withThrowingTaskGroup(of: (Int, [ScoredFrame]).self) { group in
                for (offset, batch) in groupBatches.enumerated() {
                    let batchIndex = groupStart + offset
                    group.addTask {
                        // Stagger start by 200ms per batch within the group (matches web)
                        if offset > 0 {
                            try? await Task.sleep(for: .milliseconds(200 * offset))
                        }
                        let scored = try await self.scoreBatch(
                            batch: batch,
                            apiKey: apiKey,
                            templateName: templateName
                        )
                        return (batchIndex, scored)
                    }
                }
                var results: [(Int, [ScoredFrame])] = []
                for try await result in group {
                    results.append(result)
                }
                return results.sorted { $0.0 < $1.0 }
            }

            for (_, scored) in groupResults {
                allScored.append(contentsOf: scored)
            }

            let progress = 0.20 + Double(groupEnd) / Double(batchCount) * 0.50
            progressHandler(progress)
        }

        // Z-score normalize across batches (matches web normalizeScoresAcrossBatches)
        let normalized = normalizeScoresAcrossBatches(allScored)
        progressHandler(0.75)

        logger.info("Cloud scoring: \(normalized.count) frames scored across \(batches.count) batches")
        return normalized
    }

    // MARK: - Batch Scoring

    /// Gap 3: 5 retries (was 2) with Retry-After header support — matches web.
    private func scoreBatch(
        batch: [AnnotatedFrame],
        apiKey: String,
        templateName: String?,
        attempt: Int = 0
    ) async throws -> [ScoredFrame] {
        let systemPrompt = buildScoringPrompt(templateName: templateName)
        var contentBlocks: [[String: Any]] = []

        // Build content with frames and audio annotations (matches web buildScoringContent)
        for (i, frame) in batch.enumerated() {
            contentBlocks.append([
                "type": "image",
                "source": [
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": frame.base64
                ] as [String: Any]
            ])

            var annotation = "Frame \(i) — source: \"video\" (video), timestamp: \(String(format: "%.1f", frame.timestamp))s"

            if let energy = frame.audioEnergy {
                annotation += ", audioEnergy: \(String(format: "%.2f", energy))"
            }
            if let onset = frame.audioOnset, onset > 0.1 {
                annotation += ", audioOnset: \(String(format: "%.2f", onset))"
            }
            if let bass = frame.audioBass, let energy = frame.audioEnergy, energy > 0.1,
               let mid = frame.audioMid, let treble = frame.audioTreble {
                annotation += ", spectrum: B\(String(format: "%.2f", bass))/M\(String(format: "%.2f", mid))/T\(String(format: "%.2f", treble))"
            }

            contentBlocks.append(["type": "text", "text": annotation])
        }

        let requestBody: [String: Any] = [
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 16000,
            "system": [
                [
                    "type": "text",
                    "text": systemPrompt,
                    "cache_control": ["type": "ephemeral"]
                ] as [String: Any]
            ],
            "messages": [
                ["role": "user", "content": contentBlocks]
            ]
        ]

        guard let url = URL(string: endpoint) else {
            throw ClaudeVisionError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        request.timeoutInterval = 60

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw ClaudeVisionError.requestFailed
            }

            // Gap 3: Retry on 429/5xx with Retry-After header support, up to 5 attempts (was 2)
            if (httpResponse.statusCode == 429 || httpResponse.statusCode >= 500) && attempt < 4 {
                // Respect Retry-After header if present (matches web)
                let retryAfter = httpResponse.value(forHTTPHeaderField: "Retry-After")
                    .flatMap { Double($0) }
                let delay = retryAfter ?? (Double(1 << attempt) * 2)  // 2s, 4s, 8s, 16s
                logger.info("Scoring batch HTTP \(httpResponse.statusCode), retry \(attempt + 1)/4 after \(String(format: "%.1f", delay))s")
                try? await Task.sleep(for: .seconds(delay))
                return try await scoreBatch(batch: batch, apiKey: apiKey,
                                           templateName: templateName, attempt: attempt + 1)
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                logger.error("Scoring batch HTTP \(httpResponse.statusCode)")
                throw ClaudeVisionError.requestFailed
            }

            return parseScoringResponse(data: data, batch: batch)
        } catch let error as ClaudeVisionError {
            throw error
        } catch {
            if attempt < 4 {
                let delay = Double(1 << attempt) * 2
                logger.info("Scoring batch error: \(error.localizedDescription), retry \(attempt + 1)/4 after \(String(format: "%.1f", delay))s")
                try? await Task.sleep(for: .seconds(delay))
                return try await scoreBatch(batch: batch, apiKey: apiKey,
                                           templateName: templateName, attempt: attempt + 1)
            }
            throw error
        }
    }

    // MARK: - Response Parsing

    private func parseScoringResponse(data: Data, batch: [AnnotatedFrame]) -> [ScoredFrame] {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let textBlock = content.first(where: { $0["type"] as? String == "text" }),
              let text = textBlock["text"] as? String else {
            logger.warning("Scoring: failed to parse response structure")
            return batch.map { ScoredFrame(timestamp: $0.timestamp, score: 0.5, label: "parse failed", narrativeRole: nil) }
        }

        // Extract JSON array using balanced bracket matching
        if let jsonString = ClaudeVisionService.extractBalancedJSON(from: text, open: "[", close: "]"),
           let jsonData = jsonString.data(using: .utf8),
           let results = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]] {
            return parseFrameArray(results, batch: batch)
        }

        // Fallback: try regex extraction
        if let range = text.range(of: #"\[[\s\S]*\]"#, options: .regularExpression) {
            let rawJSON = String(text[range])
                .replacingOccurrences(of: #",\s*[\]\}]"#, with: { String($0.last!) }, options: .regularExpression)
            if let jsonData = rawJSON.data(using: .utf8),
               let results = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]] {
                return parseFrameArray(results, batch: batch)
            }
        }

        logger.warning("Scoring: no JSON array found in response")
        return batch.map { ScoredFrame(timestamp: $0.timestamp, score: 0.5, label: "parse failed", narrativeRole: nil) }
    }

    private static let validRoles: Set<String> = ["HOOK", "HERO", "REACTION", "RHYTHM", "CLOSER"]

    private func parseFrameArray(_ results: [[String: Any]], batch: [AnnotatedFrame]) -> [ScoredFrame] {
        var scored: [ScoredFrame] = []
        for item in results {
            // Accept both Int and Double index
            let index: Int?
            if let i = item["index"] as? Int { index = i }
            else if let d = item["index"] as? Double { index = Int(d) }
            else { index = nil }

            guard let idx = index, idx >= 0, idx < batch.count else { continue }

            let score: Double
            if let d = item["score"] as? Double { score = d }
            else if let i = item["score"] as? Int { score = Double(i) }
            else { continue }

            let label = item["label"] as? String ?? "highlight"
            let role = item["role"] as? String
            let validRole = role.flatMap { Self.validRoles.contains($0) ? $0 : nil }

            scored.append(ScoredFrame(
                timestamp: batch[idx].timestamp,
                score: max(0, min(1, score)),
                label: label,
                narrativeRole: validRole
            ))
        }
        return scored
    }

    // MARK: - Z-Score Normalization (matches web normalizeScoresAcrossBatches)

    private func normalizeScoresAcrossBatches(_ scores: [ScoredFrame]) -> [ScoredFrame] {
        guard scores.count > 1 else { return scores }

        let mean = scores.reduce(0.0) { $0 + $1.score } / Double(scores.count)
        let variance = scores.reduce(0.0) { $0 + ($1.score - mean) * ($1.score - mean) } / Double(scores.count)
        let stdDev = sqrt(variance)

        // Compute z-scores
        let zScores: [Double]
        if stdDev > 0.001 {
            zScores = scores.map { ($0.score - mean) / stdDev }
        } else {
            return scores
        }

        // Rescale to [0, 1]
        let minZ = zScores.min() ?? 0
        let maxZ = zScores.max() ?? 1
        let range = maxZ - minZ

        guard range > 0.001 else { return scores }

        return zip(scores, zScores).map { frame, z in
            ScoredFrame(
                timestamp: frame.timestamp,
                score: (z - minZ) / range,
                label: frame.label,
                narrativeRole: frame.narrativeRole
            )
        }
    }

    // MARK: - Scoring Prompt (identical to web buildScoringPromptBody)

    private func buildScoringPrompt(templateName: String?) -> String {
        let templateLine = templateName.map { "\nStyle context: \($0) template" } ?? ""

        return """
        You are a world-class Instagram Reels editor whose content averages 2M+ views.
        You understand the PSYCHOLOGY of scrolling — what makes a thumb stop, what makes someone save,
        what makes them share to their story, what makes them comment.

        You're reviewing raw footage from 1 source file. Your job: deeply analyze
        every single frame through the lens of INSTAGRAM VIRALITY.

        SOURCE FILES:
        - "video" (video)

        FOR EVERY FRAME, evaluate these 6 VIRALITY DIMENSIONS:

        1. SCROLL-STOP POWER — Would this freeze someone's thumb mid-scroll in the first 0.3 seconds?
           (High contrast, unexpected visuals, faces with intense emotion, dramatic scale, motion at peak)

        2. EMOTIONAL INTENSITY — Does this hit you in the gut? The algorithm rewards watch-time,
           and emotion is what keeps eyeballs locked. (Joy, shock, awe, pride, tenderness, humor, tension)

        3. SHAREABILITY — Would someone screenshot this or send it to a friend? "OMG LOOK AT THIS"
           moments. (Impressive feats, beautiful compositions, funny/unexpected, relatable reactions)

        4. SAVE POTENTIAL — Would someone hit the bookmark? Saves are weighted HIGHEST by the
           Instagram algorithm. (Aspirational moments, beautiful visuals, tutorial-worthy technique,
           emotional peaks worth rewatching)

        5. VISUAL PUNCH — How does this look on a 6-inch phone screen at half-brightness on a bus?
           Instagram is consumed on mobile. (High contrast > subtle, saturated > muted, close-up > wide,
           clean composition > cluttered, faces > landscapes at small scale)

        6. NARRATIVE ROLE — How would this serve a viral reel? Think about its FUNCTION:
           - HOOK: Could open the reel and stop scrolling
           - HERO: The main event, the peak moment, what the reel is "about"
           - REACTION: A face/moment that amplifies a hero moment via juxtaposition
           - RHYTHM: A transition beat, texture, pacing control
           - CLOSER: Could end the reel and trigger a replay/loop

        7. AUDIO INTELLIGENCE — Each frame has TWO audio signals:
           audioEnergy (0.0-1.0) = volume/loudness at this moment:
           - High (0.7+) = loud (crowd cheering, bass drop, impact, laughter)
           - Medium (0.3-0.7) = moderate (conversation, ambient music, movement)
           - Low (0.0-0.3) = quiet (silence, calm, anticipation, whispers)

           audioOnset (0.0-1.0) = how much the audio CHANGED — transient/beat detection:
           - High onset (0.5+) = something just HAPPENED (beat hit, impact, clap, sudden sound, bass drop)
           - This is the most important audio signal for editing — onsets are natural CUT POINTS.
           - High onset + high energy = definitive beat/impact moment (perfect for flash transitions, velocity hits)
           - High onset + low energy = the start of something (voice beginning, subtle sound emerging)
           - Low onset + high energy = sustained loudness (crowd noise, continuous music — not a cut point)
           Audio onset is what pro editors use to sync cuts to music. When you see a high onset, that's
           where a transition or speed change should land.

           FREQUENCY BANDS — What KIND of audio is happening (when available):
           audioBass (0.0-1.0): proportion of energy in bass (20-300 Hz) — drums, bass guitar, sub-bass
           audioMid (0.0-1.0): proportion of energy in voice band (300-2000 Hz) — speech, vocals, melody
           audioTreble (0.0-1.0): proportion of energy in treble (2000-8000 Hz) — cymbals, sibilants, brightness
           These ratios sum to ~1.0. Use them to identify what's happening sonically:
           - Mid-dominant (audioMid > 0.5): Likely SPEECH — someone talking, narrating, reacting
           - Bass-dominant (audioBass > 0.4) + onset peaks: Likely MUSIC with strong beat / bass drop
           - Broad spectrum (all bands 0.2-0.5): Full mix — music with vocals, rich soundscape
           - Treble-heavy (audioTreble > 0.4): Bright sounds — cymbals, crowd hiss, sharp transients
           Factor this into your label — note "speech detected" or "bass-heavy beat" when relevant.

        8. TEMPORAL DYNAMICS — Where does this frame sit in the moment's arc?
           This is what separates editors who find moments from editors who FEEL them.
           - Is this the PEAK of the action, or the wind-up just BEFORE impact?
           - Is energy RISING (anticipation/approach), PEAKING (climax/impact), or FALLING (aftermath/reaction)?
           - Peak moments are rare and precious — the ball hitting the net, the first bite, the jump's apex.
           - Wind-up frames create tension that makes peaks DEVASTATING (the arm pulling back before the throw).
           - Aftermath frames capture raw reaction (the face 0.5s after the surprise, the crowd erupting).
           - Compare each frame to its neighbors in the timeline — is energy building or releasing?

        Score each frame 0.0-1.0 based on OVERALL VIRALITY (weighing all 8 dimensions):
        - 0.85-1.0: VIRAL POTENTIAL — this frame alone could carry a reel. Scroll-stopping,
          emotionally loaded, share-worthy. Peak action, raw genuine emotion, stunning composition,
          dramatic lighting, unexpected beauty, decisive moments, perfect timing.
        - 0.65-0.84: STRONG BEAT — compelling enough to hold attention in a well-edited sequence.
          Good energy, interesting composition, narrative contribution. Supporting moments that
          make the hero shots hit harder by contrast.
        - 0.35-0.64: USABLE — generic energy but potentially valuable as a quick beat, reaction
          cutaway, or pacing change. Context-dependent value.
        - 0.0-0.34: DEAD WEIGHT — black frames, extreme blur, obstructed lens, test footage,
          nothing visually or emotionally redeemable.

        LABEL INSTRUCTIONS — This is CRITICAL. Your label is the planner's EYES.

        The tape planner will read your labels to understand the footage WITHOUT seeing the images.
        Your label must capture FIVE things in one vivid sentence:
        1. WHAT's in the frame (specific, cinematic description)
        2. MOTION — what's moving and how (camera panning, subject mid-leap, static close-up, slow drift)
        3. ENERGY ARC — is this a build-up, peak, or aftermath? (approaching impact / at the apex / reacting after)
        4. WHY it's viral (the emotional/visual hook)
        5. HOW it could be used (its narrative role + suggested speed treatment)

        NOT: "people dancing" → YES: "group mid-air jumping in sync under pink strobes, confetti frozen at apex — PEAK energy, share-worthy spectacle, hero shot begging for bullet slow-mo"
        NOT: "food on plate" → YES: "golden-crusted salmon, steam curl drifting up under warm pendant, camera slowly pushing in — RISING beauty, save-worthy food porn, could open the tape with ramp_out into the detail"
        NOT: "person smiling" → YES: "genuine shocked reaction 0.5s after reveal, mouth open eyes wide, completely still — AFTERMATH energy, golden-hour backlight, perfect reaction beat to hard-cut after a hero moment"
        \(templateLine)

        Respond with ONLY a JSON array:
        [{"index": 0, "score": 0.85, "role": "HERO", "label": "vivid description + viral reason + narrative role"}]

        The "role" field must be one of: HOOK, HERO, REACTION, RHYTHM, CLOSER.
        Pick the BEST fit for each frame — what role would this moment play in a viral reel?
        """
    }
}
