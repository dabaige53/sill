import SillKit
import SwiftUI

/// The system owns the optics, contrast and inactive-window appearance.
struct GlassSurface: ViewModifier {
  func body(content: Content) -> some View {
    if #available(macOS 26.0, *) {
      content.glassEffect(.regular, in: Capsule())
    } else {
      content.background(.regularMaterial, in: Capsule())
    }
  }
}
