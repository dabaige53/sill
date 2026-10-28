import AppKit
import SillKit

/// Only placement is custom. NSCollectionView owns visibility, scrolling and item reuse.
/// @design feed-columns
@MainActor final class FeedCollectionLayout: NSCollectionViewLayout {
  var geometry = ColumnGeometry()
  var rows: [NativeFeed.Row] = []
  var topInset: CGFloat = 0
  var heights: [String: CGFloat] = [:]
  var assignments: [String: Int] = [:]
  private(set) var attributes: [NSCollectionViewLayoutAttributes] = []
  private var columns: [[NSCollectionViewLayoutAttributes]] = []
  private var size: CGSize = .zero
  private var dirty = true

  override func invalidateLayout() {
    dirty = true
    super.invalidateLayout()
  }

  override func prepare() {
    super.prepare()
    guard dirty, let collectionView else { return }
    dirty = false
    let count = max(1, geometry.columns)
    var bottoms = Array(repeating: topInset, count: count)
    let left = (collectionView.bounds.width - geometry.width) / 2 + geometry.inset
    attributes = []
    columns = Array(repeating: [], count: count)
    for (index, row) in rows.enumerated() {
      // Measuring a newly visible card may change its height, but must not move its neighbors
      // sideways during a scroll. Reassign columns only for a new ordering or column geometry.
      let column =
        assignments[row.id] ?? (bottoms.indices.min { bottoms[$0] < bottoms[$1] - 1 } ?? 0)
      assignments[row.id] = column
      let height = heights[row.id] ?? max(1, geometry.columnWidth)
      let fullWidth = row.isEmpty
      let y = fullWidth ? (bottoms.max() ?? topInset) : bottoms[column]
      let item = NSCollectionViewLayoutAttributes(forItemWith: IndexPath(item: index, section: 0))
      item.frame = CGRect(
        x: fullWidth ? left : left + CGFloat(column) * (geometry.columnWidth + geometry.gap),
        y: y, width: fullWidth ? geometry.width : geometry.columnWidth, height: height)
      attributes.append(item)
      columns[column].append(item)
      let bottom = y + height + geometry.gap + row.extraSpacing
      if fullWidth {
        bottoms = Array(repeating: bottom, count: count)
      } else {
        bottoms[column] = bottom
      }
    }
    size = CGSize(
      width: collectionView.bounds.width,
      height: max(topInset, (bottoms.max() ?? topInset) - geometry.gap) + AppleMetrics.feedBottom)
  }

  override var collectionViewContentSize: NSSize { size }

  override func layoutAttributesForItem(at indexPath: IndexPath)
    -> NSCollectionViewLayoutAttributes?
  {
    guard attributes.indices.contains(indexPath.item) else { return nil }
    return attributes[indexPath.item]
  }

  override func layoutAttributesForElements(in rect: NSRect) -> [NSCollectionViewLayoutAttributes] {
    // Search each column, then visit only intersecting items. No SwiftUI measurement on scroll.
    var visible: [NSCollectionViewLayoutAttributes] = []
    for column in columns {
      var low = 0
      var high = column.count
      while low < high {
        let middle = (low + high) / 2
        if column[middle].frame.maxY < rect.minY { low = middle + 1 } else { high = middle }
      }
      for item in column.dropFirst(low) {
        if item.frame.minY > rect.maxY { break }
        if item.frame.intersects(rect) { visible.append(item) }
      }
    }
    return visible
  }

  override func shouldInvalidateLayout(forBoundsChange newBounds: NSRect) -> Bool {
    newBounds.width != size.width
  }
}
