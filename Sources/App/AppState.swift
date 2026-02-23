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

    var exportsUsedThisMonth: Int {
        get { UserDefaults.standard.integer(forKey: "exportsUsedThisMonth") }
        set { UserDefaults.standard.set(newValue, forKey: "exportsUsedThisMonth") }
    }

    var lastExportResetDate: Date {
        get { UserDefaults.standard.object(forKey: "lastExportResetDate") as? Date ?? .distantPast }
        set { UserDefaults.standard.set(newValue, forKey: "lastExportResetDate") }
    }

    var isProUser: Bool = false

    var canExportFree: Bool {
        resetExportsIfNewMonth()
        return exportsUsedThisMonth < Constants.freeExportLimit
    }

    func resetExportsIfNewMonth() {
        let calendar = Calendar.current
        guard !calendar.isDate(lastExportResetDate, equalTo: .now, toGranularity: .month) else { return }
        UserDefaults.standard.set(0, forKey: "exportsUsedThisMonth")
        UserDefaults.standard.set(Date.now, forKey: "lastExportResetDate")
    }

    func incrementExportCount() {
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
