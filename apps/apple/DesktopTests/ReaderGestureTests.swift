import SillKit
import Testing

@testable import Sill

@MainActor struct ReaderGestureTests {
  @Test func finishCommitsAtThresholdAndCannotRetractOrRepeat() {
    let gesture = ReaderGestureState()
    #expect(!gesture.reach(119))
    #expect(!gesture.reached)
    #expect(gesture.reach(120))
    #expect(gesture.reached)
    #expect(!gesture.reach(180))
    #expect(!gesture.reach(0))
    #expect(gesture.distance == 120)
  }

  @Test func cancellingAnUnreleasedPullCannotCommitTheNextGesture() {
    var pull = EdgePullState()
    _ = pull.update(edge: "top", delta: 130, time: 1)
    let cancel = pull.end(cancelled: true)
    #expect(cancel.phase == .cancelled)
    #expect(pull.distance == 0)
    let next = pull.update(edge: "bottom", delta: 20, time: 2)
    #expect(next.edge == "bottom")
    #expect(next.distance == 20)
    #expect(pull.end(cancelled: false).distance == 20)
    #expect(pull.edge.isEmpty)
  }

  @Test func reversingBeforeReleaseReducesThePull() {
    var pull = EdgePullState()
    _ = pull.update(edge: "bottom", delta: 90, time: 1)
    let reversed = pull.update(edge: "bottom", delta: -50, time: 1.05)
    #expect(reversed.distance == 40)
    #expect(reversed.velocity < 0)
    _ = pull.update(edge: "bottom", delta: -100, time: 1.09)
    #expect(pull.end(cancelled: false).distance == 0)
  }

  @Test func staleVelocityIsNotCarriedIntoANewInputSample() {
    var pull = EdgePullState()
    _ = pull.update(edge: "top", delta: 50, time: 1)
    _ = pull.update(edge: "top", delta: 40, time: 1.02)
    let stopped = pull.update(edge: "top", delta: 0, time: 1.3)
    #expect(stopped.velocity == 0)
  }

  @Test func rapidOpenCloseReopenKeepsTheLatestPresentation() {
    var presentation = DetailPresentation()
    let open = presentation.prepare("first")
    let close = presentation.prepare(nil)
    let reopen = presentation.prepare("first")
    presentation.visible = true
    presentation.finishClose(close)
    #expect(presentation.cardID == "first")
    #expect(reopen > close && close > open)
    let finalClose = presentation.prepare(nil)
    presentation.visible = false
    presentation.finishClose(close)
    #expect(presentation.cardID == "first")
    presentation.finishClose(finalClose)
    #expect(presentation.cardID == nil)
  }

  @Test func rejectedReadSubmissionReportsFailureInsteadOfShowingSuccess() {
    let model = Workspace(autoload: false)
    var result: Bool?
    model.patch(["synthetic"], values: ["read": .bool(true)]) { result = $0 }
    #expect(result == false)
    #expect(model.items.isEmpty)
  }

  @Test func reopeningTheSameCardInvalidatesCompletionFromItsPreviousSession() {
    let model = Workspace(autoload: false)
    model.selected = "a"
    let oldSession = model.readerGeneration
    model.selected = nil
    model.selected = "a"
    #expect(model.readerGeneration != oldSession)
    #expect(model.readerTrail.isEmpty)
  }
}
