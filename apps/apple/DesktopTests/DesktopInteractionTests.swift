import AppKit
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct DesktopInteractionTests {
  @Test func ownershipAndSearchAreMutuallyExclusive() {
    let workspace = Workspace(launch: LaunchOptions(dataDirectory: nil), autoload: false)
    let shell = Shell()
    let panels = Panels()
    let reader = Reader(workspace: workspace)
    let input = DesktopInteraction(
      panels: panels, reader: reader, shell: shell,
      menu: CardMenu(workspace: workspace), drag: CardDrag())
    #expect(input.layer == .home)
    #expect(input.canScrollFeed)
    shell.menu.present()
    #expect(input.layer == .menu)
    #expect(!input.canScrollFeed)
    let request = shell.searchRequest
    input.focusSearch()
    #expect(shell.searchRequest == request + 1)
    #expect(!shell.menu.shown)
    panels.open(.settings)
    input.focusSearch()
    #expect(shell.searchRequest == request + 1)
    #expect(!input.canScrollReader)
    #expect(!input.canSearch)
    #expect(input.dismiss())
    #expect(panels.kind == nil)
  }

  @Test func zeroDeltaEndingReleasesTrackpadPull() async throws {
    let refresh = FeedRefresh()
    var calls = 0
    refresh.request = { _ in calls += 1 }
    #expect(refresh.receive(delta: AppleMetrics.gestureRefreshDistance, input: .began, atTop: true))
    try await Task.sleep(for: .seconds(AppleMetrics.gestureWheelRest + 0.05))
    #expect(refresh.phase == .pulling)
    #expect(calls == 0)
    #expect(refresh.receive(delta: 0, input: .ended, atTop: true))
    #expect(calls == 1)
    #expect(!refresh.receive(delta: 0, input: .ended, atTop: true))
    refresh.cancel()
  }

  @Test func cancellationAndMomentumDoNotStartRefresh() {
    let refresh = FeedRefresh()
    var calls = 0
    refresh.request = { _ in calls += 1 }
    #expect(!refresh.receive(delta: 100, input: .momentum, atTop: true))
    #expect(refresh.receive(delta: 100, input: .began, atTop: true))
    #expect(refresh.receive(delta: 0, input: .cancelled, atTop: true))
    #expect(calls == 0)
    #expect(refresh.phase == .idle)
  }

  @Test func wheelClassificationSeparatesMomentumAndFreshInput() {
    #expect(WheelPhase(phase: [], momentum: .changed) == .momentum)
    #expect(WheelPhase(phase: [], momentum: []) == .discrete)
    #expect(WheelPhase(phase: .began, momentum: []) == .began)
    #expect(WheelPhase(phase: .ended, momentum: []) == .ended)
    #expect(WheelPhase(phase: .cancelled, momentum: []) == .cancelled)
  }

  @Test func coveredReaderIgnoresLateSuccess() {
    let scroll = ReaderScroll()
    var callback: ((Bool) -> Void)?
    var closed = false
    scroll.finished = { callback = $0 }
    scroll.close = { closed = true }
    scroll.commitFinish()
    scroll.cancelGesture()
    callback?(true)
    #expect(!scroll.motion.confirmed)
    #expect(!closed)
    scroll.disconnect()
  }

  @Test func newestSearchWinsAndClearCancelsPendingWork() async throws {
    let workspace = Workspace(launch: LaunchOptions(dataDirectory: nil), autoload: false)
    let feed = Feed(workspace: workspace)
    feed.scheduleSearch("first")
    feed.scheduleSearch("latest")
    #expect(feed.query.isEmpty)
    try await Task.sleep(for: .milliseconds(Int(AppleMetrics.searchDelay) + 80))
    #expect(feed.query == "latest")
    feed.scheduleSearch("stale")
    feed.clearFilter()
    try await Task.sleep(for: .milliseconds(Int(AppleMetrics.searchDelay) + 80))
    #expect(feed.query.isEmpty)
  }
}
