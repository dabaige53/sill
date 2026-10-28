import Foundation

public struct Snapshot: Sendable {
  public var json: JSONValue
  public let revision: Int
  public let cards: [Card]
  public var items: [String: JSONValue] { json["state"]?["items"]?.object ?? [:] }

  public init(json input: JSONValue) throws {
    var json = input
    guard let number = json["revision"]?.number, number >= 0, number.rounded() == number,
      number <= 9_007_199_254_740_991
    else { throw StoreError.invalidSnapshot }
    revision = Int(number)
    if json["state"] == .null, revision == 0 { json["state"] = Self.emptyState }
    guard var state = json["state"], let values = state["cards"]?.array,
      values.count <= 5000, state["items"]?.object != nil,
      state["preferences"]?.object != nil,
      let seconds = state["seconds"]?.number, seconds >= 0, seconds <= 1e7
    else {
      throw StoreError.invalidSnapshot
    }
    // Cloud cards carry server fields beside the card facts; the card keeps only its facts.
    cards = try values.map { value in
      var card = value
      for key in Self.serverFields { card[key] = nil }
      return try Card(json: card)
    }
    guard Set(cards.map(\.id)).count == cards.count else { throw StoreError.invalidSnapshot }
    state["cards"] = .array(try cards.map { try $0.raw })
    json["state"] = state
    self.json = json
  }

  static let serverFields = ["revision", "state", "created_at", "updated_at", "deleted"]

  static var emptyState: JSONValue {
    .object([
      "cards": .array([]), "items": .object([:]), "seconds": .number(0),
      "preferences": .object([:]),
    ])
  }

  public static func empty() throws -> Snapshot {
    try Snapshot(json: .object(["revision": .number(0), "state": emptyState]))
  }
}
