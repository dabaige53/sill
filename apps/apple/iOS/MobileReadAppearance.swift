import Observation

/// Persist reading immediately while leaving the source tile unchanged until its layer closes.
@MainActor @Observable final class MobileReadAppearance {
  struct Value: Equatable {
    let read: Bool
    let progress: Double
    init(_ card: MobileCard) {
      read = card.read
      progress = card.progress
    }
  }
  private var held: [String: Value] = [:]
  func value(_ card: MobileCard) -> Value { held[card.id] ?? Value(card) }
  func hold(_ card: MobileCard) {
    if held[card.id] == nil { held[card.id] = Value(card) }
  }
  func release(_ id: String) { held[id] = nil }
  func clear() { held = [:] }
}
