import SwiftUI
import PhotosUI

struct HomeView: View {
    @Environment(AppState.self) private var appState
    @State private var showVideoPicker = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var isLoadingVideo = false
    @State private var loadError: String?

    var body: some View {
        ZStack {
            Theme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                // Logo / Title
                VStack(spacing: 12) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 56))
                        .foregroundStyle(Theme.primaryGradient)

                    Text("Highlight Magic")
                        .font(Theme.largeTitle)
                        .foregroundStyle(.white)

                    Text("Turn your videos into\nshare-ready highlights")
                        .font(Theme.body)
                        .foregroundStyle(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                }

                Spacer()

                // Upload Button
                PhotosPicker(
                    selection: $selectedPhotoItem,
                    matching: .videos
                ) {
                    HStack(spacing: 12) {
                        if isLoadingVideo {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "video.badge.plus")
                                .font(.title3)
                        }
                        Text(isLoadingVideo ? "Loading..." : "Choose Video")
                            .font(Theme.headline)
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(Theme.primaryGradient)
                    .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
                    .shadow(color: Theme.accent.opacity(0.4), radius: 12, y: 6)
                }
                .disabled(isLoadingVideo)
                .onChange(of: selectedPhotoItem) { _, newItem in
                    guard let item = newItem else { return }
                    Task { await loadVideo(from: item) }
                }

                // Export counter
                if !appState.isProUser {
                    HStack(spacing: 4) {
                        Image(systemName: "film.stack")
                            .font(.caption)
                        Text("\(appState.exportsUsedThisMonth)/\(Constants.freeExportLimit) free exports used")
                            .font(Theme.caption)
                    }
                    .foregroundStyle(Theme.textTertiary)
                }

                Spacer()
                    .frame(height: 20)
            }
            .padding(.horizontal, Constants.Layout.padding)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    appState.navigationPath.append(AppScreen.settings)
                } label: {
                    Image(systemName: "gearshape")
                        .foregroundStyle(Theme.textSecondary)
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                if !appState.isProUser {
                    Button {
                        appState.navigationPath.append(AppScreen.paywall)
                    } label: {
                        Text("PRO")
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Theme.primaryGradient)
                            .clipShape(Capsule())
                    }
                }
            }
        }
        .alert("Error", isPresented: .init(
            get: { loadError != nil },
            set: { if !$0 { loadError = nil } }
        )) {
            Button("OK") { loadError = nil }
        } message: {
            Text(loadError ?? "")
        }
    }

    private func loadVideo(from item: PhotosPickerItem) async {
        isLoadingVideo = true
        defer {
            isLoadingVideo = false
            selectedPhotoItem = nil
        }

        do {
            guard let movieData = try await item.loadTransferable(type: VideoTransferable.self) else {
                loadError = "Could not load video data."
                return
            }

            let video = try await VideoLoaderService.shared.loadVideo(from: movieData.url)

            guard video.isWithinLimit else {
                loadError = "Video must be 10 minutes or shorter."
                return
            }

            appState.selectedVideo = video
            appState.navigationPath.append(AppScreen.prompt)
        } catch {
            loadError = error.localizedDescription
        }
    }
}

struct VideoTransferable: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension("mov")
            try FileManager.default.copyItem(at: received.file, to: tempURL)
            return Self(url: tempURL)
        }
    }
}
