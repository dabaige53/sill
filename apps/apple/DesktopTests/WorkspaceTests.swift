import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

/// Synthetic workspace in memory. Writes check the revision like the real stores.
private actor FakeBackend: WorkspaceBackend {
  nonisolated var isLocal: Bool { true }
  private(set) var revision = 1
  private var cards: [JSONValue]
  private var items: [String: JSONValue] = [:]
  private var seconds: Double = 0
  private var preferences: [String: JSONValue] = [:]
  private(set) var writes = 0
  private(set) var reads = 0
  private var failNext: (any Error)?
  private var delay: Duration = .zero

  init(ids: [String], extra: [JSONValue] = []) {
    cards =
      ids.map {
        .object([
          "id": .string($0), "type": .string("article"), "title": .string("Synthetic " + $0),
          "body": .array([.string("One"), .string("Two")]), "time": .number(1),
        ])
      } + extra
  }

  func failNextWrite(_ error: any Error) { failNext = error }
  func slowWrites(_ value: Duration) { delay = value }

  /// A change made elsewhere: the revision moves without this window knowing.
  func externalChange(_ id: String, _ values: [String: JSONValue]) {
    merge(id, values)
    revision += 1
  }

  func read() async throws -> Snapshot {
    reads += 1
    return try snapshot()
  }

  func apply(_ operations: [WorkspaceOperation], expectedRevision: Int) async throws -> Snapshot {
    writes += 1
    if delay != .zero { try await Task.sleep(for: delay) }
    if let error = failNext {
      failNext = nil
      throw error
    }
    guard expectedRevision == revision else { throw StoreError.conflict }
    for operation in operations {
      switch operation {
      case .itemPatch(let id, let values): merge(id, values)
      case .reading(let amount): seconds += Double(amount)
      case .upsert(let card, _): cards.append(card)
      case .delete(let id, _):
        cards.removeAll { $0["id"]?.string == id }
        items[id] = nil
      case .preferences(let values): preferences.merge(values) { $1 }
      }
    }
    revision += 1
    return try snapshot()
  }

  private func merge(_ id: String, _ values: [String: JSONValue]) {
    var item = items[id]?.object ?? [:]
    item.merge(values) { $1 }
    items[id] = .object(item)
  }

  private func snapshot() throws -> Snapshot {
    try Snapshot(
      json: .object([
        "revision": .number(Double(revision)),
        "state": .object([
          "cards": .array(cards), "items": .object(items), "preferences": .object(preferences),
          "seconds": .number(seconds),
        ]),
      ]))
  }
}

@MainActor private func until(_ condition: () -> Bool) async {
  for _ in 0..<400 where !condition() { try? await Task.sleep(for: .milliseconds(5)) }
}

/// True when reading `read` inside `track` registers a change after `act`.
private final class Flag: @unchecked Sendable { var value = false }

@MainActor private func watch(_ track: @escaping () -> Void) -> Flag {
  let flag = Flag()
  withObservationTracking(track) { flag.value = true }
  return flag
}

/// Runs `act` and tells whether anything `track` read changed.
@MainActor private func redraws(_ act: () -> Void, watching track: @escaping () -> Void) -> Bool {
  let flag = watch(track)
  act()
  return flag.value
}

private let syntheticTask: JSONValue = .object([
  "id": .string("task"), "type": .string("task"), "title": .string("Synthetic task"),
  "time": .number(1),
  "tasks": .array([
    .object(["id": .string("t1"), "text": .string("One"), "done": .bool(true)]),
    .object(["id": .string("t2"), "text": .string("Two"), "done": .bool(false)]),
  ]),
])

private let syntheticReminder: JSONValue = .object([
  "id": .string("reminder"), "type": .string("reminder"), "title": .string("Synthetic reminder"),
  "time": .number(1), "due": .number(2),
])

@MainActor private func ready(
  _ ids: [String] = ["a", "b", "c"], extra: [JSONValue] = []
) async -> (Workspace, FakeBackend) {
  let backend = FakeBackend(ids: ids, extra: extra)
  let workspace = Workspace(launch: LaunchOptions(dataDirectory: nil), autoload: false)
  workspace.connect(backend)
  await until { workspace.phase == .ready }
  return (workspace, backend)
}

@MainActor struct WorkspaceTests {
  @Test func writeOnOneCardDoesNotTouchOthers() async {
    let (workspace, _) = await ready()
    let a = workspace.state("a")
    let b = workspace.state("b")
    let version = workspace.catalogVersion
    let other = watch {
      _ = b.bookmarked
      _ = b.read
      _ = b.writing
    }
    let ownFired = redraws({ workspace.toggleBookmark("a") }, watching: { _ = a.bookmarked })
    #expect(ownFired)
    #expect(a.bookmarked)
    #expect(a.isWriting)
    #expect(!b.isWriting)
    await until { !a.isWriting }
    #expect(a.bookmarked)
    #expect(!other.value)
    #expect(workspace.catalogVersion == version)
  }

  @Test func cardLocksOnlyItself() async {
    let (workspace, backend) = await ready()
    await backend.slowWrites(.milliseconds(80))
    #expect(workspace.change("a", ["later": .bool(true)]))
    // The same card refuses a second locked write; another card is free.
    #expect(!workspace.change("a", ["later": .bool(false)]))
    #expect(workspace.change("b", ["later": .bool(true)]))
    await until { !workspace.state("a").isWriting && !workspace.state("b").isWriting }
    #expect(workspace.state("a").later)
    #expect(workspace.state("b").later)
    // Both writes were based on revision 1; the second moved to the first one's result.
    #expect(await backend.revision == 3)
  }

  @Test func failedWriteReturnsToStoredValue() async {
    let (workspace, backend) = await ready()
    await backend.failNextWrite(StoreError.invalidSnapshot)
    workspace.toggleBookmark("a")
    #expect(workspace.state("a").bookmarked)
    await until { !workspace.state("a").isWriting }
    #expect(!workspace.state("a").bookmarked)
    #expect(workspace.notice?.text == Copy.appleWriteError)
  }

  @Test func unknownResultIsCheckedNotRetried() async {
    let (workspace, backend) = await ready()
    let readsBefore = await backend.reads
    await backend.failNextWrite(StoreError.unknownWrite)
    workspace.toggleLater("a")
    await until { !workspace.state("a").isWriting }
    await until { workspace.queue.idle }
    #expect(await backend.writes == 1)
    #expect(await backend.reads > readsBefore)
    #expect(workspace.notice?.persistent == true)
  }

  @Test func changeMadeElsewhereSurfacesAsConflict() async {
    let (workspace, backend) = await ready()
    await backend.externalChange("b", ["read": .bool(true)])
    workspace.toggleBookmark("a")
    await until { !workspace.state("a").isWriting }
    await until { workspace.queue.idle && workspace.state("b").read }
    #expect(!workspace.state("a").bookmarked)
    #expect(workspace.notice?.text == Copy.appleConflict)
    // The check read the external change; nothing was overwritten.
    #expect(workspace.state("b").read)
    #expect(await backend.writes == 1)
  }

  @Test func backgroundRecordsDoNotRedraw() async {
    let (workspace, backend) = await ready()
    let a = workspace.state("a")
    let fired = redraws(
      {
        workspace.recorder.opened("a")
        workspace.recorder.read("a", progress: 0.4)
        workspace.recorder.readingSecond()
      },
      watching: {
        _ = a.read
        _ = a.progress
        _ = a.writing
        _ = workspace.catalogVersion
        _ = workspace.preferences
      })
    #expect(!fired)
    #expect(a.seen)
    #expect(a.liveProgress == 0.4)
    workspace.recorder.flush()
    await until { workspace.queue.idle && !workspace.recorder.hasRecords }
    await until { workspace.revision >= 3 }
    // Item records and reading time go in separate writes.
    #expect(await backend.writes == 2)
    #expect(workspace.seconds == 1)
  }

  @Test func readStaysHeldUntilReleased() async {
    let (workspace, _) = await ready()
    let a = workspace.state("a")
    a.holdReadAppearance()
    let fired = redraws(
      { workspace.change("a", ["read": .bool(true)], lock: false) }, watching: { _ = a.read })
    #expect(!fired)
    #expect(a.effectiveRead)
    await until { workspace.queue.idle }
    #expect(!a.read)
    a.releaseReadAppearance()
    #expect(a.read)
  }
}

@MainActor struct FeedTests {
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
}

struct LaunchOptionTests {
  @Test func acceptsOnlyAbsoluteDirectories() {
    #expect(
      LaunchOptions(arguments: ["Sill", "--data-directory", "/tmp/sill"]).dataDirectory?.path
        == "/tmp/sill")
    #expect(
      LaunchOptions(arguments: ["Sill", "--data-directory", "relative"]).dataDirectory == nil)
    #expect(LaunchOptions(arguments: ["Sill"]).dataDirectory == nil)
  }
}

@MainActor struct SettingsTests {
  @Test func linkBecomesArticleFromItsSite() throws {
    let card = try #require(Capture.card(from: "https://www.example.com/post/ 读这篇", now: 1))
    #expect(card["type"]?.string == "article")
    #expect(card["title"]?.string == "读这篇")
    #expect(card["sources"]?.array?.first?["name"]?.string == "example.com")
    let bare = try #require(Capture.card(from: "https://www.example.com/post/", now: 1))
    #expect(bare["title"]?.string == "example.com/post")
  }

  @Test func textBecomesNoteWithParagraphs() throws {
    let card = try #require(Capture.card(from: "第一行\n接着\n\n\n第二段", now: 1))
    #expect(card["type"]?.string == "note")
    #expect(card["title"]?.string == "第一行")
    #expect(card["body"]?.strings == ["第一行\n接着", "第二段"])
    #expect(Capture.card(from: "  \n ") == nil)
  }

  @Test func captureAddsCardAndSkipsDuplicate() async {
    let (workspace, _) = await ready()
    #expect(workspace.capture("新的想法") == .sent)
    await until { workspace.cards.count == 4 }
    #expect(workspace.cards.contains { $0.title == "新的想法" })
    #expect(workspace.notice?.text == Copy.text("web.app.4f060a8371c3"))
    #expect(workspace.capture("新的想法") == .duplicate)
  }

  @Test func timelyOffSortsByTime() async {
    let (workspace, _) = await ready()
    workspace.setPreference("floatTimely", .bool(false))
    await until { !workspace.preferences.floatTimely }
    #expect(workspace.preferences.feedSort == .time)
  }

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

@MainActor struct UndoTests {
  @Test func finishingTasksOffersUndo() async throws {
    let (workspace, _) = await ready(extra: [syntheticTask])
    let card = try #require(workspace.model("task"))
    workspace.toggleTask("task", task: "t2")
    let notice = try #require(workspace.notice)
    #expect(notice.text == Copy.text("web.app.58d2aeefaa41"))
    #expect(workspace.state("task").completed(card))
    notice.undo?()
    await until { workspace.queue.idle && !workspace.state("task").isWriting }
    #expect(!workspace.state("task").completed(card))
    #expect(workspace.state("task").tasks(of: card).filter(\.done).map(\.id) == ["t1"])
  }

  @Test func reminderUndoRestoresState() async throws {
    let (workspace, _) = await ready(extra: [syntheticReminder])
    workspace.changeReminder("reminder", .dismiss)
    #expect(workspace.state("reminder").dismissed)
    let notice = try #require(workspace.notice)
    #expect(notice.text == Copy.text("web.app.c9bb70bcaaa3"))
    notice.undo?()
    await until { workspace.queue.idle && !workspace.state("reminder").isWriting }
    #expect(!workspace.state("reminder").dismissed)
  }

  @Test func captureUndoRemovesTheCard() async throws {
    let (workspace, _) = await ready()
    workspace.capture("撤销这一条")
    await until { workspace.cards.count == 4 }
    let notice = try #require(workspace.notice)
    notice.undo?()
    await until { workspace.cards.count == 3 }
    #expect(!workspace.cards.contains { $0.title == "撤销这一条" })
  }
}

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

  @Test func batchMarkUndoRestoresEachCard() async throws {
    let (workspace, backend) = await ready()
    workspace.toggleBookmark("b")
    await until { workspace.queue.idle && !workspace.state("b").isWriting }
    let writes = await backend.writes
    workspace.mark(["a", "b", "c"], .bookmarked)
    #expect(["a", "b", "c"].allSatisfy { workspace.state($0).bookmarked })
    let notice = try #require(workspace.notice)
    #expect(
      notice.text
        == Copy.text("web.app.96e7ee93f3ba") + "3" + Copy.text("web.common.cardCountSuffix"))
    await until { workspace.queue.idle && !workspace.state("a").isWriting }
    #expect(await backend.writes == writes + 1)
    notice.undo?()
    await until { workspace.queue.idle && workspace.state("a").bookmarked == false }
    #expect(!workspace.state("a").bookmarked)
    #expect(workspace.state("b").bookmarked)
    #expect(!workspace.state("c").bookmarked)
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

@MainActor struct ArchiveTests {
  @Test func restoreReturnsCardToDeskWithUndo() async throws {
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
    let notice = try #require(workspace.notice)
    #expect(notice.text == Copy.text("web.app.fff336942d9b"))
    await until { workspace.queue.idle && !workspace.state("b").isWriting }
    notice.undo?()
    #expect(workspace.state("b").archived)
    #expect(!feed.cardOrder.contains("b"))
    #expect(feed.shelfCount == 1)
  }
}

@MainActor struct EditorTests {
  @Test func bulkSaveTagsAllAndNotesFirst() async {
    let (workspace, _) = await ready()
    let baseline = workspace.editBaseline(["a", "b"])
    let result = Box<Workspace.EditResult>()
    workspace.saveEdits(["a", "b"], tags: ["工作"], note: "只给第一张", baseline: baseline) {
      result.value = $0
    }
    await until { result.value != nil }
    #expect(result.value == .saved)
    #expect(workspace.state("a").personalTags == ["工作"])
    #expect(workspace.state("b").personalTags == ["工作"])
    #expect(workspace.state("a").tagsEdited && workspace.state("b").tagsEdited)
    #expect(workspace.state("a").note == "只给第一张")
    #expect(workspace.state("b").note.isEmpty)
    #expect(workspace.notice?.text == Copy.text("web.app.5fa0ce52b47e") || !workspace.isLocal)
  }

  @Test func changedBaselineIsAConflictAndWritesNothing() async {
    let (workspace, backend) = await ready()
    let baseline = workspace.editBaseline(["a"])
    workspace.change("a", ["note": .string("别处写的")])
    await until { workspace.queue.idle && !workspace.state("a").isWriting }
    let writes = await backend.writes
    let result = Box<Workspace.EditResult>()
    workspace.saveEdits(["a"], tags: [], note: "我的输入", baseline: baseline) { result.value = $0 }
    #expect(result.value == .conflict)
    #expect(workspace.state("a").note == "别处写的")
    #expect(await backend.writes == writes)
  }

  @Test func tagInputIsCleaned() {
    #expect(EditorPanel.clean("  #阅读 ") == "阅读")
    #expect(EditorPanel.clean(String(repeating: "长", count: 40)).count == 30)
    #expect(!EditorPanel.suggestions(card: nil, chosen: ["AI"]).contains("AI"))
  }
}

@MainActor final class Box<Value> {
  var value: Value?
}

@MainActor struct CapturePanelTests {
  @Test func nextEventIsTheSoonestWithinThreeHours() async {
    let now = Format.milliseconds()
    func event(_ id: String, start: Double, end: Double) -> JSONValue {
      .object([
        "id": .string(id), "type": .string("event"), "title": .string(id), "time": .number(1),
        "start": .number(start), "end": .number(end),
      ])
    }
    let (workspace, _) = await ready(
      [],
      extra: [
        event("later", start: now + 2 * 3_600_000, end: now + 3 * 3_600_000),
        event("soon", start: now + 600_000, end: now + 3_600_000),
        event("far", start: now + 5 * 3_600_000, end: now + 6 * 3_600_000),
        event("over", start: now - 7_200_000, end: now - 3_600_000),
      ])
    #expect(CapturePanel.nextEvent(workspace.cards, now: now)?.id == "soon")
  }
}
