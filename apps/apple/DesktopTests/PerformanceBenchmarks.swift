import Foundation
import XCTest

@testable import Sill
@testable import SillKit

/// Official XCTest metrics, run separately from ordinary correctness tests.
@MainActor final class PerformanceBenchmarks: XCTestCase {
  @MainActor private func fixture(_ count: Int) async throws -> (Workspace, Feed) {
    let workspace = Workspace(launch: LaunchOptions(dataDirectory: nil), autoload: false)
    let cards: [JSONValue] = (0..<count).map { i in
      .object([
        "id": .string("perf-\(i)"), "type": .string("article"),
        "title": .string("Synthetic \(i)"),
        "body": .string(String(repeating: "Synthetic text ", count: 50)),
        "time": .number(Double(count - i)),
      ])
    }
    let snapshot = try Snapshot(
      json: .object([
        "revision": .number(1),
        "state": .object([
          "cards": .array(cards), "items": .object([:]), "preferences": .object([:]),
          "seconds": .number(0),
        ]),
      ]))
    await withCheckedContinuation { continuation in
      workspace.accept(snapshot) { continuation.resume() }
    }
    return (workspace, Feed(workspace: workspace))
  }

  func testSearch300() async throws { try await search(count: 300) }
  func testSearch3000() async throws { try await search(count: 3000) }
  func testReaderCommands300() async throws { try await readerCommands(count: 300) }
  func testReaderCommands3000() async throws { try await readerCommands(count: 3000) }
  func testScopeSwitch300() async throws { try await scopeSwitch(count: 300) }
  func testScopeSwitch3000() async throws { try await scopeSwitch(count: 3000) }

  private func requireBenchmark() throws {
    guard ProcessInfo.processInfo.environment["SILL_RUN_BENCHMARKS"] == "1" else {
      throw XCTSkip("Run through npm run perf:macos -- benchmark.")
    }
  }

  private func measureWork(setup: () -> Void = {}, work: () -> Void) {
    let options = XCTMeasureOptions()
    options.iterationCount = 10
    options.invocationOptions = [.manuallyStart, .manuallyStop]
    measure(metrics: [XCTClockMetric(), XCTCPUMetric(), XCTMemoryMetric()], options: options) {
      setup()
      startMeasuring()
      work()
      stopMeasuring()
    }
  }

  private func search(count: Int) async throws {
    try requireBenchmark()
    let (workspace, feed) = try await fixture(count)
    measureWork {
      for query in ["Synthetic", "299", "no-match", ""] { feed.search(query) }
    }
    XCTAssertEqual(workspace.cards.count, count)
    XCTAssertFalse(feed.entries.isEmpty)
  }

  /// Measures command handling, not animation completion, text layout or the deferred disk write.
  private func readerCommands(count: Int) async throws {
    try requireBenchmark()
    let (workspace, _) = try await fixture(count)
    let reader = Reader(workspace: workspace)
    var transitionsValid = true
    measureWork(
      setup: { transitionsValid = true },
      work: {
        for i in 0..<50 {
          reader.open("perf-\(i)")
          reader.toggleFull()
          transitionsValid = transitionsValid && reader.shown && reader.top?.full == true
          reader.open("perf-\(i + 1)")
          transitionsValid = transitionsValid && reader.top?.card == "perf-\(i + 1)"
          reader.close()  // Related layer returns to the original card.
          transitionsValid =
            transitionsValid && reader.top?.card == "perf-\(i)"
            && reader.top?.full == true
          reader.close()  // Root starts its exit; no rendered animation is awaited here.
          transitionsValid = transitionsValid && !reader.shown
        }
      })
    XCTAssertTrue(transitionsValid)
    XCTAssertFalse(reader.shown)
    workspace.recorder.flush()
    workspace.queue.reset()
  }

  private func scopeSwitch(count: Int) async throws {
    try requireBenchmark()
    let (workspace, feed) = try await fixture(count)
    for i in 0..<count {
      workspace.state("perf-\(i)").apply([
        "read": .bool(i % 3 == 0), "bookmarked": .bool(i % 5 == 0),
        "later": .bool(i % 7 == 0),
      ])
    }
    feed.refreshMembership()
    let version = feed.scrollRequest?.id ?? 0
    measureWork {
      for scope in [Scope.unread, .saved, .later, .todo, .all] { feed.select(scope) }
    }
    XCTAssertEqual(feed.scope, .all)
    XCTAssertGreaterThan(feed.scrollRequest?.id ?? 0, version)
    XCTAssertEqual(feed.entries.count, Feed.page)
    feed.select(.saved)
    XCTAssertFalse(feed.entries.isEmpty)
  }

  func testFeedScroll3000() async throws {
    try requireBenchmark()
    let (workspace, feed) = try await fixture(3000)
    let chrome = Chrome()
    let scroll = FeedScroll(chrome: chrome)
    var nearEnd = 0
    scroll.nearEnd = {
      nearEnd += 1
      feed.loadMore()
    }
    measureWork(
      setup: {
        feed.select(.unread)
        feed.select(.all)
        scroll.scrolled(offset: 0, visible: 800, content: 48000)
        nearEnd = 0
      },
      work: {
        // Synthetic bounds notifications exercise the actual handler, without a window or input.
        for i in 1...1000 { scroll.scrolled(offset: CGFloat(i * 40), visible: 800, content: 48000) }
        for i in 0..<10 {
          scroll.scrolled(offset: CGFloat(46000 + i * 100), visible: 800, content: 48000)
        }
        scroll.scrolled(offset: 0, visible: 800, content: 48000)
      })
    XCTAssertEqual(nearEnd, 10)
    XCTAssertEqual(feed.entries.count, Feed.page * 11)
    XCTAssertFalse(chrome.tucked)
    XCTAssertEqual(workspace.cards.count, 3000)
  }

  func testPanelOpenClose() throws {
    try requireBenchmark()
    let panels = Panels()
    var returned = 0
    panels.onClosed = { _ in returned += 1 }
    measureWork(
      setup: { returned = 0 },
      work: {
        for _ in 0..<100 {
          panels.open(.settings)
          panels.close()
        }
      })
    XCTAssertNil(panels.kind)
    XCTAssertEqual(returned, 100)
  }
}
