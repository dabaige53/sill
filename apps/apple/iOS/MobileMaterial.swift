#if os(iOS)
  import SillKit
  import SwiftUI

  /// The Web shadow roles (`shadow`, `shadow-hover`, `shadow-sheet`, `shadow-float`, `shadow-glass`).
  struct MobileShadow: ViewModifier {
    enum Kind { case card, hover, sheet, floating, glass, more }
    let kind: Kind
    var visible = true
    @Environment(\.colorScheme) private var scheme
    private struct Layer {
      var y: Double = 0
      var blur: Double = 0
      var opacity: Double = 0
    }
    private var layers: (Layer, Layer) {
      let dark = scheme == .dark
      switch kind {
      case .card:
        return (
          .init(
            y: AppleMetrics.shadowCardNearY, blur: AppleMetrics.shadowCardNearBlur,
            opacity: dark ? AppleMetrics.shadowCardDarkOpacity : AppleMetrics.shadowCardNearOpacity),
          .init(
            y: AppleMetrics.shadowCardFarY, blur: AppleMetrics.shadowCardFarBlur,
            opacity: dark ? 0 : AppleMetrics.shadowCardFarOpacity)
        )
      case .hover:
        return (
          .init(
            y: dark ? AppleMetrics.shadowHoverDarkY : AppleMetrics.shadowHoverNearY,
            blur: dark ? AppleMetrics.shadowHoverDarkBlur : AppleMetrics.shadowHoverNearBlur,
            opacity: dark
              ? AppleMetrics.shadowHoverDarkOpacity : AppleMetrics.shadowHoverNearOpacity),
          .init(
            y: AppleMetrics.shadowHoverFarY, blur: AppleMetrics.shadowHoverFarBlur,
            opacity: dark ? 0 : AppleMetrics.shadowHoverFarOpacity)
        )
      case .sheet:
        return (
          .init(
            y: AppleMetrics.shadowSheetNearY, blur: AppleMetrics.shadowSheetNearBlur,
            opacity: dark ? 0 : AppleMetrics.shadowSheetNearOpacity),
          .init(
            y: AppleMetrics.shadowSheetFarY, blur: AppleMetrics.shadowSheetFarBlur,
            opacity: dark ? AppleMetrics.shadowSheetDarkOpacity : AppleMetrics.shadowSheetFarOpacity
          )
        )
      case .floating:
        return (
          .init(
            y: AppleMetrics.shadowFloatNearY, blur: AppleMetrics.shadowFloatNearBlur,
            opacity: dark
              ? AppleMetrics.shadowFloatDarkOpacity : AppleMetrics.shadowFloatNearOpacity),
          .init(
            y: AppleMetrics.shadowFloatFarY, blur: AppleMetrics.shadowFloatFarBlur,
            opacity: dark ? AppleMetrics.shadowFloatDarkOpacity : AppleMetrics.shadowFloatFarOpacity
          )
        )
      case .glass:
        return (
          .init(
            y: dark ? AppleMetrics.shadowGlassDarkNearY : AppleMetrics.shadowGlassNearY,
            blur: dark ? AppleMetrics.shadowGlassDarkNearBlur : AppleMetrics.shadowGlassNearBlur,
            opacity: dark
              ? AppleMetrics.shadowGlassDarkNearOpacity : AppleMetrics.shadowGlassNearOpacity),
          .init(
            y: dark ? AppleMetrics.shadowGlassDarkFarY : AppleMetrics.shadowGlassFarY,
            blur: dark ? AppleMetrics.shadowGlassDarkFarBlur : AppleMetrics.shadowGlassFarBlur,
            opacity: dark
              ? AppleMetrics.shadowGlassDarkFarOpacity : AppleMetrics.shadowGlassFarOpacity)
        )
      case .more:
        return (
          .init(
            y: AppleMetrics.shadowMoreY, blur: AppleMetrics.shadowMoreBlur,
            opacity: AppleMetrics.shadowMoreOpacity), .init()
        )
      }
    }
    func body(content: Content) -> some View {
      let (near, far) = layers
      let color = kind == .floating || kind == .glass ? AppleColors.floatShadow : Color.black
      // CSS blur radius is twice the Gaussian radius SwiftUI uses.
      content
        .shadow(color: color.opacity(visible ? near.opacity : 0), radius: near.blur / 2, y: near.y)
        .shadow(color: color.opacity(visible ? far.opacity : 0), radius: far.blur / 2, y: far.y)
    }
  }

  extension View {
    func mobileShadow(_ kind: MobileShadow.Kind, visible: Bool = true) -> some View {
      modifier(MobileShadow(kind: kind, visible: visible))
    }

    @ViewBuilder func mobileGlass<S: InsettableShape>(_ shape: S, interactive: Bool = false)
      -> some View
    {
      if #available(iOS 26.0, *) {
        self.glassEffect(.regular.interactive(interactive), in: shape)
      } else {
        self.background {
          shape.fill(AppleColors.glass)
            .background(.ultraThinMaterial, in: shape)
            .overlay(shape.strokeBorder(AppleColors.glassEdge, lineWidth: AppleMetrics.lineWidth))
            .overlay(
              shape.inset(by: -AppleMetrics.lineWidth / 2)
                .stroke(AppleColors.glassRim, lineWidth: AppleMetrics.lineWidth / 2)
            )
            .mobileShadow(.glass)
        }
      }
    }
  }
#endif
