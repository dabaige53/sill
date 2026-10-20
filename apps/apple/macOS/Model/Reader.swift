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
    guard let card = workspace.model(id) else { return }
    token += 1
    hold(id)
    workspace.recorder.opened(id)
    if card.kind == .photo, !full { markPhotoRead(id) }
    if layers.isEmpty || !shown {
      // A fresh overlay, or reopening while the previous one is still leaving.
      if layers.last?.card != id || layers.count != 1 {
        origin = origin ?? id
        layers = [Layer(card: id, full: full)]
      } else if let index = layers.indices.last {
        layers[index].full = full
      }
      present(true)
      return
    }
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
    token += 1
    let current = token
    if Motion.keyboardDriven {
      Motion.instantly { shown = false }
      finish()
      return
    }
    withAnimation(Motion.close, completionCriteria: .logicallyComplete) {
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

  private func hold(_ id: String) {
    workspace.state(id).holdReadAppearance()
    held.insert(id)
  }

  private func present(_ value: Bool) {
    if Motion.keyboardDriven {
      Motion.instantly { shown = value }
    } else {
      withAnimation(Motion.open) { shown = value }
    }
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
    positions = [:]
    origin = nil
    // The feed redraws read colors only now that the overlay is gone.
    for id in held { workspace.state(id).releaseReadAppearance() }
    held = []
    workspace.recorder.flush()
    onClosed(returning)
  }
}
