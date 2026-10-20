import SillKit

/// Eleven card types (Web `CardTypes`). `readable` types carry read state as card color.
enum CardKind: String, CaseIterable, Sendable {
  case article, mail, note, task, event, reminder, media, digest, suggestion, photo, file

  init(type: String) { self = CardKind(rawValue: type) ?? .article }

  var label: String { Copy.text("card.type.\(rawValue)") }

  var icon: String {
    switch self {
    case .article: "book"
    case .mail: "mail"
    case .note: "note"
    case .task: "check-circle"
    case .event: "calendar"
    case .reminder: "bell"
    case .media: "video"
    case .digest: "chart"
    case .suggestion: "sparkles"
    case .photo: "image"
    case .file: "folder"
    }
  }

  var readable: Bool {
    switch self {
    case .article, .mail, .note, .media, .suggestion, .photo: true
    default: false
    }
  }

  /// Things to do show what they are; content shows where it came from.
  var headIconByType: Bool {
    switch self {
    case .task, .event, .reminder, .digest, .photo, .file: true
    default: false
    }
  }

  /// Reminder, event and task cards take part in Sill reminders (FeedPolicy.supports).
  var remindable: Bool { self == .reminder || self == .event || self == .task }
}

/// Where content comes from (Web `SourceKinds`).
enum SourceKind {
  static func icon(_ kind: String) -> String? {
    switch kind {
    case "rss": "rss"
    case "readwise": "book"
    case "web": "globe"
    case "youtube": "video"
    case "twitter": "chat"
    case "podcast": "mic"
    case "mail": "mail"
    case "reminders": "check-circle"
    case "linear": "target"
    case "github": "pull"
    case "calendar": "calendar"
    case "photos": "image"
    case "folder": "folder"
    case "capture", "markdown", "local": "note"
    case "agent": "sparkles"
    default: nil
    }
  }

  static func label(_ kind: String) -> String? {
    icon(kind) == nil ? nil : Copy.text("source.type.\(kind)")
  }
}
