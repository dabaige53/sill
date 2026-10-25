import Foundation
import SillKit

/// Shared card/reader presentation, preserving publication identity separately from acquisition.
extension MobileCard {
  var publicationName: String {
    let values =
      [raw["publisher"]?["name"]?.string].compactMap { $0 }
      + (raw["authors"]?.array ?? []).compactMap { $0["name"]?.string }
    var seen = Set<String>()
    let names = values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty && seen.insert($0).inserted }
    return names.isEmpty ? sourceName : names.joined(separator: " · ")
  }
  var readingTime: String {
    guard let estimate = raw["readingEstimate"], let seconds = estimate["seconds"]?.number else {
      return ""
    }
    let scope = estimate["scope"]?.string == "full" ? "readingFull" : "readingAvailable"
    return
      "\(Copy.text("web.metadata.\(scope)")) \(Int(ceil(seconds / 60))) \(Copy.text("web.metadata.readingSuffix"))"
  }
  var presentationSourceLine: String {
    let identity =
      ["article", "media", "note", "suggestion"].contains(type)
      ? publicationName : sourceName
    let label = identity.isEmpty ? Copy.text("card.type.\(type)") : identity
    return [label, presentationDate, readingTime].filter { !$0.isEmpty }.joined(separator: " · ")
  }
  var presentationDate: String {
    switch type {
    case "article":
      if let value = raw["publishedAt"]?.string.flatMap({ MobileFormat.publication($0) }) {
        return value
      }
      if let value = raw["savedAt"]?.string.flatMap({ MobileFormat.publication($0) }) {
        return value
      }
      return MobileFormat.shortDay(MobileFormat.date(time))
    case "mail":
      return raw["sentAt"]?.string.flatMap {
        MobileFormat.publication($0, includeTime: true)
      } ?? ""
    case "photo": return raw["takenAt"]?.string.flatMap { MobileFormat.publication($0) } ?? ""
    case "pr":
      return raw["pullRequest"]?["observedAt"]?.string.flatMap {
        MobileFormat.publication($0, includeTime: true)
      } ?? ""
    default: return raw["publishedAt"]?.string.flatMap { MobileFormat.publication($0) } ?? ""
    }
  }
  var displaySummary: String {
    if !summary.isEmpty { return summary }
    return markdown.blocks.first?.runs.map(\.text).joined() ?? ""
  }
  var coverSource: String? { raw["image"]?.string }
  var photoSources: [String] {
    let photos = raw["photos"]?.strings ?? []
    return photos.isEmpty ? [coverSource].compactMap { $0 } : photos
  }
  var attachments: [JSONValue] {
    raw["attachments"]?.array ?? raw["attachment"]?.string.map {
      [.object(["name": .string($0)])]
    } ?? []
  }
  var isReadable: Bool {
    ["article", "mail", "note", "media", "suggestion", "photo"].contains(type)
  }
  func faded(fadeRead: Bool, now: Double) -> Bool {
    (isReadable && read && fadeRead) || completed || (type == "event" && (end ?? .infinity) <= now)
  }
  /// Held rows keep their place when toggled; missing rows release their slot to the next task.
  func previewTasks(holding order: [String], limit: Int = 3) -> [TaskItem] {
    var seen = Set<String>()
    let held = order.filter { seen.insert($0).inserted }
      .compactMap { id in tasks.first { $0.id == id } }
    let remaining = (tasks.filter { !$0.done } + tasks.filter(\.done))
      .filter { !seen.contains($0.id) }
    return Array((held + remaining).prefix(max(0, limit)))
  }
}
