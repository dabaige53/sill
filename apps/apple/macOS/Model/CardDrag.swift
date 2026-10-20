import CoreGraphics
import Observation
import SillKit

/// A card carried toward the AI box (Web `DragManager`). Holding a card still for 380ms or moving
/// it 8px selects it; the selected cards travel together as a small pile under the pointer.
/// Letting go over the AI box adds them as context and ends the selection; anywhere else changes
/// nothing. Only the pile observes `location`; the AI box observes `active` and `ready`.
@MainActor @Observable final class CardDrag {
  private(set) var active = false
  /// The pointer is over the AI box.
  private(set) var ready = false
  /// The pointer, in window coordinates. Only the pile reads it.
  private(set) var location: CGPoint = .zero
  /// Whether the pile has moved far enough to be drawn.
  private(set) var moved = false
  @ObservationIgnored private(set) var ids: [String] = []
  @ObservationIgnored private var start: CGPoint = .zero
  /// The AI box, in window coordinates; set by the box itself.
  @ObservationIgnored var target: CGRect = .null

  func begin(_ ids: [String], at point: CGPoint) {
    self.ids = ids
    start = point
    location = point
    moved = false
    ready = false
    active = true
  }

  func move(to point: CGPoint) {
    guard active else { return }
    if !moved, hypot(point.x - start.x, point.y - start.y) > AppleMetrics.dragStartDistance {
      moved = true
    }
    location = point
    let over = moved && target.contains(point)
    if over != ready { ready = over }
  }

  /// The cards to hand to the AI box, or nil when let go elsewhere.
  func end(at point: CGPoint) -> [String]? {
    move(to: point)
    defer { cancel() }
    return moved && ready ? ids : nil
  }

  func cancel() {
    active = false
    ready = false
    moved = false
    ids = []
  }
}
