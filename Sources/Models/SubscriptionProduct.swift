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
