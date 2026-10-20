import SillKit
import SwiftUI

struct ReaderProgress: View {
  @Environment(Workspace.self) private var model
  @Environment(\.controlActiveState) private var windowActivity
  let activity: ReaderActivity
  let card: Card
  let expanded: Bool

  var body: some View {
    Group {
      if expanded {
        ProgressView(value: activity.progress).progressViewStyle(.linear)
          .accessibilityLabel(Copy.text("web.primitives.8bf1d0b76278"))
      } else {
        Color.clear.frame(height: 0).accessibilityHidden(true)
      }
    }
    .task(id: Int(activity.progress * 100)) {
      let progress = activity.progress
      guard progress > 0, progress < 1, card.readable else { return }
      do { try await Task.sleep(for: .milliseconds(750)) } catch { return }
      guard windowActivity == .key, model.selected == card.id, !model.busy,
        model.items[card.id]?["read"]?.bool != true,
        progress > (model.items[card.id]?["progress"]?.number ?? 0) + 0.02
      else { return }
      model.patch([card.id], values: ["progress": .number(progress)])
    }
  }
}
