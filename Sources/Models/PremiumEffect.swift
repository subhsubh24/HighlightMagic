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
        // ── Cinematic LUTs (8) ──
        PremiumEffect(name: "Teal & Orange", icon: "circle.lefthalf.filled", category: .lut),
        PremiumEffect(name: "Film Noir", icon: "circle.fill", category: .lut),
        PremiumEffect(name: "Vintage 8mm", icon: "film", category: .lut),
        PremiumEffect(name: "Cyberpunk", icon: "bolt.circle.fill", category: .lut),
        PremiumEffect(name: "Bleach Bypass", icon: "drop.halffull", category: .lut),
        PremiumEffect(name: "Golden Hour", icon: "sun.max.fill", category: .lut),
        PremiumEffect(name: "Matte Film", icon: "rectangle.stack.fill", category: .lut),
        PremiumEffect(name: "Cross Process", icon: "arrow.triangle.swap", category: .lut),

        // ── Particles (8) ──
        PremiumEffect(name: "Sparkles", icon: "sparkles", category: .particle),
        PremiumEffect(name: "Confetti", icon: "party.popper", category: .particle),
        PremiumEffect(name: "Snow", icon: "snowflake", category: .particle),
        PremiumEffect(name: "Fireflies", icon: "lightbulb.fill", category: .particle),
        PremiumEffect(name: "Bubbles", icon: "circle.circle", category: .particle),
        PremiumEffect(name: "Hearts", icon: "heart.fill", category: .particle),
        PremiumEffect(name: "Embers", icon: "flame.fill", category: .particle),
        PremiumEffect(name: "Rain", icon: "cloud.rain.fill", category: .particle),

        // ── Transitions (7) ──
        PremiumEffect(name: "Zoom Burst", icon: "arrow.up.left.and.arrow.down.right", category: .transition),
        PremiumEffect(name: "Glitch", icon: "rectangle.on.rectangle.angled", category: .transition),
        PremiumEffect(name: "Whip Pan", icon: "arrow.left.and.right", category: .transition),
        PremiumEffect(name: "Cross Dissolve", icon: "square.on.square.dashed", category: .transition),
        PremiumEffect(name: "Flash", icon: "bolt.fill", category: .transition),
        PremiumEffect(name: "Spin", icon: "arrow.trianglehead.2.clockwise.rotate.90", category: .transition),
        PremiumEffect(name: "Bounce In", icon: "arrow.down.to.line", category: .transition),

        // ── Overlays (8) ──
        PremiumEffect(name: "Light Leak", icon: "sun.max.fill", category: .overlay),
        PremiumEffect(name: "Film Grain", icon: "square.grid.3x3.fill", category: .overlay),
        PremiumEffect(name: "Vignette Pro", icon: "circle.dashed", category: .overlay),
        PremiumEffect(name: "Lens Flare", icon: "sun.haze.fill", category: .overlay),
        PremiumEffect(name: "Bokeh", icon: "circle.hexagongrid.fill", category: .overlay),
        PremiumEffect(name: "Dust", icon: "aqi.medium", category: .overlay),
        PremiumEffect(name: "Anamorphic Flare", icon: "line.horizontal.star.fill.line.horizontal", category: .overlay),
        PremiumEffect(name: "Prism", icon: "triangle.fill", category: .overlay),
    ]

    static func effects(for category: EffectCategory) -> [PremiumEffect] {
        effects.filter { $0.category == category }
    }

    /// Find a preset by name (used when AI recommends a preset by name string).
    static func effect(named name: String) -> PremiumEffect? {
        effects.first { $0.name == name }
    }

    /// All effect names in a category (used in AI prompt to list available presets).
    static func presetNames(for category: EffectCategory) -> [String] {
        effects(for: category).map(\.name)
    }
}

// MARK: - CIFilter-based LUT Application

enum CinematicLUT: String, CaseIterable, Sendable {
    case tealOrange = "Teal & Orange"
    case filmNoir = "Film Noir"
    case vintage8mm = "Vintage 8mm"
    case cyberpunk = "Cyberpunk"
    case bleachBypass = "Bleach Bypass"
    case goldenHour = "Golden Hour"
    case matteFilm = "Matte Film"
    case crossProcess = "Cross Process"

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
        case .bleachBypass:
            return applyBleachBypass(to: image)
        case .goldenHour:
            return applyGoldenHour(to: image)
        case .matteFilm:
            return applyMatteFilm(to: image)
        case .crossProcess:
            return applyCrossProcess(to: image)
        }
    }

    // MARK: - Original LUTs

    private func applyTealOrange(to image: CIImage) -> CIImage {
        var result = image
        if let vibrance = CIFilter(name: "CIVibrance") {
            vibrance.setValue(result, forKey: kCIInputImageKey)
            vibrance.setValue(0.6, forKey: "inputAmount")
            result = vibrance.outputImage ?? result
        }
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

    // MARK: - New LUTs

    /// Bleach Bypass: High contrast, desaturated silver look popular in war/thriller films.
    /// Inspired by the photochemical skip-bleach process (Saving Private Ryan, 300).
    private func applyBleachBypass(to image: CIImage) -> CIImage {
        var result = image
        if let controls = CIFilter(name: "CIColorControls") {
            controls.setValue(result, forKey: kCIInputImageKey)
            controls.setValue(1.5, forKey: "inputContrast")
            controls.setValue(0.5, forKey: "inputSaturation")
            controls.setValue(-0.03, forKey: "inputBrightness")
            result = controls.outputImage ?? result
        }
        if let sharpen = CIFilter(name: "CISharpenLuminance") {
            sharpen.setValue(result, forKey: kCIInputImageKey)
            sharpen.setValue(0.6, forKey: "inputSharpness")
            result = sharpen.outputImage ?? result
        }
        return result
    }

    /// Golden Hour: Warm, rich amber tones simulating the 30 minutes before sunset.
    /// Based on 3200K–4500K color temperature with boosted warmth.
    private func applyGoldenHour(to image: CIImage) -> CIImage {
        var result = image
        if let temp = CIFilter(name: "CITemperatureAndTint") {
            temp.setValue(result, forKey: kCIInputImageKey)
            temp.setValue(CIVector(x: 6500, y: 0), forKey: "inputNeutral")
            temp.setValue(CIVector(x: 4200, y: 15), forKey: "inputTargetNeutral")
            result = temp.outputImage ?? result
        }
        if let controls = CIFilter(name: "CIColorControls") {
            controls.setValue(result, forKey: kCIInputImageKey)
            controls.setValue(1.15, forKey: "inputSaturation")
            controls.setValue(0.05, forKey: "inputBrightness")
            result = controls.outputImage ?? result
        }
        if let vibrance = CIFilter(name: "CIVibrance") {
            vibrance.setValue(result, forKey: kCIInputImageKey)
            vibrance.setValue(0.4, forKey: "inputAmount")
            result = vibrance.outputImage ?? result
        }
        return result
    }

    /// Matte Film: Modern indie film look with lifted blacks and slight desaturation.
    /// Inspired by A24 films and VSCO-style editing with muted tones.
    private func applyMatteFilm(to image: CIImage) -> CIImage {
        var result = image
        // Lift blacks by reducing contrast and adding brightness
        if let controls = CIFilter(name: "CIColorControls") {
            controls.setValue(result, forKey: kCIInputImageKey)
            controls.setValue(0.85, forKey: "inputContrast")
            controls.setValue(0.08, forKey: "inputBrightness")
            controls.setValue(0.8, forKey: "inputSaturation")
            result = controls.outputImage ?? result
        }
        // Slight cool shift
        if let temp = CIFilter(name: "CITemperatureAndTint") {
            temp.setValue(result, forKey: kCIInputImageKey)
            temp.setValue(CIVector(x: 6500, y: 0), forKey: "inputNeutral")
            temp.setValue(CIVector(x: 6800, y: -10), forKey: "inputTargetNeutral")
            result = temp.outputImage ?? result
        }
        return result
    }

    /// Cross Process: Shifted color channels with high saturation for a retro/experimental look.
    /// Simulates the effect of processing slide film in C-41 chemistry.
    private func applyCrossProcess(to image: CIImage) -> CIImage {
        var result = image
        // Hue shift + high saturation creates the cross-processed color shift
        if let hue = CIFilter(name: "CIHueAdjust") {
            hue.setValue(result, forKey: kCIInputImageKey)
            hue.setValue(-0.3, forKey: "inputAngle")
            result = hue.outputImage ?? result
        }
        if let controls = CIFilter(name: "CIColorControls") {
            controls.setValue(result, forKey: kCIInputImageKey)
            controls.setValue(1.35, forKey: "inputSaturation")
            controls.setValue(1.15, forKey: "inputContrast")
            result = controls.outputImage ?? result
        }
        if let vibrance = CIFilter(name: "CIVibrance") {
            vibrance.setValue(result, forKey: kCIInputImageKey)
            vibrance.setValue(0.5, forKey: "inputAmount")
            result = vibrance.outputImage ?? result
        }
        return result
    }
}
