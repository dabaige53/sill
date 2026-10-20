import SillKit
import SwiftUI

/// Stored preferences with the Web defaults (`DefaultPreferences`).
struct Preferences: Equatable, Sendable {
  enum Theme: String, Sendable { case system, light, dark }
  enum Density: String, Sendable { case compact, standard, roomy }
  enum Sort: String, Sendable { case priority, unread, time }
  enum NewHint: String, Sendable { case away, off }

  var theme = Theme.system
  var density = Density.standard
  var sort = Sort.priority
  var stack = true
  var fadeRead = true
  var collapseOnFinish = true
  var floatTimely = true
  var newHint = NewHint.away
  var aiLocal = true
  var singleKeyShortcuts = true
  var hiddenActions: Set<String> = []

  init() {}

  init(_ json: [String: JSONValue]) {
    theme = json["theme"]?.string.flatMap(Theme.init) ?? .system
    density = json["density"]?.string.flatMap(Density.init) ?? .standard
    sort = json["sort"]?.string.flatMap(Sort.init) ?? .priority
    stack = json["stack"]?.bool ?? true
    fadeRead = json["fadeRead"]?.bool ?? true
    collapseOnFinish = json["collapseOnFinish"]?.bool ?? true
    floatTimely = json["floatTimely"]?.bool ?? true
    newHint = json["newHint"]?.string.flatMap(NewHint.init) ?? .away
    aiLocal = json["aiLocal"]?.bool ?? true
    singleKeyShortcuts = json["singleKeyShortcuts"]?.bool ?? true
    hiddenActions = Set(json["hiddenActions"]?.strings ?? [])
  }

  /// Web `applyPreferences`: without "timely first" the desk is ordered by time alone.
  var feedSort: Sort { floatTimely ? sort : .time }

  var colorScheme: ColorScheme? {
    switch theme {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }

  /// Column widths per density (`col-min`, `col-ideal`, `col-max`).
  var columns: (min: CGFloat, ideal: CGFloat, max: CGFloat) {
    switch density {
    case .compact:
      (AppleMetrics.compactMinWidth, AppleMetrics.compactIdealWidth, AppleMetrics.compactMaxWidth)
    case .standard:
      (AppleMetrics.cardMinWidth, AppleMetrics.cardIdealWidth, AppleMetrics.cardMaxWidth)
    case .roomy:
      (AppleMetrics.roomyMinWidth, AppleMetrics.roomyIdealWidth, AppleMetrics.roomyMaxWidth)
    }
  }

  /// Compact summaries show two lines; the other densities three.
  var summaryLines: Int { density == .compact ? 2 : 3 }
}
