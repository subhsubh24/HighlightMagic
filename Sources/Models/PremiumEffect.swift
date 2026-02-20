import Foundation
import CoreImage

struct PremiumEffect: Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let icon: String
    let category: EffectCategory
    let isPremium: Bool

    init(
        id: UUID = UUID(),
        name: String,
        icon: String,
        category: EffectCategory,
        isPremium: Bool = true
    ) {
        self.id = id
        self.name = name
        self.icon = icon
        self.category = category
        self.isPremium = isPremium
    }
}

enum EffectCategory: String, CaseIterable, Hashable, Sendable {
    case lut = "Cinematic LUTs"
    case particle = "Particles"
    case transition = "Transitions"
    case overlay = "Overlays"
}

struct PremiumEffectLibrary {
    static let effects: [PremiumEffect] = [
        // Cinematic LUTs
        PremiumEffect(name: "Teal & Orange", icon: "circle.lefthalf.filled", category: .lut),
        PremiumEffect(name: "Film Noir", icon: "circle.fill", category: .lut),
        PremiumEffect(name: "Vintage 8mm", icon: "film", category: .lut),
        PremiumEffect(name: "Cyberpunk", icon: "bolt.circle.fill", category: .lut),
        // Particles
        PremiumEffect(name: "Sparkles", icon: "sparkles", category: .particle),
        PremiumEffect(name: "Confetti", icon: "party.popper", category: .particle),
        PremiumEffect(name: "Snow", icon: "snowflake", category: .particle),
        PremiumEffect(name: "Fireflies", icon: "lightbulb.fill", category: .particle),
        // Transitions
        PremiumEffect(name: "Zoom Burst", icon: "arrow.up.left.and.arrow.down.right", category: .transition),
        PremiumEffect(name: "Glitch", icon: "rectangle.on.rectangle.angled", category: .transition),
        PremiumEffect(name: "Whip Pan", icon: "arrow.left.and.right", category: .transition),
        // Overlays
        PremiumEffect(name: "Light Leak", icon: "sun.max.fill", category: .overlay),
        PremiumEffect(name: "Film Grain", icon: "square.grid.3x3.fill", category: .overlay),
        PremiumEffect(name: "Vignette Pro", icon: "circle.dashed", category: .overlay),
        PremiumEffect(name: "Lens Flare", icon: "sun.haze.fill", category: .overlay),
    ]

    static func effects(for category: EffectCategory) -> [PremiumEffect] {
        effects.filter { $0.category == category }
    }
}

// MARK: - CIFilter-based LUT Application

enum CinematicLUT: String, CaseIterable, Sendable {
    case tealOrange = "Teal & Orange"
    case filmNoir = "Film Noir"
    case vintage8mm = "Vintage 8mm"
    case cyberpunk = "Cyberpunk"

    func apply(to image: CIImage) -> CIImage {
        switch self {
        case .tealOrange:
            return applyTealOrange(to: image)
        case .filmNoir:
            return applyFilmNoir(to: image)
        case .vintage8mm:
            return applyVintage(to: image)
        case .cyberpunk:
            return applyCyberpunk(to: image)
        }
    }

    private func applyTealOrange(to image: CIImage) -> CIImage {
        var result = image
        // Boost vibrance
        if let vibrance = CIFilter(name: "CIVibrance") {
            vibrance.setValue(result, forKey: kCIInputImageKey)
            vibrance.setValue(0.6, forKey: "inputAmount")
            result = vibrance.outputImage ?? result
        }
        // Warm the highlights
        if let temp = CIFilter(name: "CITemperatureAndTint") {
            temp.setValue(result, forKey: kCIInputImageKey)
            temp.setValue(CIVector(x: 6200, y: 0), forKey: "inputNeutral")
            temp.setValue(CIVector(x: 5200, y: -30), forKey: "inputTargetNeutral")
            result = temp.outputImage ?? result
        }
        return result
    }

    private func applyFilmNoir(to image: CIImage) -> CIImage {
        var result = image
        if let noir = CIFilter(name: "CIPhotoEffectNoir") {
            noir.setValue(result, forKey: kCIInputImageKey)
            result = noir.outputImage ?? result
        }
        if let contrast = CIFilter(name: "CIColorControls") {
            contrast.setValue(result, forKey: kCIInputImageKey)
            contrast.setValue(1.3, forKey: "inputContrast")
            result = contrast.outputImage ?? result
        }
        return result
    }

    private func applyVintage(to image: CIImage) -> CIImage {
        var result = image
        if let sepia = CIFilter(name: "CISepiaTone") {
            sepia.setValue(result, forKey: kCIInputImageKey)
            sepia.setValue(0.3, forKey: "inputIntensity")
            result = sepia.outputImage ?? result
        }
        if let vignette = CIFilter(name: "CIVignette") {
            vignette.setValue(result, forKey: kCIInputImageKey)
            vignette.setValue(2.0, forKey: "inputRadius")
            vignette.setValue(0.8, forKey: "inputIntensity")
            result = vignette.outputImage ?? result
        }
        return result
    }

    private func applyCyberpunk(to image: CIImage) -> CIImage {
        var result = image
        if let hue = CIFilter(name: "CIHueAdjust") {
            hue.setValue(result, forKey: kCIInputImageKey)
            hue.setValue(0.5, forKey: "inputAngle")
            result = hue.outputImage ?? result
        }
        if let contrast = CIFilter(name: "CIColorControls") {
            contrast.setValue(result, forKey: kCIInputImageKey)
            contrast.setValue(1.4, forKey: "inputContrast")
            contrast.setValue(1.1, forKey: "inputSaturation")
            result = contrast.outputImage ?? result
        }
        return result
    }
}
