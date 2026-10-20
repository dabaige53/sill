import SillKit
import SwiftUI

/// Web `.settings-card`: white, a 0.5px ring, 14 corners; rows inside are 16 from the sides.
struct SettingsCard<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View {
    VStack(spacing: 0) { content }
      .padding(.horizontal, AppleMetrics.space16)
      .background(
        RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius, style: .continuous)
          .fill(AppleColors.card)
          .overlay(
            RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius, style: .continuous)
              .strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth / 2))
      )
  }
}

/// Web `.setting-row` metrics: at least 48 high, 8 above and below, a 1px line above every row
/// but the first.
struct SettingLine<Content: View>: View {
  var first = false
  @ViewBuilder var content: Content
  var body: some View {
    HStack(spacing: AppleMetrics.space16) { content }
      .font(.sans(AppleMetrics.font14))
      .padding(.vertical, AppleMetrics.space8)
      .frame(maxWidth: .infinity, minHeight: AppleMetrics.settingsRowHeight, alignment: .leading)
      .overlay(alignment: .top) {
        if !first { Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth) }
      }
  }
}

/// Web `.setting-row`: label (and an optional example) on the left, the control on the right.
struct SettingRow<Side: View>: View {
  let label: String
  var example: String?
  var first = false
  @ViewBuilder var side: Side
  var body: some View {
    SettingLine(first: first) {
      VStack(alignment: .leading, spacing: AppleMetrics.space3) {
        Text(label).foregroundStyle(AppleColors.primary)
        if let example {
          Text(example)
            .textStyle(AppleMetrics.font12, leading: AppleMetrics.settingExampleLeading)
            .foregroundStyle(AppleColors.secondary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: AppleMetrics.space10) { side }
        .font(.sans(AppleMetrics.font13))
        .foregroundStyle(AppleColors.secondary)
    }
    .accessibilityElement(children: .contain)
  }
}

/// Web `.toggle`: 51 × 31; only the knob moves (20px, 120ms), the track color changes at once.
struct SettingSwitch: View {
  let label: String
  let on: Bool
  var describedBy: String?
  let change: (Bool) -> Void
  @Environment(\.isEnabled) private var enabled

  var body: some View {
    Button {
      change(!on)
    } label: {
      Capsule()
        .fill(on ? AppleColors.accentFill : AppleColors.toggleOff)
        .frame(width: AppleMetrics.toggleWidth, height: AppleMetrics.toggleHeight)
        .overlay(alignment: .leading) {
          Circle().fill(AppleColors.fixedWhite)
            .frame(width: AppleMetrics.toggleKnob, height: AppleMetrics.toggleKnob)
            .shadow(
              color: AppleColors.fixedBlack15, radius: AppleMetrics.toggleShadowBlur / 2,
              y: AppleMetrics.toggleShadowY
            )
            .padding(.leading, AppleMetrics.toggleInset)
            .offset(x: on ? AppleMetrics.toggleTravel : 0)
            .animation(Motion.press, value: on)
        }
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .opacity(enabled ? 1 : AppleMetrics.disabledOpacity)
    .accessibilityLabel(label)
    .accessibilityAddTraits(on ? [.isToggle, .isSelected] : .isToggle)
    .accessibilityHint(describedBy ?? "")
  }
}

/// Web `.segmented`: a surface track; the chosen one is a raised card, the others darken while
/// pressed.
struct SettingSegmented<Value: Hashable>: View {
  let label: String
  let options: [(Value, String)]
  let selection: Value
  let change: (Value) -> Void
  var body: some View {
    HStack(spacing: 0) {
      ForEach(options.indices, id: \.self) { index in
        let (value, title) = options[index]
        Button {
          if value != selection { change(value) }
        } label: {
          Text(title)
            .font(.sans(AppleMetrics.font13, value == selection ? .medium : .regular))
            .foregroundStyle(value == selection ? AppleColors.primary : AppleColors.secondary)
            .lineLimit(1)
            .padding(.horizontal, AppleMetrics.space12)
            .frame(minHeight: AppleMetrics.segmentedHeight)
        }
        .buttonStyle(SegmentStyle(on: value == selection))
        .accessibilityAddTraits(value == selection ? [.isButton, .isSelected] : .isButton)
      }
    }
    .padding(AppleMetrics.space2)
    .background(
      RoundedRectangle(cornerRadius: AppleMetrics.segmentedRadius, style: .continuous)
        .fill(AppleColors.surface)
    )
    .fixedSize()
    .accessibilityElement(children: .contain)
    .accessibilityLabel(label)
  }
}

private struct SegmentStyle: ButtonStyle {
  let on: Bool
  func makeBody(configuration: Configuration) -> some View {
    let shape = RoundedRectangle(cornerRadius: AppleMetrics.segmentedItemRadius, style: .continuous)
    configuration.label
      .background {
        if on {
          shape.fill(AppleColors.card)
            .shadow(
              color: AppleColors.fixedBlack10, radius: AppleMetrics.raisedShadowBlur / 2,
              y: AppleMetrics.raisedShadowY)
        } else if configuration.isPressed {
          shape.fill(AppleColors.faint)
        }
      }
      .contentShape(shape)
  }
}

/// Web `kbd`.
struct Kbd: View {
  let key: String
  var body: some View {
    Text(key)
      .font(.system(size: AppleMetrics.font12, weight: .medium, design: .rounded))
      .foregroundStyle(AppleColors.primary)
      .padding(.horizontal, AppleMetrics.space6)
      .frame(minWidth: AppleMetrics.space24, minHeight: AppleMetrics.space24)
      .background(
        RoundedRectangle(cornerRadius: AppleMetrics.kbdRadius).fill(AppleColors.surface))
  }
}

/// Web `.solid-button`: the one blue action; brighter on hover, scaled while pressed.
struct SolidButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    SolidButtonBody(configuration: configuration)
  }
}

private struct SolidButtonBody: View {
  let configuration: ButtonStyleConfiguration
  @Environment(\.isEnabled) private var enabled
  @State private var hovered = false
  var body: some View {
    let pressed = configuration.isPressed && enabled
    configuration.label
      .font(.sans(AppleMetrics.font14, .medium))
      .foregroundStyle(AppleColors.fixedWhite)
      .padding(.horizontal, AppleMetrics.space20)
      .frame(minHeight: AppleMetrics.hitTarget)
      .background(Capsule().fill(AppleColors.accentFill))
      .brightness(enabled && hovered ? AppleMetrics.pressBrightness - 1 : 0)
      .opacity(enabled ? 1 : AppleMetrics.disabledOpacity)
      .contentShape(Capsule())
      .scaleEffect(pressed ? AppleMetrics.motionPressScale : 1)
      .animation(Motion.press, value: pressed)
      .onHover { hovered = $0 }
  }
}
