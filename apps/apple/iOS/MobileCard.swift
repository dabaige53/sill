import Foundation
import SillKit

/// One confirmed cloud card and its personal state. Views never change the stored content.
struct MobileCard: Identifiable, Sendable {
  struct TaskItem: Identifiable, Equatable, Sendable {
    let id: String
    let text: String
    let done: Bool
  }

  let raw: JSONValue
  let item: JSONValue
  let owner: String?
  let id: String
  let type: String
  let title: String
  let summary: String
  let body: String
  let markdown: MarkdownBody
  let sourceName: String
  let sourceKind: String
  let tags: [String]
  let tasks: [TaskItem]
  let url: URL?
  let image: URL?
  let photos: [URL]
  let audioURL: URL?
  let time: Double
  let priority: Double
  let start: Double?
  let end: Double?
  let due: Double?
  let sender: String?
  let location: String?
  let caption: String?
  let people: [String]
  let related: [String]
  let read: Bool
  let bookmarked: Bool
  let later: Bool
  let archived: Bool
  let reminderDone: Bool
  let dismissed: Bool
  let progress: Double
  let playbackPosition: Double
  let note: String

  var completed: Bool {
    reminderDone || (type == "task" && !tasks.isEmpty && tasks.allSatisfy(\.done))
  }

  init(card: Card, item: JSONValue = .object([:]), owner: String? = nil) throws {
    let raw = try card.raw
    self.raw = raw
    self.item = item
    self.owner = owner
    id = card.id
    type = card.type
    title = card.title
    summary = card.summary
    body = card.body
    markdown = MarkdownBody(card.body)
    sourceName = card.source
    sourceKind = raw["sources"]?.array?.first?["kind"]?.string ?? "local"
    let sourceTags = raw["tags"]?.strings ?? []
    let personalTags = item["tags"]?.strings ?? []
    var seen = Set<String>()
    tags = (item["tagsEdited"]?.bool == true ? personalTags : sourceTags + personalTags)
      .filter { seen.insert($0).inserted }
    let done = item["taskDone"]?.strings
    tasks = (raw["tasks"]?.array ?? []).map { task in
      let taskID = task["id"]?.string ?? ""
      return TaskItem(
        id: taskID, text: task["text"]?.string ?? "",
        done: done.map { $0.contains(taskID) } ?? item["done"]?.bool ?? task["done"]?.bool ?? false)
    }
    url = Self.safeURL(raw["url"]?.string)
    image = Self.safeURL(raw["image"]?.string)
    photos = (raw["photos"]?.strings ?? []).compactMap(Self.safeURL)
    audioURL = Self.safeURL(raw["audioUrl"]?.string)
    time = raw["time"]?.number ?? 0
    priority = raw["priority"]?.number ?? 0
    start = raw["start"]?.number
    end = raw["end"]?.number
    due = raw["due"]?.number
    sender = raw["sender"]?.string
    location = raw["location"]?.string
    caption = raw["caption"]?.string
    people = raw["people"]?.strings ?? []
    related = raw["related"]?.strings ?? []
    read = item["read"]?.bool ?? false
    bookmarked = item["bookmarked"]?.bool ?? false
    later = item["later"]?.bool ?? false
    archived = item["archived"]?.bool ?? false
    reminderDone = item["reminderDone"]?.bool ?? item["done"]?.bool ?? false
    dismissed = item["dismissed"]?.bool ?? false
    progress = item["progress"]?.number ?? 0
    playbackPosition = item["playbackPosition"]?.number ?? 0
    note = item["note"]?.string ?? ""
  }

  static func safeURL(_ string: String?) -> URL? {
    guard let string, let url = URL(string: string),
      let scheme = url.scheme?.lowercased(), ["https", "http"].contains(scheme),
      url.host?.isEmpty == false, url.user == nil, url.password == nil
    else { return nil }
    return url
  }

  func matches(_ query: String) -> Bool {
    let haystack = ([title, summary, markdown.plainText, sourceName, note] + tags)
      .joined(separator: " ")
    return query.split(whereSeparator: \.isWhitespace).allSatisfy { token in
      if token.hasPrefix("#") {
        return tags.contains {
          $0.localizedCaseInsensitiveCompare(String(token.dropFirst())) == .orderedSame
        }
      }
      return haystack.localizedStandardContains(String(token))
    }
  }
}
