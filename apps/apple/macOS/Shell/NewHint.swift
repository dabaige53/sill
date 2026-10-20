import SillKit
import SwiftUI

/// Due reminders waiting to come back to the desk (Web `pendingReminders`). Checked every
/// second, like Web `tick`; it changes only when the list does.
@MainActor @Observable final class NewContent {
  private(set) var reminders: [String] = []

  func check(_ workspace: Workspace) {
    guard workspace.phase == .ready else { return }
    let next = workspace.dueReminders()
    guard next != reminders else { return }
    let added = next.contains { !reminders.contains($0) }
    reminders = next
    if added {
      AccessibilityNotification.Announcement(
        Copy.text("web.app.a6815db95ff5") + "\(next.count)" + Copy.text("web.app.46f0aa3f3a96")
      ).post()
    }
  }
}

/// Web `#new-count` on the desktop: a glass capsule centered under the top bar, a bell for due
/// reminders, then ↑, the count and 「项新内容」. It stays while the top bar is tucked and steps
/// aside for a selection, a panel or the reader. It appears in 220ms and leaves in 180ms.
struct NewHint: View {
  let show: () -> Void
  @Environment(NewContent.self) private var content
  @Environment(Selection.self) private var selection
  @Environment(Panels.self) private var panels
  @Environment(Reader.self) private var reader

  var body: some View {
    let count = content.reminders.count
    let visible = count > 0 && !selection.active && panels.kind == nil && !reader.presented
    ZStack {
      if visible {
        Button(action: show) {
          HStack(spacing: AppleMetrics.space6) {
            Icon("bell", size: AppleMetrics.font12)
              .foregroundStyle(AppleColors.secondary)
              .frame(width: AppleMetrics.newSourceSize, height: AppleMetrics.newSourceSize)
              .background(Circle().fill(AppleColors.card))
              .overlay(Circle().strokeBorder(AppleColors.line, lineWidth: AppleMetrics.lineWidth))
              .padding(.trailing, AppleMetrics.space2)
            Icon("up", size: AppleMetrics.font14)
            Text("\(count)").font(.number(AppleMetrics.font13, .semibold))
            Text(Copy.text("web.newContent"))
          }
          .font(.sans(AppleMetrics.font13, .semibold))
          .foregroundStyle(AppleColors.primary)
          .padding(.leading, AppleMetrics.space8)
          .padding(.trailing, AppleMetrics.space16)
          .frame(height: AppleMetrics.newCountHeight)
          .glass(Capsule())
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          Copy.text("web.app.9ae8f7e3040d") + "0" + Copy.text("web.app.5b2f6ba24e42") + "\(count)"
            + Copy.text("web.app.099a1047b74a")
        )
        .transition(
          .asymmetric(
            insertion: .opacity.combined(with: .offset(y: AppleMetrics.motionVisibilityY))
              .animation(Motion.ease(AppleMetrics.motionBase)),
            removal: .opacity.combined(with: .offset(y: AppleMetrics.motionVisibilityY))
              .animation(Motion.ease(AppleMetrics.motionTuck))))
      }
    }
    .animation(
      Motion.ease(visible ? AppleMetrics.motionBase : AppleMetrics.motionTuck), value: visible
    )
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .padding(.top, AppleMetrics.space12 + AppleMetrics.space60 + AppleMetrics.space10)
  }
}
