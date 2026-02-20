import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var storeService = StoreKitService.shared
    @State private var accountService = UserAccountService.shared
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = true

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
                            .foregroundStyle(appState.isProUser ? .green : Theme.textSecondary)
                    }

                    if !appState.isProUser {
                        HStack {
                            Label("Exports This Month", systemImage: "film.stack")
                            Spacer()
                            Text("\(appState.exportsUsedThisMonth)/\(Constants.freeExportLimit)")
                                .foregroundStyle(Theme.textSecondary)
                        }

                        Button {
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
                                .foregroundStyle(.green)
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

                // Export settings
                Section {
                    HStack {
                        Label("Resolution", systemImage: "rectangle.portrait")
                        Spacer()
                        Text("1080 × 1920")
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
                } header: {
                    Text("About")
                }
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}
