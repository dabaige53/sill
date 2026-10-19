import SillKit
import SwiftUI

@MainActor extension Workspace {
  var homeCards: [Card] {
    let mode =
      preferences["floatTimely"]?.bool == false ? "time" : preferences["sort"]?.string ?? "priority"
    return cards.enumerated().filter { items[$0.element.id]?["archived"]?.bool != true }.sorted {
      a, b in
      let x = items[a.element.id]
      let y = items[b.element.id]
      let xl = x?["lessLike"]?.bool == true
      let yl = y?["lessLike"]?.bool == true
      if xl != yl { return !xl }
      if mode == "time" {
        let tx = a.element.fields["time"]?.number ?? 0
        let ty = b.element.fields["time"]?.number ?? 0
        return tx == ty ? a.offset < b.offset : tx > ty
      }
      if mode == "unread" {
        let xr = x?["read"]?.bool == true
        let yr = y?["read"]?.bool == true
        return xr == yr ? a.offset < b.offset : !xr
      }
      let sx = feedScore(a.element)
      let sy = feedScore(b.element)
      return sx == sy ? a.offset < b.offset : sx > sy
    }.map(\.element)
  }

  private func feedScore(_ card: Card) -> Double {
    let item = items[card.id]
    let tasks = card.fields["tasks"]?.array ?? []
    if item?["dismissed"]?.bool == true || item?["reminderDone"]?.bool == true
      || (card.type == "task" && !tasks.isEmpty && tasks.allSatisfy { taskDone(card, $0) })
    {
      return -1
    }
    let now = Date.now.timeIntervalSince1970 * 1000
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

  var visible: [Card] {
    let searching = page == "search"
    if !searching { return homeCards }
    return cards.filter { card in
      let item = items[card.id]
      if !searching { return item?["archived"]?.bool != true }
      let words = [
        card.title, card.body, card.summary, card.source,
        item?["note"]?.string ?? "", tags(card).joined(separator: " "),
      ].joined(separator: " ")
      return (query.isEmpty || words.localizedCaseInsensitiveContains(query))
        && (typeFilter == "all" || card.type == typeFilter)
        && (tagFilter.isEmpty || tags(card).contains(tagFilter))
        && (filter == Copy.appleAll
          || filter == Copy.appleBookmarks && item?["bookmarked"]?.bool == true
          || filter == Copy.appleLater && item?["later"]?.bool == true
          || filter == Copy.appleUnread && item?["read"]?.bool != true
          || filter == Copy.appleArchived && item?["archived"]?.bool == true)
    }
  }

}
