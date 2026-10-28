import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct SelectionTests {
  @Test func shiftExtendsInFeedOrder() async {
    let (workspace, _) = await ready(["a", "b", "c", "d"])
    let selection = Selection(workspace: workspace)
    let order = ["d", "c", "b", "a"]
    selection.select("c", order: order)
    selection.select("a", range: true, order: order)
    #expect(Set(selection.ids) == ["a", "b", "c"])
    #expect(workspace.state("b").selected)
    #expect(!workspace.state("d").selected)
    selection.select("b")
    #expect(!selection.contains("b"))
    selection.select("c", add: true)
    #expect(selection.contains("c"))
  }

  @Test func batchMarkDoesNotShowNotice() async throws {
    let (workspace, backend) = await ready()
    workspace.toggleBookmark("b")
    await until { workspace.queue.idle && !workspace.state("b").isWriting }
    let writes = await backend.writes
    workspace.mark(["a", "b", "c"], .bookmarked)
    #expect(["a", "b", "c"].allSatisfy { workspace.state($0).bookmarked })
    await until { workspace.queue.idle && !workspace.state("a").isWriting }
    #expect(await backend.writes == writes + 1)
    #expect(workspace.notice == nil)
  }

  @Test func dragHandsCardsOnlyWhenDroppedOnTarget() {
    let drag = CardDrag()
    drag.target = CGRect(x: 100, y: 500, width: 640, height: 60)
    drag.begin(["a", "b"], at: CGPoint(x: 50, y: 50))
    drag.move(to: CGPoint(x: 52, y: 52))
    #expect(!drag.moved)
    drag.move(to: CGPoint(x: 300, y: 520))
    #expect(drag.ready)
    #expect(drag.end(at: CGPoint(x: 300, y: 520)) == ["a", "b"])
    #expect(!drag.active)
    drag.begin(["a"], at: CGPoint(x: 50, y: 50))
    #expect(drag.end(at: CGPoint(x: 300, y: 200)) == nil)
    drag.begin(["a"], at: CGPoint(x: 50, y: 50))
    drag.move(to: CGPoint(x: 300, y: 520))
    drag.cancel()
    #expect(drag.end(at: CGPoint(x: 300, y: 520)) == nil)
  }
}
