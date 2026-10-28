import AppKit
import SwiftUI

/// Coordinate conversion for separately hosted cards. Neither object publishes scroll offsets.
@MainActor final class FeedViewportSpace {
  weak var view: NSScrollView?
  var origin: CGPoint = .zero
}

@MainActor final class FeedCellSpace {
  weak var host: NSView?
  var viewport: FeedViewportSpace?

  func windowPoint(_ point: CGPoint) -> CGPoint {
    guard let host, let window = host.window else { return point }
    let converted = host.convert(point, to: nil)
    return CGPoint(x: converted.x, y: (window.contentView?.bounds.height ?? 0) - converted.y)
  }

  func frame(of view: NSView) -> CGRect? {
    guard view.window != nil, let viewport, let scroll = viewport.view else { return nil }
    let rect = view.convert(view.bounds, to: scroll)
    let y = scroll.isFlipped ? rect.minY : scroll.bounds.height - rect.maxY
    return CGRect(
      x: rect.minX + viewport.origin.x, y: y + viewport.origin.y,
      width: rect.width, height: rect.height)
  }
}

private struct FeedCellSpaceKey: EnvironmentKey {
  static let defaultValue: FeedCellSpace? = nil
}

extension EnvironmentValues {
  var feedCellSpace: FeedCellSpace? {
    get { self[FeedCellSpaceKey.self] }
    set { self[FeedCellSpaceKey.self] = newValue }
  }
}

@MainActor final class FeedCardFrame {
  weak var view: NSView?
  var space: FeedCellSpace?
  var frame: CGRect? { view.flatMap { space?.frame(of: $0) } }
}

/// Read the native frame only when opening/closing a reader, rather than reporting every scroll tick.
struct FeedCardAnchor: NSViewRepresentable {
  let id: String
  let reader: Reader
  let space: FeedCellSpace

  @MainActor final class Coordinator {
    let source = FeedCardFrame()
    var id: String?
    weak var reader: Reader?
    func detach() {
      if let id, reader?.nativeCardFrames[id] === source {
        reader?.nativeCardFrames.removeValue(forKey: id)
      }
    }
  }

  func makeCoordinator() -> Coordinator { Coordinator() }
  func makeNSView(context: Context) -> NSView { NSView() }
  func updateNSView(_ view: NSView, context: Context) {
    let owner = context.coordinator
    if owner.id != id { owner.detach() }
    owner.id = id
    owner.reader = reader
    owner.source.view = view
    owner.source.space = space
    reader.nativeCardFrames[id] = owner.source
  }
  static func dismantleNSView(_ view: NSView, coordinator: Coordinator) { coordinator.detach() }
}
