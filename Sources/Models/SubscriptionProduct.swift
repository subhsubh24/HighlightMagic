import Foundation

enum SubscriptionProduct: String, CaseIterable {
    case monthly = "pro.monthly"
    case yearly = "pro.yearly"

    var displayName: String {
        switch self {
        case .monthly: "Monthly"
        case .yearly: "Yearly"
        }
    }

    /// Fallback display prices — UI should prefer StoreKit's localized price via
    /// `Product.displayPrice` for correct currency/region. These are only shown
    /// before StoreKit product data loads or if the fetch fails.
    var price: String {
        switch self {
        case .monthly: "$4.99/mo"
        case .yearly: "$39.99/yr"
        }
    }

    var savingsLabel: String? {
        switch self {
        case .monthly: nil
        case .yearly: "Save 33%"
        }
    }
}
