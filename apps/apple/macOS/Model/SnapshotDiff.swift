import Foundation
import SillKit

/// What changed between the drawn workspace and a new snapshot, computed off the main thread
/// so the main thread only assigns the cards and items that differ.
struct SnapshotDiff: Sendable {
  let revision: Int
  let order: [String]
  let models: [CardModel]
  let removed: Set<String>
  let items: [String: [String: JSONValue]]
  let raw: [String: JSONValue]
  let preferences: [String: JSONValue]
  let seconds: Double
  /// Cards were added, removed, reordered or changed in content.
  var catalogChanged: Bool { !models.isEmpty || !removed.isEmpty || orderChanged }
  let orderChanged: Bool

  struct Baseline: Sendable {
    var raw: [String: JSONValue] = [:]
    var items: [String: JSONValue] = [:]
    var order: [String] = []
  }

  static func make(_ snapshot: Snapshot, against baseline: Baseline) -> SnapshotDiff {
    var models: [CardModel] = []
    var raw: [String: JSONValue] = [:]
    var order: [String] = []
    raw.reserveCapacity(snapshot.cards.count)
    for card in snapshot.cards {
      guard let json = try? card.raw else { continue }
      raw[card.id] = json
      order.append(card.id)
      if baseline.raw[card.id] != json,
        let model = try? CardModel(card: card, createdAt: snapshot.createdAt[card.id])
      {
        models.append(model)
      }
    }
    let removed = Set(baseline.raw.keys).subtracting(raw.keys)
    var items: [String: [String: JSONValue]] = [:]
    let stored = snapshot.items
    for id in order where stored[id] != baseline.items[id] {
      items[id] = stored[id]?.object ?? [:]
    }
    let state = snapshot.json["state"]
    return SnapshotDiff(
      revision: snapshot.revision, order: order, models: models, removed: removed, items: items,
      raw: raw, preferences: state?["preferences"]?.object ?? [:],
      seconds: state?["seconds"]?.number ?? 0, orderChanged: order != baseline.order)
  }
}
