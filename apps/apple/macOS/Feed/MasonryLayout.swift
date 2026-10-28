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

/// Extra space a stack keeps below itself for its fanned edges.
struct StackSpacing: LayoutValueKey {
  static let defaultValue: CGFloat = 0
}

struct FeedItemID: LayoutValueKey { static let defaultValue = "" }

/// Shortest-column placement in feed order. Widths are fixed once; moving cards only translate.
struct MasonryLayout: Layout {
  let geometry: ColumnGeometry

  struct Cache {
    var frames: [CGRect] = []
    var height: CGFloat = 0
    var geometry: ColumnGeometry?
    var minimums: [String: CGFloat] = [:]
    var measuredWidth: CGFloat = 0

    mutating func height(_ measured: CGFloat, for id: String) -> CGFloat {
      let height = max(measured, minimums[id] ?? 0)
      if !id.isEmpty { minimums[id] = height }
      return height
    }
  }

  func makeCache(subviews: Subviews) -> Cache { Cache() }

  func updateCache(_ cache: inout Cache, subviews: Subviews) { cache.geometry = nil }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
    if cache.geometry != geometry || cache.frames.count != subviews.count {
      measure(subviews, &cache)
    }
    return CGSize(width: geometry.width, height: cache.height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache
  ) {
    if cache.geometry != geometry || cache.frames.count != subviews.count {
      measure(subviews, &cache)
    }
    for (index, subview) in subviews.enumerated() {
      let frame = cache.frames[index]
      subview.place(
        at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
        proposal: ProposedViewSize(width: frame.width, height: frame.height))
    }
  }

  private func measure(_ subviews: Subviews, _ cache: inout Cache) {
    if cache.measuredWidth != geometry.columnWidth {
      cache.minimums.removeAll()
      cache.measuredWidth = geometry.columnWidth
    }
    let ids = Set(subviews.map { $0[FeedItemID.self] })
    cache.minimums = cache.minimums.filter { ids.contains($0.key) }
    let columns = Swift.max(1, geometry.columns)
    var heights = Array(repeating: CGFloat(0), count: columns)
    var frames: [CGRect] = []
    frames.reserveCapacity(subviews.count)
    let proposal = ProposedViewSize(width: geometry.columnWidth, height: nil)
    for subview in subviews {
      var column = 0
      for index in 1..<columns where heights[index] < heights[column] - 1 { column = index }
      let id = subview[FeedItemID.self]
      let height = cache.height(subview.sizeThatFits(proposal).height, for: id)
      frames.append(
        CGRect(
          x: geometry.inset + CGFloat(column) * (geometry.columnWidth + geometry.gap),
          y: heights[column], width: geometry.columnWidth, height: height))
      heights[column] += height + geometry.gap + subview[StackSpacing.self]
    }
    cache.frames = frames
    cache.geometry = geometry
    cache.height = Swift.max(0, (heights.max() ?? 0) - geometry.gap)
  }
}
