import Foundation
import Observation

/// Membership, order and stacks change only on navigation, refresh or explicit removal.
@MainActor @Observable final class MobileFeedState {
  struct Entry: Identifiable, Equatable {
    let id: String
    var cards: [String]
    var stacked: Bool { id.hasPrefix("stack:") }
  }
  enum Entrance: Equatable {
    case initial(Int)
    case added, none
  }
  private(set) var entries: [Entry] = []
  private(set) var scope = "all"
  private(set) var limit = 40
  private(set) var entrances: [String: Entrance] = [:]
  var offsets: [String: Double] = [:]
  var stackPositions: [String: Int] = [:]
  var expanded: Set<String> = []
  @ObservationIgnored private var shelves: [String: Bool] = [:]
  @ObservationIgnored private var pageLimits: [String: Int] = [:]
  @ObservationIgnored private var initialized = false
  @ObservationIgnored private var shown: Set<String> = []

  var visible: [Entry] { Array(entries.prefix(limit)) }
  var hasMore: Bool { entries.count > limit }

  func rebuild(scope: String, cards: [MobileCard], catalog: [MobileCard], stack: Bool) {
    let previous = Set(entries.map(\.id))
    self.scope = scope
    limit = pageLimits[scope] ?? 40
    entries = Self.entries(cards, stack: stack && scope != "archive")
    shelves = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0.archived) })
    entrances = [:]
    for (index, entry) in visible.enumerated() {
      if !initialized, index < 10 {
        entrances[entry.id] = .initial(index)
      } else if initialized, !previous.contains(entry.id) {
        entrances[entry.id] = .added
      }
    }
    shown = []
    initialized = true
  }

  /// State changes leave the members in place; archive, deletion and new cards are structural.
  func synchronize(catalog: [MobileCard], eligible: [MobileCard]) {
    let current = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })
    entries = entries.compactMap { entry in
      var entry = entry
      entry.cards = entry.cards.filter {
        current[$0].map { $0.archived == (scope == "archive") } ?? false
      }
      return entry.cards.isEmpty ? nil : entry
    }
    let present = Set(entries.flatMap(\.cards))
    let additions = eligible.filter {
      !present.contains($0.id) && (shelves[$0.id] == nil || shelves[$0.id] != $0.archived)
    }
    for card in additions.reversed() {
      entries.insert(Entry(id: card.id, cards: [card.id]), at: 0)
      entrances[card.id] = .added
      shown.remove(card.id)
    }
    shelves = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0.archived) })
  }

  func nextPage() {
    limit += 40
    pageLimits[scope] = limit
  }

  func entrance(_ id: String) -> Entrance {
    guard shown.insert(id).inserted else { return .none }
    return entrances[id] ?? .none
  }

  static func entries(_ cards: [MobileCard], stack: Bool) -> [Entry] {
    guard stack else { return cards.map { Entry(id: $0.id, cards: [$0.id]) } }
    let groups = Dictionary(
      grouping: cards.filter {
        ["article", "media"].contains($0.type) && !$0.sourceName.isEmpty
          && !["agent", "capture"].contains($0.sourceKind)
      }
    ) { $0.sourceKind + ":" + $0.sourceName }
    var grouped: [String: [String]] = [:]
    var keys: [String: String] = [:]
    for (key, group) in groups {
      let sorted = group.sorted { $0.time > $1.time }
      let newest = sorted.first?.time ?? 0
      let recent = sorted.filter { !$0.read && newest - $0.time <= 3_600_000 }
      guard recent.count > 5 else { continue }
      grouped[key] = recent.map(\.id)
      for card in recent { keys[card.id] = key }
    }
    var placed = Set<String>()
    return cards.compactMap { card in
      guard let key = keys[card.id] else { return Entry(id: card.id, cards: [card.id]) }
      guard placed.insert(key).inserted else { return nil }
      return Entry(id: "stack:" + key, cards: grouped[key] ?? [])
    }
  }
}
