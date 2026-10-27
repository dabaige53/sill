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

private let syntheticMail: JSONValue = .object([
  "id": .string("m"), "type": .string("mail"), "title": .string("Synthetic mail"),
  "time": .number(1), "tags": .array([.string("Work")]),
])

/// Desktop search: the tab token, # conditions and type chips share the home filter.
@MainActor struct DesktopSearchTests {
  @Test func hashFragmentNeverFiltersTheText() {
    #expect(Feed.searchText("Synthetic #wo") == "Synthetic")
    #expect(Feed.hashFragment("Synthetic #wo") == "wo")
    #expect(Feed.hashFragment("Synthetic #") == "")
    #expect(Feed.hashFragment("Synthetic") == nil)
    #expect(Feed.hashFragment("a#b") == nil)
  }

  @Test func pickedHashOptionBecomesATokenAndLeavesTheText() async {
    let (workspace, _) = await ready(["a"], extra: [syntheticMail])
    let feed = Feed(workspace: workspace)
    feed.search("Synthetic #")
    #expect(feed.entries.count == 2)
    let options = feed.hashOptions("")
    #expect(
      options.map(\.value) == [.mark(.unread), .mark(.saved), .mark(.later), .tag("Work")])
    let rest = feed.pick(HashOption(value: .tag("Work")), in: "Synthetic #")
    #expect(rest == "Synthetic")
    #expect(feed.query == "Synthetic" && feed.tag == "Work")
    #expect(feed.entries == [.card("m")])
    #expect(!feed.hashOptions("").contains(HashOption(value: .tag("Work"))))
    // The tab's own status is already a token, so the list leaves it out.
    feed.select(.unread)
    #expect(!feed.hashOptions("").contains(HashOption(value: .mark(.unread))))
    feed.clearTokens()
    #expect(feed.tag == nil && feed.mark == nil && feed.scope == .all)
  }

  @Test func typeChipsListTypesWithResultsAndLeaveWithTheText() async {
    let (workspace, _) = await ready(["a"], extra: [syntheticMail])
    let feed = Feed(workspace: workspace)
    #expect(feed.kinds.isEmpty)
    feed.search("Synthetic")
    #expect(feed.kinds == [.article, .mail])
    feed.selectKind(.mail)
    #expect(feed.entries == [.card("m")])
    #expect(feed.kinds == [.article, .mail])
    feed.search("")
    #expect(feed.kind == nil && feed.kinds.isEmpty)
  }
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
  @Test func internalMarkdownCardLinkUsesExistingReaderStack() async throws {
    let (workspace, _) = await ready()
    let reader = Reader(workspace: workspace)
    reader.open("a")
    await Task.yield()
    let route = try #require(MarkdownText.cardRoute(URL(string: "http://127.0.0.1:4318/#card/b")!))
    reader.open(route.id, full: route.full)
    #expect(reader.layers.map(\.card) == ["a", "b"])
    reader.close()
    #expect(reader.top?.card == "a")
    #expect(MarkdownText.cardRoute(URL(string: "https://example.com/#card/b")!) == nil)
  }

  @Test func resizingKeepsTheLayerAndStartsAtItsDrawnSurface() async throws {
    let (workspace, _) = await ready()
    let reader = Reader(workspace: workspace)
    reader.open("a")
    await Task.yield()
    let layer = try #require(reader.top)
    let drawn = Reader.Surface(frame: CGRect(x: 300, y: 80, width: 560, height: 600), radius: 28)
    reader.surfaces["a"] = drawn
    reader.positions[layer.id] = 120
    reader.open("a", full: true)
    #expect(reader.top?.id == layer.id && reader.top?.full == true)
    #expect(reader.resizeSource == drawn && !reader.resizeShown)
    #expect(reader.positions[layer.id] == 120)
  }

  @Test func measuredEntryAndCancelledReveal() async throws {
    let (workspace, _) = await ready()
    let reader = Reader(workspace: workspace)
    reader.viewport = CGRect(x: 0, y: 0, width: 1200, height: 800)
    reader.cardFrames["a"] = CGRect(x: 24, y: 100, width: 280, height: 200)
    reader.open("a")
    #expect(reader.matching && !reader.shown && !reader.toolsShown)
    reader.geometryReady("b")
    #expect(!reader.shown)
    reader.geometryReady("a")
    #expect(reader.shown && reader.toolsShown)
    reader.closeAll()
    try await Task.sleep(for: .milliseconds(350))
    #expect(!reader.toolsShown && !reader.contentShown)
  }

  @Test func measuredEntryRevealsToolsWithSurfaceAndSurvivesReopening() async throws {
    let (workspace, _) = await ready()
    let reader = Reader(workspace: workspace)
    reader.viewport = CGRect(x: 0, y: 0, width: 1200, height: 800)
    reader.cardFrames["a"] = CGRect(x: 24, y: 100, width: 280, height: 200)
    reader.open("a")
    reader.geometryReady("a")
    try await Task.sleep(for: .milliseconds(350))
    #expect(reader.contentShown && reader.toolsShown && reader.shown)
    reader.closeAll()
    reader.open("a")
    // Without a mounted view SwiftUI may complete closure synchronously; a new mount measures again.
    if !reader.shown { reader.geometryReady("a") }
    #expect(reader.shown)
    try await Task.sleep(for: .milliseconds(350))
    #expect(reader.presented && reader.toolsShown)
  }

  @Test func anotherCardOpensWhileThePreviousOneIsReturning() async throws {
    let (workspace, _) = await ready()
    let reader = Reader(workspace: workspace)
    reader.viewport = CGRect(x: 0, y: 0, width: 1200, height: 800)
    reader.cardFrames["a"] = CGRect(x: 24, y: 100, width: 280, height: 200)
    reader.cardFrames["b"] = CGRect(x: 320, y: 100, width: 280, height: 200)
    reader.open("a")
    reader.geometryReady("a")
    try await Task.sleep(for: .milliseconds(350))
    reader.closeAll()
    #expect(!reader.shown)
    reader.open("b")
    if !reader.shown { reader.geometryReady("b") }
    #expect(reader.top?.card == "b")
    #expect(reader.layers.count == 1)
    #expect(!reader.returning)
    #expect(reader.matchedCard == "b")
  }

  /// A related card stacks over the open one: the overlay stays shown, so the desktop bars stay
  /// where they are, and the card below stays open under the new one.
  @Test func relatedCardStacksWithoutReturningTheBars() async throws {
    let (workspace, _) = await ready()
    let reader = Reader(workspace: workspace)
    reader.viewport = CGRect(x: 0, y: 0, width: 1200, height: 800)
    reader.cardFrames["a"] = CGRect(x: 24, y: 100, width: 280, height: 200)
    reader.open("a")
    reader.geometryReady("a")
    try await Task.sleep(for: .milliseconds(350))
    var changes: [Bool] = []
    reader.onShown = { changes.append($0) }
    let first = try #require(reader.top?.id)
    reader.open("b")
    #expect(reader.layers.count == 2 && reader.shown)
    reader.close()
    #expect(reader.layers.count == 1 && reader.top?.id == first)
    #expect(changes.isEmpty)
  }

  /// A layer with no card to grow from mounts first and is shown on the next turn, so its
  /// insertion and its fade never share one update.
  @Test func unmatchedLayerShowsOnTheNextTurn() async throws {
    let (workspace, _) = await ready()
    let reader = Reader(workspace: workspace)
    reader.viewport = CGRect(x: 0, y: 0, width: 1200, height: 800)
    reader.open("a")
    #expect(reader.presented && !reader.matching && !reader.shown)
    try await Task.sleep(for: .milliseconds(20))
    #expect(reader.shown && reader.contentShown && reader.toolsShown)
  }

  @Test func articleAndPhotoHeadsNameTheirDay() async throws {
    let (workspace, _) = await ready(
      [],
      extra: [
        .object([
          "id": .string("story"), "type": .string("article"), "title": .string("Story"),
          "time": .number(1), "publishedAt": .string("2026-10-18"),
          "sources": .array([.object(["name": .string("Feed"), "kind": .string("web")])]),
        ]),
        .object([
          "id": .string("trip"), "type": .string("photo"), "title": .string("Trip"),
          "time": .number(1), "takenAt": .string("2026-10-20"), "image": .string("coast"),
        ]),
      ])
    let now = try #require(Format.localDay("2026-10-21"))
    let story = try #require(workspace.model("story"))
    #expect(story.sourceLine(day: story.articleDate, now: now) == "Feed · 10/18")
    #expect(story.sourceLine == "Feed")
    let trip = try #require(workspace.model("trip"))
    let day = try #require(trip.takenDay)
    #expect(Format.shortDay(day, now: now) == Copy.text("web.primitives.0c184871f658"))
  }

  @Test func escapeClosesOnlyTheTopLayerAndPreservesSearch() async {
    let (workspace, _) = await ready()
    let reader = Reader(workspace: workspace)
    let panels = Panels()
    let shell = Shell()
    let interaction = DesktopInteraction(
      panels: panels, reader: reader, shell: shell, menu: CardMenu(workspace: workspace),
      drag: CardDrag())
    let feed = Feed(workspace: workspace)
    feed.search("Synthetic")
    shell.searchFocused = true
    reader.open("a")
    reader.open("b")
    for kind in [Panels.Kind.settings, .editor(["b"]), .archive, .capture] {
      panels.open(kind)
      #expect(interaction.dismiss())
      #expect(panels.kind == nil)
      #expect(reader.top?.card == "b")
      #expect(feed.query == "Synthetic")
    }
    #expect(interaction.dismiss())
    #expect(reader.top?.card == "a")
    #expect(feed.query == "Synthetic")
  }

  @Test func escapeClosesScopeMenuBeforeSearch() {
    let workspace = Workspace(launch: LaunchOptions(dataDirectory: nil), autoload: false)
    let shell = Shell()
    let panels = Panels()
    let reader = Reader(workspace: workspace)
    let interaction = DesktopInteraction(
      panels: panels, reader: reader, shell: shell, menu: CardMenu(workspace: workspace),
      drag: CardDrag())
    shell.searchFocused = true
    #expect(!interaction.dismiss())
    shell.menu.present()
    #expect(interaction.dismiss())
    #expect(!shell.menu.shown)
    #expect(shell.searchFocused)
  }

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
    #expect(workspace.notice?.isFailure == true)
    #expect(workspace.notice?.persistent == false)
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
    #expect(workspace.notice?.isFailure == true)
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

  @Test func delayedProgressDoesNotReplaceARefreshedValue() async throws {
    for newProgress in [1.0, 0.0] {
      let (workspace, backend) = await ready()
      await backend.externalChange("a", ["progress": .number(0.2)])
      workspace.refresh()
      await until { workspace.revision == 2 && workspace.queue.idle }
      workspace.recorder.read("a", progress: 0.4)
      await backend.externalChange(
        "a", ["progress": .number(newProgress), "read": .bool(newProgress == 1)])
      workspace.refresh()
      await until { workspace.revision == 3 && workspace.queue.idle }
      workspace.recorder.flush()
      await until { workspace.queue.idle }
      #expect(try await backend.read().items["a"]?["progress"] == .number(newProgress))
      #expect(!workspace.recorder.hasRecords)
    }
  }

  @Test func progressRecordedDuringItsOwnSaveStillFlushes() async throws {
    let (workspace, backend) = await ready()
    await backend.slowWrites(.milliseconds(20))
    workspace.recorder.read("a", progress: 0.4)
    workspace.recorder.flush()
    workspace.recorder.read("a", progress: 0.6)
    workspace.recorder.flush()
    await until { workspace.queue.idle && !workspace.recorder.hasRecords }
    #expect(try await backend.read().items["a"]?["progress"] == .number(0.6))
    #expect(await backend.writes == 2)
  }

  @Test func queuedProgressCannotReplaceAForegroundReadDecision() async throws {
    let (workspace, backend) = await ready()
    await backend.slowWrites(.milliseconds(20))
    workspace.recorder.read("a", progress: 0.4)
    workspace.setRead("a", true)
    workspace.recorder.flush()
    await until { workspace.queue.idle && workspace.revision == 2 }
    #expect(try await backend.read().items["a"]?["progress"] == .number(1))
    workspace.recorder.flush()
    await until { workspace.queue.idle }
    #expect(!workspace.recorder.hasRecords)
  }

  @Test func definiteReadingTimeFailureKeepsTheUnwrittenSeconds() async throws {
    let errors: [any Error] = [
      StoreError.unavailable(5), CloudWorkspaceError.service("rate_limited", 429),
      CloudWorkspaceError.service("unavailable", 503),
    ]
    for error in errors {
      let (workspace, backend) = await ready()
      for _ in 0..<5 { workspace.recorder.readingSecond() }
      await backend.failNextWrite(error)
      workspace.recorder.flush()
      await until { workspace.queue.idle }
      #expect(workspace.recorder.hasRecords)
      #expect(try await backend.read().json["state"]?["seconds"] == .number(0))
      workspace.recorder.flush()
      await until { workspace.seconds == 5 && workspace.queue.idle }
      #expect(!workspace.recorder.hasRecords)
      #expect(await backend.writes == 2)
    }
  }

  @Test func unknownReadingTimeResultIsCheckedWithoutSendingItAgain() async {
    let (workspace, backend) = await ready()
    workspace.recorder.readingSecond()
    await backend.failNextWrite(StoreError.unknownWrite)
    workspace.recorder.flush()
    await until { workspace.queue.idle }
    workspace.recorder.flush()
    #expect(await backend.writes == 1)
    #expect(await backend.reads > 1)
  }

  @Test func aReadResponseCannotAuthorizeAWritingDecisionFromTheOldScreen() async throws {
    let (workspace, backend) = await ready([], extra: [syntheticTask])
    await backend.externalChange("task", ["taskDone": .array([.string("t1"), .string("t2")])])
    workspace.queue.read { result in
      guard case .success(let snapshot) = result else { return }
      workspace.accept(snapshot)
      // The network version has advanced, but the queued diff has not reached the screen.
      workspace.toggleTask("task", task: "t1")
    }
    await until { workspace.queue.idle && !workspace.state("task").isWriting }
    #expect(try await backend.read().items["task"]?["taskDone"]?.strings == ["t1", "t2"])
    #expect(workspace.notice?.text == Copy.appleConflict)
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

  @Test func completionKeepsOrderUntilExplicitRefresh() async throws {
    var task = try #require(syntheticTask.object)
    task["due"] = .number(2)
    let (workspace, _) = await ready(
      (0..<45).map { "card\($0)" }, extra: [.object(task), syntheticReminder])
    let feed = Feed(workspace: workspace)
    feed.refreshMembership()
    let before = feed.cardOrder
    #expect(Array(before.prefix(2)) == ["task", "reminder"])
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
    workspace.capture("A newly saved card")
    await until { workspace.queue.idle && workspace.cards.count == 48 }
    #expect(Array(feed.cardOrder.prefix(2)) == ["task", "reminder"])
    feed.refreshMembership(reorder: true)
    #expect(!feed.cardOrder.prefix(2).contains("task"))
    #expect(!feed.cardOrder.prefix(2).contains("reminder"))
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

  @Test func textBecomesNoteWithMarkdownBody() throws {
    let card = try #require(Capture.card(from: "第一行\n接着\n\n\n第二段", now: 1))
    #expect(card["type"]?.string == "note")
    #expect(card["title"]?.string == "第一行")
    #expect(card["body"]?.string == "第一行\n接着\n\n\n第二段")
    #expect(Capture.card(from: "  \n ") == nil)
  }

  @Test func captureAddsCardAndSkipsDuplicate() async {
    let (workspace, _) = await ready()
    #expect(workspace.capture("新的想法") == .sent)
    await until { workspace.cards.count == 4 }
    #expect(workspace.cards.contains { $0.title == "新的想法" })
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

@MainActor struct ActionFeedbackTests {
  @Test func finishingTasksDoesNotShowNotice() async throws {
    let (workspace, _) = await ready(extra: [syntheticTask])
    let card = try #require(workspace.model("task"))
    workspace.toggleTask("task", task: "t2")
    await until { workspace.queue.idle && !workspace.state("task").isWriting }
    #expect(workspace.notice == nil)
    #expect(workspace.state("task").completed(card))
    workspace.toggleTask("task", task: "t2")
    #expect(!workspace.state("task").completed(card))
  }

  @Test func reminderDoesNotShowNotice() async throws {
    let (workspace, _) = await ready(extra: [syntheticReminder])
    workspace.changeReminder("reminder", .dismiss)
    await until { workspace.queue.idle && !workspace.state("reminder").isWriting }
    #expect(workspace.state("reminder").dismissed)
    #expect(workspace.notice == nil)
  }

  @Test func captureDoesNotShowSuccessNotice() async throws {
    let (workspace, _) = await ready()
    workspace.capture("记下这一条")
    await until { workspace.cards.count == 4 && workspace.queue.idle }
    #expect(workspace.notice == nil)
    #expect(workspace.cards.contains { $0.title == "记下这一条" })
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

@MainActor struct CalendarFileTests {
  @Test func eventBecomesOneEscapedVEvent() async throws {
    let (workspace, _) = await ready(
      [],
      extra: [
        .object([
          "id": .string("meet"), "type": .string("event"), "title": .string("周会, 产品;设计"),
          "time": .number(1), "start": .number(1_792_000_000_000),
          "end": .number(1_792_003_600_000), "location": .string("三楼"),
        ])
      ])
    let card = try #require(workspace.model("meet"))
    let text = try #require(CalendarFile.text(card, now: Date(timeIntervalSince1970: 0)))
    #expect(text.hasPrefix("BEGIN:VCALENDAR\r\n"))
    #expect(text.contains("UID:meet@sill.local\r\n"))
    #expect(text.contains("DTSTAMP:19700101T000000Z\r\n"))
    #expect(text.contains("SUMMARY:周会\\, 产品\\;设计\r\n"))
    #expect(text.contains("LOCATION:三楼\r\n"))
    #expect(text.hasSuffix("END:VCALENDAR\r\n"))
  }
}

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
