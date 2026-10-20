import SillKit
import SwiftUI

struct MasonryLayout: Layout {
  let columns: Int
  let spacing: CGFloat
  var maximumColumnWidth: CGFloat = .greatestFiniteMagnitude
  struct Cache {
    var width: CGFloat?
    var columns = 0
    var spacing: CGFloat = 0
    var maximumColumnWidth: CGFloat = 0
    var result: (points: [CGPoint], size: CGSize, width: CGFloat)?
  }
  func makeCache(subviews: Subviews) -> Cache { Cache() }
  func updateCache(_ cache: inout Cache, subviews: Subviews) { cache = Cache() }
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
    measured(proposal: proposal, subviews: subviews, cache: &cache).size
  }
  private func measured(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache)
    -> (points: [CGPoint], size: CGSize, width: CGFloat)
  {
    if cache.width == proposal.width, cache.columns == columns, cache.spacing == spacing,
      cache.maximumColumnWidth == maximumColumnWidth, let result = cache.result
    {
      return result
    }
    let result = positions(proposal: proposal, subviews: subviews)
    cache.width = proposal.width
    cache.columns = columns
    cache.spacing = spacing
    cache.maximumColumnWidth = maximumColumnWidth
    cache.result = result
    return result
  }
  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache
  ) {
    let result = measured(
      proposal: ProposedViewSize(width: bounds.width, height: nil), subviews: subviews,
      cache: &cache)
    for (index, point) in result.points.enumerated() {
      subviews[index].place(
        at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), anchor: .topLeading,
        proposal: ProposedViewSize(width: result.width, height: nil))
    }
  }
  private func positions(proposal: ProposedViewSize, subviews: Subviews) -> (
    points: [CGPoint], size: CGSize, width: CGFloat
  ) {
    let total = proposal.width ?? 0
    let count = max(1, columns)
    let width =
      count == 1
      ? total
      : min(maximumColumnWidth, max(0, (total - CGFloat(count - 1) * spacing) / CGFloat(count)))
    let inset = (total - CGFloat(count) * width - CGFloat(count - 1) * spacing) / 2
    var heights = Array(repeating: CGFloat.zero, count: count)
    var points: [CGPoint] = []
    for subview in subviews {
      let column = heights.indices.reduce(0) { heights[$1] < heights[$0] - 1 ? $1 : $0 }
      points.append(CGPoint(x: inset + CGFloat(column) * (width + spacing), y: heights[column]))
      heights[column] +=
        subview.sizeThatFits(ProposedViewSize(width: width, height: nil)).height + spacing
    }
    return (points, CGSize(width: total, height: max(0, (heights.max() ?? 0) - spacing)), width)
  }
}

/// The Layout commits the final size once. Only this drawing offset interpolates.
struct MasonryMotion: ViewModifier {
  var frozen = false
  @State private var target: CGPoint?
  @State private var offset = CGSize.zero
  @State private var rendered = CGSize.zero
  @State private var generation = 0
  func body(content: Content) -> some View {
    content.modifier(TranslationPresentation(position: offset) { rendered = $0 })
      .onGeometryChange(for: CGPoint.self) {
        $0.frame(in: .named("feed-layout")).origin
      } action: { point in
        guard let previous = target else {
          target = point
          return
        }
        guard previous != point else { return }
        target = point
        generation += 1
        var transaction = Transaction(animation: nil)
        transaction.disablesAnimations = true
        withTransaction(transaction) {
          offset = CGSize(
            width: rendered.width + previous.x - point.x,
            height: rendered.height + previous.y - point.y)
        }
      }
      .task(id: generation) {
        guard !frozen else { return }
        await Task.yield()
        guard !Task.isCancelled else { return }
        withAnimation(NativeMotion.ease(AppleMetrics.motionLayout)) { offset = .zero }
      }
      .onChange(of: frozen) { _, frozen in
        if !frozen {
          withAnimation(NativeMotion.ease(AppleMetrics.motionLayout)) { offset = .zero }
        }
      }
  }
}
