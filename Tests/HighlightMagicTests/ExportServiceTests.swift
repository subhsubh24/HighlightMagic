import Testing
import Foundation
import CoreMedia
@testable import HighlightMagic

@Suite("Export Configuration")
struct ExportServiceTests {

    @Test("Default export size is vertical 1080x1920")
    func testDefaultExportSize() {
        let size = ExportService.ExportConfig.defaultSize
        #expect(size.width == CGFloat(Constants.exportWidth))
        #expect(size.height == CGFloat(Constants.exportHeight))
        #expect(size.width == 1080)
        #expect(size.height == 1920)
    }

    @Test("Export config preserves all parameters")
    func testExportConfigPreservation() {
        let config = ExportService.ExportConfig(
            sourceURL: URL(fileURLWithPath: "/tmp/test.mp4"),
            trimStart: CMTime(seconds: 5, preferredTimescale: 600),
            trimEnd: CMTime(seconds: 35, preferredTimescale: 600),
            filter: .warm,
            captionText: "Test Caption",
            captionStyle: .bold,
            musicTrack: MusicLibrary.tracks.first,
            addWatermark: true,
            outputSize: ExportService.ExportConfig.defaultSize
        )

        #expect(config.filter == .warm)
        #expect(config.captionText == "Test Caption")
        #expect(config.captionStyle == .bold)
        #expect(config.addWatermark == true)
        #expect(config.musicTrack != nil)
    }

    @Test("Video filter has correct CIFilter names")
    func testFilterNames() {
        #expect(VideoFilter.none.ciFilterName == nil)
        #expect(VideoFilter.vibrant.ciFilterName == "CIVibrance")
        #expect(VideoFilter.warm.ciFilterName == "CITemperatureAndTint")
        #expect(VideoFilter.cool.ciFilterName == "CITemperatureAndTint")
        #expect(VideoFilter.noir.ciFilterName == "CIPhotoEffectNoir")
        #expect(VideoFilter.fade.ciFilterName == "CIPhotoEffectFade")
    }

    @Test("Caption styles have valid font sizes")
    func testCaptionStyles() {
        for style in CaptionStyle.allCases {
            #expect(style.fontSize > 0)
            #expect(style.fontSize <= 40)
            #expect(!style.fontWeight.isEmpty)
        }
    }
}

@Suite("Freemium Logic")
struct FreemiumTests {

    @Test("Free export limit is 5")
    func testFreeLimit() {
        #expect(Constants.freeExportLimit == 5)
    }

    @Test("Subscription product IDs are correct")
    func testProductIDs() {
        #expect(SubscriptionProduct.monthly.rawValue == "pro.monthly")
        #expect(SubscriptionProduct.yearly.rawValue == "pro.yearly")
    }

    @Test("Yearly plan shows savings")
    func testYearlySavings() {
        #expect(SubscriptionProduct.yearly.savingsLabel != nil)
        #expect(SubscriptionProduct.monthly.savingsLabel == nil)
    }
}

@Suite("App Constants")
struct ConstantsTests {

    @Test("Video limits are reasonable")
    func testVideoLimits() {
        #expect(Constants.maxVideoDurationSeconds == 600) // 10 min
        #expect(Constants.minClipDuration == 15)
        #expect(Constants.maxClipDuration == 60)
        #expect(Constants.targetClipCount == 3)
    }

    @Test("Export settings are vertical format")
    func testExportSettings() {
        #expect(Constants.exportWidth == 1080)
        #expect(Constants.exportHeight == 1920)
        #expect(Constants.exportHeight > Constants.exportWidth) // Vertical
        #expect(Constants.exportFrameRate == 30)
    }
}
