import AppKit
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
      .modifier(HandCursor())
  }
}

/// @design button-feedback
/// Pass press state only to the check mark, leaving task text and its hit target stationary.
private struct CheckPressedKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  var checkPressed: Bool {
    get { self[CheckPressedKey.self] }
    set { self[CheckPressedKey.self] = newValue }
  }
}

struct CheckPress: ButtonStyle {
  @Environment(\.isEnabled) private var enabled
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .environment(\.checkPressed, configuration.isPressed && enabled && !Motion.keyboardDriven)
  }
}

/// Web `.pill.primary`: immediate fill feedback with the shared press scale.
struct PrimaryPillStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    PrimaryPillBody(configuration: configuration)
  }
}

private struct PrimaryPillBody: View {
  let configuration: ButtonStyleConfiguration
  @Environment(\.isEnabled) private var enabled
  @State private var hovered = false
  var body: some View {
    let pressed = configuration.isPressed && enabled && !Motion.keyboardDriven
    configuration.label
      .brightness(
        enabled && (hovered || configuration.isPressed) ? AppleMetrics.pressBrightness - 1 : 0
      )
      .scaleEffect(pressed ? AppleMetrics.motionPressScale : 1)
      .animation(Motion.press, value: pressed)
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
/// In a settings row it has no padding (`.setting-row .text-link`).
struct TextLinkStyle: ButtonStyle {
  var warn = false
  var padded = true
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.sans(AppleMetrics.font13, .medium))
      .foregroundStyle(warn ? AppleColors.warning : AppleColors.accent)
      .padding(.vertical, padded ? AppleMetrics.space6 : 0)
      .padding(.horizontal, padded ? AppleMetrics.space2 : 0)
      .opacity(configuration.isPressed ? AppleMetrics.textLinkPressOpacity : 1)
      .contentShape(Rectangle())
  }
}

/// Button feedback shared by toolbar and navigation controls.
struct HandCursor: ViewModifier {
  @Environment(\.isEnabled) private var enabled
  @State private var inside = false
  func body(content: Content) -> some View {
    content
      .onHover { hovering in
        inside = hovering
        (hovering && enabled ? NSCursor.pointingHand : NSCursor.arrow).set()
      }
      .onChange(of: enabled) { _, value in
        if inside { (value ? NSCursor.pointingHand : NSCursor.arrow).set() }
      }
      .onDisappear { if inside { NSCursor.arrow.set() } }
  }
}
