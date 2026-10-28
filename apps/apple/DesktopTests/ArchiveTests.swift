import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct ArchiveTests {
  @Test func restoreReturnsCardToDeskWithoutNotice() async throws {
    let (workspace, _) = await ready()
    let feed = Feed(workspace: workspace)
    workspace.change("b", ["archived": .bool(true)])
    await until { workspace.queue.idle && !workspace.state("b").isWriting }
    feed.refreshMembership()
    #expect(feed.shelfCount == 1)
    #expect(!feed.cardOrder.contains("b"))
    #expect(ArchivePanel.groups(workspace: workspace, now: Format.milliseconds()).count == 1)

    workspace.restore("b") { feed.refreshMembership() }
    #expect(!workspace.state("b").archived)
    #expect(feed.cardOrder.contains("b"))
    #expect(feed.shelfCount == 0)
    await until { workspace.queue.idle && !workspace.state("b").isWriting }
    #expect(workspace.notice == nil)
  }
}
