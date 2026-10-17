import Foundation
import SillKit

extension Card {
  var fields: JSONValue { (try? raw) ?? .object([:]) }
  var symbol: String {
    [
      "article": "doc.text", "mail": "envelope", "note": "text.alignleft", "task": "checklist",
      "event": "calendar", "reminder": "bell", "media": "play.rectangle", "digest": "sparkles",
      "suggestion": "link", "photo": "photo", "file": "doc",
    ][type] ?? "doc.text"
  }
  var nativeIcon: String {
    [
      "article": "book", "mail": "mail", "note": "note", "task": "check-circle",
      "event": "calendar", "reminder": "bell", "media": "video", "digest": "chart",
      "suggestion": "sparkles", "photo": "image", "file": "folder",
    ][type] ?? "book"
  }
  var sourceKind: String { fields["sources"]?.array?.first?["kind"]?.string ?? "local" }
  var sourceIcon: String {
    if ["task", "event", "reminder", "digest", "photo", "file"].contains(type) {
      return nativeIcon
    }
    return Self.sourceIcon(sourceKind)
  }
  static func sourceIcon(_ kind: String) -> String {
    [
      "rss": "rss", "readwise": "book", "web": "globe", "youtube": "video", "twitter": "chat",
      "podcast": "mic", "mail": "mail", "reminders": "check-circle", "linear": "target",
      "github": "pull", "calendar": "calendar", "photos": "image", "folder": "folder",
      "capture": "note", "markdown": "note", "local": "note", "agent": "sparkles",
    ][kind] ?? "book"
  }
  var sourceLine: String {
    [
      source.isEmpty ? typeLabel : source,
      type == "suggestion" && !(fields["related"]?.strings ?? []).isEmpty
        ? "" : fields["meta"]?.string ?? "",
    ].filter { !$0.isEmpty }.joined(separator: " · ")
  }
  var readable: Bool { ["article", "mail", "note", "media", "suggestion", "photo"].contains(type) }
  var paragraphs: [String] { fields["body"]?.strings ?? (body.isEmpty ? [] : [body]) }
  var typeLabel: String { Self.typeLabels[type] ?? Copy.appleTypeNote }
  static var typeLabels: [String: String] {
    [
      "article": Copy.appleTypeArticle, "mail": Copy.appleTypeMail, "note": Copy.appleTypeNote,
      "task": Copy.appleTypeTask, "event": Copy.appleTypeEvent, "reminder": Copy.appleTypeReminder,
      "media": Copy.appleTypeMedia, "digest": Copy.appleTypeDigest,
      "suggestion": Copy.appleTypeSuggestion, "photo": Copy.appleTypePhoto,
      "file": Copy.appleTypeFile,
    ]
  }
  func date(_ field: String) -> Date? {
    if let value = fields[field]?.number { return Date(timeIntervalSince1970: value / 1000) }
    guard let value = fields[field]?.string else { return nil }
    return ISO8601DateFormatter().date(from: value)
  }
  func dateText(_ field: String) -> String? {
    guard let raw = fields[field] else { return nil }
    if let text = raw.string, text.count == 10 {
      let formatter = DateFormatter()
      formatter.dateFormat = "yyyy-MM-dd"
      formatter.isLenient = false
      return formatter.date(from: text).map { _ in text }
    }
    guard let date = date(field), date.timeIntervalSince1970 >= 0 else { return nil }
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd HH:mm 'UTC'XXXXX"
    return formatter.string(from: date)
  }
}

func cardDuration(_ seconds: Double) -> String {
  let seconds = max(0, Int(seconds.rounded()))
  let hours = seconds / 3600
  let minutes = seconds % 3600 / 60
  let remainder = String(format: "%02d", seconds % 60)
  return hours > 0
    ? "\(hours):\(String(format: "%02d", minutes)):\(remainder)" : "\(minutes):\(remainder)"
}

func cardTime(_ date: Date) -> String {
  let formatter = DateFormatter()
  formatter.dateFormat = "HH:mm"
  return formatter.string(from: date)
}
func cardDay(_ date: Date) -> String {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "zh_Hans_CN")
  formatter.dateFormat = "M月d日EEE"
  return formatter.string(from: date)
}

func cardEventRelative(_ card: Card) -> String {
  guard let start = card.date("start") else { return "" }
  let minutes = Int(ceil(start.timeIntervalSinceNow / 60))
  if minutes > 90 {
    return "\(Int((Double(minutes) / 60).rounded()))" + Copy.text("web.primitives.ec13a671ba0c")
  }
  if minutes > 0 { return "\(minutes)" + Copy.text("web.primitives.a63a9dc60e00") }
  return (card.date("end") ?? .distantPast) <= .now ? "" : Copy.text("web.primitives.055da4d50c7e")
}
