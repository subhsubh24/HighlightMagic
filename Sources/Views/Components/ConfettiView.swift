import SwiftUI

/// Celebration confetti burst for export completion
struct ConfettiView: View {
    @State private var particles: [ConfettiParticle] = []
    @State private var isAnimating = false

    private let colors: [Color] = [
        Color(hex: "7C3AED"), Color(hex: "EC4899"),
        .yellow, .green, .cyan, .orange
    ]

    var body: some View {
        ZStack {
            ForEach(particles) { particle in
                Circle()
                    .fill(particle.color)
                    .frame(width: particle.size, height: particle.size)
                    .offset(x: particle.x, y: isAnimating ? particle.endY : particle.startY)
                    .opacity(isAnimating ? 0 : 1)
                    .rotationEffect(.degrees(isAnimating ? particle.rotation : 0))
            }
        }
        .onAppear {
            particles = (0..<40).map { _ in
                ConfettiParticle(
                    color: colors.randomElement()!,
                    size: CGFloat.random(in: 4...10),
                    x: CGFloat.random(in: -180...180),
                    startY: CGFloat.random(in: -20...0),
                    endY: CGFloat.random(in: 200...500),
                    rotation: Double.random(in: 180...720)
                )
            }
            withAnimation(.easeOut(duration: 1.8)) {
                isAnimating = true
            }
        }
        .allowsHitTesting(false)
    }
}

private struct ConfettiParticle: Identifiable {
    let id = UUID()
    let color: Color
    let size: CGFloat
    let x: CGFloat
    let startY: CGFloat
    let endY: CGFloat
    let rotation: Double
}
