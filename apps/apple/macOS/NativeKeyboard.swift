import AppKit
import SwiftUI

/// Routes the Web shortcuts through AppKit while preserving text input and IME events.
struct NativeKeyboard: NSViewRepresentable {
  var handle: (NSEvent, Bool) -> Bool
  func makeCoordinator() -> Coordinator { Coordinator(handle: handle) }
  func makeNSView(context: Context) -> NSView {
    let view = NSView()
    context.coordinator.view = view
    context.coordinator.start()
    return view
  }
  func updateNSView(_ nsView: NSView, context: Context) { context.coordinator.handle = handle }
  static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) { coordinator.stop() }
  @MainActor final class Coordinator {
    weak var view: NSView?
    var handle: (NSEvent, Bool) -> Bool
    private var monitor: Any?
    init(handle: @escaping (NSEvent, Bool) -> Bool) { self.handle = handle }
    func start() {
      monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
        let consumed = MainActor.assumeIsolated {
          guard let self, event.window === self.view?.window else { return false }
          let responder = event.window?.firstResponder
          let typing = responder is NSTextView || responder is NSTextField
          if let text = responder as? NSTextView, text.hasMarkedText() { return false }
          return self.handle(event, typing)
        }
        return consumed ? nil : event
      }
    }
    func stop() {
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
    }
  }
}
