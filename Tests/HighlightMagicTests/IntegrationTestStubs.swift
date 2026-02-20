import Testing
import Foundation
@testable import HighlightMagic

@Suite("Integration Flow Stubs")
struct IntegrationTestStubs {

    @Test("Full flow: video selection → detection → clip generation → export config")
    func testFullFlowStub() async {
        // This test validates the data flow between components
        // In a real test environment, we'd use a sample video file

        // 1. Simulate video selection
        let videoItem = VideoItem(
            sourceURL: URL(fileURLWithPath: "/tmp/sample.mp4"),
            duration: 120, // 2 minutes
            creationDate: .now
        )
        #expect(videoItem.isWithinLimit)
        #expect(videoItem.formattedDuration == "2:00")

        // 2. Simulate highlight segments
        let segments = [
            HighlightSegment(
                startTime: .init(seconds: 30, preferredTimescale: 600),
                endTime: .init(seconds: 60, preferredTimescale: 600),
                confidenceScore: 0.85,
                label: "Peak Moment",
                detectionSources: [.visionMotion, .visionFace]
            ),
            HighlightSegment(
                startTime: .init(seconds: 75, preferredTimescale: 600),
                endTime: .init(seconds: 105, preferredTimescale: 600),
                confidenceScore: 0.72,
                label: "Key Highlight",
                detectionSources: [.visionScene]
            )
        ]

        // 3. Simulate clip generation
        let clips = await ClipGenerationService.shared.generateClips(
            from: videoItem,
            segments: segments
        )

        #expect(clips.count == 2)
        #expect(clips[0].sourceVideoID == videoItem.id)
        #expect(clips[0].duration == 30.0)
        #expect(clips[1].duration == 30.0)

        // 4. Verify export config can be built
        let config = ExportService.ExportConfig(
            sourceURL: videoItem.sourceURL,
            trimStart: clips[0].trimStart,
            trimEnd: clips[0].trimEnd,
            filter: .vibrant,
            captionText: clips[0].captionText,
            captionStyle: .bold,
            musicTrack: MusicLibrary.tracks.first,
            addWatermark: true,
            outputSize: ExportService.ExportConfig.defaultSize
        )

        #expect(config.captionText == "Peak Moment")
    }

    @Test("Template application changes clip properties")
    func testTemplateApplication() async {
        let segment = HighlightSegment(
            startTime: .init(seconds: 0, preferredTimescale: 600),
            endTime: .init(seconds: 30, preferredTimescale: 600),
            confidenceScore: 0.8,
            label: "Test"
        )

        var clip = EditedClip(sourceVideoID: UUID(), segment: segment)
        let adventureTemplate = TemplateLibrary.templates.first { $0.name == "Adventure" }!

        clip.selectedFilter = adventureTemplate.suggestedFilter
        clip.captionStyle = adventureTemplate.suggestedCaptionStyle

        #expect(clip.selectedFilter == .vibrant)
        #expect(clip.captionStyle == .bold)
    }

    @Test("Video duration validation")
    func testDurationValidation() {
        let shortVideo = VideoItem(sourceURL: URL(fileURLWithPath: "/tmp/short.mp4"), duration: 30)
        let longVideo = VideoItem(sourceURL: URL(fileURLWithPath: "/tmp/long.mp4"), duration: 700)

        #expect(shortVideo.isWithinLimit)
        #expect(!longVideo.isWithinLimit)
    }

    @Test("Saved project serialization roundtrip")
    func testProjectSerialization() throws {
        let project = SavedProject(
            name: "Beach Trip",
            videoSourcePath: "/tmp/beach.mp4",
            prompt: "sunset moments",
            templateName: "Travel",
            clipConfigs: [
                SavedClipConfig(
                    trimStartSeconds: 10,
                    trimEndSeconds: 40,
                    filterName: "warm",
                    captionText: "Sunset",
                    captionStyleName: "minimal",
                    musicTrackName: "Golden Hour"
                )
            ]
        )

        let data = try JSONEncoder().encode(project)
        let decoded = try JSONDecoder().decode(SavedProject.self, from: data)

        #expect(decoded.name == "Beach Trip")
        #expect(decoded.prompt == "sunset moments")
        #expect(decoded.clipConfigs.count == 1)
        #expect(decoded.clipConfigs[0].filterName == "warm")
    }
}
