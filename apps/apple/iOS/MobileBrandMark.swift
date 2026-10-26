#if os(iOS)
  import SillKit
  import SwiftUI

  struct MobileBrandMark: View {
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

#endif
