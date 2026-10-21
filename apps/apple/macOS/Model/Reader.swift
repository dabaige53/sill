import Foundation
import Observation
import SillKit
import SwiftUI

/// The reading overlay: a stack of detail layers over the window, top bar included.
/// Close, Esc, the dim, pulling down and finishing each leave only the top layer and restore the
/// reading position of the one below. The window toolbar never changes.
@MainActor @Observable final class Reader {
  struct Layer: Identifiable, Equatable {
    let id = UUID()
    let card: String
    var full: Bool
  }

  private(set) var layers: [Layer] = []
  /// Drawn visibility of the whole overlay; the overlay stays mounted until its exit finishes.
  private(set) var shown = false
  private(set) var returning = false
  private(set) var travelling = false
  private(set) var matchedCard: String?
  private(set) var matchedFrame: CGRect?
  private(set) var contentShown = false
  private(set) var toolsShown = false
  @ObservationIgnored private var waitingForGeometry = false

  @ObservationIgnored var viewport: CGRect = .zero
  @ObservationIgnored var cardFrames: [String: CGRect] = [:]
  var matching: Bool { matchedCard != nil && layers.count == 1 }

  @ObservationIgnored private var token = 0
  @ObservationIgnored private unowned let workspace: Workspace
  /// Cards whose read color waits until the overlay has closed.
  @ObservationIgnored private var held: Set<String> = []
  @ObservationIgnored var positions: [UUID: CGFloat] = [:]
  /// Where focus returns after the overlay closes.
  @ObservationIgnored var origin: String?
  @ObservationIgnored var onClosed: (String?) -> Void = { _ in }

  init(workspace: Workspace) { self.workspace = workspace }

  var presented: Bool { !layers.isEmpty }
  var top: Layer? { layers.last }

  // MARK: Opening

  func open(_ id: String, full: Bool = false) {
    let trace = PerformanceTrace.shared.begin(.openCard)
    defer { PerformanceTrace.shared.end(trace) }
    guard let card = workspace.model(id) else { return }
    token += 1
    // A click on another card while the previous one is still flying home starts over at once.
    let interrupted = returning
    returning = false
    if interrupted, layers.last?.card != id { releaseHeld() }
    hold(id)
    workspace.recorder.opened(id)
    if card.kind == .photo, !full { markPhotoRead(id) }
    if layers.isEmpty || !shown {
      // A fresh overlay, or reopening while the previous one is still leaving.
      let fresh = layers.last?.card != id || layers.count != 1
      if fresh {
        origin = origin ?? id
        matchedCard =
          !Motion.keyboardDriven && card.kind != .photo
            && cardFrames[id].map { $0.intersects(viewport) } == true ? id : nil
        matchedFrame = matchedCard.flatMap { cardFrames[$0] }
        contentShown = false
        toolsShown = false
        layers = [Layer(card: id, full: full)]
      } else if let index = layers.indices.last {
        layers[index].full = full
      }
      if matching && !shown && fresh {
        waitingForGeometry = true
      } else {
        present(true)
      }
      return
    }
    contentShown = true
    toolsShown = true
    if layers.last?.card == id {
      animate(full ? Motion.open : Motion.close) { layers[layers.count - 1].full = full }
      return
    }
    // Opening a related card: it stacks; opening one already below returns to it.
    if let index = layers.lastIndex(where: { $0.card == id }) {
      animate(Motion.close) { layers.removeSubrange((index + 1)...) }
    } else {
      animate(Motion.open) { layers.append(Layer(card: id, full: full)) }
    }
  }

  func toggleFull() {
    guard let top else { return }
    open(top.card, full: !top.full)
  }

  // MARK: Closing

  /// Leaves the top layer only.
  func close() {
    guard presented else { return }
    if layers.count > 1 {
      token += 1
      animate(Motion.close) { _ = layers.removeLast() }
    } else {
      closeAll()
    }
  }

  /// Leaves every layer; the overlay unmounts once its exit animation has finished.
  func closeAll() {
    guard presented else { return }
    if let matchedCard, cardFrames[matchedCard].map({ $0.intersects(viewport) }) != true {
      self.matchedCard = nil
    }
    token += 1
    let current = token
    if waitingForGeometry {
      waitingForGeometry = false
      finish()
      return
    }
    matchedFrame = matchedCard.flatMap { cardFrames[$0] }
    returning = matching
    toolsShown = false
    // Keep the content in the returning surface until the source-card handoff.
    if !matching { contentShown = false }
    if Motion.keyboardDriven {
      Motion.instantly { shown = false }
      finish()
      return
    }
    withAnimation(
      matching ? Motion.cardReturn : Motion.close, completionCriteria: .removed
    ) {
      shown = false
    } completion: { [weak self] in
      guard let self, self.token == current else { return }
      self.finish()
    }
  }

  /// A card left the workspace while it was open.
  func prune() {
    let kept = layers.filter { workspace.model($0.card) != nil }
    guard kept.count != layers.count else { return }
    if kept.isEmpty { closeAll() } else { layers = kept }
  }

  // MARK: Reading

  /// Reaching the end marks the card read at once; its feed color waits for the overlay to close.
  func reachedEnd(_ id: String, completion: ((Bool) -> Void)? = nil) {
    guard let card = workspace.model(id), card.kind.readable else {
      completion?(true)
      return
    }
    let state = workspace.state(id)
    workspace.recorder.read(id, progress: 1)
    guard !state.effectiveRead else {
      completion?(true)
      return
    }
    hold(id)
    let sent = workspace.change(
      id,
      ["read": .bool(true), "progress": .number(1), "readAt": .number(Format.milliseconds())],
      lock: false, completion: completion)
    if !sent { completion?(false) }
  }

  private func markPhotoRead(_ id: String) {
    Task { [weak self] in
      try? await Task.sleep(for: .seconds(AppleMetrics.motionDetailOpen))
      self?.reachedEnd(id)
    }
  }

  /// The feed redraws read colors only once the overlay is gone (or replaced).
  private func releaseHeld() {
    for id in held { workspace.state(id).releaseReadAppearance() }
    held = []
  }

  private func hold(_ id: String) {
    workspace.state(id).holdReadAppearance()
    held.insert(id)
  }

  /// The destination calls this only after its final content height has been measured.
  func geometryReady(_ id: String) {
    guard waitingForGeometry, top?.card == id else { return }
    waitingForGeometry = false
    present(true)
  }

  private func present(_ value: Bool) {
    if Motion.keyboardDriven || !matching {
      contentShown = value
      toolsShown = value
      if Motion.keyboardDriven {
        Motion.instantly { shown = value }
      } else {
        withAnimation(Motion.open) { shown = value }
      }
      return
    }
    let current = token
    travelling = true
    withAnimation(Motion.card, completionCriteria: .logicallyComplete) {
      shown = value
      toolsShown = value
    } completion: { [weak self] in
      guard let self, self.token == current else { return }
      self.travelling = false
    }
    // The surface blends content from the same progress as its geometry.
    contentShown = value
  }

  private func animate(_ animation: Animation, _ changes: () -> Void) {
    if Motion.keyboardDriven {
      Motion.instantly(changes)
    } else {
      withAnimation(animation, changes)
    }
  }

  private func finish() {
    let returning = origin
    layers = []
    self.returning = false
    travelling = false
    matchedCard = nil
    matchedFrame = nil
    contentShown = false
    toolsShown = false
    positions = [:]
    origin = nil
    releaseHeld()
    workspace.recorder.flush()
    onClosed(returning)
  }
}
