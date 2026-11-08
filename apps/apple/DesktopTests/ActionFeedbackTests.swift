import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct ActionFeedbackTests {
  // @wu-test type=behavior | scope=Task completion feedback | protects=Complete and reopen tasks without an unnecessary notice
  @Test func finishingTasksDoesNotShowNotice() async throws {
    let (workspace, _) = await ready(extra: [syntheticTask])
    let card = try #require(workspace.model("task"))
    workspace.toggleTask("task", task: "t1")
    await until { workspace.queue.idle && !workspace.state("task").isWriting }
    workspace.toggleTask("task", task: "t2")
    await until { workspace.queue.idle && !workspace.state("task").isWriting }
    #expect(workspace.notice == nil)
    #expect(workspace.state("task").completed(card))
    workspace.toggleTask("task", task: "t2")
    #expect(!workspace.state("task").completed(card))
  }

  // @wu-test type=behavior | scope=Reminder dismissal feedback | protects=Dismiss a reminder without an unnecessary notice
  @Test func reminderDoesNotShowNotice() async throws {
    let (workspace, _) = await ready(extra: [syntheticReminder])
    workspace.changeReminder("reminder", .dismiss)
    await until { workspace.queue.idle && !workspace.state("reminder").isWriting }
    #expect(workspace.state("reminder").dismissed)
    #expect(workspace.notice == nil)
  }

}
