import Foundation
import StoreKit

@Observable @MainActor
final class StoreKitService {
    static let shared = StoreKitService()

    var products: [Product] = []
    var purchasedProductIDs: Set<String> = []
    var isProUser: Bool = false

    private let productIDs: Set<String> = [
        SubscriptionProduct.monthly.rawValue,
        SubscriptionProduct.yearly.rawValue
    ]

    nonisolated(unsafe) private var updateListenerTask: Task<Void, Never>?

    init() {
        updateListenerTask = listenForTransactions()
        Task { await loadProducts() }
        Task { await updatePurchaseStatus() }
    }

    deinit {
        updateListenerTask?.cancel()
    }

    // MARK: - Load Products

    func loadProducts() async {
        do {
            products = try await Product.products(for: productIDs)
                .sorted { $0.price < $1.price }
        } catch {
            products = []
        }
    }

    // MARK: - Purchase

    func purchase(_ product: Product) async throws -> Bool {
        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await transaction.finish()
            await updatePurchaseStatus()
            return true

        case .userCancelled:
            return false

        case .pending:
            return false

        @unknown default:
            return false
        }
    }

    // MARK: - Restore

    func restorePurchases() async {
        try? await AppStore.sync()
        await updatePurchaseStatus()
    }

    // MARK: - Status

    func updatePurchaseStatus() async {
        var purchased: Set<String> = []
        var proJWS: String? = nil

        for await result in Transaction.currentEntitlements {
            guard let transaction = try? checkVerified(result) else { continue }

            if transaction.revocationDate == nil {
                purchased.insert(transaction.productID)
                // Capture the signed transaction for an active Pro product so the backend can
                // verify the entitlement server-side (never trust a client flag). If the user
                // holds more than one Pro product, any active one proves entitlement equally —
                // the backend grants Pro on any valid Pro SKU.
                if productIDs.contains(transaction.productID) {
                    proJWS = transaction.jwsRepresentation
                }
            }
        }

        purchasedProductIDs = purchased
        isProUser = !purchased.isEmpty

        // Propagate Pro status + the signed transaction to services that gate features on it
        UserAccountService.shared.proSignedTransaction = proJWS
        UserAccountService.shared.updateProStatus(isProUser)
    }

    // MARK: - Helpers

    private nonisolated func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }

    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if let transaction = try? self.checkVerified(result) {
                    await transaction.finish()
                    await self.updatePurchaseStatus()
                }
            }
        }
    }

    var monthlyProduct: Product? {
        products.first { $0.id == SubscriptionProduct.monthly.rawValue }
    }

    var yearlyProduct: Product? {
        products.first { $0.id == SubscriptionProduct.yearly.rawValue }
    }
}

enum StoreError: LocalizedError {
    case failedVerification

    var errorDescription: String? {
        "Purchase verification failed."
    }
}
