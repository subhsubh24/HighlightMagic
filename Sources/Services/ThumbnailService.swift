import AVFoundation
import UIKit
import SwiftUI

actor ThumbnailService {
    static let shared = ThumbnailService()

    private var cache: [String: UIImage] = [:]
    /// Cache keys ordered least-recently-used first, kept in lockstep with `cache` so eviction can
    /// drop the coldest entries instead of wiping the whole cache.
    private var accessOrder: [String] = []
    private let maxCacheSize = 50

    private init() {}

    func clearCache() {
        cache.removeAll()
        accessOrder.removeAll()
    }

    /// Mark `key` as most-recently-used (moves it to the tail of `accessOrder`).
    private func recordAccess(_ key: String) {
        if let idx = accessOrder.firstIndex(of: key) {
            accessOrder.remove(at: idx)
        }
        accessOrder.append(key)
    }

    func thumbnail(for url: URL, at time: CMTime, size: CGSize = CGSize(width: 360, height: 640)) async -> UIImage? {
        let cacheKey = "\(url.absoluteString)_\(CMTimeGetSeconds(time))_\(size.width)x\(size.height)"

        if let cached = cache[cacheKey] {
            recordAccess(cacheKey)
            return cached
        }

        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = size

        do {
            let (cgImage, _) = try await generator.image(at: time)
            let image = UIImage(cgImage: cgImage)

            // Evict least-recently-used entries to make room, rather than clearing everything —
            // a full wipe forced a cold-start re-decode storm on every timeline scrub.
            while cache.count >= maxCacheSize, let oldest = accessOrder.first {
                accessOrder.removeFirst()
                cache.removeValue(forKey: oldest)
            }
            cache[cacheKey] = image
            recordAccess(cacheKey)

            return image
        } catch {
            return nil
        }
    }

    func timelineThumbnails(
        for url: URL,
        count: Int = 10,
        size: CGSize = CGSize(width: 80, height: 142)
    ) async -> [UIImage] {
        let asset = AVURLAsset(url: url)
        guard let duration = try? await asset.load(.duration) else { return [] }
        let totalSeconds = CMTimeGetSeconds(duration)
        guard totalSeconds > 0 else { return [] }

        let interval = totalSeconds / Double(count)
        var images: [UIImage] = []

        for i in 0..<count {
            let time = CMTime(seconds: interval * Double(i), preferredTimescale: 600)
            if let img = await thumbnail(for: url, at: time, size: size) {
                images.append(img)
            }
        }

        return images
    }
}
