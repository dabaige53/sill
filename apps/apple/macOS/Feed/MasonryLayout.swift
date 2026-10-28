import SillKit
import SwiftUI

/// Web `columnGeometry`: the ideal column count, two while two minimum
/// columns still fit; three or more columns only at their ideal width.
/// @design feed-columns
struct ColumnGeometry: Equatable {
  var appearance = ContentAppearance()
  var paddingScale: CGFloat = 1
  var columns = 1
  var columnWidth: CGFloat = 0
  var gap: CGFloat = AppleMetrics.feedGap
  var inset: CGFloat = 0
  /// Width of the feed area (the window less its side margins).
  var width: CGFloat = 0

  init() {}

  init(width: CGFloat, preferences: Preferences) {
    appearance = preferences.cardAppearance
    paddingScale = preferences.cardPadding.scale
    let (min, ideal, _) = preferences.columns
    let baseGap =
      width < min * 2 + AppleMetrics.feedGap
      ? AppleMetrics.feedGapSmall
      : width < AppleMetrics.feedGapBreak ? AppleMetrics.feedGapMedium : AppleMetrics.feedGap
    let gap = baseGap * preferences.cardSpacing.scale
    let fits = Swift.max(1, Int(((width + gap) / (min + gap)).rounded(.down)))
    let columns = Swift.max(
      1,
      Swift.min(
        fits,
        Swift.max(Swift.min(2, fits), Int(((width + gap) / (ideal + gap)).rounded(.down)))))
    let columnWidth =
      columns == 1 ? width : (width - CGFloat(columns - 1) * gap) / CGFloat(columns)
    self.columns = columns
    self.columnWidth = Swift.max(0, columnWidth)
    self.gap = gap
    self.inset = (width - (CGFloat(columns) * columnWidth + CGFloat(columns - 1) * gap)) / 2
    self.width = width
  }

  /// The window width less the shared design margin on both sides.
  static func feedWidth(window: CGFloat) -> CGFloat {
    Swift.max(0, window - AppleMetrics.feedMargin * 2)
  }
}
