import AppKit
import Foundation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct MotionFlowTests {
  // @wu-test type=behavior | scope=Reader finish gesture | protects=Close once on release after reading is confirmed
  @Test func completedReadingShowsTheCheckAndClosesOnReleaseWithoutARebound() {
    let scroll = ReaderScroll()
    var closed = 0
    scroll.close = { closed += 1 }
    scroll.motion.finish = AppleMetrics.gestureFinishDistance
    scroll.commitFinish()
    #expect(closed == 0, "the check waits for the hand to let go")
    scroll.releaseFinish()
    #expect(closed == 1)
    scroll.releaseFinish()
    #expect(closed == 1, "a second release does not close again")
    scroll.disconnect()
  }

  // @wu-test type=behavior | scope=Reader finish gesture | protects=Close after a pending completion is confirmed
  @Test func releaseBeforeTheWriteConfirmsClosesOnConfirmation() {
    let scroll = ReaderScroll()
    var callback: ((Bool) -> Void)?
    var closed = false
    scroll.finished = { callback = $0 }
    scroll.close = { closed = true }
    scroll.commitFinish()
    scroll.releaseFinish()
    #expect(!closed)
    callback?(true)
    #expect(closed)
    scroll.disconnect()
  }

  // @wu-test type=behavior | scope=Reader finish gesture | protects=Prevent an old completion from closing a later layer
  @Test func disconnectedReadingCannotCloseTheNextLayer() throws {
    let scroll = ReaderScroll()
    var callback: ((Bool) -> Void)?
    var closed = false
    scroll.finished = { callback = $0 }
    scroll.close = { closed = true }
    scroll.commitFinish()
    scroll.releaseFinish()
    let complete = try #require(callback)
    #expect(!closed)
    scroll.disconnect()
    complete(true)
    #expect(!closed)
  }

  // @wu-test type=behavior | scope=Reader finish gesture | protects=Keep the reader open when completion fails
  @Test func failedReadingReturnsWithoutClosing() {
    let scroll = ReaderScroll()
    var closed = false
    scroll.close = { closed = true }
    scroll.finished = { $0(false) }
    scroll.motion.finish = AppleMetrics.gestureFinishDistance
    scroll.commitFinish()
    scroll.releaseFinish()
    #expect(!closed)
    scroll.disconnect()
  }

  // @wu-test type=behavior | scope=Reader dismissal animation | protects=Keep text aligned while the reader dismisses | debt=impl-detail
  @Test func dismissalMovesSurfaceAndDimsWithoutMovingTextTwice() {
    let motion = ReaderMotion()
    motion.surfaceWidth = 800
    #expect(motion.dimOpacity == 1)
    motion.dismiss = AppleMetrics.gestureDismissDistance / 2
    #expect(abs(motion.dimOpacity - 0.65) < 0.001)
    #expect(motion.contentOffset == 0)
    motion.swipe = 800 * AppleMetrics.motionDeckTravel
    #expect(abs(motion.dimOpacity - 0.3) < 0.001)
    motion.dismiss = 0
    motion.swipe = 0
    #expect(motion.dimOpacity == 1)
  }

  // @wu-test type=behavior | scope=Feed refresh gesture | protects=Continue a new pull from the visible position and show failure | debt=flaky,impl-detail
  @Test func refreshRegrabsTheVisibleReboundAndFailureIsImmediate() async throws {
    let refresh = FeedRefresh()
    refresh.drawn.value = 30
    refresh.drag(4)
    #expect(abs(refresh.distance - 30) < 0.001)
    refresh.drag(24)
    #expect(refresh.distance > 30)
    refresh.release(cancelled: true)
    refresh.request = { $0(false) }
    refresh.refresh()
    let deadline = ContinuousClock.now + .seconds(1)
    while refresh.phase == .loading && ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(5))
    }
    #expect(refresh.phase == .error)
    refresh.cancel()
  }

  // @wu-test type=behavior | scope=Reader scroll restoration | protects=Restore reading progress at the corresponding document position
  @Test func savedReaderProgressRestoresAgainstDocumentHeight() {
    let view = NSScrollView(frame: NSRect(x: 0, y: 0, width: 400, height: 600))
    view.documentView = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 2000))
    let scroll = ReaderScroll()
    scroll.initialProgress = 0.5
    scroll.connected(view)
    #expect(abs(view.contentView.bounds.minY - 700) < 1)
    scroll.disconnect()
  }

  // @wu-test type=behavior | scope=Feed refresh retry | protects=Prevent duplicate refreshes and allow retry after failure | debt=flaky,impl-detail
  @Test func buttonRefreshAndRetryKeepCardsInPlace() async throws {
    let refresh = FeedRefresh()
    var calls = 0
    var reply: ((Bool) -> Void)?
    refresh.request = {
      calls += 1
      reply = $0
    }
    refresh.refresh()
    #expect(refresh.distance == 0)
    refresh.refresh()
    #expect(calls == 1)
    reply?(false)
    try await Task.sleep(for: .seconds(AppleMetrics.loadingDelay + 0.1))
    #expect(refresh.phase == .error)
    refresh.refresh()
    #expect(calls == 2)
    #expect(refresh.distance == 0)
    refresh.cancel()
  }

  // @wu-test type=behavior | scope=Feed refresh cancellation | protects=Ignore a stale refresh result after cancellation | debt=flaky,impl-detail
  @Test func refreshThresholdCancellationAndStaleResult() async throws {
    let refresh = FeedRefresh()
    var calls = 0
    var reply: ((Bool) -> Void)?
    refresh.request = {
      calls += 1
      reply = $0
    }
    refresh.pull(AppleMetrics.gestureRefreshDistance - 1)
    refresh.release()
    #expect(refresh.phase == .idle)
    #expect(calls == 0)
    refresh.pull(300)
    refresh.release()
    #expect(refresh.phase == .loading)
    #expect(refresh.distance == 0, "content returns immediately while the request is in flight")
    #expect(calls == 1)
    refresh.refresh()
    #expect(calls == 1)
    refresh.cancel()
    reply?(true)
    try await Task.sleep(for: .seconds(AppleMetrics.loadingDelay + 0.05))
    #expect(refresh.phase == .idle)
    #expect(refresh.distance == 0)
  }

  // @wu-test type=behavior | scope=Mouse pull to refresh | protects=Refresh only after a qualifying mouse pull is released | debt=flaky,impl-detail
  @Test func mouseRefreshWaitsForReleaseAndCanBeReversed() async throws {
    let refresh = FeedRefresh()
    var calls = 0
    refresh.request = { _ in calls += 1 }
    refresh.drag(4)
    refresh.drag(84)
    #expect(abs(refresh.distance - 35.8974358974) < 0.001)
    #expect(refresh.offset == refresh.distance)
    try await Task.sleep(for: .seconds(AppleMetrics.gestureWheelRest + 0.1))
    #expect(refresh.phase == .pulling)
    #expect(calls == 0)
    refresh.drag(20)
    refresh.release()
    #expect(refresh.phase == .idle)
    #expect(calls == 0)
    refresh.drag(4)
    refresh.drag(104)
    refresh.release(cancelled: true)
    #expect(calls == 0)
    refresh.drag(4)
    refresh.drag(304)
    refresh.release()
    refresh.release()
    #expect(calls == 1)
    refresh.cancel()
  }

  // @wu-test type=behavior | scope=Feed refresh feedback | protects=Show failure and then success after retry | debt=flaky,impl-detail
  @Test func refreshFailureRetryAndSuccess() async throws {
    let refresh = FeedRefresh()
    refresh.request = { $0(false) }
    refresh.refresh()
    try await Task.sleep(for: .seconds(AppleMetrics.loadingDelay + 0.08))
    #expect(refresh.phase == .error)
    #expect(refresh.distance == 0)
    refresh.request = { $0(true) }
    refresh.refresh()
    try await Task.sleep(for: .seconds(AppleMetrics.loadingDelay + 0.08))
    #expect(refresh.phase == .success)
    try await Task.sleep(for: .seconds(AppleMetrics.gestureRefreshSuccessHold + 0.08))
    #expect(refresh.phase == .idle)
    #expect(refresh.distance == 0)
    refresh.cancel()
  }
  /// macOS 26 lays the top bar out as a safe-area bar: the clip view rests at minus its height.
  // @wu-test type=behavior | scope=Feed scroll top | protects=Treat the inset below the top bar as the feed top
  @Test func feedTopIsMeasuredBelowTheTopBar() {
    let view = NSScrollView(frame: NSRect(x: 0, y: 0, width: 400, height: 600))
    view.automaticallyAdjustsContentInsets = false
    view.contentInsets = NSEdgeInsets(top: 100, left: 0, bottom: 0, right: 0)
    view.documentView = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 2000))
    let scroll = FeedScroll(chrome: Chrome())
    scroll.scrollView = view
    scroll.scroll(to: 0)
    #expect(view.contentView.bounds.minY == -100)
    #expect(scroll.offset == 0)
    // Cards still partly under the bar are not at the top, so a pull scrolls instead of refreshing.
    view.contentView.scroll(to: NSPoint(x: 0, y: -60))
    #expect(scroll.offset == 40)
  }

  /// Cards stop taking the pointer while the feed moves and take it back once it rests.
  // @wu-test type=behavior | scope=Feed hover during scrolling | protects=Restore card hover after scrolling stops | debt=flaky,impl-detail
  @Test func feedPausesCardHoverOnlyWhileMoving() async throws {
    let scroll = FeedScroll(chrome: Chrome())
    scroll.scrolled(offset: 0, visible: 600, content: 4000)
    #expect(!scroll.moving.active, "a bounds change without movement is not a scroll")
    for offset in stride(from: CGFloat(40), through: 400, by: 40) {
      scroll.scrolled(offset: offset, visible: 600, content: 4000)
    }
    #expect(scroll.moving.active)
    // Poll past the rest instead of one fixed sleep, so a busy runner cannot miss the release.
    let deadline = ContinuousClock.now + .seconds(AppleMetrics.gestureWheelRest + 2)
    while scroll.moving.active, ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(50))
    }
    #expect(!scroll.moving.active)
  }

  // @wu-test type=integration | scope=Feed scroll restoration | protects=Apply only the latest requested scroll position after layout
  @Test func feedRestorationAppliesOnlyTheLatestRequestAfterLayout() async {
    let view = NSScrollView(frame: NSRect(x: 0, y: 0, width: 400, height: 600))
    view.automaticallyAdjustsContentInsets = false
    view.contentInsets = NSEdgeInsets(top: 100, left: 0, bottom: 0, right: 0)
    view.documentView = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 2400))
    let chrome = Chrome()
    let scroll = FeedScroll(chrome: chrome)
    scroll.scrollView = view
    let probe = ScrollProbe.Probe()
    probe.scroll = scroll
    chrome.hide()
    let latest = Feed.ScrollRequest(id: 2, offset: 640)
    await withCheckedContinuation { done in
      probe.restored = { request, offset in
        #expect(request == latest)
        #expect(offset == 640)
        #expect(view.contentView.bounds.minY == 540)
        #expect(!chrome.tucked)
        done.resume()
      }
      probe.restore(Feed.ScrollRequest(id: 1, offset: 0))
      probe.restore(latest)
    }
    probe.disconnect()
  }

  // @wu-test type=behavior | scope=Reader and feed bars | protects=Restore bars after closing a card opened below the feed top | debt=impl-detail
  @Test func openCardTucksTheBarsOnlyBelowTheFeedTop() {
    let chrome = Chrome()
    let scroll = FeedScroll(chrome: chrome)
    scroll.scrolled(offset: 0, visible: 600, content: 2000)
    chrome.yield(to: true)
    #expect(!chrome.yielding, "at the top the bars stay")
    chrome.yield(to: false)
    scroll.scrolled(offset: 300, visible: 600, content: 2000)
    chrome.hide()
    chrome.yield(to: true)
    #expect(chrome.yielding)
    chrome.yield(to: false)
    #expect(!chrome.yielding)
    #expect(!chrome.tucked, "closing brings back bars that reading had tucked")
  }
}
