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

  init(ids: [String]) {
    cards = ids.map {
      .object([
        "id": .string($0), "type": .string("article"), "title": .string("Synthetic " + $0),
        "body": .array([.string("One"), .string("Two")]), "time": .number(1),
      ])
    }
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

@MainActor private func ready(_ ids: [String] = ["a", "b", "c"]) async -> (Workspace, FakeBackend) {
  let backend = FakeBackend(ids: ids)
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
