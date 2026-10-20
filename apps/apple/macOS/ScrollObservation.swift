import AppKit
import SwiftUI

struct ScrollObservation: NSViewRepresentable {
  var initialOffset: CGFloat = 0
  var progressChanged: ((Double) -> Void)? = nil
  var overscroll: ((String) -> Void)? = nil
  var changed: (CGFloat, Bool, Bool) -> Void
  func makeNSView(context: Context) -> Probe {
    let view = Probe()
    view.initialOffset = initialOffset
    view.changed = changed
    view.progressChanged = progressChanged
    view.overscroll = overscroll
    return view
  }
  func updateNSView(_ nsView: Probe, context: Context) {
    nsView.changed = changed
    nsView.progressChanged = progressChanged
    nsView.overscroll = overscroll
  }
  static func dismantleNSView(_ nsView: Probe, coordinator: ()) { nsView.stop() }

  final class Probe: NSView {
    var initialOffset: CGFloat = 0
    var changed: ((CGFloat, Bool, Bool) -> Void)?
    var progressChanged: ((Double) -> Void)?
    var overscroll: ((String) -> Void)? {
      didSet { updateEventMonitor() }
    }
    private var observer: NSObjectProtocol?
    private var monitor: Any?
    private var connectionTask: Task<Void, Never>?
    private var edgeDistance: CGFloat = 0
    private var lastEdge = ""
    private weak var scroll: NSScrollView?
    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      stop()
      guard window != nil else { return }
      connectionTask = Task { @MainActor [weak self] in
        await Task.yield()
        guard !Task.isCancelled, let self, self.window != nil else { return }
        self.connectionTask = nil
        self.connect()
      }
    }
    private func connect() {
      guard observer == nil, let scroll = enclosingScrollView else { return }
      self.scroll = scroll
      scroll.contentView.postsBoundsChangedNotifications = true
      scroll.contentView.scroll(to: NSPoint(x: 0, y: initialOffset))
      scroll.reflectScrolledClipView(scroll.contentView)
      observer = NotificationCenter.default.addObserver(
        forName: NSView.boundsDidChangeNotification,
        object: scroll.contentView, queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, let scroll = self.scroll, let document = scroll.documentView else {
            return
          }
          let offset = scroll.contentView.bounds.minY
          let bottom = offset + scroll.contentView.bounds.height >= document.bounds.height - 1
          let userScrolled = NSApp.currentEvent?.type == .scrollWheel
          let range = max(1, document.bounds.height - scroll.contentView.bounds.height)
          self.progressChanged?(min(1, max(0, offset / range)))
          self.changed?(offset, bottom, userScrolled)
        }
      }
      updateEventMonitor()
    }
    private func updateEventMonitor() {
      guard overscroll != nil else {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
        edgeDistance = 0
        lastEdge = ""
        return
      }
      guard monitor == nil, scroll != nil, window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
        let consumed = MainActor.assumeIsolated {
          guard let self, let scroll = self.scroll, let document = scroll.documentView,
            let window = self.window, event.window === window,
            window.isKeyWindow, window.attachedSheet == nil,
            scroll.bounds.contains(scroll.convert(event.locationInWindow, from: nil))
          else { return false }
          guard event.momentumPhase.isEmpty else {
            self.edgeDistance = 0
            return false
          }
          let offset = scroll.contentView.bounds.minY
          let bottom = offset + scroll.contentView.bounds.height >= document.bounds.height - 1
          let edge =
            offset <= 0 && event.scrollingDeltaY > 0
            ? "top" : bottom && event.scrollingDeltaY < 0 ? "bottom" : ""
          if edge != self.lastEdge || event.phase == .began { self.edgeDistance = 0 }
          self.lastEdge = edge
          if !edge.isEmpty {
            self.edgeDistance += abs(event.scrollingDeltaY)
          } else {
            self.edgeDistance = 0
          }
          if event.phase == .cancelled { self.edgeDistance = 0 }
          if self.edgeDistance > scroll.bounds.height / 5, let action = self.overscroll {
            self.edgeDistance = 0
            action(edge)
            return true
          }
          return false
        }
        return consumed ? nil : event
      }
    }
    func stop() {
      connectionTask?.cancel()
      connectionTask = nil
      if let observer { NotificationCenter.default.removeObserver(observer) }
      observer = nil
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      scroll = nil
      edgeDistance = 0
      lastEdge = ""
    }
  }
}
