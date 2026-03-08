import Testing
import Foundation
@testable import HighlightMagic

@Suite("Input Validation")
struct InputValidationTests {

    @Test("Prompt trimming removes whitespace")
    func testPromptTrimming() {
        let result = InputValidation.validatePrompt("  hello world  ")
        #expect(result == "hello world")
    }

    @Test("Prompt truncation at 200 characters")
    func testPromptTruncation() {
        let longPrompt = String(repeating: "a", count: 300)
        let result = InputValidation.validatePrompt(longPrompt)
        #expect(result.count == 200)
    }

    @Test("Short prompt passes through unchanged")
    func testShortPrompt() {
        let result = InputValidation.validatePrompt("short prompt")
        #expect(result == "short prompt")
    }

    @Test("Empty prompt returns empty")
    func testEmptyPrompt() {
        let result = InputValidation.validatePrompt("")
        #expect(result.isEmpty)
    }

    @Test("Supported formats include common video formats")
    func testSupportedFormats() {
        #expect(InputValidation.supportedFormats.contains("mov"))
        #expect(InputValidation.supportedFormats.contains("mp4"))
        #expect(InputValidation.supportedFormats.contains("m4v"))
        #expect(InputValidation.supportedFormats.contains("avi"))
        #expect(InputValidation.supportedFormats.contains("mkv"))
        // Not supported
        #expect(!InputValidation.supportedFormats.contains("gif"))
        #expect(!InputValidation.supportedFormats.contains("webm"))
    }

    @Test("Video validation errors have human-readable descriptions")
    func testErrorDescriptions() {
        let durationError = InputValidation.VideoValidationError.durationTooLong(actual: 900, limit: 600)
        #expect(durationError.errorDescription?.contains("15 minutes") == true)

        let formatError = InputValidation.VideoValidationError.unsupportedFormat("webm")
        #expect(formatError.errorDescription?.contains("webm") == true)

        let notFound = InputValidation.VideoValidationError.fileNotFound
        #expect(notFound.errorDescription != nil)

        let noTrack = InputValidation.VideoValidationError.noVideoTrack
        #expect(noTrack.errorDescription != nil)

        let corrupted = InputValidation.VideoValidationError.corruptedFile
        #expect(corrupted.errorDescription != nil)
    }
}

@Suite("Constants")
struct ConstantsTests {

    @Test("Export dimensions match standard vertical video")
    func testExportDimensions() {
        #expect(Constants.exportWidth == 1080)
        #expect(Constants.exportHeight == 1920)
        #expect(Constants.exportFrameRate == 30)
    }

    @Test("Clip duration limits are sensible")
    func testClipDurationLimits() {
        #expect(Constants.minClipDuration >= 1)
        #expect(Constants.maxClipDuration <= 120)
        #expect(Constants.minClipDuration < Constants.maxClipDuration)
    }

    @Test("Video duration limit is 10 minutes")
    func testVideoDurationLimit() {
        #expect(Constants.maxVideoDurationSeconds == 600)
    }

    @Test("Free export limit is reasonable")
    func testFreeExportLimit() {
        #expect(Constants.freeExportLimit > 0)
        #expect(Constants.freeExportLimit <= 10)
    }

    @Test("Watermark settings are present")
    func testWatermarkSettings() {
        #expect(!Constants.watermarkText.isEmpty)
        #expect(Constants.watermarkOpacity > 0 && Constants.watermarkOpacity < 1)
    }

    @Test("Layout constants are positive")
    func testLayoutConstants() {
        #expect(Constants.Layout.cornerRadius > 0)
        #expect(Constants.Layout.padding > 0)
        #expect(Constants.Layout.smallPadding > 0)
        #expect(Constants.Layout.cardShadowRadius > 0)
    }

    @Test("Animation durations are short")
    func testAnimationDurations() {
        #expect(Constants.Animation.standard < 1.0)
        #expect(Constants.Animation.slow < 1.0)
        #expect(Constants.Animation.spring < 1.0)
    }
}

@Suite("Viral Edit Config")
struct ViralEditConfigTests {

    @Test("Default config has viral features enabled")
    func testDefaultConfig() {
        let config = ViralEditConfig.default
        #expect(config.beatSyncEnabled == true)
        #expect(config.seamlessLoopEnabled == true)
        #expect(config.hookFirstOrdering == true)
        #expect(config.velocityStyle == .hero)
        #expect(config.kineticCaptionStyle == .pop)
    }

    @Test("Off config disables all features")
    func testOffConfig() {
        let config = ViralEditConfig.off
        #expect(config.beatSyncEnabled == false)
        #expect(config.seamlessLoopEnabled == false)
        #expect(config.hookFirstOrdering == false)
        #expect(config.velocityStyle == .none)
        #expect(config.kineticCaptionStyle == .none)
    }

    @Test("Custom config preserves all fields")
    func testCustomConfig() {
        let config = ViralEditConfig(
            beatSyncEnabled: false,
            velocityStyle: .bullet,
            seamlessLoopEnabled: true,
            kineticCaptionStyle: .typewriter,
            hookFirstOrdering: false
        )
        #expect(config.velocityStyle == .bullet)
        #expect(config.kineticCaptionStyle == .typewriter)
    }

    @Test("ViralEditConfig is Hashable")
    func testHashable() {
        let a = ViralEditConfig.default
        let b = ViralEditConfig.default
        #expect(a == b)
        #expect(a.hashValue == b.hashValue)
    }
}

@Suite("Kinetic Caption Style")
struct KineticCaptionStyleTests {

    @Test("All styles have descriptions")
    func testDescriptions() {
        for style in KineticCaptionStyle.allCases {
            #expect(!style.description.isEmpty)
        }
    }

    @Test("All styles have icons")
    func testIcons() {
        for style in KineticCaptionStyle.allCases {
            #expect(!style.icon.isEmpty)
        }
    }

    @Test("CaseIterable has expected count")
    func testCaseCount() {
        #expect(KineticCaptionStyle.allCases.count == 5)
    }
}

@Suite("Cinematic Grade")
struct CinematicGradeTests {

    @Test("All grades have descriptions and icons")
    func testDescriptionsAndIcons() {
        for grade in CinematicGrade.allCases {
            #expect(!grade.description.isEmpty)
            #expect(!grade.icon.isEmpty)
        }
    }

    @Test("Preview colors are valid hex pairs")
    func testPreviewColors() {
        for grade in CinematicGrade.allCases {
            let colors = grade.previewColor
            #expect(colors.primary.count == 6)
            #expect(colors.secondary.count == 6)
        }
    }

    @Test("CaseIterable has expected count")
    func testCaseCount() {
        #expect(CinematicGrade.allCases.count == 6)
    }
}

@Suite("BeatSyncService")
struct BeatSyncServiceTests {

    @Test("Synthetic beat map generates correct BPM")
    func testSyntheticBeatMap() async {
        let service = BeatSyncService.shared
        let map = await service.syntheticBeatMap(bpm: 120, duration: 10)
        #expect(map.bpm == 120)
        #expect(map.beatInterval == 0.5)
        #expect(!map.beatTimes.isEmpty)
        #expect(!map.strongBeats.isEmpty)
    }

    @Test("Synthetic beat map produces expected beat count")
    func testSyntheticBeatCount() async {
        let service = BeatSyncService.shared
        let map = await service.syntheticBeatMap(bpm: 120, duration: 10)
        // 120 BPM = 2 beats/sec, 10 sec = 20 beats
        #expect(map.beatTimes.count == 20)
    }

    @Test("Nearest beat finds closest time")
    func testNearestBeat() async {
        let service = BeatSyncService.shared
        let map = await service.syntheticBeatMap(bpm: 60, duration: 10)
        // BPM=60 → beats at 0, 1, 2, 3, ..., 9
        let nearest = map.nearestBeat(to: 2.3)
        #expect(nearest == 2.0)
    }

    @Test("Beats in range filters correctly")
    func testBeatsInRange() async {
        let service = BeatSyncService.shared
        let map = await service.syntheticBeatMap(bpm: 60, duration: 10)
        let beats = map.beats(in: 2.0...4.5)
        #expect(beats.count == 3) // 2.0, 3.0, 4.0
    }

    @Test("Strong beats are every 4th beat")
    func testStrongBeats() async {
        let service = BeatSyncService.shared
        let map = await service.syntheticBeatMap(bpm: 120, duration: 10)
        // 20 beats, every 4th = indices 0, 4, 8, 12, 16 → 5 strong beats
        #expect(map.strongBeats.count == 5)
    }

    @Test("Synthetic map handles zero BPM gracefully")
    func testZeroBPM() async {
        let service = BeatSyncService.shared
        let map = await service.syntheticBeatMap(bpm: 0, duration: 10)
        // Should fallback to 120 BPM
        #expect(map.bpm == 120)
    }

    @Test("Synthetic map handles non-finite duration gracefully")
    func testInfiniteDuration() async {
        let service = BeatSyncService.shared
        let map = await service.syntheticBeatMap(bpm: 120, duration: .infinity)
        // Should fallback to 60s
        #expect(map.bpm == 120)
        #expect(!map.beatTimes.isEmpty)
    }
}

@Suite("VelocityEditService")
struct VelocityEditServiceTests {

    @Test("VelocitySegment computes output duration correctly")
    func testSegmentOutputDuration() {
        let segment = VelocityEditService.VelocitySegment(
            sourceStart: 0,
            sourceEnd: 2,
            speed: 0.5,
            easeIn: false,
            easeOut: false
        )
        #expect(segment.sourceDuration == 2.0)
        #expect(segment.outputDuration == 4.0) // Half speed = double duration
    }

    @Test("Fast speed reduces output duration")
    func testFastSegment() {
        let segment = VelocityEditService.VelocitySegment(
            sourceStart: 0,
            sourceEnd: 3,
            speed: 3.0,
            easeIn: false,
            easeOut: false
        )
        #expect(segment.outputDuration == 1.0) // 3x speed = 1/3 duration
    }

    @Test("Normal speed preserves duration")
    func testNormalSpeed() {
        let segment = VelocityEditService.VelocitySegment(
            sourceStart: 1,
            sourceEnd: 5,
            speed: 1.0,
            easeIn: true,
            easeOut: true
        )
        #expect(segment.sourceDuration == 4.0)
        #expect(segment.outputDuration == 4.0)
    }

    @Test("VelocityStyle has expected cases")
    func testVelocityStyles() {
        let styles = VelocityEditService.VelocityStyle.allCases
        #expect(styles.count == 5)
        #expect(styles.contains(.hero))
        #expect(styles.contains(.bullet))
        #expect(styles.contains(.montage))
        #expect(styles.contains(.smooth))
        #expect(styles.contains(.none))
    }
}

@Suite("BeatSyncError")
struct BeatSyncErrorTests {

    @Test("Errors have localized descriptions")
    func testErrorDescriptions() {
        let errors: [BeatSyncError] = [.invalidAudio, .noAudioTrack, .noAudioData]
        for error in errors {
            #expect(error.errorDescription != nil)
            #expect(!error.errorDescription!.isEmpty)
        }
    }
}
