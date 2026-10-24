import SillKit
import SwiftUI

/// Content-only type preferences; tools and settings keep their existing size.
struct ContentAppearance: Equatable {
  var scale: CGFloat = 1
  var leading: CGFloat = 1
  var strong = false

  func weight(_ value: Font.Weight) -> Font.Weight {
    guard strong else { return value }
    switch value {
    case .regular: return .medium
    case .medium: return .semibold
    case .semibold: return .bold
    default: return value
    }
  }
}

private struct ContentAppearanceKey: EnvironmentKey {
  static let defaultValue = ContentAppearance()
}
private struct CardPaddingScaleKey: EnvironmentKey {
  static let defaultValue: CGFloat = 1
}
extension EnvironmentValues {
  var contentAppearance: ContentAppearance {
    get { self[ContentAppearanceKey.self] }
    set { self[ContentAppearanceKey.self] = newValue }
  }
  var cardPaddingScale: CGFloat {
    get { self[CardPaddingScaleKey.self] }
    set { self[CardPaddingScaleKey.self] = newValue }
  }
}

struct ContentTextStyle: ViewModifier {
  let size: CGFloat
  let weight: Font.Weight
  let leading: CGFloat?
  let tracking: CGFloat
  let number: Bool
  @Environment(\.contentAppearance) private var appearance

  func body(content: Content) -> some View {
    let scaled = size * appearance.scale
    let weight = appearance.weight(weight)
    content
      .font(number ? .number(scaled, weight) : .sans(scaled, weight))
      .tracking(scaled * tracking)
      .lineSpacing(
        leading.map { LineHeight.spacing(size: scaled, ratio: $0 * appearance.leading) } ?? 0)
  }
}
