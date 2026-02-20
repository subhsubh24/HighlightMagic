import Foundation
import os.log

/// Privacy-first analytics using OSLog (no third-party SDK, no PII).
/// Events stay on-device in Instruments / Console.app unless a remote
/// analytics backend is wired up later.
enum Analytics {
    private static let logger = Logger(subsystem: "com.highlightmagic.app", category: "Analytics")
    private static let signpostLog = OSLog(subsystem: "com.highlightmagic.app", category: .pointsOfInterest)

    // MARK: - Event Logging

    static func logEvent(_ name: String, parameters: [String: String] = [:]) {
        let params = parameters.map { "\($0.key)=\($0.value)" }.joined(separator: ", ")
        logger.info("EVENT: \(name) [\(params)]")
    }

    // MARK: - Key Events

    static func videoSelected(durationSeconds: Int) {
        logEvent("video_selected", parameters: ["duration": "\(durationSeconds)"])
    }

    static func detectionStarted(prompt: String) {
        logEvent("detection_started", parameters: [
            "has_prompt": prompt.isEmpty ? "false" : "true"
        ])
    }

    static func detectionCompleted(segmentCount: Int, avgConfidence: Double, durationMs: Int) {
        logEvent("detection_completed", parameters: [
            "segments": "\(segmentCount)",
            "confidence": String(format: "%.2f", avgConfidence),
            "duration_ms": "\(durationMs)"
        ])
    }

    static func templateApplied(name: String) {
        logEvent("template_applied", parameters: ["name": name])
    }

    static func exportStarted(filter: String, hasMusic: Bool, hasCaption: Bool) {
        logEvent("export_started", parameters: [
            "filter": filter,
            "music": hasMusic ? "true" : "false",
            "caption": hasCaption ? "true" : "false"
        ])
    }

    static func exportCompleted(durationMs: Int) {
        logEvent("export_completed", parameters: ["duration_ms": "\(durationMs)"])
    }

    static func exportFailed(error: String) {
        logEvent("export_failed", parameters: ["error": error])
    }

    static func exportShared() {
        logEvent("export_shared")
    }

    static func paywallViewed(source: String) {
        logEvent("paywall_viewed", parameters: ["source": source])
    }

    static func purchaseStarted(product: String) {
        logEvent("purchase_started", parameters: ["product": product])
    }

    static func purchaseCompleted(product: String) {
        logEvent("purchase_completed", parameters: ["product": product])
    }

    static func onboardingCompleted() {
        logEvent("onboarding_completed")
    }

    // MARK: - Performance Signposts

    static func beginPerformanceTrace(_ name: StaticString) -> OSSignpostID {
        let id = OSSignpostID(log: signpostLog)
        os_signpost(.begin, log: signpostLog, name: name, signpostID: id)
        return id
    }

    static func endPerformanceTrace(_ name: StaticString, id: OSSignpostID) {
        os_signpost(.end, log: signpostLog, name: name, signpostID: id)
    }
}
