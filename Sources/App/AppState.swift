import SwiftUI

@Observable
final class AppState {
    var navigationPath = NavigationPath()
    var selectedVideo: VideoItem?
    var userPrompt: String = ""
    var detectedHighlights: [HighlightSegment] = []
    var generatedClips: [EditedClip] = []
    var currentScreen: AppScreen = .home
    var isProcessing = false
    var processingProgress: Double = 0
    var errorMessage: String?

    /// Stored property so @Observable can track mutations and trigger SwiftUI updates.
    /// Synced to UserDefaults on write and loaded from UserDefaults on init.
    var exportsUsedThisMonth: Int {
        didSet { UserDefaults.standard.set(exportsUsedThisMonth, forKey: "exportsUsedThisMonth") }
    }

    /// Stored property synced to UserDefaults. See `exportsUsedThisMonth`.
    var lastExportResetDate: Date {
        didSet { UserDefaults.standard.set(lastExportResetDate, forKey: "lastExportResetDate") }
    }

    var isProUser: Bool = false

    var canExportFree: Bool {
        exportsUsedThisMonth < Constants.freeExportLimit
    }

    init() {
        self.exportsUsedThisMonth = UserDefaults.standard.integer(forKey: "exportsUsedThisMonth")
        self.lastExportResetDate = UserDefaults.standard.object(forKey: "lastExportResetDate") as? Date ?? .distantPast
        resetExportsIfNewMonth()
    }

    func resetExportsIfNewMonth() {
        let calendar = Calendar.current
        guard !calendar.isDate(lastExportResetDate, equalTo: .now, toGranularity: .month) else { return }
        exportsUsedThisMonth = 0
        lastExportResetDate = .now
    }

    func incrementExportCount() {
        resetExportsIfNewMonth()
        exportsUsedThisMonth += 1
    }

    func clearSession() {
        selectedVideo = nil
        userPrompt = ""
        detectedHighlights = []
        generatedClips = []
        isProcessing = false
        processingProgress = 0
        errorMessage = nil
    }
}

enum AppScreen: Hashable {
    case home
    case prompt
    case processing
    case results
    case editor(clipID: EditedClip.ID)
    case export(clipID: EditedClip.ID)
    case paywall
    case settings
}
