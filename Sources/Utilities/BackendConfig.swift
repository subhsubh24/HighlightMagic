import Foundation

/// Canonical web backend URL for the HighlightMagic business-paid API proxy.
///
/// P0 mandate: ALL paid API calls (Anthropic / ElevenLabs / AtlasCloud) route
/// through the web backend — never directly from iOS with an embedded key.
/// Every service that currently calls api.anthropic.com or similar must switch
/// to a corresponding route at `BackendConfig.baseURL`.
///
/// Priority order for the URL:
/// 1. (DEBUG only) `HIGHLIGHT_MAGIC_BACKEND_URL` env var — set via
///    Edit Scheme → Run → Environment Variables in Xcode (Simulator only).
///    Env vars are not available in a production iOS process; this branch is
///    compiled out of release builds.
/// 2. `HIGHLIGHT_MAGIC_BACKEND_URL` in Info.plist — the intended override
///    mechanism for CI / staging builds. Set via xcconfig per build configuration.
/// 3. Production hardcoded fallback — always HTTPS, always resolves.
///
/// Only HTTPS URLs are accepted. A misconfigured http:// value silently falls
/// through to the next candidate, preventing accidental cleartext token exposure.
enum BackendConfig {
    /// Base URL of the Next.js web backend. Never nil — falls back to production.
    static let baseURL: URL = {
        var candidates: [String?] = [
            Bundle.main.object(forInfoDictionaryKey: "HIGHLIGHT_MAGIC_BACKEND_URL") as? String,
            "https://highlightmagic.app",
        ]
        #if DEBUG
        candidates.insert(ProcessInfo.processInfo.environment["HIGHLIGHT_MAGIC_BACKEND_URL"], at: 0)
        #endif
        for candidate in candidates {
            guard let raw = candidate, !raw.isEmpty,
                  let url = URL(string: raw),
                  url.scheme == "https" else { continue }
            return url
        }
        // Unreachable: the hardcoded fallback is always a valid HTTPS URL.
        return URL(string: "https://highlightmagic.app")!
    }()

    /// Convenience: resolve an API path relative to the backend base URL.
    /// Example: `BackendConfig.url(for: "api/score")` → `https://highlightmagic.app/api/score`
    static func url(for path: String) -> URL {
        baseURL.appendingPathComponent(path)
    }
}
