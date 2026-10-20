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
  /// Where the right-click was, in window coordinates; nil places the menu at the card's corner.
  @ObservationIgnored private(set) var point: CGPoint?
  /// The menu, in window coordinates; set by the menu itself.
  @ObservationIgnored var frame: CGRect = .null
  @ObservationIgnored private unowned let workspace: Workspace
  @ObservationIgnored private var closed: (id: String, at: Date)?
  @ObservationIgnored private var monitor: Any?

  init(workspace: Workspace) { self.workspace = workspace }

  /// A right-click always opens the menu at the pointer, also when one is open (Mac context
  /// menus move to the new click). Without a pointer (VoiceOver) it toggles, as Web `more`.
  func toggle(_ id: String, at point: CGPoint? = nil) {
    if point == nil {
      if self.id == id {
        close()
        return
      }
      if let closed, closed.id == id, Date().timeIntervalSince(closed.at) < 0.4 {
        self.closed = nil
        return
      }
    }
    close()
    self.point = point
    self.id = id
    frame = .null
    Motion.instantly { workspace.state(id).menuOpen = true }
    install()
  }

  /// The menu draws its own leave motion (140ms) while `id` is already nil, then the card lets
  /// it go.
  func close() {
    guard let id else { return }
    self.id = nil
    closed = (id, Date())
    if let monitor { NSEvent.removeMonitor(monitor) }
    monitor = nil
    let state = workspace.state(id)
    Task { [weak self] in
      try? await Task.sleep(for: .seconds(AppleMetrics.motionMenuClose))
      guard self?.id != id else { return }
      Motion.instantly { state.menuOpen = false }
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
