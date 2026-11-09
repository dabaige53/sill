import AppKit
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct DesktopInteractionTests {
  // @wu-test type=behavior | scope=Search focus interaction | protects=Reopen suggestions without disturbing existing text focus | debt=impl-detail
  @Test func clickingFocusedSearchReopensDismissedSuggestionsWithoutRefocusingText() {
    let shell = Shell()
    shell.focusSearch()
    shell.searchFocused = true
    shell.suggestionsDismissed = true
    let request = shell.searchRequest
    shell.focusSearch()
    #expect(!shell.suggestionsDismissed)
    #expect(shell.searchRequest == request)
  }

  // @wu-test type=behavior | scope=Desktop interaction | protects=Close the menu for search and block search behind settings | debt=impl-detail
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

  // @wu-test type=behavior | scope=Feed pull to refresh | protects=Start one refresh when a trackpad pull ends with zero delta
  @Test func zeroDeltaEndingReleasesTrackpadPull() {
    let refresh = FeedRefresh()
    var calls = 0
    refresh.request = { _ in calls += 1 }
    #expect(refresh.receive(delta: 300, input: .began, atTop: true))
    #expect(refresh.receive(delta: 300, input: .changed, atTop: true))
    #expect(calls == 0)
    #expect(refresh.receive(delta: 0, input: .ended, atTop: true))
    #expect(calls == 1)
    #expect(!refresh.receive(delta: 0, input: .ended, atTop: true))
    #expect(calls == 1)
    refresh.cancel()
  }

  // @wu-test type=behavior | scope=Feed pull to refresh | protects=Avoid refreshing after cancellation or momentum
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

  // @wu-test type=behavior | scope=Reader dismissal | protects=Keep a covered reader open when an old completion arrives
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

  // @wu-test type=behavior | scope=Feed search | protects=Keep the latest query and prevent cleared searches from returning
  @Test func newestSearchWinsAndClearCancelsPendingWork() async {
    let workspace = Workspace(launch: LaunchOptions(dataDirectory: nil), autoload: false)
    let feed = Feed(workspace: workspace)
    let first = feed.scheduleSearch("first")
    let latest = feed.scheduleSearch("latest")
    #expect(feed.query.isEmpty)
    await latest.value
    await first.value
    #expect(feed.query == "latest")
    let stale = feed.scheduleSearch("stale")
    feed.clearFilter()
    await stale.value
    #expect(feed.query.isEmpty)
  }
}
