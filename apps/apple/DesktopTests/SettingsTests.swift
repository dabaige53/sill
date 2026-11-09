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

  // @wu-test type=integration | scope=Clear all cards | protects=Remove every card from the workspace and backend
  @Test func clearAllRemovesEveryCard() async throws {
    let (workspace, backend) = await ready()
    let marked = await withCheckedContinuation { continuation in
      workspace.change("a", ["read": .bool(true)]) { continuation.resume(returning: $0) }
    }
    #expect(marked)
    let cleared = await withCheckedContinuation { continuation in
      workspace.clearAll { continuation.resume(returning: $0) }
    }
    #expect(cleared)
    #expect(workspace.cards.isEmpty)
    let saved = try await backend.read()
    #expect(saved.cards.isEmpty)
    #expect(saved.items.isEmpty)
  }
}
