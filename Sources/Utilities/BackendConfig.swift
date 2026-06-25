import Foundation

/// Canonical web backend URL for the HighlightMagic business-paid API proxy.
///
/// P0 mandate: ALL paid API calls (Anthropic / ElevenLabs / AtlasCloud) route
/// through the web backend — never directly from iOS with an embedded key.
/// Every service that currently calls api.anthropic.com or similar must switch
/// to a corresponding route at `BackendConfig.baseURL`.
///
/// Priority order for the URL:
/// 1. `HIGHLIGHT_MAGIC_BACKEND_URL` env var (useful in Simulator/dev without
///    recompiling — `Edit Scheme → Run → Environment Variables`).
/// 2. `HIGHLIGHT_MAGIC_BACKEND_URL` in Info.plist (overridable per build
///    configuration via xcconfig; set to staging URL for TestFlight builds).
/// 3. Production hardcoded fallback — safe, always resolves.
enum BackendConfig {
    /// Base URL of the Next.js web backend. Never nil — falls back to production.
    static let baseURL: URL = {
        let candidates: [String?] = [
            ProcessInfo.processInfo.environment["HIGHLIGHT_MAGIC_BACKEND_URL"],
            Bundle.main.object(forInfoDictionaryKey: "HIGHLIGHT_MAGIC_BACKEND_URL") as? String,
            "https://highlightmagic.app",
        ]
        for candidate in candidates {
            guard let raw = candidate, !raw.isEmpty, let url = URL(string: raw) else { continue }
            return url
        }
        // Unreachable: the hardcoded fallback always parses.
        return URL(string: "https://highlightmagic.app")!
    }()

    /// Convenience: resolve an API path relative to the backend base URL.
    /// Example: `BackendConfig.url(for: "api/score")` → `https://highlightmagic.app/api/score`
    static func url(for path: String) -> URL {
        baseURL.appendingPathComponent(path)
    }
}
