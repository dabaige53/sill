import SwiftUI

struct MasonryLayout: Layout {
  let columns: Int
  let spacing: CGFloat
  var maximumColumnWidth: CGFloat = .greatestFiniteMagnitude
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    positions(proposal: proposal, subviews: subviews).size
  }
  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let result = positions(
      proposal: ProposedViewSize(width: bounds.width, height: nil), subviews: subviews)
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
