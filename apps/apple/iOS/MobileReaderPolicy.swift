import Foundation
import SillKit

/// Gesture decisions are independent of rendering and network completion.
enum MobileReaderPolicy {
  enum Drag: Equatable { case none, handle, down, right, finish, edge }
  enum Release: Equatable { case restore, expand, collapse, close, awaitFinish }

  static func expandable(_ type: String) -> Bool {
    ["article", "mail", "note", "media", "digest"].contains(type)
  }

  static func readable(_ type: String) -> Bool {
    ["article", "mail", "note", "suggestion", "photo"].contains(type)
  }

  static func direction(
    x: Double, y: Double, atTop: Bool, atBottom: Bool,
    full: Bool, finishEnabled: Bool
  ) -> Drag {
    guard max(abs(x), abs(y)) >= AppleMetrics.dragStartDistance else { return .none }
    if full && x > abs(y) * AppleMetrics.mobileGestureDirectionRatio { return .right }
    guard abs(y) > abs(x) * AppleMetrics.mobileGestureDirectionRatio else { return .none }
    if atTop && y > 0 { return .down }
    if atBottom && y < 0 { return finishEnabled ? .finish : .edge }
    return .none
  }

  static func release(
    _ drag: Drag, distance: Double, velocity: Double, width: Double,
    cancelled: Bool, canExpand: Bool, committed: Bool
  ) -> Release {
    if committed { return .awaitFinish }
    guard !cancelled else { return .restore }
    let flick =
      distance > AppleMetrics.gestureFlickDistance
      && velocity > AppleMetrics.gestureFlickSpeed
    switch drag {
    case .handle:
      if distance >= AppleMetrics.mobileHandleDistance { return .close }
      if distance < -AppleMetrics.mobileHandleToggle && canExpand { return .expand }
      if distance > AppleMetrics.mobileHandleToggle { return .collapse }
    case .down:
      if distance >= AppleMetrics.gestureDismissDistance || flick { return .close }
    case .right:
      if distance > width * AppleMetrics.motionDeckTravel || flick { return .close }
    default: break
    }
    return .restore
  }

  static func ownActions(
    type: String, hasURL: Bool, hasMeeting: Bool, timely: Bool,
    dismissed: Bool, reminderDone: Bool, snoozed: Bool, hidden: Set<String>
  ) -> [String] {
    let reminder = ["task", "event", "reminder"].contains(type)
    let snooze: String? = reminder ? "snooze" : nil
    let dismiss: String? = reminder && !dismissed && !reminderDone && !snoozed ? "dismiss" : nil
    let values: [String?]
    switch type {
    case "photo": values = []
    case "mail": values = hasURL ? ["reply"] : []
    case "event":
      values =
        hasMeeting && timely
        ? ["join", snooze, dismiss, "download"] : [snooze, "download", dismiss]
    case "task", "reminder": values = [snooze, dismiss]
    default: values = hasURL ? ["open"] : []
    }
    return Array(values.compactMap { $0 }.filter { !hidden.contains($0) }.prefix(3))
  }
}

/// The latest 100ms of actual touch samples, in points per millisecond.
struct MobileReaderVelocity {
  private var samples: [(time: Double, value: Double)] = []
  mutating func feed(_ value: Double, at time: Double) {
    samples.append((time, value))
    samples.removeAll { time - $0.time > AppleMetrics.gestureVelocityWindow }
  }
  var value: Double {
    guard let first = samples.first, let last = samples.last, last.time > first.time else {
      return 0
    }
    return (last.value - first.value) / (last.time - first.time) / 1000
  }
}
