import Foundation
import AVFoundation
import UIKit
import Security
import os.log

actor ClaudeVisionService {
    static let shared = ClaudeVisionService()

    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "ClaudeVision")

    private init() {}

    // Business-paid model (2026-06-25): all Anthropic calls route through the web backend.
    // The legacy direct-to-Anthropic scoring path is permanently disabled.
    var isAvailable: Bool { false }

    /// No-op: retained for SettingsView API-key-entry UI compatibility.
    nonisolated static func configureAPIKey(_ key: String) {}

    /// Clears any previously stored key from the keychain.
    nonisolated static func removeAPIKey() {
        KeychainHelper.delete(key: "claude_api_key")
    }

    // MARK: - Score Highlight Candidates

    struct ScoredTimestamp: Sendable {
        let seconds: Double
        let score: Double
        let reason: String
        /// AI-suggested optimal start time for the clip
        let suggestedStart: Double?
        /// AI-suggested optimal end time for the clip
        let suggestedEnd: Double?
    }

    struct CandidateSegment: Sendable {
        let midpoint: Double
        let start: Double
        let end: Double
    }

    /// Legacy scoring path — permanently disabled; isAvailable is always false.
    /// Primary scoring path: CloudScoringService → /api/ios-score.
    func scoreHighlights(
        asset: AVURLAsset,
        prompt: String,
        candidates: [CandidateSegment],
        progressHandler: @Sendable (Double) -> Void
    ) async throws -> [ScoredTimestamp] {
        throw ClaudeVisionError.noAPIKey
    }

    // MARK: - JSON Extraction (shared utility — used by TapeValidationService)

    /// Extracts the first balanced JSON structure from text using bracket depth tracking.
    static func extractBalancedJSON(from text: String, open: Character, close: Character) -> String? {
        guard let startIdx = text.firstIndex(of: open) else { return nil }
        var depth = 0
        for i in text[startIdx...].indices {
            if text[i] == open { depth += 1 }
            else if text[i] == close { depth -= 1 }
            if depth == 0 {
                return String(text[startIdx...i])
            }
        }
        return nil
    }
}

// MARK: - Keychain Helper

enum KeychainHelper {
    private static let serviceName = "com.highlightmagic.app"

    static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum ClaudeVisionError: LocalizedError {
    case noAPIKey
    case invalidAPIKey
    case invalidEndpoint
    case requestFailed
    case rateLimited
    case parseFailed

    var errorDescription: String? {
        switch self {
        case .noAPIKey: "Claude API key not configured."
        case .invalidAPIKey: "Claude API key is invalid."
        case .invalidEndpoint: "Invalid API endpoint."
        case .requestFailed: "Claude Vision request failed."
        case .rateLimited: "Too many requests. Please wait a moment."
        case .parseFailed: "Failed to parse Claude response."
        }
    }
}
