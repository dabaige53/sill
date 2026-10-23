import AppKit
import SwiftUI

/// Observe intent, not scroll offsets: programmatic following must not disable itself.
struct TranscriptScrollIntent: NSViewRepresentable {
  var onScroll: () -> Void
  func makeNSView(context: Context) -> NSView {
    let view = Probe()
    view.onScroll = onScroll
    return view
  }
  func updateNSView(_ view: NSView, context: Context) { (view as? Probe)?.onScroll = onScroll }
  static func dismantleNSView(_ view: NSView, coordinator: ()) { (view as? Probe)?.stop() }
  @MainActor final class Probe: NSView {
    var onScroll: () -> Void = {}
    private var monitor: Any?
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func viewDidMoveToWindow() {
      stop()
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
        MainActor.assumeIsolated {
          if let self, event.window === self.window,
            self.bounds.contains(self.convert(event.locationInWindow, from: nil))
          {
            self.onScroll()
          }
        }
        return event
      }
    }
    func stop() {
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
    }
  }
}
