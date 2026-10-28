import SillKit
import SwiftUI

/// motion.md, with every parameter read from AppleMetrics. Components do not keep their own values.
@MainActor enum Motion {
  /// `ease`: cubic-bezier(0.23, 1, 0.32, 1).
  static func ease(_ duration: Double) -> Animation {
    .timingCurve(
      AppleMetrics.easeX1, AppleMetrics.easeY1, AppleMetrics.easeX2, AppleMetrics.easeY2,
      duration: duration)
  }
  /// `ease-sheet`: cubic-bezier(0.32, 0.72, 0, 1).
  static func sheet(_ duration: Double) -> Animation {
    .timingCurve(
      AppleMetrics.easeSheetX1, AppleMetrics.easeSheetY1,
      AppleMetrics.easeSheetX2, AppleMetrics.easeSheetY2, duration: duration)
  }
  /// `ease-reveal` over `dur-reveal`: the desktop bars coming back on their own.
  static var reveal: Animation { reveal(AppleMetrics.motionReveal) }
  static func reveal(_ duration: Double) -> Animation {
    .timingCurve(
      AppleMetrics.easeRevealX1, AppleMetrics.easeRevealY1,
      AppleMetrics.easeRevealX2, AppleMetrics.easeRevealY2, duration: duration)
  }
  static var topReveal: Animation {
    .timingCurve(
      AppleMetrics.easeRevealX1, AppleMetrics.easeRevealY1,
      AppleMetrics.easeRevealX2, AppleMetrics.easeRevealY2, duration: AppleMetrics.motionTopReveal)
  }
  /// Release spring: mass 1, stiffness 600, damping 45; it inherits the release velocity.
  static func spring(velocity: Double = 0) -> Animation {
    .interpolatingSpring(
      mass: AppleMetrics.springMass, stiffness: AppleMetrics.springStiffness,
      damping: AppleMetrics.springDamping, initialVelocity: velocity)
  }

  /// The card spring: a card opens into its detail and returns to the feed with it.
  static var card: Animation {
    .interpolatingSpring(
      mass: AppleMetrics.cardSpringMass, stiffness: AppleMetrics.cardSpringStiffness,
      damping: AppleMetrics.cardSpringDamping)
  }

  static var expanded: Animation {
    .interpolatingSpring(
      mass: AppleMetrics.expandedSpringMass,
      stiffness: AppleMetrics.expandedSpringStiffness, damping: AppleMetrics.expandedSpringDamping)
  }

  static var cardHandoff: Animation {
    .linear(duration: AppleMetrics.motionCardHandoffFade).delay(AppleMetrics.motionCardHandoffDelay)
  }

  static var press: Animation { ease(AppleMetrics.motionPress) }
  static var hover: Animation { ease(AppleMetrics.motionHover) }
  static var state: Animation { ease(AppleMetrics.motionState) }
  static var read: Animation { ease(AppleMetrics.motionRead) }
  static var layout: Animation { ease(AppleMetrics.motionLayout) }
  static var fast: Animation { ease(AppleMetrics.motionFast) }
  static var open: Animation { ease(AppleMetrics.motionDetailOpen) }
  static var close: Animation { ease(AppleMetrics.motionDetailClose) }
  static var menuOpen: Animation { ease(AppleMetrics.motionMenuOpen) }
  static var menuClose: Animation { ease(AppleMetrics.motionMenuClose) }
  static var deck: Animation { ease(AppleMetrics.motionDeckDuration) }
  static func blur(_ radius: CGFloat) -> AnyTransition {
    .modifier(active: TransitionBlur(radius: radius), identity: TransitionBlur(radius: 0))
  }

  /// Keyboard opens and closes menus, search and details at once (motion.md).
  static var keyboardDriven: Bool { Keyboard.focusVisible || NSApp?.currentEvent?.type == .keyDown }

  /// Runs `changes` without any animation, including ones inherited from a parent transaction.
  static func instantly(_ changes: () -> Void) {
    var transaction = Transaction(animation: nil)
    transaction.disablesAnimations = true
    withTransaction(transaction, changes)
  }

  /// Context chips move and fade independently; the remaining chips reflow in place.
  static var contextReveal: Animation { reveal(AppleMetrics.aiContextReflow) }
  static let context = AnyTransition.asymmetric(
    insertion: .opacity.animation(reveal(AppleMetrics.aiContextEnterFade))
      .combined(
        with: .offset(y: AppleMetrics.motionContextY).animation(
          reveal(AppleMetrics.aiContextEnterMove))),
    removal: .opacity.animation(reveal(AppleMetrics.aiContextExitFade))
      .combined(
        with: .offset(y: AppleMetrics.motionContextY).animation(
          reveal(AppleMetrics.aiContextExitMove))))

}

private struct TransitionBlur: ViewModifier {
  let radius: CGFloat
  func body(content: Content) -> some View { content.blur(radius: radius) }
}

/// Short content updates fade in with `fast`; a running fade continues from its current opacity.
struct ContentFade<Value: Equatable>: ViewModifier {
  let value: Value
  @State private var opacity = 1.0
  func body(content: Content) -> some View {
    content.opacity(opacity).onChange(of: value) {
      guard !Motion.keyboardDriven else {
        Motion.instantly { opacity = 1 }
        return
      }
      if opacity >= 1 { Motion.instantly { opacity = 0 } }
      withAnimation(Motion.fast) { opacity = 1 }
    }
  }
}

/// Samples presentation values without publishing view state on every frame. A new gesture
/// takes this value before replacing the old animation, so it cannot jump to its old target.
@MainActor final class DrawnValue { var value: CGFloat = 0 }

struct TrackDrawnValue: AnimatableModifier {
  nonisolated var value: CGFloat
  let drawn: DrawnValue
  nonisolated var animatableData: CGFloat {
    get { value }
    set { value = newValue }
  }
  func body(content: Content) -> some View {
    let _ = store()
    return content
  }
  private func store() { drawn.value = value }
}
