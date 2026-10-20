import AppKit
import QuartzCore
import SillKit
import SwiftUI

struct EdgeGestureSample {
  enum Phase { case changed, released, cancelled }
  let edge: String
  let distance: CGFloat
  let velocity: CGFloat
  let phase: Phase
}

/// Input state is separate from drawing, so cancellation and threshold crossing can be tested.
struct EdgePullState {
  private(set) var edge = ""
  private(set) var distance: CGFloat = 0
  private var samples: [(TimeInterval, CGFloat)] = []
  mutating func update(edge next: String, delta: CGFloat, time: TimeInterval) -> EdgeGestureSample {
    if edge.isEmpty { edge = next }
    distance = max(0, distance + delta)
    samples.append((time, distance))
    samples.removeAll { time - $0.0 > AppleMetrics.gestureVelocityWindow }
    let first = samples.first
    let elapsed = first.map { time - $0.0 } ?? 0
    let velocity = elapsed > 0 ? (distance - (first?.1 ?? distance)) / elapsed / 1000 : 0
    return .init(edge: edge, distance: distance, velocity: velocity, phase: .changed)
  }
  mutating func end(cancelled: Bool) -> EdgeGestureSample {
    let sample = EdgeGestureSample(
      edge: edge, distance: distance, velocity: 0,
      phase: cancelled ? .cancelled : .released)
    self = .init()
    return sample
  }
}

struct ScrollObservation: NSViewRepresentable {
  var initialOffset: CGFloat = 0
  var enabled = true
  var restoreRequest = 0
  var requestedOffset: CGFloat = 0
  var horizontal = false
  var horizontalOnly = false
  var progressChanged: ((Double) -> Void)? = nil
  var immediateDistance: CGFloat? = nil
  var edgeGesture: ((EdgeGestureSample) -> Bool)? = nil
  var changed: (CGFloat, Bool, Bool) -> Void
  func makeNSView(context: Context) -> Probe {
    let view = Probe()
    view.initialOffset = initialOffset
    updateNSView(view, context: context)
    return view
  }
  func updateNSView(_ view: Probe, context: Context) {
    view.changed = changed
    view.enabled = enabled
    view.progressChanged = progressChanged
    view.immediateDistance = immediateDistance
    view.edgeGesture = edgeGesture
    view.horizontal = horizontal
    view.horizontalOnly = horizontalOnly
    view.restore(request: restoreRequest, offset: requestedOffset)
  }
  static func dismantleNSView(_ view: Probe, coordinator: ()) { view.stop() }

  final class Probe: NSView {
    var initialOffset: CGFloat = 0
    var enabled = true
    var changed: ((CGFloat, Bool, Bool) -> Void)?
    var progressChanged: ((Double) -> Void)?
    var immediateDistance: CGFloat?
    var horizontal = false
    var horizontalOnly = false
    var edgeGesture: ((EdgeGestureSample) -> Bool)? { didSet { updateEventMonitor() } }
    private var observer: NSObjectProtocol?
    private var focusObserver: NSObjectProtocol?
    private var monitor: Any?
    private var connectionTask: Task<Void, Never>?
    private var releaseTask: Task<Void, Never>?
    private var display: CADisplayLink?
    private var pending: EdgeGestureSample?
    private var pull = EdgePullState()
    private var committed = false
    private var restoreRequest = 0
    private weak var scroll: NSScrollView?
    func restore(request: Int, offset: CGFloat) {
      guard restoreRequest != request else { return }
      restoreRequest = request
      Task { @MainActor [weak self] in
        await Task.yield()
        guard let self, self.restoreRequest == request, let scroll = self.scroll else { return }
        scroll.contentView.scroll(to: NSPoint(x: 0, y: offset))
        scroll.reflectScrolledClipView(scroll.contentView)
      }
    }
    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      stop()
      guard window != nil else { return }
      connectionTask = Task { @MainActor [weak self] in
        await Task.yield()
        guard !Task.isCancelled, let self, self.window != nil else { return }
        self.connect()
      }
    }
    private func connect() {
      guard observer == nil, let scroll = enclosingScrollView else { return }
      self.scroll = scroll
      if !horizontalOnly {
        scroll.contentView.postsBoundsChangedNotifications = true
        scroll.contentView.scroll(to: NSPoint(x: 0, y: initialOffset))
        scroll.reflectScrolledClipView(scroll.contentView)
        observer = NotificationCenter.default.addObserver(
          forName: NSView.boundsDidChangeNotification, object: scroll.contentView, queue: .main
        ) { [weak self] _ in
          MainActor.assumeIsolated {
            guard let self, let scroll = self.scroll, let document = scroll.documentView else {
              return
            }
            let offset = scroll.contentView.bounds.minY
            let bottom = offset + scroll.contentView.bounds.height >= document.bounds.height - 1
            let user = NSApp.currentEvent?.type == .scrollWheel
            let range = max(1, document.bounds.height - scroll.contentView.bounds.height)
            self.progressChanged?(min(1, max(0, offset / range)))
            self.changed?(offset, bottom, user)
          }
        }
      }
      focusObserver = NotificationCenter.default.addObserver(
        forName: NSWindow.didResignKeyNotification, object: window, queue: .main
      ) { [weak self] _ in MainActor.assumeIsolated { self?.end(cancelled: true) } }
      display = displayLink(target: self, selector: #selector(drawEdge))
      display?.isPaused = true
      display?.add(to: .main, forMode: .common)
      updateEventMonitor()
    }
    private func updateEventMonitor() {
      guard edgeGesture != nil, monitor == nil, scroll != nil, window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
        let consumed = MainActor.assumeIsolated { self?.receive(event) == true }
        return consumed ? nil : event
      }
    }
    private func receive(_ event: NSEvent) -> Bool {
      guard enabled, let scroll, let document = scroll.documentView, let window,
        event.window === window, window.isKeyWindow, window.attachedSheet == nil,
        horizontalOnly
          ? bounds.contains(convert(event.locationInWindow, from: nil))
          : scroll.bounds.contains(scroll.convert(event.locationInWindow, from: nil))
      else { return false }
      if !event.momentumPhase.isEmpty { return committed || !pull.edge.isEmpty }
      if event.phase == .cancelled {
        end(cancelled: true)
        return true
      }
      if event.phase == .began {
        end(cancelled: true)
        committed = false
      }
      if committed { return true }
      if !horizontal && !horizontalOnly && abs(event.scrollingDeltaX) > abs(event.scrollingDeltaY) {
        return false
      }
      let offset = scroll.contentView.bounds.minY
      let bottom = offset + scroll.contentView.bounds.height >= document.bounds.height - 1
      let sideways = abs(event.scrollingDeltaX) > abs(event.scrollingDeltaY)
      let horizontalEdge =
        sideways && (horizontal || horizontalOnly)
        ? event.scrollingDeltaX > 0 ? "right" : horizontalOnly ? "left" : "" : ""
      let edge =
        !pull.edge.isEmpty
        ? pull.edge
        : !horizontalEdge.isEmpty
          ? horizontalEdge
          : horizontalOnly
            ? ""
            : offset <= 0 && event.scrollingDeltaY > 0
              ? "top"
              : bottom && event.scrollingDeltaY < 0 ? "bottom" : ""
      guard !edge.isEmpty else { return false }
      let delta =
        edge == "left" || edge == "right"
        ? event.scrollingDeltaX * (edge == "right" ? 1 : -1)
        : event.scrollingDeltaY * (edge == "top" ? 1 : -1)
      let sample = pull.update(edge: edge, delta: delta, time: event.timestamp)
      pending = sample
      if edge == "bottom", let immediateDistance, sample.distance >= immediateDistance {
        drawEdge()
      } else {
        display?.isPaused = false
      }
      releaseTask?.cancel()
      releaseTask = Task { @MainActor [weak self] in
        do { try await Task.sleep(for: .seconds(AppleMetrics.gestureWheelRest)) } catch { return }
        self?.end(cancelled: false)
      }
      return true
    }
    @objc private func drawEdge() {
      display?.isPaused = true
      guard let pending else { return }
      self.pending = nil
      if edgeGesture?(pending) == true { commit() }
    }
    private func commit() {
      committed = true
      if let window { ScrollMomentumShield.start(window: window) }
    }
    private func end(cancelled: Bool) {
      releaseTask?.cancel()
      pending = nil
      display?.isPaused = true
      guard !pull.edge.isEmpty else { return }
      let sample = pull.end(cancelled: cancelled)
      let wasCommitted = committed
      committed = false
      if !wasCommitted && edgeGesture?(sample) == true { commit() }
    }
    func stop() {
      connectionTask?.cancel()
      releaseTask?.cancel()
      display?.invalidate()
      display = nil
      if let observer { NotificationCenter.default.removeObserver(observer) }
      if let focusObserver { NotificationCenter.default.removeObserver(focusObserver) }
      if let monitor { NSEvent.removeMonitor(monitor) }
      observer = nil
      focusObserver = nil
      monitor = nil
      scroll = nil
      pending = nil
      pull = .init()
    }
  }
}

/// Outlives a closing reader, so its residual momentum cannot reach the feed.
@MainActor enum ScrollMomentumShield {
  private static var monitor: Any?
  private static var idle: Task<Void, Never>?
  static func start(window: NSWindow) {
    stop()
    monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { event in
      let consumed = MainActor.assumeIsolated {
        guard event.window === window else { return false }
        if event.phase == .began {
          stop()
          return false
        }
        armIdle()
        return true
      }
      return consumed ? nil : event
    }
    armIdle()
  }
  private static func armIdle() {
    idle?.cancel()
    idle = Task {
      do { try await Task.sleep(for: .seconds(AppleMetrics.gestureWheelRest)) } catch { return }
      stop()
    }
  }
  private static func stop() {
    idle?.cancel()
    idle = nil
    if let monitor { NSEvent.removeMonitor(monitor) }
    monitor = nil
  }
}
