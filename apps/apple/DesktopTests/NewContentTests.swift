import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct NewContentTests {
  @Test func dueReminderShowsOnceThenStaysShown() async {
    let (workspace, _) = await ready([], extra: [syntheticReminder])
    #expect(workspace.dueReminders() == ["reminder"])
    let content = NewContent()
    content.check(workspace)
    #expect(content.reminders == ["reminder"])
    let done = Flag()
    workspace.showReminders(content.reminders) { done.value = true }
    await until { done.value }
    content.check(workspace)
    #expect(content.reminders.isEmpty)
    // Even after the cooldown the same trigger time does not come back.
    #expect(workspace.dueReminders(now: Format.milliseconds() + 3_600_000).isEmpty)
  }
}
