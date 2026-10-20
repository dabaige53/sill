import SillKit
import SwiftUI

/// Web color and shadow roles, with the platform supplying backdrop sampling only.
struct GlassSurface: ViewModifier {
  func body(content: Content) -> some View {
    content.background {
      Capsule().fill(AppleColors.glass)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(AppleColors.glassEdge, lineWidth: AppleMetrics.lineWidth))
        .modifier(NativeShadow(kind: .glass))
    }
  }
}
