import SillKit
import SwiftUI

struct ReminderCompletion: View {
  @EnvironmentObject private var model: Workspace
  let card: Card
  var body: some View {
    Toggle(
      Copy.text(
        model.items[card.id]?["reminderDone"]?.bool == true
          ? "web.reminder.restore" : "web.done"),
      isOn: Binding(
        get: { model.items[card.id]?["reminderDone"]?.bool == true },
        set: { done in
          model.patch(
            [card.id],
            values: [
              "reminderDone": .bool(done), "dismissed": .bool(false), "snoozedUntil": .number(0),
            ])
        }
      )
    )
    .toggleStyle(.checkbox).labelsHidden().disabled(model.busy)
  }
}
