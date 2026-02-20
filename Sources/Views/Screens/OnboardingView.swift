import SwiftUI
import Photos

struct OnboardingView: View {
    @Binding var hasCompletedOnboarding: Bool
    @State private var currentPage = 0
    @State private var isRequestingPermission = false

    private let pages: [(icon: String, title: String, subtitle: String, colors: [Color])] = [
        (
            "sparkles",
            "Welcome to\nHighlight Magic",
            "Turn your raw videos into share-ready highlights automatically with on-device AI.",
            [Color(hex: "7C3AED"), Color(hex: "EC4899")]
        ),
        (
            "wand.and.stars",
            "Smart Detection",
            "Our AI analyzes motion, faces, and scenes to find the best moments — or describe what you want.",
            [Color(hex: "3B82F6"), Color(hex: "8B5CF6")]
        ),
        (
            "square.and.arrow.up",
            "Export & Share",
            "Get vertical clips optimized for TikTok, Reels, and Shorts with music, filters, and captions.",
            [Color(hex: "EC4899"), Color(hex: "F97316")]
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
                        Capsule()
                            .fill(index == currentPage
                                  ? AnyShapeStyle(Theme.primaryGradient)
                                  : AnyShapeStyle(Theme.surfaceLight))
                            .frame(width: index == currentPage ? 24 : 8, height: 8)
                            .animation(Theme.springAnimation, value: currentPage)
                    }
                }
                .padding(.bottom, 32)

                // Action button
                VStack(spacing: 16) {
                    if currentPage < pages.count - 1 {
                        PrimaryButton(title: "Next") {
                            withAnimation(Theme.springAnimation) { currentPage += 1 }
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

            // Animated icon with gradient ring
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: pages[index].colors.map { $0.opacity(0.15) },
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 160, height: 160)

                Circle()
                    .stroke(
                        LinearGradient(
                            colors: pages[index].colors,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 2
                    )
                    .frame(width: 130, height: 130)

                Image(systemName: pages[index].icon)
                    .font(.system(size: 56))
                    .foregroundStyle(
                        LinearGradient(
                            colors: pages[index].colors,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .symbolEffect(.pulse, options: .repeating.speed(0.6))
            }

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
        Analytics.onboardingCompleted()
        HapticFeedback.success()
        withAnimation(Theme.springAnimation) {
            hasCompletedOnboarding = true
        }
    }
}
