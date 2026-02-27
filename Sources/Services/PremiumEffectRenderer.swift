import Foundation
import AVFoundation
import CoreImage
import UIKit
import QuartzCore

/// Renders premium effects (particles, overlays, transitions, cinematic LUTs) onto video compositions.
/// Supports both named presets and AI-generated custom parameters via CustomEffectConfig.
///
/// Rendering architecture:
/// - Particle effects: GPU-accelerated via CAEmitterLayer + AVVideoCompositionCoreAnimationTool
/// - Overlay effects: CIFilter compositing during the video composition pass
/// - Transition effects: CALayer keyframe/basic animations at clip boundaries
/// - Custom parameters: Same pipeline, parameterized from AI-generated JSON
enum PremiumEffectRenderer {

    // MARK: - Particle Effects (CAEmitterLayer-based)

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
            case "Bubbles":
                addBubbles(to: parentLayer, videoSize: videoSize, clipDuration: clipDuration)
            case "Hearts":
                addHearts(to: parentLayer, videoSize: videoSize, clipDuration: clipDuration)
            case "Embers":
                addEmbers(to: parentLayer, videoSize: videoSize, clipDuration: clipDuration)
            case "Rain":
                addRain(to: parentLayer, videoSize: videoSize, clipDuration: clipDuration)
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
        largeFlake.contents = makeCircleImage(radius: 6)?.cgImage
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
        smallFlake.contents = makeCircleImage(radius: 4)?.cgImage
        smallFlake.xAcceleration = 3

        emitter.emitterCells = [largeFlake, smallFlake]
        parentLayer.addSublayer(emitter)
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
        cell.contents = makeGlowImage(color: UIColor(red: 1.0, green: 1.0, blue: 0.7, alpha: 1.0))?.cgImage
        cell.yAcceleration = -10

        emitter.emitterCells = [cell]
        parentLayer.addSublayer(emitter)
    }

    // MARK: - Bubbles

    /// Transparent floating bubbles that drift upward with subtle wobble.
    /// Refractive look achieved via ring shape with gradient alpha.
    private static func addBubbles(
        to parentLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let emitter = CAEmitterLayer()
        emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: videoSize.height + 20)
        emitter.emitterSize = CGSize(width: videoSize.width * 0.9, height: 1)
        emitter.emitterShape = .line
        emitter.emitterMode = .outline
        emitter.frame = CGRect(origin: .zero, size: videoSize)
        emitter.beginTime = AVCoreAnimationBeginTimeAtZero

        let cell = CAEmitterCell()
        cell.birthRate = 4
        cell.lifetime = 6.0
        cell.lifetimeRange = 2.0
        cell.velocity = 40
        cell.velocityRange = 20
        cell.emissionLongitude = -.pi / 2 // upward
        cell.emissionRange = .pi / 8
        cell.scale = 0.06
        cell.scaleRange = 0.04
        cell.alphaSpeed = -0.1
        cell.spin = 0
        cell.color = UIColor(white: 1.0, alpha: 0.6).cgColor
        cell.contents = makeRingImage(radius: 10)?.cgImage
        cell.xAcceleration = 3 // gentle drift
        cell.yAcceleration = -5

        emitter.emitterCells = [cell]
        parentLayer.addSublayer(emitter)
    }

    // MARK: - Hearts

    /// Floating heart shapes in pink/red tones. Perfect for romantic or celebratory clips.
    private static func addHearts(
        to parentLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let emitter = CAEmitterLayer()
        emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: videoSize.height + 10)
        emitter.emitterSize = CGSize(width: videoSize.width, height: 1)
        emitter.emitterShape = .line
        emitter.emitterMode = .outline
        emitter.frame = CGRect(origin: .zero, size: videoSize)
        emitter.beginTime = AVCoreAnimationBeginTimeAtZero

        let colors: [UIColor] = [
            UIColor(red: 1.0, green: 0.3, blue: 0.5, alpha: 1),
            UIColor(red: 1.0, green: 0.4, blue: 0.6, alpha: 1),
            UIColor(red: 0.9, green: 0.2, blue: 0.3, alpha: 1),
        ]

        var cells: [CAEmitterCell] = []
        for color in colors {
            let cell = CAEmitterCell()
            cell.birthRate = 2
            cell.lifetime = 5.0
            cell.velocity = 50
            cell.velocityRange = 25
            cell.emissionLongitude = -.pi / 2
            cell.emissionRange = .pi / 6
            cell.scale = 0.05
            cell.scaleRange = 0.03
            cell.spin = 0.2
            cell.spinRange = 0.4
            cell.alphaSpeed = -0.15
            cell.color = color.cgColor
            cell.contents = makeHeartImage()?.cgImage
            cell.yAcceleration = -8
            cells.append(cell)
        }

        emitter.emitterCells = cells
        parentLayer.addSublayer(emitter)
    }

    // MARK: - Embers

    /// Glowing ember particles that rise from the bottom, simulating a campfire or dramatic scene.
    /// Orange-red glow with slight random drift.
    private static func addEmbers(
        to parentLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let emitter = CAEmitterLayer()
        emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: videoSize.height + 10)
        emitter.emitterSize = CGSize(width: videoSize.width * 0.6, height: 1)
        emitter.emitterShape = .line
        emitter.emitterMode = .outline
        emitter.frame = CGRect(origin: .zero, size: videoSize)
        emitter.beginTime = AVCoreAnimationBeginTimeAtZero

        let cell = CAEmitterCell()
        cell.birthRate = 8
        cell.lifetime = 4.0
        cell.lifetimeRange = 1.5
        cell.velocity = 60
        cell.velocityRange = 30
        cell.emissionLongitude = -.pi / 2
        cell.emissionRange = .pi / 5
        cell.scale = 0.025
        cell.scaleRange = 0.015
        cell.scaleSpeed = -0.003
        cell.alphaSpeed = -0.2
        cell.color = UIColor(red: 1.0, green: 0.6, blue: 0.1, alpha: 0.9).cgColor
        cell.contents = makeGlowImage(color: UIColor(red: 1.0, green: 0.5, blue: 0.0, alpha: 1.0))?.cgImage
        cell.xAcceleration = 8
        cell.yAcceleration = -15

        let smallEmber = CAEmitterCell()
        smallEmber.birthRate = 12
        smallEmber.lifetime = 3.0
        smallEmber.velocity = 45
        smallEmber.velocityRange = 20
        smallEmber.emissionLongitude = -.pi / 2
        smallEmber.emissionRange = .pi / 4
        smallEmber.scale = 0.012
        smallEmber.scaleRange = 0.008
        smallEmber.alphaSpeed = -0.25
        smallEmber.color = UIColor(red: 1.0, green: 0.8, blue: 0.3, alpha: 0.7).cgColor
        smallEmber.contents = makeGlowImage(color: UIColor(red: 1.0, green: 0.7, blue: 0.2, alpha: 1.0))?.cgImage
        smallEmber.xAcceleration = -5

        emitter.emitterCells = [cell, smallEmber]
        parentLayer.addSublayer(emitter)
    }

    // MARK: - Rain

    /// Falling rain drops with slight angle and varying sizes.
    /// Uses elongated particles with slight wind drift.
    private static func addRain(
        to parentLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let emitter = CAEmitterLayer()
        emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: -20)
        emitter.emitterSize = CGSize(width: videoSize.width * 1.3, height: 1)
        emitter.emitterShape = .line
        emitter.emitterMode = .outline
        emitter.frame = CGRect(origin: .zero, size: videoSize)
        emitter.beginTime = AVCoreAnimationBeginTimeAtZero

        let heavyDrop = CAEmitterCell()
        heavyDrop.birthRate = 40
        heavyDrop.lifetime = 2.0
        heavyDrop.velocity = 300
        heavyDrop.velocityRange = 80
        heavyDrop.emissionLongitude = .pi + 0.15 // slight angle
        heavyDrop.emissionRange = 0.05
        heavyDrop.scale = 0.015
        heavyDrop.scaleRange = 0.005
        heavyDrop.color = UIColor(white: 0.85, alpha: 0.5).cgColor
        heavyDrop.contents = makeRainDropImage(length: 20)?.cgImage
        heavyDrop.xAcceleration = 15

        let lightDrop = CAEmitterCell()
        lightDrop.birthRate = 25
        lightDrop.lifetime = 2.5
        lightDrop.velocity = 200
        lightDrop.velocityRange = 60
        lightDrop.emissionLongitude = .pi + 0.12
        lightDrop.emissionRange = 0.08
        lightDrop.scale = 0.008
        lightDrop.scaleRange = 0.004
        lightDrop.color = UIColor(white: 0.9, alpha: 0.3).cgColor
        lightDrop.contents = makeRainDropImage(length: 14)?.cgImage
        lightDrop.xAcceleration = 10

        emitter.emitterCells = [heavyDrop, lightDrop]
        parentLayer.addSublayer(emitter)
    }

    // MARK: - Custom Particle (AI-generated parameters)

    /// Renders a particle effect from AI-generated CustomParticle parameters.
    static func addCustomParticle(
        to parentLayer: CALayer,
        config: CustomParticle,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let emitter = CAEmitterLayer()
        emitter.frame = CGRect(origin: .zero, size: videoSize)
        emitter.beginTime = AVCoreAnimationBeginTimeAtZero

        // Configure emitter position from config
        switch config.emitterPosition {
        case .fullScreen:
            emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: videoSize.height / 2)
            emitter.emitterSize = videoSize
            emitter.emitterShape = .rectangle
            emitter.emitterMode = .surface
        case .top:
            emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: -10)
            emitter.emitterSize = CGSize(width: videoSize.width, height: 1)
            emitter.emitterShape = .line
            emitter.emitterMode = .outline
        case .bottom:
            emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: videoSize.height + 10)
            emitter.emitterSize = CGSize(width: videoSize.width, height: 1)
            emitter.emitterShape = .line
            emitter.emitterMode = .outline
        case .lowerHalf:
            emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: videoSize.height * 0.7)
            emitter.emitterSize = CGSize(width: videoSize.width * 0.8, height: videoSize.height * 0.4)
            emitter.emitterShape = .rectangle
            emitter.emitterMode = .surface
        case .center:
            emitter.emitterPosition = CGPoint(x: videoSize.width / 2, y: videoSize.height / 2)
            emitter.emitterSize = .zero
            emitter.emitterShape = .point
            emitter.emitterMode = .outline
        }

        let image = makeParticleImage(for: config.shape)

        var cells: [CAEmitterCell] = []
        let colors = config.colors.isEmpty ? ["FFFFFF"] : config.colors

        for hex in colors {
            let cell = CAEmitterCell()
            cell.birthRate = Float(config.birthRate / Double(colors.count))
            cell.lifetime = Float(config.lifetime)
            cell.velocity = CGFloat(config.velocity)
            cell.velocityRange = CGFloat(config.velocityRange)
            cell.scale = CGFloat(config.scale)
            cell.scaleRange = CGFloat(config.scaleRange)
            cell.spin = CGFloat(config.spin)
            cell.spinRange = CGFloat(config.spinRange)
            cell.alphaSpeed = Float(config.alphaSpeed)
            cell.color = UIColor(hex: hex).cgColor
            cell.contents = image?.cgImage
            cell.yAcceleration = CGFloat(config.gravity)
            cell.xAcceleration = CGFloat(config.xAcceleration)

            // Direction
            switch config.direction {
            case .up:
                cell.emissionLongitude = -.pi / 2
                cell.emissionRange = .pi / 6
            case .down:
                cell.emissionLongitude = .pi / 2
                cell.emissionRange = .pi / 6
            case .random:
                cell.emissionRange = .pi * 2
            case .outward:
                cell.emissionRange = .pi * 2
                cell.velocity = CGFloat(config.velocity * 0.5)
            }

            cells.append(cell)
        }

        emitter.emitterCells = cells
        parentLayer.addSublayer(emitter)
    }

    // MARK: - Particle Image Generation

    private static func makeCircleImage(radius: CGFloat) -> UIImage? {
        let size = CGSize(width: radius * 2, height: radius * 2)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let path = UIBezierPath(
                arcCenter: CGPoint(x: radius, y: radius),
                radius: radius,
                startAngle: 0,
                endAngle: .pi * 2,
                clockwise: true
            )
            UIColor.white.setFill()
            path.fill()
        }
    }

    private static func makeGlowImage(color: UIColor) -> UIImage? {
        let size = CGSize(width: 16, height: 16)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let context = ctx.cgContext
            let center = CGPoint(x: 8, y: 8)
            let clearColor = color.withAlphaComponent(0.0).cgColor
            let colors = [color.cgColor, clearColor] as CFArray
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

    private static func makeHeartImage() -> UIImage? {
        let size = CGSize(width: 20, height: 18)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let path = UIBezierPath()
            path.move(to: CGPoint(x: 10, y: 17))
            path.addCurve(to: CGPoint(x: 0, y: 6),
                         controlPoint1: CGPoint(x: 3, y: 14),
                         controlPoint2: CGPoint(x: 0, y: 10))
            path.addArc(withCenter: CGPoint(x: 5, y: 5), radius: 5,
                       startAngle: .pi, endAngle: 0, clockwise: true)
            path.addArc(withCenter: CGPoint(x: 15, y: 5), radius: 5,
                       startAngle: .pi, endAngle: 0, clockwise: true)
            path.addCurve(to: CGPoint(x: 10, y: 17),
                         controlPoint1: CGPoint(x: 20, y: 10),
                         controlPoint2: CGPoint(x: 17, y: 14))
            path.close()
            UIColor.white.setFill()
            path.fill()
        }
    }

    private static func makeRingImage(radius: CGFloat) -> UIImage? {
        let size = CGSize(width: radius * 2, height: radius * 2)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let center = CGPoint(x: radius, y: radius)
            let path = UIBezierPath(
                arcCenter: center,
                radius: radius - 1.5,
                startAngle: 0,
                endAngle: .pi * 2,
                clockwise: true
            )
            UIColor.white.withAlphaComponent(0.6).setStroke()
            path.lineWidth = 1.5
            path.stroke()
            // Add subtle highlight
            let highlight = UIBezierPath(
                arcCenter: CGPoint(x: radius - 2, y: radius - 2),
                radius: radius * 0.3,
                startAngle: 0,
                endAngle: .pi * 2,
                clockwise: true
            )
            UIColor.white.withAlphaComponent(0.3).setFill()
            highlight.fill()
        }
    }

    private static func makeRainDropImage(length: CGFloat) -> UIImage? {
        let size = CGSize(width: 3, height: length)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let rect = CGRect(x: 0.5, y: 0, width: 2, height: length)
            let path = UIBezierPath(roundedRect: rect, cornerRadius: 1)
            UIColor.white.setFill()
            path.fill()
        }
    }

    private static func makeDiamondImage() -> UIImage? {
        let size = CGSize(width: 16, height: 16)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let path = UIBezierPath()
            path.move(to: CGPoint(x: 8, y: 0))
            path.addLine(to: CGPoint(x: 16, y: 8))
            path.addLine(to: CGPoint(x: 8, y: 16))
            path.addLine(to: CGPoint(x: 0, y: 8))
            path.close()
            UIColor.white.setFill()
            path.fill()
        }
    }

    private static func makeSquareImage() -> UIImage? {
        let size = CGSize(width: 10, height: 10)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: size)
            UIColor.white.setFill()
            UIBezierPath(rect: rect).fill()
        }
    }

    private static func makeParticleImage(for shape: CustomParticle.ParticleShape) -> UIImage? {
        switch shape {
        case .circle: return makeCircleImage(radius: 6)
        case .star: return makeSparkleImage()
        case .heart: return makeHeartImage()
        case .square: return makeSquareImage()
        case .diamond: return makeDiamondImage()
        case .ring: return makeRingImage(radius: 8)
        case .glow: return makeGlowImage(color: .white)
        }
    }

    // MARK: - Overlay Effects (CIFilter-based)

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
            case "Bokeh":
                result = applyBokeh(to: result, videoSize: videoSize)
            case "Dust":
                result = applyDust(to: result, videoSize: videoSize)
            case "Anamorphic Flare":
                result = applyAnamorphicFlare(to: result, videoSize: videoSize)
            case "Prism":
                result = applyPrism(to: result, videoSize: videoSize)
            default:
                break
            }
        }

        return result
    }

    // MARK: - Light Leak

    private static func applyLightLeak(to image: CIImage, videoSize: CGSize) -> CIImage {
        var result = image
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
        guard let noiseFilter = CIFilter(name: "CIRandomGenerator")?.outputImage else {
            return result
        }
        let croppedNoise = noiseFilter.cropped(to: result.extent)
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

    // MARK: - Bokeh

    /// Simulated bokeh (out-of-focus highlight circles) via gaussian blur on bright areas
    /// blended as a screen overlay. Creates the characteristic shallow depth-of-field look.
    private static func applyBokeh(to image: CIImage, videoSize: CGSize) -> CIImage {
        var result = image
        // Extract highlights and blur them to create bokeh circles
        if let highlights = CIFilter(name: "CIHighlightShadowAdjust", parameters: [
            kCIInputImageKey: result,
            "inputHighlightAmount": 1.5,
            "inputShadowAmount": -0.3
        ])?.outputImage {
            if let blurred = CIFilter(name: "CIGaussianBlur", parameters: [
                kCIInputImageKey: highlights,
                "inputRadius": 12.0
            ])?.outputImage {
                let cropped = blurred.cropped(to: result.extent)
                // Blend with soft light for dreamy bokeh effect
                let bokehColor = CIColor(red: 1.0, green: 0.98, blue: 0.95, alpha: 0.08)
                if let colorLayer = CIFilter(name: "CIConstantColorGenerator", parameters: [
                    kCIInputColorKey: bokehColor
                ])?.outputImage?.cropped(to: result.extent) {
                    if let blend = CIFilter(name: "CIScreenBlendMode", parameters: [
                        kCIInputImageKey: colorLayer,
                        kCIInputBackgroundImageKey: cropped
                    ])?.outputImage?.cropped(to: result.extent) {
                        // Mix original with bokeh
                        if let final = CIFilter(name: "CIScreenBlendMode", parameters: [
                            kCIInputImageKey: blend,
                            kCIInputBackgroundImageKey: result
                        ])?.outputImage {
                            result = final.cropped(to: image.extent)
                        }
                    }
                }
            }
        }
        return result
    }

    // MARK: - Dust

    /// Subtle floating dust particles using low-intensity noise overlay.
    /// Simulates floating dust motes in a beam of light.
    private static func applyDust(to image: CIImage, videoSize: CGSize) -> CIImage {
        var result = image
        guard let noiseFilter = CIFilter(name: "CIRandomGenerator")?.outputImage else {
            return result
        }
        let croppedNoise = noiseFilter.cropped(to: result.extent)
        // Very faint, warm-tinted noise for dust particles
        if let dustLayer = CIFilter(name: "CIColorMatrix", parameters: [
            kCIInputImageKey: croppedNoise,
            "inputRVector": CIVector(x: 0.06, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 0.05, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: 0.04, w: 0),
            "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0.04),
            "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 0)
        ])?.outputImage {
            if let blend = CIFilter(name: "CIAdditionCompositing", parameters: [
                kCIInputImageKey: dustLayer,
                kCIInputBackgroundImageKey: result
            ])?.outputImage {
                result = blend
            }
        }
        return result
    }

    // MARK: - Anamorphic Flare

    /// Horizontal lens flare streak across the frame, simulating anamorphic cinema lenses.
    /// The signature horizontal blue streak seen in J.J. Abrams and Michael Bay films.
    private static func applyAnamorphicFlare(to image: CIImage, videoSize: CGSize) -> CIImage {
        var result = image
        // Create a horizontal gradient streak
        let centerY = videoSize.height * 0.4
        let flareColor = CIColor(red: 0.7, green: 0.85, blue: 1.0, alpha: 0.12)
        let transparentColor = CIColor(red: 0.7, green: 0.85, blue: 1.0, alpha: 0.0)

        // Main horizontal streak
        guard let gradient = CIFilter(name: "CILinearGradient", parameters: [
            "inputPoint0": CIVector(x: 0, y: centerY),
            "inputPoint1": CIVector(x: 0, y: centerY + videoSize.height * 0.08),
            "inputColor0": flareColor,
            "inputColor1": transparentColor
        ])?.outputImage else { return result }

        let cropped = gradient.cropped(to: result.extent)
        if let blend = CIFilter(name: "CIScreenBlendMode", parameters: [
            kCIInputImageKey: cropped,
            kCIInputBackgroundImageKey: result
        ])?.outputImage {
            result = blend
        }

        // Secondary thinner streak
        let streak2Color = CIColor(red: 0.6, green: 0.8, blue: 1.0, alpha: 0.06)
        if let gradient2 = CIFilter(name: "CILinearGradient", parameters: [
            "inputPoint0": CIVector(x: 0, y: centerY - videoSize.height * 0.02),
            "inputPoint1": CIVector(x: 0, y: centerY - videoSize.height * 0.06),
            "inputColor0": streak2Color,
            "inputColor1": transparentColor
        ])?.outputImage {
            let cropped2 = gradient2.cropped(to: result.extent)
            if let blend2 = CIFilter(name: "CIScreenBlendMode", parameters: [
                kCIInputImageKey: cropped2,
                kCIInputBackgroundImageKey: result
            ])?.outputImage {
                result = blend2
            }
        }

        return result
    }

    // MARK: - Prism

    /// Rainbow prism light leak effect. Simulates light refracting through a prism
    /// creating spectral color bands across the frame.
    private static func applyPrism(to image: CIImage, videoSize: CGSize) -> CIImage {
        var result = image
        // Create multiple color bands at different angles
        let prismColors: [(r: CGFloat, g: CGFloat, b: CGFloat)] = [
            (1.0, 0.3, 0.3), // red
            (1.0, 0.7, 0.2), // orange
            (0.3, 1.0, 0.5), // green
            (0.3, 0.5, 1.0), // blue
            (0.7, 0.3, 1.0), // violet
        ]

        for (i, color) in prismColors.enumerated() {
            let offset = CGFloat(i) * videoSize.height * 0.04
            let y = videoSize.height * 0.3 + offset
            let bandColor = CIColor(red: color.r, green: color.g, blue: color.b, alpha: 0.04)
            let clearColor = CIColor(red: color.r, green: color.g, blue: color.b, alpha: 0.0)

            if let gradient = CIFilter(name: "CILinearGradient", parameters: [
                "inputPoint0": CIVector(x: videoSize.width * 0.7, y: y),
                "inputPoint1": CIVector(x: videoSize.width * 0.7, y: y + videoSize.height * 0.05),
                "inputColor0": bandColor,
                "inputColor1": clearColor
            ])?.outputImage {
                let cropped = gradient.cropped(to: result.extent)
                if let blend = CIFilter(name: "CIScreenBlendMode", parameters: [
                    kCIInputImageKey: cropped,
                    kCIInputBackgroundImageKey: result
                ])?.outputImage {
                    result = blend
                }
            }
        }
        return result
    }

    // MARK: - Custom Overlay (AI-generated parameters)

    /// Applies a custom overlay effect from AI-generated CustomOverlay parameters.
    static func applyCustomOverlay(
        to image: CIImage,
        config: CustomOverlay,
        videoSize: CGSize
    ) -> CIImage {
        var result = image
        let uiColor = UIColor(hex: config.color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        uiColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        let opacity = min(max(config.opacity * config.intensity, 0), 1)

        switch config.type {
        case .colorWash:
            let washColor = CIColor(red: r, green: g, blue: b, alpha: opacity)
            guard let colorImage = CIFilter(name: "CIConstantColorGenerator", parameters: [
                kCIInputColorKey: washColor
            ])?.outputImage else { return result }
            let cropped = colorImage.cropped(to: result.extent)
            if let blend = applyBlend(mode: config.blendMode, foreground: cropped, background: result) {
                result = blend
            }

        case .radialGradient:
            let center = overlayCenter(config.position, videoSize: videoSize)
            let mainColor = CIColor(red: r, green: g, blue: b, alpha: opacity)
            let clearColor = CIColor(red: r, green: g, blue: b, alpha: 0)
            guard let gradient = CIFilter(name: "CIRadialGradient", parameters: [
                "inputCenter": center,
                "inputRadius0": 0.0,
                "inputRadius1": min(videoSize.width, videoSize.height) * 0.5,
                "inputColor0": mainColor,
                "inputColor1": clearColor
            ])?.outputImage else { return result }
            let cropped = gradient.cropped(to: result.extent)
            if let blend = applyBlend(mode: config.blendMode, foreground: cropped, background: result) {
                result = blend
            }

        case .linearGradient:
            let mainColor = CIColor(red: r, green: g, blue: b, alpha: opacity)
            var endR: CGFloat = r, endG: CGFloat = g, endB: CGFloat = b
            if let endHex = config.gradientEndColor {
                let endColor = UIColor(hex: endHex)
                var endA: CGFloat = 0
                endColor.getRed(&endR, green: &endG, blue: &endB, alpha: &endA)
            }
            let endCIColor = CIColor(red: endR, green: endG, blue: endB, alpha: opacity * 0.5)
            guard let gradient = CIFilter(name: "CILinearGradient", parameters: [
                "inputPoint0": CIVector(x: 0, y: videoSize.height),
                "inputPoint1": CIVector(x: videoSize.width, y: 0),
                "inputColor0": mainColor,
                "inputColor1": endCIColor
            ])?.outputImage else { return result }
            let cropped = gradient.cropped(to: result.extent)
            if let blend = applyBlend(mode: config.blendMode, foreground: cropped, background: result) {
                result = blend
            }

        case .vignette:
            let radius = min(max(config.vignetteRadius, 0.5), 5.0)
            let intensity = min(max(config.intensity, 0), 3.0)
            if let vignette = CIFilter(name: "CIVignette", parameters: [
                kCIInputImageKey: result,
                "inputRadius": radius,
                "inputIntensity": intensity
            ])?.outputImage {
                result = vignette
            }

        case .noise:
            guard let noiseFilter = CIFilter(name: "CIRandomGenerator")?.outputImage else { return result }
            let croppedNoise = noiseFilter.cropped(to: result.extent)
            let noiseOpacity = opacity * 0.5
            if let grayscale = CIFilter(name: "CIColorMatrix", parameters: [
                kCIInputImageKey: croppedNoise,
                "inputRVector": CIVector(x: noiseOpacity, y: 0, z: 0, w: 0),
                "inputGVector": CIVector(x: 0, y: noiseOpacity, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: noiseOpacity, w: 0),
                "inputAVector": CIVector(x: 0, y: 0, z: 0, w: noiseOpacity),
                "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 0)
            ])?.outputImage {
                if let blend = CIFilter(name: "CIAdditionCompositing", parameters: [
                    kCIInputImageKey: grayscale,
                    kCIInputBackgroundImageKey: result
                ])?.outputImage {
                    result = blend
                }
            }
        }

        return result
    }

    private static func applyBlend(mode: CustomOverlay.BlendMode, foreground: CIImage, background: CIImage) -> CIImage? {
        let filterName: String
        switch mode {
        case .screen: filterName = "CIScreenBlendMode"
        case .overlay: filterName = "CIOverlayBlendMode"
        case .multiply: filterName = "CIMultiplyBlendMode"
        case .softLight: filterName = "CISoftLightBlendMode"
        case .addition: filterName = "CIAdditionCompositing"
        }
        return CIFilter(name: filterName, parameters: [
            kCIInputImageKey: foreground,
            kCIInputBackgroundImageKey: background
        ])?.outputImage
    }

    private static func overlayCenter(_ position: CustomOverlay.OverlayPosition, videoSize: CGSize) -> CIVector {
        switch position {
        case .center: return CIVector(x: videoSize.width / 2, y: videoSize.height / 2)
        case .topLeft: return CIVector(x: videoSize.width * 0.2, y: videoSize.height * 0.8)
        case .topRight: return CIVector(x: videoSize.width * 0.8, y: videoSize.height * 0.8)
        case .bottomLeft: return CIVector(x: videoSize.width * 0.2, y: videoSize.height * 0.2)
        case .bottomRight: return CIVector(x: videoSize.width * 0.8, y: videoSize.height * 0.2)
        }
    }

    // MARK: - Transition Effects (CALayer Animation-based)

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
            case "Cross Dissolve":
                addCrossDissolve(to: videoLayer, clipDuration: clipDuration)
            case "Flash":
                addFlash(to: parentLayer, videoSize: videoSize, clipDuration: clipDuration)
            case "Spin":
                addSpin(to: videoLayer, videoSize: videoSize, clipDuration: clipDuration)
            case "Bounce In":
                addBounceIn(to: videoLayer, videoSize: videoSize, clipDuration: clipDuration)
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
        let centerX = videoSize.width / 2

        let introGlitch = CAKeyframeAnimation(keyPath: "position.x")
        introGlitch.values = [centerX + 15, centerX - 10, centerX + 8, centerX - 5, centerX]
        introGlitch.keyTimes = [0.0, 0.2, 0.4, 0.7, 1.0]
        introGlitch.duration = transitionDuration
        introGlitch.beginTime = AVCoreAnimationBeginTimeAtZero
        introGlitch.fillMode = .both
        introGlitch.isRemovedOnCompletion = false
        videoLayer.add(introGlitch, forKey: "glitchIntro")

        let introFlicker = CAKeyframeAnimation(keyPath: "opacity")
        introFlicker.values = [0.0, 1.0, 0.5, 1.0, 0.7, 1.0]
        introFlicker.keyTimes = [0.0, 0.15, 0.3, 0.5, 0.7, 1.0]
        introFlicker.duration = transitionDuration
        introFlicker.beginTime = AVCoreAnimationBeginTimeAtZero
        introFlicker.fillMode = .both
        introFlicker.isRemovedOnCompletion = false
        videoLayer.add(introFlicker, forKey: "glitchFlickerIntro")

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

        let introSlide = CABasicAnimation(keyPath: "position.x")
        introSlide.fromValue = videoSize.width * 1.5
        introSlide.toValue = videoSize.width / 2
        introSlide.duration = transitionDuration
        introSlide.beginTime = AVCoreAnimationBeginTimeAtZero
        introSlide.fillMode = .both
        introSlide.isRemovedOnCompletion = false
        introSlide.timingFunction = CAMediaTimingFunction(controlPoints: 0.25, 0.1, 0.25, 1.0)
        videoLayer.add(introSlide, forKey: "whipPanIntro")

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

    // MARK: - Cross Dissolve

    /// Smooth opacity fade in/out. The most classic, universally appropriate transition.
    private static func addCrossDissolve(
        to videoLayer: CALayer,
        clipDuration: Double
    ) {
        let transitionDuration = 0.5

        let fadeIn = CABasicAnimation(keyPath: "opacity")
        fadeIn.fromValue = 0.0
        fadeIn.toValue = 1.0
        fadeIn.duration = transitionDuration
        fadeIn.beginTime = AVCoreAnimationBeginTimeAtZero
        fadeIn.fillMode = .both
        fadeIn.isRemovedOnCompletion = false
        fadeIn.timingFunction = CAMediaTimingFunction(name: .easeIn)
        videoLayer.add(fadeIn, forKey: "crossDissolveIn")

        let fadeOut = CABasicAnimation(keyPath: "opacity")
        fadeOut.fromValue = 1.0
        fadeOut.toValue = 0.0
        fadeOut.duration = transitionDuration
        fadeOut.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - transitionDuration
        fadeOut.fillMode = .both
        fadeOut.isRemovedOnCompletion = false
        fadeOut.timingFunction = CAMediaTimingFunction(name: .easeOut)
        videoLayer.add(fadeOut, forKey: "crossDissolveOut")
    }

    // MARK: - Flash

    /// White flash between clips. A bright white overlay fades in/out at clip boundaries.
    private static func addFlash(
        to parentLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let transitionDuration = 0.25

        let flashLayer = CALayer()
        flashLayer.frame = CGRect(origin: .zero, size: videoSize)
        flashLayer.backgroundColor = UIColor.white.cgColor
        flashLayer.opacity = 0

        // Intro flash
        let flashIn = CAKeyframeAnimation(keyPath: "opacity")
        flashIn.values = [1.0, 0.0]
        flashIn.keyTimes = [0.0, 1.0]
        flashIn.duration = transitionDuration
        flashIn.beginTime = AVCoreAnimationBeginTimeAtZero
        flashIn.fillMode = .both
        flashIn.isRemovedOnCompletion = false
        flashLayer.add(flashIn, forKey: "flashIn")

        // Outro flash
        let flashOut = CAKeyframeAnimation(keyPath: "opacity")
        flashOut.values = [0.0, 1.0]
        flashOut.keyTimes = [0.0, 1.0]
        flashOut.duration = transitionDuration
        flashOut.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - transitionDuration
        flashOut.fillMode = .both
        flashOut.isRemovedOnCompletion = false
        flashLayer.add(flashOut, forKey: "flashOut")

        parentLayer.addSublayer(flashLayer)
    }

    // MARK: - Spin

    /// Rotation transition: the frame rotates in at the start and out at the end.
    private static func addSpin(
        to videoLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let transitionDuration = 0.4

        // Spin in with scale
        let spinIn = CAKeyframeAnimation(keyPath: "transform.rotation.z")
        spinIn.values = [Double.pi * 0.15, -Double.pi * 0.05, 0.0]
        spinIn.keyTimes = [0.0, 0.6, 1.0]
        spinIn.duration = transitionDuration
        spinIn.beginTime = AVCoreAnimationBeginTimeAtZero
        spinIn.fillMode = .both
        spinIn.isRemovedOnCompletion = false
        videoLayer.add(spinIn, forKey: "spinIn")

        let scaleIn = CAKeyframeAnimation(keyPath: "transform.scale")
        scaleIn.values = [0.85, 1.02, 1.0]
        scaleIn.keyTimes = [0.0, 0.7, 1.0]
        scaleIn.duration = transitionDuration
        scaleIn.beginTime = AVCoreAnimationBeginTimeAtZero
        scaleIn.fillMode = .both
        scaleIn.isRemovedOnCompletion = false
        videoLayer.add(scaleIn, forKey: "spinScaleIn")

        // Spin out
        let spinOut = CABasicAnimation(keyPath: "transform.rotation.z")
        spinOut.fromValue = 0.0
        spinOut.toValue = -Double.pi * 0.15
        spinOut.duration = transitionDuration
        spinOut.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - transitionDuration
        spinOut.fillMode = .both
        spinOut.isRemovedOnCompletion = false
        videoLayer.add(spinOut, forKey: "spinOut")

        let scaleOut = CABasicAnimation(keyPath: "transform.scale")
        scaleOut.fromValue = 1.0
        scaleOut.toValue = 0.85
        scaleOut.duration = transitionDuration
        scaleOut.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - transitionDuration
        scaleOut.fillMode = .both
        scaleOut.isRemovedOnCompletion = false
        videoLayer.add(scaleOut, forKey: "spinScaleOut")
    }

    // MARK: - Bounce In

    /// Spring-like bounce entry: the frame drops from above and bounces into place.
    private static func addBounceIn(
        to videoLayer: CALayer,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let transitionDuration = 0.5

        let bounceY = CAKeyframeAnimation(keyPath: "position.y")
        let centerY = videoSize.height / 2
        bounceY.values = [centerY - videoSize.height * 0.3, centerY + 15, centerY - 8, centerY + 3, centerY]
        bounceY.keyTimes = [0.0, 0.4, 0.6, 0.8, 1.0]
        bounceY.duration = transitionDuration
        bounceY.beginTime = AVCoreAnimationBeginTimeAtZero
        bounceY.fillMode = .both
        bounceY.isRemovedOnCompletion = false
        bounceY.timingFunctions = [
            CAMediaTimingFunction(name: .easeIn),
            CAMediaTimingFunction(name: .easeOut),
            CAMediaTimingFunction(name: .easeIn),
            CAMediaTimingFunction(name: .easeOut)
        ]
        videoLayer.add(bounceY, forKey: "bounceIn")

        // Outro: drop down
        let dropOut = CABasicAnimation(keyPath: "position.y")
        dropOut.fromValue = centerY
        dropOut.toValue = centerY + videoSize.height * 0.4
        dropOut.duration = 0.3
        dropOut.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - 0.3
        dropOut.fillMode = .both
        dropOut.isRemovedOnCompletion = false
        dropOut.timingFunction = CAMediaTimingFunction(name: .easeIn)
        videoLayer.add(dropOut, forKey: "bounceOut")
    }

    // MARK: - Custom Transition (AI-generated parameters)

    /// Applies custom transition animations from AI-generated CustomTransition parameters.
    static func addCustomTransition(
        to parentLayer: CALayer,
        videoLayer: CALayer,
        config: CustomTransition,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let duration = min(max(config.duration, 0.1), 1.0)
        let intensity = min(max(config.intensity, 0.1), 3.0)

        switch config.type {
        case .fade:
            addCrossDissolve(to: videoLayer, clipDuration: clipDuration)

        case .zoom:
            let zoomAmount = 1.0 + 0.15 * intensity
            let introZoom = CAKeyframeAnimation(keyPath: "transform.scale")
            introZoom.values = [zoomAmount, 1.0 - 0.02 * intensity, 1.0]
            introZoom.keyTimes = [0.0, 0.6, 1.0]
            introZoom.duration = duration
            introZoom.beginTime = AVCoreAnimationBeginTimeAtZero
            introZoom.fillMode = .both
            introZoom.isRemovedOnCompletion = false
            videoLayer.add(introZoom, forKey: "customZoomIn")

            let outroZoom = CABasicAnimation(keyPath: "transform.scale")
            outroZoom.fromValue = 1.0
            outroZoom.toValue = zoomAmount
            outroZoom.duration = duration
            outroZoom.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - duration
            outroZoom.fillMode = .both
            outroZoom.isRemovedOnCompletion = false
            videoLayer.add(outroZoom, forKey: "customZoomOut")

        case .slide:
            let slideFrom: CGFloat
            let slideTo: CGFloat
            switch config.direction {
            case .left:
                slideFrom = videoSize.width * 1.5
                slideTo = -videoSize.width / 2
            case .right:
                slideFrom = -videoSize.width / 2
                slideTo = videoSize.width * 1.5
            case .up:
                // Slide vertically
                let introY = CABasicAnimation(keyPath: "position.y")
                introY.fromValue = videoSize.height * 1.5
                introY.toValue = videoSize.height / 2
                introY.duration = duration
                introY.beginTime = AVCoreAnimationBeginTimeAtZero
                introY.fillMode = .both
                introY.isRemovedOnCompletion = false
                videoLayer.add(introY, forKey: "customSlideInY")
                return
            case .down:
                let introY = CABasicAnimation(keyPath: "position.y")
                introY.fromValue = -videoSize.height / 2
                introY.toValue = videoSize.height / 2
                introY.duration = duration
                introY.beginTime = AVCoreAnimationBeginTimeAtZero
                introY.fillMode = .both
                introY.isRemovedOnCompletion = false
                videoLayer.add(introY, forKey: "customSlideInY")
                return
            case .center:
                slideFrom = videoSize.width * 1.5
                slideTo = -videoSize.width / 2
            }

            let introSlide = CABasicAnimation(keyPath: "position.x")
            introSlide.fromValue = slideFrom
            introSlide.toValue = videoSize.width / 2
            introSlide.duration = duration
            introSlide.beginTime = AVCoreAnimationBeginTimeAtZero
            introSlide.fillMode = .both
            introSlide.isRemovedOnCompletion = false
            videoLayer.add(introSlide, forKey: "customSlideIn")

            let outroSlide = CABasicAnimation(keyPath: "position.x")
            outroSlide.fromValue = videoSize.width / 2
            outroSlide.toValue = slideTo
            outroSlide.duration = duration
            outroSlide.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - duration
            outroSlide.fillMode = .both
            outroSlide.isRemovedOnCompletion = false
            videoLayer.add(outroSlide, forKey: "customSlideOut")

        case .spin:
            addSpin(to: videoLayer, videoSize: videoSize, clipDuration: clipDuration)

        case .flash:
            addFlash(to: parentLayer, videoSize: videoSize, clipDuration: clipDuration)

        case .bounce:
            addBounceIn(to: videoLayer, videoSize: videoSize, clipDuration: clipDuration)

        case .iris:
            // Iris uses scale from center point — similar to zoom but starting from 0
            let irisIn = CAKeyframeAnimation(keyPath: "transform.scale")
            irisIn.values = [0.0, 1.05, 1.0]
            irisIn.keyTimes = [0.0, 0.7, 1.0]
            irisIn.duration = duration
            irisIn.beginTime = AVCoreAnimationBeginTimeAtZero
            irisIn.fillMode = .both
            irisIn.isRemovedOnCompletion = false
            videoLayer.add(irisIn, forKey: "irisIn")

            let irisOut = CABasicAnimation(keyPath: "transform.scale")
            irisOut.fromValue = 1.0
            irisOut.toValue = 0.0
            irisOut.duration = duration
            irisOut.beginTime = AVCoreAnimationBeginTimeAtZero + clipDuration - duration
            irisOut.fillMode = .both
            irisOut.isRemovedOnCompletion = false
            videoLayer.add(irisOut, forKey: "irisOut")
        }
    }

    // MARK: - Cinematic Grade Application

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

    // MARK: - Custom Color Grade (AI-generated parameters)

    /// Applies a fully custom color grade from AI-generated CustomColorGrade parameters.
    /// Builds a CIFilter chain from the provided values, clamping all to safe ranges.
    static func applyCustomGrade(to image: CIImage, config: CustomColorGrade) -> CIImage {
        var result = image

        // Temperature & tint
        let temp = min(max(config.temperature, 2000), 10000)
        let tint = min(max(config.tint, -100), 100)
        if temp != 6500 || tint != 0 {
            if let tempFilter = CIFilter(name: "CITemperatureAndTint", parameters: [
                kCIInputImageKey: result,
                "inputNeutral": CIVector(x: 6500, y: 0),
                "inputTargetNeutral": CIVector(x: temp, y: tint)
            ])?.outputImage {
                result = tempFilter
            }
        }

        // Exposure
        let exposure = min(max(config.exposure, -2.0), 2.0)
        if exposure != 0 {
            if let expFilter = CIFilter(name: "CIExposureAdjust", parameters: [
                kCIInputImageKey: result,
                "inputEV": exposure
            ])?.outputImage {
                result = expFilter
            }
        }

        // Color controls (saturation, contrast, brightness)
        let saturation = min(max(config.saturation, 0.0), 2.0)
        let contrast = min(max(config.contrast, 0.5), 2.0)
        let brightness = min(max(config.brightness, -0.5), 0.5)
        if saturation != 1.0 || contrast != 1.0 || brightness != 0 {
            if let controls = CIFilter(name: "CIColorControls", parameters: [
                kCIInputImageKey: result,
                "inputSaturation": saturation,
                "inputContrast": contrast,
                "inputBrightness": brightness
            ])?.outputImage {
                result = controls
            }
        }

        // Vibrance
        let vibrance = min(max(config.vibrance, -1.0), 1.0)
        if vibrance != 0 {
            if let vibFilter = CIFilter(name: "CIVibrance", parameters: [
                kCIInputImageKey: result,
                "inputAmount": vibrance
            ])?.outputImage {
                result = vibFilter
            }
        }

        // Hue shift
        let hueShift = min(max(config.hueShift, -.pi), .pi)
        if abs(hueShift) > 0.01 {
            if let hueFilter = CIFilter(name: "CIHueAdjust", parameters: [
                kCIInputImageKey: result,
                "inputAngle": hueShift
            ])?.outputImage {
                result = hueFilter
            }
        }

        // Sharpen
        let sharpen = min(max(config.sharpen, 0.0), 2.0)
        if sharpen > 0.01 {
            if let sharpFilter = CIFilter(name: "CISharpenLuminance", parameters: [
                kCIInputImageKey: result,
                "inputSharpness": sharpen
            ])?.outputImage {
                result = sharpFilter
            }
        }

        return result
    }

    // MARK: - Premium LUT Application

    static func applyPremiumLUT(to image: CIImage, effect: PremiumEffect) -> CIImage {
        guard effect.category == .lut else { return image }
        guard let lut = CinematicLUT(rawValue: effect.name) else { return image }
        return lut.apply(to: image)
    }
}

// MARK: - UIColor Hex Extension

extension UIColor {
    convenience init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b, a: UInt64
        switch hex.count {
        case 6:
            (r, g, b, a) = (int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF, 255)
        case 8:
            (r, g, b, a) = (int >> 24 & 0xFF, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (r, g, b, a) = (255, 255, 255, 255)
        }
        self.init(
            red: CGFloat(r) / 255,
            green: CGFloat(g) / 255,
            blue: CGFloat(b) / 255,
            alpha: CGFloat(a) / 255
        )
    }
}
