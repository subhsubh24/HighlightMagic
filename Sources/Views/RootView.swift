import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var appState
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var showRatePrompt = false

    var body: some View {
        @Bindable var state = appState

        Group {
            if !hasCompletedOnboarding {
                OnboardingView(hasCompletedOnboarding: $hasCompletedOnboarding)
            } else {
                NavigationStack(path: $state.navigationPath) {
                    HomeView()
                        .navigationDestination(for: AppScreen.self) { screen in
                            destinationView(for: screen)
                        }
                }
            }
        }
        .preferredColorScheme(.dark)
        .onChange(of: appState.exportsUsedThisMonth) { _, newCount in
            if newCount == 3, !hasShownRatePrompt {
                showRatePrompt = true
                UserDefaults.standard.set(true, forKey: "hasShownRatePrompt")
            }
        }
        .alert("Enjoying Highlight Magic?", isPresented: $showRatePrompt) {
            Button("Rate Now") { requestAppStoreReview() }
            Button("Later", role: .cancel) {}
        } message: {
            Text("If you're loving the app, a quick rating helps us a lot!")
        }
    }

    @ViewBuilder
    private func destinationView(for screen: AppScreen) -> some View {
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

    private var hasShownRatePrompt: Bool {
        UserDefaults.standard.bool(forKey: "hasShownRatePrompt")
    }

    private func requestAppStoreReview() {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first else { return }
        SKStoreReviewController.requestReview(in: scene)
    }
}

import StoreKit
import UIKit
