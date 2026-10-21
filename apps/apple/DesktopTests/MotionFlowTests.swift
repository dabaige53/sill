import Foundation
import Testing

@testable import Sill
@testable import SillKit

@MainActor struct MotionFlowTests {
  @Test func completedReadingClosesWithoutASeparateRebound() async throws {
    let scroll = ReaderScroll()
    var closed = false
    scroll.close = { closed = true }
    scroll.motion.finish = AppleMetrics.gestureFinishDistance
    scroll.commitFinish()
    #expect(scroll.motion.confirmed)
    #expect(!closed)
    try await Task.sleep(for: .seconds(AppleMetrics.gestureFinishHold + 0.6))
    #expect(abs(scroll.motion.finish - CGFloat(AppleMetrics.gestureFinishDistance)) < 0.001)
    #expect(scroll.motion.confirmed)
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
    refresh.pull(AppleMetrics.gestureRefreshDistance)
    refresh.release()
    #expect(refresh.phase == .loading)
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
    refresh.drag(80)
    #expect(refresh.distance == 52)
    #expect(refresh.offset == 39)
    try await Task.sleep(for: .seconds(AppleMetrics.gestureWheelRest + 0.1))
    #expect(refresh.phase == .pulling)
    #expect(calls == 0)
    refresh.drag(20)
    refresh.release()
    #expect(refresh.phase == .idle)
    #expect(calls == 0)
    refresh.drag(100)
    refresh.release(cancelled: true)
    #expect(calls == 0)
    refresh.drag(80)
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
    let tools = CardToolsTravel.offset(source: source, target: target, top: false)
    #expect(halfway.maxY == target.maxY + tools.height * 0.5)
    #expect(halfway.midX == target.midX + tools.width * 0.5)
  }

  @Test func contentAndToolsFollowGeometryProgressInBothDirections() {
    #expect(CardFlightSurface.detailOpacity(0) == 0)
    #expect(CardFlightSurface.detailOpacity(1) == 1)
    #expect(CardFlightSurface.toolOpacity(0) == 0)
    #expect(CardFlightSurface.toolOpacity(AppleMetrics.cardToolsRevealProgress) == 1)
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

  @Test func toolsTravelWithTheSourceEdgesWithoutScalingIcons() {
    let source = CGRect(x: 40, y: 80, width: 300, height: 180)
    let target = CGRect(x: 100, y: 120, width: 800, height: 600)
    let bottom = CardToolsTravel.offset(source: source, target: target, top: false)
    let top = CardToolsTravel.offset(source: source, target: target, top: true)
    #expect(target.midX + bottom.width == source.midX)
    #expect(target.maxY + bottom.height == source.maxY)
    #expect(target.minY + top.height == source.minY)
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
}
