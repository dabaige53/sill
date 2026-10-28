import AppKit
import Observation
import SillKit
import SwiftUI

/// Whether the tools are tucked away. The top bar owns its sliding reveal; the other tools keep their own motion.
/// Changes only when the answer flips, never per scroll frame. Only the bars read these values, so
/// a flip redraws the bars and not the workspace around them.
@MainActor @Observable final class Chrome {
  private(set) var tucked = false
  /// The bars step aside for an open card.
  private(set) var yielding = false
  /// The feed rests at its top; an open card leaves the bars in place there. Not observed: it
  /// changes while scrolling and only matters when a card opens.
  @ObservationIgnored private(set) var atTop = true
  /// Search focus, an open menu or a drag keep the chrome visible.
  @ObservationIgnored var pinned = false {
    didSet { if pinned { show() } }
  }

  /// Bars coming back on their own use the slower reveal. Keyboard-driven changes are instant.
  func show() {
    guard tucked else { return }
    withAnimation(Motion.keyboardDriven ? nil : Motion.reveal) { tucked = false }
  }
  func rest(atTop value: Bool) { atTop = value }
  /// A card opening below the feed top takes the desktop; as it starts to close the bars come back
  /// with it on the card spring, even if reading the feed had tucked them. The bars animate this
  /// change themselves.
  func yield(to card: Bool) {
    if card {
      if !atTop, !yielding { yielding = true }
    } else if yielding {
      yielding = false
      tucked = false
    } else if tucked {
      // Nothing keyed changes for the bars, so this transaction carries the closing pace.
      withAnimation(Motion.keyboardDriven ? nil : Motion.card) {
        tucked = false
      }
    }
  }
  func hide() {
    guard !pinned, !tucked else { return }
    withAnimation(Motion.keyboardDriven ? nil : Motion.ease(AppleMetrics.motionRailHide)) {
      tucked = true
    }
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

  /// Distance scrolled from the top, 0 at rest. On macOS 26 the top bar is a safe-area bar, so
  /// the clip view rests at minus the bar height; reading the raw origin would call cards still
  /// tucked under the bar "at the top" and let a pull to refresh take the scroll back.
  var offset: CGFloat {
    guard let clip = scrollView?.contentView else { return 0 }
    return clip.bounds.minY + clip.contentInsets.top
  }

  func scrolled(offset raw: CGFloat, top: CGFloat = 0, visible: CGFloat, content: CGFloat) {
    let offset = raw + top
    let delta = offset - last
    last = offset
    rest?.cancel()
    chrome.rest(atTop: offset <= 0)
    let atEdge = offset <= 0 || raw + visible >= content - 1
    if content - (raw + visible) < visible * 2 { nearEnd() }
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
    let top = scrollView.contentView.contentInsets.top
    let point = NSPoint(x: 0, y: max(0, y) - top)
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

/// The AI box and selection bar follow the chrome: scrolling animates through `Chrome`, an open
/// card through this modifier. A carried pile keeps them in view.
struct RailTuck: ViewModifier {
  let carrying: Bool
  /// The AI full view stays put while a card opens over it.
  var held = false
  @Environment(Chrome.self) private var chrome
  func body(content: Content) -> some View {
    content
      .modifier(
        Tuck(
          tucked: (chrome.tucked || chrome.yielding) && !carrying && !held,
          travel: AppleMetrics.motionRailTravel)
      )
      .animation(
        Motion.keyboardDriven
          ? nil
          : chrome.yielding ? Motion.ease(AppleMetrics.motionRailHide) : Motion.card,
        value: chrome.yielding
      )
  }
}

/// Tucks a chrome element with a fade; hidden elements stop taking input at once.
/// The AI box moves down; TopBarReveal owns the desktop header motion.
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
