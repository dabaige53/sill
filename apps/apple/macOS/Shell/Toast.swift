import SillKit
import SwiftUI

/// Web `#toast`: a glass capsule at the bottom right, one row above the AI box. A short notice
/// leaves after 3.2s; a persistent one (an unknown result being checked) stays until closed.
struct Toast: View {
  @Environment(Workspace.self) private var workspace

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      if let notice = workspace.notice {
        HStack(spacing: AppleMetrics.space8) {
          Text(notice.text)
            .font(.sans(AppleMetrics.font13))
            .foregroundStyle(AppleColors.primary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, AppleMetrics.space10)
            .padding(.trailing, notice.persistent ? 0 : AppleMetrics.space12)
          if notice.persistent {
            ToolButton(icon: "x", label: Copy.appleClose) { dismiss(notice) }
          }
        }
        .padding(.leading, AppleMetrics.space18)
        .padding(.trailing, AppleMetrics.space6)
        .frame(minHeight: AppleMetrics.hitTarget)
        .frame(maxWidth: AppleMetrics.toastMaxWidth, alignment: .leading)
        .glass(Capsule())
        .id(notice.id)
        .transition(.opacity.combined(with: .offset(y: AppleMetrics.motionToastTravel)))
        .task(id: notice.id) {
          guard !notice.persistent else { return }
          try? await Task.sleep(for: .seconds(AppleMetrics.toastDuration))
          guard !Task.isCancelled else { return }
          dismiss(notice)
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.updatesFrequently)
      }
    }
    .animation(Motion.state, value: workspace.notice)
    .padding(.trailing, AppleMetrics.railEdge)
    .padding(.bottom, AppleMetrics.railEdge + AppleMetrics.railRow + AppleMetrics.space12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
    .onChange(of: workspace.notice) { _, notice in
      if let notice { AccessibilityNotification.Announcement(notice.text).post() }
    }
  }

  private func dismiss(_ notice: Workspace.Notice) {
    if workspace.notice == notice { workspace.notice = nil }
  }
}
