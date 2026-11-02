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
  /// 约 N 分钟阅读, calculated from the body for reading kinds; empty otherwise.
  let readingTime: String
  let tags: [String]
  /// Built-in asset IDs or HTTPS images; the first is the cover.
  let images: [String]
  let url: URL?
  let time: Double
  let addedTime: Double
  let priority: Double
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
  /// Original publication, send or capture date as written.
  let publishedAt: String?
  /// The local day of `publishedAt`.
  let publishedDay: Date?
  /// The day an article belongs to: published, else the card's own time.
  let articleDate: Date?
  /// Lowercased title, summary, source and body for search (Web `matches`, without state fields).
  let searchText: String
  /// The stored card, kept for writes that carry `before`.
  let raw: JSONValue
  /// Cheap identity of the stored content, so views compare cards without walking JSON.
  let fingerprint: Int

  /// A quick note is its own text: the card shows the summary in place of a title.
  var isCapture: Bool { kind == .note && sourceKind == "capture" && !isQuote }
  var cover: String? { images.first }
  var hasCover: Bool { (cover != nil && (kind == .article || kind == .media)) || kind == .photo }
  var publicationDate: String? { publishedAt.flatMap { Format.publication($0) } }
  var displayDate: String {
    if let publishedAt, let label = Format.publication(publishedAt, includeTime: kind == .mail) {
      return label
    }
    guard addedTime > 0 else { return "" }
    return Copy.text("web.card.added") + " · " + Format.dateLabel(addedTime)
  }
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

  init(card: Card, createdAt: Double? = nil) throws {
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
    let minutes = Self.readingMinutes(body.joined(separator: "\n"))
    readingTime =
      Self.readingKinds.contains(kind) && minutes > 0
      ? "\(Copy.text("web.metadata.readingFull")) \(minutes) \(Copy.text("web.metadata.readingSuffix"))"
      : ""
    tags = value.tags ?? []
    images = value.images ?? []
    url = value.url.flatMap(URL.init(string:))
    time = value.time ?? createdAt ?? 0
    addedTime = createdAt ?? value.time ?? 0
    priority = value.priority ?? 0
    isQuote = value.form == .quote
    project = value.project?.name
    tasks = (value.tasks ?? []).map { TaskItem(id: $0.id, text: $0.text, done: false) }
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
    publishedAt = value.publishedAt
    publishedDay = value.publishedAt.flatMap(Format.localDay)
    articleDate = publishedDay ?? (time > 0 ? Format.date(time) : nil)
    searchText = ([title, summary, sourceName] + body).joined(separator: " ").lowercased()
    self.raw = raw
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    fingerprint = (try? encoder.encode(raw))?.hashValue ?? 0
  }

  private static let readingKinds: Set<CardKind> = [
    .article, .digest,
  ]

  /// 400 Chinese characters or 200 words per minute, rounded up (ADR 0086, Web `readingMinutes`).
  static func readingMinutes(_ text: String) -> Int {
    let han = #"\p{Script=Han}"#
    let rest = text.replacingOccurrences(of: han, with: " ", options: .regularExpression)
    let hanCount =
      text.unicodeScalars.count
      - text.replacingOccurrences(of: han, with: "", options: .regularExpression).unicodeScalars
      .count
    var words = 0
    var range = rest.startIndex..<rest.endIndex
    while let found = rest.range(
      of: #"[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*"#, options: .regularExpression, range: range)
    {
      words += 1
      range = found.upperBound..<rest.endIndex
    }
    return Int(ceil(Double(hanCount) / 400 + Double(words) / 200))
  }

  static func == (a: CardModel, b: CardModel) -> Bool {
    a.id == b.id && a.fingerprint == b.fingerprint
  }
}

extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
