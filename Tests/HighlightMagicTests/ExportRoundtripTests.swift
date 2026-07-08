import Testing
import Foundation
import AVFoundation
import CoreMedia
import CoreVideo
@testable import HighlightMagic

/// Executing round-trip test for the real export pipeline.
///
/// Every other `ExportServiceTests` case asserts *configuration* (sizes, IDs, filter
/// names) — none of them actually invoke `ExportService.exportClip`, so a regression
/// that produced a broken file, the wrong resolution, or no file at all would pass CI
/// silently. This suite synthesizes a real source video on disk, runs it through the
/// production `exportClip` path, and asserts a PLAYABLE 1080×1920 .mp4 comes out the
/// other end (file exists, has a decodable video track, is vertical 1080×1920, has a
/// non-zero duration). It is the outcome-asserting proof that the core
/// import → export → shareable-file journey genuinely works.
@Suite("Export Round-trip (executing)")
struct ExportRoundtripTests {

    /// Write a small solid-color H.264 source clip to a temp .mov and return its URL.
    /// `frameCount` frames at 30fps (default 30 → ~1s), 640×480 landscape (identity
    /// transform), so the export path must letterbox/scale it up to the vertical target.
    private func makeSourceVideo(frameCount: Int = 30) async throws -> URL {
        let width = 640
        let height = 480
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("hm_src_\(UUID().uuidString)")
            .appendingPathExtension("mov")

        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height
            ]
        )
        guard writer.canAdd(input) else {
            throw ExportError.exportFailed("test writer cannot add video input")
        }
        writer.add(input)

        guard writer.startWriting() else {
            throw ExportError.exportFailed("test writer failed to start: \(String(describing: writer.error))")
        }
        writer.startSession(atSourceTime: .zero)

        for frame in 0..<frameCount {
            while !input.isReadyForMoreMediaData {
                try await Task.sleep(for: .milliseconds(5))
            }
            let pixelBuffer = try Self.makePixelBuffer(width: width, height: height, seed: frame)
            let pts = CMTime(value: Int64(frame), timescale: 30)
            guard adaptor.append(pixelBuffer, withPresentationTime: pts) else {
                throw ExportError.exportFailed("test writer failed to append frame \(frame): \(String(describing: writer.error))")
            }
        }

        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else {
            throw ExportError.exportFailed("test writer did not complete: \(String(describing: writer.error))")
        }
        return url
    }

    /// Allocate a BGRA pixel buffer filled with a solid color that varies per frame
    /// (so the encoder has real, changing content to encode).
    private static func makePixelBuffer(width: Int, height: Int, seed: Int) throws -> CVPixelBuffer {
        var pixelBuffer: CVPixelBuffer?
        let attrs: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
        ]
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault, width, height,
            kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pixelBuffer
        )
        guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
            throw ExportError.exportFailed("test could not allocate pixel buffer (status \(status))")
        }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        if let base = CVPixelBufferGetBaseAddress(buffer) {
            let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
            // Fill with a mid-gray that shifts slightly each frame.
            let value = UInt8(60 + (seed * 5) % 150)
            _ = memset(base, Int32(value), bytesPerRow * height)
        }
        return buffer
    }

    @Test("exportClip produces a playable 1080x1920 mp4 file on disk")
    func testExportProducesPlayableVerticalMP4() async throws {
        let sourceURL = try await makeSourceVideo()
        defer { try? FileManager.default.removeItem(at: sourceURL) }

        // Maximal REAL export the CI simulator can run to completion: no CIFilter effects
        // (filter=.none) AND no CALayer overlays (empty caption, no watermark, no premium effects),
        // so the export skips AVVideoCompositionCoreAnimationTool — the Core Animation post-process
        // pass that HANGS on the iOS Simulator (no hardware CA video compositing). This still drives
        // the real path end to end: composition → scale-to-vertical transform → H.264 encode → .mp4
        // container → playable file. The caption/watermark overlay pass is Core-Animation and hence
        // device-only; its configuration is asserted separately in ExportServiceTests (not claimed
        // as executed here). Honest scope over a green-but-hanging test (FACTORY_STANDARD §6c).
        let config = ExportService.ExportConfig(
            sourceURL: sourceURL,
            trimStart: .zero,
            trimEnd: CMTime(seconds: 0.9, preferredTimescale: 600),
            filter: .none,
            captionText: "",
            captionStyle: .bold,
            musicTrack: nil,
            addWatermark: false,
            outputSize: ExportService.ExportConfig.defaultSize
        )

        let outputURL = try await ExportService.shared.exportClip(config: config) { _ in }

        // 1. A real file exists on disk with the .mp4 extension.
        #expect(FileManager.default.fileExists(atPath: outputURL.path))
        #expect(outputURL.pathExtension == "mp4")
        let fileSize = (try? FileManager.default.attributesOfItem(atPath: outputURL.path)[.size] as? Int) ?? 0
        #expect(fileSize > 0)

        // 2. It is a decodable video with a non-zero duration.
        let asset = AVURLAsset(url: outputURL)
        let duration = try await asset.load(.duration)
        #expect(CMTimeGetSeconds(duration) > 0)

        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        #expect(!videoTracks.isEmpty)
        guard let track = videoTracks.first else {
            Issue.record("exported file has no video track")
            try? FileManager.default.removeItem(at: outputURL)
            return
        }

        // 3. The rendered frame is vertical 1080×1920 (the store-required export size),
        //    resolving the track's transform so encoder orientation quirks don't matter.
        let naturalSize = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        let resolved = naturalSize.applying(transform)
        let renderedWidth = abs(resolved.width)
        let renderedHeight = abs(resolved.height)
        #expect(renderedWidth == 1080)
        #expect(renderedHeight == 1920)
        #expect(renderedHeight > renderedWidth) // vertical

        try? FileManager.default.removeItem(at: outputURL)
    }
}
