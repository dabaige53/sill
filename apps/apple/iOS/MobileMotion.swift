import SillKit
import SwiftUI

/// The same timing curves and physical springs as the PWA and Mac renderer.
enum MobileMotion {
  static func ease(_ duration: Double) -> Animation {
    .timingCurve(
      AppleMetrics.easeX1, AppleMetrics.easeY1,
      AppleMetrics.easeX2, AppleMetrics.easeY2, duration: duration)
  }
  static var sheet: Animation {
    .timingCurve(
      AppleMetrics.easeSheetX1, AppleMetrics.easeSheetY1,
      AppleMetrics.easeSheetX2, AppleMetrics.easeSheetY2, duration: AppleMetrics.motionSheet)
  }
  static var reveal: Animation {
    .timingCurve(
      AppleMetrics.easeRevealX1, AppleMetrics.easeRevealY1,
      AppleMetrics.easeRevealX2, AppleMetrics.easeRevealY2, duration: AppleMetrics.motionReveal)
  }
  static func release(velocity: Double = 0) -> Animation {
    .interpolatingSpring(
      mass: AppleMetrics.springMass, stiffness: AppleMetrics.springStiffness,
      damping: AppleMetrics.springDamping, initialVelocity: velocity)
  }
  static var card: Animation {
    .interpolatingSpring(
      mass: AppleMetrics.cardSpringMass,
      stiffness: AppleMetrics.cardSpringStiffness, damping: AppleMetrics.cardSpringDamping)
  }
  static var expanded: Animation {
    .interpolatingSpring(
      mass: AppleMetrics.expandedSpringMass,
      stiffness: AppleMetrics.expandedSpringStiffness, damping: AppleMetrics.expandedSpringDamping)
  }
  static var press: Animation { ease(AppleMetrics.motionPress) }
  static var base: Animation { ease(AppleMetrics.motionBase) }
  static var fast: Animation { ease(AppleMetrics.motionFast) }
  static var state: Animation { ease(AppleMetrics.motionState) }
  static var read: Animation { ease(AppleMetrics.motionRead) }
  static var layout: Animation { ease(AppleMetrics.motionLayout) }
  static var stack: Animation { ease(AppleMetrics.motionDeckDuration) }
  static var tuck: Animation { ease(AppleMetrics.motionRailHide) }
  static var show: Animation { ease(AppleMetrics.motionRailShow) }
  static var menuOpen: Animation { ease(AppleMetrics.motionMenuOpen) }
  static var menuClose: Animation { ease(AppleMetrics.motionMenuClose) }
  static func cardEntry(index: Int) -> Animation {
    ease(AppleMetrics.motionDetailOpen)
      .delay(
        Double(min(max(0, index), Int(AppleMetrics.motionFirstCount) - 1))
          * AppleMetrics.motionStagger)
  }
  static func instantly(_ changes: () -> Void) {
    var transaction = Transaction(animation: nil)
    transaction.disablesAnimations = true
    withTransaction(transaction, changes)
  }
}
