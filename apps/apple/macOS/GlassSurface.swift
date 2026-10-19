import AppKit
import SillKit
import SwiftUI

struct GlassSurface: ViewModifier {
  func body(content: Content) -> some View {
    content
      .background {
        NativeGlass().clipShape(Capsule()).overlay(Capsule().fill(AppleColors.glass))
      }

      .overlay(
        Capsule().strokeBorder(
          AppleColors.glassRim, lineWidth: 0.5)
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
