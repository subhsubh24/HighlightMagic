import SwiftUI
import StoreKit

struct PaywallView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var storeService = StoreKitService.shared
    @State private var selectedPlan: SubscriptionProduct = .yearly
    @State private var isPurchasing = false
    @State private var purchaseError: String?

    // Pro perks shown on the paywall. Every line must map to a capability that is GENUINELY gated on
    // isProUser in code — the paywall is the pre-purchase surface, so an unbacked claim here is a
    // false-advertising / App Store review risk. Verified gates:
    //  • No monthly export cap — free tier is 5/mo (Constants.freeExportLimit); 50/day fair-use
    //    ceiling applies to all tiers. (Never the bare word "unlimited": a hard 50/day cap makes it
    //    an FTC / Guideline 2.3.1 overclaim — see the project honesty standard.)
    //  • No watermark — ExportView forces the watermark on for non-Pro.
    //  • iCloud sync across devices — UserAccountService.syncTo/FromiCloud() `guard isProUser`.
    //  • Exclusive filters & effects — EditorView premiumEffectsButton routes non-Pro to the paywall.
    // Deliberately NOT listed: "Premium music library" (music isn't enabled in v1 — no audio assets
    // ship), and "AI detection" (the detection engine is identical for free and Pro; only the export
    // quota differs — it is not a Pro differentiator).
    private let features = [
        ("infinity", "No monthly export cap"),
        ("sparkles", "No watermark"),
        ("icloud", "iCloud sync across devices"),
        ("camera.filters", "Exclusive filters & effects")
    ]

    var body: some View {
        ZStack {
            Theme.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 28) {
                    // Close button
                    HStack {
                        Spacer()
                        Button { dismiss() } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title2)
                                .foregroundStyle(Theme.textTertiary)
                        }
                    }

                    // Header
                    VStack(spacing: 12) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [.yellow, .orange],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )

                        Text("Unlock Pro")
                            .font(Theme.largeTitle)
                            .foregroundStyle(.white)

                        Text("Create share-ready highlights\nwith premium features")
                            .font(Theme.body)
                            .foregroundStyle(Theme.textSecondary)
                            .multilineTextAlignment(.center)
                    }

                    // Features
                    VStack(spacing: 14) {
                        ForEach(features, id: \.0) { icon, text in
                            HStack(spacing: 14) {
                                Image(systemName: icon)
                                    .font(.body)
                                    .foregroundStyle(Theme.accent)
                                    .frame(width: 28)

                                Text(text)
                                    .font(Theme.body)
                                    .foregroundStyle(.white)

                                Spacer()

                                Image(systemName: "checkmark")
                                    .font(.caption.bold())
                                    .foregroundStyle(.green)
                            }
                        }
                    }
                    .padding(20)
                    .background(Theme.surfaceColor)
                    .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))

                    // Plan selector
                    VStack(spacing: 12) {
                        PlanOption(
                            product: .yearly,
                            isSelected: selectedPlan == .yearly
                        ) {
                            selectedPlan = .yearly
                        }

                        PlanOption(
                            product: .monthly,
                            isSelected: selectedPlan == .monthly
                        ) {
                            selectedPlan = .monthly
                        }
                    }

                    // Subscribe button
                    PrimaryButton(
                        title: "Subscribe Now",
                        isLoading: isPurchasing
                    ) {
                        Task { await purchase() }
                    }

                    // Restore + Legal (Guideline 3.1.2 required links)
                    VStack(spacing: 8) {
                        Button("Restore Purchases") {
                            Task { await storeService.restorePurchases() }
                        }
                        .font(Theme.caption)
                        .foregroundStyle(Theme.textTertiary)

                        Text("Cancel anytime. Subscription auto-renews.\nPayment charged to Apple ID at confirmation.")
                            .font(.caption2)
                            .foregroundStyle(Theme.textTertiary)
                            .multilineTextAlignment(.center)

                        HStack(spacing: 16) {
                            if let url = URL(string: AppStoreMetadata.privacyPolicyURL) {
                                Link("Privacy Policy", destination: url)
                            }
                            if let url = URL(string: AppStoreMetadata.termsOfServiceURL) {
                                Link("Terms of Use", destination: url)
                            }
                        }
                        .font(.caption2)
                        .foregroundStyle(Theme.accent)
                    }
                }
                .padding(Constants.Layout.padding)
            }
        }
        .alert("Purchase Error", isPresented: .init(
            get: { purchaseError != nil },
            set: { if !$0 { purchaseError = nil } }
        )) {
            Button("OK") { purchaseError = nil }
        } message: {
            Text(purchaseError ?? "")
        }
    }

    private func purchase() async {
        isPurchasing = true
        defer { isPurchasing = false }

        let productID = selectedPlan.rawValue
        guard let product = storeService.products.first(where: { $0.id == productID }) else {
            purchaseError = "Product not available. Please try again later."
            return
        }

        do {
            let success = try await storeService.purchase(product)
            if success {
                appState.isProUser = true
                dismiss()
            }
        } catch {
            purchaseError = error.localizedDescription
        }
    }
}

struct PlanOption: View {
    let product: SubscriptionProduct
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(product.displayName)
                            .font(Theme.headline)
                            .foregroundStyle(.white)

                        if let savings = product.savingsLabel {
                            Text(savings)
                                .font(.caption2.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(.green)
                                .clipShape(Capsule())
                        }
                    }

                    Text(product.price)
                        .font(Theme.body)
                        .foregroundStyle(Theme.textSecondary)
                }

                Spacer()

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isSelected ? Theme.accent : Theme.textTertiary)
            }
            .padding(16)
            .background(isSelected ? Theme.accent.opacity(0.1) : Theme.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: Constants.Layout.cornerRadius)
                    .stroke(isSelected ? Theme.accent : Theme.surfaceLight, lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}
