import Foundation
import SillKit

/// Web `services/feed-policy.ts`. Pure: the clock and card state are supplied by the caller.
@MainActor enum FeedPolicy {
  /// More than five cards from one source within an hour fold into one stack.
  static let stackThreshold = 5

  static func trigger(_ card: CardModel, state: CardState) -> Double {
    trigger(card, snoozedUntil: state.snoozedUntil)
  }

  static func trigger(_ card: CardModel, snoozedUntil: Double) -> Double {
    if snoozedUntil > 0 { return snoozedUntil }
    switch card.kind {
    case .event: return (card.start ?? .nan) - 15 * 60000
    case .task: return (card.due ?? .nan) - 30 * 60000
    case .reminder: return card.due ?? .nan
    default: return .nan
    }
  }

  static func key(_ card: CardModel, state: CardState) -> String {
    key(card, snoozedUntil: state.snoozedUntil)
  }

  /// Web `key(c)` without a state is the card's own time, ignoring a snooze.
  static func key(_ card: CardModel, snoozedUntil: Double = 0) -> String {
    let at = trigger(card, snoozedUntil: snoozedUntil)
    return "\(card.id):\(at.isNaN ? "NaN" : String(format: "%.0f", at))"
  }

  /// A reminder shows again at most once a minute.
  static let cooldown = 60_000.0

  /// Web `eligible`: due now, still open, and not already shown for this trigger time.
  static func eligible(
    _ card: CardModel, state: CardState, stored: [String: JSONValue], now: Double
  ) -> Bool {
    let at = trigger(card, state: state)
    let lastNotified = stored["lastNotifiedAt"]?.number ?? 0
    return card.kind.remindable && at.isFinite && at > 0 && at <= now && !state.dismissed
      && !state.archived && !state.completed(card)
      && !(card.kind == .event && (card.end ?? .infinity) <= now)
      && stored["lastReminderKey"]?.string != key(card, state: state)
      && (lastNotified == 0 || now - lastNotified >= cooldown)
  }

  static func score(_ card: CardModel, state: CardState, now: Double) -> Double {
    if state.dismissed || state.completed(card) { return -1 }
    let at = trigger(card, state: state)
    let ended = card.kind == .event && (card.end ?? .infinity) <= now
    let urgent = at.isFinite && at <= now && !ended
    // Things about to happen float up: a reminder within 15 minutes, a meeting within 30.
    let start = card.kind == .event ? card.start ?? .nan : at
    let soon =
      !urgent && start.isFinite && start > now
      && start - now <= (card.kind == .event ? 30 : 15) * 60000
    return (urgent ? 100 : 0) + (soon ? 50 : 0) + max(0, min(10, card.priority))
  }

  static func sort(
    _ cards: [CardModel], mode: Preferences.Sort, state: (String) -> CardState, now: Double
  ) -> [CardModel] {
    let indexed = cards.enumerated().map { (index: $0.offset, card: $0.element) }
    return indexed.sorted { a, b in
      let x = state(a.card.id)
      let y = state(b.card.id)
      if x.lessLike != y.lessLike { return !x.lessLike }
      switch mode {
      case .time:
        return a.card.time != b.card.time ? a.card.time > b.card.time : a.index < b.index
      case .unread:
        return x.read != y.read ? !x.read : a.index < b.index
      case .priority:
        let sx = score(a.card, state: x, now: now)
        let sy = score(b.card, state: y, now: now)
        return sx != sy ? sx > sy : a.index < b.index
      }
    }.map(\.card)
  }

  /// Unread articles and media from one source within an hour; more than five make a stack.
  static func stacks(_ cards: [CardModel], state: (String) -> CardState) -> [String: [CardModel]] {
    var groups: [String: [CardModel]] = [:]
    var keys: [String] = []
    for card in cards
    where (card.kind == .article || card.kind == .media) && !card.sourceName.isEmpty
      && card.sourceKind != "agent" && card.sourceKind != "capture"
    {
      let key = "\(card.sourceKind):\(card.sourceName)"
      if groups[key] == nil { keys.append(key) }
      groups[key, default: []].append(card)
    }
    var result: [String: [CardModel]] = [:]
    for key in keys {
      let sorted = groups[key]!.enumerated().sorted {
        $0.element.time != $1.element.time
          ? $0.element.time > $1.element.time : $0.offset < $1.offset
      }.map(\.element)
      let newest = sorted[0].time
      let recent = sorted.filter { newest - $0.time <= 3_600_000 && !state($0.id).read }
      if recent.count > stackThreshold { result[key] = recent }
    }
    return result
  }

  /// A reminder head shows the source's own time; due only while it still waits in Sill.
  static func reminderTime(_ card: CardModel, state: CardState, now: Double) -> (
    at: Double, due: Bool
  )? {
    let at = state.snoozedUntil > 0 ? state.snoozedUntil : card.due ?? .nan
    guard at.isFinite, at > 0 else { return nil }
    return (at, at <= now && !state.reminderDone && !state.dismissed)
  }
}
