import SillKit
import SwiftUI

/// Stored preferences with the Web defaults (`DefaultPreferences`).
struct Preferences: Equatable, Sendable {
  enum Theme: String, Sendable { case system, light, dark }
  enum Density: String, Sendable { case compact, standard, roomy }
  enum Sort: String, Sendable { case priority, unread, time }
  enum NewHint: String, Sendable { case away, off }

  enum TextSize: String, Sendable {
    case small, standard, large
    var scale: CGFloat {
      switch self {
      case .small: AppleMetrics.layoutTextSmall
      case .standard: 1
      case .large: AppleMetrics.layoutTextLarge
      }
    }
  }
  enum Spacing: String, Sendable {
    case compact, standard, roomy
    var scale: CGFloat {
      switch self {
      case .compact: AppleMetrics.layoutSpaceCompact
      case .standard: 1
      case .roomy: AppleMetrics.layoutSpaceRoomy
      }
    }
    var leading: CGFloat {
      switch self {
      case .compact: AppleMetrics.layoutLineCompact
      case .standard: 1
      case .roomy: AppleMetrics.layoutLineRoomy
      }
    }
  }
  enum ReadingWidth: String, Sendable {
    case narrow, standard, full
    var width: CGFloat {
      switch self {
      case .narrow: AppleMetrics.layoutReaderNarrow
      case .standard: AppleMetrics.layoutReaderStandard
      case .full: .infinity
      }
    }
  }
  enum TextWeight: String, Sendable { case standard, strong }
  var cardTextSize = TextSize.standard
  var cardSpacing = Spacing.standard
  var cardPadding = Spacing.standard
  var readerTextSize = TextSize.standard
  var readerSpacing = Spacing.standard
  var readerWidth = ReadingWidth.full
  var textWeight = TextWeight.standard
  var cardAppearance: ContentAppearance {
    ContentAppearance(scale: cardTextSize.scale, strong: textWeight == .strong)
  }
  var readerAppearance: ContentAppearance {
    ContentAppearance(
      scale: readerTextSize.scale, leading: readerSpacing.leading, strong: textWeight == .strong)
  }

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
    cardTextSize = json["cardTextSize"]?.string.flatMap(TextSize.init) ?? .standard
    cardSpacing = json["cardSpacing"]?.string.flatMap(Spacing.init) ?? .standard
    cardPadding = json["cardPadding"]?.string.flatMap(Spacing.init) ?? .standard
    readerTextSize = json["readerTextSize"]?.string.flatMap(TextSize.init) ?? .standard
    readerSpacing = json["readerSpacing"]?.string.flatMap(Spacing.init) ?? .standard
    readerWidth = json["readerWidth"]?.string.flatMap(ReadingWidth.init) ?? .full
    textWeight = json["textWeight"]?.string.flatMap(TextWeight.init) ?? .standard
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

}
