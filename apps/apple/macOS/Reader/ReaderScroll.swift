import AppKit
import Observation
import SillKit
import SwiftUI

/// What one open layer draws from its scrolling: pulls, the finish ring, chrome and progress.
/// Only the few small views that move observe it; the article text never redraws per frame.
@MainActor @Observable final class ReaderMotion {
  /// Bottom pull past the end (0…`gesture-finish-distance`).
  var finish: CGFloat = 0
  /// Elastic offset at an edge when the finish gesture does not apply (at most 14px).
  var edge: CGFloat = 0
  /// Top pull (pull down to close).
  var dismiss: CGFloat = 0
  /// Sideways swipe to close.
  var swipe: CGFloat = 0
  var confirmed = false
  var scrolled = false
  var scrollOffset: CGFloat = 0
  var toolsHidden = false
  /// Drawn by the reader's 2px bar only.
  var progress: Double = 0

  var contentOffset: CGFloat { -finish * AppleMetrics.gestureFinishTravel + edge }
  var surfaceWidth: CGFloat = 1
  var dimOpacity: Double {
    let progress = max(
      dismiss / AppleMetrics.gestureDismissDistance,
      swipe / max(1, surfaceWidth * AppleMetrics.motionDeckTravel))
    return Double(1 - min(1, max(0, progress)) * 0.7)
  }
}

/// Connects a layer's NSScrollView: position, end of text, edge pulls and chrome hiding.
@MainActor final class ReaderScroll {
  let motion = ReaderMotion()
  var inputAllowed: () -> Bool = { true }
  weak var scrollView: NSScrollView?
  var finishEnabled = false
  /// Space after the end marker (toolbar room and bottom padding).
  var trailing: CGFloat = 0
  var initialOffset: CGFloat = 0
  var progressChanged: (Double) -> Void = { _ in }
  var reachedEnd: () -> Void = {}
  /// The finish ring reached its distance: write read, then call `done` to confirm or not.
  var finished: (_ done: @escaping (Bool) -> Void) -> Void = { $0(true) }
  var close: () -> Void = {}
  var offsetChanged: (CGFloat) -> Void = { _ in }

  private var edgeName: Edge?
  private var samples: [(TimeInterval, CGFloat)] = []
  private var distance: CGFloat = 0
  private var committed = false
  /// The input that reached the finish distance has let go; the layer closes once confirmed.
  private var finishReleased = false
  private var rest: Task<Void, Never>?
  private var toolsRest: Task<Void, Never>?
  private var last: CGFloat = 0
  private var down: CGFloat = 0
  private var up: CGFloat = 0
  private var reported = false
  private var dwell: Task<Void, Never>?
  private var connected = true
  private var completionGeneration = 0

  private enum Edge { case bottom, right }

  // MARK: Position

  func connected(_ view: NSScrollView) {
    connected = true
    scrollView = view
    view.contentView.scroll(to: NSPoint(x: 0, y: initialOffset))
    view.reflectScrolledClipView(view.contentView)
    boundsChanged()
    // Short text has nothing to scroll: an uninterrupted visible dwell counts as reading it.
    if available <= 2 {
      dwell = Task { [weak self] in
        try? await Task.sleep(for: .seconds(AppleMetrics.readDwell))
        guard !Task.isCancelled, let self, NSApp.isActive, self.scrollView?.window != nil else {
          return
        }
        self.report()
      }
    }
  }

  func disconnect() {
    connected = false
    completionGeneration += 1
    dwell?.cancel()
    rest?.cancel()
    toolsRest?.cancel()
  }

  private var available: CGFloat {
    guard let view = scrollView, let document = view.documentView else { return 0 }
    return document.bounds.height - view.contentView.bounds.height
  }

  func boundsChanged() {
    guard let view = scrollView, let document = view.documentView else { return }
    let offset = view.contentView.bounds.minY
    motion.scrollOffset = offset
    let visible = view.contentView.bounds.height
    offsetChanged(offset)
    let end = document.bounds.height - trailing
    let reached = available <= 2 || offset + visible >= end - AppleMetrics.readEndSlack
    let actual = reached ? 1 : max(0, min(1, offset / max(1, available)))
    if abs(motion.progress - actual) > 0.001 { motion.progress = actual }
    progressChanged(actual)
    if reached, available > 2 { report() }
    let scrolled = offset > AppleMetrics.scrolledThreshold
    if motion.scrolled != scrolled { motion.scrolled = scrolled }
    tools(offset: offset, atEdge: offset <= AppleMetrics.space24 || reached)
  }

  private func report() {
    guard !reported, inputAllowed() else { return }
    reported = true
    reachedEnd()
  }

  /// Toolbar and head discs: hide after 28 down, return after 14 up, a 650ms rest or an edge.
  private func tools(offset: CGFloat, atEdge: Bool) {
    let delta = offset - last
    last = offset
    toolsRest?.cancel()
    if atEdge {
      down = 0
      up = 0
      setTools(hidden: false)
      return
    }
    if delta > 0 {
      down += delta
      up = 0
      if down >= AppleMetrics.chromeHideTravel { setTools(hidden: true) }
    } else if delta < 0 {
      up -= delta
      down = 0
      if up >= AppleMetrics.chromeShowTravel { setTools(hidden: false) }
    }
    if motion.toolsHidden {
      toolsRest = Task { [weak self] in
        try? await Task.sleep(for: .seconds(AppleMetrics.chromeRest))
        guard !Task.isCancelled else { return }
        self?.setTools(hidden: false)
      }
    }
  }

  func setTools(hidden: Bool) {
    guard motion.toolsHidden != hidden else { return }
    withAnimation(Motion.sheet(hidden ? AppleMetrics.motionRailHide : AppleMetrics.motionRailShow))
    {
      motion.toolsHidden = hidden
    }
  }

  // MARK: Edge pulls

  /// Trackpad and wheel input at the text's edges. Returns true when the event is consumed.
  func receive(_ event: NSEvent) -> Bool {
    guard inputAllowed(), let view = scrollView, let window = view.window, event.window === window,
      window.attachedSheet == nil,
      view.bounds.contains(view.convert(event.locationInWindow, from: nil))
    else { return false }
    motion.surfaceWidth = view.bounds.width
    let phase = WheelPhase(event)
    if committed {
      // The check waits for the hand: lifting off the trackpad (end or momentum) closes the layer;
      // a mouse wheel lets go when its clicks stop.
      switch phase {
      case .ended, .cancelled, .momentum: releaseFinish()
      case .discrete: restThenReleaseFinish()
      default: break
      }
      return true
    }
    if phase == .momentum { return edgeName != nil }
    if phase == .ended || phase == .cancelled {
      let owned = edgeName != nil
      if owned { release(cancelled: phase == .cancelled) }
      return owned
    }
    if phase == .began { reset() }
    let offset = view.contentView.bounds.minY
    motion.scrollOffset = offset
    let atBottom = offset >= available - 1
    let sideways = abs(event.scrollingDeltaX) > abs(event.scrollingDeltaY)
    let edge: Edge? =
      edgeName
      ?? (sideways && event.scrollingDeltaX > 0
        ? .right
        : sideways
          ? nil
          : atBottom && event.scrollingDeltaY < 0 ? .bottom : nil)
    guard let edge else { return false }
    edgeName = edge
    let delta: CGFloat =
      switch edge {
      case .bottom: -event.scrollingDeltaY
      case .right: event.scrollingDeltaX
      }
    distance = max(0, distance + delta)
    samples.append((event.timestamp, distance))
    samples.removeAll { event.timestamp - $0.0 > AppleMetrics.gestureVelocityWindow }
    follow(edge)
    rest?.cancel()
    if phase == .discrete {
      rest = Task { [weak self] in
        try? await Task.sleep(for: .seconds(AppleMetrics.gestureWheelRest))
        guard !Task.isCancelled, let self else { return }
        if self.committed { self.releaseFinish() } else { self.release(cancelled: false) }
      }
    }
    return true
  }

  private func restThenReleaseFinish() {
    rest?.cancel()
    rest = Task { [weak self] in
      try? await Task.sleep(for: .seconds(AppleMetrics.gestureWheelRest))
      guard !Task.isCancelled else { return }
      self?.releaseFinish()
    }
  }

  /// The hand let go after the finish distance: close now, or as soon as the write confirms.
  func releaseFinish() {
    guard committed, !finishReleased else { return }
    finishReleased = true
    rest?.cancel()
    // Close from the current displaced content; a separate rebound breaks the return path.
    if motion.confirmed { close() }
  }

  private func follow(_ edge: Edge) {
    switch edge {
    case .right:
      motion.swipe = distance
    case .bottom where finishEnabled:
      motion.finish = min(distance, AppleMetrics.gestureFinishDistance)
      // Finishing completes the moment the distance is reached, not on release.
      if distance >= AppleMetrics.gestureFinishDistance { commitFinish() }
    case .bottom:
      motion.edge =
        -AppleMetrics.gestureEdgeLimit * distance / (distance + AppleMetrics.gestureEdgeLimit)
    }
  }

  private var velocity: CGFloat {
    guard let first = samples.first, let last = samples.last, last.0 > first.0 else { return 0 }
    return (last.1 - first.1) / CGFloat(last.0 - first.0) / 1000
  }

  private func release(cancelled: Bool) {
    rest?.cancel()
    guard let edge = edgeName, !committed else { return }
    let width = scrollView?.bounds.width ?? 1
    let flick =
      distance > AppleMetrics.gestureFlickDistance && velocity > AppleMetrics.gestureFlickSpeed
    let close: Bool =
      switch edge {
      case .right: !cancelled && (distance >= width * AppleMetrics.motionDeckTravel || flick)
      case .bottom: false
      }
    if close {
      committed = true
      MomentumShield.start(window: scrollView?.window)
      self.close()
      return
    }
    let speed = velocity
    reset()
    withAnimation(Motion.spring(velocity: Double(speed))) {
      motion.dismiss = 0
      motion.swipe = 0
      motion.finish = 0
      motion.edge = 0
    }
    setTools(hidden: false)
  }

  func commitFinish() {
    guard !committed else { return }
    committed = true
    finishReleased = false
    completionGeneration += 1
    let generation = completionGeneration
    rest?.cancel()
    MomentumShield.start(window: scrollView?.window)
    finished { [weak self] success in
      guard let self, self.connected, self.inputAllowed(), self.completionGeneration == generation
      else { return }
      guard success else {
        self.committed = false
        self.reset()
        withAnimation(Motion.spring()) { self.motion.finish = 0 }
        return
      }
      // A blue disc with a white check; the layer leaves once the hand lets go.
      self.motion.confirmed = true
      if self.finishReleased { self.close() }
    }
  }

  private func reset() {
    edgeName = nil
    distance = 0
    samples = []
  }

  func cancelGesture() {
    completionGeneration += 1
    committed = false
    release(cancelled: true)
    reset()
    withAnimation(Motion.spring()) {
      motion.dismiss = 0
      motion.swipe = 0
      motion.finish = 0
      motion.edge = 0
      motion.confirmed = false
    }
  }
}

/// Keeps a closing layer's leftover momentum from scrolling the feed.
@MainActor enum MomentumShield {
  private static var monitor: Any?
  private static var idle: Task<Void, Never>?

  static func start(window: NSWindow?) {
    guard let window else { return }
    stop()
    monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { event in
      // Monitors run on the main thread; the event never leaves it.
      nonisolated(unsafe) let event = event
      let consumed = MainActor.assumeIsolated {
        guard event.window === window else { return false }
        if WheelPhase(event) != .momentum {
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
      try? await Task.sleep(for: .seconds(AppleMetrics.gestureWheelRest))
      guard !Task.isCancelled else { return }
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

/// Finds the layer's NSScrollView and forwards its bounds and scroll-wheel events.
struct ReaderScrollProbe: NSViewRepresentable {
  let scroll: ReaderScroll

  func makeNSView(context: Context) -> Probe {
    let probe = Probe()
    probe.scroll = scroll
    return probe
  }
  func updateNSView(_ view: Probe, context: Context) {}
  static func dismantleNSView(_ view: Probe, coordinator: ()) { view.disconnect() }

  final class Probe: NSView {
    var scroll: ReaderScroll?
    private var observer: NSObjectProtocol?
    private var monitor: Any?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      guard window != nil else {
        disconnect()
        return
      }
      DispatchQueue.main.async { [weak self] in self?.connect() }
    }

    private func connect() {
      guard observer == nil, let view = enclosingScrollView, let scroll else { return }
      view.contentView.postsBoundsChangedNotifications = true
      scroll.connected(view)
      observer = NotificationCenter.default.addObserver(
        forName: NSView.boundsDidChangeNotification, object: view.contentView, queue: .main
      ) { [weak self] _ in MainActor.assumeIsolated { self?.scroll?.boundsChanged() } }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
        nonisolated(unsafe) let event = event
        let consumed = MainActor.assumeIsolated { self?.scroll?.receive(event) == true }
        return consumed ? nil : event
      }
    }

    func disconnect() {
      scroll?.disconnect()
      if let observer { NotificationCenter.default.removeObserver(observer) }
      if let monitor { NSEvent.removeMonitor(monitor) }
      observer = nil
      monitor = nil
    }
  }
}

/// The finish ring: a 40px disc with a progress arc; a blue disc with a white check once done.
struct FinishRing: View {
  let motion: ReaderMotion
  var body: some View {
    let reveal = min(1, motion.finish / AppleMetrics.gestureFinishReveal)
    ZStack {
      Circle().fill(motion.confirmed ? AppleColors.accentFill : AppleColors.card)
        .shadow(.floating)
      if motion.confirmed {
        Icon("check", size: AppleMetrics.space24).foregroundStyle(AppleColors.fixedWhite)
      } else {
        Circle().trim(from: 0, to: min(1, motion.finish / AppleMetrics.gestureFinishDistance))
          .stroke(
            AppleColors.accent,
            style: StrokeStyle(lineWidth: AppleMetrics.selectionLineWidth, lineCap: .round)
          )
          .rotationEffect(.degrees(-90))
          .padding(AppleMetrics.space10)
      }
    }
    .frame(width: AppleMetrics.space40, height: AppleMetrics.space40)
    .opacity(motion.confirmed ? 1 : reveal)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/// Moves a layer's content with its pulls. Only this modifier observes the per-frame values.
struct ReaderPullOffset: ViewModifier {
  let motion: ReaderMotion
  func body(content: Content) -> some View {
    content.offset(y: motion.contentOffset)
  }
}

/// Hides a layer's floating tools while reading on.
struct ReaderToolsTuck: ViewModifier {
  @Environment(Reader.self) private var reader
  let motion: ReaderMotion
  var top = false
  var enabled = true
  func body(content: Content) -> some View {
    // Web `bindPush`: while the finish ring is pulled, the bottom toolbar fades and drops 16px
    // so the ring has the place to itself.
    let pushing = enabled && !top && (motion.finish > 0 || motion.confirmed)
    let tucked = enabled && motion.toolsHidden && !reader.travelling
    let hidden = tucked || pushing
    content
      .opacity(hidden ? 0 : 1)
      .offset(
        y: pushing
          ? AppleMetrics.space16
          : tucked ? (top ? -AppleMetrics.space12 : AppleMetrics.motionRailTravel) : 0
      )
      .allowsHitTesting(!hidden)
      .accessibilityHidden(hidden)
  }
}

/// Dismiss gestures carry the sheet, its background and tools together.
struct ReaderSurfaceOffset: ViewModifier {
  let motion: ReaderMotion
  func body(content: Content) -> some View {
    content.offset(x: motion.swipe, y: motion.dismiss)
  }
}
