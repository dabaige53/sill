import AppKit
import SillKit
import SwiftUI

struct GlassSurface: ViewModifier {
  @EnvironmentObject var model: Workspace
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.colorSchemeContrast) private var contrast
  func body(content: Content) -> some View {
    content
      .background {
        if reduceTransparency || model.preferences["reduceTransparency"]?.bool == true {
          Capsule().fill(AppleColors.card)
        } else {
          NativeGlass().clipShape(Capsule()).overlay(
            Capsule().fill(contrast == .increased ? AppleColors.glassThick : AppleColors.glass))
        }
      }
      .overlay(
        Capsule().strokeBorder(
          contrast == .increased ? AppleColors.primary : AppleColors.glassRim, lineWidth: 0.5)
      )
      .overlay(
        Capsule().strokeBorder(
          LinearGradient(
            colors: [AppleColors.glassEdge, AppleColors.glassShade], startPoint: .topLeading,
            endPoint: .bottomTrailing), lineWidth: 0.5)
      )
      .shadow(
        color: AppleColors.shadow.opacity(AppleMetrics.shadowOpacity), radius: AppleMetrics.space16,
        y: AppleMetrics.space8)
  }
}

private struct NativeGlass: NSViewRepresentable {
  func makeNSView(context: Context) -> NSVisualEffectView {
    let view = NSVisualEffectView()
    view.material = .underWindowBackground
    view.blendingMode = .withinWindow
    view.state = .active
    return view
  }
  func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}
