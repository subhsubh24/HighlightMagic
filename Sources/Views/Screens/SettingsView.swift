import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var storeService = StoreKitService.shared
    @State private var accountService = UserAccountService.shared
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = true
    @State private var showDeleteConfirmation = false
    @State private var showAPIKeyInput = false
    @State private var apiKeyInput = ""

    var body: some View {
        ZStack {
            Theme.backgroundGradient
                .ignoresSafeArea()

            List {
                // Account section
                Section {
                    HStack {
                        Label("Plan", systemImage: "person.crop.circle")
                        Spacer()
                        Text(appState.isProUser ? "Pro" : "Free")
                            .foregroundStyle(appState.isProUser ? Theme.success : Theme.textSecondary)
                    }

                    if !appState.isProUser {
                        HStack {
                            Label("Exports This Month", systemImage: "film.stack")
                            Spacer()
                            Text("\(appState.exportsUsedThisMonth)/\(Constants.freeExportLimit)")
                                .foregroundStyle(Theme.textSecondary)
                        }

                        Button {
                            HapticFeedback.selection()
                            appState.navigationPath.append(AppScreen.paywall)
                        } label: {
                            Label("Upgrade to Pro", systemImage: "crown")
                                .foregroundStyle(Theme.accent)
                        }
                    }

                    HStack {
                        Label("User ID", systemImage: "person.text.rectangle")
                        Spacer()
                        Text(String(accountService.userID.prefix(8)) + "...")
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }
                } header: {
                    Text("Account")
                }

                // Saved Projects
                Section {
                    HStack {
                        Label("Saved Projects", systemImage: "folder")
                        Spacer()
                        Text("\(accountService.savedProjects.count)")
                            .foregroundStyle(Theme.textSecondary)
                    }

                    if appState.isProUser {
                        HStack {
                            Label("iCloud Sync", systemImage: "icloud")
                            Spacer()
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(Theme.success)
                        }
                    } else {
                        HStack {
                            Label("iCloud Sync", systemImage: "icloud.slash")
                            Spacer()
                            Text("Pro Only")
                                .font(.caption)
                                .foregroundStyle(Theme.textTertiary)
                        }
                    }
                } header: {
                    Text("Projects")
                }

                // AI Configuration
                Section {
                    Button {
                        showAPIKeyInput = true
                    } label: {
                        Label("Claude Vision API Key", systemImage: "key")
                    }

                    HStack {
                        Label("Network", systemImage: "wifi")
                        Spacer()
                        Text(NetworkMonitor.shared.isConnected ? "Connected" : "Offline")
                            .font(.caption)
                            .foregroundStyle(
                                NetworkMonitor.shared.isConnected ? Theme.success : Theme.warning
                            )
                    }
                } header: {
                    Text("AI Settings")
                }

                // Export settings
                Section {
                    HStack {
                        Label("Resolution", systemImage: "rectangle.portrait")
                        Spacer()
                        Text("1080 x 1920")
                            .foregroundStyle(Theme.textSecondary)
                    }

                    HStack {
                        Label("Format", systemImage: "doc")
                        Spacer()
                        Text("MP4")
                            .foregroundStyle(Theme.textSecondary)
                    }

                    HStack {
                        Label("Frame Rate", systemImage: "speedometer")
                        Spacer()
                        Text("30 fps")
                            .foregroundStyle(Theme.textSecondary)
                    }
                } header: {
                    Text("Export Settings")
                }

                // About section
                Section {
                    HStack {
                        Label("Version", systemImage: "info.circle")
                        Spacer()
                        Text("1.0.0")
                            .foregroundStyle(Theme.textSecondary)
                    }

                    Button {
                        Task { await storeService.restorePurchases() }
                    } label: {
                        Label("Restore Purchases", systemImage: "arrow.clockwise")
                    }

                    Button {
                        hasCompletedOnboarding = false
                    } label: {
                        Label("Replay Onboarding", systemImage: "arrow.counterclockwise")
                    }

                    if let url = URL(string: AppStoreMetadata.privacyPolicyURL) {
                        Link(destination: url) {
                            Label("Privacy Policy", systemImage: "hand.raised")
                        }
                    }

                    if let url = URL(string: AppStoreMetadata.termsOfServiceURL) {
                        Link(destination: url) {
                            Label("Terms of Service", systemImage: "doc.text")
                        }
                    }
                } header: {
                    Text("About")
                }

                // Account deletion (App Store requirement)
                Section {
                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Label("Delete Account & Data", systemImage: "trash")
                            .foregroundStyle(.red)
                    }
                } header: {
                    Text("Data")
                } footer: {
                    Text("This will delete all saved projects and reset your anonymous account.")
                }
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Delete Account?", isPresented: $showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                deleteAccountData()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will permanently delete all your saved projects and reset your account. This action cannot be undone.")
        }
        .alert("Claude Vision API Key", isPresented: $showAPIKeyInput) {
            TextField("sk-ant-...", text: $apiKeyInput)
                .textContentType(.password)
            Button("Save") {
                ClaudeVisionService.configureAPIKey(apiKeyInput)
                apiKeyInput = ""
            }
            Button("Remove Key", role: .destructive) {
                ClaudeVisionService.removeAPIKey()
            }
            Button("Cancel", role: .cancel) {
                apiKeyInput = ""
            }
        } message: {
            Text("Enter your Anthropic API key to enable advanced AI refinement for highlight detection.")
        }
    }

    private func deleteAccountData() {
        accountService.deleteAllData()
        appState.clearSession()
        UserDefaults.standard.removeObject(forKey: "exportsUsedThisMonth")
        UserDefaults.standard.removeObject(forKey: "lastExportResetDate")
        ClaudeVisionService.removeAPIKey()
        HapticFeedback.medium()
        Analytics.logEvent("account_deleted")
    }
}
