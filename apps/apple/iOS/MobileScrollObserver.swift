#if os(iOS)
  import SillKit
  import SwiftUI
  import UIKit

  struct MobileScrollMetrics: Equatable {
    var offset: CGFloat = 0
    var contentSize: CGSize = .zero
    var viewport: CGSize = .zero
    var dragging = false
    var decelerating = false
    var bottomDistance: CGFloat { max(0, contentSize.height - viewport.height - offset) }
    var atTop: Bool { offset <= 0 }
    var atBottom: Bool { bottomDistance <= 1 }
  }

  struct MobilePanSample {
    enum Phase { case began, changed, ended, cancelled }
    let phase: Phase
    let translation: CGSize
    /// Points per second, matching UIKit. Divide by 1,000 for the PWA velocity thresholds.
    let velocity: CGSize
    let touches: Int
  }

  @MainActor final class MobileScrollProxy {
    fileprivate weak var scrollView: UIScrollView?
    fileprivate var held: CGFloat = 0
    fileprivate var animator: UIViewPropertyAnimator?

    func scroll(to offset: CGFloat, animated: Bool = false) {
      guard let scrollView else { return }
      let point = CGPoint(
        x: scrollView.contentOffset.x,
        y: offset - scrollView.adjustedContentInset.top + held)
      if animated {
        animate { scrollView.contentOffset = point }
      } else {
        animator?.stopAnimation(true)
        scrollView.setContentOffset(point, animated: false)
      }
    }
    func stop() {
      animator?.stopAnimation(true)
      guard let scrollView else { return }
      scrollView.setContentOffset(scrollView.contentOffset, animated: false)
    }
    func holdPull(_ distance: CGFloat) {
      guard let scrollView else { return }
      animator?.stopAnimation(true)
      let distance = max(0, distance)
      scrollView.contentInset.top += distance - held
      held = distance
      scrollView.setContentOffset(
        CGPoint(
          x: scrollView.contentOffset.x,
          y: -scrollView.adjustedContentInset.top), animated: false)
    }
    func releasePull() {
      guard let scrollView, held > 0 else { return }
      let held = held
      self.held = 0
      animate {
        scrollView.contentInset.top -= held
        scrollView.contentOffset.y = -scrollView.adjustedContentInset.top
      }
    }
    fileprivate func detach(from scroll: UIScrollView) {
      guard scrollView === scroll else { return }
      animator?.stopAnimation(true)
      animator = nil
      if held > 0 {
        scroll.contentInset.top -= held
        scroll.contentOffset.y = max(scroll.contentOffset.y, -scroll.adjustedContentInset.top)
      }
      held = 0
      scrollView = nil
    }
    private func animate(_ changes: @escaping () -> Void) {
      animator?.stopAnimation(true)
      let timing = UICubicTimingParameters(
        controlPoint1: CGPoint(x: AppleMetrics.easeSheetX1, y: AppleMetrics.easeSheetY1),
        controlPoint2: CGPoint(x: AppleMetrics.easeSheetX2, y: AppleMetrics.easeSheetY2))
      let animation = UIViewPropertyAnimator(
        duration: AppleMetrics.motionSheet, timingParameters: timing)
      animation.addAnimations(changes)
      animator = animation
      animation.startAnimation()
    }
  }

  /// Place inside the scroll content. Observe the existing pan recognizer without replacing its delegate.
  struct MobileScrollObserver: UIViewRepresentable {
    let proxy: MobileScrollProxy
    let onChange: (MobileScrollMetrics) -> Void
    var onPan: (MobilePanSample) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> Probe {
      let probe = Probe()
      probe.isUserInteractionEnabled = false
      probe.connect = { [weak coordinator = context.coordinator] view in coordinator?.attach(view) }
      return probe
    }
    func updateUIView(_ view: Probe, context: Context) {
      context.coordinator.parent = self
      context.coordinator.attach(view)
    }
    static func dismantleUIView(_ view: Probe, coordinator: Coordinator) {
      view.connect = nil
      coordinator.detach()
    }

    final class Probe: UIView {
      var connect: ((UIView) -> Void)?
      override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { connect?(self) }
      }
      override func layoutSubviews() {
        super.layoutSubviews()
        connect?(self)
      }
    }

    @MainActor final class Coordinator: NSObject {
      var parent: MobileScrollObserver
      weak var scrollView: UIScrollView?
      var boundProxy: MobileScrollProxy?
      var observations: [NSKeyValueObservation] = []
      var displayLink: CADisplayLink?
      var ticker: Ticker?
      var last: MobileScrollMetrics?
      var dirty = false

      init(_ parent: MobileScrollObserver) { self.parent = parent }
      func attach(_ probe: UIView) {
        var ancestor = probe.superview
        while let view = ancestor, !(view is UIScrollView) { ancestor = view.superview }
        guard let scroll = ancestor as? UIScrollView,
          scroll !== scrollView || parent.proxy !== boundProxy
        else { return }
        detach()
        scrollView = scroll
        parent.proxy.scrollView = scroll
        boundProxy = parent.proxy
        scroll.panGestureRecognizer.addTarget(self, action: #selector(pan(_:)))
        observations = [
          scroll.observe(\.contentOffset) { [weak self] _, _ in self?.schedule() },
          scroll.observe(\.contentSize) { [weak self] _, _ in self?.schedule() },
          scroll.observe(\.bounds) { [weak self] _, _ in self?.schedule() },
        ]
        let ticker = Ticker()
        ticker.owner = self
        self.ticker = ticker
        let link = CADisplayLink(target: ticker, selector: #selector(Ticker.tick))
        link.add(to: .main, forMode: .common)
        displayLink = link
        dirty = true
      }
      nonisolated func schedule() {
        Task { @MainActor [weak self] in
          self?.dirty = true
          self?.displayLink?.isPaused = false
        }
      }
      func detach() {
        displayLink?.invalidate()
        displayLink = nil
        observations = []
        scrollView?.panGestureRecognizer.removeTarget(self, action: #selector(pan(_:)))
        if let scrollView { boundProxy?.detach(from: scrollView) }
        boundProxy = nil
        scrollView = nil
        last = nil
      }
      func metrics() -> MobileScrollMetrics? {
        guard let scrollView else { return nil }
        let inset = scrollView.adjustedContentInset
        return MobileScrollMetrics(
          offset: scrollView.contentOffset.y + inset.top - parent.proxy.held,
          contentSize: scrollView.contentSize,
          viewport: CGSize(
            width: scrollView.bounds.width,
            height: max(0, scrollView.bounds.height - inset.top - inset.bottom + parent.proxy.held)),
          dragging: scrollView.isDragging, decelerating: scrollView.isDecelerating)
      }
      func flush() {
        guard dirty else {
          displayLink?.isPaused = true
          return
        }
        dirty = false
        if let value = metrics(), value != last {
          last = value
          parent.onChange(value)
        }
      }
      @objc func pan(_ gesture: UIPanGestureRecognizer) {
        let phase: MobilePanSample.Phase
        switch gesture.state {
        case .began: phase = .began
        case .changed: phase = .changed
        case .ended: phase = .ended
        case .cancelled, .failed: phase = .cancelled
        default: return
        }
        let translation = gesture.translation(in: scrollView)
        let velocity = gesture.velocity(in: scrollView)
        dirty = true
        flush()
        parent.onPan(
          .init(
            phase: phase,
            translation: CGSize(width: translation.x, height: translation.y),
            velocity: CGSize(width: velocity.x, height: velocity.y),
            touches: gesture.numberOfTouches))
      }
    }

    @MainActor final class Ticker: NSObject {
      weak var owner: Coordinator?
      @objc func tick() { owner?.flush() }
    }
  }
#endif
