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

    // MARK: - Generate Velocity Map

    func generateVelocityMap(
        clipDuration: Double,
        beatMap: BeatSyncService.BeatMap,
        style: VelocityStyle,
        clipStartInMusic: Double = 0
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

        switch style {
        case .hero:
            return buildHeroVelocity(
                clipDuration: clipDuration,
                beats: relevantBeats,
                strongBeats: relevantStrongBeats,
                beatInterval: beatMap.beatInterval
            )
        case .bullet:
            return buildBulletVelocity(
                clipDuration: clipDuration,
                beats: relevantBeats,
                strongBeats: relevantStrongBeats,
                beatInterval: beatMap.beatInterval
            )
        case .montage:
            return buildMontageVelocity(
                clipDuration: clipDuration,
                beats: relevantBeats,
                beatInterval: beatMap.beatInterval
            )
        case .smooth:
            return buildSmoothVelocity(
                clipDuration: clipDuration,
                beats: relevantBeats,
                beatInterval: beatMap.beatInterval
            )
        case .none:
            fatalError("Unreachable")
        }
    }

    // MARK: - Hero Style: Fast buildup -> dramatic slow-mo on strong beats -> fast recovery

    private func buildHeroVelocity(
        clipDuration: Double,
        beats: [Double],
        strongBeats: [Double],
        beatInterval: Double
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
                    speed: 2.5,
                    easeIn: false,
                    easeOut: true
                ))
            }

            // Ramp-down to slow-mo
            if slowStart > rampStart {
                segments.append(VelocitySegment(
                    sourceStart: rampStart,
                    sourceEnd: slowStart,
                    speed: 1.5,
                    easeIn: true,
                    easeOut: true
                ))
            }

            // Slow-mo on the beat
            segments.append(VelocitySegment(
                sourceStart: slowStart,
                sourceEnd: slowEnd,
                speed: 0.3,
                easeIn: true,
                easeOut: true
            ))

            currentTime = slowEnd
        }

        // Fill remaining time at normal/fast speed
        if currentTime < clipDuration {
            segments.append(VelocitySegment(
                sourceStart: currentTime,
                sourceEnd: clipDuration,
                speed: 1.5,
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
        beatInterval: Double
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
                    speed: 3.5,
                    easeIn: false,
                    easeOut: false
                ))
            }

            // Sharp slow-mo snap
            segments.append(VelocitySegment(
                sourceStart: snapStart,
                sourceEnd: snapEnd,
                speed: 0.2,
                easeIn: false,
                easeOut: false
            ))

            currentTime = snapEnd
        }

        if currentTime < clipDuration {
            segments.append(VelocitySegment(
                sourceStart: currentTime,
                sourceEnd: clipDuration,
                speed: 2.0,
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
        beatInterval: Double
    ) -> VelocityMap {
        var segments: [VelocitySegment] = []
        var currentTime = 0.0

        for (index, beat) in beats.enumerated() {
            guard beat > currentTime && beat < clipDuration else { continue }

            let segmentEnd = min(
                clipDuration,
                index + 1 < beats.count ? beats[index + 1] : clipDuration
            )

            // Alternate between slightly fast and slightly slow
            let speed: Double = index % 2 == 0 ? 1.3 : 0.8

            if beat > currentTime {
                segments.append(VelocitySegment(
                    sourceStart: currentTime,
                    sourceEnd: beat,
                    speed: 1.0,
                    easeIn: true,
                    easeOut: true
                ))
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
        beatInterval: Double
    ) -> VelocityMap {
        // Divide clip into beat-aligned segments with gentle speed variation
        let segmentCount = max(Int(clipDuration / beatInterval), 2)
        let segmentDuration = clipDuration / Double(segmentCount)

        var segments: [VelocitySegment] = []

        for i in 0..<segmentCount {
            let start = Double(i) * segmentDuration
            let end = min(Double(i + 1) * segmentDuration, clipDuration)
            // Sine-wave speed: oscillates between 0.7x and 1.3x
            let phase = Double(i) / Double(segmentCount) * .pi * 2
            let speed = 1.0 + 0.3 * sin(phase)

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
