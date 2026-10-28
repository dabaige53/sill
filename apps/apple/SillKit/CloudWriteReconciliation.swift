import Foundation

/// Compares an uncertain write with a later snapshot without reading or changing session state.
enum CloudWriteReconciliation {
  private static let metadata = [
    "revision", "state", "created_at", "updated_at", "deleted",
    "owner_id", "change_version",
  ]

  private static func rawCard(_ input: JSONValue) -> JSONValue {
    var card = input
    for key in metadata { card[key] = nil }
    if card["body"] == nil { card["body"] = .string("") }
    return card
  }

  private static func defaultItem(_ card: JSONValue, stored: JSONValue = .object([:])) -> JSONValue
  {
    var item: JSONValue = .object([
      "seen": .bool(false), "read": .bool(false), "bookmarked": .bool(false),
      "later": .bool(false), "playbackPosition": .number(0),
      "progress": .number(0),
      "note": .string(""), "addedAt": .number(0),
      "snoozedUntil": .number(0), "dismissed": .bool(false), "reminderDone": .bool(false),
      "lastReminderKey": .string(""), "lastNotifiedAt": .number(0), "readAt": .number(0),
      "restoredAt": .number(0), "done": .bool(false), "archived": .bool(false),
      "lessLike": .bool(false), "taskDone": .array([]),
    ])
    if card["type"]?.string == "task", let completed = stored["done"]?.bool {
      item["taskDone"] = .array(
        completed ? (card["tasks"]?.array ?? []).compactMap { $0["id"] } : [])
    }
    item["reminderDone"] = stored["reminderDone"] ?? stored["done"] ?? .bool(false)
    for (key, value) in stored.object ?? [:] { item[key] = value }
    return item
  }

  static func matches(_ body: JSONValue, baseline: JSONValue, actual: JSONValue) -> Bool {
    guard let operations = body["operations"]?.array,
      let revision = baseline["revision"]?.number,
      body["expectedRevision"] == baseline["revision"],
      actual["revision"]?.number == revision + Double(operations.count)
    else { return false }
    var expected = baseline["state"]!
    var cards = Dictionary(
      uniqueKeysWithValues: (expected["cards"]?.array ?? []).compactMap {
        card -> (String, JSONValue)? in
        guard let id = card["id"]?.string else { return nil }
        return (id, rawCard(card))
      })
    var items = expected["items"]?.object ?? [:]
    var storedStates: [String: JSONValue] = [:]
    for card in expected["cards"]?.array ?? [] {
      if let id = card["id"]?.string { storedStates[id] = card["state"] ?? .object([:]) }
    }
    for operation in operations {
      let id = operation["id"]?.string ?? operation["card"]?["id"]?.string ?? ""
      switch operation["op"]?.string {
      case "card.upsert":
        guard let submitted = operation["card"]?.object else { return false }
        if let before = operation["before"] {
          if before == .null {
            guard cards[id] == nil else { return false }
          } else if rawCard(before) != cards[id] {
            return false
          }
        }
        // A card upsert replaces the whole card.
        let card = JSONValue.object(submitted)
        cards[id] = rawCard(card)
        items[id] = defaultItem(card, stored: storedStates[id] ?? .object([:]))
      case "card.delete":
        guard let card = cards[id] else { return false }
        if let before = operation["before"], rawCard(before) != card { return false }
        cards[id] = nil
        items[id] = nil
      case "item.patch":
        guard let card = cards[id] else { return false }
        var item = items[id] ?? defaultItem(card)
        let values = operation["values"]?.object ?? [:]
        for (key, value) in values { item[key] = value }
        if card["type"]?.string == "task" {
          let tasks = card["tasks"]?.array ?? []
          if let done = values["taskDone"]?.strings {
            item["done"] = .bool(
              !tasks.isEmpty && tasks.allSatisfy { done.contains($0["id"]?.string ?? "") })
          } else if let done = values["done"]?.bool {
            item["taskDone"] = .array(done ? tasks.compactMap { $0["id"] } : [])
          }
        } else if card["type"]?.string == "reminder" {
          if let done = values["reminderDone"] {
            item["done"] = done
          } else if let done = values["done"] {
            item["reminderDone"] = done
          }
        }
        items[id] = item
        var stored = storedStates[id] ?? .object([:])
        for (key, value) in values { stored[key] = value }
        if card["type"]?.string == "task", values["done"] != nil || values["taskDone"] != nil {
          stored["done"] = item["done"]
          stored["taskDone"] = item["taskDone"]
        } else if card["type"]?.string == "reminder",
          values["done"] != nil || values["reminderDone"] != nil
        {
          stored["done"] = item["done"]
          stored["reminderDone"] = item["reminderDone"]
        }
        storedStates[id] = stored
      case "preferences.patch":
        var preferences = expected["preferences"]!
        for (key, value) in operation["values"]?.object ?? [:] { preferences[key] = value }
        expected["preferences"] = preferences
      case "reading.add":
        expected["seconds"] = .number(
          (expected["seconds"]?.number ?? 0) + (operation["seconds"]?.number ?? 0))
      default: return false
      }
    }
    guard let actualCards = actual["state"]?["cards"]?.array,
      actualCards.count == cards.count,
      actualCards.allSatisfy({ card in cards[card["id"]?.string ?? ""] == rawCard(card) }),
      actual["state"]?["items"]?.object == items,
      actual["state"]?["preferences"] == expected["preferences"],
      actual["state"]?["seconds"] == expected["seconds"]
    else { return false }
    return true
  }
}
