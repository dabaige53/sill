#if canImport(SwiftUI)
  import Observation
  import SillKit
  import SwiftUI

  /// Each retained layer owns its scrolling and pending completions.
  @MainActor @Observable final class MobileReaderLayer: Identifiable {
    let id = UUID()
    let cardID: String
    let isPhoto: Bool
    var shown = false
    var settled = false
    var leaving = false
    var active = true
    var contentHeight: CGFloat = 0
    var scrollOffset: CGFloat = 0
    var scrollMaximum: CGFloat = 0
    var viewport: CGFloat = 0
    var drag = CGSize.zero
    var finish: CGFloat = 0
    var edge: CGFloat = 0
    var confirmed = false
    var pending = false
    var released = false
    var toolsHidden = false
    var progress: Double = 0
    var scrollTarget: String?
    var scrollRequest = UUID()
    var generation = 0
    @ObservationIgnored var close: () -> Void = {}
    @ObservationIgnored var complete: () async -> Bool = { false }
    @ObservationIgnored private var rest: Task<Void, Never>?
    @ObservationIgnored private var completion: Task<Void, Never>?
    @ObservationIgnored private var down: CGFloat = 0
    @ObservationIgnored private var up: CGFloat = 0

    init(card: MobileCard) {
      cardID = card.id
      isPhoto = card.type == "photo"
    }

    var toolsVisible: Bool { !toolsHidden && finish == 0 && !pending && !confirmed && !leaving }
    var contentShift: CGFloat { -finish * AppleMetrics.gestureFinishTravel + edge }

    func scroll(offset: CGFloat, maximum: CGFloat, viewport: CGFloat, content: CGFloat) {
      let delta = offset - scrollOffset
      let bounded = max(0, min(maximum, offset))
      if scrollOffset != bounded { scrollOffset = bounded }
      if scrollMaximum != maximum { scrollMaximum = maximum }
      if self.viewport != viewport { self.viewport = viewport }
      if contentHeight != content { contentHeight = content }
      let nextProgress =
        maximum > AppleMetrics.space2 ? min(1, max(0, Double(bounded / maximum))) : 0
      if progress != nextProgress { progress = nextProgress }
      guard delta != 0, active, !leaving, !pending, !confirmed else { return }
      rest?.cancel()
      let atEdge = offset <= AppleMetrics.space24 || offset >= maximum - AppleMetrics.readEndSlack
      if atEdge {
        down = 0
        up = 0
        showTools(true)
      } else if delta > 0 {
        down += delta
        up = 0
        if down >= AppleMetrics.chromeHideTravel { showTools(false) }
      } else if delta < 0 {
        up -= delta
        down = 0
        if up >= AppleMetrics.chromeShowTravel { showTools(true) }
      }
      if toolsHidden {
        rest = Task { [weak self] in
          do { try await Task.sleep(for: .seconds(AppleMetrics.chromeRest)) } catch { return }
          guard let self, self.active, !self.leaving else { return }
          self.showTools(true)
        }
      }
    }

    func scrollTo(_ anchor: String) {
      scrollTarget = anchor
      scrollRequest = UUID()
      showTools(true)
    }

    func showTools(_ shown: Bool) {
      guard !confirmed, !pending, toolsHidden == shown else { return }
      withAnimation(shown ? MobileMotion.show : MobileMotion.tuck) { toolsHidden = !shown }
    }

    func rebound(velocity: Double = 0) {
      guard !confirmed, !pending else { return }
      withAnimation(MobileMotion.release(velocity: velocity)) {
        drag = .zero
        finish = 0
        edge = 0
      }
      showTools(true)
    }

    func pullFinish(_ value: CGFloat) {
      guard active, !leaving, !pending, !confirmed else { return }
      finish = min(AppleMetrics.gestureFinishDistance, max(0, value))
      guard finish >= AppleMetrics.gestureFinishDistance else { return }
      pending = true
      released = false
      rest?.cancel()
      let token = generation
      completion = Task { [weak self] in
        guard let self else { return }
        let saved = await self.complete()
        guard !Task.isCancelled, self.active, !self.leaving, self.generation == token else {
          return
        }
        self.pending = false
        guard saved else {
          self.rebound()
          return
        }
        self.confirmed = true
        if self.released { self.close() }
      }
    }

    func releaseFinish() {
      guard pending || confirmed else {
        rebound()
        return
      }
      released = true
      if confirmed { close() }
    }

    func suspend() {
      active = false
      generation += 1
      rest?.cancel()
      completion?.cancel()
      pending = false
      confirmed = false
      released = false
      drag = .zero
      finish = 0
      edge = 0
      toolsHidden = false
    }
  }

  @MainActor @Observable final class MobileReaderPresentation {
    var layers: [MobileReaderLayer] = []
    private var generation = 0
    @ObservationIgnored var didClose: () -> Void = {}

    func open(_ card: MobileCard) {
      generation += 1
      for layer in layers { layer.suspend() }
      layers = [makeLayer(card)]
    }

    func push(_ card: MobileCard) {
      guard layers.last?.cardID != card.id else { return }
      generation += 1
      layers.last?.suspend()
      let layer = makeLayer(card)
      layers.append(layer)
    }

    private func makeLayer(_ card: MobileCard) -> MobileReaderLayer {
      let layer = MobileReaderLayer(card: card)
      layer.close = { [weak self, weak layer] in
        guard let self, let layer, self.layers.last?.id == layer.id else { return }
        self.closeTop()
      }
      return layer
    }

    func reveal(_ layer: MobileReaderLayer) {
      guard layers.last?.id == layer.id, !layer.leaving else { return }
      let token = generation
      withAnimation(MobileMotion.sheet, completionCriteria: .logicallyComplete) {
        layer.shown = true
      } completion: { [weak self, weak layer] in
        guard let self, let layer, self.generation == token, !layer.leaving else { return }
        layer.settled = true
      }
    }

    func closeTop() {
      guard let layer = layers.last, !layer.leaving else { return }
      generation += 1
      let token = generation
      layer.active = false
      layer.leaving = true
      layer.settled = false
      withAnimation(MobileMotion.sheet, completionCriteria: .logicallyComplete) {
        layer.shown = false
      } completion: { [weak self, weak layer] in
        guard let self, let layer, self.generation == token, self.layers.last?.id == layer.id else {
          return
        }
        layer.suspend()
        self.layers.removeLast()
        if let parent = self.layers.last { parent.active = true } else { self.didClose() }
      }
    }

    func clear() {
      generation += 1
      for layer in layers { layer.suspend() }
      layers = []
    }
  }
#endif
