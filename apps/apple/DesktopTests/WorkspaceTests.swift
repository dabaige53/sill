import Foundation
import Observation
import Testing

@testable import Sill
@testable import SillKit

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
    #expect(reader.contentShown, "resizing must not insert an empty content frame")
    let midFlight = Reader.Surface(
      frame: CGRect(x: 100, y: 30, width: 900, height: 720), radius: 12)
    reader.surfaces["a"] = midFlight
    reader.open("a", full: false)
    #expect(reader.top?.id == layer.id && reader.top?.full == false)
    #expect(reader.resizeSource == midFlight)
    #expect(reader.contentShown && reader.positions[layer.id] == 120)
  }

  @Test func shortReadingContentStillOffersFullPage() async throws {
    let (workspace, _) = await ready()
    let card = try #require(workspace.model("a"))
    #expect(Reader.canExpand(card))
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
          "time": .number(1), "publishedAt": .string("2026-10-20"),
          "images": .array([.string("coast")]),
        ]),
      ])
    let now = try #require(Format.localDay("2026-10-21"))
    let story = try #require(workspace.model("story"))
    #expect(story.sourceLine(day: story.articleDate, now: now) == "Feed · 10/18")
    #expect(story.sourceLine == "Feed")
    let trip = try #require(workspace.model("trip"))
    let day = try #require(trip.publishedDay)
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
    for kind in [Panels.Kind.settings, .editor(["b"]), .archive] {
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
