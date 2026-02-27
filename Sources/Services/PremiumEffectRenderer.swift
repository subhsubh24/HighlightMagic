import Foundation
import AVFoundation
import CoreImage
import UIKit
import QuartzCore

/// Renders premium effects (particles, overlays, transitions, cinematic LUTs) onto video compositions.
/// Particle effects use CAEmitterLayer for GPU-accelerated rendering via AVVideoCompositionCoreAnimationTool.
/// Overlay effects use CIFilter compositing during the video composition pass.
/// Transition effects use CALayer animations at clip boundaries.
enum PremiumEffectRenderer {

    // MARK: - Particle Effects (CAEmitterLayer-based)

    /// Adds particle emitter layers to a parent CALayer for use with AVVideoCompositionCoreAnimationTool.
    static func addParticleEffects(
        to parentLayer: CALayer,
        effects: [PremiumEffect],
        videoSize: CGSize,
        clipDuration: Double
    ) {
        for effect in effects where effect.category == .particle {
            switch effect.name {
            case "Sparkles":
                addSparkles(to: parentLayer, videoSize: videoSize, clipDuration: clipDuration)
            case "Confetti":
                addConfetti(to: parentLayer, videoSize: videoSize, clipDuration: clipDuration)
            case "Snow":
                addSnow(to: parentLayer, videoSize: videoSize, clipDuration: clipDuration)
            case "Fireflies":
                addFireflies(to: parentLayer, videoSize: videoSize, clipDuration: clipDuration)
            default:
                break
            }
        }
    }

    // MARK: - Sparkles

    private static func addSparkles(
        to parentLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let emitter = CAEmitterLayer()
        emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: videoSize.height / 2)
        emitter.emitterSize = videoSize
        emitter.emitterShape = .rectangle
        emitter.emitterMode = .surface
        emitter.frame = CGRect(origin: .zero, size: videoSize)
        emitter.beginTime = AVCoreAnimationBeginTimeAtZero

        let cell = CAEmitterCell()
        cell.birthRate = 6
        cell.lifetime = 2.5
        cell.velocity = 20
        cell.velocityRange = 15
        cell.emissionRange = .pi * 2
        cell.scale = 0.04
        cell.scaleRange = 0.02
        cell.scaleSpeed = -0.01
        cell.alphaSpeed = -0.3
        cell.spin = 0.5
        cell.spinRange = 1.0
        cell.color = UIColor.white.cgColor
        cell.contents = makeSparkleImage()?.cgImage

        emitter.emitterCells = [cell]
        parentLayer.addSublayer(emitter)
    }

    private static func makeSparkleImage() -> UIImage? {
        let size = CGSize(width: 20, height: 20)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let center = CGPoint(x: 10, y: 10)
            let path = UIBezierPath()
            // 4-point star
            let outerRadius: CGFloat = 10
            let innerRadius: CGFloat = 3
            for i in 0..<8 {
                let angle = CGFloat(i) * .pi / 4 - .pi / 2
                let radius = i % 2 == 0 ? outerRadius : innerRadius
                let point = CGPoint(
                    x: center.x + cos(angle) * radius,
                    y: center.y + sin(angle) * radius
                )
                if i == 0 {
                    path.move(to: point)
                } else {
                    path.addLine(to: point)
                }
            }
            path.close()
            UIColor.white.setFill()
            path.fill()
        }
    }

    // MARK: - Confetti

    private static func addConfetti(
        to parentLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let emitter = CAEmitterLayer()
        emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: -20)
        emitter.emitterSize = CGSize(width: videoSize.width, height: 1)
        emitter.emitterShape = .line
        emitter.emitterMode = .outline
        emitter.frame = CGRect(origin: .zero, size: videoSize)
        emitter.beginTime = AVCoreAnimationBeginTimeAtZero

        let colors: [UIColor] = [
            UIColor(red: 1.0, green: 0.2, blue: 0.4, alpha: 1),
            UIColor(red: 0.3, green: 0.8, blue: 1.0, alpha: 1),
            UIColor(red: 1.0, green: 0.9, blue: 0.2, alpha: 1),
            UIColor(red: 0.5, green: 1.0, blue: 0.4, alpha: 1),
            UIColor(red: 0.8, green: 0.4, blue: 1.0, alpha: 1),
        ]

        var cells: [CAEmitterCell] = []
        for color in colors {
            let cell = CAEmitterCell()
            cell.birthRate = 3
            cell.lifetime = 5.0
            cell.velocity = 120
            cell.velocityRange = 40
            cell.emissionLongitude = .pi
            cell.emissionRange = .pi / 6
            cell.scale = 0.06
            cell.scaleRange = 0.03
            cell.spin = 2.0
            cell.spinRange = 4.0
            cell.color = color.cgColor
            cell.contents = makeConfettiImage()?.cgImage
            cell.yAcceleration = 30
            cells.append(cell)
        }

        emitter.emitterCells = cells
        parentLayer.addSublayer(emitter)
    }

    private static func makeConfettiImage() -> UIImage? {
        let size = CGSize(width: 12, height: 8)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: size)
            let path = UIBezierPath(roundedRect: rect, cornerRadius: 2)
            UIColor.white.setFill()
            path.fill()
        }
    }

    // MARK: - Snow

    private static func addSnow(
        to parentLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let emitter = CAEmitterLayer()
        emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: -10)
        emitter.emitterSize = CGSize(width: videoSize.width * 1.2, height: 1)
        emitter.emitterShape = .line
        emitter.emitterMode = .outline
        emitter.frame = CGRect(origin: .zero, size: videoSize)
        emitter.beginTime = AVCoreAnimationBeginTimeAtZero

        let largeFlake = CAEmitterCell()
        largeFlake.birthRate = 4
        largeFlake.lifetime = 8.0
        largeFlake.velocity = 30
        largeFlake.velocityRange = 15
        largeFlake.emissionLongitude = .pi
        largeFlake.emissionRange = .pi / 8
        largeFlake.scale = 0.05
        largeFlake.scaleRange = 0.02
        largeFlake.spin = 0.3
        largeFlake.spinRange = 0.5
        largeFlake.color = UIColor.white.withAlphaComponent(0.8).cgColor
        largeFlake.contents = makeSnowflakeImage(radius: 6)?.cgImage
        largeFlake.xAcceleration = 5
        largeFlake.yAcceleration = 5

        let smallFlake = CAEmitterCell()
        smallFlake.birthRate = 8
        smallFlake.lifetime = 10.0
        smallFlake.velocity = 18
        smallFlake.velocityRange = 10
        smallFlake.emissionLongitude = .pi
        smallFlake.emissionRange = .pi / 6
        smallFlake.scale = 0.025
        smallFlake.scaleRange = 0.01
        smallFlake.color = UIColor.white.withAlphaComponent(0.6).cgColor
        smallFlake.contents = makeSnowflakeImage(radius: 4)?.cgImage
        smallFlake.xAcceleration = 3

        emitter.emitterCells = [largeFlake, smallFlake]
        parentLayer.addSublayer(emitter)
    }

    private static func makeSnowflakeImage(radius: CGFloat) -> UIImage? {
        let size = CGSize(width: radius * 2, height: radius * 2)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let center = CGPoint(x: radius, y: radius)
            let path = UIBezierPath(
                arcCenter: center,
                radius: radius,
                startAngle: 0,
                endAngle: .pi * 2,
                clockwise: true
            )
            UIColor.white.setFill()
            path.fill()
        }
    }

    // MARK: - Fireflies

    private static func addFireflies(
        to parentLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let emitter = CAEmitterLayer()
        emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: videoSize.height * 0.7)
        emitter.emitterSize = CGSize(width: videoSize.width * 0.8, height: videoSize.height * 0.4)
        emitter.emitterShape = .rectangle
        emitter.emitterMode = .surface
        emitter.frame = CGRect(origin: .zero, size: videoSize)
        emitter.beginTime = AVCoreAnimationBeginTimeAtZero

        let cell = CAEmitterCell()
        cell.birthRate = 3
        cell.lifetime = 4.0
        cell.lifetimeRange = 2.0
        cell.velocity = 8
        cell.velocityRange = 6
        cell.emissionRange = .pi * 2
        cell.scale = 0.035
        cell.scaleRange = 0.015
        cell.alphaRange = 0.5
        cell.alphaSpeed = -0.15
        cell.color = UIColor(red: 1.0, green: 0.95, blue: 0.5, alpha: 0.9).cgColor
        cell.contents = makeFireflyImage()?.cgImage
        cell.yAcceleration = -10

        emitter.emitterCells = [cell]
        parentLayer.addSublayer(emitter)
    }

    private static func makeFireflyImage() -> UIImage? {
        let size = CGSize(width: 16, height: 16)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let context = ctx.cgContext
            let center = CGPoint(x: 8, y: 8)
            let colors = [
                UIColor(red: 1.0, green: 1.0, blue: 0.7, alpha: 1.0).cgColor,
                UIColor(red: 1.0, green: 0.95, blue: 0.4, alpha: 0.0).cgColor
            ] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
                context.drawRadialGradient(
                    gradient,
                    startCenter: center, startRadius: 0,
                    endCenter: center, endRadius: 8,
                    options: []
                )
            }
        }
    }

    // MARK: - Overlay Effects (CIFilter-based)

    /// Applies overlay effects to a CIImage during the video composition rendering pass.
    static func applyOverlayEffects(
        to image: CIImage,
        effects: [PremiumEffect],
        videoSize: CGSize
    ) -> CIImage {
        var result = image

        for effect in effects where effect.category == .overlay {
            switch effect.name {
            case "Light Leak":
                result = applyLightLeak(to: result, videoSize: videoSize)
            case "Film Grain":
                result = applyFilmGrain(to: result, videoSize: videoSize)
            case "Vignette Pro":
                result = applyVignettePro(to: result, videoSize: videoSize)
            case "Lens Flare":
                result = applyLensFlare(to: result, videoSize: videoSize)
            default:
                break
            }
        }

        return result
    }

    // MARK: - Light Leak

    private static func applyLightLeak(to image: CIImage, videoSize: CGSize) -> CIImage {
        var result = image

        // Warm color overlay simulating light leak from film edge
        let leakColor = CIColor(red: 1.0, green: 0.7, blue: 0.3, alpha: 0.15)
        guard let colorImage = CIFilter(name: "CIConstantColorGenerator", parameters: [
            kCIInputColorKey: leakColor
        ])?.outputImage else { return result }

        let cropped = colorImage.cropped(to: result.extent)

        if let blend = CIFilter(name: "CIScreenBlendMode", parameters: [
            kCIInputImageKey: cropped,
            kCIInputBackgroundImageKey: result
        ])?.outputImage {
            result = blend
        }

        // Add slight warmth
        if let temp = CIFilter(name: "CITemperatureAndTint", parameters: [
            kCIInputImageKey: result,
            "inputNeutral": CIVector(x: 6500, y: 0),
            "inputTargetNeutral": CIVector(x: 5500, y: 10)
        ])?.outputImage {
            result = temp
        }

        return result
    }

    // MARK: - Film Grain

    private static func applyFilmGrain(to image: CIImage, videoSize: CGSize) -> CIImage {
        var result = image

        // Generate noise pattern
        guard let noiseFilter = CIFilter(name: "CIRandomGenerator")?.outputImage else {
            return result
        }

        // Crop noise to match video size and reduce intensity
        let croppedNoise = noiseFilter.cropped(to: result.extent)

        // Convert noise to grayscale and reduce opacity
        if let grayscale = CIFilter(name: "CIColorMatrix", parameters: [
            kCIInputImageKey: croppedNoise,
            "inputRVector": CIVector(x: 0.1, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 0.1, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: 0.1, w: 0),
            "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0.08),
            "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 0)
        ])?.outputImage {
            if let blend = CIFilter(name: "CIAdditionCompositing", parameters: [
                kCIInputImageKey: grayscale,
                kCIInputBackgroundImageKey: result
            ])?.outputImage {
                result = blend
            }
        }

        return result
    }

    // MARK: - Vignette Pro

    private static func applyVignettePro(to image: CIImage, videoSize: CGSize) -> CIImage {
        guard let vignette = CIFilter(name: "CIVignette", parameters: [
            kCIInputImageKey: image,
            "inputRadius": 2.5,
            "inputIntensity": 1.2
        ])?.outputImage else {
            return image
        }
        return vignette
    }

    // MARK: - Lens Flare

    private static func applyLensFlare(to image: CIImage, videoSize: CGSize) -> CIImage {
        var result = image

        // Simulated lens flare using a radial gradient overlay
        let center = CIVector(x: videoSize.width * 0.7, y: videoSize.height * 0.3)
        let flareColor = CIColor(red: 1.0, green: 0.95, blue: 0.8, alpha: 0.2)
        let transparentColor = CIColor(red: 1.0, green: 0.95, blue: 0.8, alpha: 0.0)

        guard let gradient = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": center,
            "inputRadius0": 0.0,
            "inputRadius1": min(videoSize.width, videoSize.height) * 0.4,
            "inputColor0": flareColor,
            "inputColor1": transparentColor
        ])?.outputImage else { return result }

        let croppedGradient = gradient.cropped(to: result.extent)

        if let blend = CIFilter(name: "CIScreenBlendMode", parameters: [
            kCIInputImageKey: croppedGradient,
            kCIInputBackgroundImageKey: result
        ])?.outputImage {
            result = blend
        }

        return result
    }

    // MARK: - Transition Effects (CALayer Animation-based)

    /// Adds transition effects as CALayer animations at clip start/end.
    static func addTransitionEffects(
        to parentLayer: CALayer,
        videoLayer: CALayer,
        effects: [PremiumEffect],
        videoSize: CGSize,
        clipDuration: Double
    ) {
        for effect in effects where effect.category == .transition {
            switch effect.name {
            case "Zoom Burst":
                addZoomBurst(to: videoLayer, videoSize: videoSize, clipDuration: clipDuration)
            case "Glitch":
                addGlitch(to: parentLayer, videoLayer: videoLayer, videoSize: videoSize, clipDuration: clipDuration)
            case "Whip Pan":
                addWhipPan(to: videoLayer, videoSize: videoSize, clipDuration: clipDuration)
            default:
                break
            }
        }
    }

    // MARK: - Zoom Burst

    private static func addZoomBurst(
        to videoLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let transitionDuration = 0.4

        // Intro: zoom in from slight scale
        let introZoom = CAKeyframeAnimation(keyPath: "transform.scale")
        introZoom.values = [1.15, 0.98, 1.0]
        introZoom.keyTimes = [0.0, 0.6, 1.0]
        introZoom.duration = transitionDuration
        introZoom.beginTime = AVCoreAnimationBeginTimeAtZero
        introZoom.fillMode = .both
        introZoom.isRemovedOnCompletion = false
        introZoom.timingFunctions = [
            CAMediaTimingFunction(name: .easeOut),
            CAMediaTimingFunction(name: .easeInEaseOut)
        ]
        videoLayer.add(introZoom, forKey: "zoomBurstIntro")

        // Outro: zoom out at end
        let outroZoom = CABasicAnimation(keyPath: "transform.scale")
        outroZoom.fromValue = 1.0
        outroZoom.toValue = 1.2
        outroZoom.duration = transitionDuration
        outroZoom.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - transitionDuration
        outroZoom.fillMode = .both
        outroZoom.isRemovedOnCompletion = false
        outroZoom.timingFunction = CAMediaTimingFunction(name: .easeIn)
        videoLayer.add(outroZoom, forKey: "zoomBurstOutro")
    }

    // MARK: - Glitch

    private static func addGlitch(
        to parentLayer: CALayer,
        videoLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let transitionDuration = 0.3

        // Intro glitch: rapid horizontal offset jitter
        let introGlitch = CAKeyframeAnimation(keyPath: "position.x")
        let centerX = videoSize.width / 2
        introGlitch.values = [centerX + 15, centerX - 10, centerX + 8, centerX - 5, centerX]
        introGlitch.keyTimes = [0.0, 0.2, 0.4, 0.7, 1.0]
        introGlitch.duration = transitionDuration
        introGlitch.beginTime = AVCoreAnimationBeginTimeAtZero
        introGlitch.fillMode = .both
        introGlitch.isRemovedOnCompletion = false
        videoLayer.add(introGlitch, forKey: "glitchIntro")

        // Intro opacity flicker
        let introFlicker = CAKeyframeAnimation(keyPath: "opacity")
        introFlicker.values = [0.0, 1.0, 0.5, 1.0, 0.7, 1.0]
        introFlicker.keyTimes = [0.0, 0.15, 0.3, 0.5, 0.7, 1.0]
        introFlicker.duration = transitionDuration
        introFlicker.beginTime = AVCoreAnimationBeginTimeAtZero
        introFlicker.fillMode = .both
        introFlicker.isRemovedOnCompletion = false
        videoLayer.add(introFlicker, forKey: "glitchFlickerIntro")

        // Outro glitch at end
        let outroGlitch = CAKeyframeAnimation(keyPath: "position.x")
        outroGlitch.values = [centerX, centerX - 12, centerX + 8, centerX - 6, centerX + 15]
        outroGlitch.keyTimes = [0.0, 0.3, 0.5, 0.7, 1.0]
        outroGlitch.duration = transitionDuration
        outroGlitch.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - transitionDuration
        outroGlitch.fillMode = .both
        outroGlitch.isRemovedOnCompletion = false
        videoLayer.add(outroGlitch, forKey: "glitchOutro")

        let outroFlicker = CAKeyframeAnimation(keyPath: "opacity")
        outroFlicker.values = [1.0, 0.7, 1.0, 0.4, 0.0]
        outroFlicker.keyTimes = [0.0, 0.3, 0.5, 0.8, 1.0]
        outroFlicker.duration = transitionDuration
        outroFlicker.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - transitionDuration
        outroFlicker.fillMode = .both
        outroFlicker.isRemovedOnCompletion = false
        videoLayer.add(outroFlicker, forKey: "glitchFlickerOutro")
    }

    // MARK: - Whip Pan

    private static func addWhipPan(
        to videoLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let transitionDuration = 0.35

        // Intro: slide in from right with motion blur effect (scale X slightly)
        let introSlide = CABasicAnimation(keyPath: "position.x")
        introSlide.fromValue = videoSize.width * 1.5
        introSlide.toValue = videoSize.width / 2
        introSlide.duration = transitionDuration
        introSlide.beginTime = AVCoreAnimationBeginTimeAtZero
        introSlide.fillMode = .both
        introSlide.isRemovedOnCompletion = false
        introSlide.timingFunction = CAMediaTimingFunction(controlPoints: 0.25, 0.1, 0.25, 1.0)
        videoLayer.add(introSlide, forKey: "whipPanIntro")

        // Outro: slide out to left
        let outroSlide = CABasicAnimation(keyPath: "position.x")
        outroSlide.fromValue = videoSize.width / 2
        outroSlide.toValue = -videoSize.width / 2
        outroSlide.duration = transitionDuration
        outroSlide.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - transitionDuration
        outroSlide.fillMode = .both
        outroSlide.isRemovedOnCompletion = false
        outroSlide.timingFunction = CAMediaTimingFunction(name: .easeIn)
        videoLayer.add(outroSlide, forKey: "whipPanOutro")
    }

    // MARK: - Cinematic Grade Application

    /// Applies a cinematic color grade to a CIImage.
    static func applyCinematicGrade(to image: CIImage, grade: CinematicGrade) -> CIImage {
        switch grade {
        case .none:
            return image
        case .warmGlow:
            return applyWarmGlow(to: image)
        case .tealOrange:
            return CinematicLUT.tealOrange.apply(to: image)
        case .moodyCinematic:
            return applyMoodyCinematic(to: image)
        case .vintageFilm:
            return CinematicLUT.vintage8mm.apply(to: image)
        case .cleanAiry:
            return applyCleanAiry(to: image)
        }
    }

    private static func applyWarmGlow(to image: CIImage) -> CIImage {
        var result = image
        if let temp = CIFilter(name: "CITemperatureAndTint", parameters: [
            kCIInputImageKey: result,
            "inputNeutral": CIVector(x: 6500, y: 0),
            "inputTargetNeutral": CIVector(x: 4800, y: 0)
        ])?.outputImage {
            result = temp
        }
        if let controls = CIFilter(name: "CIColorControls", parameters: [
            kCIInputImageKey: result,
            "inputSaturation": 1.15,
            "inputBrightness": 0.03
        ])?.outputImage {
            result = controls
        }
        return result
    }

    private static func applyMoodyCinematic(to image: CIImage) -> CIImage {
        var result = image
        if let controls = CIFilter(name: "CIColorControls", parameters: [
            kCIInputImageKey: result,
            "inputContrast": 1.3,
            "inputSaturation": 0.7,
            "inputBrightness": -0.05
        ])?.outputImage {
            result = controls
        }
        return result
    }

    private static func applyCleanAiry(to image: CIImage) -> CIImage {
        var result = image
        if let exposure = CIFilter(name: "CIExposureAdjust", parameters: [
            kCIInputImageKey: result,
            "inputEV": 0.4
        ])?.outputImage {
            result = exposure
        }
        if let controls = CIFilter(name: "CIColorControls", parameters: [
            kCIInputImageKey: result,
            "inputSaturation": 0.85,
            "inputContrast": 0.9
        ])?.outputImage {
            result = controls
        }
        return result
    }

    // MARK: - Premium LUT Application

    /// Applies a premium LUT effect (from the Premium Effects sheet) to a CIImage.
    static func applyPremiumLUT(to image: CIImage, effect: PremiumEffect) -> CIImage {
        guard effect.category == .lut else { return image }
        guard let lut = CinematicLUT(rawValue: effect.name) else { return image }
        return lut.apply(to: image)
    }
}
