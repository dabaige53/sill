#if os(iOS)
  import SillKit
  import SwiftUI
  import UIKit

  struct MobileReaderAnchors: PreferenceKey {
    static let defaultValue: [String: CGFloat] = [:]
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
      value.merge(nextValue(), uniquingKeysWith: { _, latest in latest })
    }
  }

  extension View {
    func mobileReaderAnchor(_ id: String) -> some View {
      background {
        GeometryReader { geometry in
          Color.clear.preference(
            key: MobileReaderAnchors.self,
            value: [id: geometry.frame(in: .named("mobile-reader-content")).minY])
        }
      }
    }
  }

  /// Native inertia stays with UIScrollView; an edge gesture takes ownership only after its direction is clear.
  struct MobileReaderScroll<Content: View>: UIViewControllerRepresentable {
    let layer: MobileReaderLayer
    let active: Bool
    let finishEnabled: Bool
    let anchors: [String: CGFloat]
    let reachedEnd: () -> Void
    @ViewBuilder var content: Content

    func makeUIViewController(context: Context) -> Controller {
      Controller(content: content, layer: layer, reachedEnd: reachedEnd)
    }

    func updateUIViewController(_ controller: Controller, context: Context) {
      controller.host.rootView = content
      let resuming = active && !controller.active
      controller.active = active
      controller.finishEnabled = finishEnabled
      controller.anchors = anchors
      controller.reachedEnd = reachedEnd
      controller.scroll.isScrollEnabled = active && !layer.pending && !layer.confirmed
      controller.edgePan.isEnabled = active && !layer.leaving
      if controller.request != layer.scrollRequest {
        controller.request = layer.scrollRequest
        if let target = layer.scrollTarget, let position = anchors[target] {
          controller.navigate(to: position)
        }
      }
      if !active { controller.cancelInput() } else if resuming { controller.resumeInput() }
      controller.view.setNeedsLayout()
    }

    static func dismantleUIViewController(_ controller: Controller, coordinator: ()) {
      controller.active = false
      controller.cancelInput()
      controller.scroll.delegate = nil
    }

    @MainActor
    final class Controller: UIViewController, UIScrollViewDelegate, UIGestureRecognizerDelegate {
      let scroll = UIScrollView()
      let host: UIHostingController<Content>
      let layer: MobileReaderLayer
      let edgePan = UIPanGestureRecognizer()
      var active = true
      var finishEnabled = false
      var anchors: [String: CGFloat] = [:]
      var reachedEnd: () -> Void
      var request: UUID
      private var mode = MobileReaderPolicy.Drag.none
      private var velocity = MobileReaderVelocity()
      private var distance: CGFloat = 0
      private var baseOffset: CGFloat = 0
      private var cancelled = false
      private var reportedEnd = false
      private var dwell: Task<Void, Never>?
      private var expansion: Task<Void, Never>?
      private var navigation: UIViewPropertyAnimator?
      private var correcting = false
      private weak var touchedView: UIView?

      init(content: Content, layer: MobileReaderLayer, reachedEnd: @escaping () -> Void) {
        host = UIHostingController(rootView: content)
        self.layer = layer
        self.reachedEnd = reachedEnd
        request = layer.scrollRequest
        super.init(nibName: nil, bundle: nil)
      }
      required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

      override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        scroll.backgroundColor = .clear
        scroll.showsVerticalScrollIndicator = false
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.bounces = false
        scroll.delegate = self
        scroll.panGestureRecognizer.maximumNumberOfTouches = 1
        scroll.panGestureRecognizer.addTarget(self, action: #selector(nativePanChanged))
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        addChild(host)
        host.view.backgroundColor = .clear
        host.sizingOptions = [.intrinsicContentSize]
        host.view.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(host.view)
        host.didMove(toParent: self)
        NSLayoutConstraint.activate([
          scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
          scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
          scroll.topAnchor.constraint(equalTo: view.topAnchor),
          scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
          host.view.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
          host.view.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
          host.view.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
          host.view.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
          host.view.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        ])
        edgePan.maximumNumberOfTouches = 1
        edgePan.cancelsTouchesInView = true
        edgePan.delegate = self
        edgePan.addTarget(self, action: #selector(edgeChanged))
        scroll.addGestureRecognizer(edgePan)
        scroll.panGestureRecognizer.require(toFail: edgePan)
      }

      override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let offset = scroll.contentOffset.y
        let maximum = max(0, scroll.contentSize.height - scroll.bounds.height)
        let viewport = scroll.bounds.height
        let content = scroll.contentSize.height
        Task { @MainActor [weak self] in
          guard let self, self.active, content > 0 else { return }
          self.layer.scroll(offset: offset, maximum: maximum, viewport: viewport, content: content)
          self.checkEnd()
        }
      }

      func navigate(to position: CGFloat) {
        navigation?.stopAnimation(true)
        let maximum = max(0, scroll.contentSize.height - scroll.bounds.height)
        let timing = UICubicTimingParameters(
          controlPoint1: CGPoint(x: AppleMetrics.easeX1, y: AppleMetrics.easeY1),
          controlPoint2: CGPoint(x: AppleMetrics.easeX2, y: AppleMetrics.easeY2))
        let animator = UIViewPropertyAnimator(
          duration: AppleMetrics.motionBase, timingParameters: timing)
        animator.addAnimations { [weak self] in
          self?.scroll.contentOffset.y = min(maximum, max(0, position))
        }
        navigation = animator
        animator.startAnimation()
      }

      func cancelInput() {
        expansion?.cancel()
        dwell?.cancel()
        dwell = nil
        navigation?.stopAnimation(true)
        cancelled = true
        mode = .none
      }

      func resumeInput() {
        cancelled = false
        dwell = nil
      }

      func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch)
        -> Bool
      {
        touchedView = touch.view
        return active && !excluded(touch.view)
      }

      func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard active, !layer.leaving, !excluded(touchedView) else { return false }
        let translation = edgePan.translation(in: scroll)
        let speed = edgePan.velocity(in: scroll)
        let x = abs(translation.x) > 0 ? translation.x : speed.x
        let y = abs(translation.y) > 0 ? translation.y : speed.y
        let maximum = max(0, scroll.contentSize.height - scroll.bounds.height)
        mode = MobileReaderPolicy.direction(
          x: Double(x), y: Double(y),
          atTop: scroll.contentOffset.y <= AppleMetrics.space2,
          atBottom: scroll.contentOffset.y >= maximum - AppleMetrics.space2,
          full: layer.full, finishEnabled: finishEnabled)
        return mode != .none
      }

      private func excluded(_ view: UIView?) -> Bool {
        var candidate = view
        while let current = candidate, current !== scroll {
          if current is UIControl || current is UITextView || current is UITextField { return true }
          if String(describing: type(of: current)).hasPrefix("WK") { return true }
          if let nested = current as? UIScrollView,
            nested.contentSize.width > nested.bounds.width + AppleMetrics.space2
          {
            return true
          }
          candidate = current.superview
        }
        return false
      }

      @objc private func edgeChanged() {
        guard active else {
          cancelInput()
          return
        }
        let translation = edgePan.translation(in: scroll)
        switch edgePan.state {
        case .began:
          navigation?.stopAnimation(true)
          expansion?.cancel()
          dwell?.cancel()
          dwell = nil
          cancelled = false
          baseOffset = scroll.contentOffset.y
          distance = 0
          velocity = MobileReaderVelocity()
          velocity.feed(0, at: CACurrentMediaTime())
          follow(translation)
        case .changed:
          follow(translation)
        case .ended:
          follow(translation)
          release(cancelled: false)
        case .cancelled, .failed:
          release(cancelled: true)
        default: break
        }
      }

      private func follow(_ translation: CGPoint) {
        if layer.pending || layer.confirmed { return }
        switch mode {
        case .down:
          distance = max(0, translation.y)
          layer.drag.height = distance
        case .right:
          distance = max(0, translation.x)
          layer.drag.width = distance
        case .finish:
          distance = max(0, -translation.y) * AppleMetrics.mobileFinishTouchScale
          layer.pullFinish(distance)
        case .edge:
          distance = max(0, -translation.y)
          layer.edge =
            -AppleMetrics.gestureEdgeLimit * distance / (distance + AppleMetrics.gestureEdgeLimit)
        default: break
        }
        velocity.feed(Double(distance), at: CACurrentMediaTime())
      }

      private func release(cancelled: Bool) {
        let resolution = MobileReaderPolicy.release(
          mode, distance: Double(distance), velocity: velocity.value,
          width: Double(scroll.bounds.width), cancelled: cancelled, canExpand: layer.canExpand,
          committed: layer.pending || layer.confirmed)
        mode = .none
        self.cancelled = cancelled
        switch resolution {
        case .close: layer.close()
        case .awaitFinish: layer.releaseFinish()
        default: layer.rebound(velocity: velocity.value)
        }
      }

      @objc private func nativePanChanged() {
        if scroll.panGestureRecognizer.state == .cancelled
          || scroll.panGestureRecognizer.state == .failed
        {
          cancelled = true
          expansion?.cancel()
        }
      }

      func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        cancelled = false
        expansion?.cancel()
        navigation?.stopAnimation(true)
      }

      func scrollViewDidScroll(_ scrollView: UIScrollView) {
        guard active, !correcting else { return }
        if mode != .none {
          correcting = true
          scrollView.contentOffset.y = baseOffset
          correcting = false
          return
        }
        layer.scroll(
          offset: scrollView.contentOffset.y,
          maximum: max(0, scrollView.contentSize.height - scrollView.bounds.height),
          viewport: scrollView.bounds.height, content: scrollView.contentSize.height)
        checkEnd()
      }

      private func checkEnd() {
        guard active, !reportedEnd, scroll.contentSize.height > 0, layer.settled else { return }
        let maximum = max(0, scroll.contentSize.height - scroll.bounds.height)
        if maximum > AppleMetrics.space2 {
          if scroll.contentOffset.y >= maximum - AppleMetrics.readEndSlack {
            reportedEnd = true
            reachedEnd()
          }
        } else if dwell == nil {
          dwell = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(AppleMetrics.readDwell)) } catch { return }
            guard let self, self.active, !self.cancelled, self.layer.settled else { return }
            self.reportedEnd = true
            self.reachedEnd()
          }
        }
      }

      func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        if !decelerate { scheduleExpansion() }
      }
      func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { scheduleExpansion() }

      private func scheduleExpansion() {
        expansion?.cancel()
        guard active, !cancelled, !layer.full, layer.canExpand,
          scroll.contentOffset.y > AppleMetrics.mobileScrollExpandThreshold
        else { return }
        let token = layer.generation
        expansion = Task { [weak self] in
          do { try await Task.sleep(for: .seconds(AppleMetrics.gestureWheelRest)) } catch { return }
          guard let self, self.active, !self.cancelled, !self.scroll.isTracking,
            !self.scroll.isDragging, !self.scroll.isDecelerating,
            self.layer.generation == token
          else { return }
          self.layer.resize(true)
        }
      }
    }
  }
#endif
