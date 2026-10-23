import Foundation
import SillKit

/// A card's content, typed once when a snapshot arrives. Views read these fields, never JSON.
/// Content is immutable; per-card state lives in `CardState`.
struct CardModel: Identifiable, Equatable, Sendable {
  struct Source: Equatable, Sendable {
    var name: String
    var kind: String
  }
  struct TaskItem: Identifiable, Equatable, Sendable {
    var id: String
    var text: String
    var done: Bool
  }
  struct Meeting: Equatable, Sendable {
    var name: String
    var url: URL?
    var code: String?
  }
  struct FileItem: Equatable, Sendable {
    var name: String
    var detail: String
    var modifiedAt: String?
    var isImage: Bool
    var url: URL? = nil
  }
  struct Publication: Equatable, Sendable {
    var date: String? { dateTitle.flatMap { Format.publication($0) } }
    var dateTitle: String?
    var rows: [(label: String, value: String)]
    static func == (a: Publication, b: Publication) -> Bool {
      a.dateTitle == b.dateTitle && a.rows.map(\.label) == b.rows.map(\.label)
        && a.rows.map(\.value) == b.rows.map(\.value)
    }
  }

  let rich: CardRichFields
  let id: String
  let kind: CardKind
  let title: String
  let summary: String
  let body: [String]
  let markdown: MarkdownBody
  let sources: [Source]
  /// All source names joined (Web `cardSource`).
  let sourceName: String
  /// First source kind, `local` when missing (Web `cardSourceKind`).
  let sourceKind: String
  /// 约 N 分钟阅读 / 当前内容约 N 分钟阅读, empty when unknown.
  let readingTime: String
  let tags: [String]
  let image: String?
  let photos: [String]
  let url: URL?
  let time: Double
  let priority: Double
  let sender: String?
  let sentAt: String?
  let attachment: String?
  let isQuote: Bool
  let project: String?
  let tasks: [TaskItem]
  let start: Double?
  let end: Double?
  let due: Double?
  let people: [String]
  let location: String?
  let meeting: Meeting?
  let isPodcast: Bool
  let duration: Int?
  let related: [String]
  let files: [FileItem]
  let takenAt: String?
  /// The local day a photo was taken, for the card head.
  let takenDay: Date?
  let caption: String?
  let publication: Publication
  /// The day an article belongs to: published, else saved, else the card's own time.
  let articleDate: Date?
  /// Lowercased title, summary, source and body for search (Web `matches`, without state fields).
  let searchText: String
  /// The stored card, kept for writes that carry `before`.
  let raw: JSONValue
  /// Cheap identity of the stored content, so views compare cards without walking JSON.
  let fingerprint: Int

  /// A quick note is its own text: the card shows the summary in place of a title.
  var isCapture: Bool { kind == .note && sourceKind == "capture" && !isQuote }
  var hasCover: Bool { (image != nil && (kind == .article || kind == .media)) || kind == .photo }
  var headIcon: String {
    kind.headIconByType ? kind.icon : SourceKind.icon(sourceKind) ?? kind.icon
  }
  /// Source names plus reading time (Web `sourceLine`).
  var sourceLine: String { sourceLine(day: nil, now: .now) }
  /// Source names, an optional short day (今天, 昨天, 10/18) and reading time.
  func sourceLine(day: Date?, now: Date) -> String {
    [
      sources.count > 1
        ? sources.map(\.name).joined(separator: " · ")
        : sourceName.isEmpty
          ? kind.label : sourceName, day.map { Format.shortDay($0, now: now) } ?? "", readingTime,
    ].filter { !$0.isEmpty }.joined(separator: " · ")
  }
  /// A short task, reminder or note preview opens in the narrower detail.
  var shortDetail: Bool {
    [.task, .reminder, .note].contains(kind)
      && body.joined(separator: "\n").count < 160 && body.count <= 1 && summary.count < 280
  }

  init(card: Card) throws {
    let value = card.value
    let raw = try card.raw
    rich = CardRichFields(raw: raw)
    id = value.id
    kind = CardKind(type: value._type)
    title = value.title
    summary = value.summary ?? ""
    let parsed = MarkdownBody(value.body ?? "")
    markdown = parsed
    body = parsed.blocks.map(\.text).filter { !$0.isEmpty }
    sources = (value.sources ?? []).map { Source(name: $0.name, kind: $0.kind) }
    sourceName = sources.map(\.name).joined(separator: " · ")
    sourceKind = sources.first?.kind ?? "local"
    if let estimate = raw["readingEstimate"], let seconds = estimate["seconds"]?.number {
      let prefix = Copy.text(
        estimate["scope"]?.string == "full"
          ? "web.metadata.readingFull" : "web.metadata.readingAvailable")
      readingTime =
        "\(prefix) \(Int(ceil(seconds / 60))) \(Copy.text("web.metadata.readingSuffix"))"
    } else {
      readingTime = ""
    }
    tags = value.tags ?? []
    image = value.image?.rawValue
    photos = (value.photos ?? []).map(\.rawValue)
    url = value.url.flatMap(URL.init(string:))
    time = value.time ?? 0
    priority = value.priority ?? 0
    sender = value.sender?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    sentAt = value.sentAt
    attachment = value.attachment
    isQuote = value.form == .quote
    project = value.project?.name
    tasks = (value.tasks ?? []).map { TaskItem(id: $0.id, text: $0.text, done: $0.done ?? false) }
    start = value.start
    end = value.end
    due = value.due
    people = value.people ?? []
    location = value.location
    meeting = value.meeting.map {
      Meeting(name: $0.name, url: URL(string: $0.url), code: $0.code)
    }
    isPodcast = value.media == .podcast
    duration = value.duration
    related = value.related ?? []
    files = (value.files ?? []).map { file in
      FileItem(
        name: file.name,
        detail: [
          (file.name as NSString).pathExtension.uppercased().nilIfEmpty ?? file.mimeType ?? "",
          Format.fileSize(file.sizeBytes),
        ].filter { !$0.isEmpty }
          .joined(separator: " · "),
        modifiedAt: file.modifiedAt,
        isImage: file.name.range(
          of: #"\.(png|jpe?g|gif|webp)$"#,
          options: [
            .regularExpression, .caseInsensitive,
          ]) != nil, url: file.url.flatMap(URL.init(string:)))
    }
    takenAt = value.takenAt
    takenDay = value.takenAt.flatMap(Format.localDay)
    caption = value.caption
    var rows: [(String, String)] = []
    if let authors = value.authors, !authors.isEmpty {
      rows.append(
        (Copy.text("web.metadata.authors"), authors.map(\.name).joined(separator: " / ")))
    }
    if let publisher = value.publisher {
      rows.append((Copy.text("web.metadata.publisher"), publisher.name))
    }
    if let recipients = value.recipients, !recipients.isEmpty {
      rows.append((Copy.text("web.metadata.recipients"), recipients.joined(separator: " / ")))
    }
    if let project = value.project {
      rows.append((Copy.text("web.metadata.project"), project.name))
    }
    if let sentAt = value.sentAt { rows.append((Copy.text("web.metadata.sent"), sentAt)) }
    if let takenAt = value.takenAt { rows.append((Copy.text("web.metadata.taken"), takenAt)) }
    if let chapters = value.chapterCount, chapters > 0 {
      rows.append((Copy.text("web.metadata.chapters"), String(chapters)))
    }
    if let zone = value.timeZone { rows.append(("", zone)) }
    if let caption = value.caption { rows.append(("", caption)) }
    if let from = value.coverageStart, let to = value.coverageEnd {
      rows.append(
        (Copy.text("web.metadata.coverage"), "\(Format.dateLabel(from)) – \(Format.dateLabel(to))"))
    }
    publication = Publication(
      dateTitle: value.publishedAt, rows: rows)
    articleDate =
      value.publishedAt.flatMap(Format.localDay) ?? value.savedAt.flatMap(Format.localDay)
      ?? (time > 0 ? Format.date(time) : nil)
    searchText = ([title, summary, sourceName] + body).joined(separator: " ").lowercased()
    self.raw = raw
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    fingerprint = (try? encoder.encode(raw))?.hashValue ?? 0
  }

  static func == (a: CardModel, b: CardModel) -> Bool {
    a.id == b.id && a.fingerprint == b.fingerprint
  }
}

extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
