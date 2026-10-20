import SillKit
import SwiftUI

/// Web `.icon-button` (and `.solid-button`): pressing scales the whole button to 0.97 in 120ms,
/// releasing returns it from where it is drawn. A disabled button does not move.
/// With `highlight`, hover and press also lay the `surface` circle under the icon (`:hover`,
/// `:active`); that color changes at once, only the scale is animated.
struct IconPress: ButtonStyle {
  var highlight = true
  func makeBody(configuration: Configuration) -> some View {
    IconPressBody(configuration: configuration, highlight: highlight)
  }
}

private struct IconPressBody: View {
  let configuration: ButtonStyleConfiguration
  let highlight: Bool
  @Environment(\.isEnabled) private var enabled
  @State private var hovered = false
  var body: some View {
    let pressed = configuration.isPressed && enabled
    configuration.label
      .background {
        Circle().fill(highlight && enabled && (hovered || pressed) ? AppleColors.surface : .clear)
          .transaction { $0.animation = nil }
      }
      .scaleEffect(pressed ? AppleMetrics.motionPressScale : 1)
      .animation(Motion.press, value: pressed)
      .onHover { hovered = $0 }
  }
}

/// Web `.pill.primary`: hover and press brighten the fill (`brightness(1.08)`), at once.
struct PrimaryPillStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    PrimaryPillBody(configuration: configuration)
  }
}

private struct PrimaryPillBody: View {
  let configuration: ButtonStyleConfiguration
  @State private var hovered = false
  var body: some View {
    configuration.label
      .brightness(hovered || configuration.isPressed ? AppleMetrics.pressBrightness - 1 : 0)
      .onHover { hovered = $0 }
  }
}

/// Web `button.ref`, `button.detail-row`: a row whose background darkens on hover and press.
struct RowStyle: ButtonStyle {
  var fill: Color = .clear
  var highlight: Color = AppleColors.faint
  var radius: CGFloat = AppleMetrics.refRadius
  func makeBody(configuration: Configuration) -> some View {
    RowBody(configuration: configuration, fill: fill, highlight: highlight, radius: radius)
  }
}

private struct RowBody: View {
  let configuration: ButtonStyleConfiguration
  let fill: Color
  let highlight: Color
  let radius: CGFloat
  @Environment(\.isEnabled) private var enabled
  @State private var hovered = false
  var body: some View {
    configuration.label
      .background(
        RoundedRectangle(cornerRadius: radius)
          .fill(enabled && (hovered || configuration.isPressed) ? highlight : fill)
      )
      .contentShape(Rectangle())
      .onHover { hovered = $0 }
  }
}

/// Web `.text-link`: accent words; pressing dims them to 0.6.
struct TextLinkStyle: ButtonStyle {
  var warn = false
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.sans(AppleMetrics.font13, .medium))
      .foregroundStyle(warn ? AppleColors.warning : AppleColors.accent)
      .padding(.vertical, AppleMetrics.space6).padding(.horizontal, AppleMetrics.space2)
      .opacity(configuration.isPressed ? AppleMetrics.textLinkPressOpacity : 1)
      .contentShape(Rectangle())
  }
}
