#if os(iOS)
  import SillKit
  import SwiftUI

  /// Shared phone settings controls use the same rows, tracks and switch travel as the Web.
  struct MobileSettingCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
      VStack(spacing: 0) { content }
        .padding(.horizontal, AppleMetrics.space16)
        .background(
          AppleColors.card, in: RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius)
        )
        .overlay(
          RoundedRectangle(cornerRadius: AppleMetrics.settingsRadius)
            .strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth / 2))
    }
  }

  struct MobileSettingRow<Content: View>: View {
    let label: String
    var example: String? = nil
    var first = false
    @ViewBuilder var content: Content
    var body: some View {
      ViewThatFits(in: .horizontal) {
        HStack(spacing: AppleMetrics.space16) {
          caption
          Spacer(minLength: 0)
          content.fixedSize(horizontal: true, vertical: false)
        }
        VStack(alignment: .leading, spacing: AppleMetrics.space8) {
          caption
          content
        }
      }
      .font(.system(size: AppleMetrics.font14))
      .padding(.vertical, AppleMetrics.space8)
      .frame(maxWidth: .infinity, minHeight: AppleMetrics.settingsRowHeight, alignment: .leading)
      .overlay(alignment: .top) {
        if !first { Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth) }
      }
      .accessibilityElement(children: .contain)
    }
    private var caption: some View {
      VStack(alignment: .leading, spacing: AppleMetrics.space3) {
        Text(label).foregroundStyle(AppleColors.primary).fixedSize(
          horizontal: false, vertical: true)
        if let example {
          Text(example).font(.system(size: AppleMetrics.font12))
            .foregroundStyle(AppleColors.secondary).fixedSize(horizontal: false, vertical: true)
        }
      }
    }
  }

  struct MobileSettingSwitch: View {
    let label: String
    let on: Bool
    let change: (Bool) -> Void
    @Environment(\.isEnabled) private var enabled
    var body: some View {
      Button {
        change(!on)
      } label: {
        Capsule().fill(on ? AppleColors.accentFill : AppleColors.toggleOff)
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
              .animation(MobileMotion.press, value: on)
          }
          .frame(minHeight: AppleMetrics.hitTarget)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .opacity(enabled ? 1 : AppleMetrics.disabledOpacity)
      .accessibilityLabel(label)
      .accessibilityAddTraits(on ? [.isToggle, .isSelected] : .isToggle)
    }
  }

  struct MobileSettingSegmented: View {
    let label: String
    let options: [(String, String)]
    let selection: String
    let change: (String) -> Void
    var body: some View {
      HStack(spacing: 0) {
        ForEach(options.indices, id: \.self) { index in
          let option = options[index]
          Button {
            if option.0 != selection { change(option.0) }
          } label: {
            Text(option.1)
              .font(
                .system(
                  size: AppleMetrics.font13, weight: option.0 == selection ? .medium : .regular)
              )
              .foregroundStyle(option.0 == selection ? AppleColors.primary : AppleColors.secondary)
              .lineLimit(1)
              .padding(.horizontal, AppleMetrics.space12)
              .frame(minHeight: AppleMetrics.segmentedHeight)
          }
          .buttonStyle(MobileSettingSegmentStyle(selected: option.0 == selection))
          .accessibilityAddTraits(option.0 == selection ? [.isSelected] : [])
        }
      }
      .padding(AppleMetrics.space2)
      .background(
        AppleColors.surface, in: RoundedRectangle(cornerRadius: AppleMetrics.segmentedRadius)
      )
      .fixedSize(horizontal: true, vertical: false)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(label)
    }
  }

  struct MobileSettingSegmentStyle: ButtonStyle {
    let selected: Bool
    func makeBody(configuration: Configuration) -> some View {
      let shape = RoundedRectangle(cornerRadius: AppleMetrics.segmentedItemRadius)
      configuration.label.background {
        if selected {
          shape.fill(AppleColors.card)
            .shadow(
              color: AppleColors.fixedBlack10, radius: AppleMetrics.raisedShadowBlur / 2,
              y: AppleMetrics.raisedShadowY)
        } else if configuration.isPressed {
          shape.fill(AppleColors.faint)
        }
      }.contentShape(shape)
    }
  }

  struct MobileSettingAction: View {
    let title: String
    var destructive = false
    var first = false
    let action: () -> Void
    var body: some View {
      Button(action: action) {
        Text(title).font(.system(size: AppleMetrics.font14))
          .foregroundStyle(destructive ? AppleColors.error : AppleColors.accent)
          .frame(
            maxWidth: .infinity, minHeight: AppleMetrics.settingsRowHeight, alignment: .leading
          )
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .overlay(alignment: .top) {
        if !first { Rectangle().fill(AppleColors.line).frame(height: AppleMetrics.lineWidth) }
      }
    }
  }

  struct MobileSettingsHeader: View {
    let title: String
    var disabled = false
    let close: () -> Void
    var body: some View {
      HStack(spacing: AppleMetrics.space8) {
        MobileIconButton("chevron-left", label: Copy.text("web.back"), action: close)
          .disabled(disabled)
        Text(title).font(.system(size: AppleMetrics.font34, weight: .bold))
          .tracking(AppleMetrics.font34 * AppleMetrics.settingsTitleTracking)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
      }
      .foregroundStyle(AppleColors.primary)
      .frame(minHeight: AppleMetrics.railRow)
      .padding(.horizontal, AppleMetrics.space16)
      .padding(.top, AppleMetrics.space12)
    }
  }
  /// Chips wrap with their actual available width, including long user-provided labels.
  struct MobileFlowRow: Layout {
    var spacing: CGFloat = AppleMetrics.space6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
      let width = proposal.width ?? .infinity
      var x: CGFloat = 0
      var y: CGFloat = 0
      var height: CGFloat = 0
      var widest: CGFloat = 0
      for view in subviews {
        let ideal = view.sizeThatFits(.unspecified)
        let size = view.sizeThatFits(ProposedViewSize(width: min(ideal.width, width), height: nil))
        if x > 0, x + size.width > width {
          y += height + spacing
          x = 0
          height = 0
        }
        x += size.width + spacing
        height = max(height, size.height)
        widest = max(widest, x - spacing)
      }
      return CGSize(width: proposal.width ?? widest, height: y + height)
    }
    func placeSubviews(
      in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
    ) {
      var x = bounds.minX
      var y = bounds.minY
      var height: CGFloat = 0
      for view in subviews {
        let ideal = view.sizeThatFits(.unspecified)
        let size = view.sizeThatFits(
          ProposedViewSize(width: min(ideal.width, bounds.width), height: nil))
        if x > bounds.minX, x + size.width > bounds.maxX {
          y += height + spacing
          x = bounds.minX
          height = 0
        }
        view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
        x += size.width + spacing
        height = max(height, size.height)
      }
    }
  }
#endif
