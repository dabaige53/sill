import AppKit
import Observation
import SillKit
import SwiftUI

/// The card's menu (Web `more` / `closeMore`), opened by right-click; the Mac card has no more
/// button. One menu at a time; the open card draws it.
/// A click anywhere outside it, Esc, or any item closes it. The click that closes it still goes
/// where it was aimed.
@MainActor @Observable final class CardMenu {
  private(set) var id: String?
  /// The menu, in window coordinates; set by the menu itself.
  @ObservationIgnored var frame: CGRect = .null
  @ObservationIgnored private unowned let workspace: Workspace
  @ObservationIgnored private var closed: (id: String, at: Date)?
  @ObservationIgnored private var monitor: Any?

  init(workspace: Workspace) { self.workspace = workspace }

  /// Right-click toggles the menu. A right-click outside closes it first, so the same press on
  /// its own card does not open it again.
  func toggle(_ id: String) {
    if self.id == id {
      close()
      return
    }
    if let closed, closed.id == id, Date().timeIntervalSince(closed.at) < 0.4 {
      self.closed = nil
      return
    }
    close()
    self.id = id
    frame = .null
    animate(Motion.menuOpen) { workspace.state(id).menuOpen = true }
    install()
  }

  func close() {
    guard let id else { return }
    self.id = nil
    closed = (id, Date())
    animate(Motion.menuClose) { workspace.state(id).menuOpen = false }
    if let monitor { NSEvent.removeMonitor(monitor) }
    monitor = nil
  }

  /// A menu opened from the keyboard appears at once (Web skips the motion for keyboard input).
  private func animate(_ animation: Animation, _ change: () -> Void) {
    if Motion.keyboardDriven {
      Motion.instantly(change)
    } else {
      withAnimation(animation, change)
    }
  }

  private func install() {
    guard monitor == nil else { return }
    monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) {
      event in
      nonisolated(unsafe) let event = event
      MainActor.assumeIsolated {
        guard let menu = Self.current, let view = event.window?.contentView else { return }
        let point = event.locationInWindow
        let flipped = CGPoint(x: point.x, y: view.bounds.height - point.y)
        if !menu.frame.contains(flipped) { menu.close() }
      }
      return event
    }
    Self.current = self
  }

  private static weak var current: CardMenu?
}
