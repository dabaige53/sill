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

/// Web `.toggle`: 51 × 31, with one owner for pointer clicks and drags.
struct SettingSwitch: View {
  let label: String
  let on: Bool
  var describedBy: String?
  @State private var drag: CGFloat?
  @State private var start: CGFloat = 0
  @State private var stretch: CGFloat = 0
  @State private var drawn = DrawnValue()
  let change: (Bool) -> Void
  @Environment(\.isEnabled) private var enabled
  @Environment(\.controlActiveState) private var active

  var body: some View {
    let progress =
      drag.map { min(1, max(0, start + $0 / max(1, AppleMetrics.toggleTravel - stretch))) }
      ?? (on ? 1.0 : 0.0)
    Button {
      if Motion.keyboardDriven {
        Motion.instantly { change(!on) }
      } else {
        withAnimation(
          .spring(
            duration: AppleMetrics.toggleSpringDuration, bounce: AppleMetrics.toggleSpringBounce)
        ) { change(!on) }
      }
    } label: {
      ToggleTrack(progress: progress, stretch: stretch, drawn: drawn)
    }
    .buttonStyle(.plain)
    .highPriorityGesture(
      DragGesture(minimumDistance: 0)
        .onChanged { value in
          guard enabled, active != .inactive else { return }
          if drag == nil {
            start = min(1, max(0, drawn.value))
            withAnimation(.spring(duration: AppleMetrics.toggleLeanDuration, bounce: 0)) {
              stretch = AppleMetrics.toggleStretch
            }
          }
          Motion.instantly {
            drag =
              abs(value.translation.width) < AppleMetrics.toggleSlop ? 0 : value.translation.width
          }
        }
        .onEnded { value in
          guard enabled, active != .inactive, drag != nil else { return }
          let next =
            abs(value.translation.width) < AppleMetrics.toggleSlop
            ? !on : progress >= 0.5
          withAnimation(
            .interpolatingSpring(
              duration: AppleMetrics.toggleSpringDuration, bounce: AppleMetrics.toggleSpringBounce,
              initialVelocity: value.velocity.width / AppleMetrics.toggleTravel)
          ) {
            drag = nil
            stretch = 0
            change(next)
          }
        }
    )
    .onChange(of: active) { _, value in
      if value == .inactive, drag != nil {
        withAnimation(
          .spring(
            duration: AppleMetrics.toggleSpringDuration, bounce: AppleMetrics.toggleSpringBounce)
        ) {
          drag = nil
          stretch = 0
        }
      }
    }
    .modifier(HandCursor())
    .opacity(enabled ? 1 : AppleMetrics.disabledOpacity)
    .accessibilityLabel(label)
    .accessibilityAddTraits(on ? [.isToggle, .isSelected] : .isToggle)
    .accessibilityHint(describedBy ?? "")
  }
}

/// Interpolate progress before computing the knob shape, including spring overshoot.
private struct ToggleTrack: View, Animatable {
  nonisolated var progress: CGFloat
  nonisolated var stretch: CGFloat
  let drawn: DrawnValue
  nonisolated var animatableData: AnimatablePair<CGFloat, CGFloat> {
    get { .init(progress, stretch) }
    set {
      progress = newValue.first
      stretch = newValue.second
    }
  }
  var body: some View {
    let _ = capture()
    let clamped = min(1, max(0, progress))
    let squash = min(
      max(-progress, progress - 1, 0) * AppleMetrics.toggleTravel, AppleMetrics.toggleSquash)
    let width = AppleMetrics.toggleKnob + stretch - squash
    Capsule().fill(AppleColors.toggleOff)
      .overlay(Capsule().fill(AppleColors.accentFill).opacity(clamped))
      .frame(width: AppleMetrics.toggleWidth, height: AppleMetrics.toggleHeight)
      .overlay(alignment: .leading) {
        Capsule().fill(AppleColors.fixedWhite)
          .frame(width: width, height: AppleMetrics.toggleKnob)
          .shadow(
            color: AppleColors.fixedBlack15, radius: AppleMetrics.toggleShadowBlur / 2,
            y: AppleMetrics.toggleShadowY
          )
          .padding(.leading, AppleMetrics.toggleInset)
          .offset(x: clamped * (AppleMetrics.toggleTravel - width + AppleMetrics.toggleKnob))
      }.contentShape(Capsule())
  }
  private func capture() { drawn.value = progress }
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
    let pressed = configuration.isPressed && enabled && !Motion.keyboardDriven
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
