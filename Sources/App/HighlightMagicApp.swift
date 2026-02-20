import SwiftUI

@main
struct HighlightMagicApp: App {
    @State private var appState = AppState()

    init() {
        CrashReporting.initialize()
        UserAccountService.shared.startObservingCloudChanges()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .onReceive(
                    NotificationCenter.default.publisher(
                        for: UIApplication.didReceiveMemoryWarningNotification
                    )
                ) { _ in
                    CrashReporting.logMemoryWarning()
                }
        }
    }
}
