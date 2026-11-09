import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct FeedTests {
  // @wu-test type=behavior | scope=Task preview | protects=Keep task rows stable when completion changes
  @Test func taskRowsStayInPlaceWhenCompletionChanges() async throws {
    let (workspace, _) = await ready([], extra: [syntheticTask])
    let card = try #require(workspace.model("task"))
    let state = workspace.state("task")
    let before = state.previewTasks(of: card).map(\.id)
    workspace.toggleTask("task", task: "t2")
    #expect(state.previewTasks(of: card).map(\.id) == before)
    await until { workspace.queue.idle }
    #expect(state.previewTasks(of: card).map(\.id) == before)
  }

  // @wu-test type=behavior | scope=Unread feed membership | protects=Keep a read card visible until membership refresh
  @Test func readingKeepsMembers() async {
    let (workspace, _) = await ready()
    let feed = Feed(workspace: workspace)
    feed.select(.unread)
    let before = feed.entries
    workspace.setRead("a", true)
    await until { workspace.queue.idle }
    #expect(feed.entries == before)
    feed.refreshMembership()
    #expect(!feed.entries.contains(.card("a")))
  }

  // @wu-test type=behavior | scope=Feed ordering | protects=Keep completed cards in place until explicit refresh | debt=flaky
  @Test func completionKeepsOrderUntilExplicitRefresh() async throws {
    var task = try #require(syntheticTask.object)
    task["due"] = .number(2)
    let (workspace, _) = await ready(
      (0..<45).map { "card\($0)" }, extra: [.object(task), syntheticReminder])
    let feed = Feed(workspace: workspace)
    feed.refreshMembership()
    let before = feed.cardOrder
    #expect(Array(before.prefix(2)) == ["task", "reminder"])
    workspace.toggleTask("task", task: "t1")
    await until { workspace.queue.idle }
    workspace.toggleTask("task", task: "t2")
    workspace.changeReminder("reminder", .complete)
    await until { workspace.queue.idle }
    #expect(feed.cardOrder == before)
    feed.loadMore()
    #expect(Array(feed.cardOrder.prefix(before.count)) == before)
    feed.select(.todo)
    #expect(feed.cardOrder == ["task", "reminder"])
    feed.select(.all)
    #expect(Array(feed.cardOrder.prefix(2)) == ["task", "reminder"])
    workspace.write([
      .upsert(
        card: .object([
          "id": .string("new"), "type": .string("note"), "title": .string("New card"),
          "time": .number(Format.milliseconds()), "body": .string("New card"),
        ]), before: .null)
    ])
    await until { workspace.queue.idle && workspace.cards.count == 48 }
    // An arrival goes above the cards in place; completed cards keep their order below it.
    #expect(Array(feed.cardOrder.prefix(3)) == ["new", "task", "reminder"])
    feed.refreshMembership(reorder: true)
    #expect(!feed.cardOrder.prefix(2).contains("task"))
    #expect(!feed.cardOrder.prefix(2).contains("reminder"))
  }

  // @wu-test type=behavior | scope=Feed pagination | protects=Load all cards across pages without premature termination
  @Test func pagesBy40() async {
    let (workspace, _) = await ready((0..<90).map { "card\($0)" })
    let feed = Feed(workspace: workspace)
    feed.refreshMembership()
    #expect(feed.entries.count == 40)
    #expect(feed.hasMore)
    feed.loadMore()
    feed.loadMore()
    #expect(feed.entries.count == 90)
    #expect(!feed.hasMore)
  }

  // @wu-test type=behavior | scope=Feed scope restoration | protects=Restore each scope's loaded cards and scroll position | debt=impl-detail
  @Test func scopesRestoreTheirOwnPageAndScrollPosition() async throws {
    let (workspace, _) = await ready((0..<90).map { "card\($0)" })
    let feed = Feed(workspace: workspace)
    feed.refreshMembership()
    feed.loadMore()
    feed.recordScroll(1400)

    feed.select(.unread)
    let unread = try #require(feed.scrollRequest)
    #expect(unread.offset == 0)
    #expect(feed.entries.count == 40)
    feed.restoredScroll(unread, at: 0)
    feed.recordScroll(360)

    feed.select(.all)
    let all = try #require(feed.scrollRequest)
    #expect(all.offset == 1400)
    #expect(feed.entries.count == 80)
    // The old document can report a clamped position before the new layout is ready.
    feed.recordScroll(20)
    feed.restoredScroll(unread, at: 20)
    #expect(feed.scrollRequest == all)
    feed.restoredScroll(all, at: 1400)
    feed.select(.unread)
    #expect(feed.scrollRequest?.offset == 360)
    #expect(feed.entries.count == 40)
  }

  // @wu-test type=behavior | scope=Feed filter changes | protects=Return filtered results to the top and first page | debt=impl-detail
  @Test func filterChangesResetThePageAndRequestItsTop() async throws {
    let (workspace, _) = await ready((0..<90).map { "card\($0)" })
    let feed = Feed(workspace: workspace)
    feed.refreshMembership()
    feed.loadMore()
    feed.recordScroll(1200)
    feed.search("Synthetic")
    let query = try #require(feed.scrollRequest)
    #expect(query.offset == 0)
    #expect(feed.entries.count == 40)
    feed.restoredScroll(query, at: 0)
    feed.loadMore()
    feed.recordScroll(900)
    feed.selectKind(.article)
    #expect(feed.scrollRequest?.offset == 0)
    #expect(feed.scrollRequest?.id != query.id)
    #expect(feed.entries.count == 40)

    feed.pick(HashOption(value: .mark(.unread)), in: "Synthetic #")
    let condition = try #require(feed.scrollRequest)
    feed.restoredScroll(condition, at: 0)
    feed.loadMore()
    feed.recordScroll(800)
    feed.removeMark()
    #expect(feed.scrollRequest?.offset == 0)
    #expect(feed.entries.count == 40)
  }

  // @wu-test type=behavior | scope=Feed return to top | protects=Keep active filters and loaded cards when returning to the top | debt=impl-detail
  @Test func returningToTopKeepsAllSearchConditionsAndLoadedCards() async throws {
    let (workspace, _) = await ready(["a"], extra: [syntheticMail])
    let feed = Feed(workspace: workspace)
    feed.select(.unread)
    feed.search("Synthetic")
    feed.selectKind(.mail)
    feed.pick(HashOption(value: .tag("Work")), in: "Synthetic #")
    feed.pick(HashOption(value: .mark(.unread)), in: "Synthetic #")
    let request = try #require(feed.scrollRequest)
    feed.restoredScroll(request, at: 0)
    feed.recordScroll(480)
    let entries = feed.entries

    feed.scrollToTop()
    #expect(feed.scrollRequest?.offset == 0)
    #expect(feed.scope == .unread)
    #expect(feed.query == "Synthetic")
    #expect(feed.kind == .mail)
    #expect(feed.mark == nil && feed.tag == "Work")
    #expect(feed.entries == entries)
  }
}
