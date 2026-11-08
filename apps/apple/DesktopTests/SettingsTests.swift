import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct SettingsTests {

  // @wu-test type=behavior | scope=Feed sorting preferences | protects=Use time sorting when timely promotion is disabled
  @Test func timelyOffSortsByTime() async {
    let (workspace, _) = await ready()
    workspace.setPreference("floatTimely", .bool(false))
    await until { !workspace.preferences.floatTimely }
    #expect(workspace.preferences.feedSort == .time)
  }

  // @wu-test type=integration | scope=Clear all cards | protects=Remove every card from the workspace and backend | debt=D7
  @Test func clearAllRemovesEveryCard() async {
    let (workspace, backend) = await ready()
    workspace.setRead("a", true)
    await until { workspace.queue.idle }
    workspace.clearAll()
    await until { workspace.cards.isEmpty }
    #expect(workspace.cards.isEmpty)
    #expect(await backend.writes == 2)
  }
}
