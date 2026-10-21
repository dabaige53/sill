import AppKit
import Observation

/// One policy for the existing surfaces. It derives ownership; it never copies their state.
@MainActor @Observable final class DesktopInteraction {
  enum Layer { case panel, reader, drag, menu, home }
  let panels: Panels
  let reader: Reader
  let shell: Shell
  let menu: CardMenu
  let drag: CardDrag

  init(panels: Panels, reader: Reader, shell: Shell, menu: CardMenu, drag: CardDrag) {
    self.panels = panels
    self.reader = reader
    self.shell = shell
    self.menu = menu
    self.drag = drag
  }

  var layer: Layer {
    if panels.kind != nil { return .panel }
    if reader.presented { return .reader }
    if drag.active { return .drag }
    if shell.menu.open || menu.id != nil { return .menu }
    return .home
  }

  var canSearch: Bool { layer == .home || layer == .menu }
  var canScrollFeed: Bool { layer == .home && !shell.searchFocused }
  var canScrollReader: Bool { layer == .reader }

  func focusSearch() {
    guard canSearch else { return }
    shell.menu.close()
    menu.close()
    shell.focusSearch()
  }

  /// Return false only when the focused control or home selection should handle Esc.
  func dismiss() -> Bool {
    switch layer {
    case .panel: panels.close()
    case .reader: reader.close()
    case .drag: drag.cancel()
    case .menu:
      if menu.id != nil { menu.close() } else { shell.menu.close() }
    case .home: return false
    }
    return true
  }
}

/// Lifecycle comes before delta filtering: an ended event often has zero movement.
enum WheelPhase: Equatable {
  case began, changed, ended, cancelled, momentum, discrete

  init(phase: NSEvent.Phase, momentum: NSEvent.Phase) {
    if !momentum.isEmpty {
      self = .momentum
    } else if phase.contains(.cancelled) {
      self = .cancelled
    } else if phase.contains(.ended) {
      self = .ended
    } else if phase.contains(.began) {
      self = .began
    } else if phase.isEmpty {
      self = .discrete
    } else {
      self = .changed
    }
  }

  init(_ event: NSEvent) { self.init(phase: event.phase, momentum: event.momentumPhase) }
}
