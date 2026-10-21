import AppKit
import Observation
import SillKit
import SwiftUI

/// Whether the tools are tucked away. The desktop top bar fades without moving.
/// Changes only when the answer flips, never per scroll frame.
@MainActor @Observable final class Chrome {
  private(set) var tucked = false
  /// Search focus, an open menu or a drag keep the chrome visible.
  @ObservationIgnored var pinned = false {
    didSet { if pinned { show() } }
  }

  func show() {
    if tucked { withAnimation(Motion.ease(AppleMetrics.motionRailShow)) { tucked = false } }
  }
  func hide() {
    guard !pinned, !tucked else { return }
    withAnimation(Motion.ease(AppleMetrics.motionRailHide)) { tucked = true }
  }
}

/// Reads the feed's scroll position from AppKit: tucks the chrome (down 28, up 14, rest 650ms,
/// edges), loads the next page near the end, and keeps each scope's position.
@MainActor final class FeedScroll {
  weak var scrollView: NSScrollView?
  let chrome: Chrome
  var nearEnd: () -> Void = {}
  let refresh = FeedRefresh()
  var refreshAllowed: () -> Bool = { true }
  private var last: CGFloat = 0
  private var down: CGFloat = 0
  private var up: CGFloat = 0
  private var rest: Task<Void, Never>?

  init(chrome: Chrome) { self.chrome = chrome }

  var offset: CGFloat { scrollView?.contentView.bounds.minY ?? 0 }

  func scrolled(offset: CGFloat, visible: CGFloat, content: CGFloat) {
    let delta = offset - last
    last = offset
    rest?.cancel()
    let atEdge = offset <= 0 || offset + visible >= content - 1
    if content - (offset + visible) < visible * 2 { nearEnd() }
    if atEdge {
      down = 0
      up = 0
      chrome.show()
      return
    }
    if delta > 0 {
      down += delta
      up = 0
      if down >= AppleMetrics.chromeHideTravel { chrome.hide() }
    } else if delta < 0 {
      up -= delta
      down = 0
      if up >= AppleMetrics.chromeShowTravel { chrome.show() }
    }
    if chrome.tucked {
      rest = Task { [chrome] in
        try? await Task.sleep(for: .seconds(AppleMetrics.chromeRest))
        guard !Task.isCancelled else { return }
        chrome.show()
      }
    }
  }

  func receive(_ event: NSEvent) -> Bool {
    guard NSEvent.pressedMouseButtons & 1 == 0 else { return false }
    guard refreshAllowed(), let view = scrollView, event.window === view.window,
      view.window?.attachedSheet == nil,
      view.bounds.contains(view.convert(event.locationInWindow, from: nil))
    else { return false }
    let phase = WheelPhase(event)
    let terminal = phase == .ended || phase == .cancelled || phase == .momentum
    guard terminal || abs(event.scrollingDeltaY) > abs(event.scrollingDeltaX) else { return false }
    let consumed = refresh.receive(delta: event.scrollingDeltaY, input: phase, atTop: offset <= 0)
    if consumed { chrome.show() }
    return consumed
  }

  func scroll(to y: CGFloat, animated: Bool = false) {
    guard let scrollView else { return }
    let point = NSPoint(x: 0, y: max(0, y))
    if animated {
      NSAnimationContext.runAnimationGroup { context in
        context.duration = AppleMetrics.motionSheet
        context.timingFunction = CAMediaTimingFunction(
          controlPoints: Float(AppleMetrics.easeSheetX1), Float(AppleMetrics.easeSheetY1),
          Float(AppleMetrics.easeSheetX2), Float(AppleMetrics.easeSheetY2))
        scrollView.contentView.animator().setBoundsOrigin(point)
      }
    } else {
      scrollView.contentView.scroll(to: point)
    }
    scrollView.reflectScrolledClipView(scrollView.contentView)
  }
}

/// Finds the enclosing NSScrollView and forwards bounds changes to `FeedScroll`.
struct ScrollProbe: NSViewRepresentable {
  let scroll: FeedScroll

  func makeNSView(context: Context) -> Probe {
    let probe = Probe()
    probe.scroll = scroll
    return probe
  }
  func updateNSView(_ view: Probe, context: Context) { view.scroll = scroll }
  static func dismantleNSView(_ view: Probe, coordinator: ()) { view.disconnect() }

  final class Probe: NSView {
    var scroll: FeedScroll?
    private var observer: NSObjectProtocol?
    private var monitor: Any?
    private var elasticity: NSScrollView.Elasticity?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      disconnect()
      guard window != nil else { return }
      DispatchQueue.main.async { [weak self] in self?.connect() }
    }

    private func connect() {
      guard observer == nil, let view = enclosingScrollView else { return }
      scroll?.scrollView = view
      elasticity = view.verticalScrollElasticity
      view.verticalScrollElasticity = .none
      monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
        nonisolated(unsafe) let event = event
        return MainActor.assumeIsolated { self?.scroll?.receive(event) == true } ? nil : event
      }
      view.contentView.postsBoundsChangedNotifications = true
      observer = NotificationCenter.default.addObserver(
        forName: NSView.boundsDidChangeNotification, object: view.contentView, queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, let view = self.scroll?.scrollView, let document = view.documentView
          else {
            return
          }
          self.scroll?.scrolled(
            offset: view.contentView.bounds.minY, visible: view.contentView.bounds.height,
            content: document.bounds.height)
        }
      }
    }

    func disconnect() {
      scroll?.refresh.cancel()
      if let elasticity { scroll?.scrollView?.verticalScrollElasticity = elasticity }
      elasticity = nil
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      if let observer { NotificationCenter.default.removeObserver(observer) }
      observer = nil
    }
  }
}

/// Tucks a chrome element with a fade; hidden elements stop taking input at once.
/// The AI box moves down; the desktop top bar uses zero travel to fade in place.
struct Tuck: ViewModifier {
  let tucked: Bool
  let travel: CGFloat
  func body(content: Content) -> some View {
    content
      .offset(y: tucked ? travel : 0)
      .opacity(tucked ? 0 : 1)
      .allowsHitTesting(!tucked)
      .accessibilityHidden(tucked)
  }
}
