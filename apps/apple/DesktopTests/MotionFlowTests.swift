import AppKit
import Foundation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct MotionFlowTests {
  @Test func completedReadingShowsTheCheckAndClosesOnReleaseWithoutARebound() {
    let scroll = ReaderScroll()
    var closed = 0
    scroll.close = { closed += 1 }
    scroll.motion.finish = AppleMetrics.gestureFinishDistance
    scroll.commitFinish()
    #expect(scroll.motion.confirmed)
    #expect(closed == 0, "the check waits for the hand to let go")
    scroll.releaseFinish()
    #expect(closed == 1)
    scroll.releaseFinish()
    #expect(closed == 1, "a second release does not close again")
    #expect(abs(scroll.motion.finish - CGFloat(AppleMetrics.gestureFinishDistance)) < 0.001)
    scroll.disconnect()
  }

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

  @Test func disconnectedReadingCannotCloseTheNextLayer() async throws {
    let scroll = ReaderScroll()
    var callback: ((Bool) -> Void)?
    var closed = false
    scroll.finished = { callback = $0 }
    scroll.close = { closed = true }
    scroll.commitFinish()
    scroll.disconnect()
    callback?(true)
    #expect(!scroll.motion.confirmed)
    try await Task.sleep(for: .milliseconds(50))
    #expect(!closed)
  }

  @Test func failedReadingReturnsWithoutClosing() {
    let scroll = ReaderScroll()
    scroll.finished = { $0(false) }
    scroll.motion.finish = AppleMetrics.gestureFinishDistance
    scroll.commitFinish()
    #expect(scroll.motion.finish == 0)
    #expect(!scroll.motion.confirmed)
    scroll.disconnect()
  }

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
    try await Task.sleep(for: .milliseconds(30))
    #expect(refresh.phase == .error)
    refresh.cancel()
  }

  @Test func savedReaderProgressRestoresAgainstDocumentHeight() {
    let view = NSScrollView(frame: NSRect(x: 0, y: 0, width: 400, height: 600))
    view.documentView = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 2000))
    let scroll = ReaderScroll()
    scroll.initialProgress = 0.5
    scroll.connected(view)
    #expect(abs(view.contentView.bounds.minY - 700) < 1)
    scroll.disconnect()
  }

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

  @Test func cardBoundaryTravelsContinuouslyWithoutChangingTextScale() {
    let source = CGRect(x: 40, y: 80, width: 300, height: 180)
    let target = CGRect(x: 100, y: 120, width: 800, height: 600)
    #expect(CardFlightSurface.rect(source: source, target: target, progress: 0) == source)
    #expect(CardFlightSurface.rect(source: source, target: target, progress: 1) == target)
    let halfway = CardFlightSurface.rect(source: source, target: target, progress: 0.5)
    #expect(halfway == CGRect(x: 70, y: 100, width: 550, height: 390))
  }

  @Test func contentAndToolsFollowGeometryProgressInBothDirections() {
    #expect(CardFlightSurface.detailOpacity(0) == 0)
    #expect(CardFlightSurface.detailOpacity(1) == 1)
    var previous = 0.0
    for step in 0...100 {
      let progress = CGFloat(step) / 100
      let alpha = CardFlightSurface.detailOpacity(progress)
      #expect(alpha >= previous && alpha <= 1)
      previous = alpha
    }
    let halfway = CardFlightSurface.detailOpacity(0.5)
    #expect(halfway > 0 && halfway < 1)
    #expect(CardFlightSurface.detailOpacity(0.4) < halfway)
    #expect(CardFlightSurface.detailOpacity(0.6) > halfway)
  }

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
