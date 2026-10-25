#if os(iOS)
import SillKit
import SwiftUI

typealias MobileIcon = Icon

struct MobileIconButton: View {
  let icon: String
  let label: String
  let action: () -> Void

  init(_ icon: String, label: String, action: @escaping () -> Void) {
    self.icon = icon
    self.label = label
    self.action = action
  }

  var body: some View {
    Button(action: action) { MobileIcon(icon, size: AppleMetrics.space20) }
      .frame(minWidth: AppleMetrics.hitTarget, minHeight: AppleMetrics.hitTarget)
      .contentShape(Rectangle())
      .buttonStyle(.plain)
      .accessibilityLabel(label)
      .help(label)
  }
}

struct MobileButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: AppleMetrics.font16, weight: .semibold))
      .frame(maxWidth: .infinity, minHeight: AppleMetrics.hitTarget)
      .foregroundStyle(AppleColors.card)
      .background(AppleColors.primary, in: Capsule())
      .opacity(configuration.isPressed ? AppleMetrics.chromeRest : 1)
  }
}

struct MobilePill: View {
  let title: String
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: AppleMetrics.font14, weight: selected ? .semibold : .regular))
        .padding(.horizontal, AppleMetrics.pillPaddingX)
        .frame(minHeight: AppleMetrics.mobilePillHeight)
        .foregroundStyle(selected ? AppleColors.card : AppleColors.primary)
        .background(selected ? AppleColors.primary : AppleColors.card, in: Capsule())
        .overlay(Capsule().strokeBorder(AppleColors.lineCard, lineWidth: AppleMetrics.lineWidth))
    }
    .buttonStyle(.plain)
    .frame(minHeight: AppleMetrics.hitTarget)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

struct MobileEmpty: View {
  var search = false
  var capture: (() -> Void)?

  var body: some View {
    VStack(spacing: AppleMetrics.space16) {
      MobileIcon(search ? "search" : "note", size: AppleMetrics.space36)
      Text(Copy.text(search ? "apple.noResults" : "apple.emptyTitle"))
        .font(.system(size: AppleMetrics.font21, weight: .semibold))
      Text(Copy.text(search ? "apple.noResultsBody" : "mobile.empty.body"))
        .foregroundStyle(AppleColors.secondary)
      if let capture {
        Button(Copy.text("web.capture.title"), action: capture)
          .buttonStyle(MobileButtonStyle())
      }
    }
    .multilineTextAlignment(.center)
    .padding(AppleMetrics.space32)
    .frame(maxWidth: AppleMetrics.readerWidth)
    .frame(maxWidth: .infinity)
  }
}

struct MobileError: View {
  let workspace: MobileWorkspace
  var body: some View {
    if let error = workspace.error {
      VStack(alignment: .leading, spacing: AppleMetrics.space12) {
        Text(error).textSelection(.enabled)
        Button(Copy.text("mobile.refresh")) { Task { await workspace.refresh() } }
          .disabled(workspace.busy)
      }
      .padding(AppleMetrics.space16)
      .foregroundStyle(AppleColors.primary)
    }
  }
}
#endif
