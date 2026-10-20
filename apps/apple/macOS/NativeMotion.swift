import SillKit
import SwiftUI

@MainActor enum NativeMotion {
  static func ease(_ duration: Double) -> Animation {
    .timingCurve(
      AppleMetrics.easeX1, AppleMetrics.easeY1, AppleMetrics.easeX2, AppleMetrics.easeY2,
      duration: duration)
  }
  static func sheet(_ duration: Double) -> Animation {
    .timingCurve(
      AppleMetrics.easeSheetX1, AppleMetrics.easeSheetY1,
      AppleMetrics.easeSheetX2, AppleMetrics.easeSheetY2, duration: duration)
  }
  static func spring(velocity: Double = 0) -> Animation {
    .interpolatingSpring(
      mass: AppleMetrics.springMass, stiffness: AppleMetrics.springStiffness,
      damping: AppleMetrics.springDamping, initialVelocity: velocity)
  }
  static let fade = AnyTransition.opacity.animation(ease(AppleMetrics.motionFast))
  static let context = AnyTransition.asymmetric(
    insertion: .opacity.combined(with: .offset(y: AppleMetrics.motionContextY))
      .animation(ease(AppleMetrics.motionFast)),
    removal: .opacity.animation(ease(AppleMetrics.motionPress)))
}

/// Animates drawing only. Layout has already committed its final width.
struct TranslationPresentation: ViewModifier, Animatable {
  nonisolated var position: CGSize
  var update: (CGSize) -> Void = { _ in }
  nonisolated var animatableData: AnimatablePair<CGFloat, CGFloat> {
    get { .init(position.width, position.height) }
    set { position = CGSize(width: newValue.first, height: newValue.second) }
  }
  func body(content: Content) -> some View {
    content.offset(position).onChange(of: position) { _, value in update(value) }
  }
}

struct ShortContentTransition<Value: Equatable>: ViewModifier {
  let value: Value
  var duration = AppleMetrics.motionFast
  @State private var opacity = 1.0
  @State private var running = false
  @State private var generation = 0
  func body(content: Content) -> some View {
    content.opacity(opacity).onChange(of: value) {
      guard !running else { return }
      var transaction = Transaction(animation: nil)
      transaction.disablesAnimations = true
      withTransaction(transaction) { opacity = 0 }
      running = true
      generation += 1
    }.task(id: generation) {
      guard running else { return }
      await Task.yield()
      guard !Task.isCancelled else { return }
      withAnimation(NativeMotion.ease(duration), completionCriteria: .removed) {
        opacity = 1
      } completion: {
        running = false
      }
    }
  }
}
