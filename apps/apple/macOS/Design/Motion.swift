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
  static var reveal: Animation {
    .timingCurve(
      AppleMetrics.easeRevealX1, AppleMetrics.easeRevealY1,
      AppleMetrics.easeRevealX2, AppleMetrics.easeRevealY2, duration: AppleMetrics.motionReveal)
  }
  /// Release spring: mass 1, stiffness 600, damping 45; it inherits the release velocity.
  static func spring(velocity: Double = 0) -> Animation {
    .interpolatingSpring(
      mass: AppleMetrics.springMass, stiffness: AppleMetrics.springStiffness,
      damping: AppleMetrics.springDamping, initialVelocity: velocity)
  }

  static var card: Animation {
    .interpolatingSpring(
      mass: AppleMetrics.cardSpringMass, stiffness: AppleMetrics.cardSpringStiffness,
      damping: AppleMetrics.cardSpringDamping)
  }

  static var cardHandoff: Animation {
    .linear(duration: AppleMetrics.motionCardHandoffFade).delay(AppleMetrics.motionCardHandoffDelay)
  }

  /// Web `motion.cardReturn`: a fixed curve that ends exactly, so the live card takes over on time.
  static var cardReturn: Animation {
    .timingCurve(
      AppleMetrics.cardReturnX1, AppleMetrics.cardReturnY1,
      AppleMetrics.cardReturnX2, AppleMetrics.cardReturnY2,
      duration: AppleMetrics.motionCardReturn)
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

  /// Keyboard opens and closes menus, search and details at once (motion.md).
  static var keyboardDriven: Bool { NSApp?.currentEvent?.type == .keyDown }

  /// Runs `changes` without any animation, including ones inherited from a parent transaction.
  static func instantly(_ changes: () -> Void) {
    var transaction = Transaction(animation: nil)
    transaction.disablesAnimations = true
    withTransaction(transaction, changes)
  }

  /// AI context reference: 140ms fade and 4px rise in, 120ms fade out.
  static let context = AnyTransition.asymmetric(
    insertion: .opacity.combined(with: .offset(y: AppleMetrics.motionContextY))
      .animation(ease(AppleMetrics.motionFast)),
    removal: .opacity.animation(ease(AppleMetrics.motionPress)))
}

/// Short content updates fade in with `fast`; a running fade continues from its current opacity.
struct ContentFade<Value: Equatable>: ViewModifier {
  let value: Value
  @State private var opacity = 1.0
  func body(content: Content) -> some View {
    content.opacity(opacity).onChange(of: value) {
      if opacity >= 1 { Motion.instantly { opacity = 0 } }
      withAnimation(Motion.fast) { opacity = 1 }
    }
  }
}
