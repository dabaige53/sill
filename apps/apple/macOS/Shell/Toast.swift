import AppKit
import SillKit
import SwiftUI

/// Web `#toast`: a glass capsule at the bottom right, one row above the AI box, over an open
/// detail too. It rises 8px in 180ms and leaves the same way in 140ms. An undoable notice stays
/// 5.5s and a plain one 3.2s of unattended time: the clock stops while the app is in the
/// background, the window is not key, the pointer is over it or focus is inside it. A persistent
/// notice stays until closed.
struct Toast: View {
  var hidden = false
  @Environment(Workspace.self) private var workspace

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      if let notice = workspace.notice, !hidden {
        ToastCapsule(notice: notice) { dismiss(notice) }
          .id(notice.id)
          .transition(
            .asymmetric(
              insertion: .opacity.combined(with: .offset(y: AppleMetrics.motionToastTravel))
                .animation(Motion.menuOpen),
              removal: .opacity.combined(with: .offset(y: AppleMetrics.motionToastTravel))
                .animation(Motion.fast)))
      }
    }
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

private struct ToastCapsule: View {
  let notice: Workspace.Notice
  let dismiss: () -> Void
  @Environment(\.controlActiveState) private var active
  @State private var hovered = false
  @State private var windowActive = true
  @FocusState private var focused: Bool

  var body: some View {
    HStack(spacing: AppleMetrics.space8) {
      Text(notice.text)
        .font(.sans(AppleMetrics.font13))
        .foregroundStyle(AppleColors.primary)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, AppleMetrics.space10)
        .padding(.trailing, notice.undo == nil && !notice.persistent ? AppleMetrics.space12 : 0)
      if let undo = notice.undo {
        Button(Copy.text("web.app.926a50b98ece")) {
          dismiss()
          undo()
        }
        .buttonStyle(TextLinkStyle(padded: false))
        .padding(.vertical, AppleMetrics.space10)
        .padding(.horizontal, AppleMetrics.space12)
        .focused($focused)
        .accessibilityLabel(Copy.text("web.app.493c9056731b"))
      } else if notice.persistent {
        ToolButton(icon: "x", label: Copy.text("web.close"), action: dismiss)
          .focused($focused)
      }
    }
    .padding(.leading, AppleMetrics.space18)
    .padding(.trailing, AppleMetrics.space6)
    .frame(minHeight: AppleMetrics.hitTarget)
    .frame(maxWidth: AppleMetrics.toastMaxWidth, alignment: .leading)
    .glass(Capsule())
    .onHover { hovered = $0 }
    .onChange(of: active, initial: true) { _, value in windowActive = value != .inactive }
    .task { await run() }
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(notice.persistent ? [] : .updatesFrequently)
  }

  /// Counts only unattended time, in 100ms steps.
  private func run() async {
    guard !notice.persistent else { return }
    var remaining = notice.undo == nil ? AppleMetrics.toastDuration : AppleMetrics.toastUndoDuration
    let step = 0.1
    while remaining > 0 {
      try? await Task.sleep(for: .seconds(step))
      guard !Task.isCancelled else { return }
      let paused = !NSApp.isActive || !windowActive || hovered || focused
      if !paused { remaining -= step }
    }
    dismiss()
  }
}
