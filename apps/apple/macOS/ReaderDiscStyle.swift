import SillKit
import SwiftUI

struct ReaderDiscStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View { Disc(configuration: configuration) }
  private struct Disc: View {
    let configuration: ButtonStyleConfiguration
    @State private var hovered = false
    var body: some View {
      configuration.label.font(.system(size: AppleMetrics.font18))
        .frame(width: AppleMetrics.space36, height: AppleMetrics.space36)
        .background {
          Circle().fill(hovered ? AppleColors.surface : AppleColors.card)
            .overlay(
              Circle().strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.readerButtonLine)
            )
            .modifier(NativeShadow(kind: .floating))
        }
        .frame(width: AppleMetrics.hitTarget, height: AppleMetrics.hitTarget)
        .contentShape(Circle()).foregroundStyle(AppleColors.primary)
        .scaleEffect(configuration.isPressed ? AppleMetrics.motionPressScale : 1)
        .animation(NativeMotion.ease(AppleMetrics.motionPress), value: configuration.isPressed)
        .onHover { hovered = $0 }
        .animation(NativeMotion.ease(AppleMetrics.motionHover), value: hovered)
    }
  }
}
