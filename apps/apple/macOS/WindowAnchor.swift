import AppKit
import SwiftUI

/// Converts toolbar and content anchors to the same window coordinate space.
struct WindowAnchor: NSViewRepresentable {
  let changed: (CGRect) -> Void
  func makeNSView(context: Context) -> Probe {
    let probe = Probe()
    probe.changed = changed
    return probe
  }
  func updateNSView(_ view: Probe, context: Context) {
    view.changed = changed
    view.publish()
  }
  final class Probe: NSView {
    var changed: ((CGRect) -> Void)?
    private var last = CGRect.null
    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      publish()
    }
    override func setFrameSize(_ size: NSSize) {
      super.setFrameSize(size)
      publish()
    }
    override func setFrameOrigin(_ point: NSPoint) {
      super.setFrameOrigin(point)
      publish()
    }
    func publish() {
      guard window != nil else { return }
      let rect = convert(bounds, to: nil)
      guard rect != last else { return }
      last = rect
      Task { @MainActor [weak self] in self?.changed?(rect) }
    }
  }
}
