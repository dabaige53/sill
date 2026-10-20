import SillKit
import SwiftUI

struct NativeCheckStyle: ToggleStyle {
  var reminder = false
  func makeBody(configuration: Configuration) -> some View {
    Check(configuration: configuration, reminder: reminder)
  }
  private struct Check: View {
    let configuration: ToggleStyleConfiguration
    let reminder: Bool
    @State private var hovered = false
    var body: some View {
      Button {
        configuration.isOn.toggle()
      } label: {
        HStack(alignment: .top, spacing: AppleMetrics.space10) {
          ZStack {
            Circle().fill(configuration.isOn ? AppleColors.accentFill : .clear)
            Circle().strokeBorder(
              AppleColors.accent,
              lineWidth: reminder ? AppleMetrics.reminderDotLine : AppleMetrics.taskDotLine)
            NativeIcon(name: "check", size: AppleMetrics.font14)
              .foregroundStyle(AppleColors.fixedWhite).opacity(configuration.isOn ? 1 : 0)
          }
          .frame(
            width: reminder ? AppleMetrics.reminderDotSize : AppleMetrics.taskDotSize,
            height: reminder ? AppleMetrics.reminderDotSize : AppleMetrics.taskDotSize
          )
          .frame(
            width: reminder ? AppleMetrics.hitTarget : AppleMetrics.taskDotSize,
            height: reminder ? AppleMetrics.hitTarget : AppleMetrics.taskDotSize
          )
          .background(reminder && hovered ? AppleColors.accentSoft : .clear, in: Circle())
          if !reminder { configuration.label }
        }.frame(
          minHeight: reminder ? AppleMetrics.hitTarget : AppleMetrics.space32,
          alignment: .topLeading
        ).contentShape(Rectangle())
      }.buttonStyle(.plain)
        .onHover { hovered = $0 }
        .animation(NativeMotion.ease(AppleMetrics.motionHover), value: hovered)
        .animation(NativeMotion.ease(AppleMetrics.motionState), value: configuration.isOn)
        .accessibilityRepresentation {
          Toggle(isOn: configuration.$isOn) { configuration.label }.toggleStyle(.checkbox)
        }
    }
  }
}

struct NativeSwitchStyle: ToggleStyle {
  var labelVisible = true
  func makeBody(configuration: Configuration) -> some View {
    HStack {
      if labelVisible {
        configuration.label
        Spacer()
      }
      Button {
        configuration.isOn.toggle()
      } label: {
        Capsule().fill(configuration.isOn ? AppleColors.accentFill : AppleColors.toggleOff)
          .frame(width: AppleMetrics.toggleWidth, height: AppleMetrics.toggleHeight)
          .overlay(alignment: .leading) {
            Circle().fill(AppleColors.fixedWhite)
              .frame(width: AppleMetrics.toggleKnob, height: AppleMetrics.toggleKnob)
              .offset(
                x: AppleMetrics.toggleInset + (configuration.isOn ? AppleMetrics.toggleTravel : 0)
              )
              .animation(NativeMotion.ease(AppleMetrics.motionSwitch), value: configuration.isOn)
          }
      }.buttonStyle(.plain)
    }.accessibilityRepresentation {
      Toggle(isOn: configuration.$isOn) { configuration.label }.toggleStyle(.switch)
    }
  }
}
