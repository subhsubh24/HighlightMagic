import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var state = appState

        NavigationStack(path: $state.navigationPath) {
            HomeView()
                .navigationDestination(for: AppScreen.self) { screen in
                    switch screen {
                    case .prompt:
                        PromptInputView()
                    case .processing:
                        ProcessingView()
                    case .results:
                        ResultsView()
                    case .editor(let clipID):
                        EditorView(clipID: clipID)
                    case .export(let clipID):
                        ExportView(clipID: clipID)
                    case .paywall:
                        PaywallView()
                    case .settings:
                        SettingsView()
                    case .home:
                        HomeView()
                    }
                }
        }
        .preferredColorScheme(.dark)
    }
}
