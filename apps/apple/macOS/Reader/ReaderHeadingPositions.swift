import SwiftUI

/// Laid-out article blocks report their position inside the scroll viewport, keyed by block index.
struct ReaderHeadingPositions: PreferenceKey {
  static let defaultValue: [Int: CGFloat] = [:]
  static func reduce(value: inout [Int: CGFloat], nextValue: () -> [Int: CGFloat]) {
    value.merge(nextValue(), uniquingKeysWith: { _, next in next })
  }
}
