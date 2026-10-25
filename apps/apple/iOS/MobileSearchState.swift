import Foundation
import Observation
import SillKit

@MainActor @Observable final class MobileSearchState {
  struct Kind: Identifiable {
    let id: String
    let label: String
    let artwork: String
  }
  static let kinds: [Kind] = [
    Kind(id: "article", label: "web.search.type.article", artwork: "architecture"),
    Kind(id: "mail", label: "web.search.type.mail", artwork: "coast"),
    Kind(id: "note", label: "web.note", artwork: "botanical"),
    Kind(id: "task", label: "web.task", artwork: "mountain"),
    Kind(id: "event", label: "web.event", artwork: "coast"),
    Kind(id: "media", label: "web.media", artwork: "mountain"),
  ]
  var query = ""
  var category: String?
  var type: String?
  var conditions: [String] = []
  var focused = false
  var hashDismissed = false
  var highlighted = 0
  var offsets: [String: Double] = [:]
  var limits: [String: Int] = [:]

  var text: String {
    guard let range = query.range(of: #"(^|\s)#\S*$"#, options: .regularExpression) else {
      return query.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return query.replacingCharacters(in: range, with: "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }
  var hash: String? {
    guard !hashDismissed,
      let range = query.range(of: #"(^|\s)#\S*$"#, options: .regularExpression),
      let marker = query[range].firstIndex(of: "#")
    else { return nil }
    return String(query[query.index(after: marker)...])
  }
  var browsing: Bool { text.isEmpty && category == nil && type == nil && conditions.isEmpty }
  var hasTokens: Bool { category != nil || !conditions.isEmpty }
  var positionKey: String {
    (category ?? type ?? "all") + "|" + text + "|" + conditions.joined(separator: "|")
  }
  var limit: Int { limits[positionKey] ?? 40 }

  func results(_ workspace: MobileWorkspace, anyType: Bool = false) -> [MobileCard] {
    guard !browsing else { return [] }
    return workspace.filtered(
      scope: "search", query: text,
      type: anyType ? category : category ?? type
    ).filter { matches($0) }
  }

  func matches(_ card: MobileCard) -> Bool {
    card.matches(text)
      && conditions.allSatisfy { condition in
        switch condition {
        case "unread": !card.read
        case "bookmarks": card.bookmarked
        case "later": card.later
        default: card.tags.contains(String(condition.dropFirst(4)))
        }
      }
  }

  func options(_ workspace: MobileWorkspace) -> [String] {
    guard let hash else { return [] }
    let tags = Set(workspace.cards.flatMap(\.tags)).sorted().map { "tag:" + $0 }
    return (["unread", "bookmarks", "later"] + tags).filter {
      !conditions.contains($0)
        && (hash.isEmpty || Self.conditionTitle($0).localizedStandardContains(hash))
    }
  }
  static func conditionTitle(_ key: String) -> String {
    key.hasPrefix("tag:") ? String(key.dropFirst(4)) : Copy.text("apple." + key)
  }
  static func typeTitle(_ key: String) -> String {
    Copy.text(kinds.first { $0.id == key }?.label ?? "web.all")
  }
  func choose(_ condition: String) {
    if !conditions.contains(condition) { conditions.append(condition) }
    query = text
    highlighted = 0
    hashDismissed = false
  }
  func backspace() {
    if !conditions.isEmpty { conditions.removeLast() } else if category != nil { category = nil }
  }
  func reset() {
    query = ""
    category = nil
    type = nil
    conditions = []
    hashDismissed = false
    highlighted = 0
    focused = false
    offsets = [:]
    limits = [:]
  }
}
