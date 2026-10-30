import AppKit
import SillKit
import SwiftUI

extension Font {
  /// System sans (`--font`).
  static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    .system(size: size, weight: weight)
  }
  /// Numbers use the rounded face with tabular digits (`.num`).
  static func number(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    .system(size: size, weight: weight, design: .rounded).monospacedDigit()
  }
}

/// CSS line-height as a ratio of the font size: the extra space SwiftUI adds between lines.
@MainActor enum LineHeight {
  private static var natural: [CGFloat: CGFloat] = [:]
  static func height(size: CGFloat) -> CGFloat {
    let base =
      natural[size]
      ?? {
        let value = NSLayoutManager().defaultLineHeight(for: .systemFont(ofSize: size))
        natural[size] = value
        return value
      }()
    return base
  }
  static func spacing(size: CGFloat, ratio: CGFloat) -> CGFloat {
    max(0, size * ratio - height(size: size))
  }
}

extension View {
  /// Font, CSS line-height and letter-spacing (em) in one place.
  func textStyle(
    _ size: CGFloat, _ weight: Font.Weight = .regular, leading: CGFloat? = nil,
    tracking: CGFloat = 0, number: Bool = false
  ) -> some View {
    modifier(
      ContentTextStyle(
        size: size, weight: weight, leading: leading, tracking: tracking, number: number))
  }
}

/// The Sill mark: sky above, a ledge, two cards resting on it (Web `sillIcon`).
struct BrandMark: View {
  var size: CGFloat = AppleMetrics.brandIcon
  var body: some View {
    let unit = size / AppleMetrics.brandArt
    let shape = RoundedRectangle(cornerRadius: AppleMetrics.brandIconRadius, style: .continuous)
    ZStack(alignment: .topLeading) {
      LinearGradient(
        stops: [
          .init(color: AppleColors.fixedBrandSky, location: 0),
          .init(color: AppleColors.fixedBrandSkyLight, location: AppleMetrics.brandSkyStop),
          .init(color: AppleColors.fixedBrandLedge, location: AppleMetrics.brandSkyStop),
          .init(color: AppleColors.fixedBrandLedgeDeep, location: 1),
        ], startPoint: .top, endPoint: .bottom)
      Rectangle().fill(AppleColors.fixedBrandSill)
        .frame(width: size, height: AppleMetrics.brandSillHeight * unit)
        .offset(y: AppleMetrics.brandSillY * unit)
      card(
        AppleMetrics.brandCardTallX, AppleMetrics.brandCardTallY, AppleMetrics.brandCardTallWidth,
        AppleMetrics.brandCardTallHeight, unit)
      card(
        AppleMetrics.brandCardShortX, AppleMetrics.brandCardShortY,
        AppleMetrics.brandCardShortWidth, AppleMetrics.brandCardShortHeight, unit)
      RoundedRectangle(cornerRadius: AppleMetrics.brandMarkRadius * unit)
        .fill(AppleColors.accentFill)
        .frame(
          width: AppleMetrics.brandMarkWidth * unit, height: AppleMetrics.brandMarkHeight * unit
        )
        .offset(x: AppleMetrics.brandMarkX * unit, y: AppleMetrics.brandMarkY * unit)
    }
    .frame(width: size, height: size)
    .clipShape(shape)
    .overlay(shape.stroke(AppleColors.fixedBlack5, lineWidth: AppleMetrics.lineWidth))
    .shadow(
      color: AppleColors.fixedBlack10, radius: AppleMetrics.brandIconShadowBlur / 2,
      y: AppleMetrics.brandIconShadowY
    )
    .accessibilityHidden(true)
  }

  private func card(
    _ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat, _ unit: CGFloat
  )
    -> some View
  {
    let shape = RoundedRectangle(cornerRadius: AppleMetrics.brandCardRadius * unit)
    return shape.fill(AppleColors.fixedWhite)
      .overlay(shape.stroke(AppleColors.fixedBlack6, lineWidth: unit))
      .frame(width: width * unit, height: height * unit)
      .offset(x: x * unit, y: y * unit)
  }
}

/// Cover images: the Web demo assets, fading in from their dominant color.
enum Cover {
  static func tone(_ name: String?) -> Color {
    switch name {
    case "architecture": AppleColors.fixedToneArchitecture
    case "coast": AppleColors.fixedToneCoast
    case "botanical": AppleColors.fixedToneBotanical
    case "mountain": AppleColors.fixedToneMountain
    default: AppleColors.surface
    }
  }

  @MainActor private static var cache: [String: NSImage] = [:]

  @MainActor static func image(_ name: String) -> NSImage? {
    if let image = cache[name] { return image }
    guard let url = AppResources.bundle.url(forResource: name, withExtension: "png"),
      let image = NSImage(contentsOf: url)
    else { return nil }
    cache[name] = image
    return image
  }
}

/// Avatar circle with the first character, tone chosen by the name (Web `avatarTone`).
struct Avatar: View {
  let name: String
  var size: CGFloat = AppleMetrics.avatarSize
  var body: some View {
    let tones = [
      AppleColors.fixedAvatar1, AppleColors.fixedAvatar2, AppleColors.fixedAvatar3,
      AppleColors.fixedAvatar4, AppleColors.fixedAvatar5, AppleColors.fixedAvatar6,
    ]
    let sum = name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
    Circle().fill(tones[sum % tones.count])
      .frame(width: size, height: size)
      .overlay(
        Text(String(name.prefix(1)))
          .font(
            .sans(
              size <= AppleMetrics.avatarStackSize
                ? AppleMetrics.avatarStackFont : AppleMetrics.font12, .semibold)
          )
          .foregroundStyle(AppleColors.fixedWhite)
      )
      .accessibilityHidden(true)
  }
}
