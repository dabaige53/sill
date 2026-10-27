#if os(iOS)
  import SillKit
  import SwiftUI

  /// The same 120 ms, 0.97 press feedback as the Web and desktop controls.
  struct MobilePressStyle: ButtonStyle {
    var onPressBegan: (() -> Void)?
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
      let pressed = configuration.isPressed && enabled
      configuration.label
        .scaleEffect(pressed ? AppleMetrics.motionPressScale : 1)
        .animation(MobileMotion.press, value: pressed)
        .onChange(of: configuration.isPressed) { _, pressed in
          if pressed { onPressBegan?() }
        }
    }
  }

  /// An exclusive gesture makes a held tool describe itself without also invoking its action.
  struct MobileToolStyle: PrimitiveButtonStyle {
    let label: String
    var below = false
    func makeBody(configuration: Configuration) -> some View {
      MobileTool(configuration: configuration, label: label, below: below)
    }
  }

  private struct MobileTool: View {
    let configuration: PrimitiveButtonStyleConfiguration
    let label: String
    let below: Bool
    @Environment(\.isEnabled) private var enabled
    @GestureState private var held = false
    @State private var suppressAction = false

    var body: some View {
      let hold = LongPressGesture(
        minimumDuration: AppleMetrics.mobileTooltipDelay, maximumDistance: AppleMetrics.space10
      ).sequenced(before: DragGesture(minimumDistance: 0))
        .updating($held) { phase, held, _ in
          if case .second(true, _) = phase { held = true }
        }
        .onChanged { phase in
          if case .second(true, _) = phase { suppressAction = true }
        }
      Button {
        if enabled && !suppressAction { configuration.trigger() }
      } label: {
        configuration.label
      }
      .buttonStyle(MobilePressStyle(onPressBegan: { suppressAction = false }))
      .simultaneousGesture(hold)
      .overlay(alignment: below ? .bottom : .top) {
        if held && enabled {
          Text(label)
            .font(.system(size: AppleMetrics.font13, weight: .medium))
            .foregroundStyle(AppleColors.card)
            .lineLimit(1).fixedSize()
            .padding(.vertical, AppleMetrics.space6)
            .padding(.horizontal, AppleMetrics.space10)
            .background(
              AppleColors.primary, in: RoundedRectangle(cornerRadius: AppleMetrics.tipRadius)
            )
            .frame(height: 0, alignment: below ? .top : .bottom)
            .offset(y: below ? AppleMetrics.tipGap : -AppleMetrics.tipGap)
            .allowsHitTesting(false).accessibilityHidden(true)
        }
      }
      .accessibilityAction { if enabled { configuration.trigger() } }
    }
  }
#endif
