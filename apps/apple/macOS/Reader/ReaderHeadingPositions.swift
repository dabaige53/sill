import SwiftUI

/// Headings report their position inside the article scroll viewport.
struct ReaderHeadingPositions: PreferenceKey {
  static let defaultValue: [Int: CGFloat] = [:]
  static func reduce(value: inout [Int: CGFloat], nextValue: () -> [Int: CGFloat]) {
    value.merge(nextValue(), uniquingKeysWith: { _, next in next })
  }
}
