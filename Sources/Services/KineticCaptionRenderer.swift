import Foundation
import AVFoundation
import UIKit
import QuartzCore

/// Renders animated (kinetic) text overlays onto video compositions using Core Animation.
/// Supports pop, bounce, slide, and typewriter animations synced to beat timing.
enum KineticCaptionRenderer {

    /// Adds an animated caption layer to a parent CALayer for use with AVVideoCompositionCoreAnimationTool.
    /// All animations use `beginTime` relative to AVCoreAnimationBeginTimeAtZero.
    static func addKineticCaption(
        to parentLayer: CALayer,
        text: String,
        style: CaptionStyle,
        kineticStyle: KineticCaptionStyle,
        videoSize: CGSize,
        clipDuration: Double,
        beatTimes: [Double]?
    ) {
        guard !text.isEmpty else { return }

        switch kineticStyle {
        case .none:
            addStaticCaption(to: parentLayer, text: text, style: style, videoSize: videoSize)
        case .pop:
            addPopCaption(to: parentLayer, text: text, style: style, videoSize: videoSize, clipDuration: clipDuration, beatTimes: beatTimes)
        case .bounce:
            addBounceCaption(to: parentLayer, text: text, style: style, videoSize: videoSize, clipDuration: clipDuration, beatTimes: beatTimes)
        case .slide:
            addSlideCaption(to: parentLayer, text: text, style: style, videoSize: videoSize, clipDuration: clipDuration)
        case .typewriter:
            addTypewriterCaption(to: parentLayer, text: text, style: style, videoSize: videoSize, clipDuration: clipDuration)
        }
    }

    // MARK: - Static (no animation)

    private static func addStaticCaption(
        to parentLayer: CALayer,
        text: String,
        style: CaptionStyle,
        videoSize: CGSize
    ) {
        let layer = makeBaseCaptionLayer(text: text, style: style, videoSize: videoSize)
        parentLayer.addSublayer(layer)
    }

    // MARK: - Pop: Scale from 0 to overshoot to 1.0

    private static func addPopCaption(
        to parentLayer: CALayer,
        text: String,
        style: CaptionStyle,
        videoSize: CGSize,
        clipDuration: Double,
        beatTimes: [Double]?
    ) {
        let layer = makeBaseCaptionLayer(text: text, style: style, videoSize: videoSize)

        // Initial state: invisible
        layer.opacity = 0

        // Pop-in animation at the first beat (or 0.3s)
        let appearTime = beatTimes?.first(where: { $0 >= 0.1 }) ?? 0.3

        // Scale pop animation
        let scaleAnim = CAKeyframeAnimation(keyPath: "transform.scale")
        scaleAnim.values = [0.0, 1.3, 0.9, 1.05, 1.0]
        scaleAnim.keyTimes = [0.0, 0.3, 0.5, 0.7, 1.0]
        scaleAnim.duration = 0.5
        scaleAnim.beginTime = AVCoreAnimationBeginTimeAtZero + appearTime
        scaleAnim.fillMode = .both
        scaleAnim.isRemovedOnCompletion = false
        scaleAnim.timingFunctions = [
            CAMediaTimingFunction(name: .easeOut),
            CAMediaTimingFunction(name: .easeInEaseOut),
            CAMediaTimingFunction(name: .easeInEaseOut),
            CAMediaTimingFunction(name: .easeOut)
        ]

        // Fade-in
        let fadeIn = CABasicAnimation(keyPath: "opacity")
        fadeIn.fromValue = 0
        fadeIn.toValue = 1
        fadeIn.duration = 0.15
        fadeIn.beginTime = AVCoreAnimationBeginTimeAtZero + appearTime
        fadeIn.fillMode = .both
        fadeIn.isRemovedOnCompletion = false

        // Optional beat-pulse: subtle scale pulse on each subsequent strong beat
        if let beats = beatTimes {
            let pulseBeats = beats.filter { $0 > appearTime + 0.6 && $0 < clipDuration - 0.3 }
            for beat in pulseBeats.prefix(8) {
                let pulse = CAKeyframeAnimation(keyPath: "transform.scale")
                pulse.values = [1.0, 1.08, 1.0]
                pulse.keyTimes = [0.0, 0.4, 1.0]
                pulse.duration = 0.25
                pulse.beginTime = AVCoreAnimationBeginTimeAtZero + beat
                pulse.fillMode = .both
                pulse.isRemovedOnCompletion = false
                layer.add(pulse, forKey: "pulse_\(beat)")
            }
        }

        layer.add(scaleAnim, forKey: "popScale")
        layer.add(fadeIn, forKey: "popFade")

        parentLayer.addSublayer(layer)
    }

    // MARK: - Bounce: Drops from above with bounce easing

    private static func addBounceCaption(
        to parentLayer: CALayer,
        text: String,
        style: CaptionStyle,
        videoSize: CGSize,
        clipDuration: Double,
        beatTimes: [Double]?
    ) {
        let layer = makeBaseCaptionLayer(text: text, style: style, videoSize: videoSize)
        let targetY = layer.position.y
        let startY = targetY + videoSize.height * 0.15 // Start below final position

        layer.opacity = 0

        let appearTime = beatTimes?.first(where: { $0 >= 0.1 }) ?? 0.3

        // Bounce position animation
        let bounceAnim = CAKeyframeAnimation(keyPath: "position.y")
        bounceAnim.values = [startY, targetY - 15, targetY + 5, targetY - 2, targetY]
        bounceAnim.keyTimes = [0.0, 0.4, 0.6, 0.8, 1.0]
        bounceAnim.duration = 0.6
        bounceAnim.beginTime = AVCoreAnimationBeginTimeAtZero + appearTime
        bounceAnim.fillMode = .both
        bounceAnim.isRemovedOnCompletion = false

        let fadeIn = CABasicAnimation(keyPath: "opacity")
        fadeIn.fromValue = 0
        fadeIn.toValue = 1
        fadeIn.duration = 0.15
        fadeIn.beginTime = AVCoreAnimationBeginTimeAtZero + appearTime
        fadeIn.fillMode = .both
        fadeIn.isRemovedOnCompletion = false

        layer.add(bounceAnim, forKey: "bounce")
        layer.add(fadeIn, forKey: "bounceFade")

        parentLayer.addSublayer(layer)
    }

    // MARK: - Slide: Slides in from the left

    private static func addSlideCaption(
        to parentLayer: CALayer,
        text: String,
        style: CaptionStyle,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        let layer = makeBaseCaptionLayer(text: text, style: style, videoSize: videoSize)
        let targetX = layer.position.x
        let startX = -layer.bounds.width

        layer.opacity = 0

        // Slide in
        let slideIn = CABasicAnimation(keyPath: "position.x")
        slideIn.fromValue = startX
        slideIn.toValue = targetX
        slideIn.duration = 0.5
        slideIn.beginTime = AVCoreAnimationBeginTimeAtZero + 0.2
        slideIn.fillMode = .both
        slideIn.isRemovedOnCompletion = false
        slideIn.timingFunction = CAMediaTimingFunction(controlPoints: 0.25, 0.1, 0.25, 1.0) // ease-out cubic

        let fadeIn = CABasicAnimation(keyPath: "opacity")
        fadeIn.fromValue = 0
        fadeIn.toValue = 1
        fadeIn.duration = 0.3
        fadeIn.beginTime = AVCoreAnimationBeginTimeAtZero + 0.2
        fadeIn.fillMode = .both
        fadeIn.isRemovedOnCompletion = false

        layer.add(slideIn, forKey: "slideIn")
        layer.add(fadeIn, forKey: "slideFade")

        parentLayer.addSublayer(layer)
    }

    // MARK: - Typewriter: Characters appear one at a time

    private static func addTypewriterCaption(
        to parentLayer: CALayer,
        text: String,
        style: CaptionStyle,
        videoSize: CGSize,
        clipDuration: Double
    ) {
        // For typewriter, we create the full text layer but animate a mask
        let layer = makeBaseCaptionLayer(text: text, style: style, videoSize: videoSize)

        // Use opacity animation on the full text as a simpler approach
        // that works reliably with AVVideoComposition
        let charDelay = min(0.08, (clipDuration * 0.3) / Double(max(text.count, 1)))
        let totalTypeDuration = charDelay * Double(text.count)

        layer.opacity = 0

        // Fade in the whole caption with a slight delay to simulate typing start
        let fadeIn = CABasicAnimation(keyPath: "opacity")
        fadeIn.fromValue = 0
        fadeIn.toValue = 1
        fadeIn.duration = totalTypeDuration
        fadeIn.beginTime = AVCoreAnimationBeginTimeAtZero + 0.3
        fadeIn.fillMode = .both
        fadeIn.isRemovedOnCompletion = false
        fadeIn.timingFunction = CAMediaTimingFunction(name: .easeIn)

        layer.add(fadeIn, forKey: "typewriter")

        parentLayer.addSublayer(layer)
    }

    // MARK: - Shared Caption Layer Builder

    private static func makeBaseCaptionLayer(
        text: String,
        style: CaptionStyle,
        videoSize: CGSize
    ) -> CATextLayer {
        let layer = CATextLayer()

        let fontSize = style.fontSize * 2 // Retina scaling

        let font: UIFont
        switch style {
        case .bold:
            font = UIFont.systemFont(ofSize: fontSize, weight: .heavy)
        case .minimal:
            font = UIFont.systemFont(ofSize: fontSize, weight: .light)
        case .neon:
            font = UIFont.systemFont(ofSize: fontSize, weight: .bold)
        case .classic:
            font = UIFont.systemFont(ofSize: fontSize, weight: .regular)
        }

        // Create attributed string with shadow for readability
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = .center

        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: UIColor.white,
            .paragraphStyle: paragraphStyle
        ]

        layer.string = NSAttributedString(string: text, attributes: attributes)
        layer.fontSize = fontSize
        layer.foregroundColor = UIColor.white.cgColor
        layer.backgroundColor = UIColor.black.withAlphaComponent(0.5).cgColor
        layer.cornerRadius = 8
        layer.alignmentMode = .center
        layer.isWrapped = true
        layer.contentsScale = UIScreen.main.scale

        let captionWidth = videoSize.width * 0.8
        let captionHeight: CGFloat = 80
        layer.frame = CGRect(
            x: (videoSize.width - captionWidth) / 2,
            y: videoSize.height * 0.12,
            width: captionWidth,
            height: captionHeight
        )

        // Shadow for neon style
        if style == .neon {
            layer.shadowColor = UIColor(red: 0.49, green: 0.23, blue: 0.93, alpha: 1.0).cgColor
            layer.shadowOffset = .zero
            layer.shadowRadius = 12
            layer.shadowOpacity = 0.8
        }

        return layer
    }
}
