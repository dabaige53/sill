import SwiftUI

/// The search filters wrap and remain centered, as in the Web search page.
struct FlowLayout: Layout {
  var spacing: CGFloat
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = rows(width: proposal.width ?? 0, subviews: subviews)
    return CGSize(
      width: proposal.width ?? 0,
      height: max(0, rows.reduce(0) { $0 + $1.height + spacing } - spacing))
  }
  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var y = bounds.minY
    for row in rows(width: bounds.width, subviews: subviews) {
      var x = bounds.minX + (bounds.width - row.width) / 2
      for index in row.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(
          at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }
  private struct Row {
    var indices: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }
  private func rows(width: CGFloat, subviews: Subviews) -> [Row] {
    var result: [Row] = []
    var row = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      if !row.indices.isEmpty && row.width + spacing + size.width > width {
        result.append(row)
        row = Row()
      }
      row.width += (row.indices.isEmpty ? 0 : spacing) + size.width
      row.height = max(row.height, size.height)
      row.indices.append(index)
    }
    if !row.indices.isEmpty { result.append(row) }
    return result
  }
}
