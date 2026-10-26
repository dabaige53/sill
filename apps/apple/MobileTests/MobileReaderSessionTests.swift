import Foundation
import SillKit
import Testing

@testable import SillMobile

@Suite @MainActor struct MobileReaderSessionTests {
  private func card(_ id: String = "article") throws -> MobileCard {
    try MobileCard(
      card: Card(
        json: .object([
          "id": .string(id), "type": .string("article"), "title": .string("Synthetic article"),
          "body": .string("Only test content"),
        ])))
  }

  @Test func completionWaitsForBothConfirmedWriteAndRelease() async throws {
    let layer = MobileReaderLayer(card: try card())
    var result: CheckedContinuation<Bool, Never>?
    var closes = 0
    layer.complete = { await withCheckedContinuation { result = $0 } }
    layer.close = { closes += 1 }
    layer.pullFinish(AppleMetrics.gestureFinishDistance)
    while result == nil { await Task.yield() }
    #expect(layer.pending)
    #expect(!layer.confirmed)
    layer.releaseFinish()
    #expect(closes == 0)
    result?.resume(returning: true)
    while layer.pending { await Task.yield() }
    #expect(layer.confirmed)
    #expect(closes == 1)
  }

  @Test func hiddenParentNeverClosesTheNewRelatedLayer() async throws {
    let parent = MobileReaderLayer(card: try card())
    var result: CheckedContinuation<Bool, Never>?
    var closes = 0
    parent.complete = { await withCheckedContinuation { result = $0 } }
    parent.close = { closes += 1 }
    parent.pullFinish(AppleMetrics.gestureFinishDistance)
    while result == nil { await Task.yield() }
    parent.releaseFinish()
    parent.suspend()
    result?.resume(returning: true)
    await Task.yield()
    await Task.yield()
    #expect(!parent.confirmed)
    #expect(closes == 0)
  }

  @Test func failedWriteReboundsWithoutSuccessOrClosing() async throws {
    let layer = MobileReaderLayer(card: try card())
    layer.complete = { false }
    var closes = 0
    layer.close = { closes += 1 }
    layer.pullFinish(AppleMetrics.gestureFinishDistance)
    layer.releaseFinish()
    while layer.pending { await Task.yield() }
    #expect(!layer.confirmed)
    #expect(layer.finish == 0)
    #expect(closes == 0)
  }

  @Test func pushingRetainsParentPositionAndFreshOpenReplacesTheStack() throws {
    let presentation = MobileReaderPresentation()
    presentation.open(try card("parent"))
    let parent = try #require(presentation.layers.first)
    parent.scrollOffset = 420
    presentation.push(try card("related"))
    #expect(presentation.layers.count == 2)
    #expect(presentation.layers[0] === parent)
    #expect(parent.scrollOffset == 420)
    #expect(!parent.active)
    presentation.open(try card("fresh"))
    #expect(presentation.layers.count == 1)
    #expect(presentation.layers[0].cardID == "fresh")
  }
}
