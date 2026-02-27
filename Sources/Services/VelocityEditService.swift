import Foundation
import AVFoundation
import CoreMedia

/// Generates speed-ramped (velocity edit) time mappings for video clips.
/// Creates the signature viral "slow-mo on beats, fast between beats" effect.
actor VelocityEditService {
    static let shared = VelocityEditService()

    private init() {}

    /// A velocity curve segment: remap a source time range to a different playback speed
    struct VelocitySegment: Sendable {
        let sourceStart: Double    // seconds in original clip
        let sourceEnd: Double
        let speed: Double          // 1.0 = normal, 0.3 = slow-mo, 3.0 = 3x speed
        let easeIn: Bool           // smooth transition into this speed
        let easeOut: Bool          // smooth transition out of this speed

        var sourceDuration: Double { sourceEnd - sourceStart }
        var outputDuration: Double { sourceDuration / speed }
    }

    /// Complete velocity edit specification for a clip
    struct VelocityMap: Sendable {
        let segments: [VelocitySegment]
        let originalDuration: Double
        let outputDuration: Double

        /// Builds the AVMutableComposition time mappings
        var timeRanges: [(source: CMTimeRange, target: CMTimeRange)] {
            var mappings: [(source: CMTimeRange, target: CMTimeRange)] = []
            var outputTime = 0.0

            for segment in segments {
                let sourceRange = CMTimeRange(
                    start: CMTime(seconds: segment.sourceStart, preferredTimescale: 600),
                    duration: CMTime(seconds: segment.sourceDuration, preferredTimescale: 600)
                )
                let targetRange = CMTimeRange(
                    start: CMTime(seconds: outputTime, preferredTimescale: 600),
                    duration: CMTime(seconds: segment.outputDuration, preferredTimescale: 600)
                )
                mappings.append((source: sourceRange, target: targetRange))
                outputTime += segment.outputDuration
            }

            return mappings
        }
    }

    // MARK: - Velocity Edit Styles

    enum VelocityStyle: String, CaseIterable, Sendable {
        case hero = "Hero"          // Classic speed ramp: fast build-up, slow on beat, fast recovery
        case bullet = "Bullet"      // Sharp slow-mo snaps on every strong beat
        case montage = "Montage"    // Moderate speed variation for multi-clip sequences
        case smooth = "Smooth"      // Gentle speed curves, subtle velocity changes
        case none = "None"          // No velocity editing

        var description: String {
            switch self {
            case .hero: "Dramatic slow-mo on beat drops"
            case .bullet: "Sharp speed snaps on every beat"
            case .montage: "Smooth multi-clip pacing"
            case .smooth: "Subtle, elegant speed curves"
            case .none: "Normal speed"
            }
        }

        var icon: String {
            switch self {
            case .hero: "bolt.fill"
            case .bullet: "scope"
            case .montage: "film.stack"
            case .smooth: "water.waves"
            case .none: "play"
            }
        }
    }

    // MARK: - Generate Velocity Map from Custom Keyframes

    /// Generates a velocity map from AI-designed custom keyframes.
    /// This is the primary path when Claude provides per-clip speed curves
    /// (matching the web platform's approach). Cubic interpolation between keyframes.
    func generateVelocityMapFromKeyframes(
        clipDuration: Double,
        keyframes: [VelocityKeyframe]
    ) -> VelocityMap {
        guard keyframes.count >= 2, clipDuration > 0 else {
            return VelocityMap(
                segments: [VelocitySegment(
                    sourceStart: 0, sourceEnd: clipDuration,
                    speed: 1.0, easeIn: false, easeOut: false
                )],
                originalDuration: clipDuration,
                outputDuration: clipDuration
            )
        }

        let sorted = keyframes.sorted { $0.position < $1.position }
        // Subdivide into small segments for smooth interpolation (100 steps)
        let steps = 100
        var segments: [VelocitySegment] = []
        let dt = clipDuration / Double(steps)

        for i in 0..<steps {
            let start = Double(i) * dt
            let end = min(Double(i + 1) * dt, clipDuration)
            let position = (start + end) / 2.0 / clipDuration // midpoint position
            let speed = max(0.1, interpolateSpeed(at: position, keyframes: sorted))

            segments.append(VelocitySegment(
                sourceStart: start,
                sourceEnd: end,
                speed: speed,
                easeIn: true,
                easeOut: true
            ))
        }

        let outputDuration = segments.reduce(0.0) { $0 + $1.outputDuration }
        return VelocityMap(segments: segments, originalDuration: clipDuration, outputDuration: outputDuration)
    }

    /// Cubic ease-in-out interpolation between keyframe speed values.
    private func interpolateSpeed(at position: Double, keyframes: [VelocityKeyframe]) -> Double {
        let p = min(max(position, 0), 1)

        guard let first = keyframes.first, let last = keyframes.last else { return 1.0 }
        if p <= first.position { return first.speed }
        if p >= last.position { return last.speed }

        // Find surrounding keyframes
        var lower = first
        var upper = last
        for i in 0..<(keyframes.count - 1) {
            if p >= keyframes[i].position && p <= keyframes[i + 1].position {
                lower = keyframes[i]
                upper = keyframes[i + 1]
                break
            }
        }

        guard upper.position > lower.position else { return lower.speed }

        // Smooth cubic ease-in-out
        let t = (p - lower.position) / (upper.position - lower.position)
        let smoothT = t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
        return lower.speed + (upper.speed - lower.speed) * smoothT
    }

    // MARK: - Generate Velocity Map from Preset

    /// Generates a velocity map for a clip using a named preset style.
    /// Fallback path when custom keyframes aren't provided.
    /// - Parameter intensity: 0.0–1.0 — scales all speed ramp values.
    func generateVelocityMap(
        clipDuration: Double,
        beatMap: BeatSyncService.BeatMap,
        style: VelocityStyle,
        clipStartInMusic: Double = 0,
        intensity: Double = 1.0
    ) -> VelocityMap {
        guard style != .none else {
            return VelocityMap(
                segments: [VelocitySegment(
                    sourceStart: 0,
                    sourceEnd: clipDuration,
                    speed: 1.0,
                    easeIn: false,
                    easeOut: false
                )],
                originalDuration: clipDuration,
                outputDuration: clipDuration
            )
        }

        // Get beats that fall within this clip's time range in the music
        let clipEndInMusic = clipStartInMusic + clipDuration
        let relevantBeats = beatMap.beats(in: clipStartInMusic...clipEndInMusic)
            .map { $0 - clipStartInMusic } // Normalize to clip-local time
        let relevantStrongBeats = beatMap.strongBeats(in: clipStartInMusic...clipEndInMusic)
            .map { $0 - clipStartInMusic }

        let clampedIntensity = min(max(intensity, 0), 1)

        switch style {
        case .hero:
            return buildHeroVelocity(
                clipDuration: clipDuration,
                beats: relevantBeats,
                strongBeats: relevantStrongBeats,
                beatInterval: beatMap.beatInterval,
                intensity: clampedIntensity
            )
        case .bullet:
            return buildBulletVelocity(
                clipDuration: clipDuration,
                beats: relevantBeats,
                strongBeats: relevantStrongBeats,
                beatInterval: beatMap.beatInterval,
                intensity: clampedIntensity
            )
        case .montage:
            return buildMontageVelocity(
                clipDuration: clipDuration,
                beats: relevantBeats,
                beatInterval: beatMap.beatInterval,
                intensity: clampedIntensity
            )
        case .smooth:
            return buildSmoothVelocity(
                clipDuration: clipDuration,
                beats: relevantBeats,
                beatInterval: beatMap.beatInterval,
                intensity: clampedIntensity
            )
        case .none:
            // Unreachable due to guard above, but required for exhaustive switch
            return VelocityMap(
                segments: [VelocitySegment(
                    sourceStart: 0,
                    sourceEnd: clipDuration,
                    speed: 1.0,
                    easeIn: false,
                    easeOut: false
                )],
                originalDuration: clipDuration,
                outputDuration: clipDuration
            )
        }
    }

    /// Scales a raw speed toward 1.0 based on intensity.
    /// intensity=1.0 → raw speed unchanged. intensity=0.0 → always 1.0x.
    private func scaled(_ rawSpeed: Double, intensity: Double) -> Double {
        1.0 + (rawSpeed - 1.0) * intensity
    }

    // MARK: - Hero Style: Fast buildup -> dramatic slow-mo on strong beats -> fast recovery

    private func buildHeroVelocity(
        clipDuration: Double,
        beats: [Double],
        strongBeats: [Double],
        beatInterval: Double,
        intensity: Double
    ) -> VelocityMap {
        var segments: [VelocitySegment] = []
        let slowMoDuration = beatInterval * 0.6  // Slow-mo lasts ~60% of a beat
        let rampDuration = beatInterval * 0.3    // Speed transition takes ~30% of a beat

        var currentTime = 0.0

        for strongBeat in strongBeats {
            guard strongBeat > currentTime && strongBeat < clipDuration else { continue }

            let rampStart = max(currentTime, strongBeat - rampDuration - beatInterval)
            let slowStart = max(currentTime, strongBeat - slowMoDuration / 2)
            let slowEnd = min(clipDuration, strongBeat + slowMoDuration / 2)

            // Fast section before the beat
            if rampStart > currentTime {
                segments.append(VelocitySegment(
                    sourceStart: currentTime,
                    sourceEnd: rampStart,
                    speed: scaled(2.5, intensity: intensity),
                    easeIn: false,
                    easeOut: true
                ))
            }

            // Ramp-down to slow-mo
            if slowStart > rampStart {
                segments.append(VelocitySegment(
                    sourceStart: rampStart,
                    sourceEnd: slowStart,
                    speed: scaled(1.5, intensity: intensity),
                    easeIn: true,
                    easeOut: true
                ))
            }

            // Slow-mo on the beat (skip if zero-duration)
            if slowEnd > slowStart {
                segments.append(VelocitySegment(
                    sourceStart: slowStart,
                    sourceEnd: slowEnd,
                    speed: scaled(0.3, intensity: intensity),
                    easeIn: true,
                    easeOut: true
                ))
            }

            currentTime = slowEnd
        }

        // Fill remaining time at normal/fast speed
        if currentTime < clipDuration {
            segments.append(VelocitySegment(
                sourceStart: currentTime,
                sourceEnd: clipDuration,
                speed: scaled(1.5, intensity: intensity),
                easeIn: true,
                easeOut: false
            ))
        }

        let outputDuration = segments.reduce(0.0) { $0 + $1.outputDuration }
        return VelocityMap(segments: segments, originalDuration: clipDuration, outputDuration: outputDuration)
    }

    // MARK: - Bullet Style: Sharp snaps on every strong beat

    private func buildBulletVelocity(
        clipDuration: Double,
        beats: [Double],
        strongBeats: [Double],
        beatInterval: Double,
        intensity: Double
    ) -> VelocityMap {
        var segments: [VelocitySegment] = []
        let snapDuration = beatInterval * 0.35

        var currentTime = 0.0

        for beat in strongBeats {
            guard beat > currentTime && beat < clipDuration else { continue }

            let snapStart = max(currentTime, beat - snapDuration / 4)
            let snapEnd = min(clipDuration, beat + snapDuration * 3 / 4)

            // Fast between beats
            if snapStart > currentTime {
                segments.append(VelocitySegment(
                    sourceStart: currentTime,
                    sourceEnd: snapStart,
                    speed: scaled(3.5, intensity: intensity),
                    easeIn: false,
                    easeOut: false
                ))
            }

            // Sharp slow-mo snap
            segments.append(VelocitySegment(
                sourceStart: snapStart,
                sourceEnd: snapEnd,
                speed: scaled(0.2, intensity: intensity),
                easeIn: false,
                easeOut: false
            ))

            currentTime = snapEnd
        }

        if currentTime < clipDuration {
            segments.append(VelocitySegment(
                sourceStart: currentTime,
                sourceEnd: clipDuration,
                speed: scaled(2.0, intensity: intensity),
                easeIn: false,
                easeOut: false
            ))
        }

        let outputDuration = segments.reduce(0.0) { $0 + $1.outputDuration }
        return VelocityMap(segments: segments, originalDuration: clipDuration, outputDuration: outputDuration)
    }

    // MARK: - Montage Style: Moderate variations for multi-clip sequences

    private func buildMontageVelocity(
        clipDuration: Double,
        beats: [Double],
        beatInterval: Double,
        intensity: Double
    ) -> VelocityMap {
        var segments: [VelocitySegment] = []
        var currentTime = 0.0

        for (index, beat) in beats.enumerated() {
            guard beat >= currentTime && beat < clipDuration else { continue }

            let segmentEnd = min(
                clipDuration,
                index + 1 < beats.count ? beats[index + 1] : clipDuration
            )

            // Alternate between slightly fast and slightly slow, scaled by intensity
            let speed: Double = index % 2 == 0 ? scaled(1.3, intensity: intensity) : scaled(0.8, intensity: intensity)

            if beat > currentTime {
                segments.append(VelocitySegment(
                    sourceStart: currentTime,
                    sourceEnd: beat,
                    speed: 1.0,
                    easeIn: true,
                    easeOut: true
                ))
            }

            // Skip zero-duration segments (beat at clip boundary)
            guard segmentEnd > beat else {
                currentTime = segmentEnd
                continue
            }

            segments.append(VelocitySegment(
                sourceStart: beat,
                sourceEnd: segmentEnd,
                speed: speed,
                easeIn: true,
                easeOut: true
            ))

            currentTime = segmentEnd
        }

        if currentTime < clipDuration {
            segments.append(VelocitySegment(
                sourceStart: currentTime,
                sourceEnd: clipDuration,
                speed: 1.0,
                easeIn: false,
                easeOut: false
            ))
        }

        let outputDuration = segments.reduce(0.0) { $0 + $1.outputDuration }
        return VelocityMap(segments: segments, originalDuration: clipDuration, outputDuration: outputDuration)
    }

    // MARK: - Smooth Style: Gentle sine-wave-like speed curves

    private func buildSmoothVelocity(
        clipDuration: Double,
        beats: [Double],
        beatInterval: Double,
        intensity: Double
    ) -> VelocityMap {
        // Divide clip into beat-aligned segments with gentle speed variation
        let segmentCount = max(Int(clipDuration / beatInterval), 2)
        let segmentDuration = clipDuration / Double(segmentCount)

        var segments: [VelocitySegment] = []

        for i in 0..<segmentCount {
            let start = Double(i) * segmentDuration
            let end = min(Double(i + 1) * segmentDuration, clipDuration)
            // Sine-wave speed: amplitude scaled by intensity (0.0 → flat 1.0x, 1.0 → 0.7x–1.3x)
            let phase = Double(i) / Double(segmentCount) * .pi * 2
            let speed = 1.0 + 0.3 * intensity * sin(phase)

            segments.append(VelocitySegment(
                sourceStart: start,
                sourceEnd: end,
                speed: speed,
                easeIn: true,
                easeOut: true
            ))
        }

        let outputDuration = segments.reduce(0.0) { $0 + $1.outputDuration }
        return VelocityMap(segments: segments, originalDuration: clipDuration, outputDuration: outputDuration)
    }
}
