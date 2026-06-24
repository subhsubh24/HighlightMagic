import SwiftUI

@main
struct HighlightMagicApp: App {
    @State private var appState = AppState()
    @State private var networkMonitor = NetworkMonitor.shared
    @State private var storeService = StoreKitService.shared

    init() {
        CrashReporting.initialize()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .onChange(of: storeService.isProUser) { _, newValue in
                    appState.isProUser = newValue
                }
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
