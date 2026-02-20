import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var storeService = StoreKitService.shared

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
                } header: {
                    Text("Account")
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
                } header: {
                    Text("About")
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
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}
