import SillKit
import Testing

@testable import SillMobile

@Suite struct MobileReaderPolicyTests {
  @Test func cancelledAndUnconfirmedGesturesCannotClose() {
    for drag in [MobileReaderPolicy.Drag.handle, .down, .right, .finish] {
      #expect(
        MobileReaderPolicy.release(
          drag, distance: 500, velocity: 2, width: 390,
          cancelled: true, committed: false) == .restore)
    }
    #expect(
      MobileReaderPolicy.release(
        .finish, distance: 120, velocity: 1, width: 390,
        cancelled: false, committed: true) == .awaitFinish)
  }

  @Test func handleContentAndSidewaysHaveDifferentThresholds() {
    #expect(
      MobileReaderPolicy.release(
        .handle, distance: 110, velocity: 0, width: 390,
        cancelled: false, committed: false) == .restore)
    #expect(
      MobileReaderPolicy.release(
        .down, distance: 110, velocity: 0, width: 390,
        cancelled: false, committed: false) == .close)
    #expect(
      MobileReaderPolicy.release(
        .handle, distance: -41, velocity: 0, width: 390,
        cancelled: false, committed: false) == .restore)
    #expect(
      MobileReaderPolicy.release(
        .handle, distance: 160, velocity: 0, width: 390,
        cancelled: false, committed: false) == .close)
    #expect(
      MobileReaderPolicy.release(
        .right, distance: 80, velocity: 0.6, width: 390,
        cancelled: false, committed: false) == .close)
    #expect(
      MobileReaderPolicy.direction(
        x: 30, y: 28, atTop: true, atBottom: false,
        finishEnabled: true) == .none)
  }

  @Test func actionFilteringPrecedesTheThreeItemLimit() {
    let values = MobileReaderPolicy.ownActions(
      type: "event", hasURL: false, hasMeeting: true,
      timely: true, dismissed: false, reminderDone: false, snoozed: false, hidden: ["dismiss"])
    #expect(values == ["join", "snooze", "download"])
    #expect(
      MobileReaderPolicy.ownActions(
        type: "photo", hasURL: true, hasMeeting: false,
        timely: false, dismissed: false, reminderDone: false, snoozed: false, hidden: []
      ).isEmpty)
  }

  @Test func velocityDropsOldInputInsteadOfUsingWholeDragAverage() {
    var velocity = MobileReaderVelocity()
    velocity.feed(0, at: 1)
    velocity.feed(300, at: 2)
    velocity.feed(305, at: 2.05)
    #expect(abs(velocity.value - 0.1) < 0.001)
  }
}
