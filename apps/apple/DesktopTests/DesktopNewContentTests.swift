import Foundation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct DesktopNewContentTests {
  private func written(_ id: String) -> JSONValue {
    .object([
      "id": .string(id), "type": .string("note"), "title": .string("Written " + id),
      "summary": .string("Synthetic"), "time": .number(5),
    ])
  }

  private func arrive(_ id: String, _ workspace: Workspace, _ backend: FakeBackend) async {
    await backend.externalCard(written(id))
    workspace.refresh(quiet: true)
    await until { workspace.cards.contains { $0.id == id } }
  }

  @Test func cardsWrittenElsewhereWaitWhileAwayFromTheTop() async {
    let (workspace, backend) = await ready(["a", "b"])
    let feed = Feed(workspace: workspace)
    feed.refreshMembership()
    feed.recordScroll(200)
    await arrive("n", workspace, backend)
    feed.refreshMembership()
    #expect(feed.waiting == ["n"])
    #expect(!feed.entries.contains(.card("n")))
    feed.showWaiting()
    #expect(feed.waiting.isEmpty)
    #expect(feed.entries.first == .card("n"))
  }

  @Test func cardsWrittenElsewhereGoStraightToTheTopWhenAtTheTop() async {
    let (workspace, backend) = await ready(["a", "b"])
    let feed = Feed(workspace: workspace)
    feed.refreshMembership()
    feed.recordScroll(0)
    await arrive("n", workspace, backend)
    feed.refreshMembership()
    #expect(feed.waiting.isEmpty)
    #expect(feed.entries.first == .card("n"))
  }
}
