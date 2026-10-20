import SillKit
import SwiftUI

@MainActor extension Workspace {
  var homeCards: [Card] {
    let mode =
      preferences["floatTimely"]?.bool == false ? "time" : preferences["sort"]?.string ?? "priority"
    let now = Date.now.timeIntervalSince1970 * 1000
    return cards.enumerated().filter { items[$0.element.id]?["archived"]?.bool != true }.map {
      entry in
      let card = entry.element
      let state = items[card.id]
      let score: Double =
        switch mode {
        case "time": card.fields["time"]?.number ?? 0
        case "unread": state?["read"]?.bool == true ? 0 : 1
        default: feedScore(card, now: now)
        }
      return (
        card: card, offset: entry.offset, score: score, lessLike: state?["lessLike"]?.bool == true
      )
    }.sorted { a, b in
      if a.lessLike != b.lessLike { return !a.lessLike }
      return a.score == b.score ? a.offset < b.offset : a.score > b.score
    }.map(\.card)
  }

  private func feedScore(_ card: Card, now: Double) -> Double {
    let item = items[card.id]
    let tasks = card.fields["tasks"]?.array ?? []
    if item?["dismissed"]?.bool == true || item?["reminderDone"]?.bool == true
      || (card.type == "task" && !tasks.isEmpty && tasks.allSatisfy { taskDone(card, $0) })
    {
      return -1
    }
    var trigger: Double?
    if let snooze = item?["snoozedUntil"]?.number, snooze > 0 {
      trigger = snooze
    } else if card.type == "event" {
      trigger = card.fields["start"]?.number.map { $0 - 15 * 60000 }
    } else if card.type == "task" {
      trigger = card.fields["due"]?.number.map { $0 - 30 * 60000 }
    } else if card.type == "reminder" {
      trigger = card.fields["due"]?.number
    }
    let urgent =
      trigger.map {
        $0 <= now && !(card.type == "event" && (card.fields["end"]?.number ?? .infinity) <= now)
      } ?? false
    let start = card.type == "event" ? card.fields["start"]?.number : trigger
    let soon =
      !urgent
      && (start.map { $0 > now && $0 - now <= (card.type == "event" ? 30 : 15) * 60000 } ?? false)
    return (urgent ? 100 : 0) + (soon ? 50 : 0)
      + max(0, min(10, card.fields["priority"]?.number ?? 0))
  }

  var searchWords: String {
    query.split(whereSeparator: \.isWhitespace).filter { !$0.hasPrefix("#") }.joined(separator: " ")
  }

  var visible: [Card] {
    let tokens = query.split(whereSeparator: \.isWhitespace).filter { $0.hasPrefix("#") }
      .map { String($0.dropFirst()) }
    let words = searchWords
    let archived =
      feedScope == .archived || tokens.contains(FeedScope.archived.label)
      || tokens.contains(FeedScope.archived.rawValue)
    let candidates =
      archived
      ? cards
      : words.isEmpty
        ? homeCards
        : homeCards + cards.filter { items[$0.id]?["archived"]?.bool == true }
    return candidates.filter { card in
      let state = items[card.id] ?? .object([:])
      guard matches(feedScope, card: card, state: state),
        typeFilter == "all" || card.type == typeFilter,
        tagFilter.isEmpty || tags(card).contains(tagFilter)
      else { return false }
      if !words.isEmpty {
        let haystack = [
          card.title, card.body, card.summary, card.source,
          state["note"]?.string ?? "", tags(card).joined(separator: " "),
        ].joined(separator: " ")
        guard haystack.localizedCaseInsensitiveContains(words) else { return false }
      }
      return tokens.allSatisfy { token in
        if let scope = FeedScope.allCases.first(where: { $0.label == token || $0.rawValue == token }
        ) {
          return matches(scope, card: card, state: state)
        }
        if let type = Card.typeLabels.first(where: { $0.value == token || $0.key == token })?.key {
          return card.type == type
        }
        return tags(card).contains { $0.localizedCaseInsensitiveCompare(token) == .orderedSame }
      }
    }
  }

  private func matches(_ scope: FeedScope, card: Card, state: JSONValue) -> Bool {
    switch scope {
    case .all: return true
    case .unread: return state["read"]?.bool != true
    case .todo: return ["task", "reminder"].contains(card.type)
    case .later: return state["later"]?.bool == true
    case .saved: return state["bookmarked"]?.bool == true
    case .archived: return state["archived"]?.bool == true
    }
  }
}

enum FeedScope: String, CaseIterable, Identifiable {
  case all, unread, todo, later, saved, archived
  var id: String { rawValue }
  static var tabs: [Self] { [.all, .unread, .todo, .later, .saved] }
  var label: String {
    switch self {
    case .all: Copy.text("web.all")
    case .unread: Copy.text("web.unread")
    case .todo: Copy.text("web.home.todo")
    case .later: Copy.text("web.later")
    case .saved: Copy.text("web.bookmark")
    case .archived: Copy.text("web.templates.7b7e6e8bd4ba")
    }
  }
}
