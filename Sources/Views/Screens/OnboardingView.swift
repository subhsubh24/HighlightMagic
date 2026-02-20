import SwiftUI
import Photos

struct OnboardingView: View {
    @Binding var hasCompletedOnboarding: Bool
    @State private var currentPage = 0
    @State private var isRequestingPermission = false

    private let pages: [(icon: String, title: String, subtitle: String)] = [
        (
            "sparkles",
            "Welcome to\nHighlight Magic",
            "Turn your raw videos into share-ready highlights automatically with on-device AI."
        ),
        (
            "wand.and.stars",
            "Smart Detection",
            "Our AI analyzes motion, faces, and scenes to find the best moments — or describe what you want."
        ),
        (
            "square.and.arrow.up",
            "Export & Share",
            "Get vertical clips optimized for TikTok, Reels, and Shorts with music, filters, and captions."
        )
    ]

    var body: some View {
        ZStack {
            Theme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Pages
                TabView(selection: $currentPage) {
                    ForEach(pages.indices, id: \.self) { index in
                        onboardingPage(index: index)
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: currentPage)

                // Page indicator
                HStack(spacing: 8) {
                    ForEach(pages.indices, id: \.self) { index in
                        Circle()
                            .fill(index == currentPage ? Theme.accent : Theme.surfaceLight)
                            .frame(width: 8, height: 8)
                            .scaleEffect(index == currentPage ? 1.2 : 1.0)
                            .animation(.spring(duration: 0.3), value: currentPage)
                    }
                }
                .padding(.bottom, 32)

                // Action button
                VStack(spacing: 16) {
                    if currentPage < pages.count - 1 {
                        PrimaryButton(title: "Next") {
                            withAnimation { currentPage += 1 }
                        }
                    } else {
                        PrimaryButton(
                            title: "Get Started",
                            isLoading: isRequestingPermission
                        ) {
                            Task { await requestPermissionAndFinish() }
                        }
                    }

                    if currentPage < pages.count - 1 {
                        Button("Skip") {
                            Task { await requestPermissionAndFinish() }
                        }
                        .font(Theme.body)
                        .foregroundStyle(Theme.textTertiary)
                    }
                }
                .padding(.horizontal, Constants.Layout.padding)
                .padding(.bottom, 40)
            }
        }
    }

    private func onboardingPage(index: Int) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: pages[index].icon)
                .font(.system(size: 72))
                .foregroundStyle(Theme.primaryGradient)
                .symbolEffect(.pulse, options: .repeating)

            Text(pages[index].title)
                .font(Theme.largeTitle)
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)

            Text(pages[index].subtitle)
                .font(Theme.body)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Spacer()
            Spacer()
        }
    }

    private func requestPermissionAndFinish() async {
        isRequestingPermission = true
        let _ = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        isRequestingPermission = false
        hasCompletedOnboarding = true
    }
}
